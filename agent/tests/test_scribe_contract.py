import unittest

from dungeon_agents.scribe.contract import ScribeAgentContent, parse_evidence
from dungeon_agents.shared.errors import ContractError


def evidence_payload() -> dict[str, object]:
    return {
        "floor": 2,
        "scene": "death-review",
        "scribeId": "npc-scribe-f2",
        "topic": "INNER JOIN",
        "authoredMessage": "先确认怪物与房间的关系，再核对返回字段。",
        "learning": {
            "lessonId": "inner-join",
            "stageId": "inner-join-room",
            "objective": "查询每个怪物所在房间的区域",
            "requiredColumns": ["id", "sector"],
            "submittedColumns": ["id", "name"],
            "missingColumns": ["sector"],
            "unexpectedColumns": ["name"],
            "brokenConcepts": [],
            "remainingConcepts": ["ON relation"],
            "resultCategory": "wrong-result",
            "hintLevel": 1,
            "safeHintId": "inner-join-room-hint-2",
        },
        "navigation": None,
        "death": {
            "cause": "combat",
            "battleAttempts": 3,
            "lastOutcome": "defeat",
        },
    }


class ScribeContractTests(unittest.TestCase):
    def test_request_validates_scene_evidence_and_hash(self) -> None:
        evidence = parse_evidence(evidence_payload())

        self.assertEqual(evidence.scene, "death-review")
        self.assertIsNotNone(evidence.learning)
        self.assertEqual(evidence.learning.missing_columns, ["sector"])
        self.assertEqual(evidence.death.cause if evidence.death else None, "combat")

    def test_navigation_requires_navigation_evidence(self) -> None:
        payload = evidence_payload()
        payload["scene"] = "navigation"
        payload["navigation"] = None

        with self.assertRaises(ContractError):
            parse_evidence(payload)

    def test_content_rejects_markup(self) -> None:
        output = {
            "headline": "抄写员复盘本轮",
            "facts": ["缺少字段：sector。"],
            "nextAction": "先核对 SELECT 字段。",
            "safeHintId": "inner-join-room-hint-2",
            "message": "<script>错误内容</script>",
        }

        with self.assertRaises(ValueError):
            ScribeAgentContent.model_validate(output)


if __name__ == "__main__":
    unittest.main()
