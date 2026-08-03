"""验证 Agent 协议、篝火事实和模型失败降级边界。"""

from __future__ import annotations

import json
import unittest

from sql_dungeon_agent.campfire import analyze_campfire
from sql_dungeon_agent.contracts import AgentContext, ScribeOutput
from sql_dungeon_agent.pipeline import AgentPipeline


def request_payload(
    *,
    attempts: list[dict[str, object]] | None = None,
    campfire_unlocked: bool = False,
) -> dict[str, object]:
    """构造与浏览器协议一致的最小测试请求。"""
    return {
        "requestVersion": 2,
        "runId": "run-abcd1234",
        "floor": 1,
        "evidenceHash": "ev-1234abcd",
        "trigger": {
            "type": "route-guidance",
            "phase": "route",
            "floor": 1,
            "objectiveRoomId": "floor-1-lesson-1",
            "objectiveTitle": "筛选门",
            "level": 1,
            "direction": "east",
            "distance": 10,
        },
        "navigation": {
            "objectiveRoomId": "floor-1-lesson-1",
            "objectiveTitle": "筛选门",
            "level": 1,
            "direction": "east",
            "distance": 10,
        },
        "campfireUnlocked": campfire_unlocked,
        "defeatedEliteIds": [4] if campfire_unlocked else [],
        "attempts": attempts or [],
        "completedLessons": ["select"],
        "worldChanges": ["wheel:stalled→turning"],
        "relics": [
            {
                "id": "schema-eye",
                "name": "Schema 之眼",
                "description": "显示一次字段提示。",
            }
        ],
        "story": {
            "beatId": "story:f1-scribe",
            "title": "火边的记录",
            "lines": ["她把新页放在旧页之后。"],
        },
    }


def attempt(
    attempt_id: int = 1,
    *,
    result: str = "wrong-result",
    hint_level: int = 1,
) -> dict[str, object]:
    """构造不包含原始 SQL 的单条作答证据。"""
    return {
        "attemptId": attempt_id,
        "lessonId": "where",
        "stageId": "where-target",
        "objective": "只保留目标记录",
        "sqlFeatures": ["SELECT", "FROM"],
        "result": result,
        "outcome": "countered" if result != "correct" else "hit",
        "hintLevel": hint_level,
    }


class FakeModel:
    """记录调用并返回固定文本，避免测试依赖真实模型服务。"""
    def __init__(self, response: str) -> None:
        self.response = response
        self.calls: list[tuple[str, str]] = []

    async def complete_json(self, *, system: str, user: str) -> str:
        self.calls.append((system, user))
        return self.response


class AgentContractTests(unittest.TestCase):
    """验证闭合字段、证据引用和八条证据上限。"""
    def test_input_is_closed_and_bounded_to_eight_attempts(self) -> None:
        payload = request_payload(attempts=[attempt(index) for index in range(9)])
        with self.assertRaisesRegex(ValueError, "at most 8"):
            AgentContext.from_value(payload)

        payload = request_payload()
        payload["unknown"] = True
        with self.assertRaisesRegex(ValueError, "unknown fields"):
            AgentContext.from_value(payload)

    def test_scribe_rejects_unknown_evidence_and_story(self) -> None:
        context = AgentContext.from_value(request_payload(attempts=[attempt()]))
        base = {
            "greeting": "你回来了。",
            "observation": "这一页仍可复查。",
            "guidance": "先检查筛选条件。",
            "relationshipLine": None,
            "sourceBeatId": "story:f1-scribe",
            "evidenceRefs": ["attempt:999"],
        }
        with self.assertRaisesRegex(ValueError, "unknown evidence"):
            ScribeOutput.from_value(base, context)

        base["evidenceRefs"] = ["attempt:1"]
        base["sourceBeatId"] = "story:invented"
        with self.assertRaisesRegex(ValueError, "unavailable story"):
            ScribeOutput.from_value(base, context)


class CampfireAnalyzerTests(unittest.TestCase):
    """验证篝火复盘的确定性事实与精英解锁门槛。"""
    def test_empty_evidence_has_actionable_local_output(self) -> None:
        output = analyze_campfire(AgentContext.from_value(request_payload(campfire_unlocked=True)))
        self.assertEqual(output.focus_concept, None)
        self.assertIn("没有可复盘", output.headline)
        self.assertIn("完成一次", output.facts[0])

    def test_recap_counts_correct_and_hint_evidence_without_sql(self) -> None:
        context = AgentContext.from_value(
            request_payload(
                campfire_unlocked=True,
                attempts=[
                    attempt(1, result="wrong-result", hint_level=2),
                    attempt(2, result="correct", hint_level=0),
                    attempt(3, result="syntax-error", hint_level=1),
                ]
            )
        )
        output = analyze_campfire(context)
        serialized = json.dumps(output.to_dict(), ensure_ascii=False)
        self.assertIn("1/3", output.headline)
        self.assertTrue(any("共 2 次" in fact for fact in output.facts))
        self.assertTrue(any("只保留目标记录 ×2" in fact for fact in output.facts))
        self.assertEqual(output.focus_concept, "只保留目标记录")
        self.assertNotIn("SELECT", serialized)

    def test_accuracy_rounding_matches_browser_fallback(self) -> None:
        attempts = [attempt(index, result="wrong-result", hint_level=0) for index in range(1, 9)]
        attempts[0] = attempt(1, result="correct", hint_level=0)
        output = analyze_campfire(
            AgentContext.from_value(request_payload(attempts=attempts, campfire_unlocked=True))
        )
        self.assertIn("正确率 13%", output.facts[0])


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    """验证模型成功和模型异常时的输出来源。"""
    async def test_valid_model_output_is_used(self) -> None:
        response = json.dumps(
            {
                "greeting": "你回来了。",
                "observation": "水轮的变化和这次错误都已记下。",
                "guidance": "先解释多出的行，再调整 WHERE。",
                "relationshipLine": "我已能从页角认出你的记录。",
                "sourceBeatId": "story:f1-scribe",
                "evidenceRefs": ["attempt:1"],
            },
            ensure_ascii=False,
        )
        model = FakeModel(response)
        context = AgentContext.from_value(request_payload(attempts=[attempt()], campfire_unlocked=True))
        output = await AgentPipeline(model).prepare(context)

        self.assertEqual(output.source, "openzl")
        self.assertEqual(output.scribe.evidence_refs, ("attempt:1",))
        self.assertEqual(len(model.calls), 1)
        self.assertNotIn("monsterName", model.calls[0][1])

    async def test_malformed_model_output_falls_back_without_failure(self) -> None:
        model = FakeModel("```json\n{}\n```")
        context = AgentContext.from_value(request_payload(attempts=[attempt()], campfire_unlocked=True))
        output = await AgentPipeline(model).prepare(context)

        self.assertEqual(output.source, "local")
        self.assertEqual(output.scribe.evidence_refs, ("attempt:1",))
        self.assertIn("失败", output.scribe.greeting)


if __name__ == "__main__":
    unittest.main()
