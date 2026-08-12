"""只运行变化方子 Agent 的轻量主编排。"""

from __future__ import annotations

from time import perf_counter
from typing import Protocol

from opentelemetry.sdk.trace import TracerProvider

from agent.campfire.contract import CampfireReviewOutput, CampfireReviewRequest
from agent.campfire.flow import ReviewFlow, local_content as local_campfire
from agent.director.contract import (
    DirectorModelContent,
    DirectorRequest,
    DirectorResponse,
    canonical,
    parse_request,
)
from agent.runtime.config import Settings
from agent.scribe.contract import ScribeOutput, ScribeRequest
from agent.scribe.flow import ScribeFlow, local_content as local_scribe
from agent.shared.model import CallInfo, ModelResult, ModelRunner, TokenUsage
from agent.shared.telemetry import current_trace_id, tracer


SYSTEM_PROMPT = (
    "你是 SQL 魔王城的主 Agent。你只接收两个子 Agent 已校验的展示字段，"
    "只生成简短的下一步计划 guidance。不要复述子 Agent 的 headline、message 或 facts；"
    "不得新增事实、SQL、Markdown、系统说明或游戏操作。"
)


class DirectorModel(Protocol):
    def run(self, prompt: str) -> ModelResult[DirectorModelContent]: ...


def create_model(settings: Settings, provider: TracerProvider | None = None) -> DirectorModel:
    return ModelRunner(settings, DirectorModelContent, SYSTEM_PROMPT, "director", provider)


def _situation(content: object) -> str:
    headline = getattr(content, "headline")
    facts = getattr(content, "facts")
    return (headline if not facts else f"{headline}：{facts[0]}")[:120]


def _guidance(content: object) -> str:
    return getattr(content, "next_action")[:240]


class DirectorFlow:
    def __init__(
        self,
        director: DirectorModel | None = None,
        campfire_flow: ReviewFlow | None = None,
        scribe_flow: ScribeFlow | None = None,
        provider: TracerProvider | None = None,
    ) -> None:
        self._director = director
        self._campfire = campfire_flow or ReviewFlow(provider=provider)
        self._scribe = scribe_flow or ScribeFlow(provider=provider)
        self._tracer = tracer(provider)

    def _child(self, request: DirectorRequest) -> tuple[object, CallInfo]:
        if request.changed_source == "campfire":
            child_request = CampfireReviewRequest(
                **request.changed.evidence.model_dump(),
                protocol_version=1,
                request_id=f"{request.request_id}:campfire",
                evidence_hash=request.changed.evidence_hash,
            )
            try:
                return self._campfire.execute(child_request)
            except Exception:
                content = local_campfire(child_request)
                return CampfireReviewOutput(
                    **content.model_dump(), schema_version=1,
                    request_id=child_request.request_id, evidence_hash=child_request.evidence_hash,
                ), CallInfo("campfire", "local", "fallback", 0, TokenUsage.local())

        child_request = ScribeRequest(
            **request.changed.evidence.model_dump(),
            protocol_version=1,
            request_id=f"{request.request_id}:scribe",
            evidence_hash=request.changed.evidence_hash,
        )
        try:
            return self._scribe.execute(child_request)
        except Exception:
            content = local_scribe(child_request)
            return ScribeOutput(
                **content.model_dump(), schema_version=1,
                request_id=child_request.request_id, evidence_hash=child_request.evidence_hash,
            ), CallInfo("scribe", "local", "fallback", 0, TokenUsage.local())

    def _main(self, request: DirectorRequest, child: object) -> tuple[str, CallInfo]:
        started = perf_counter()
        guidance = _guidance(child)
        status = "fallback"
        tokens = TokenUsage.local()
        if self._director is not None:
            changed = child.model_dump(by_alias=True, exclude={"schema_version", "request_id", "evidence_hash"})
            other = request.context.scribe if request.changed_source == "campfire" else request.context.campfire
            prompt = canonical({
                "floor": request.floor,
                "event": request.event,
                "changedSource": request.changed_source,
                "changed": changed,
                "context": None if other is None else other.content.model_dump(by_alias=True, mode="json"),
            })
            try:
                result = self._director.run(prompt)
                guidance, tokens, status = result.output.guidance, result.tokens, "ready"
            except Exception:
                pass
        return guidance, CallInfo(
            "director",
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
            with self._tracer.start_as_current_span("agent.director") as span:
                guidance, main_call = self._main(request, child)
                span.set_attributes(main_call.span_attributes())
            trace_id = current_trace_id()
            content = child.model_dump(
                by_alias=True,
                mode="json",
                exclude={"schema_version", "request_id", "evidence_hash"},
            )
            response = DirectorResponse.model_validate({
                "schemaVersion": 2,
                "requestId": request.request_id,
                "composeHash": request.compose_hash,
                "floor": request.floor,
                "event": request.event,
                "changedSource": request.changed_source,
                "child": {
                    "source": request.changed_source,
                    "evidenceHash": request.changed.evidence_hash,
                    "status": child_call.status,
                    "content": content,
                },
                "director": {
                    "status": main_call.status,
                    "situation": _situation(child),
                    "guidance": guidance,
                },
                "meta": {
                    "traceId": trace_id,
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


__all__ = ["DirectorFlow", "create_model"]
