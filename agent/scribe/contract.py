"""抄写员场景的严格请求、输出和模型文本契约。"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, ValidationError, model_validator

from agent.shared.contract import Hash, Id, StrictModel, plain_text
from agent.shared.errors import ContractError
from agent.shared.hash import evidence_hash


Scene = Literal["interaction", "death-review", "navigation"]
Result = Literal["correct", "missing-concept", "wrong-result", "syntax-error"]
Outcome = Literal["hit", "countered", "victory", "defeat"]
Cause = Literal["combat", "hazard", "cipher", "unknown"]
Direction = Literal["north", "east", "south", "west"]
Headline = plain_text(80)
Fact = plain_text(120)
Action = plain_text(180)
Message = plain_text(240)
Column = plain_text(64)
Concept = plain_text(80)


class ScribeLearningEvidence(StrictModel):
    lesson_id: Id
    stage_id: Id
    objective: Message
    required_columns: Annotated[list[Column], Field(max_length=16)]
    submitted_columns: Annotated[list[Column], Field(max_length=16)]
    missing_columns: Annotated[list[Column], Field(max_length=16)]
    unexpected_columns: Annotated[list[Column], Field(max_length=16)]
    broken_concepts: Annotated[list[Concept], Field(max_length=12)]
    remaining_concepts: Annotated[list[Concept], Field(max_length=12)]
    result_category: Result
    hint_level: Annotated[int, Field(ge=0, le=4)]
    safe_hint_id: Id | None


class ScribeNavigationEvidence(StrictModel):
    target_id: Id
    target_label: Message
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
    authored_message: Message
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


class ScribeRequest(ScribeEvidence):
    protocol_version: Literal[1]
    request_id: Id
    evidence_hash: Hash

    def evidence_payload(self) -> dict[str, object]:
        return ScribeEvidence(
            floor=self.floor,
            scene=self.scene,
            scribe_id=self.scribe_id,
            topic=self.topic,
            authored_message=self.authored_message,
            learning=self.learning,
            navigation=self.navigation,
            death=self.death,
        ).model_dump(by_alias=True, mode="json")

    @model_validator(mode="after")
    def check_hash(self) -> "ScribeRequest":
        if evidence_hash(self.evidence_payload()) != self.evidence_hash:
            raise ValueError("evidenceHash does not match request evidence")
        return self


class ScribeModelContent(StrictModel):
    """模型唯一有权生成的陪伴字段。"""

    headline: Headline
    message: Message


class ScribeAgentContent(ScribeModelContent):
    facts: Annotated[list[Fact], Field(max_length=3)]
    next_action: Action
    safe_hint_id: Id | None


class ScribeOutput(ScribeAgentContent):
    schema_version: Literal[1]
    request_id: Id
    evidence_hash: Hash

    def to_dict(self) -> dict[str, object]:
        return self.model_dump(by_alias=True, mode="json")


def _validate(model: type[StrictModel], payload: object) -> StrictModel:
    try:
        return model.model_validate(payload)
    except ValidationError as error:
        raise ContractError("scribe contract is invalid") from error


def parse_request(payload: object) -> ScribeRequest:
    return _validate(ScribeRequest, payload)  # type: ignore[return-value]


def parse_output(payload: object, request: ScribeRequest) -> ScribeOutput:
    output = _validate(ScribeOutput, payload)
    assert isinstance(output, ScribeOutput)
    expected_hint = request.learning.safe_hint_id if request.learning else None
    if (
        output.request_id != request.request_id
        or output.evidence_hash != request.evidence_hash
        or output.safe_hint_id != expected_hint
    ):
        raise ContractError("scribe output does not match request")
    return output


__all__ = [
    "ScribeAgentContent",
    "ScribeDeathEvidence",
    "ScribeEvidence",
    "ScribeLearningEvidence",
    "ScribeModelContent",
    "ScribeNavigationEvidence",
    "ScribeOutput",
    "ScribeRequest",
    "ContractError",
    "parse_output",
    "parse_request",
]
