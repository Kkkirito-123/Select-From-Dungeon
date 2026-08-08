"""篝火请求和输出的纯校验函数。"""

from __future__ import annotations

import re
from typing import Any, Mapping

from agent.contracts.hash import evidence_hash
from agent.contracts.models import (
    CampfireAggregate,
    CampfireAttempt,
    CampfireReviewOutput,
    CampfireReviewRequest,
    ContractError,
    ERROR_VALUES,
    MAX_ATTEMPTS,
    MAX_FACT_CHARS,
    MAX_FOCUS_CHARS,
    MAX_HEADLINE_CHARS,
    MAX_ID_CHARS,
    MAX_MESSAGE_CHARS,
    MAX_NEXT_ACTION_CHARS,
    MAX_SQL_CHARS,
    MAX_STAGE_OBJECTIVE_CHARS,
    OUTCOME_VALUES,
    PROTOCOL_VERSION,
    RESULT_VALUES,
)


_HEX_HASH = re.compile(r"^[0-9a-f]{64}$")
_HTML_OR_TOOL_MARKER = re.compile(
    r"<[^>]*>|javascript:|tool_call|function_call|<script",
    re.IGNORECASE,
)


def _require_object(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ContractError(f"{name} must be an object")
    return value


def _require_exact_keys(value: Mapping[str, Any], expected: set[str], name: str) -> None:
    actual = set(value)
    missing = expected - actual
    extra = actual - expected
    if missing or extra:
        details = []
        if missing:
            details.append(f"missing={sorted(missing)}")
        if extra:
            details.append(f"extra={sorted(extra)}")
        raise ContractError(f"{name} keys invalid: {', '.join(details)}")


def _require_int(value: Any, name: str, minimum: int = 0, maximum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ContractError(f"{name} must be an integer")
    if value < minimum or (maximum is not None and value > maximum):
        raise ContractError(f"{name} is out of range")
    return value


def _require_text(value: Any, name: str, maximum: int, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise ContractError(f"{name} must be a string")
    if not allow_empty and not value.strip():
        raise ContractError(f"{name} must not be empty")
    if len(value) > maximum:
        raise ContractError(f"{name} is too long")
    return value


def _plain_text(value: Any, name: str, maximum: int) -> str:
    text = _require_text(value, name, maximum)
    if "\x00" in text or _HTML_OR_TOOL_MARKER.search(text):
        raise ContractError(f"{name} contains forbidden markup or tool syntax")
    return text


def parse_request(payload: Any) -> CampfireReviewRequest:
    """验证并转换 JSON 请求，任何额外字段都会被拒绝。"""

    root = _require_object(payload, "request")
    _require_exact_keys(
        root,
        {"protocolVersion", "requestId", "evidenceHash", "floor", "aggregate", "attempts"},
        "request",
    )
    if root["protocolVersion"] != PROTOCOL_VERSION:
        raise ContractError("unsupported protocolVersion")
    request_id = _require_text(root["requestId"], "requestId", MAX_ID_CHARS)
    supplied_hash = _require_text(root["evidenceHash"], "evidenceHash", 64)
    if not _HEX_HASH.fullmatch(supplied_hash):
        raise ContractError("evidenceHash must be a lowercase SHA-256 hex string")
    floor = _require_int(root["floor"], "floor", 1, 8)

    aggregate_value = _require_object(root["aggregate"], "aggregate")
    _require_exact_keys(
        aggregate_value,
        {"totalAttempts", "correctCount", "accuracy", "errorCounts", "hintedAttempts", "highestHintLevel"},
        "aggregate",
    )
    total_attempts = _require_int(aggregate_value["totalAttempts"], "totalAttempts")
    correct_count = _require_int(aggregate_value["correctCount"], "correctCount")
    if correct_count > total_attempts:
        raise ContractError("correctCount cannot exceed totalAttempts")
    accuracy_value = aggregate_value["accuracy"]
    if (
        isinstance(accuracy_value, bool)
        or not isinstance(accuracy_value, (int, float))
        or not 0 <= accuracy_value <= 100
        or not float(accuracy_value).is_integer()
    ):
        raise ContractError("accuracy is out of range")
    accuracy = int(accuracy_value)
    error_value = _require_object(aggregate_value["errorCounts"], "errorCounts")
    if set(error_value) != ERROR_VALUES:
        raise ContractError("errorCounts must contain exactly the known result categories")
    error_counts = {
        key: _require_int(error_value[key], f"errorCounts.{key}")
        for key in sorted(ERROR_VALUES)
    }
    hinted_attempts = _require_int(aggregate_value["hintedAttempts"], "hintedAttempts")
    if hinted_attempts > total_attempts:
        raise ContractError("hintedAttempts cannot exceed totalAttempts")
    highest_hint_level = _require_int(aggregate_value["highestHintLevel"], "highestHintLevel", 0, 4)
    aggregate = CampfireAggregate(
        total_attempts=total_attempts,
        correct_count=correct_count,
        accuracy=accuracy,
        error_counts=error_counts,
        hinted_attempts=hinted_attempts,
        highest_hint_level=highest_hint_level,
    )

    attempts_value = root["attempts"]
    if not isinstance(attempts_value, list) or len(attempts_value) > MAX_ATTEMPTS:
        raise ContractError("attempts must contain at most eight records")
    attempts: list[CampfireAttempt] = []
    for index, raw_attempt in enumerate(attempts_value):
        attempt_value = _require_object(raw_attempt, f"attempts[{index}]")
        _require_exact_keys(
            attempt_value,
            {"attemptId", "lessonId", "stageId", "stageObjective", "submittedSql", "result", "outcome", "hintLevel"},
            f"attempts[{index}]",
        )
        result = _require_text(attempt_value["result"], f"attempts[{index}].result", 32)
        outcome = _require_text(attempt_value["outcome"], f"attempts[{index}].outcome", 32)
        if result not in RESULT_VALUES or outcome not in OUTCOME_VALUES:
            raise ContractError(f"attempts[{index}] has an unknown result or outcome")
        attempts.append(CampfireAttempt(
            attempt_id=_require_int(attempt_value["attemptId"], f"attempts[{index}].attemptId"),
            lesson_id=_require_text(attempt_value["lessonId"], f"attempts[{index}].lessonId", 80),
            stage_id=_require_text(attempt_value["stageId"], f"attempts[{index}].stageId", 80),
            stage_objective=_require_text(
                attempt_value["stageObjective"],
                f"attempts[{index}].stageObjective",
                MAX_STAGE_OBJECTIVE_CHARS,
            ),
            submitted_sql=_require_text(
                attempt_value["submittedSql"],
                f"attempts[{index}].submittedSql",
                MAX_SQL_CHARS,
                allow_empty=True,
            ),
            result=result,
            outcome=outcome,
            hint_level=_require_int(attempt_value["hintLevel"], f"attempts[{index}].hintLevel", 0, 4),
        ))

    request = CampfireReviewRequest(
        request_id=request_id,
        evidence_hash=supplied_hash,
        floor=floor,
        aggregate=aggregate,
        attempts=tuple(attempts),
    )
    if supplied_hash != evidence_hash(request.evidence_payload()):
        raise ContractError("evidenceHash does not match the request evidence")
    return request


def parse_output(payload: Any, request: CampfireReviewRequest) -> CampfireReviewOutput:
    """校验模型或确定性生成器的输出，并绑定请求身份。"""

    root = _require_object(payload, "output")
    _require_exact_keys(
        root,
        {"schemaVersion", "requestId", "evidenceHash", "headline", "facts", "focusConcept", "nextAction", "message"},
        "output",
    )
    if root["schemaVersion"] != PROTOCOL_VERSION:
        raise ContractError("unsupported output schemaVersion")
    if root["requestId"] != request.request_id or root["evidenceHash"] != request.evidence_hash:
        raise ContractError("output does not match the request")
    headline = _plain_text(root["headline"], "headline", MAX_HEADLINE_CHARS)
    facts_value = root["facts"]
    if not isinstance(facts_value, list) or len(facts_value) > 3:
        raise ContractError("facts must contain at most three items")
    facts = tuple(
        _plain_text(fact, f"facts[{index}]", MAX_FACT_CHARS)
        for index, fact in enumerate(facts_value)
    )
    focus_value = root["focusConcept"]
    focus = None if focus_value is None else _plain_text(focus_value, "focusConcept", MAX_FOCUS_CHARS)
    return CampfireReviewOutput(
        schema_version=PROTOCOL_VERSION,
        request_id=request.request_id,
        evidence_hash=request.evidence_hash,
        headline=headline,
        facts=facts,
        focus_concept=focus,
        next_action=_plain_text(root["nextAction"], "nextAction", MAX_NEXT_ACTION_CHARS),
        message=_plain_text(root["message"], "message", MAX_MESSAGE_CHARS),
    )
