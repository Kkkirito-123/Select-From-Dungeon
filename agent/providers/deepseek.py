"""DeepSeek 复盘生成器。

适配器只发送已通过契约校验的当前楼层证据，并把模型输出交回统一的
``parse_output`` 校验。网络失败、JSON 非法或输出越界由上层回退本地生成器。
"""

from __future__ import annotations

from collections.abc import Callable
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from agent.contracts.campfire import (
    CampfireReviewOutput,
    CampfireReviewRequest,
    ContractError,
    canonical_json,
    parse_output,
)
from agent.runtime.config import Settings


class ProviderError(RuntimeError):
    """模型请求失败或返回内容无法解析。"""


class DeepSeekGenerator:
    """使用 DeepSeek Chat Completions 生成当前楼层复盘文案。"""

    def __init__(
        self,
        settings: Settings,
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        if not settings.api_key:
            raise ValueError("DEEPSEEK_API_KEY is required")
        self._settings = settings
        self._opener = opener

    def generate(self, request: CampfireReviewRequest) -> CampfireReviewOutput:
        evidence = canonical_json(request.evidence_payload())
        body = {
            "model": self._settings.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是 SQL 魔王城的篝火复盘员。只分析当前楼层 SQL 作答，"
                        "返回 JSON，不要 HTML、脚本、工具调用、游戏指令或完整答案 SQL。"
                        "JSON 必须包含 headline、facts、focusConcept、nextAction、message；"
                        "facts 最多 3 条，focusConcept 可以为 null。"
                    ),
                },
                {
                    "role": "user",
                    "content": f"当前楼层证据：{evidence}",
                },
            ],
            "temperature": 0.2,
            "max_tokens": self._settings.max_tokens,
            "stream": False,
            "response_format": {"type": "json_object"},
        }
        request_body = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        http_request = Request(
            self._settings.endpoint,
            data=request_body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._settings.api_key}",
            },
            method="POST",
        )
        try:
            with self._opener(http_request, timeout=self._settings.timeout) as response:
                decoded = json.loads(response.read())
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
            raise ProviderError("DeepSeek request failed") from error

        try:
            content = decoded["choices"][0]["message"]["content"]
            candidate = self._parse_content(content)
            # 身份字段由服务端绑定当前请求，模型不能伪造其他请求的结果。
            candidate["schemaVersion"] = 1
            candidate["requestId"] = request.request_id
            candidate["evidenceHash"] = request.evidence_hash
            return parse_output(candidate, request)
        except (KeyError, IndexError, TypeError, ValueError, ContractError) as error:
            raise ProviderError("DeepSeek output is invalid") from error

    @staticmethod
    def _parse_content(content: object) -> dict[str, object]:
        if not isinstance(content, str):
            raise ValueError("model content must be text")
        text = content.strip()
        if text.startswith("```") and text.endswith("```"):
            text = text[3:-3].strip()
            if text.lower().startswith("json"):
                text = text[4:].lstrip()
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise ValueError("model content must be an object")
        return parsed
