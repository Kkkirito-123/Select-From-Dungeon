"""抄写员只负责剧情陪伴和失败安慰；玩法字段由规则决定。"""

from __future__ import annotations

from time import perf_counter
from typing import Protocol

from opentelemetry.sdk.trace import TracerProvider

from dungeon_agents.runtime.config import Settings
from dungeon_agents.scribe.contract import ScribeAgentContent, ScribeEvidence, ScribeModelContent
from dungeon_agents.shared.hash import canonical_json
from dungeon_agents.shared.model import CallInfo, ModelResult, ModelRunner, TokenUsage


DIRECTIONS = {"north": "北方", "east": "东方", "south": "南方", "west": "西方"}
CAUSES = {"combat": "战斗反击", "hazard": "物理陷阱", "cipher": "SQL 密文机关", "unknown": "本轮事件"}
SYSTEM_PROMPT = (
    "你是 SQL 魔王城的抄写员，只负责简短剧情陪伴和失败安慰。"
    "只生成 headline 与 message，不决定路线、提示、玩法行动或 SQL 答案。"
)


class ScribeModel(Protocol):
    def run(self, prompt: str) -> ModelResult[ScribeModelContent]: ...


def create_model(settings: Settings, provider: TracerProvider | None = None) -> ScribeModel:
    return ModelRunner(settings, ScribeModelContent, SYSTEM_PROMPT, "scribe", provider)


def local_content(evidence: ScribeEvidence) -> ScribeAgentContent:
    facts: list[str] = []
    action = "继续观察当前楼层的目标，不要急着重复已经确认的步骤。"
    message = evidence.authored_message
    if evidence.learning:
        learning = evidence.learning
        if learning.missing_columns:
            facts.append(f"缺少字段：{', '.join(learning.missing_columns)}。")
        if learning.unexpected_columns:
            facts.append(f"当前多返回：{', '.join(learning.unexpected_columns)}。")
        if learning.remaining_concepts:
            facts.append(f"尚未满足：{'、'.join(learning.remaining_concepts)}。")
        if learning.result_category == "syntax-error":
            message, action = "先处理查询结构，再检查字段和条件。不要一次修改太多部分。", "先定位语法错误所在的子句，再重新提交最小改动。"
        elif learning.missing_columns or learning.unexpected_columns:
            message, action = "你已经接近目标了。先核对 SELECT 后的字段列表，再继续检查过滤或连接条件。", "先补齐题目要求的字段，并移除当前不需要的字段。"
        elif learning.remaining_concepts:
            message, action = "结果方向已经提供了线索，但还有一个关键概念没有落实。", f"下一次优先检查：{learning.remaining_concepts[0]}。"
        elif learning.result_category == "wrong-result":
            message, action = "查询已经执行，但结果语义还没有符合题目要求。", "先确认返回行数和筛选范围，再检查字段含义。"
        else:
            message, action = "这一步已经通过。记住刚才的判断顺序，再把它应用到下一道题。", "继续下一道题，提交前先复核字段、条件和结果含义。"
    if evidence.navigation:
        direction = DIRECTIONS[evidence.navigation.direction]
        facts.append(f"目标：{evidence.navigation.target_label}，在{direction}，约 {evidence.navigation.distance} 步。")
        action = f"沿当前可行通道向{direction}前进，优先寻找{evidence.navigation.target_label}。"
        message = evidence.authored_message
    if evidence.death:
        facts.insert(0, f"本轮结束原因：{CAUSES[evidence.death.cause]}。")
        message = "这次失败会保留为一次可复盘的记录。"
        message += "先修正记录中最明确的问题，再重新开始。" if evidence.learning else "先看清一个最值得修正的地方，再重新开始。"
        if evidence.learning is None:
            action = "回到最近的安全点后，先确认当前目标，再继续前进。"
    return ScribeAgentContent(
        headline={"interaction": "抄写员记录", "death-review": "抄写员复盘本轮", "navigation": "路线记录"}[evidence.scene],
        message=message,
        facts=facts[:3],
        next_action=action,
        safe_hint_id=evidence.learning.safe_hint_id if evidence.learning else None,
    )


class ScribeFlow:
    def __init__(self, model: ScribeModel | None = None) -> None:
        self._model = model

    def execute(self, evidence: ScribeEvidence) -> tuple[ScribeAgentContent, CallInfo]:
        started = perf_counter()
        content = local_content(evidence)
        status = "fallback"
        tokens = TokenUsage.local()
        if self._model is not None and evidence.scene != "navigation":
            try:
                result = self._model.run(canonical_json(evidence.model_dump(by_alias=True, mode="json")))
                content = content.model_copy(update={
                    "headline": result.output.headline,
                    "message": result.output.message,
                })
                tokens, status = result.tokens, "ready"
            except Exception:
                pass
        return content, CallInfo(
            "scribe",
            "model" if status == "ready" else "local",
            status,
            round((perf_counter() - started) * 1000),
            tokens,
        )


__all__ = ["ScribeFlow", "create_model", "local_content"]
