"""Closed input and output contracts for the output-only Agent."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

_RESULTS = {"correct", "missing-concept", "wrong-result", "syntax-error"}
_OUTCOMES = {"hit", "countered", "victory", "defeat"}


def _object(value: object, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{label} must be an object")
    if not all(isinstance(key, str) for key in value):
        raise ValueError(f"{label} keys must be strings")
    return value


def _closed_keys(
    value: Mapping[str, Any],
    *,
    required: set[str],
    optional: set[str] | None = None,
    label: str,
) -> None:
    optional = optional or set()
    missing = required.difference(value)
    unknown = set(value).difference(required | optional)
    if missing:
        raise ValueError(f"{label} missing fields: {sorted(missing)}")
    if unknown:
        raise ValueError(f"{label} unknown fields: {sorted(unknown)}")


def _text(
    value: object,
    label: str,
    *,
    maximum: int,
    allow_empty: bool = False,
    single_line: bool = False,
) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a string")
    normalized = value.strip()
    if not allow_empty and not normalized:
        raise ValueError(f"{label} must be non-empty")
    if len(normalized) > maximum:
        raise ValueError(f"{label} exceeds {maximum} characters")
    if single_line and any(marker in normalized for marker in ("\n", "\r", "<", ">")):
        raise ValueError(f"{label} must be short plain text")
    return normalized


def _integer(value: object, label: str, *, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{label} must be an integer")
    if value < minimum or value > maximum:
        raise ValueError(f"{label} must be between {minimum} and {maximum}")
    return value


def _string_list(
    value: object,
    label: str,
    *,
    maximum_items: int,
    item_maximum: int,
) -> tuple[str, ...]:
    if not isinstance(value, list) or len(value) > maximum_items:
        raise ValueError(f"{label} must contain at most {maximum_items} items")
    return tuple(
        _text(item, f"{label}[{index}]", maximum=item_maximum, single_line=True)
        for index, item in enumerate(value)
    )


@dataclass(frozen=True, slots=True)
class AttemptEvidence:
    attempt_id: int
    lesson_id: str
    stage_id: str
    objective: str
    submitted_sql: str
    reference_sql: str
    result: str
    outcome: str
    hint_level: int

    @classmethod
    def from_value(cls, value: object) -> AttemptEvidence:
        data = _object(value, "attempt")
        _closed_keys(
            data,
            required={
                "attemptId",
                "lessonId",
                "stageId",
                "objective",
                "submittedSql",
                "referenceSql",
                "result",
                "outcome",
                "hintLevel",
            },
            label="attempt",
        )
        result = _text(data["result"], "attempt.result", maximum=32)
        outcome = _text(data["outcome"], "attempt.outcome", maximum=32)
        if result not in _RESULTS:
            raise ValueError("attempt.result is unsupported")
        if outcome not in _OUTCOMES:
            raise ValueError("attempt.outcome is unsupported")
        return cls(
            attempt_id=_integer(data["attemptId"], "attempt.attemptId", minimum=0, maximum=1_000_000),
            lesson_id=_text(data["lessonId"], "attempt.lessonId", maximum=80, single_line=True),
            stage_id=_text(data["stageId"], "attempt.stageId", maximum=100, single_line=True),
            objective=_text(data["objective"], "attempt.objective", maximum=500),
            submitted_sql=_text(data["submittedSql"], "attempt.submittedSql", maximum=4_000),
            reference_sql=_text(data["referenceSql"], "attempt.referenceSql", maximum=4_000),
            result=result,
            outcome=outcome,
            hint_level=_integer(data["hintLevel"], "attempt.hintLevel", minimum=0, maximum=10),
        )

    @property
    def evidence_ref(self) -> str:
        return f"attempt:{self.attempt_id}"

    def prompt_value(self) -> dict[str, object]:
        return {
            "evidenceRef": self.evidence_ref,
            "lessonId": self.lesson_id,
            "stageId": self.stage_id,
            "objective": self.objective,
            "submittedSql": self.submitted_sql,
            "referenceSql": self.reference_sql,
            "result": self.result,
            "outcome": self.outcome,
            "hintLevel": self.hint_level,
        }


@dataclass(frozen=True, slots=True)
class RelicEvidence:
    relic_id: str
    name: str
    description: str

    @classmethod
    def from_value(cls, value: object) -> RelicEvidence:
        data = _object(value, "relic")
        _closed_keys(data, required={"id", "name", "description"}, label="relic")
        return cls(
            relic_id=_text(data["id"], "relic.id", maximum=80, single_line=True),
            name=_text(data["name"], "relic.name", maximum=80, single_line=True),
            description=_text(data["description"], "relic.description", maximum=300),
        )

    def prompt_value(self) -> dict[str, str]:
        return {"id": self.relic_id, "name": self.name, "description": self.description}


@dataclass(frozen=True, slots=True)
class StorySource:
    beat_id: str
    title: str
    lines: tuple[str, ...]

    @classmethod
    def from_value(cls, value: object) -> StorySource:
        data = _object(value, "story")
        _closed_keys(data, required={"beatId", "title", "lines"}, label="story")
        return cls(
            beat_id=_text(data["beatId"], "story.beatId", maximum=120, single_line=True),
            title=_text(data["title"], "story.title", maximum=120, single_line=True),
            lines=_string_list(data["lines"], "story.lines", maximum_items=3, item_maximum=300),
        )

    def prompt_value(self) -> dict[str, object]:
        return {"beatId": self.beat_id, "title": self.title, "lines": list(self.lines)}


@dataclass(frozen=True, slots=True)
class AgentContext:
    request_version: int
    run_id: str
    floor: int
    evidence_hash: str
    attempts: tuple[AttemptEvidence, ...]
    completed_lessons: tuple[str, ...]
    world_changes: tuple[str, ...]
    relics: tuple[RelicEvidence, ...]
    story: StorySource | None

    @classmethod
    def from_value(cls, value: object) -> AgentContext:
        data = _object(value, "request")
        _closed_keys(
            data,
            required={
                "requestVersion",
                "runId",
                "floor",
                "evidenceHash",
                "attempts",
                "completedLessons",
                "worldChanges",
                "relics",
                "story",
            },
            label="request",
        )
        version = _integer(data["requestVersion"], "request.requestVersion", minimum=1, maximum=1)
        raw_attempts = data["attempts"]
        if not isinstance(raw_attempts, list) or len(raw_attempts) > 8:
            raise ValueError("request.attempts must contain at most 8 items")
        raw_relics = data["relics"]
        if not isinstance(raw_relics, list) or len(raw_relics) > 8:
            raise ValueError("request.relics must contain at most 8 items")
        story_value = data["story"]
        return cls(
            request_version=version,
            run_id=_text(data["runId"], "request.runId", maximum=80, single_line=True),
            floor=_integer(data["floor"], "request.floor", minimum=1, maximum=8),
            evidence_hash=_text(data["evidenceHash"], "request.evidenceHash", maximum=80, single_line=True),
            attempts=tuple(AttemptEvidence.from_value(item) for item in raw_attempts),
            completed_lessons=_string_list(
                data["completedLessons"],
                "request.completedLessons",
                maximum_items=48,
                item_maximum=80,
            ),
            world_changes=_string_list(
                data["worldChanges"],
                "request.worldChanges",
                maximum_items=16,
                item_maximum=160,
            ),
            relics=tuple(RelicEvidence.from_value(item) for item in raw_relics),
            story=None if story_value is None else StorySource.from_value(story_value),
        )

    @property
    def allowed_evidence_refs(self) -> frozenset[str]:
        return frozenset(attempt.evidence_ref for attempt in self.attempts)

    def prompt_value(self) -> dict[str, object]:
        return {
            "floor": self.floor,
            "attempts": [attempt.prompt_value() for attempt in self.attempts],
            "completedLessons": list(self.completed_lessons),
            "worldChanges": list(self.world_changes),
            "relics": [relic.prompt_value() for relic in self.relics],
            "story": self.story.prompt_value() if self.story else None,
        }


@dataclass(frozen=True, slots=True)
class CampfireOutput:
    headline: str
    facts: tuple[str, ...]
    focus_concept: str | None
    next_action: str

    def to_dict(self) -> dict[str, object]:
        return {
            "headline": self.headline,
            "facts": list(self.facts),
            "focusConcept": self.focus_concept,
            "nextAction": self.next_action,
        }


@dataclass(frozen=True, slots=True)
class ScribeOutput:
    greeting: str
    observation: str
    guidance: str
    relationship_line: str | None
    source_beat_id: str | None
    evidence_refs: tuple[str, ...]

    @classmethod
    def from_value(cls, value: object, context: AgentContext) -> ScribeOutput:
        data = _object(value, "scribe output")
        _closed_keys(
            data,
            required={
                "greeting",
                "observation",
                "guidance",
                "relationshipLine",
                "sourceBeatId",
                "evidenceRefs",
            },
            label="scribe output",
        )
        relationship = data["relationshipLine"]
        source = data["sourceBeatId"]
        refs = _string_list(
            data["evidenceRefs"],
            "scribe output.evidenceRefs",
            maximum_items=4,
            item_maximum=40,
        )
        if not set(refs).issubset(context.allowed_evidence_refs):
            raise ValueError("scribe output cites unknown evidence")
        allowed_source = context.story.beat_id if context.story else None
        if source is not None and source != allowed_source:
            raise ValueError("scribe output cites an unavailable story beat")
        return cls(
            greeting=_text(data["greeting"], "scribe output.greeting", maximum=80, single_line=True),
            observation=_text(data["observation"], "scribe output.observation", maximum=180, single_line=True),
            guidance=_text(data["guidance"], "scribe output.guidance", maximum=180, single_line=True),
            relationship_line=None if relationship is None else _text(
                relationship,
                "scribe output.relationshipLine",
                maximum=100,
                single_line=True,
            ),
            source_beat_id=None if source is None else _text(
                source,
                "scribe output.sourceBeatId",
                maximum=120,
                single_line=True,
            ),
            evidence_refs=refs,
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "greeting": self.greeting,
            "observation": self.observation,
            "guidance": self.guidance,
            "relationshipLine": self.relationship_line,
            "sourceBeatId": self.source_beat_id,
            "evidenceRefs": list(self.evidence_refs),
        }


@dataclass(frozen=True, slots=True)
class PreparedAgentOutput:
    run_id: str
    floor: int
    evidence_hash: str
    source: str
    campfire: CampfireOutput
    scribe: ScribeOutput

    def to_dict(self) -> dict[str, object]:
        return {
            "version": 1,
            "runId": self.run_id,
            "floor": self.floor,
            "evidenceHash": self.evidence_hash,
            "source": self.source,
            "campfire": self.campfire.to_dict(),
            "scribe": self.scribe.to_dict(),
        }
