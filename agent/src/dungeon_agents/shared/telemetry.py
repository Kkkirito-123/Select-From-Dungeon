"""OpenTelemetry 配置；默认只在进程内创建 Span，不向外导出。"""

from __future__ import annotations

from functools import lru_cache
import os

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


@lru_cache(maxsize=1)
def tracer_provider() -> TracerProvider:
    provider = TracerProvider()
    if os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip():
        try:
            provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        except Exception:
            # 遥测配置错误不能影响游戏服务。
            pass
    return provider


def tracer(provider: TracerProvider | None = None) -> trace.Tracer:
    return (provider or tracer_provider()).get_tracer("select-from-dungeon.agent")


def current_trace_id() -> str | None:
    context = trace.get_current_span().get_span_context()
    return f"{context.trace_id:032x}" if context.is_valid else None
