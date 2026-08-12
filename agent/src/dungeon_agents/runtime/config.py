"""从服务端环境或 agent/.env 读取子 Agent 与主 Agent 模型配置。

Key 只存在 Python 进程环境中，不进入浏览器、游戏存档、请求正文或响应。
没有 Key 时使用本地确定性生成器。
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """OpenAI 兼容模型服务配置。"""

    api_key: str | None
    endpoint: str
    model: str
    timeout: float
    max_tokens: int


def _file_values() -> dict[str, str]:
    """读取被 Git 忽略的 agent/.env，不把内容写回环境或日志。"""

    path = Path(__file__).resolve().parents[3] / ".env"
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


def _value(values: dict[str, str], name: str, legacy: str | None, default: str = "") -> str:
    """按新名称优先读取配置；旧名称仅用于平滑保留本地密钥。"""

    if name in os.environ:
        return os.environ[name]
    if name in values:
        return values[name]
    if legacy and legacy in os.environ:
        return os.environ[legacy]
    if legacy and legacy in values:
        return values[legacy]
    return default


def _load_settings(prefix: str, legacy_prefix: str, timeout_default: float, token_default: int) -> Settings:
    values = _file_values()
    api_key = _value(values, f"{prefix}_API_KEY", f"{legacy_prefix}_API_KEY").strip() or None
    endpoint = _value(
        values,
        f"{prefix}_URL",
        f"{legacy_prefix}_URL",
        "https://api.deepseek.com/chat/completions",
    ).strip()
    model = _value(values, f"{prefix}_MODEL", f"{legacy_prefix}_MODEL", "deepseek-chat").strip()
    try:
        timeout = max(1.0, min(30.0, float(_value(
            values,
            f"{prefix}_TIMEOUT",
            f"{legacy_prefix}_TIMEOUT",
            str(timeout_default),
        ))))
    except ValueError:
        timeout = timeout_default
    try:
        max_tokens = max(120, min(800, int(_value(
            values,
            f"{prefix}_MAX_TOKENS",
            f"{legacy_prefix}_MAX_TOKENS",
            str(token_default),
        ))))
    except ValueError:
        max_tokens = token_default
    return Settings(
        api_key=api_key,
        endpoint=endpoint,
        model=model,
        timeout=timeout,
        max_tokens=max_tokens,
    )


def load_child() -> Settings:
    """读取篝火与抄写员共用配置；不打印敏感值。"""

    return _load_settings("CHILD", "DEEPSEEK", 12.0, 500)


def load_main() -> Settings:
    """读取 Main 独立配置，不借用子 Agent 密钥。"""

    return _load_settings("MAIN", "DIRECTOR", 4.0, 320)
