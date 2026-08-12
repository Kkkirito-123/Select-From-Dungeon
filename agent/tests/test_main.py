import copy
import json
import threading
import unittest
from urllib.request import Request, urlopen

from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from dungeon_agents.http.server import AGENT_RUN_PATH, create_server
from dungeon_agents.main.contract import MainModelContent, parse_request
from dungeon_agents.main.flow import MainFlow
from dungeon_agents.shared.errors import ContractError
from dungeon_agents.shared.hash import evidence_hash
from dungeon_agents.shared.model import ModelResult, TokenUsage
from test_campfire_contract import evidence_payload as campfire_payload
from test_scribe_contract import evidence_payload as scribe_payload


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


def campfire_agent_payload() -> dict[str, object]:
    child = campfire_payload()
    child_hash = evidence_hash(child)
    return {
        "protocolVersion": 1,
        "requestId": "agent-campfire-1",
        "composeHash": compose_hash(1, "campfire-review", "campfire", child_hash),
        "floor": 1,
        "event": "campfire-review",
        "changedSource": "campfire",
        "changed": {"source": "campfire", "evidenceHash": child_hash, "evidence": child},
        "context": {"campfire": None, "scribe": None},
    }


def scribe_agent_payload() -> dict[str, object]:
    child = scribe_payload()
    child_hash = evidence_hash(child)
    return {
        "protocolVersion": 1,
        "requestId": "agent-scribe-1",
        "composeHash": compose_hash(2, "death-review", "scribe", child_hash),
        "floor": 2,
        "event": "death-review",
        "changedSource": "scribe",
        "changed": {"source": "scribe", "evidenceHash": child_hash, "evidence": child},
        "context": {"campfire": None, "scribe": None},
    }


class MainModel:
    def __init__(self, fail: bool = False) -> None:
        self.prompts: list[str] = []
        self.fail = fail

    def run(self, prompt: str) -> ModelResult[MainModelContent]:
        self.prompts.append(prompt)
        if self.fail:
            raise RuntimeError("model failed")
        return ModelResult(
            MainModelContent(guidance="先根据当前记录完成下一步，再继续探索。"),
            2,
            TokenUsage(11, 5, 16),
        )


class MainContractTests(unittest.TestCase):
    def test_request_accepts_changed_child_and_exact_compose_hash(self) -> None:
        request = parse_request(campfire_agent_payload())

        self.assertEqual(request.changed_source, "campfire")
        self.assertIsNone(request.context.campfire)

    def test_request_rejects_extra_field_bad_hash_cross_floor_and_event_mismatch(self) -> None:
        cases = []
        extra = campfire_agent_payload()
        extra["snapshot"] = {}
        cases.append(extra)

        bad_hash = campfire_agent_payload()
        bad_hash["composeHash"] = "0" * 64
        cases.append(bad_hash)

        cross_floor = scribe_agent_payload()
        cross_floor["floor"] = 3
        cases.append(cross_floor)

        mismatch = scribe_agent_payload()
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
        payload = campfire_agent_payload()
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


class MainFlowTests(unittest.TestCase):
    def test_only_display_content_reaches_main_and_usage_is_reported(self) -> None:
        main = MainModel()
        result = MainFlow(main=main).run(campfire_agent_payload())

        self.assertEqual(result["schemaVersion"], 1)
        self.assertEqual(result["child"]["source"], "campfire")
        self.assertEqual(result["main"]["status"], "ready")
        self.assertEqual(result["main"]["guidance"], "先根据当前记录完成下一步，再继续探索。")
        self.assertNotIn("situation", result["main"])
        self.assertNotIn("director", result)
        self.assertEqual(result["meta"]["calls"][1]["agent"], "main")
        self.assertEqual(result["meta"]["calls"][1]["tokens"]["total"], 16)
        encoded = "".join(main.prompts)
        self.assertNotIn("submittedSql", encoded)
        self.assertNotIn("SELECT name", encoded)

    def test_main_failure_uses_deterministic_fallback(self) -> None:
        result = MainFlow(main=MainModel(fail=True)).run(scribe_agent_payload())

        self.assertEqual(result["main"]["status"], "fallback")
        self.assertEqual(result["main"]["guidance"], result["child"]["content"]["nextAction"])
        self.assertEqual(result["meta"]["calls"][1]["tokens"]["total"], 0)

    def test_trace_has_request_child_and_main_parenting_without_content(self) -> None:
        provider = TracerProvider()
        exporter = InMemorySpanExporter()
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        try:
            result = MainFlow(main=MainModel(), provider=provider).run(scribe_agent_payload())
            spans = exporter.get_finished_spans()
        finally:
            provider.shutdown()

        by_name = {span.name: span for span in spans}
        root = by_name["agent.request"]
        self.assertEqual(by_name["agent.child"].parent.span_id, root.context.span_id)
        self.assertEqual(by_name["agent.main"].parent.span_id, root.context.span_id)
        self.assertEqual(by_name["agent.child"].attributes["agent.tokens.total"], 0)
        self.assertEqual(by_name["agent.main"].attributes["agent.tokens.total"], 16)
        self.assertEqual(result["meta"]["traceId"], f"{root.context.trace_id:032x}")
        attributes = json.dumps([dict(span.attributes) for span in spans], ensure_ascii=False)
        self.assertNotIn("SELECT name", attributes)
        self.assertNotIn("先确认怪物", attributes)


class AgentHttpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = create_server(port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.url = f"http://{host}:{port}{AGENT_RUN_PATH}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_single_endpoint_returns_schema_v1_meta(self) -> None:
        request = Request(
            self.url,
            data=json.dumps(campfire_agent_payload(), ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=2) as response:
            result = json.loads(response.read())

        self.assertEqual(response.status, 200)
        self.assertEqual(result["schemaVersion"], 1)
        self.assertEqual(len(result["meta"]["calls"]), 2)
        self.assertEqual(result["child"]["source"], "campfire")


if __name__ == "__main__":
    unittest.main()
