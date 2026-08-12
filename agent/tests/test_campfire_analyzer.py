import unittest

from agent.campfire.flow import ReviewFlow
from agent.tests.test_campfire_contract import request_payload


class CampfireAnalyzerTests(unittest.TestCase):
    def test_deterministic_review_contains_current_floor_statistics(self) -> None:
        payload = request_payload()
        result = ReviewFlow().run(payload)

        self.assertEqual(result["requestId"], "request-1")
        self.assertEqual(result["evidenceHash"], payload["evidenceHash"])
        self.assertEqual(result["headline"], "本层 SQL 复盘 · 1/2 次正确")
        self.assertLessEqual(len(result["facts"]), 3)
        self.assertIn("正确率", result["message"])


if __name__ == "__main__":
    unittest.main()
