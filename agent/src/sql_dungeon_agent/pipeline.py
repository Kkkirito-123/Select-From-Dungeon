"""One read-only preparation pipeline for campfire and Scribe outputs."""

from __future__ import annotations

from .campfire import analyze_campfire
from .contracts import AgentContext, PreparedAgentOutput
from .scribe import compose_scribe
from .scribe.composer import JsonModel


class AgentPipeline:
    def __init__(self, model: JsonModel | None = None) -> None:
        self._model = model

    async def prepare(self, context: AgentContext) -> PreparedAgentOutput:
        campfire = analyze_campfire(context)
        scribe, used_model = await compose_scribe(context, campfire, self._model)
        return PreparedAgentOutput(
            run_id=context.run_id,
            floor=context.floor,
            evidence_hash=context.evidence_hash,
            source="openzl" if used_model else "local",
            campfire=campfire,
            scribe=scribe,
        )
