/**
 * 当前楼层的篝火复盘规则。
 *
 * 本模块只读取 GameSession 发布的快照字段，统计 SQL 作答和楼层世界变化，
 * 不访问 DOM、存档、网络或模型，也不修改游戏状态。
 */
import type { CampfireReview } from "../../contracts/game/results";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type {
  AnswerAttemptRecord,
  AnswerResult,
  Monster,
} from "../shared/types";
import { floorWorldStateFromSnapshot } from "../progression/floorWorldState";
import type { FloorNumber, RunLessonId } from "../progression/runGraph";

const ERROR_LABELS: Record<Exclude<AnswerResult, "correct">, string> = {
  "missing-concept": "关键概念缺失",
  "wrong-result": "结果集合不符",
  "syntax-error": "SQL 语法错误",
};

const ERROR_ACTIONS: Record<Exclude<AnswerResult, "correct">, string> = {
  "missing-concept": "下一次先圈出题目要求的 SQL 结构，再检查它是否真的出现在查询中。",
  "wrong-result": "对照目标字段与筛选条件，先解释多了哪些行、少了哪些行，再改查询。",
  "syntax-error": "先从报错位置向前检查关键字、逗号、括号和别名，再提交下一次查询。",
};

export interface CampfireReviewInput {
  floor: FloorNumber;
  floorReview: readonly AnswerAttemptRecord[];
  monsters: readonly Monster[];
  completedLessons: readonly RunLessonId[];
  openedGateIds: readonly string[];
  discoveredMonsterIds: readonly number[];
  keyItems: readonly string[];
  visitedRoomIds: readonly string[];
  activeCampfireId: string | null;
}

/**
 * 把游戏快照投影为本地篝火复盘所需字段。
 *
 * 复盘规则和 Agent Hook 共用这条投影，避免两处分别决定哪些游戏事实可以
 * 进入当前楼层复盘；投影本身只读，不产生存档或网络副作用。
 */
export function campfireReviewInput(snapshot: GameSnapshot): CampfireReviewInput {
  return {
    floor: snapshot.floor,
    floorReview: snapshot.floorReview,
    monsters: snapshot.monsters,
    completedLessons: snapshot.completedLessons,
    openedGateIds: snapshot.openedGateIds,
    discoveredMonsterIds: snapshot.profile.discoveredMonsterIds,
    keyItems: snapshot.keyItems,
    visitedRoomIds: snapshot.visitedRoomIds,
    activeCampfireId: snapshot.activeCampfireId,
  };
}

function shortLabel(value: string, maximum = 24): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function hintFact(attempts: readonly AnswerAttemptRecord[]): string | null {
  const hinted = attempts.filter((attempt) => attempt.hintLevel > 0);
  if (hinted.length === 0) return null;

  const byStage = new Map<string, {
    objective: string;
    count: number;
    latestAttemptId: number;
  }>();
  hinted.forEach((attempt) => {
    const current = byStage.get(attempt.stageId);
    byStage.set(attempt.stageId, {
      objective: attempt.stageObjective,
      count: (current?.count ?? 0) + 1,
      latestAttemptId: Math.max(current?.latestAttemptId ?? 0, attempt.id),
    });
  });

  const stages = [...byStage.entries()].sort((left, right) => (
    right[1].count - left[1].count ||
    right[1].latestAttemptId - left[1].latestAttemptId ||
    left[0].localeCompare(right[0])
  ));
  const visible = stages.slice(0, 2).map(([, stage]) => (
    `${shortLabel(stage.objective)} ×${stage.count}`
  ));
  const remaining = stages.length - visible.length;
  return `提示作答：${visible.join("、")}${remaining > 0 ? `，另 ${remaining} 题` : ""}；共 ${hinted.length} 次，最高等级 ${Math.max(...hinted.map((entry) => entry.hintLevel))}。`;
}

