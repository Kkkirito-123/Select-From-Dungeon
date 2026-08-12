import unittest

from dungeon_agents.scribe.contract import ScribeModelContent, parse_evidence
from dungeon_agents.scribe.flow import ScribeFlow
from dungeon_agents.shared.model import ModelResult, TokenUsage
from test_scribe_contract import evidence_payload


class ScribeAnalyzerTests(unittest.TestCase):
    def test_death_review_names_missing_and_unexpected_fields(self) -> None:
        content, _call = ScribeFlow().execute(parse_evidence(evidence_payload()))

        self.assertEqual(content.safe_hint_id, "inner-join-room-hint-2")
        self.assertIn("sector", " ".join(content.facts))
        self.assertIn("字段", content.next_action)
        self.assertNotIn("answerSql", content.model_dump(by_alias=True))

    def test_navigation_uses_structured_direction(self) -> None:
        payload = evidence_payload()
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
        content, _call = ScribeFlow().execute(parse_evidence(payload))

        self.assertIn("东方", " ".join(content.facts))
        self.assertIn("东方", content.next_action)

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

        payload = evidence_payload()
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
        model = SpyModel()

        _output, call = ScribeFlow(model=model).execute(parse_evidence(payload))

        self.assertEqual(model.calls, 0)
        self.assertEqual(call.mode, "local")
        self.assertEqual(call.tokens.total, 0)


if __name__ == "__main__":
    unittest.main()
