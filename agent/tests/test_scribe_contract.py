import unittest

from agent.shared.hash import evidence_hash
from agent.scribe.contract import ContractError, parse_output, parse_request


def request_payload() -> dict[str, object]:
    evidence = {
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
    return {
        "protocolVersion": 1,
        "requestId": "scribe-request-1",
        "evidenceHash": evidence_hash(evidence),
        **evidence,
    }


class ScribeContractTests(unittest.TestCase):
    def test_request_validates_scene_evidence_and_hash(self) -> None:
        request = parse_request(request_payload())

        self.assertEqual(request.scene, "death-review")
        self.assertIsNotNone(request.learning)
        self.assertEqual(request.learning.missing_columns, ["sector"])
        self.assertEqual(request.death.cause if request.death else None, "combat")

    def test_navigation_requires_navigation_evidence(self) -> None:
        payload = request_payload()
        payload["scene"] = "navigation"
        payload["navigation"] = None

        with self.assertRaises(ContractError):
            parse_request(payload)

    def test_output_cannot_change_safe_hint(self) -> None:
        request = parse_request(request_payload())
        output = {
            "schemaVersion": 1,
            "requestId": request.request_id,
            "evidenceHash": request.evidence_hash,
            "headline": "抄写员复盘本轮",
            "facts": ["缺少字段：sector。"],
            "nextAction": "先核对 SELECT 字段。",
            "safeHintId": "complete-answer",
            "message": "先检查字段列表。",
        }

        with self.assertRaises(ContractError):
            parse_output(output, request)


if __name__ == "__main__":
    unittest.main()
