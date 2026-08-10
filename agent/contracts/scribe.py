"""抄写员 Agent 的场景化数据契约。

抄写员只接收经过游戏端投影的当前场景证据，并返回受限的陪伴文案。
它不能读取完整存档、参考 SQL、地图或玩家身份，也不能返回游戏动作。
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from agent.contracts.hash import evidence_hash
from agent.contracts.models import ContractError


PROTOCOL_VERSION = 1
MAX_ID_CHARS = 128
MAX_TOPIC_CHARS = 120
MAX_MESSAGE_CHARS = 240
MAX_HEADLINE_CHARS = 80
MAX_FACT_CHARS = 120
MAX_NEXT_ACTION_CHARS = 180
MAX_COLUMN_CHARS = 64
MAX_COLUMNS = 16
MAX_CONCEPT_CHARS = 80
MAX_CONCEPTS = 12
MAX_HINT_ID_CHARS = 128

SCENE_VALUES = frozenset({"interaction", "death-review", "navigation"})
RESULT_VALUES = frozenset({"correct", "missing-concept", "wrong-result", "syntax-error"})
OUTCOME_VALUES = frozenset({"hit", "countered", "victory", "defeat"})
CAUSE_VALUES = frozenset({"combat", "hazard", "cipher", "unknown"})
DIRECTION_VALUES = frozenset({"north", "east", "south", "west"})
_FORBIDDEN_TEXT_MARKER = re.compile(
    r"<[^>]*>|javascript:|tool_call|function_call|<script",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ScribeLearningEvidence:
    """本地 SQL 评估器生成的字段和概念诊断。"""

    lesson_id: str
    stage_id: str
    objective: str
    required_columns: tuple[str, ...]
    submitted_columns: tuple[str, ...]
    missing_columns: tuple[str, ...]
    unexpected_columns: tuple[str, ...]
    broken_concepts: tuple[str, ...]
    remaining_concepts: tuple[str, ...]
    result_category: str
    hint_level: int
    safe_hint_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "lessonId": self.lesson_id,
            "stageId": self.stage_id,
            "objective": self.objective,
            "requiredColumns": list(self.required_columns),
            "submittedColumns": list(self.submitted_columns),
            "missingColumns": list(self.missing_columns),
            "unexpectedColumns": list(self.unexpected_columns),
            "brokenConcepts": list(self.broken_concepts),
            "remainingConcepts": list(self.remaining_concepts),
            "resultCategory": self.result_category,
            "hintLevel": self.hint_level,
            "safeHintId": self.safe_hint_id,
        }


@dataclass(frozen=True)
class ScribeNavigationEvidence:
    """由本地 GuidedMap 计算出的不可变路线事实。"""

    target_id: str
    target_label: str
    direction: str
    distance: int
    guidance_level: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "targetId": self.target_id,
            "targetLabel": self.target_label,
            "direction": self.direction,
            "distance": self.distance,
            "guidanceLevel": self.guidance_level,
        }


@dataclass(frozen=True)
class ScribeDeathEvidence:
    """本地战斗系统确认后的死亡摘要。"""

    cause: str
    battle_attempts: int
    last_outcome: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "cause": self.cause,
            "battleAttempts": self.battle_attempts,
            "lastOutcome": self.last_outcome,
        }


@dataclass(frozen=True)
class ScribeRequest:
    """一次抄写员场景请求，不包含完整游戏快照。"""

    request_id: str
    evidence_hash: str
    floor: int
    scene: str
    scribe_id: str
    topic: str
    authored_message: str
    learning: ScribeLearningEvidence | None
    navigation: ScribeNavigationEvidence | None
    death: ScribeDeathEvidence | None

    def evidence_payload(self) -> dict[str, Any]:
        return {
            "floor": self.floor,
            "scene": self.scene,
            "scribeId": self.scribe_id,
            "topic": self.topic,
            "authoredMessage": self.authored_message,
            "learning": self.learning.to_dict() if self.learning else None,
            "navigation": self.navigation.to_dict() if self.navigation else None,
            "death": self.death.to_dict() if self.death else None,
        }


@dataclass(frozen=True)
class ScribeOutput:
    """可展示给玩家的抄写员文本结果。"""

    schema_version: int
    request_id: str
    evidence_hash: str
    headline: str
    facts: tuple[str, ...]
    next_action: str
    safe_hint_id: str | None
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "requestId": self.request_id,
            "evidenceHash": self.evidence_hash,
            "headline": self.headline,
            "facts": list(self.facts),
            "nextAction": self.next_action,
            "safeHintId": self.safe_hint_id,
            "message": self.message,
        }


def is_mapping(value: Any) -> bool:
    return isinstance(value, dict)


def _require_object(value: Any, name: str) -> dict[str, Any]:
    if not is_mapping(value):
        raise ContractError(f"{name} must be an object")
    return value


def _require_exact_keys(value: dict[str, Any], expected: set[str], name: str) -> None:
    if set(value) != expected:
        raise ContractError(f"{name} keys invalid")


def _require_text(value: Any, name: str, maximum: int, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise ContractError(f"{name} must be a string")
    if not allow_empty and not value.strip():
        raise ContractError(f"{name} must not be empty")
    if len(value) > maximum or "\x00" in value:
        raise ContractError(f"{name} is invalid")
    return value


def _require_plain_text(value: Any, name: str, maximum: int) -> str:
    text = _require_text(value, name, maximum)
    if _FORBIDDEN_TEXT_MARKER.search(text):
        raise ContractError(f"{name} contains forbidden markup or tool syntax")
    return text


def _require_int(value: Any, name: str, minimum: int = 0, maximum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ContractError(f"{name} must be an integer")
    if value < minimum or (maximum is not None and value > maximum):
        raise ContractError(f"{name} is out of range")
    return value


def _require_list(value: Any, name: str, maximum: int, item_maximum: int) -> tuple[str, ...]:
    if not isinstance(value, list) or len(value) > maximum:
        raise ContractError(f"{name} is invalid")
    return tuple(
        _require_text(item, f"{name}[{index}]", item_maximum)
        for index, item in enumerate(value)
    )


def _parse_learning(value: Any) -> ScribeLearningEvidence:
    raw = _require_object(value, "learning")
    _require_exact_keys(
        raw,
        {
            "lessonId", "stageId", "objective", "requiredColumns", "submittedColumns",
            "missingColumns", "unexpectedColumns", "brokenConcepts", "remainingConcepts",
            "resultCategory", "hintLevel", "safeHintId",
        },
        "learning",
    )
    result_category = _require_text(raw["resultCategory"], "learning.resultCategory", 32)
    if result_category not in RESULT_VALUES:
        raise ContractError("learning.resultCategory is invalid")
    safe_hint_id = raw["safeHintId"]
    if safe_hint_id is not None:
        safe_hint_id = _require_text(safe_hint_id, "learning.safeHintId", MAX_HINT_ID_CHARS)
    return ScribeLearningEvidence(
        lesson_id=_require_text(raw["lessonId"], "learning.lessonId", MAX_ID_CHARS),
        stage_id=_require_text(raw["stageId"], "learning.stageId", MAX_ID_CHARS),
        objective=_require_plain_text(raw["objective"], "learning.objective", MAX_MESSAGE_CHARS),
        required_columns=_require_list(raw["requiredColumns"], "learning.requiredColumns", MAX_COLUMNS, MAX_COLUMN_CHARS),
        submitted_columns=_require_list(raw["submittedColumns"], "learning.submittedColumns", MAX_COLUMNS, MAX_COLUMN_CHARS),
        missing_columns=_require_list(raw["missingColumns"], "learning.missingColumns", MAX_COLUMNS, MAX_COLUMN_CHARS),
        unexpected_columns=_require_list(raw["unexpectedColumns"], "learning.unexpectedColumns", MAX_COLUMNS, MAX_COLUMN_CHARS),
        broken_concepts=_require_list(raw["brokenConcepts"], "learning.brokenConcepts", MAX_CONCEPTS, MAX_CONCEPT_CHARS),
        remaining_concepts=_require_list(raw["remainingConcepts"], "learning.remainingConcepts", MAX_CONCEPTS, MAX_CONCEPT_CHARS),
        result_category=result_category,
        hint_level=_require_int(raw["hintLevel"], "learning.hintLevel", 0, 4),
        safe_hint_id=safe_hint_id,
    )


def _parse_navigation(value: Any) -> ScribeNavigationEvidence:
    raw = _require_object(value, "navigation")
    _require_exact_keys(raw, {"targetId", "targetLabel", "direction", "distance", "guidanceLevel"}, "navigation")
    direction = _require_text(raw["direction"], "navigation.direction", 16)
    if direction not in DIRECTION_VALUES:
        raise ContractError("navigation.direction is invalid")
    return ScribeNavigationEvidence(
        target_id=_require_text(raw["targetId"], "navigation.targetId", MAX_ID_CHARS),
        target_label=_require_text(raw["targetLabel"], "navigation.targetLabel", MAX_MESSAGE_CHARS),
        direction=direction,
        distance=_require_int(raw["distance"], "navigation.distance", 0, 999),
        guidance_level=_require_int(raw["guidanceLevel"], "navigation.guidanceLevel", 1, 3),
    )


def _parse_death(value: Any) -> ScribeDeathEvidence:
    raw = _require_object(value, "death")
    _require_exact_keys(raw, {"cause", "battleAttempts", "lastOutcome"}, "death")
    cause = _require_text(raw["cause"], "death.cause", 32)
    outcome = _require_text(raw["lastOutcome"], "death.lastOutcome", 32)
    if cause not in CAUSE_VALUES or outcome not in OUTCOME_VALUES:
        raise ContractError("death contains an invalid cause or outcome")
    return ScribeDeathEvidence(
        cause=cause,
        battle_attempts=_require_int(raw["battleAttempts"], "death.battleAttempts", 0, 200),
        last_outcome=outcome,
    )


def parse_request(payload: Any) -> ScribeRequest:
    root = _require_object(payload, "request")
    _require_exact_keys(
        root,
        {"protocolVersion", "requestId", "evidenceHash", "floor", "scene", "scribeId", "topic", "authoredMessage", "learning", "navigation", "death"},
        "request",
    )
    if root["protocolVersion"] != PROTOCOL_VERSION:
        raise ContractError("unsupported protocolVersion")
    request_id = _require_text(root["requestId"], "requestId", MAX_ID_CHARS)
    supplied_hash = _require_text(root["evidenceHash"], "evidenceHash", 64)
    if len(supplied_hash) != 64 or any(character not in "0123456789abcdef" for character in supplied_hash):
        raise ContractError("evidenceHash must be lowercase SHA-256 hex")
    floor = _require_int(root["floor"], "floor", 1, 8)
    scene = _require_text(root["scene"], "scene", 32)
    if scene not in SCENE_VALUES:
        raise ContractError("scene is invalid")
    learning = _parse_learning(root["learning"]) if root["learning"] is not None else None
    navigation = _parse_navigation(root["navigation"]) if root["navigation"] is not None else None
    death = _parse_death(root["death"]) if root["death"] is not None else None
    if scene == "navigation" and navigation is None:
        raise ContractError("navigation scene requires navigation evidence")
    if scene == "death-review" and death is None:
        raise ContractError("death-review scene requires death evidence")
    if scene == "interaction" and (navigation is not None or death is not None):
        raise ContractError("interaction scene cannot contain navigation or death evidence")
    if scene == "navigation" and (learning is not None or death is not None):
        raise ContractError("navigation scene cannot contain learning or death evidence")
    if scene == "death-review" and navigation is not None:
        raise ContractError("death-review scene cannot contain navigation evidence")
    request = ScribeRequest(
        request_id=request_id,
        evidence_hash=supplied_hash,
        floor=floor,
        scene=scene,
        scribe_id=_require_text(root["scribeId"], "scribeId", MAX_ID_CHARS),
        topic=_require_plain_text(root["topic"], "topic", MAX_TOPIC_CHARS),
        authored_message=_require_plain_text(root["authoredMessage"], "authoredMessage", MAX_MESSAGE_CHARS),
        learning=learning,
        navigation=navigation,
        death=death,
    )
    if supplied_hash != evidence_hash(request.evidence_payload()):
        raise ContractError("evidenceHash does not match request evidence")
    return request


def parse_output(payload: Any, request: ScribeRequest) -> ScribeOutput:
    root = _require_object(payload, "output")
    _require_exact_keys(
        root,
        {"schemaVersion", "requestId", "evidenceHash", "headline", "facts", "nextAction", "safeHintId", "message"},
        "output",
    )
    if root["schemaVersion"] != PROTOCOL_VERSION:
        raise ContractError("unsupported output schemaVersion")
    if root["requestId"] != request.request_id or root["evidenceHash"] != request.evidence_hash:
        raise ContractError("output does not match request")
    facts_value = root["facts"]
    if not isinstance(facts_value, list) or len(facts_value) > 3:
        raise ContractError("facts must contain at most three items")
    safe_hint_id = root["safeHintId"]
    if safe_hint_id is not None:
        safe_hint_id = _require_text(safe_hint_id, "safeHintId", MAX_HINT_ID_CHARS)
    expected_hint_id = request.learning.safe_hint_id if request.learning else None
    if safe_hint_id != expected_hint_id:
        raise ContractError("output safeHintId does not match request")
    return ScribeOutput(
        schema_version=PROTOCOL_VERSION,
        request_id=request.request_id,
        evidence_hash=request.evidence_hash,
        headline=_require_plain_text(root["headline"], "headline", MAX_HEADLINE_CHARS),
        facts=tuple(
            _require_plain_text(item, f"facts[{index}]", MAX_FACT_CHARS)
            for index, item in enumerate(facts_value)
        ),
        next_action=_require_plain_text(root["nextAction"], "nextAction", MAX_NEXT_ACTION_CHARS),
        safe_hint_id=safe_hint_id,
        message=_require_plain_text(root["message"], "message", MAX_MESSAGE_CHARS),
    )


__all__ = [
    "CAUSE_VALUES",
    "ContractError",
    "DIRECTION_VALUES",
    "ScribeDeathEvidence",
    "ScribeLearningEvidence",
    "ScribeNavigationEvidence",
    "ScribeOutput",
    "ScribeRequest",
    "parse_output",
    "parse_request",
]
