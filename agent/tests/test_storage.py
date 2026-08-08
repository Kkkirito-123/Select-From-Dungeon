import unittest

from agent.flows.review import ReviewFlow
from agent.storage.repo import MemoryStore, Record
from agent.storage.sqlite import SQLiteStore
from agent.tests.test_campfire_contract import request_payload


class AgentStorageTests(unittest.TestCase):
    def test_memory_store_finds_by_evidence_without_raw_sql(self) -> None:
        store = MemoryStore()
        record = Record(
            trigger_id="trigger-1",
            trigger_type="review",
            scope="campfire",
            floor=1,
            evidence_hash="a" * 64,
            status="ready",
            result={"message": "复盘"},
        ).with_now()

        store.put(record)

        found = store.find("campfire", 1, "a" * 64)
        self.assertIsNotNone(found)
        self.assertEqual(found.result, {"message": "复盘"})
        self.assertNotIn("SELECT", repr(found))

    def test_sqlite_store_round_trip(self) -> None:
        store = SQLiteStore(":memory:")
        try:
            record = Record(
                trigger_id="trigger-1",
                trigger_type="review",
                scope="campfire",
                floor=2,
                evidence_hash="b" * 64,
                status="fallback",
                error_code="timeout",
            ).with_now()
            store.put(record)

            found = store.get("trigger-1")
            self.assertIsNotNone(found)
            self.assertEqual(found.status, "fallback")
            self.assertEqual(found.error_code, "timeout")
        finally:
            store.close()

    def test_review_flow_reuses_validated_output_for_same_evidence(self) -> None:
        class CountingGenerator:
            def __init__(self) -> None:
                self.calls = 0

            def generate(self, request):
                self.calls += 1
                from agent.flows.review import DeterministicGenerator

                return DeterministicGenerator().generate(request)

        store = MemoryStore()
        generator = CountingGenerator()
        flow = ReviewFlow(generator=generator, store=store)
        payload = request_payload()

        first = flow.run(payload)
        second = flow.run(payload)

        self.assertEqual(first, second)
        self.assertEqual(generator.calls, 1)
        self.assertEqual(len(store.values()), 1)


if __name__ == "__main__":
    unittest.main()
