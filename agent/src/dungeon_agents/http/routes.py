"""HTTP 路由表。

路由层只判断请求路径，不解析业务 JSON，也不创建复盘流程。
"""

from __future__ import annotations

from urllib.parse import urlsplit


AGENT_RUN_PATH = "/v1/agent/run"


def is_agent_path(value: str) -> bool:
    """判断 URL 是否指向唯一 Agent 编排路由。"""

    return urlsplit(value).path == AGENT_RUN_PATH
