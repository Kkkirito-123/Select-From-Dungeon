import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from agent.http.routes import SCRIBE_RESPONSE_PATH
from agent.http.server import create_server
from agent.tests.test_scribe_contract import request_payload


class ScribeHttpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = create_server(port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.url = f"http://{host}:{port}{SCRIBE_RESPONSE_PATH}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_scribe_endpoint_returns_validated_output(self) -> None:
        request = Request(
            self.url,
            data=json.dumps(request_payload(), ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=2) as response:
            result = json.loads(response.read())

        self.assertEqual(response.status, 200)
        self.assertEqual(result["requestId"], "scribe-request-1")
        self.assertIn("message", result)
        self.assertNotIn("answerSql", result)

    def test_scribe_endpoint_rejects_invalid_scene(self) -> None:
        payload = request_payload()
        payload["scene"] = "free-chat"
        request = Request(
            self.url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with self.assertRaises(HTTPError) as context:
            urlopen(request, timeout=2)

        self.assertEqual(context.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
