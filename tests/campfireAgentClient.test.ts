import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/session/GameSession";
import type { AnswerAttemptRecord, GameSnapshot } from "../src/domain/shared/types";
import type { FloorNumber } from "../src/domain/progression/runGraph";
import type { CampfireAgentRequest } from "../src/contracts/agent/campfireReview";
import { HttpCampfireAgentClient } from "../src/infrastructure/agent/CampfireAgentClient";

function attempt(id: number, floor: FloorNumber = 1): AnswerAttemptRecord {
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
    sql: `SELECT name FROM monsters WHERE id = ${id}`,
    answerSql: "SELECT name FROM monsters WHERE id = 1",
    result: id % 3 === 0 ? "wrong-result" : "correct",
    outcome: id % 3 === 0 ? "countered" : "hit",
    feedback: "本地反馈不应进入 Agent 请求",
    hintLevel: id % 3 === 0 ? 1 : 0,
  };
}

function snapshotWithAttempts(attempts: AnswerAttemptRecord[]): GameSnapshot {
  const snapshot = new GameSession(null, null, "campfire-agent-client-test").snapshot();
  return { ...snapshot, floorReview: attempts };
}

describe("篝火 Agent 客户端边界", () => {
  it("只投影当前层最近八条 SQL，并按证据哈希缓存请求", async () => {
    let requestCount = 0;
    const requests: CampfireAgentRequest[] = [];
    const client = new HttpCampfireAgentClient({
      endpoint: "http://127.0.0.1:8787/v1/campfire/review",
      requestId: () => "request-1",
      digest: async () => "a".repeat(64),
      fetcher: async (_input, init) => {
        requestCount += 1;
        requests.push(JSON.parse(String(init?.body)) as CampfireAgentRequest);
        return {
          ok: true,
          json: async () => ({
            schemaVersion: 1,
            requestId: "request-1",
            evidenceHash: "a".repeat(64),
            headline: "本层 SQL 复盘",
            facts: ["当前层记录"],
            focusConcept: "读取怪物名称",
            nextAction: "继续检查结果语义",
            message: "保持先读题再写 SQL。",
          }),
        } as Response;
      },
    });
    const snapshot = snapshotWithAttempts([
      ...Array.from({ length: 10 }, (_, index) => attempt(index + 1)),
      attempt(99, 2),
    ]);

    const first = await client.review(snapshot);
    const second = await client.review(snapshot);

    expect(first?.headline).toBe("本层 SQL 复盘");
    expect(second).toBe(first);
    expect(requestCount).toBe(1);
    if (requests.length !== 1) throw new Error("测试请求数量不正确");
    const request = requests[0];
    expect(request.floor).toBe(1);
    expect(request.aggregate.totalAttempts).toBe(10);
    expect(request.attempts).toHaveLength(8);
    expect(request.attempts[0]?.attemptId).toBe(3);
    expect(request.attempts.every((entry) => !Object.hasOwn(entry, "answerSql"))).toBe(true);
    expect(request.attempts.every((entry) => !Object.hasOwn(entry, "feedback"))).toBe(true);
  });

  it("没有当前层作答时不发请求，响应哈希不匹配时回退 null", async () => {
    let requestCount = 0;
    const client = new HttpCampfireAgentClient({
      endpoint: "http://127.0.0.1:8787/v1/campfire/review",
      digest: async () => "b".repeat(64),
      fetcher: async () => {
        requestCount += 1;
        return {
          ok: true,
          json: async () => ({
            schemaVersion: 1,
            requestId: "generated-id",
            evidenceHash: "c".repeat(64),
            headline: "错误响应",
            facts: [],
            focusConcept: null,
            nextAction: "不应显示",
            message: "不应显示",
          }),
        } as Response;
      },
    });

    expect(await client.review(snapshotWithAttempts([]))).toBeNull();
    expect(requestCount).toBe(0);
    expect(await client.review(snapshotWithAttempts([attempt(1)]))).toBeNull();
    expect(requestCount).toBe(1);
  });
});
