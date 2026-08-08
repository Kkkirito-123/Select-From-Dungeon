import json
import unittest

from agent.providers.deepseek import DeepSeekGenerator
from agent.runtime.config import Settings
from agent.tests.test_campfire_contract import request_payload
from agent.contracts.campfire import parse_request


class FakeResponse:
    def __init__(self, value: object) -> None:
        self.value = value

    def __enter__(self):
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.value, ensure_ascii=False).encode("utf-8")


class DeepSeekTests(unittest.TestCase):
    def test_provider_sends_bounded_evidence_and_binds_request_identity(self) -> None:
        captured: dict[str, object] = {}

        def opener(request, timeout):
            captured["headers"] = dict(request.header_items())
            captured["timeout"] = timeout
            captured["body"] = json.loads(request.data)
            return FakeResponse({
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "headline": "本层复盘",
                            "facts": ["正确率稳定"],
                            "focusConcept": None,
                            "nextAction": "继续练习",
                            "message": "先读题再写查询。",
                        }, ensure_ascii=False),
                    },
                }],
            })

        settings = Settings(
            api_key="sk-test-only",
            endpoint="https://example.test/chat/completions",
            model="deepseek-chat",
            timeout=4.0,
            max_tokens=300,
        )
        result = DeepSeekGenerator(settings, opener).generate(parse_request(request_payload()))

        self.assertEqual(result.headline, "本层复盘")
        self.assertEqual(captured["timeout"], 4.0)
        body = captured["body"]
        self.assertNotIn("answerSql", repr(body))
        self.assertNotIn("sk-test-only", repr(body))

    def test_invalid_model_json_is_rejected(self) -> None:
        settings = Settings(
            api_key="sk-test-only",
            endpoint="https://example.test/chat/completions",
            model="deepseek-chat",
            timeout=4.0,
            max_tokens=300,
        )

        def opener(_request, timeout):
            self.assertEqual(timeout, 4.0)
            return FakeResponse({"choices": [{"message": {"content": "not-json"}}]})

        with self.assertRaises(RuntimeError):
            DeepSeekGenerator(settings, opener).generate(parse_request(request_payload()))


if __name__ == "__main__":
    unittest.main()
