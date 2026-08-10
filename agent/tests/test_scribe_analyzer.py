import unittest

from agent.scribe import ScribeService
from agent.tests.test_scribe_contract import request_payload


class ScribeAnalyzerTests(unittest.TestCase):
    def test_death_review_names_missing_and_unexpected_fields(self) -> None:
        result = ScribeService().respond(request_payload())

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
        from agent.contracts.hash import evidence_hash

        evidence = {key: value for key, value in payload.items() if key not in {"protocolVersion", "requestId", "evidenceHash"}}
        payload["evidenceHash"] = evidence_hash(evidence)

        result = ScribeService().respond(payload)

        self.assertIn("东方", " ".join(result["facts"]))
        self.assertIn("东方", result["nextAction"])


if __name__ == "__main__":
    unittest.main()
