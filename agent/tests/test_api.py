from __future__ import annotations

import json
import threading
import unittest
from urllib import error, request

from sql_dungeon_agent.api import build_server
from sql_dungeon_agent.pipeline import AgentPipeline


def payload() -> dict[str, object]:
    return {
        "requestVersion": 2,
        "runId": "run-api-test",
        "floor": 1,
        "evidenceHash": "ev-api-test",
        "trigger": {"type": "floor-start", "phase": "opening", "floor": 1},
        "navigation": {
            "objectiveRoomId": None,
            "objectiveTitle": None,
            "level": 0,
            "direction": None,
            "distance": None,
        },
        "campfireUnlocked": False,
        "defeatedEliteIds": [],
        "attempts": [],
        "completedLessons": [],
        "worldChanges": [],
        "relics": [],
        "story": None,
    }


class AgentApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = build_server(
            host="127.0.0.1",
            port=0,
            pipeline=AgentPipeline(),
            allowed_origin=None,
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.url = f"http://{host}:{port}/v1/prepare"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def post(self, value: object, *, origin: str = "http://localhost:5173"):
        body = json.dumps(value).encode("utf-8")
        return request.urlopen(
            request.Request(
                self.url,
                data=body,
                headers={"Content-Type": "application/json", "Origin": origin},
                method="POST",
            ),
            timeout=2,
        )

    def test_loopback_request_returns_closed_fallback_output(self) -> None:
        with self.post(payload()) as response:
            value = json.loads(response.read())
        self.assertEqual(value["source"], "local")
        self.assertEqual(value["evidenceHash"], "ev-api-test")
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "http://localhost:5173")

    def test_non_loopback_origin_is_rejected(self) -> None:
        with self.assertRaises(error.HTTPError) as raised:
            self.post(payload(), origin="https://example.com")
        self.assertEqual(raised.exception.code, 403)

    def test_server_rejects_non_loopback_bind_host(self) -> None:
        with self.assertRaisesRegex(ValueError, "must be 127.0.0.1 or localhost"):
            build_server(
                host="0.0.0.0",
                port=0,
                pipeline=AgentPipeline(),
                allowed_origin=None,
            )


if __name__ == "__main__":
    unittest.main()
