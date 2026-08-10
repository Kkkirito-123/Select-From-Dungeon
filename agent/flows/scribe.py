"""抄写员 Agent 的场景化生成流程。"""

from __future__ import annotations

from typing import Protocol

from agent.contracts.scribe import (
    ScribeOutput,
    ScribeRequest,
    parse_output,
    parse_request,
)
from agent.storage.repo import Record, Store


DIRECTION_LABELS = {
    "north": "北方",
    "east": "东方",
    "south": "南方",
    "west": "西方",
}

CAUSE_LABELS = {
    "combat": "战斗反击",
    "hazard": "物理陷阱",
    "cipher": "SQL 密文机关",
    "unknown": "本轮事件",
}


class Generator(Protocol):
    """抄写员生成器的最小接口，未来模型只能通过这里接入。"""

    def generate(self, request: ScribeRequest) -> ScribeOutput:
        """根据已确认的场景证据生成展示文案。"""


class DeterministicGenerator:
    """无模型时使用的确定性抄写员生成器。"""

    def generate(self, request: ScribeRequest) -> ScribeOutput:
        facts: list[str] = []
        next_action = "继续观察当前楼层的目标，不要急着重复已经确认的步骤。"
        message = request.authored_message

        if request.learning is not None:
            learning = request.learning
            if learning.missing_columns:
                facts.append(f"缺少字段：{', '.join(learning.missing_columns)}。")
            if learning.unexpected_columns:
                facts.append(f"当前多返回：{', '.join(learning.unexpected_columns)}。")
            if learning.remaining_concepts:
                facts.append(f"尚未满足：{'、'.join(learning.remaining_concepts)}。")

            if learning.result_category == "syntax-error":
                message = "先处理查询结构，再检查字段和条件。不要一次修改太多部分。"
                next_action = "先定位语法错误所在的子句，再重新提交最小改动。"
            elif learning.missing_columns or learning.unexpected_columns:
                message = "你已经接近目标了。先核对 SELECT 后的字段列表，再继续检查过滤或连接条件。"
                next_action = "先补齐题目要求的字段，并移除当前不需要的字段。"
            elif learning.remaining_concepts:
                message = "结果方向已经提供了线索，但还有一个关键概念没有落实。先围绕剩余概念检查查询结构。"
                next_action = f"下一次优先检查：{learning.remaining_concepts[0]}。"
            elif learning.result_category == "wrong-result":
                message = "查询已经执行，但结果语义还没有符合题目要求。先比较结果形状和题目目标。"
                next_action = "先确认返回行数和筛选范围，再检查字段含义。"
            else:
                message = "这一步已经通过。记住刚才的判断顺序，再把它应用到下一道题。"
                next_action = "继续下一道题，提交前先复核字段、条件和结果含义。"

        if request.navigation is not None:
            navigation = request.navigation
            direction = DIRECTION_LABELS[navigation.direction]
            facts.append(f"目标：{navigation.target_label}，在{direction}，约 {navigation.distance} 步。")
            message = request.authored_message
            next_action = f"沿当前可行通道向{direction}前进，优先寻找{navigation.target_label}。"

        if request.death is not None:
            death = request.death
            facts.insert(0, f"本轮结束原因：{CAUSE_LABELS[death.cause]}。")
            message = "这次失败会保留为一次可复盘的记录。"
            if request.learning is not None and (
                request.learning.missing_columns
                or request.learning.unexpected_columns
                or request.learning.remaining_concepts
            ):
                message += "先修正记录中最明确的字段或概念问题，再重新开始。"
            else:
                message += "先看清一个最值得修正的地方，再重新开始。"
            if request.learning is None:
                next_action = "回到最近的安全点后，先确认当前目标，再继续前进。"

        return ScribeOutput(
            schema_version=1,
            request_id=request.request_id,
            evidence_hash=request.evidence_hash,
            headline={
                "interaction": "抄写员记录",
                "death-review": "抄写员复盘本轮",
                "navigation": "抄写员指出方向",
            }[request.scene],
            facts=tuple(facts[:3]),
            next_action=next_action,
            safe_hint_id=request.learning.safe_hint_id if request.learning else None,
            message=message,
        )


class ScribeFlow:
    """校验抄写员场景请求、生成文案并绑定证据哈希。"""

    def __init__(self, generator: Generator | None = None, store: Store | None = None) -> None:
        self._generator = generator or DeterministicGenerator()
        self._store = store

    def run(self, payload: object) -> dict[str, object]:
        request = parse_request(payload)
        if self._store is not None:
            cached = self._store.find("scribe", request.floor, request.evidence_hash)
            if cached and cached.status == "ready" and cached.result is not None:
                stored = dict(cached.result)
                stored["requestId"] = request.request_id
                stored["evidenceHash"] = request.evidence_hash
                return parse_output(stored, request).to_dict()
            self._store.put(Record(
                trigger_id=request.request_id,
                trigger_type="scribe-response",
                scope="scribe",
                floor=request.floor,
                evidence_hash=request.evidence_hash,
                status="requesting",
            ).with_now())

        candidate = self._generator.generate(request)
        result = parse_output(candidate.to_dict(), request).to_dict()
        if self._store is not None:
            self._store.put(Record(
                trigger_id=request.request_id,
                trigger_type="scribe-response",
                scope="scribe",
                floor=request.floor,
                evidence_hash=request.evidence_hash,
                status="ready",
                result=result,
            ).with_now())
        return result
