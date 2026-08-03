"""Deterministic learning recap derived from bounded local answer evidence."""

from __future__ import annotations

from collections import Counter

from ..contracts import AgentContext, CampfireOutput

_ERROR_LABELS = {
    "missing-concept": "关键概念缺失",
    "wrong-result": "结果集合不符",
    "syntax-error": "SQL 语法错误",
}

_ERROR_ACTIONS = {
    "missing-concept": "下一次先圈出题目要求的 SQL 结构，再检查它是否真的出现在查询中。",
    "wrong-result": "对照目标字段与筛选条件，先解释多了哪些行、少了哪些行，再改查询。",
    "syntax-error": "先从报错位置向前检查关键字、逗号、括号和别名，再提交下一次查询。",
}


def _short_label(value: str, maximum: int = 24) -> str:
    return value if len(value) <= maximum else f"{value[: maximum - 1]}…"


def _hint_fact(context: AgentContext) -> str | None:
    hinted = [attempt for attempt in context.attempts if attempt.hint_level > 0]
    if not hinted:
        return None
    by_stage: dict[str, tuple[str, int, int]] = {}
    for attempt in hinted:
        current = by_stage.get(attempt.stage_id)
        by_stage[attempt.stage_id] = (
            attempt.objective,
            current[1] + 1 if current else 1,
            max(current[2] if current else 0, attempt.attempt_id),
        )
    stages = sorted(
        by_stage.items(),
        key=lambda item: (-item[1][1], -item[1][2], item[0]),
    )
    visible = [
        f"{_short_label(stage[0])} ×{stage[1]}"
        for _, stage in stages[:2]
    ]
    remaining = len(stages) - len(visible)
    remainder = f"，另 {remaining} 题" if remaining > 0 else ""
    highest = max(attempt.hint_level for attempt in hinted)
    return f"提示作答：{'、'.join(visible)}{remainder}；共 {len(hinted)} 次，最高等级 {highest}。"


def analyze_campfire(context: AgentContext) -> CampfireOutput:
    attempts = context.attempts
    if not attempts:
        return CampfireOutput(
            headline="本层还没有可复盘的作答",
            facts=("完成一次 SQL 作答后，篝火会在这里整理事实。",),
            focus_concept=None,
            next_action="沿当前课程路线完成一次查询，再回来查看学习记录。",
        )

    correct = sum(attempt.result == "correct" for attempt in attempts)
    accuracy = (correct * 100 + len(attempts) // 2) // len(attempts)
    error_counts = Counter(
        attempt.result for attempt in attempts if attempt.result != "correct"
    )
    latest_by_lesson = {}
    for attempt in attempts:
        latest_by_lesson[attempt.lesson_id] = attempt
    unresolved = [
        attempt for attempt in latest_by_lesson.values() if attempt.result != "correct"
    ]
    focus = max(unresolved, key=lambda attempt: attempt.attempt_id) if unresolved else None

    facts = [f"最近 {len(attempts)} 次作答中，{correct} 次正确，正确率 {accuracy}%。"]
    hint_fact = _hint_fact(context)
    if hint_fact:
        facts.append(hint_fact)
    if error_counts:
        result, count = sorted(
            error_counts.items(),
            key=lambda item: (-item[1], ("missing-concept", "wrong-result", "syntax-error").index(item[0])),
        )[0]
        facts.append(f"最常见问题是{_ERROR_LABELS[result]}，出现 {count} 次。")
    elif context.world_changes:
        facts.append(f"本层已有 {len(context.world_changes)} 项环境变化被记录。")

    return CampfireOutput(
        headline=f"本层作答：{correct}/{len(attempts)} 次正确",
        facts=tuple(facts[:3]),
        focus_concept=_short_label(focus.objective, 80) if focus else None,
        next_action=(
            _ERROR_ACTIONS[focus.result]
            if focus
            else "当前记录均已答对；继续下一课，并保持结果与题意同时成立。"
        ),
    )
