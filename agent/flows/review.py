"""篝火复盘流程。

流程层只负责校验请求、调用生成器和校验输出。它不处理 HTTP、数据库、
游戏存档或游戏规则，因此可以被 HTTP 服务和离线测试共同使用。
"""

from __future__ import annotations

from typing import Protocol

from agent.contracts.campfire import (
    CampfireReviewOutput,
    CampfireReviewRequest,
    ContractError,
    parse_output,
    parse_request,
)
from agent.storage.repo import Record, Store


ERROR_LABELS = {
    "missing-concept": "关键概念缺失",
    "wrong-result": "结果集合不符",
    "syntax-error": "SQL 语法错误",
}


class Generator(Protocol):
    """复盘生成器的最小接口，未来模型只能通过此边界接入。"""

    def generate(self, request: CampfireReviewRequest) -> CampfireReviewOutput:
        """根据已校验的当前楼层证据生成候选结果。"""


class DeterministicGenerator:
    """不依赖模型的确定性复盘生成器，也是服务不可用时的基础实现。"""

    def generate(self, request: CampfireReviewRequest) -> CampfireReviewOutput:
        aggregate = request.aggregate
        correct = aggregate.correct_count
        total = aggregate.total_attempts
        accuracy = round(aggregate.accuracy)
        common_error = max(
            aggregate.error_counts.items(),
            key=lambda item: (item[1], item[0]),
            default=(None, 0),
        )
        focus_attempt = next(
            (attempt for attempt in reversed(request.attempts) if attempt.result != "correct"),
            None,
        )
        focus = focus_attempt.stage_objective[:80] if focus_attempt else None

        facts = [f"本层共记录 {total} 次作答，正确 {correct} 次，正确率 {accuracy}%。"]
        if common_error[0] is not None and common_error[1] > 0:
            facts.append(f"最常见问题是 {ERROR_LABELS[common_error[0]]}，出现 {common_error[1]} 次。")
        if aggregate.hinted_attempts > 0:
            facts.append(
                f"使用过 {aggregate.hinted_attempts} 次提示，最高使用到第 {aggregate.highest_hint_level} 级。"
            )
        elif correct == total and total > 0:
            facts.append("本层记录暂未显示提示依赖，继续保持先读题目再写查询。")

        if focus_attempt is not None:
            next_action = "下一次先圈出题目要求的字段和筛选条件，再检查查询结果是否覆盖全部要求。"
        elif total == 0:
            next_action = "完成一次当前楼层 SQL 作答后，再回到篝火查看复盘。"
        else:
            next_action = "继续下一道当前楼层题目，并在提交前核对结果语义与题目目标。"

        return CampfireReviewOutput(
            schema_version=1,
            request_id=request.request_id,
            evidence_hash=request.evidence_hash,
            headline=f"本层 SQL 复盘 · {correct}/{total} 次正确",
            facts=tuple(facts[:3]),
            focus_concept=focus,
            next_action=next_action,
            message=f"这层已经完成 {total} 次 SQL 练习，正确率 {accuracy}%。先关注可重复出现的错误，再逐步减少提示依赖。",
        )


class FallbackGenerator:
    """优先使用外部模型，失败时回退确定性复盘。"""

    def __init__(self, primary: Generator, fallback: Generator | None = None) -> None:
        self._primary = primary
        self._fallback = fallback or DeterministicGenerator()

    def generate(self, request: CampfireReviewRequest) -> CampfireReviewOutput:
        try:
            return self._primary.generate(request)
        except Exception:
            return self._fallback.generate(request)


class ReviewFlow:
    """一次篝火复盘请求的无状态业务流程。"""

    def __init__(self, generator: Generator | None = None, store: Store | None = None) -> None:
        self._generator = generator or DeterministicGenerator()
        self._store = store

    def run(self, payload: object) -> dict[str, object]:
        request = parse_request(payload)
        if self._store is not None:
            cached = self._store.find("campfire", request.floor, request.evidence_hash)
            if cached and cached.status == "ready" and cached.result is not None:
                stored = dict(cached.result)
                stored["requestId"] = request.request_id
                stored["evidenceHash"] = request.evidence_hash
                return parse_output(stored, request).to_dict()
            self._store.put(Record(
                trigger_id=request.request_id,
                trigger_type="review",
                scope="campfire",
                floor=request.floor,
                evidence_hash=request.evidence_hash,
                status="requesting",
            ).with_now())
        candidate = self._generator.generate(request)
        if not isinstance(candidate, CampfireReviewOutput):
            raise ContractError("review generator returned an invalid object")
        result = parse_output(candidate.to_dict(), request).to_dict()
        if self._store is not None:
            self._store.put(Record(
                trigger_id=request.request_id,
                trigger_type="review",
                scope="campfire",
                floor=request.floor,
                evidence_hash=request.evidence_hash,
                status="ready",
                result=result,
            ).with_now())
        return result


class CampfireReviewService(ReviewFlow):
    """旧服务名称的兼容入口。"""

    def review(self, payload: object) -> dict[str, object]:
        return self.run(payload)
