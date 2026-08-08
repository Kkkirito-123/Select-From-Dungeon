"""HTTP 请求体和 JSON 响应工具。"""

from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from typing import Any


class BodyError(ValueError):
    """请求体缺失、过大或不是 JSON。"""


def read_json(handler: BaseHTTPRequestHandler, maximum: int) -> Any:
    """读取有长度上限的 JSON 请求体，不记录原始内容。"""

    content_length = handler.headers.get("Content-Length")
    try:
        body_length = int(content_length or "-1")
    except ValueError as error:
        raise BodyError("invalid content length") from error
    if body_length < 0 or body_length > maximum:
        raise BodyError("request body is too large")
    try:
        return json.loads(handler.rfile.read(body_length))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise BodyError("invalid JSON") from error


def send_json(
    handler: BaseHTTPRequestHandler,
    status: HTTPStatus,
    payload: dict[str, Any],
    allowed_origin: str,
) -> None:
    """返回不缓存的 JSON，并设置最小 CORS 头。"""

    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", allowed_origin)
    handler.send_header("Access-Control-Allow-Headers", "content-type")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)
