"""Python-side closed protocol for the four output-only Agent hooks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional, Tuple

REQUEST_VERSION = 2
OUTPUT_VERSION = 2
RESULTS = {"correct", "missing-concept", "wrong-result", "syntax-error"}
OUTCOMES = {"hit", "countered", "victory", "defeat"}
HOOKS = {"floor-start", "route-guidance", "elite-defeated", "floor-end"}
PHASES = {"opening", "route", "ending"}
DIRECTIONS = {"north", "east", "south", "west"}


def _object(value: object, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or not all(isinstance(key, str) for key in value):
        raise ValueError(f"{label} must be an object")
    return value


def _closed_keys(
    value: Mapping[str, Any],
    *,
    required: set[str],
    optional: Optional[set[str]] = None,
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
    if not normalized and not allow_empty:
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
) -> Tuple[str, ...]:
    if not isinstance(value, list) or len(value) > maximum_items:
        raise ValueError(f"{label} must contain at most {maximum_items} items")
    return tuple(
        _text(item, f"{label}[{index}]", maximum=item_maximum, single_line=True)
        for index, item in enumerate(value)
    )


@dataclass(frozen=True)
class AgentHook:
    type: str
    phase: str
    floor: int
    objective_room_id: Optional[str] = None
    objective_title: Optional[str] = None
    level: Optional[int] = None
    direction: Optional[str] = None
    distance: Optional[int] = None
    monster_id: Optional[int] = None
    mode: Optional[str] = None

    @classmethod
    def from_value(cls, value: object) -> "AgentHook":
        data = _object(value, "request.trigger")
        _closed_keys(
            data,
            required={"type", "phase", "floor"},
            optional={
                "objectiveRoomId", "objectiveTitle", "level", "direction",
                "distance", "monsterId", "mode",
            },
            label="request.trigger",
        )
        hook_type = _text(data["type"], "request.trigger.type", maximum=32, single_line=True)
        phase = _text(data["phase"], "request.trigger.phase", maximum=16, single_line=True)
        if hook_type not in HOOKS or phase not in PHASES:
            raise ValueError("request.trigger type or phase is unsupported")
        floor = _integer(data["floor"], "request.trigger.floor", minimum=1, maximum=8)
        objective_room_id = data.get("objectiveRoomId")
        if objective_room_id is not None:
            objective_room_id = _text(objective_room_id, "request.trigger.objectiveRoomId", maximum=120, single_line=True)
        objective_title = data.get("objectiveTitle")
        if objective_title is not None:
            objective_title = _text(objective_title, "request.trigger.objectiveTitle", maximum=160, single_line=True)
        level = data.get("level")
        if level is not None:
            level = _integer(level, "request.trigger.level", minimum=0, maximum=3)
        direction = data.get("direction")
        if direction is not None:
            direction = _text(direction, "request.trigger.direction", maximum=8, single_line=True)
            if direction not in DIRECTIONS:
                raise ValueError("request.trigger.direction is unsupported")
        distance = data.get("distance")
        if distance is not None:
            distance = _integer(distance, "request.trigger.distance", minimum=0, maximum=10_000)
        monster_id = data.get("monsterId")
        if monster_id is not None:
            monster_id = _integer(monster_id, "request.trigger.monsterId", minimum=0, maximum=1_000_000)
        mode = data.get("mode")
        if mode is not None:
            mode = _text(mode, "request.trigger.mode", maximum=16, single_line=True)
            if mode not in {"transition", "victory"}:
                raise ValueError("request.trigger.mode is unsupported")
        return cls(
            type=hook_type,
            phase=phase,
            floor=floor,
            objective_room_id=objective_room_id,
            objective_title=objective_title,
            level=level,
            direction=direction,
            distance=distance,
            monster_id=monster_id,
            mode=mode,
        )

    def to_dict(self) -> dict[str, object]:
        result: dict[str, object] = {"type": self.type, "phase": self.phase, "floor": self.floor}
        optional = {
            "objectiveRoomId": self.objective_room_id,
            "objectiveTitle": self.objective_title,
            "level": self.level,
            "direction": self.direction,
            "distance": self.distance,
            "monsterId": self.monster_id,
            "mode": self.mode,
        }
        result.update({key: value for key, value in optional.items() if value is not None})
        return result


@dataclass(frozen=True)
class NavigationEvidence:
    objective_room_id: Optional[str]
    objective_title: Optional[str]
    level: int
    direction: Optional[str]
    distance: Optional[int]

    @classmethod
    def from_value(cls, value: object) -> "NavigationEvidence":
        data = _object(value, "request.navigation")
        _closed_keys(
            data,
            required={"objectiveRoomId", "objectiveTitle", "level", "direction", "distance"},
            label="request.navigation",
        )
        room = data["objectiveRoomId"]
        title = data["objectiveTitle"]
        direction = data["direction"]
        if room is not None:
            room = _text(room, "request.navigation.objectiveRoomId", maximum=120, single_line=True)
        if title is not None:
            title = _text(title, "request.navigation.objectiveTitle", maximum=160, single_line=True)
        if direction is not None:
            direction = _text(direction, "request.navigation.direction", maximum=8, single_line=True)
            if direction not in DIRECTIONS:
                raise ValueError("request.navigation.direction is unsupported")
        distance = data["distance"]
        if distance is not None:
            distance = _integer(distance, "request.navigation.distance", minimum=0, maximum=10_000)
        return cls(
            objective_room_id=room,
            objective_title=title,
            level=_integer(data["level"], "request.navigation.level", minimum=0, maximum=3),
            direction=direction,
            distance=distance,
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "objectiveRoomId": self.objective_room_id,
            "objectiveTitle": self.objective_title,
            "level": self.level,
            "direction": self.direction,
            "distance": self.distance,
        }


@dataclass(frozen=True)
class AttemptEvidence:
    attempt_id: int
    lesson_id: str
    stage_id: str
    objective: str
    sql_features: Tuple[str, ...]
    result: str
    outcome: str
    hint_level: int

    @classmethod
    def from_value(cls, value: object) -> "AttemptEvidence":
        data = _object(value, "attempt")
        _closed_keys(
            data,
            required={"attemptId", "lessonId", "stageId", "objective", "sqlFeatures", "result", "outcome", "hintLevel"},
            label="attempt",
        )
        result = _text(data["result"], "attempt.result", maximum=32, single_line=True)
        outcome = _text(data["outcome"], "attempt.outcome", maximum=32, single_line=True)
        if result not in RESULTS or outcome not in OUTCOMES:
            raise ValueError("attempt result or outcome is unsupported")
        return cls(
            attempt_id=_integer(data["attemptId"], "attempt.attemptId", minimum=0, maximum=1_000_000),
            lesson_id=_text(data["lessonId"], "attempt.lessonId", maximum=80, single_line=True),
            stage_id=_text(data["stageId"], "attempt.stageId", maximum=100, single_line=True),
            objective=_text(data["objective"], "attempt.objective", maximum=500, single_line=True),
            sql_features=_string_list(data["sqlFeatures"], "attempt.sqlFeatures", maximum_items=12, item_maximum=24),
            result=result,
            outcome=outcome,
            hint_level=_integer(data["hintLevel"], "attempt.hintLevel", minimum=0, maximum=10),
        )

    @property
    def evidence_ref(self) -> str:
        return f"attempt:{self.attempt_id}"

    def to_dict(self) -> dict[str, object]:
        return {
            "attemptId": self.attempt_id,
            "lessonId": self.lesson_id,
            "stageId": self.stage_id,
            "objective": self.objective,
            "sqlFeatures": list(self.sql_features),
            "result": self.result,
            "outcome": self.outcome,
            "hintLevel": self.hint_level,
        }


@dataclass(frozen=True)
class StorySource:
    beat_id: str
    title: str
    lines: Tuple[str, ...]

    @classmethod
    def from_value(cls, value: object) -> "StorySource":
        data = _object(value, "request.story")
        _closed_keys(data, required={"beatId", "title", "lines"}, label="request.story")
        return cls(
            beat_id=_text(data["beatId"], "story.beatId", maximum=120, single_line=True),
            title=_text(data["title"], "story.title", maximum=120, single_line=True),
            lines=_string_list(data["lines"], "story.lines", maximum_items=3, item_maximum=300),
        )

    def to_dict(self) -> dict[str, object]:
        return {"beatId": self.beat_id, "title": self.title, "lines": list(self.lines)}


@dataclass(frozen=True)
class RelicEvidence:
    relic_id: str
    name: str
    description: str

    @classmethod
    def from_value(cls, value: object) -> "RelicEvidence":
        data = _object(value, "relic")
        _closed_keys(data, required={"id", "name", "description"}, label="relic")
        return cls(
            relic_id=_text(data["id"], "relic.id", maximum=80, single_line=True),
            name=_text(data["name"], "relic.name", maximum=80, single_line=True),
            description=_text(data["description"], "relic.description", maximum=300, single_line=True),
        )

    def to_dict(self) -> dict[str, str]:
        return {"id": self.relic_id, "name": self.name, "description": self.description}


@dataclass(frozen=True)
class AgentContext:
    request_version: int
    run_id: str
    floor: int
    evidence_hash: str
    trigger: AgentHook
    navigation: NavigationEvidence
    campfire_unlocked: bool
    defeated_elite_ids: Tuple[int, ...]
    attempts: Tuple[AttemptEvidence, ...]
    completed_lessons: Tuple[str, ...]
    world_changes: Tuple[str, ...]
    relics: Tuple[RelicEvidence, ...]
    story: Optional[StorySource]

    @classmethod
    def from_value(cls, value: object) -> "AgentContext":
        data = _object(value, "request")
        _closed_keys(
            data,
            required={
                "requestVersion", "runId", "floor", "evidenceHash", "trigger", "navigation",
                "campfireUnlocked", "defeatedEliteIds", "attempts", "completedLessons",
                "worldChanges", "relics", "story",
            },
            label="request",
        )
        version = _integer(data["requestVersion"], "request.requestVersion", minimum=REQUEST_VERSION, maximum=REQUEST_VERSION)
        raw_attempts = data["attempts"]
        if not isinstance(raw_attempts, list) or len(raw_attempts) > 8:
            raise ValueError("request.attempts must contain at most 8 items")
        raw_relics = data["relics"]
        if not isinstance(raw_relics, list) or len(raw_relics) > 8:
            raise ValueError("request.relics must contain at most 8 items")
        raw_elites = data["defeatedEliteIds"]
        if not isinstance(raw_elites, list) or len(raw_elites) > 8:
            raise ValueError("request.defeatedEliteIds must contain at most 8 items")
        if not isinstance(data["campfireUnlocked"], bool):
            raise ValueError("request.campfireUnlocked must be boolean")
        return cls(
            request_version=version,
            run_id=_text(data["runId"], "request.runId", maximum=80, single_line=True),
            floor=_integer(data["floor"], "request.floor", minimum=1, maximum=8),
            evidence_hash=_text(data["evidenceHash"], "request.evidenceHash", maximum=80, single_line=True),
            trigger=AgentHook.from_value(data["trigger"]),
            navigation=NavigationEvidence.from_value(data["navigation"]),
            campfire_unlocked=data["campfireUnlocked"],
            defeated_elite_ids=tuple(
                _integer(item, f"request.defeatedEliteIds[{index}]", minimum=0, maximum=1_000_000)
                for index, item in enumerate(raw_elites)
            ),
            attempts=tuple(AttemptEvidence.from_value(item) for item in raw_attempts),
            completed_lessons=_string_list(data["completedLessons"], "request.completedLessons", maximum_items=48, item_maximum=80),
            world_changes=_string_list(data["worldChanges"], "request.worldChanges", maximum_items=16, item_maximum=160),
            relics=tuple(RelicEvidence.from_value(item) for item in raw_relics),
            story=None if data["story"] is None else StorySource.from_value(data["story"]),
        )

    @property
    def allowed_evidence_refs(self) -> frozenset[str]:
        return frozenset(attempt.evidence_ref for attempt in self.attempts)

    def prompt_value(self) -> dict[str, object]:
        return {
            "floor": self.floor,
            "trigger": self.trigger.to_dict(),
            "navigation": self.navigation.to_dict(),
            "campfireUnlocked": self.campfire_unlocked,
            "defeatedEliteIds": list(self.defeated_elite_ids),
            "attempts": [attempt.to_dict() for attempt in self.attempts],
            "completedLessons": list(self.completed_lessons),
            "worldChanges": list(self.world_changes),
            "relics": [relic.to_dict() for relic in self.relics],
            "story": self.story.to_dict() if self.story else None,
        }


@dataclass(frozen=True)
class CampfireOutput:
    available: bool
    headline: str
    facts: Tuple[str, ...]
    focus_concept: Optional[str]
    next_action: str

    def to_dict(self) -> dict[str, object]:
        return {
            "available": self.available,
            "headline": self.headline,
            "facts": list(self.facts),
            "focusConcept": self.focus_concept,
            "nextAction": self.next_action,
        }


@dataclass(frozen=True)
class ScribeOutput:
    greeting: str
    observation: str
    guidance: str
    relationship_line: Optional[str]
    source_beat_id: Optional[str]
    evidence_refs: Tuple[str, ...]

    @classmethod
    def from_value(cls, value: object, context: AgentContext) -> "ScribeOutput":
        data = _object(value, "scribe")
        _closed_keys(
            data,
            required={"greeting", "observation", "guidance", "relationshipLine", "sourceBeatId", "evidenceRefs"},
            label="scribe",
        )
        refs = _string_list(data["evidenceRefs"], "scribe.evidenceRefs", maximum_items=4, item_maximum=40)
        if any(not ref.startswith("attempt:") or ref not in context.allowed_evidence_refs for ref in refs):
            raise ValueError("scribe contains unknown evidence")
        source = data["sourceBeatId"]
        if source is not None:
            source = _text(source, "scribe.sourceBeatId", maximum=120, single_line=True)
            if context.story is None or source != context.story.beat_id:
                raise ValueError("scribe contains unavailable story")
        return cls(
            greeting=_text(data["greeting"], "scribe.greeting", maximum=80, single_line=True),
            observation=_text(data["observation"], "scribe.observation", maximum=180, single_line=True),
            guidance=_text(data["guidance"], "scribe.guidance", maximum=180, single_line=True),
            relationship_line=None if data["relationshipLine"] is None else _text(data["relationshipLine"], "scribe.relationshipLine", maximum=100, single_line=True),
            source_beat_id=source,
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


@dataclass(frozen=True)
class PreparedAgentOutput:
    run_id: str
    floor: int
    evidence_hash: str
    source: str
    campfire: CampfireOutput
    scribe: ScribeOutput

    def to_dict(self) -> dict[str, object]:
        return {
            "version": OUTPUT_VERSION,
            "runId": self.run_id,
            "floor": self.floor,
            "evidenceHash": self.evidence_hash,
            "source": self.source,
            "campfire": self.campfire.to_dict(),
            "scribe": self.scribe.to_dict(),
        }
