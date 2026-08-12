"""Agent 证据的稳定序列化和哈希计算。"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping


def canonical_json(value: Any) -> str:
    """按稳定键序列化 JSON，使 Python 和浏览器可以计算相同证据哈希。"""

    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def evidence_hash(evidence: Mapping[str, Any]) -> str:
    """计算当前楼层证据哈希，不包含 requestId。"""

    encoded = canonical_json(evidence).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
