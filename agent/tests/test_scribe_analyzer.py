import unittest

from agent.scribe.contract import ScribeModelContent, parse_request
from agent.scribe.flow import ScribeFlow
from agent.shared.model import ModelResult, TokenUsage
from agent.tests.test_scribe_contract import request_payload


class ScribeAnalyzerTests(unittest.TestCase):
    def test_death_review_names_missing_and_unexpected_fields(self) -> None:
        result = ScribeFlow().run(request_payload())

        self.assertEqual(result["requestId"], "scribe-request-1")
        self.assertEqual(result["safeHintId"], "inner-join-room-hint-2")
        self.assertIn("sector", " ".join(result["facts"]))
        self.assertIn("字段", result["nextAction"])
        self.assertNotIn("answerSql", result)

    def test_navigation_uses_structured_direction(self) -> None:
        payload = request_payload()
        payload["scene"] = "navigation"
        payload["learning"] = None
        payload["death"] = None
        payload["navigation"] = {
            "targetId": "key:floor-2:rear",
            "targetLabel": "后段捷径钥匙",
            "direction": "east",
            "distance": 12,
            "guidanceLevel": 1,
        }
        from agent.shared.hash import evidence_hash

        evidence = {key: value for key, value in payload.items() if key not in {"protocolVersion", "requestId", "evidenceHash"}}
        payload["evidenceHash"] = evidence_hash(evidence)

        result = ScribeFlow().run(payload)

        self.assertIn("东方", " ".join(result["facts"]))
        self.assertIn("东方", result["nextAction"])

    def test_navigation_does_not_call_scribe_model(self) -> None:
        class SpyModel:
            calls = 0

            def run(self, _prompt: str) -> ModelResult[ScribeModelContent]:
                self.calls += 1
                return ModelResult(
                    ScribeModelContent(headline="不应调用", message="不应调用"),
                    1,
                    TokenUsage(1, 1, 2),
                )

        payload = request_payload()
        payload.update({
            "scene": "navigation",
            "learning": None,
            "death": None,
            "navigation": {
                "targetId": "key:floor-2:rear",
                "targetLabel": "后段捷径钥匙",
                "direction": "east",
                "distance": 12,
                "guidanceLevel": 1,
            },
        })
        from agent.shared.hash import evidence_hash

        evidence = {key: value for key, value in payload.items() if key not in {"protocolVersion", "requestId", "evidenceHash"}}
        payload["evidenceHash"] = evidence_hash(evidence)
        model = SpyModel()

        _output, call = ScribeFlow(model=model).execute(parse_request(payload))

        self.assertEqual(model.calls, 0)
        self.assertEqual(call.mode, "local")
        self.assertEqual(call.tokens.total, 0)


if __name__ == "__main__":
    unittest.main()