function worldChangeCount(input: CampfireReviewInput): number {
  const current = floorWorldStateFromSnapshot({
    floor: input.floor,
    completedLessons: input.completedLessons,
    monsters: input.monsters,
    openedGateIds: input.openedGateIds,
    profile: { discoveredMonsterIds: input.discoveredMonsterIds },
    keyItems: input.keyItems,
    visitedRoomIds: input.visitedRoomIds,
    activeCampfireId: input.activeCampfireId,
  });
  const baseline = floorWorldStateFromSnapshot({
    floor: input.floor,
    completedLessons: [],
    monsters: input.monsters.map((monster) => ({ id: monster.id, hp: monster.maxHp })),
    openedGateIds: [],
    profile: { discoveredMonsterIds: [] },
    keyItems: [],
    visitedRoomIds: [],
    activeCampfireId: null,
  });
  if (!current || !baseline) return 0;

  const currentValues = current as unknown as Record<string, unknown>;
  const baselineValues = baseline as unknown as Record<string, unknown>;
  return Object.keys(currentValues).filter((key) => key !== "floor" && (
    currentValues[key] !== baselineValues[key]
  )).length;
}

/**
 * 生成篝火菜单使用的复盘结果。
 *
 * 复盘只筛选当前楼层记录，并要求当前楼层精英已经被击败；这个门槛与
 * 游戏 UI 的可用状态一致，避免跨楼层或未解锁内容提前泄露。
 */
export function buildCampfireReview(input: CampfireReviewInput): CampfireReview {
  const attempts = input.floorReview.filter((attempt) => attempt.floor === input.floor);
  const campfireUnlocked = input.monsters.some((monster) => (
    monster.floor === input.floor && monster.rank === "elite" && monster.hp <= 0
  ));

  if (!campfireUnlocked) {
    return {
      available: false,
      headline: "篝火尚未收录本层复盘",
      facts: ["击败本层精英后，篝火才会整理当前楼层的作答记录。"],
      focusConcept: null,
      nextAction: "沿抄写员指引的路线寻找本层精英。",
    };
  }
  if (attempts.length === 0) {
    return {
      available: true,
      headline: "本层还没有可复盘的作答",
      facts: ["完成一次 SQL 作答后，篝火会在这里整理事实。"],
      focusConcept: null,
      nextAction: "沿当前课程路线完成一次查询，再回来查看学习记录。",
    };
  }

  const correct = attempts.filter((attempt) => attempt.result === "correct").length;
  const accuracy = Math.round((correct / attempts.length) * 100);
  const errorCounts = new Map<Exclude<AnswerResult, "correct">, number>();
  const latestByLesson = new Map<string, AnswerAttemptRecord>();
  attempts.forEach((attempt) => {
    latestByLesson.set(attempt.lessonId, attempt);
    if (attempt.result !== "correct") {
      errorCounts.set(attempt.result, (errorCounts.get(attempt.result) ?? 0) + 1);
    }
  });

  const unresolved = [...latestByLesson.values()].filter(
    (attempt) => attempt.result !== "correct",
  );
  const focus = unresolved.sort((left, right) => left.id - right.id).at(-1) ?? null;
  const facts = [`最近 ${attempts.length} 次作答中，${correct} 次正确，正确率 ${accuracy}%。`];
  const hinted = hintFact(attempts);
  if (hinted) facts.push(hinted);

  const errorOrder: readonly Exclude<AnswerResult, "correct">[] = [
    "missing-concept",
    "wrong-result",
    "syntax-error",
  ];
  const commonError = [...errorCounts.entries()].sort((left, right) => (
    right[1] - left[1] || errorOrder.indexOf(left[0]) - errorOrder.indexOf(right[0])
  ))[0];
  if (commonError) {
    facts.push(`最常见问题是${ERROR_LABELS[commonError[0]]}，出现 ${commonError[1]} 次。`);
  } else {
    const changes = worldChangeCount(input);
    if (changes > 0) facts.push(`本层已有 ${changes} 项环境变化被记录。`);
  }

  return {
    available: true,
    headline: `本层作答：${correct}/${attempts.length} 次正确`,
    facts: facts.slice(0, 3),
    focusConcept: focus ? shortLabel(focus.stageObjective, 80) : null,
    nextAction: focus && focus.result !== "correct"
      ? ERROR_ACTIONS[focus.result]
      : "当前记录均已答对；继续下一课，并保持结果与题意同时成立。",
  };
}
