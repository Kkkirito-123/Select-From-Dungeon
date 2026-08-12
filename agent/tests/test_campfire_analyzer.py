import unittest

from dungeon_agents.campfire.contract import parse_evidence
from dungeon_agents.campfire.flow import CampfireFlow
from test_campfire_contract import evidence_payload


class CampfireAnalyzerTests(unittest.TestCase):
    def test_deterministic_review_contains_current_floor_statistics(self) -> None:
        content, call = CampfireFlow().execute(parse_evidence(evidence_payload()))

        self.assertEqual(content.headline, "本层 SQL 复盘 · 1/2 次正确")
        self.assertLessEqual(len(content.facts), 3)
        self.assertIn("正确率", content.message)
        self.assertEqual(call.mode, "local")


if __name__ == "__main__":
    unittest.main()
