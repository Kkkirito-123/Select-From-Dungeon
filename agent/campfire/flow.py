"""篝火 SQL 复盘流程。"""

from __future__ import annotations

from time import perf_counter
from typing import Protocol

from opentelemetry.sdk.trace import TracerProvider

from agent.campfire.contract import (
    CampfireAgentContent,
    CampfireReviewOutput,
    CampfireReviewRequest,
    canonical_json,
    parse_output,
    parse_request,
)
from agent.runtime.config import Settings
from agent.shared.model import CallInfo, ModelResult, ModelRunner, TokenUsage
from agent.shared.telemetry import tracer


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


def local_content(request: CampfireReviewRequest) -> CampfireAgentContent:
    aggregate = request.aggregate
    errors = aggregate.error_counts.model_dump(by_alias=True)
    common_error = max(errors.items(), key=lambda item: (item[1], item[0]))
    focus_attempt = next((item for item in reversed(request.attempts) if item.result != "correct"), None)
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
    if focus_attempt:
        action = "下一次先圈出题目要求的字段和筛选条件，再检查查询结果是否覆盖全部要求。"
    elif aggregate.total_attempts == 0:
        action = "完成一次当前楼层 SQL 作答后，再回到篝火查看复盘。"
    else:
        action = "继续下一道当前楼层题目，并在提交前核对结果语义与题目目标。"
    return CampfireAgentContent(
        headline=f"本层 SQL 复盘 · {aggregate.correct_count}/{aggregate.total_attempts} 次正确",
        facts=facts[:3],
        focus_concept=focus_attempt.stage_objective[:80] if focus_attempt else None,
        next_action=action,
        message=(
            f"这层已经完成 {aggregate.total_attempts} 次 SQL 练习，正确率 {aggregate.accuracy}%。"
            "先关注可重复出现的错误，再逐步减少提示依赖。"
        ),
    )


class ReviewFlow:
    def __init__(self, model: CampfireModel | None = None, provider: TracerProvider | None = None) -> None:
        self._model = model
        self._tracer = tracer(provider)

    def execute(self, request: CampfireReviewRequest) -> tuple[CampfireReviewOutput, CallInfo]:
        started = perf_counter()
        status = "fallback"
        tokens = TokenUsage.local()
        content = local_content(request)
        if self._model is not None:
            try:
                result = self._model.run(canonical_json(request.evidence_payload()))
                content, tokens, status = result.output, result.tokens, "ready"
            except Exception:
                pass
        output = CampfireReviewOutput(
            **content.model_dump(),
            schema_version=1,
            request_id=request.request_id,
            evidence_hash=request.evidence_hash,
        )
        output = parse_output(output.model_dump(by_alias=True), request)
        return output, CallInfo(
            "campfire",
            "model" if status == "ready" else "local",
            status,
            round((perf_counter() - started) * 1000),
            tokens,
        )

    def run(self, payload: object) -> dict[str, object]:
        request = parse_request(payload)
        with self._tracer.start_as_current_span("agent.request") as root:
            root.set_attributes({
                "request.id": request.request_id,
                "game.floor": request.floor,
                "agent.source": "campfire",
                "agent.event": "campfire-review",
            })
            with self._tracer.start_as_current_span("agent.child") as span:
                output, call = self.execute(request)
                span.set_attributes(call.span_attributes())
        return output.to_dict()


__all__ = ["ReviewFlow", "create_model", "local_content"]
