"""Compose a bounded Scribe response, with deterministic fallback."""

from __future__ import annotations

from typing import Protocol

from ..contracts import AgentContext, CampfireOutput, ScribeOutput
from .guard import parse_scribe_json
from .prompt import SYSTEM_PROMPT, build_user_prompt


class JsonModel(Protocol):
    async def complete_json(self, *, system: str, user: str) -> str:
        """Return one JSON object as text."""


def fallback_scribe(context: AgentContext, campfire: CampfireOutput) -> ScribeOutput:
    latest = context.attempts[-1] if context.attempts else None
    if latest is None:
        greeting = "旅人，火还记得你来过。"
        observation = "你的答题页仍是空白，我暂时只替你守住这一层的路。"
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
        guidance=campfire.next_action,
        relationship_line=(
            "你留下的页数渐渐多了，我已能从墨迹认出你的归途。"
            if len(context.attempts) >= 3
            else None
        ),
        source_beat_id=context.story.beat_id if context.story else None,
        evidence_refs=refs,
    )


async def compose_scribe(
    context: AgentContext,
    campfire: CampfireOutput,
    model: JsonModel | None,
) -> tuple[ScribeOutput, bool]:
    fallback = fallback_scribe(context, campfire)
    if model is None:
        return fallback, False
    try:
        raw = await model.complete_json(
            system=SYSTEM_PROMPT,
            user=build_user_prompt(context, campfire),
        )
        return parse_scribe_json(raw, context), True
    except Exception:  # The game-facing boundary always degrades to local output.
        return fallback, False
