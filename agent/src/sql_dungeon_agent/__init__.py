"""只读输出 Agent：负责抄写员路线文字与篝火学习复盘。"""

from .contracts import AgentContext, PreparedAgentOutput
from .pipeline import AgentPipeline

__all__ = ["AgentContext", "AgentPipeline", "PreparedAgentOutput"]
