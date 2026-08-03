"""Optional model providers. Providers can only return Scribe text."""

from .openzl import OpenZLAgentModelAdapter

__all__ = ["OpenZLAgentModelAdapter"]
