import { describe, expect, it, vi } from "vitest";
import type { CampfireView } from "../src/contracts/agent/campfireReview";
import type { AgentResponse, AgentView } from "../src/contracts/agent/main";
import { AgentGateway } from "../src/infrastructure/agent/AgentGateway";

const evidence: CampfireView = {
  floor: 1,
  aggregate: {
    totalAttempts: 1,
    correctCount: 0,
    accuracy: 0,
    errorCounts: { "missing-concept": 0, "wrong-result": 1, "syntax-error": 0 },
    hintedAttempts: 0,
    highestHintLevel: 0,
  },
  attempts: [],
};

function view(): AgentView {
  return {
    floor: 1,
    event: "campfire-review",
    changedSource: "campfire",
    changed: { source: "campfire", evidenceHash: "a".repeat(64), evidence },
    context: { campfire: null, scribe: null },
  };
}

function response(): AgentResponse {
  return {
    schemaVersion: 1,
    requestId: "request-1",
    composeHash: "b".repeat(64),
    floor: 1,
    event: "campfire-review",
    changedSource: "campfire",
    child: {
      source: "campfire",
      evidenceHash: "a".repeat(64),
      status: "ready",
      content: {
        headline: "本层复盘",
        facts: ["正确率为 0%。"],
        focusConcept: null,
        nextAction: "检查条件。",
        message: "先检查结果。",
      },
    },
    main: { status: "ready", guidance: "继续检查当前记录。" },
    meta: {
      traceId: "c".repeat(32),
      ms: 12,
      calls: [
        { agent: "campfire", mode: "model", status: "ready", ms: 7, tokens: { input: 10, output: 4, total: 14 } },
        { agent: "main", mode: "model", status: "ready", ms: 5, tokens: { input: 8, output: 3, total: 11 } },
      ],
    },
  };
}

describe("AgentGateway", () => {
  it("只调用唯一端点，严格接受 schema v1 meta 且请求不含完整快照", async () => {
    const endpoints: string[] = [];
    let body = "";
    const gateway = new AgentGateway({
      endpoint: "/v1/agent/run",
      digest: async () => "b".repeat(64),
      requestId: () => "request-1",
      fetcher: async (input, init) => {
        endpoints.push(String(input));
        body = String(init?.body);
        return new Response(JSON.stringify(response()));
      },
    });

    const result = await gateway.run(view());

    expect(endpoints).toEqual(["/v1/agent/run"]);
    expect(result?.meta.calls[0]?.tokens.total).toBe(14);
    expect(body).not.toContain("answerSql");
    expect(body).not.toContain("inventory");
    expect(body).not.toContain("snapshot");
  });

  it("未配置端点时不发请求，由运行时使用本地回退", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const gateway = new AgentGateway({ fetcher });

    expect(gateway.canRequest()).toBe(false);
    await expect(gateway.run(view())).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("5 秒后中止请求，并拒绝额外字段", async () => {
    vi.useFakeTimers();
    const gateway = new AgentGateway({
      endpoint: "/v1/agent/run",
      digest: async () => "b".repeat(64),
      requestId: () => "request-1",
      timeoutMs: 5_000,
      fetcher: async (_input, init) => new Promise<Response>((resolve) => {
        init?.signal?.addEventListener("abort", () => resolve(new Response(null, { status: 499 })));
      }),
    });

    const pending = gateway.run(view());
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await pending).toBeNull();
    vi.useRealTimers();

    const invalid = response() as AgentResponse & { extra: boolean };
    invalid.extra = true;
    const strict = new AgentGateway({
      endpoint: "/v1/agent/run",
      digest: async () => "b".repeat(64),
      requestId: () => "request-1",
      fetcher: async () => new Response(JSON.stringify(invalid)),
    });
    expect(await strict.run(view())).toBeNull();
  });

  it("唯一端点返回非法 JSON 时交给运行时本地回退", async () => {
    const gateway = new AgentGateway({
      endpoint: "/v1/agent/run",
      digest: async () => "b".repeat(64),
      requestId: () => "request-1",
      fetcher: async () => new Response("not-json"),
    });

    await expect(gateway.run(view())).resolves.toBeNull();
  });
});
