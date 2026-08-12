"""篝火复盘的严格请求、输出和模型文本契约。"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, ValidationError, model_validator

from agent.shared.contract import Hash, Id, StrictModel, plain_text
from agent.shared.errors import ContractError
from agent.shared.hash import canonical_json, evidence_hash


Result = Literal["correct", "missing-concept", "wrong-result", "syntax-error"]
Outcome = Literal["hit", "countered", "victory", "defeat"]
ShortId = plain_text(80)
Headline = plain_text(80)
Fact = plain_text(120)
Focus = plain_text(80)
Action = plain_text(180)
Message = plain_text(240)


class ErrorCounts(StrictModel):
    missing_concept: Annotated[int, Field(ge=0)] = Field(alias="missing-concept")
    wrong_result: Annotated[int, Field(ge=0)] = Field(alias="wrong-result")
    syntax_error: Annotated[int, Field(ge=0)] = Field(alias="syntax-error")


class CampfireAggregate(StrictModel):
    total_attempts: Annotated[int, Field(ge=0)]
    correct_count: Annotated[int, Field(ge=0)]
    accuracy: Annotated[int, Field(ge=0, le=100)]
    error_counts: ErrorCounts
    hinted_attempts: Annotated[int, Field(ge=0)]
    highest_hint_level: Annotated[int, Field(ge=0, le=4)]

    @model_validator(mode="after")
    def check_counts(self) -> "CampfireAggregate":
        if self.correct_count > self.total_attempts or self.hinted_attempts > self.total_attempts:
            raise ValueError("aggregate counts exceed totalAttempts")
        return self


class CampfireAttempt(StrictModel):
    attempt_id: Annotated[int, Field(ge=0)]
    lesson_id: ShortId
    stage_id: ShortId
    stage_objective: plain_text(160)
    submitted_sql: Annotated[str, Field(max_length=800)]
    result: Result
    outcome: Outcome
    hint_level: Annotated[int, Field(ge=0, le=4)]


class CampfireEvidence(StrictModel):
    floor: Annotated[int, Field(ge=1, le=8)]
    aggregate: CampfireAggregate
    attempts: Annotated[list[CampfireAttempt], Field(max_length=8)]


class CampfireReviewRequest(CampfireEvidence):
    protocol_version: Literal[1]
    request_id: Id
    evidence_hash: Hash

    def evidence_payload(self) -> dict[str, object]:
        return CampfireEvidence(
            floor=self.floor,
            aggregate=self.aggregate,
            attempts=self.attempts,
        ).model_dump(by_alias=True, mode="json")

    @model_validator(mode="after")
    def check_hash(self) -> "CampfireReviewRequest":
        if evidence_hash(self.evidence_payload()) != self.evidence_hash:
            raise ValueError("evidenceHash does not match request evidence")
        return self


class CampfireAgentContent(StrictModel):
    headline: Headline
    facts: Annotated[list[Fact], Field(max_length=3)]
    focus_concept: Focus | None
    next_action: Action
    message: Message


class CampfireReviewOutput(CampfireAgentContent):
    schema_version: Literal[1]
    request_id: Id
    evidence_hash: Hash

    def to_dict(self) -> dict[str, object]:
        return self.model_dump(by_alias=True, mode="json")


def _validate(model: type[StrictModel], payload: object) -> StrictModel:
    try:
        return model.model_validate(payload)
    except ValidationError as error:
        raise ContractError("campfire contract is invalid") from error


def parse_request(payload: object) -> CampfireReviewRequest:
    return _validate(CampfireReviewRequest, payload)  # type: ignore[return-value]


def parse_output(payload: object, request: CampfireReviewRequest) -> CampfireReviewOutput:
    output = _validate(CampfireReviewOutput, payload)
    assert isinstance(output, CampfireReviewOutput)
    if output.request_id != request.request_id or output.evidence_hash != request.evidence_hash:
        raise ContractError("campfire output does not match request")
    return output


__all__ = [
    "CampfireAgentContent",
    "CampfireAggregate",
    "CampfireAttempt",
    "CampfireEvidence",
    "CampfireReviewOutput",
    "CampfireReviewRequest",
    "ContractError",
    "canonical_json",
    "evidence_hash",
    "parse_output",
    "parse_request",
]
