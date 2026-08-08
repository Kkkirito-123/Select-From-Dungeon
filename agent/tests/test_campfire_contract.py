import unittest

from agent.contracts.campfire import (
    ContractError,
    evidence_hash,
    parse_output,
    parse_request,
)


def request_payload(attempt_count: int = 2) -> dict[str, object]:
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
    evidence = {
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
    return {
        "protocolVersion": 1,
        "requestId": "request-1",
        "evidenceHash": evidence_hash(evidence),
        **evidence,
    }


class CampfireContractTests(unittest.TestCase):
    def test_request_accepts_minimal_projection_and_excludes_reference_sql(self) -> None:
        request = parse_request(request_payload())

        self.assertEqual(request.floor, 1)
        self.assertEqual(len(request.attempts), 2)
        self.assertNotIn("answerSql", request.attempts[0].to_dict())

    def test_request_rejects_extra_fields(self) -> None:
        payload = request_payload()
        payload["answerSql"] = "SELECT * FROM monsters"

        with self.assertRaises(ContractError):
            parse_request(payload)

    def test_request_rejects_more_than_eight_attempts(self) -> None:
        payload = request_payload(9)
        payload["evidenceHash"] = evidence_hash({
            "floor": payload["floor"],
            "aggregate": payload["aggregate"],
            "attempts": payload["attempts"],
        })

        with self.assertRaises(ContractError):
            parse_request(payload)

    def test_output_rejects_hash_mismatch_and_markup(self) -> None:
        request = parse_request(request_payload())
        valid = {
            "schemaVersion": 1,
            "requestId": request.request_id,
            "evidenceHash": request.evidence_hash,
            "headline": "本层复盘",
            "facts": ["正确率正常"],
            "focusConcept": None,
            "nextAction": "继续练习",
            "message": "保持节奏",
        }
        parse_output(valid, request)

        invalid = {**valid, "message": "<script>alert(1)</script>"}
        with self.assertRaises(ContractError):
            parse_output(invalid, request)


if __name__ == "__main__":
    unittest.main()
