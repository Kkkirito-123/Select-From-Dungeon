import unittest

from dungeon_agents.campfire.contract import CampfireAgentContent, parse_evidence
from dungeon_agents.shared.errors import ContractError


def evidence_payload(attempt_count: int = 2) -> dict[str, object]:
    attempts = [
        {
            "attemptId": index + 1,
            "lessonId": "select",
            "stageId": "select-name",
            "stageObjective": "读取怪物名称",
            "submittedSql": "SELECT name FROM monsters",
            "result": "correct" if index == 0 else "wrong-result",
            "outcome": "hit" if index == 0 else "countered",
            "hintLevel": 0 if index == 0 else 1,
        }
        for index in range(attempt_count)
    ]
    return {
        "floor": 1,
        "aggregate": {
            "totalAttempts": attempt_count,
            "correctCount": 1 if attempt_count else 0,
            "accuracy": 50 if attempt_count == 2 else 0,
            "errorCounts": {
                "missing-concept": 0,
                "wrong-result": max(0, attempt_count - 1),
                "syntax-error": 0,
            },
            "hintedAttempts": max(0, attempt_count - 1),
            "highestHintLevel": 1 if attempt_count > 1 else 0,
        },
        "attempts": attempts,
    }


class CampfireContractTests(unittest.TestCase):
    def test_request_accepts_minimal_projection_and_excludes_reference_sql(self) -> None:
        evidence = parse_evidence(evidence_payload())

        self.assertEqual(evidence.floor, 1)
        self.assertEqual(len(evidence.attempts), 2)
        self.assertNotIn("answerSql", evidence.attempts[0].model_dump(by_alias=True))

    def test_request_rejects_extra_fields(self) -> None:
        payload = evidence_payload()
        payload["answerSql"] = "SELECT * FROM monsters"

        with self.assertRaises(ContractError):
            parse_evidence(payload)

    def test_request_rejects_more_than_eight_attempts(self) -> None:
        payload = evidence_payload(9)

        with self.assertRaises(ContractError):
            parse_evidence(payload)

    def test_content_rejects_markup(self) -> None:
        valid = {
            "headline": "本层复盘",
            "facts": ["正确率正常"],
            "focusConcept": None,
            "nextAction": "继续练习",
            "message": "保持节奏",
        }
        CampfireAgentContent.model_validate(valid)

        invalid = {**valid, "message": "<script>alert(1)</script>"}
        with self.assertRaises(ValueError):
            CampfireAgentContent.model_validate(invalid)


if __name__ == "__main__":
    unittest.main()
