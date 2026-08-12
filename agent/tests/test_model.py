import json
import unittest

from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic_ai.models.test import TestModel

from agent.campfire.contract import CampfireAgentContent
from agent.runtime.config import Settings
from agent.shared.model import ModelRunner, normalize_base_url


class ModelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.provider = TracerProvider()
        self.exporter = InMemorySpanExporter()
        self.provider.add_span_processor(SimpleSpanProcessor(self.exporter))
        self.settings = Settings(
            api_key=None,
            endpoint="https://example.test/v1/chat/completions",
            model="test",
            timeout=4,
            max_tokens=300,
        )

    def tearDown(self) -> None:
        self.provider.shutdown()

    def test_structured_output_usage_and_content_redaction(self) -> None:
        output = {
            "headline": "本层复盘",
            "facts": ["正确率稳定"],
            "focusConcept": None,
            "nextAction": "继续练习",
            "message": "先读题再写查询。",
        }
        model = TestModel(custom_output_text=json.dumps(output, ensure_ascii=False))
        result = ModelRunner(
            self.settings,
            CampfireAgentContent,
            "system-secret",
            "campfire",
            self.provider,
            model,
        ).run("SELECT name FROM monsters -- sensitive")

        self.assertEqual(result.output.headline, "本层复盘")
        self.assertGreater(result.tokens.total or 0, 0)
        spans = self.exporter.get_finished_spans()
        self.assertTrue(any(span.name.startswith("chat ") for span in spans))
        encoded = json.dumps([dict(span.attributes) for span in spans], ensure_ascii=False)
        self.assertNotIn("system-secret", encoded)
        self.assertNotIn("SELECT name", encoded)
        self.assertNotIn("先读题", encoded)

    def test_full_chat_completion_url_is_normalized(self) -> None:
        self.assertEqual(
            normalize_base_url("https://example.test/v1/chat/completions"),
            "https://example.test/v1",
        )
        self.assertEqual(normalize_base_url("https://example.test/v1/"), "https://example.test/v1")


if __name__ == "__main__":
    unittest.main()
