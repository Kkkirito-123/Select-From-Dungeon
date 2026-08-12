"""篝火 SQL 学习复盘；模型失败时返回确定性内容。"""

from __future__ import annotations

from time import perf_counter
from typing import Protocol

from opentelemetry.sdk.trace import TracerProvider

from dungeon_agents.campfire.contract import CampfireAgentContent, CampfireEvidence
from dungeon_agents.runtime.config import Settings
from dungeon_agents.shared.hash import canonical_json
from dungeon_agents.shared.model import CallInfo, ModelResult, ModelRunner, TokenUsage


ERROR_LABELS = {
    "missing-concept": "关键概念缺失",
    "wrong-result": "结果集合不符",
    "syntax-error": "SQL 语法错误",
}
SYSTEM_PROMPT = (
    "你是 SQL 魔王城的篝火复盘员。只分析当前楼层的有限 SQL 作答证据。"
    "输出简短中文复盘，不提供完整答案 SQL、HTML、工具调用或游戏指令。"
)


class CampfireModel(Protocol):
    def run(self, prompt: str) -> ModelResult[CampfireAgentContent]: ...


def create_model(settings: Settings, provider: TracerProvider | None = None) -> CampfireModel:
    return ModelRunner(settings, CampfireAgentContent, SYSTEM_PROMPT, "campfire", provider)


def local_content(evidence: CampfireEvidence) -> CampfireAgentContent:
    aggregate = evidence.aggregate
    errors = aggregate.error_counts.model_dump(by_alias=True)
    common_error = max(errors.items(), key=lambda item: (item[1], item[0]))
    focus = next((item for item in reversed(evidence.attempts) if item.result != "correct"), None)
    facts = [
        f"本层共记录 {aggregate.total_attempts} 次作答，正确 {aggregate.correct_count} 次，"
        f"正确率 {aggregate.accuracy}%。"
    ]
    if common_error[1] > 0:
        facts.append(f"最常见问题是 {ERROR_LABELS[common_error[0]]}，出现 {common_error[1]} 次。")
    if aggregate.hinted_attempts > 0:
        facts.append(
            f"使用过 {aggregate.hinted_attempts} 次提示，最高使用到第 {aggregate.highest_hint_level} 级。"
        )
    elif aggregate.correct_count == aggregate.total_attempts and aggregate.total_attempts > 0:
        facts.append("本层记录暂未显示提示依赖，继续保持先读题目再写查询。")
    if focus:
        action = "下一次先圈出题目要求的字段和筛选条件，再检查查询结果是否覆盖全部要求。"
    elif aggregate.total_attempts == 0:
        action = "完成一次当前楼层 SQL 作答后，再回到篝火查看复盘。"
    else:
        action = "继续下一道当前楼层题目，并在提交前核对结果语义与题目目标。"
    return CampfireAgentContent(
        headline=f"本层 SQL 复盘 · {aggregate.correct_count}/{aggregate.total_attempts} 次正确",
        facts=facts[:3],
        focus_concept=focus.stage_objective[:80] if focus else None,
        next_action=action,
        message=(
            f"这层已经完成 {aggregate.total_attempts} 次 SQL 练习，正确率 {aggregate.accuracy}%。"
            "先关注可重复出现的错误，再逐步减少提示依赖。"
        ),
    )


class CampfireFlow:
    def __init__(self, model: CampfireModel | None = None) -> None:
        self._model = model

    def execute(self, evidence: CampfireEvidence) -> tuple[CampfireAgentContent, CallInfo]:
        started = perf_counter()
        content = local_content(evidence)
        status = "fallback"
        tokens = TokenUsage.local()
        if self._model is not None:
            try:
                result = self._model.run(canonical_json(evidence.model_dump(by_alias=True, mode="json")))
                content, tokens, status = result.output, result.tokens, "ready"
            except Exception:
                pass
        return content, CallInfo(
            "campfire",
            "model" if status == "ready" else "local",
            status,
            round((perf_counter() - started) * 1000),
            tokens,
        )


__all__ = ["CampfireFlow", "create_model", "local_content"]
