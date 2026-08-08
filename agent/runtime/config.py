"""从服务端环境读取 DeepSeek 配置。

Key 只存在 Python 进程环境中，不进入浏览器、游戏存档、请求正文或响应。
没有 Key 时使用本地确定性生成器。
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """DeepSeek 服务端配置。"""

    api_key: str | None
    endpoint: str
    model: str
    timeout: float
    max_tokens: int


def _file_values() -> dict[str, str]:
    """读取被 Git 忽略的 agent/.env，不把内容写回环境或日志。"""

    path = Path(__file__).resolve().parents[1] / ".env"
    if not path.is_file():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text or text.startswith("#") or "=" not in text:
            continue
        name, value = text.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[name.strip()] = value
    return values


def load() -> Settings:
    """读取环境变量或 agent/.env；不打印敏感值。"""

    values = _file_values()
    api_key = os.environ.get("DEEPSEEK_API_KEY", values.get("DEEPSEEK_API_KEY", "")).strip() or None
    endpoint = os.environ.get(
        "DEEPSEEK_URL",
        values.get("DEEPSEEK_URL", "https://api.deepseek.com/chat/completions"),
    ).strip()
    model = os.environ.get("DEEPSEEK_MODEL", values.get("DEEPSEEK_MODEL", "deepseek-chat")).strip()
    try:
        timeout = max(1.0, min(30.0, float(os.environ.get(
            "DEEPSEEK_TIMEOUT",
            values.get("DEEPSEEK_TIMEOUT", "12"),
        ))))
    except ValueError:
        timeout = 12.0
    try:
        max_tokens = max(120, min(800, int(os.environ.get(
            "DEEPSEEK_MAX_TOKENS",
            values.get("DEEPSEEK_MAX_TOKENS", "500"),
        ))))
    except ValueError:
        max_tokens = 500
    return Settings(
        api_key=api_key,
        endpoint=endpoint,
        model=model,
        timeout=timeout,
        max_tokens=max_tokens,
    )
