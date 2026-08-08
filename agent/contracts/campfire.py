"""篝火协议兼容入口。

新代码按职责从 ``models``、``hash`` 和 ``validate`` 导入；旧调用继续从
``agent.contracts.campfire`` 导入，避免一次拆分破坏现有服务和测试。
"""

from agent.contracts.hash import canonical_json, evidence_hash
from agent.contracts.models import (
    CampfireAggregate,
    CampfireAttempt,
    CampfireReviewOutput,
    CampfireReviewRequest,
    ContractError,
)
from agent.contracts.validate import parse_output, parse_request

__all__ = [
    "CampfireAggregate",
    "CampfireAttempt",
    "CampfireReviewOutput",
    "CampfireReviewRequest",
    "ContractError",
    "canonical_json",
    "evidence_hash",
    "parse_output",
    "parse_request",
]
