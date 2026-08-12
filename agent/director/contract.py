"""主 Agent 编排请求与 schema v2 响应契约。"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, ValidationError, model_validator

from agent.campfire.contract import CampfireAgentContent, CampfireEvidence
from agent.scribe.contract import ScribeAgentContent, ScribeEvidence
from agent.shared.contract import Hash, Id, StrictModel, plain_text
from agent.shared.errors import ContractError
from agent.shared.hash import canonical_json, evidence_hash


DirectorSource = Literal["campfire", "scribe"]
DirectorEvent = Literal["campfire-review", "scribe-interaction", "death-review", "navigation"]
RoleStatus = Literal["ready", "fallback"]


class CampfireChange(StrictModel):
    source: Literal["campfire"]
    evidence_hash: Hash
    evidence: CampfireEvidence


class ScribeChange(StrictModel):
    source: Literal["scribe"]
    evidence_hash: Hash
    evidence: ScribeEvidence


DirectorChange = Annotated[CampfireChange | ScribeChange, Field(discriminator="source")]


class CampfireContext(StrictModel):
    floor: Annotated[int, Field(ge=1, le=8)]
    evidence_hash: Hash
    content: CampfireAgentContent


class ScribeContext(StrictModel):
    floor: Annotated[int, Field(ge=1, le=8)]
    evidence_hash: Hash
    content: ScribeAgentContent


class DirectorContext(StrictModel):
    campfire: CampfireContext | None
    scribe: ScribeContext | None


class DirectorRequest(StrictModel):
    protocol_version: Literal[1]
    request_id: Id
    compose_hash: Hash
    floor: Annotated[int, Field(ge=1, le=8)]
    event: DirectorEvent
    changed_source: DirectorSource
    changed: DirectorChange
    context: DirectorContext

    def compose_payload(self) -> dict[str, object]:
        return {
            "floor": self.floor,
            "event": self.event,
            "changedSource": self.changed_source,
            "changedEvidenceHash": self.changed.evidence_hash,
            "campfireEvidenceHash": (
                self.changed.evidence_hash
                if self.changed_source == "campfire"
                else self.context.campfire.evidence_hash if self.context.campfire else None
            ),
            "scribeEvidenceHash": (
                self.changed.evidence_hash
                if self.changed_source == "scribe"
                else self.context.scribe.evidence_hash if self.context.scribe else None
            ),
        }

    @model_validator(mode="after")
    def check_links(self) -> "DirectorRequest":
        expected_source = "campfire" if self.event == "campfire-review" else "scribe"
        if self.changed_source != expected_source or self.changed.source != expected_source:
            raise ValueError("event and changedSource do not match")
        expected_scene = {
            "scribe-interaction": "interaction",
            "death-review": "death-review",
            "navigation": "navigation",
        }.get(self.event)
        if isinstance(self.changed, ScribeChange) and self.changed.evidence.scene != expected_scene:
            raise ValueError("event and scribe scene do not match")
        if self.changed.evidence.floor != self.floor:
            raise ValueError("changed evidence floor does not match")
        if self.changed_source == "campfire" and self.context.campfire is not None:
            raise ValueError("changed campfire cannot appear in context")
        if self.changed_source == "scribe" and self.context.scribe is not None:
            raise ValueError("changed scribe cannot appear in context")
        for item in (self.context.campfire, self.context.scribe):
            if item is not None and item.floor != self.floor:
                raise ValueError("context floor does not match")
        if evidence_hash(self.changed.evidence.model_dump(by_alias=True, mode="json")) != self.changed.evidence_hash:
            raise ValueError("changed evidenceHash does not match")
        if evidence_hash(self.compose_payload()) != self.compose_hash:
            raise ValueError("composeHash does not match")
        return self


class DirectorModelContent(StrictModel):
    guidance: plain_text(240)


class DirectorChild(StrictModel):
    source: DirectorSource
    evidence_hash: Hash
    status: RoleStatus
    content: CampfireAgentContent | ScribeAgentContent

    @model_validator(mode="after")
    def check_content(self) -> "DirectorChild":
        if self.source == "campfire" and not isinstance(self.content, CampfireAgentContent):
            raise ValueError("campfire child has invalid content")
        if self.source == "scribe" and not isinstance(self.content, ScribeAgentContent):
            raise ValueError("scribe child has invalid content")
        return self


class DirectorText(StrictModel):
    status: RoleStatus
    situation: plain_text(120)
    guidance: plain_text(240)


class TokenMeta(StrictModel):
    input: Annotated[int, Field(ge=0)] | None
    output: Annotated[int, Field(ge=0)] | None
    total: Annotated[int, Field(ge=0)] | None


class CallMeta(StrictModel):
    agent: Literal["campfire", "scribe", "director"]
    mode: Literal["model", "local"]
    status: RoleStatus
    ms: Annotated[int, Field(ge=0)]
    tokens: TokenMeta


class DirectorMeta(StrictModel):
    trace_id: Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")] | None
    ms: Annotated[int, Field(ge=0)]
    calls: Annotated[list[CallMeta], Field(min_length=2, max_length=2)]


class DirectorResponse(StrictModel):
    schema_version: Literal[2]
    request_id: Id
    compose_hash: Hash
    floor: Annotated[int, Field(ge=1, le=8)]
    event: DirectorEvent
    changed_source: DirectorSource
    child: DirectorChild
    director: DirectorText
    meta: DirectorMeta

    def to_dict(self) -> dict[str, object]:
        return self.model_dump(by_alias=True, mode="json")


def parse_request(payload: object) -> DirectorRequest:
    try:
        return DirectorRequest.model_validate(payload)
    except ValidationError as error:
        raise ContractError("director request is invalid") from error


def canonical(value: object) -> str:
    return canonical_json(value)


__all__ = [
    "DirectorModelContent",
    "DirectorRequest",
    "DirectorResponse",
    "canonical",
    "parse_request",
]
