"""可选模型提供方：只能返回抄写员文本，不能操作游戏状态。"""

from .openzl import OpenZLAgentModelAdapter

__all__ = ["OpenZLAgentModelAdapter"]
