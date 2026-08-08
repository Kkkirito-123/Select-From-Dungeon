"""复盘分析器兼容入口。

实际流程位于 ``agent.flows.review``，此文件保留旧导入路径。
"""

from agent.flows.review import (
    CampfireReviewService,
    DeterministicGenerator,
    Generator,
    ReviewFlow,
)

CampfireReviewGenerator = Generator
DeterministicCampfireReviewGenerator = DeterministicGenerator

__all__ = [
    "CampfireReviewGenerator",
    "CampfireReviewService",
    "DeterministicCampfireReviewGenerator",
    "ReviewFlow",
]
