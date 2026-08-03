"""组合有界的抄写员响应，并在模型失败时使用确定性降级内容。"""

from __future__ import annotations

from typing import Protocol

from ..contracts import AgentContext, CampfireOutput, ScribeOutput
from .guard import parse_scribe_json
from .prompt import SYSTEM_PROMPT, build_user_prompt


class JsonModel(Protocol):
    """模型提供方的最小接口，不暴露工具、记忆或游戏写入能力。"""

    async def complete_json(self, *, system: str, user: str) -> str:
        """返回一个 JSON 文本对象；具体提供方不能改变协议边界。"""


def fallback_scribe(context: AgentContext, campfire: CampfireOutput) -> ScribeOutput:
    """按 Hook 阶段生成开场、寻路或收尾文本，保证离线时仍可用。"""
    if context.trigger.phase == "opening":
        return ScribeOutput(
            greeting="你来了。",
            observation="这一层的记录还没有写满，路会先替你保留方向。",
            guidance=_route_guidance(context),
            relationship_line=None,
            source_beat_id=context.story.beat_id if context.story else None,
            evidence_refs=(),
        )
    if context.trigger.phase == "ending":
        return ScribeOutput(
            greeting="这一层的路已经走完。",
            observation=(
                "精英战斗留下的记录已经交给篝火，下一层会从这些页边继续。"
                if context.campfire_unlocked
                else "这一层已经结束，但篝火还没有收到精英战斗的记录。"
            ),
            guidance=(
                "回到篝火查看本层复盘，再进入下一层。"
                if context.campfire_unlocked
                else "进入下一层，沿新的路线继续记录。"
            ),
            relationship_line="路有尽头，记录不会替你遗忘。",
            source_beat_id=context.story.beat_id if context.story else None,
            evidence_refs=tuple(attempt.evidence_ref for attempt in context.attempts[-2:]),
        )
    latest = context.attempts[-1] if context.attempts else None
    if latest is None:
        greeting = "沿这条路走。"
        observation = _route_guidance(context)
        refs: tuple[str, ...] = ()
    elif latest.result == "correct":
        greeting = "你回来了，我已经把新的一页压平。"
        observation = f"最近一次 {latest.lesson_id} 作答已经成立；这不是运气，而是一条可复查的记录。"
        refs = (latest.evidence_ref,)
    else:
        greeting = "你回来了。失败的那一页没有被烧掉。"
        observation = f"最近一次 {latest.lesson_id} 仍未成立，但错误已经被留成可以追查的证据。"
        refs = (latest.evidence_ref,)

    if context.world_changes:
        observation = f"{observation} 本层的环境变化也已收入记录。"
    elif context.relics:
        observation = f"{observation} {context.relics[-1].name}仍在你的记录中。"

    return ScribeOutput(
        greeting=greeting,
        observation=observation[:180],
        guidance=_route_guidance(context),
        relationship_line=(
            "你留下的页数渐渐多了，我已能从墨迹认出你的归途。"
            if len(context.attempts) >= 3
            else None
        ),
        source_beat_id=context.story.beat_id if context.story else None,
        evidence_refs=refs,
    )


def _route_guidance(context: AgentContext) -> str:
    """把导航投影翻译成短路线提示，不自行推断地图坐标。"""
    direction = {
        "north": "北",
        "east": "东",
        "south": "南",
        "west": "西",
    }.get(context.navigation.direction or "north", "前方")
    if context.navigation.objective_title and context.navigation.distance is not None:
        return f"朝{direction}前进，目标「{context.navigation.objective_title}」约 {context.navigation.distance} 步。"
    if context.navigation.objective_title:
        return f"沿当前道路前进，目标是「{context.navigation.objective_title}」。"
    return "沿已经显现的道路前进；路线会在需要时再次显形。"


async def compose_scribe(
    context: AgentContext,
    campfire: CampfireOutput,
    model: JsonModel | None,
) -> tuple[ScribeOutput, bool]:
    """模型输出先过 JSON 守卫；任何异常都回退到本地文本。"""
    fallback = fallback_scribe(context, campfire)
    if model is None:
        return fallback, False
    try:
        raw = await model.complete_json(
            system=SYSTEM_PROMPT,
            user=build_user_prompt(context, campfire),
        )
        return parse_scribe_json(raw, context), True
    except Exception:  # 游戏边界必须始终降级到本地输出。
        return fallback, False
