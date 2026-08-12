"""无状态 Agent HTTP 服务。"""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from opentelemetry.sdk.trace import TracerProvider

from agent.campfire.flow import ReviewFlow, create_model as create_campfire_model
from agent.director.flow import DirectorFlow, create_model as create_director_model
from agent.http.response import BodyError, read_json, send_json
from agent.http.routes import (
    DIRECTOR_RUN_PATH,
    REVIEW_PATH,
    SCRIBE_RESPONSE_PATH,
    is_director_path,
    is_review_path,
    is_scribe_path,
)
from agent.runtime.config import load, load_director
from agent.scribe.flow import ScribeFlow, create_model as create_scribe_model
from agent.shared.errors import ContractError
from agent.shared.telemetry import tracer_provider


MAX_BODY_BYTES = 128 * 1024


def create_server(
    host: str = "127.0.0.1",
    port: int = 8787,
    allowed_origin: str = "*",
    campfire: ReviewFlow | None = None,
    scribe: ScribeFlow | None = None,
    director: DirectorFlow | None = None,
    provider: TracerProvider | None = None,
) -> ThreadingHTTPServer:
    """创建可测试服务；未注入流程时全部使用确定性回退。"""

    trace_provider = provider or tracer_provider()
    campfire_flow = campfire or ReviewFlow(provider=trace_provider)
    scribe_flow = scribe or ScribeFlow(provider=trace_provider)
    director_flow = director or DirectorFlow(
        campfire_flow=campfire_flow,
        scribe_flow=scribe_flow,
        provider=trace_provider,
    )

    class RequestHandler(BaseHTTPRequestHandler):
        server_version = "DungeonAgent/2"

        def reply(self, status: HTTPStatus, payload: dict[str, object]) -> None:
            send_json(self, status, payload, allowed_origin)

        def is_route(self) -> bool:
            return is_review_path(self.path) or is_scribe_path(self.path) or is_director_path(self.path)

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.reply(HTTPStatus.NO_CONTENT if self.is_route() else HTTPStatus.NOT_FOUND, {})

        def do_POST(self) -> None:  # noqa: N802
            if not self.is_route():
                self.reply(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            try:
                payload = read_json(self, MAX_BODY_BYTES)
                if is_director_path(self.path):
                    result = director_flow.run(payload)
                elif is_scribe_path(self.path):
                    result = scribe_flow.run(payload)
                else:
                    result = campfire_flow.run(payload)
            except BodyError:
                self.reply(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "request_too_large"})
                return
            except ContractError:
                self.reply(HTTPStatus.BAD_REQUEST, {"error": "invalid_request"})
                return
            except Exception:
                code = (
                    "director_unavailable" if is_director_path(self.path)
                    else "scribe_unavailable" if is_scribe_path(self.path)
                    else "review_unavailable"
                )
                self.reply(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": code})
                return
            self.reply(HTTPStatus.OK, result)

        def log_message(self, _format: str, *_args: object) -> None:
            return

    return ThreadingHTTPServer((host, port), RequestHandler)


def configured_flows(provider: TracerProvider) -> tuple[ReviewFlow, ScribeFlow, DirectorFlow]:
    child_settings = load()
    main_settings = load_director()
    campfire = ReviewFlow(
        create_campfire_model(child_settings, provider) if child_settings.api_key else None,
        provider,
    )
    scribe = ScribeFlow(
        create_scribe_model(child_settings, provider) if child_settings.api_key else None,
        provider,
    )
    director = DirectorFlow(
        create_director_model(main_settings, provider) if main_settings.api_key else None,
        campfire,
        scribe,
        provider,
    )
    return campfire, scribe, director


def serve(host: str = "127.0.0.1", port: int = 8787, allowed_origin: str = "*") -> None:
    provider = tracer_provider()
    campfire, scribe, director = configured_flows(provider)
    server = create_server(host, port, allowed_origin, campfire, scribe, director, provider)
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
    "DIRECTOR_RUN_PATH",
    "REVIEW_PATH",
    "SCRIBE_RESPONSE_PATH",
    "create_server",
    "serve",
]
