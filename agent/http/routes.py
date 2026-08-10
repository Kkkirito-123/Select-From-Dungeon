"""HTTP 路由表。

路由层只判断请求路径，不解析业务 JSON，也不创建复盘流程。
"""

from __future__ import annotations

from urllib.parse import urlsplit


REVIEW_PATH = "/v1/campfire/review"
SCRIBE_RESPONSE_PATH = "/v1/scribe/respond"


def is_review_path(value: str) -> bool:
    """判断 URL 是否指向当前唯一的篝火复盘路由。"""

    return urlsplit(value).path == REVIEW_PATH


def is_scribe_path(value: str) -> bool:
    """判断 URL 是否指向抄写员场景响应路由。"""

    return urlsplit(value).path == SCRIBE_RESPONSE_PATH
