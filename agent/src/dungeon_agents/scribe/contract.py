"""抄写员的严格场景证据、陪伴文本和确定性玩法字段。"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, ValidationError, model_validator

from dungeon_agents.shared.contract import Id, StrictModel, plain_text
from dungeon_agents.shared.errors import ContractError


Scene = Literal["interaction", "death-review", "navigation"]
Result = Literal["correct", "missing-concept", "wrong-result", "syntax-error"]
Outcome = Literal["hit", "countered", "victory", "defeat"]
Cause = Literal["combat", "hazard", "cipher", "unknown"]
Direction = Literal["north", "east", "south", "west"]


class ScribeLearningEvidence(StrictModel):
    lesson_id: Id
    stage_id: Id
    objective: plain_text(240)
    required_columns: Annotated[list[plain_text(64)], Field(max_length=16)]
    submitted_columns: Annotated[list[plain_text(64)], Field(max_length=16)]
    missing_columns: Annotated[list[plain_text(64)], Field(max_length=16)]
    unexpected_columns: Annotated[list[plain_text(64)], Field(max_length=16)]
    broken_concepts: Annotated[list[plain_text(80)], Field(max_length=12)]
    remaining_concepts: Annotated[list[plain_text(80)], Field(max_length=12)]
    result_category: Result
    hint_level: Annotated[int, Field(ge=0, le=4)]
    safe_hint_id: Id | None


class ScribeNavigationEvidence(StrictModel):
    target_id: Id
    target_label: plain_text(240)
    direction: Direction
    distance: Annotated[int, Field(ge=0, le=999)]
    guidance_level: Annotated[int, Field(ge=1, le=3)]


class ScribeDeathEvidence(StrictModel):
    cause: Cause
    battle_attempts: Annotated[int, Field(ge=0, le=200)]
    last_outcome: Outcome


class ScribeEvidence(StrictModel):
    floor: Annotated[int, Field(ge=1, le=8)]
    scene: Scene
    scribe_id: Id
    topic: plain_text(120)
    authored_message: plain_text(240)
    learning: ScribeLearningEvidence | None
    navigation: ScribeNavigationEvidence | None
    death: ScribeDeathEvidence | None

    @model_validator(mode="after")
    def check_scene(self) -> "ScribeEvidence":
        if self.scene == "interaction" and (self.navigation is not None or self.death is not None):
            raise ValueError("interaction cannot contain navigation or death")
        if self.scene == "navigation" and (
            self.navigation is None or self.learning is not None or self.death is not None
        ):
            raise ValueError("navigation evidence is invalid")
        if self.scene == "death-review" and (self.death is None or self.navigation is not None):
            raise ValueError("death-review evidence is invalid")
        return self


class ScribeModelContent(StrictModel):
    """抄写员模型唯一有权生成的字段。"""

    headline: plain_text(80)
    message: plain_text(240)


class ScribeAgentContent(ScribeModelContent):
    facts: Annotated[list[plain_text(120)], Field(max_length=3)]
    next_action: plain_text(180)
    safe_hint_id: Id | None


def parse_evidence(payload: object) -> ScribeEvidence:
    try:
        return ScribeEvidence.model_validate(payload)
    except ValidationError as error:
        raise ContractError("scribe evidence is invalid") from error


__all__ = [
    "ScribeAgentContent",
    "ScribeDeathEvidence",
    "ScribeEvidence",
    "ScribeLearningEvidence",
    "ScribeModelContent",
    "ScribeNavigationEvidence",
    "parse_evidence",
]
