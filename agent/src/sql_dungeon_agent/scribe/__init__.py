"""抄写员子模块：组合本地文本或经过守卫的模型文本。"""

from .composer import compose_scribe, fallback_scribe

__all__ = ["compose_scribe", "fallback_scribe"]
