import { describe, expect, it } from "vitest";
import { buildCampfireReview, type CampfireReviewInput } from "../src/domain/learning/campfireReview";
import { GameSession } from "../src/domain/session/GameSession";
import type { AnswerAttemptRecord } from "../src/domain/shared/types";
import type { FloorNumber } from "../src/domain/progression/runGraph";

function source(): CampfireReviewInput {
  const snapshot = new GameSession(null, null, "campfire-review-test").snapshot();
  return {
    floor: snapshot.floor,
    floorReview: [],
    monsters: snapshot.monsters,
    completedLessons: snapshot.completedLessons,
    openedGateIds: snapshot.openedGateIds,
    discoveredMonsterIds: snapshot.profile.discoveredMonsterIds,
    keyItems: snapshot.keyItems,
    visitedRoomIds: snapshot.visitedRoomIds,
    activeCampfireId: snapshot.activeCampfireId,
  };
}

function unlocked(input: CampfireReviewInput): CampfireReviewInput {
  return {
    ...input,
    monsters: input.monsters.map((monster) => (
      monster.floor === input.floor && monster.rank === "elite"
        ? { ...monster, hp: 0 }
        : monster
    )),
  };
}

function attempt(
  id: number,
  result: AnswerAttemptRecord["result"],
  floor: FloorNumber = 1,
  overrides: Partial<AnswerAttemptRecord> = {},
): AnswerAttemptRecord {
  return {
    id,
    battleId: id,
    floor,
    monsterId: 1,
    monsterName: "史莱姆",
    lessonId: "select",
    stageId: "select-name",
    stageObjective: "读取怪物名称",
    round: 1,
    sql: "SELECT name FROM monsters",
    answerSql: "SELECT name FROM monsters WHERE id = 1",
    result,
    outcome: result === "correct" ? "hit" : "countered",
    feedback: "测试记录",
    hintLevel: result === "correct" ? 0 : 1,
    ...overrides,
  };
}

describe("篝火本地 SQL 复盘", () => {
  it("本层精英未击败时不开放复盘", () => {
    const review = buildCampfireReview(source());

    expect(review.available).toBe(false);
    expect(review.headline).toContain("尚未收录");
  });

  it("只统计当前楼层，并分类错误和提示", () => {
    const input = unlocked(source());
    const review = buildCampfireReview({
      ...input,
      floorReview: [
        attempt(1, "correct"),
        attempt(2, "wrong-result", 1, { stageObjective: "筛选符合条件的记录" }),
        attempt(3, "syntax-error", 2),
      ],
    });

    expect(review.available).toBe(true);
    expect(review.headline).toBe("本层作答：1/2 次正确");
    expect(review.facts.join("\n")).toContain("正确率 50%");
    expect(review.facts.join("\n")).toContain("结果集合不符");
    expect(review.facts.join("\n")).toContain("提示作答");
    expect(review.focusConcept).toBe("筛选符合条件的记录");
  });

  it("精英已击败但没有作答时返回固定可行动文案", () => {
    const review = buildCampfireReview(unlocked(source()));

    expect(review.available).toBe(true);
    expect(review.headline).toContain("还没有可复盘");
    expect(review.nextAction).toContain("完成一次查询");
  });
});
