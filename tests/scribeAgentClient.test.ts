import { describe, expect, it } from "vitest";
import type {
  ScribeAgentRequest,
  ScribePrompt,
} from "../src/contracts/agent/scribe";
import { HttpScribeAgentClient } from "../src/infrastructure/agent/ScribeAgentClient";

function prompt(): ScribePrompt {
  return {
    floor: 1,
    scene: "interaction",
    scribeId: "npc-scribe-f1",
    topic: "档案厅",
    authoredMessage: "先检查当前目标。",
    learning: {
      lessonId: "select",
      stageId: "select-name",
      objective: "读取目标记录",
      requiredColumns: ["id", "status"],
      submittedColumns: ["id"],
      missingColumns: ["status"],
      unexpectedColumns: [],
      brokenConcepts: ["SELECT"],
      remainingConcepts: ["字段投影"],
      resultCategory: "missing-concept",
      hintLevel: 1,
      safeHintId: "hint:select:select-name:1",
    },
    navigation: null,
    death: null,
  };
}

describe("抄写员 Agent 客户端边界", () => {
  it("只发送投影证据，并按证据哈希复用请求", async () => {
    let requestCount = 0;
    const requests: ScribeAgentRequest[] = [];
    const client = new HttpScribeAgentClient({
      endpoint: "http://127.0.0.1:8787/v1/scribe/respond",
      requestId: () => "scribe-request-1",
      digest: async () => "a".repeat(64),
      fetcher: async (_input, init) => {
        requestCount += 1;
        requests.push(JSON.parse(String(init?.body)) as ScribeAgentRequest);
        return {
          ok: true,
          json: async () => ({
            schemaVersion: 1,
            requestId: "scribe-request-1",
            evidenceHash: "a".repeat(64),
            headline: "抄写员提示",
            facts: ["缺少 status"],
            nextAction: "先补齐题目要求的字段。",
            safeHintId: "hint:select:select-name:1",
            message: "先检查字段列表。",
          }),
        } as Response;
      },
    });

    const first = await client.respond(prompt());
    const second = await client.respond(prompt());

    expect(first?.headline).toBe("抄写员提示");
    expect(second).toBe(first);
    expect(requestCount).toBe(1);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.scene).toBe("interaction");
    expect(request.learning?.missingColumns).toEqual(["status"]);
    expect(JSON.stringify(request)).not.toContain("answerSql");
    expect(JSON.stringify(request)).not.toContain("submittedSql");
    expect(JSON.stringify(request)).not.toContain("GameSnapshot");
  });

  it("拒绝与学习证据不匹配的 safeHintId", async () => {
    const client = new HttpScribeAgentClient({
      endpoint: "http://127.0.0.1:8787/v1/scribe/respond",
      digest: async () => "b".repeat(64),
      requestId: () => "scribe-request-2",
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          requestId: "scribe-request-2",
          evidenceHash: "b".repeat(64),
          headline: "不应显示",
          facts: [],
          nextAction: "不应显示",
          safeHintId: "hint:other",
          message: "不应显示",
        }),
      } as Response),
    });

    expect(await client.respond(prompt())).toBeNull();
  });
});
