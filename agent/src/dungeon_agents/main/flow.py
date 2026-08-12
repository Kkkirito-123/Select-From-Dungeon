"""主 Agent 编排：每次只运行变化方，再生成下一步指引。"""

from __future__ import annotations

from time import perf_counter
from typing import Protocol

from opentelemetry.sdk.trace import TracerProvider

from dungeon_agents.campfire.flow import CampfireFlow, local_content as local_campfire
from dungeon_agents.main.contract import (
    AgentRequest,
    AgentResponse,
    MainModelContent,
    canonical,
    parse_request,
)
from dungeon_agents.runtime.config import Settings
from dungeon_agents.scribe.flow import ScribeFlow, local_content as local_scribe
from dungeon_agents.shared.model import CallInfo, ModelResult, ModelRunner, TokenUsage
from dungeon_agents.shared.telemetry import current_trace_id, tracer


SYSTEM_PROMPT = (
    "你是 SQL 魔王城的主 Agent。你只接收两个子 Agent 已校验的展示字段，"
    "只生成简短的下一步计划 guidance。不要复述 headline、message 或 facts；"
    "不得新增事实、SQL、Markdown、系统说明或游戏操作。"
)


class MainModel(Protocol):
    def run(self, prompt: str) -> ModelResult[MainModelContent]: ...


def create_model(settings: Settings, provider: TracerProvider | None = None) -> MainModel:
    return ModelRunner(settings, MainModelContent, SYSTEM_PROMPT, "main", provider)


class MainFlow:
    def __init__(
        self,
        main: MainModel | None = None,
        campfire: CampfireFlow | None = None,
        scribe: ScribeFlow | None = None,
        provider: TracerProvider | None = None,
    ) -> None:
        self._main_model = main
        self._campfire = campfire or CampfireFlow()
        self._scribe = scribe or ScribeFlow()
        self._tracer = tracer(provider)

    def _child(self, request: AgentRequest) -> tuple[object, CallInfo]:
        try:
            if request.changed_source == "campfire":
                return self._campfire.execute(request.changed.evidence)
            return self._scribe.execute(request.changed.evidence)
        except Exception:
            if request.changed_source == "campfire":
                content = local_campfire(request.changed.evidence)
            else:
                content = local_scribe(request.changed.evidence)
            return content, CallInfo(
                request.changed_source, "local", "fallback", 0, TokenUsage.local()
            )

    def _main(self, request: AgentRequest, child: object) -> tuple[str, CallInfo]:
        started = perf_counter()
        guidance = getattr(child, "next_action")[:240]
        status = "fallback"
        tokens = TokenUsage.local()
        if self._main_model is not None:
            other = request.context.scribe if request.changed_source == "campfire" else request.context.campfire
            prompt = canonical({
                "floor": request.floor,
                "event": request.event,
                "changedSource": request.changed_source,
                "changed": child.model_dump(by_alias=True, mode="json"),
                "context": None if other is None else other.content.model_dump(by_alias=True, mode="json"),
            })
            try:
                result = self._main_model.run(prompt)
                guidance, tokens, status = result.output.guidance, result.tokens, "ready"
            except Exception:
                pass
        return guidance, CallInfo(
            "main",
            "model" if status == "ready" else "local",
            status,
            round((perf_counter() - started) * 1000),
            tokens,
        )

    def run(self, payload: object) -> dict[str, object]:
        started = perf_counter()
        with self._tracer.start_as_current_span("agent.request") as root:
            request = parse_request(payload)
            root.set_attributes({
                "request.id": request.request_id,
                "game.floor": request.floor,
                "agent.event": request.event,
                "agent.source": request.changed_source,
            })
            with self._tracer.start_as_current_span("agent.child") as span:
                child, child_call = self._child(request)
                span.set_attributes(child_call.span_attributes())
            with self._tracer.start_as_current_span("agent.main") as span:
                guidance, main_call = self._main(request, child)
                span.set_attributes(main_call.span_attributes())
            response = AgentResponse.model_validate({
                "schemaVersion": 1,
                "requestId": request.request_id,
                "composeHash": request.compose_hash,
                "floor": request.floor,
                "event": request.event,
                "changedSource": request.changed_source,
                "child": {
                    "source": request.changed_source,
                    "evidenceHash": request.changed.evidence_hash,
                    "status": child_call.status,
                    "content": child.model_dump(by_alias=True, mode="json"),
                },
                "main": {"status": main_call.status, "guidance": guidance},
                "meta": {
                    "traceId": current_trace_id(),
                    "ms": round((perf_counter() - started) * 1000),
                    "calls": [child_call.to_dict(), main_call.to_dict()],
                },
            })
            root.set_attributes({
                "agent.status": main_call.status,
                "agent.fallback": child_call.status == "fallback" or main_call.status == "fallback",
                "agent.ms": response.meta.ms,
            })
        return response.to_dict()


__all__ = ["MainFlow", "create_model"]
