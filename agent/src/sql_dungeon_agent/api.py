"""回环 HTTP 适配器：接收脱敏证据并返回经过契约校验的 Agent 输出。"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .contracts import AgentContext
from .pipeline import AgentPipeline
from .providers import OpenZLAgentModelAdapter

MAX_REQUEST_BYTES = 96 * 1024
LOOPBACK_ORIGIN = re.compile(r"^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?$")
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost"})


class AgentRequestHandler(BaseHTTPRequestHandler):
    """仅提供健康检查和一次性准备接口，不记录请求内容。"""

    pipeline: AgentPipeline
    allowed_origin: str | None = None

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        # 默认 HTTP 日志不得写入作答证据或模型提供方数据。
        return

    def do_OPTIONS(self) -> None:  # noqa: N802
        """处理浏览器预检，只允许受控来源继续请求。"""
        if not self._origin_allowed():
            self._write_json(HTTPStatus.FORBIDDEN, {"error": "origin-not-allowed"})
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        """提供不含敏感信息的健康检查。"""
        if self.path != "/health":
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "not-found"})
            return
        self._write_json(HTTPStatus.OK, {"status": "ok", "version": 1})

    def do_POST(self) -> None:  # noqa: N802
        """解析有界请求，交给流水线并统一返回 JSON 错误。"""
        if self.path != "/v1/prepare":
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "not-found"})
            return
        if not self._origin_allowed():
            self._write_json(HTTPStatus.FORBIDDEN, {"error": "origin-not-allowed"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_REQUEST_BYTES:
            self._write_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "invalid-size"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            context = AgentContext.from_value(payload)
            result = asyncio.run(self.pipeline.prepare(context))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            self._write_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "invalid-request", "detail": str(exc)[:240]},
            )
            return
        except Exception:
            self._write_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "prepare-failed"})
            return
        self._write_json(HTTPStatus.OK, result.to_dict())

    def _origin_allowed(self) -> bool:
        """默认只接受回环网页；公开部署必须显式配置允许来源。"""
        origin = self.headers.get("Origin")
        if origin is None:
            return True
        if self.allowed_origin is not None:
            return origin == self.allowed_origin
        return LOOPBACK_ORIGIN.fullmatch(origin) is not None

    def _cors_headers(self) -> None:
        """只为已通过来源检查的请求回写 CORS 头。"""
        origin = self.headers.get("Origin")
        if origin and self._origin_allowed():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _write_json(self, status: HTTPStatus, value: dict[str, Any]) -> None:
        """以禁止缓存的 JSON 响应结束请求，避免输出残留在代理缓存。"""
        body = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def build_server(
    *,
    host: str,
    port: int,
    pipeline: AgentPipeline,
    allowed_origin: str | None,
) -> ThreadingHTTPServer:
    """创建回环服务；拒绝绑定公网地址，防止误把开发服务公开。"""
    if host not in LOOPBACK_HOSTS:
        raise ValueError("Agent server host must be 127.0.0.1 or localhost")

    class BoundHandler(AgentRequestHandler):
        pass

    BoundHandler.pipeline = pipeline
    BoundHandler.allowed_origin = allowed_origin
    return ThreadingHTTPServer((host, port), BoundHandler)


def main() -> None:
    """读取受控命令行参数并启动 Agent 服务。"""
    parser = argparse.ArgumentParser(description="Run the SQL Dungeon output-only Agent.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--allowed-origin", default=None)
    args = parser.parse_args()
    model = OpenZLAgentModelAdapter.from_environment()
    server = build_server(
        host=args.host,
        port=args.port,
        pipeline=AgentPipeline(model),
        allowed_origin=args.allowed_origin,
    )
    print(f"SQL Dungeon Agent listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
