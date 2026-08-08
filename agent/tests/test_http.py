import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from agent.http.server import REVIEW_PATH, create_server
from agent.tests.test_campfire_contract import request_payload


class CampfireHttpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = create_server(port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.url = f"http://{host}:{port}{REVIEW_PATH}"

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

    def test_review_endpoint_returns_validated_output(self) -> None:
        status, result = self.post(request_payload())

        self.assertEqual(status, 200)
        self.assertEqual(result["requestId"], "request-1")
        self.assertIn("message", result)
        self.assertNotIn("answerSql", result)

    def test_unknown_path_and_invalid_request_are_rejected(self) -> None:
        request = Request(
            self.url.replace(REVIEW_PATH, "/unknown"),
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with self.assertRaises(HTTPError) as context:
            urlopen(request, timeout=2)
        self.assertEqual(context.exception.code, 404)

        status, result = self.post({"protocolVersion": 1})
        self.assertEqual(status, 400)
        self.assertEqual(result, {"error": "invalid_request"})


if __name__ == "__main__":
    unittest.main()
