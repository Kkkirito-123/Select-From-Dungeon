"""Strictly parse model prose as one closed Scribe output object."""

from __future__ import annotations

import json

from ..contracts import AgentContext, ScribeOutput


def parse_scribe_json(raw: str, context: AgentContext) -> ScribeOutput:
    if not isinstance(raw, str) or len(raw) > 8_000:
        raise ValueError("model output is missing or oversized")
    if raw.lstrip().startswith("```"):
        raise ValueError("model output must not use a Markdown fence")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("model output is not valid JSON") from exc
    return ScribeOutput.from_value(value, context)
