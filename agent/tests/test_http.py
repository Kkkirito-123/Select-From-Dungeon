import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from dungeon_agents.http.server import AGENT_RUN_PATH, create_server
from test_main import campfire_agent_payload


class AgentHttpBoundaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = create_server(port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.base = f"http://{host}:{port}"
        self.url = f"{self.base}{AGENT_RUN_PATH}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def post(self, payload: object) -> tuple[int, dict[str, object]]:
        request = Request(
            self.url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=2) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_agent_endpoint_returns_validated_output(self) -> None:
        status, result = self.post(campfire_agent_payload())

        self.assertEqual(status, 200)
        self.assertEqual(result["requestId"], "agent-campfire-1")
        self.assertIn("main", result)
        self.assertNotIn("answerSql", result)

    def test_old_and_unknown_paths_are_not_routes(self) -> None:
        for path in ("/v1/campfire/review", "/v1/scribe/respond", "/v1/director/run", "/unknown"):
            with self.subTest(path=path):
                request = Request(
                    f"{self.base}{path}",
                    data=b"{}",
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with self.assertRaises(HTTPError) as context:
                    urlopen(request, timeout=2)
                self.assertEqual(context.exception.code, 404)

    def test_invalid_request_is_rejected(self) -> None:
        status, result = self.post({"protocolVersion": 1})
        self.assertEqual(status, 400)
        self.assertEqual(result, {"error": "invalid_request"})


if __name__ == "__main__":
    unittest.main()
