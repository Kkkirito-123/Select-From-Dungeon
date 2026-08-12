import copy
import json
import threading
import unittest
from urllib.request import Request, urlopen

from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from agent.director.contract import DirectorModelContent, parse_request
from agent.director.flow import DirectorFlow
from agent.http.routes import DIRECTOR_RUN_PATH
from agent.http.server import create_server
from agent.shared.errors import ContractError
from agent.shared.hash import evidence_hash
from agent.shared.model import ModelResult, TokenUsage
from agent.tests.test_campfire_contract import request_payload as campfire_payload
from agent.tests.test_scribe_contract import request_payload as scribe_payload


def compose_hash(
    floor: int,
    event: str,
    source: str,
    changed_hash: str,
    campfire_hash: str | None = None,
    scribe_hash: str | None = None,
) -> str:
    return evidence_hash({
        "floor": floor,
        "event": event,
        "changedSource": source,
        "changedEvidenceHash": changed_hash,
        "campfireEvidenceHash": changed_hash if source == "campfire" else campfire_hash,
        "scribeEvidenceHash": changed_hash if source == "scribe" else scribe_hash,
    })


def campfire_director_payload() -> dict[str, object]:
    child = campfire_payload()
    evidence = {key: child[key] for key in ("floor", "aggregate", "attempts")}
    return {
        "protocolVersion": 1,
        "requestId": "director-campfire-1",
        "composeHash": compose_hash(1, "campfire-review", "campfire", child["evidenceHash"]),
        "floor": 1,
        "event": "campfire-review",
        "changedSource": "campfire",
        "changed": {"source": "campfire", "evidenceHash": child["evidenceHash"], "evidence": evidence},
        "context": {"campfire": None, "scribe": None},
    }


def scribe_director_payload() -> dict[str, object]:
    child = scribe_payload()
    evidence = {
        key: child[key]
        for key in ("floor", "scene", "scribeId", "topic", "authoredMessage", "learning", "navigation", "death")
    }
    return {
        "protocolVersion": 1,
        "requestId": "director-scribe-1",
        "composeHash": compose_hash(2, "death-review", "scribe", child["evidenceHash"]),
        "floor": 2,
        "event": "death-review",
        "changedSource": "scribe",
        "changed": {"source": "scribe", "evidenceHash": child["evidenceHash"], "evidence": evidence},
        "context": {"campfire": None, "scribe": None},
    }


class MainModel:
    def __init__(self, fail: bool = False) -> None:
        self.prompts: list[str] = []
        self.fail = fail

    def run(self, prompt: str) -> ModelResult[DirectorModelContent]:
        self.prompts.append(prompt)
        if self.fail:
            raise RuntimeError("model failed")
        return ModelResult(
            DirectorModelContent(guidance="先根据当前记录完成下一步，再继续探索。"),
            2,
            TokenUsage(11, 5, 16),
        )


class DirectorContractTests(unittest.TestCase):
    def test_request_accepts_changed_child_and_exact_compose_hash(self) -> None:
        request = parse_request(campfire_director_payload())

        self.assertEqual(request.changed_source, "campfire")
        self.assertIsNone(request.context.campfire)

    def test_request_rejects_extra_field_bad_hash_cross_floor_and_event_mismatch(self) -> None:
        cases = []
        extra = campfire_director_payload()
        extra["snapshot"] = {}
        cases.append(extra)

        bad_hash = campfire_director_payload()
        bad_hash["composeHash"] = "0" * 64
        cases.append(bad_hash)

        cross_floor = scribe_director_payload()
        cross_floor["floor"] = 3
        cases.append(cross_floor)

        mismatch = scribe_director_payload()
        mismatch["event"] = "navigation"
        mismatch["composeHash"] = compose_hash(
            2,
            "navigation",
            "scribe",
            mismatch["changed"]["evidenceHash"],
        )
        cases.append(mismatch)

        for payload in cases:
            with self.subTest(payload=payload.get("event")):
                with self.assertRaises(ContractError):
                    parse_request(payload)

    def test_request_rejects_changed_role_in_context(self) -> None:
        payload = campfire_director_payload()
        payload["context"]["campfire"] = {
            "floor": 1,
            "evidenceHash": payload["changed"]["evidenceHash"],
            "content": {
                "headline": "旧记录",
                "facts": [],
                "focusConcept": None,
                "nextAction": "继续",
                "message": "继续。",
            },
        }
        with self.assertRaises(ContractError):
            parse_request(payload)


class DirectorFlowTests(unittest.TestCase):
    def test_only_display_content_reaches_main_and_usage_is_reported(self) -> None:
        main = MainModel()
        result = DirectorFlow(director=main).run(campfire_director_payload())

        self.assertEqual(result["schemaVersion"], 2)
        self.assertEqual(result["child"]["source"], "campfire")
        self.assertEqual(result["director"]["status"], "ready")
        self.assertEqual(result["director"]["guidance"], "先根据当前记录完成下一步，再继续探索。")
        self.assertEqual(result["meta"]["calls"][1]["tokens"]["total"], 16)
        encoded = "".join(main.prompts)
        self.assertNotIn("submittedSql", encoded)
        self.assertNotIn("SELECT name", encoded)

    def test_main_failure_uses_deterministic_fallback(self) -> None:
        result = DirectorFlow(director=MainModel(fail=True)).run(scribe_director_payload())

        self.assertEqual(result["director"]["status"], "fallback")
        self.assertEqual(result["director"]["guidance"], result["child"]["content"]["nextAction"])
        self.assertEqual(result["meta"]["calls"][1]["tokens"]["total"], 0)

    def test_trace_has_request_child_and_director_parenting_without_content(self) -> None:
        provider = TracerProvider()
        exporter = InMemorySpanExporter()
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        try:
            result = DirectorFlow(director=MainModel(), provider=provider).run(scribe_director_payload())
            spans = exporter.get_finished_spans()
        finally:
            provider.shutdown()

        by_name = {span.name: span for span in spans}
        root = by_name["agent.request"]
        self.assertEqual(by_name["agent.child"].parent.span_id, root.context.span_id)
        self.assertEqual(by_name["agent.director"].parent.span_id, root.context.span_id)
        self.assertEqual(by_name["agent.child"].attributes["agent.tokens.total"], 0)
        self.assertEqual(by_name["agent.director"].attributes["agent.tokens.total"], 16)
        self.assertEqual(result["meta"]["traceId"], f"{root.context.trace_id:032x}")
        attributes = json.dumps([dict(span.attributes) for span in spans], ensure_ascii=False)
        self.assertNotIn("SELECT name", attributes)
        self.assertNotIn("先确认怪物", attributes)


class DirectorHttpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = create_server(port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.url = f"http://{host}:{port}{DIRECTOR_RUN_PATH}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_director_endpoint_returns_schema_v2_meta(self) -> None:
        request = Request(
            self.url,
            data=json.dumps(campfire_director_payload(), ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=2) as response:
            result = json.loads(response.read())

        self.assertEqual(response.status, 200)
        self.assertEqual(result["schemaVersion"], 2)
        self.assertEqual(len(result["meta"]["calls"]), 2)
        self.assertEqual(result["child"]["source"], "campfire")


if __name__ == "__main__":
    unittest.main()
