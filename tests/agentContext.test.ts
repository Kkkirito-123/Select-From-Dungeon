/** 验证 Agent 输入上下文只包含筛选后的作答证据和稳定摘要。 */
import { describe, expect, it } from "vitest";
import { buildAgentPrepareRequest } from "../agent/runtime/context";
import { buildLocalCampfireOutput } from "../agent/runtime/localFallback";
import { GameSession } from "../src/domain/GameSession";
import type { AnswerAttemptRecord, GameSnapshot } from "../src/domain/types";

function attempt(
  id: number,
  overrides: Partial<AnswerAttemptRecord> = {},
): AnswerAttemptRecord {
  return {
    id,
    battleId: 1,
    floor: 1,
    monsterId: 1,
    monsterName: "不应进入 Agent 字段的名字",
    lessonId: "where",
    stageId: "where-target",
    stageObjective: "只保留目标记录",
    round: id,
    sql: `SELECT id FROM monsters WHERE id = ${id}`,
    answerSql: "SELECT id FROM monsters WHERE id = 1",
    result: id % 2 === 0 ? "correct" : "wrong-result",
    outcome: id % 2 === 0 ? "hit" : "countered",
    feedback: "不应进入 Agent 字段的反馈",
    hintLevel: id % 3,
    ...overrides,
  };
}

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    ...new GameSession(null, null, "agent-context-test").snapshot(),
    ...overrides,
  };
}

describe("Agent evidence projection", () => {
  it("优先选择错误、提示和重复薄弱证据，且不创建怪物身份或反馈字段", () => {
    const source = snapshot({
      floorReview: Array.from({ length: 10 }, (_, index) => attempt(index + 1)),
    });
    const request = buildAgentPrepareRequest(source);

    expect(request.attempts.map((entry) => entry.attemptId)).toEqual([
      1, 2, 3, 5, 7, 8, 9, 10,
    ]);
    expect(request.runId).toBe(source.runInstanceId);
    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain("monsterName");
    expect(serialized).not.toContain("monsterId");
    expect(serialized).not.toContain("不应进入 Agent 字段的名字");
    expect(serialized).not.toContain("不应进入 Agent 字段的反馈");
  });

  it("移动与按键无关快照不会改变证据哈希", () => {
    const base = snapshot({ floorReview: [attempt(1)] });
    const moved = {
      ...base,
      totalMoves: base.totalMoves + 20,
      stepsSinceEncounter: base.stepsSinceEncounter + 5,
      player: { ...base.player, x: base.player.x + 1 },
      banner: "移动后的提示",
    };

    expect(buildAgentPrepareRequest(moved).evidenceHash).toBe(
      buildAgentPrepareRequest(base).evidenceHash,
    );
  });

  it("发送前只保留 SQL 特征与有界题目文本", () => {
    const request = buildAgentPrepareRequest(snapshot({
      floorReview: [attempt(1, {
        sql: "S".repeat(5_000),
        answerSql: "A".repeat(5_000),
        stageObjective: "O".repeat(600),
      })],
    }));

    expect(request.attempts[0].sqlFeatures).toEqual([]);
    expect(JSON.stringify(request)).not.toContain("S".repeat(100));
    expect(request.attempts[0].objective).toHaveLength(500);
  });

  it("课程或作答证据变化会产生新哈希", () => {
    const base = snapshot({ floorReview: [attempt(1)] });
    const next: GameSnapshot = { ...base, completedLessons: ["select"] };

    expect(buildAgentPrepareRequest(next).evidenceHash).not.toBe(
      buildAgentPrepareRequest(base).evidenceHash,
    );
  });

  it("篝火按题目统计提示作答，并把最新未解决目标作为关注点", () => {
    const records = [
      attempt(1, { stageId: "where-target", stageObjective: "筛选北侧记录", hintLevel: 2 }),
      attempt(2, { stageId: "where-weakness", stageObjective: "筛选南侧记录", hintLevel: 1 }),
      attempt(3, { stageId: "where-target", stageObjective: "筛选北侧记录", hintLevel: 1 }),
    ];
    const base = snapshot({ floorReview: records });
    const output = buildLocalCampfireOutput(buildAgentPrepareRequest(snapshot({
      ...base,
      monsters: base.monsters.map((monster) => monster.id === 4 ? { ...monster, hp: 0 } : monster),
    })));

    expect(output.facts.find((fact) => fact.includes("提示作答"))).toContain(
      "筛选北侧记录 ×2",
    );
    expect(output.focusConcept).toBe("筛选北侧记录");
  });
});
