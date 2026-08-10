"""游戏辅助 Agent HTTP 入口。

本模块只负责生命周期和状态码映射；路由、请求体读取、契约校验及复盘流程
分别属于 ``routes``、``response``、``contracts`` 和 ``flows``。
"""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from agent.contracts.campfire import ContractError
from agent.flows.review import DeterministicGenerator, FallbackGenerator, Generator, ReviewFlow
from agent.flows.scribe import Generator as ScribeGenerator
from agent.flows.scribe import ScribeFlow
from agent.http.response import BodyError, read_json, send_json
from agent.http.routes import REVIEW_PATH, is_review_path, is_scribe_path
from agent.providers.deepseek import DeepSeekGenerator
from agent.runtime.config import load
from agent.storage.repo import Store
from agent.storage.sqlite import SQLiteStore


MAX_BODY_BYTES = 128 * 1024


def create_server(
    host: str = "127.0.0.1",
    port: int = 8787,
    generator: Generator | None = None,
    allowed_origin: str = "*",
    store: Store | None = None,
    scribe_generator: ScribeGenerator | None = None,
) -> ThreadingHTTPServer:
    """创建可测试的 HTTP 服务，不自动启动线程。"""

    # 直接创建的服务保持确定性，方便单元测试；正式 serve() 才读取模型配置。
    flow = ReviewFlow(generator or DeterministicGenerator(), store)
    scribe_flow = ScribeFlow(scribe_generator, store)

    class RequestHandler(BaseHTTPRequestHandler):
        server_version = "DungeonAgent/1"

        def reply(self, status: HTTPStatus, payload: dict[str, object]) -> None:
            send_json(self, status, payload, allowed_origin)

        def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            if not is_review_path(self.path) and not is_scribe_path(self.path):
                self.reply(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            self.reply(HTTPStatus.NO_CONTENT, {})

        def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            if not is_review_path(self.path) and not is_scribe_path(self.path):
                self.reply(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            try:
                payload = read_json(self, MAX_BODY_BYTES)
                result = scribe_flow.run(payload) if is_scribe_path(self.path) else flow.run(payload)
            except BodyError:
                self.reply(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "request_too_large"})
                return
            except ContractError:
                self.reply(HTTPStatus.BAD_REQUEST, {"error": "invalid_request"})
                return
            except Exception:
                error_code = "scribe_unavailable" if is_scribe_path(self.path) else "review_unavailable"
                self.reply(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": error_code})
                return
            self.reply(HTTPStatus.OK, result)

        def log_message(self, _format: str, *_args: object) -> None:
            # 不写默认访问日志，避免未来把请求内容带入日志系统。
            return

    return ThreadingHTTPServer((host, port), RequestHandler)


def default_generator() -> Generator:
    """有服务端 Key 时启用 DeepSeek，否则保持本地确定性复盘。"""

    settings = load()
    if settings.api_key is None:
        return DeterministicGenerator()
    return FallbackGenerator(DeepSeekGenerator(settings))


def serve(
    host: str = "127.0.0.1",
    port: int = 8787,
    allowed_origin: str = "*",
    db_path: str | None = None,
) -> None:
    """启动服务；只有显式传入 db_path 才启用 Agent 专用 SQLite。"""

    store = SQLiteStore(db_path) if db_path else None
    server = create_server(
        host=host,
        port=port,
        allowed_origin=allowed_origin,
        generator=default_generator(),
        store=store,
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()
        if isinstance(store, SQLiteStore):
            store.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="SQL 魔王城 Agent 服务")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--allowed-origin", default="*")
    parser.add_argument("--db", default=None, help="可选的 Agent 专用 SQLite 文件路径")
    args = parser.parse_args()
    serve(args.host, args.port, args.allowed_origin, args.db)


if __name__ == "__main__":
    main()
