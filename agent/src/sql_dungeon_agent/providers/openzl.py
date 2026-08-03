"""OpenZLAgent 最小适配器：无工具、无记忆、无游戏写入权限。"""

from __future__ import annotations

import os
from typing import Any


class OpenZLAgentModelAdapter:
    """把 OpenZLAgent 的模型客户端收敛到只返回 JSON 文本的接口。"""

    def __init__(self, client: Any, message_type: type[Any]) -> None:
        self._client = client
        self._message_type = message_type

    @classmethod
    def from_environment(cls) -> "OpenZLAgentModelAdapter | None":
        """从环境变量创建适配器；未配置模型时保持纯本地模式。"""
        base_url = os.environ.get("SQL_DUNGEON_AGENT_MODEL_BASE_URL", "").strip()
        model = os.environ.get("SQL_DUNGEON_AGENT_MODEL_NAME", "").strip()
        if not base_url and not model:
            return None
        if not base_url or not model:
            raise ValueError(
                "SQL_DUNGEON_AGENT_MODEL_BASE_URL and "
                "SQL_DUNGEON_AGENT_MODEL_NAME must be configured together"
            )
        try:
            from re_zlagent.harness.model import (  # type: ignore[import-not-found]
                ModelMessage,
                OpenAICompatibleModelClient,
            )
        except ImportError:
            return None
        client = OpenAICompatibleModelClient(
            base_url=base_url,
            model=model,
            api_key=os.environ.get("SQL_DUNGEON_AGENT_API_KEY", ""),
            timeout_seconds=float(os.environ.get("SQL_DUNGEON_AGENT_MODEL_TIMEOUT", "3.0")),
            temperature=0.2,
            max_tokens=360,
        )
        return cls(client, ModelMessage)

    async def complete_json(self, *, system: str, user: str) -> str:
        """以固定低温度和短上限请求 JSON，不启用工具或多轮会话。"""
        messages = (
            self._message_type(role="system", content=system),
            self._message_type(role="user", content=user),
        )
        complete_with_options = getattr(self._client, "complete_with_options", None)
        if complete_with_options is not None:
            response = await complete_with_options(
                messages,
                max_tokens=360,
                response_format="json_object",
            )
        else:
            response = await self._client.complete(messages)
        return str(response.content)
