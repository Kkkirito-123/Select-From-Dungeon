"""篝火协议使用的数据模型。

本模块只保存跨模块的数据结构和边界常量，不解析 HTTP，也不执行复盘。
这些对象不包含游戏存档、地图或玩家身份。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


PROTOCOL_VERSION = 1
MAX_ATTEMPTS = 8
MAX_SQL_CHARS = 800
MAX_STAGE_OBJECTIVE_CHARS = 160
MAX_ID_CHARS = 128
MAX_HEADLINE_CHARS = 80
MAX_FACT_CHARS = 120
MAX_FOCUS_CHARS = 80
MAX_NEXT_ACTION_CHARS = 180
MAX_MESSAGE_CHARS = 240

RESULT_VALUES = frozenset({
    "correct",
    "missing-concept",
    "wrong-result",
    "syntax-error",
})
OUTCOME_VALUES = frozenset({"hit", "countered", "victory", "defeat"})
ERROR_VALUES = frozenset({"missing-concept", "wrong-result", "syntax-error"})


class ContractError(ValueError):
    """请求或输出不符合篝火 Agent 协议。"""


@dataclass(frozen=True)
class CampfireAttempt:
    """发送给 Agent 的一条当前楼层 SQL 作答记录。"""

    attempt_id: int
    lesson_id: str
    stage_id: str
    stage_objective: str
    submitted_sql: str
    result: str
    outcome: str
    hint_level: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "attemptId": self.attempt_id,
            "lessonId": self.lesson_id,
            "stageId": self.stage_id,
            "stageObjective": self.stage_objective,
            "submittedSql": self.submitted_sql,
            "result": self.result,
            "outcome": self.outcome,
            "hintLevel": self.hint_level,
        }


@dataclass(frozen=True)
class CampfireAggregate:
    """当前楼层全部作答的聚合统计。"""

    total_attempts: int
    correct_count: int
    accuracy: int
    error_counts: dict[str, int]
    hinted_attempts: int
    highest_hint_level: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "totalAttempts": self.total_attempts,
            "correctCount": self.correct_count,
            "accuracy": self.accuracy,
            "errorCounts": dict(self.error_counts),
            "hintedAttempts": self.hinted_attempts,
            "highestHintLevel": self.highest_hint_level,
        }


@dataclass(frozen=True)
class CampfireReviewRequest:
    """一次无状态的篝火复盘请求。"""

    request_id: str
    evidence_hash: str
    floor: int
    aggregate: CampfireAggregate
    attempts: tuple[CampfireAttempt, ...]

    def evidence_payload(self) -> dict[str, Any]:
        """返回不含 requestId 和 hash 的稳定证据。"""

        return {
            "floor": self.floor,
            "aggregate": self.aggregate.to_dict(),
            "attempts": [attempt.to_dict() for attempt in self.attempts],
        }


@dataclass(frozen=True)
class CampfireReviewOutput:
    """经过校验后可以返回给游戏端的复盘结果。"""

    schema_version: int
    request_id: str
    evidence_hash: str
    headline: str
    facts: tuple[str, ...]
    focus_concept: str | None
    next_action: str
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "requestId": self.request_id,
            "evidenceHash": self.evidence_hash,
            "headline": self.headline,
            "facts": list(self.facts),
            "focusConcept": self.focus_concept,
            "nextAction": self.next_action,
            "message": self.message,
        }


def is_mapping(value: Any) -> bool:
    """给校验层提供 Mapping 判断，避免把数据模型和 HTTP 绑定。"""

    return isinstance(value, Mapping)
