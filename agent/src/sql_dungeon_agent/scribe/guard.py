"""抄写员输出守卫：严格解析为一个闭合的 JSON 对象。"""

from __future__ import annotations

import json

from ..contracts import AgentContext, ScribeOutput


def parse_scribe_json(raw: str, context: AgentContext) -> ScribeOutput:
    """拒绝超长文本、Markdown 围栏和非法 JSON，再交给字段契约校验。"""
    if not isinstance(raw, str) or len(raw) > 8_000:
        raise ValueError("model output is missing or oversized")
    if raw.lstrip().startswith("```"):
        raise ValueError("model output must not use a Markdown fence")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("model output is not valid JSON") from exc
    return ScribeOutput.from_value(value, context)
