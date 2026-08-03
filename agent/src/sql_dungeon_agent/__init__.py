"""Output-only Agent adapter for SELECT * FROM DUNGEON."""

from .contracts import AgentContext, PreparedAgentOutput
from .pipeline import AgentPipeline

__all__ = ["AgentContext", "AgentPipeline", "PreparedAgentOutput"]
