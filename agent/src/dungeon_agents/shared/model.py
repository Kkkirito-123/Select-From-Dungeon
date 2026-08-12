"""PydanticAI 模型调用的唯一入口。"""

from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Generic, Literal, TypeVar

from openai import AsyncOpenAI
from opentelemetry.sdk.trace import TracerProvider
from pydantic import BaseModel
from pydantic_ai import Agent, PromptedOutput
from pydantic_ai.capabilities.instrumentation import Instrumentation
from pydantic_ai.models import Model
from pydantic_ai.models.instrumented import InstrumentationSettings
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings

from dungeon_agents.runtime.config import Settings
from dungeon_agents.shared.telemetry import tracer_provider


OutputT = TypeVar("OutputT", bound=BaseModel)


class ProviderError(RuntimeError):
    """模型请求失败或结构化输出不合法。"""


@dataclass(frozen=True)
class TokenUsage:
    input: int | None
    output: int | None
    total: int | None

    @classmethod
    def local(cls) -> "TokenUsage":
        return cls(0, 0, 0)


@dataclass(frozen=True)
class ModelResult(Generic[OutputT]):
    output: OutputT
    ms: int
    tokens: TokenUsage


@dataclass(frozen=True)
class CallInfo:
    agent: Literal["campfire", "scribe", "main"]
    mode: Literal["model", "local"]
    status: Literal["ready", "fallback"]
    ms: int
    tokens: TokenUsage

    def span_attributes(self) -> dict[str, str | bool | int]:
        attributes: dict[str, str | bool | int] = {
            "agent.name": self.agent,
            "agent.status": self.status,
            "agent.fallback": self.status == "fallback",
            "agent.ms": self.ms,
        }
        for name in ("input", "output", "total"):
            value = getattr(self.tokens, name)
            if value is not None:
                attributes[f"agent.tokens.{name}"] = value
        return attributes

    def to_dict(self) -> dict[str, object]:
        return {
            "agent": self.agent,
            "mode": self.mode,
            "status": self.status,
            "ms": self.ms,
            "tokens": {
                "input": self.tokens.input,
                "output": self.tokens.output,
                "total": self.tokens.total,
            },
        }


def normalize_base_url(endpoint: str) -> str:
    value = endpoint.rstrip("/")
    suffix = "/chat/completions"
    return value[:-len(suffix)] if value.endswith(suffix) else value


class ModelRunner(Generic[OutputT]):
    """无工具、无记忆、无重试的结构化模型调用器。"""

    def __init__(
        self,
        settings: Settings,
        output_type: type[OutputT],
        system_prompt: str,
        name: str,
        provider: TracerProvider | None = None,
        model: Model | None = None,
    ) -> None:
        if model is None:
            if settings.api_key is None:
                raise ValueError("model API key is required")
            client = AsyncOpenAI(
                api_key=settings.api_key,
                base_url=normalize_base_url(settings.endpoint),
                max_retries=0,
                timeout=settings.timeout,
            )
            model = OpenAIChatModel(
                settings.model,
                provider=OpenAIProvider(openai_client=client),
            )
        instrumentation = Instrumentation(InstrumentationSettings(
            tracer_provider=provider or tracer_provider(),
            include_content=False,
            include_model_request_parameters=False,
        ))
        self._agent = Agent(
            model,
            name=name,
            output_type=PromptedOutput(output_type),
            system_prompt=system_prompt,
            retries=0,
            capabilities=[instrumentation],
        )
        self._settings = ModelSettings(
            max_tokens=settings.max_tokens,
            temperature=0.2,
            timeout=settings.timeout,
        )

    def run(self, prompt: str) -> ModelResult[OutputT]:
        started = perf_counter()
        try:
            result = self._agent.run_sync(prompt, model_settings=self._settings)
        except Exception as error:
            raise ProviderError("model request failed") from error
        usage = result.usage
        tokens = (
            TokenUsage(None, None, None)
            if usage.input_tokens == 0 and usage.output_tokens == 0
            else TokenUsage(usage.input_tokens, usage.output_tokens, usage.total_tokens)
        )
        return ModelResult(result.output, round((perf_counter() - started) * 1000), tokens)


__all__ = [
    "CallInfo",
    "ModelResult",
    "ModelRunner",
    "ProviderError",
    "TokenUsage",
    "normalize_base_url",
]
