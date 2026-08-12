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


def _load_settings(prefix: str, defaults: tuple[str, str, str]) -> Settings:
    values = _file_values()
    key_name, url_name, model_name = defaults
    api_key = os.environ.get(key_name, values.get(key_name, "")).strip() or None
    endpoint = os.environ.get(
        url_name,
        values.get(url_name, "https://api.deepseek.com/chat/completions"),
    ).strip()
    model = os.environ.get(model_name, values.get(model_name, "deepseek-chat")).strip()
    try:
        timeout = max(1.0, min(30.0, float(os.environ.get(
            f"{prefix}_TIMEOUT",
            values.get(f"{prefix}_TIMEOUT", "12" if prefix == "DEEPSEEK" else "4"),
        ))))
    except ValueError:
        timeout = 12.0
    try:
        max_tokens = max(120, min(800, int(os.environ.get(
            f"{prefix}_MAX_TOKENS",
            values.get(f"{prefix}_MAX_TOKENS", "500" if prefix == "DEEPSEEK" else "320"),
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


def load() -> Settings:
    """读取共用 DEEPSEEK 配置；不打印敏感值。"""

    return _load_settings(
        "DEEPSEEK",
        ("DEEPSEEK_API_KEY", "DEEPSEEK_URL", "DEEPSEEK_MODEL"),
    )


def load_director() -> Settings:
    """读取独立 DIRECTOR 配置，不回退到 DEEPSEEK_API_KEY。"""

    return _load_settings(
        "DIRECTOR",
        ("DIRECTOR_API_KEY", "DIRECTOR_URL", "DIRECTOR_MODEL"),
    )
