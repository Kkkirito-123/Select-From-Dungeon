"""Agent HTTP 与模型输出共用的严格字段。"""

from __future__ import annotations

import re
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel


_FORBIDDEN_TEXT = re.compile(
    r"<[^>]*>|javascript:|tool_call|function_call|<script",
    re.IGNORECASE,
)


class StrictModel(BaseModel):
    """拒绝额外字段和隐式类型转换，并使用现有 camelCase 协议。"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        populate_by_name=True,
        serialize_by_alias=True,
        strict=True,
    )


def _plain(value: str) -> str:
    if not value.strip() or "\x00" in value or _FORBIDDEN_TEXT.search(value):
        raise ValueError("text must be non-empty plain text")
    return value


def plain_text(max_length: int) -> Any:
    """返回带长度和纯文本限制的 Pydantic 字段类型。"""

    return Annotated[
        str,
        StringConstraints(min_length=1, max_length=max_length),
        AfterValidator(_plain),
    ]


Hash = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
Id = plain_text(128)
