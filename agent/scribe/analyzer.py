"""抄写员 Agent 的兼容调用门面。"""

from __future__ import annotations

from agent.flows.scribe import ScribeFlow


class ScribeService(ScribeFlow):
    """提供与篝火服务对称的直接调用入口。"""

    def respond(self, payload: object) -> dict[str, object]:
        return self.run(payload)
