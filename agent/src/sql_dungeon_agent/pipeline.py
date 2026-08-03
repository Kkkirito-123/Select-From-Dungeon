"""只读输出流水线：一次请求同时准备篝火事实与抄写员文本。"""

from __future__ import annotations

from .campfire import analyze_campfire
from .contracts import AgentContext, PreparedAgentOutput
from .scribe import compose_scribe
from .scribe.composer import JsonModel


class AgentPipeline:
    """连接确定性篝火分析、抄写员降级逻辑和可选 JSON 模型。"""

    def __init__(self, model: JsonModel | None = None) -> None:
        self._model = model

    async def prepare(self, context: AgentContext) -> PreparedAgentOutput:
        """先生成本地事实，再让模型在严格协议内尝试替换抄写员措辞。"""
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
