"""触发记录存储接口和内存实现。"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timezone
import json
from typing import Protocol


@dataclass(frozen=True)
class Record:
    """一次 Agent 触发的元数据和已校验输出。

    ``result`` 只允许保存输出结果，不保存原始 SQL、完整快照或模型提示词。
    """

    trigger_id: str
    trigger_type: str
    scope: str
    floor: int
    evidence_hash: str
    status: str
    retry_count: int = 0
    created_at: str = ""
    updated_at: str = ""
    error_code: str | None = None
    result: dict[str, object] | None = None

    def with_now(self, **changes: object) -> "Record":
        now = datetime.now(timezone.utc).isoformat()
        if not self.created_at:
            changes.setdefault("created_at", now)
        changes["updated_at"] = now
        return replace(self, **changes)


class Store(Protocol):
    """触发状态的最小持久化接口。"""

    def get(self, trigger_id: str) -> Record | None:
        """按触发 ID 读取记录。"""

    def put(self, record: Record) -> None:
        """新增或更新触发记录。"""

    def find(self, scope: str, floor: int, evidence_hash: str) -> Record | None:
        """按证据查找已处理记录，用于跨进程去重。"""


class MemoryStore:
    """测试和单进程运行使用的非持久化 Store。"""

    def __init__(self) -> None:
        self._records: dict[str, Record] = {}

    def get(self, trigger_id: str) -> Record | None:
        return self._records.get(trigger_id)

    def put(self, record: Record) -> None:
        self._records[record.trigger_id] = record

    def find(self, scope: str, floor: int, evidence_hash: str) -> Record | None:
        return next(
            (
                record
                for record in self._records.values()
                if record.scope == scope
                and record.floor == floor
                and record.evidence_hash == evidence_hash
            ),
            None,
        )

    def values(self) -> tuple[Record, ...]:
        """返回只读测试快照。"""

        return tuple(self._records.values())


def encode_result(result: dict[str, object] | None) -> str | None:
    """把已校验输出编码为 JSON；不接受任意 Python 对象。"""

    return None if result is None else json.dumps(result, ensure_ascii=False, separators=(",", ":"))


def decode_result(value: str | None) -> dict[str, object] | None:
    """从存储读取输出 JSON，损坏数据按空结果处理。"""

    if value is None:
        return None
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError:
        return None
    return decoded if isinstance(decoded, dict) else None
