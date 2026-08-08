"""Agent 触发记录的 SQLite 实现。

这是可选的专用数据库，不与游戏浏览器存档共享。默认 HTTP 服务不创建文件；
只有显式传入数据库路径时才启用。
"""

from __future__ import annotations

import sqlite3

from agent.storage.repo import Record, Store, decode_result, encode_result


class SQLiteStore(Store):
    """保存触发状态、重试次数和已校验输出，不保存原始 SQL。"""

    def __init__(self, path: str) -> None:
        self._connection = sqlite3.connect(path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_trigger (
                trigger_id TEXT PRIMARY KEY,
                trigger_type TEXT NOT NULL,
                scope TEXT NOT NULL,
                floor INTEGER NOT NULL,
                evidence_hash TEXT NOT NULL,
                status TEXT NOT NULL,
                retry_count INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                error_code TEXT,
                result_json TEXT
            )
            """
        )
        self._connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_trigger_evidence "
            "ON agent_trigger(scope, floor, evidence_hash)"
        )
        self._connection.commit()

    def get(self, trigger_id: str) -> Record | None:
        row = self._connection.execute(
            "SELECT * FROM agent_trigger WHERE trigger_id = ?",
            (trigger_id,),
        ).fetchone()
        return self._from_row(row) if row else None

    def put(self, record: Record) -> None:
        prepared = record.with_now()
        self._connection.execute(
            """
            INSERT INTO agent_trigger (
                trigger_id, trigger_type, scope, floor, evidence_hash, status,
                retry_count, created_at, updated_at, error_code, result_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(trigger_id) DO UPDATE SET
                trigger_type = excluded.trigger_type,
                scope = excluded.scope,
                floor = excluded.floor,
                evidence_hash = excluded.evidence_hash,
                status = excluded.status,
                retry_count = excluded.retry_count,
                updated_at = excluded.updated_at,
                error_code = excluded.error_code,
                result_json = excluded.result_json
            """,
            (
                prepared.trigger_id,
                prepared.trigger_type,
                prepared.scope,
                prepared.floor,
                prepared.evidence_hash,
                prepared.status,
                prepared.retry_count,
                prepared.created_at,
                prepared.updated_at,
                prepared.error_code,
                encode_result(prepared.result),
            ),
        )
        self._connection.commit()

    def find(self, scope: str, floor: int, evidence_hash: str) -> Record | None:
        row = self._connection.execute(
            """
            SELECT * FROM agent_trigger
            WHERE scope = ? AND floor = ? AND evidence_hash = ?
            ORDER BY updated_at DESC LIMIT 1
            """,
            (scope, floor, evidence_hash),
        ).fetchone()
        return self._from_row(row) if row else None

    def close(self) -> None:
        """关闭专用 Agent 数据库连接。"""

        self._connection.close()

    @staticmethod
    def _from_row(row: sqlite3.Row) -> Record:
        return Record(
            trigger_id=row["trigger_id"],
            trigger_type=row["trigger_type"],
            scope=row["scope"],
            floor=row["floor"],
            evidence_hash=row["evidence_hash"],
            status=row["status"],
            retry_count=row["retry_count"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            error_code=row["error_code"],
            result=decode_result(row["result_json"]),
        )
