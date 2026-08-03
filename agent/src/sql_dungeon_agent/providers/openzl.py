"""Minimal OpenZLAgent adapter with no tools, memory, or game write access."""

from __future__ import annotations

import os
from typing import Any


class OpenZLAgentModelAdapter:
    def __init__(self, client: Any, message_type: type[Any]) -> None:
        self._client = client
        self._message_type = message_type

    @classmethod
    def from_environment(cls) -> "OpenZLAgentModelAdapter | None":
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
