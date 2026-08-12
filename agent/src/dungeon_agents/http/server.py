"""无状态 Agent HTTP 服务。"""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from opentelemetry.sdk.trace import TracerProvider

from dungeon_agents.campfire.flow import CampfireFlow, create_model as create_campfire_model
from dungeon_agents.http.response import BodyError, read_json, send_json
from dungeon_agents.http.routes import AGENT_RUN_PATH, is_agent_path
from dungeon_agents.main.flow import MainFlow, create_model as create_main_model
from dungeon_agents.runtime.config import load_child, load_main
from dungeon_agents.scribe.flow import ScribeFlow, create_model as create_scribe_model
from dungeon_agents.shared.errors import ContractError
from dungeon_agents.shared.telemetry import tracer_provider


MAX_BODY_BYTES = 128 * 1024


def create_server(
    host: str = "127.0.0.1",
    port: int = 8787,
    allowed_origin: str = "*",
    flow: MainFlow | None = None,
    provider: TracerProvider | None = None,
) -> ThreadingHTTPServer:
    """创建可测试服务；未注入流程时使用完整的确定性回退链。"""

    trace_provider = provider or tracer_provider()
    agent_flow = flow or MainFlow(provider=trace_provider)

    class RequestHandler(BaseHTTPRequestHandler):
        server_version = "DungeonAgent/1"

        def reply(self, status: HTTPStatus, payload: dict[str, object]) -> None:
            send_json(self, status, payload, allowed_origin)

        def is_route(self) -> bool:
            return is_agent_path(self.path)

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.reply(HTTPStatus.NO_CONTENT if self.is_route() else HTTPStatus.NOT_FOUND, {})

        def do_POST(self) -> None:  # noqa: N802
            if not self.is_route():
                self.reply(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            try:
                payload = read_json(self, MAX_BODY_BYTES)
                result = agent_flow.run(payload)
            except BodyError:
                self.reply(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "request_too_large"})
                return
            except ContractError:
                self.reply(HTTPStatus.BAD_REQUEST, {"error": "invalid_request"})
                return
            except Exception:
                self.reply(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "agent_unavailable"})
                return
            self.reply(HTTPStatus.OK, result)

        def log_message(self, _format: str, *_args: object) -> None:
            return

    return ThreadingHTTPServer((host, port), RequestHandler)


def configured_flow(provider: TracerProvider) -> MainFlow:
    """装配一个服务和三个角色；没有密钥的角色自动使用本地规则。"""

    child_settings = load_child()
    main_settings = load_main()
    campfire = CampfireFlow(
        create_campfire_model(child_settings, provider) if child_settings.api_key else None,
    )
    scribe = ScribeFlow(
        create_scribe_model(child_settings, provider) if child_settings.api_key else None,
    )
    return MainFlow(
        create_main_model(main_settings, provider) if main_settings.api_key else None,
        campfire,
        scribe,
        provider,
    )


def serve(host: str = "127.0.0.1", port: int = 8787, allowed_origin: str = "*") -> None:
    provider = tracer_provider()
    server = create_server(host, port, allowed_origin, configured_flow(provider), provider)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        provider.shutdown()


def main() -> None:
    parser = argparse.ArgumentParser(description="SQL 魔王城 Agent 服务")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--allowed-origin", default="*")
    args = parser.parse_args()
    serve(args.host, args.port, args.allowed_origin)


if __name__ == "__main__":
    main()


__all__ = [
    "AGENT_RUN_PATH",
    "create_server",
    "serve",
]
