"""篝火角色的严格证据和输出契约。"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, ValidationError, model_validator

from dungeon_agents.shared.contract import Id, StrictModel, plain_text
from dungeon_agents.shared.errors import ContractError


Result = Literal["correct", "missing-concept", "wrong-result", "syntax-error"]
Outcome = Literal["hit", "countered", "victory", "defeat"]


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
    lesson_id: plain_text(80)
    stage_id: plain_text(80)
    stage_objective: plain_text(160)
    submitted_sql: Annotated[str, Field(max_length=800)]
    result: Result
    outcome: Outcome
    hint_level: Annotated[int, Field(ge=0, le=4)]


class CampfireEvidence(StrictModel):
    floor: Annotated[int, Field(ge=1, le=8)]
    aggregate: CampfireAggregate
    attempts: Annotated[list[CampfireAttempt], Field(max_length=8)]


class CampfireAgentContent(StrictModel):
    headline: plain_text(80)
    facts: Annotated[list[plain_text(120)], Field(max_length=3)]
    focus_concept: plain_text(80) | None
    next_action: plain_text(180)
    message: plain_text(240)


def parse_evidence(payload: object) -> CampfireEvidence:
    """供 Main 契约和角色单测复用，统一隐藏 Pydantic 错误细节。"""

    try:
        return CampfireEvidence.model_validate(payload)
    except ValidationError as error:
        raise ContractError("campfire evidence is invalid") from error


__all__ = [
    "CampfireAgentContent",
    "CampfireAggregate",
    "CampfireAttempt",
    "CampfireEvidence",
    "parse_evidence",
]
