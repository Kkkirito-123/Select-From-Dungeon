/** 验证 Agent 客户端只允许受限 loopback 端点并正确处理失败回退。 */
import { describe, expect, it, vi } from "vitest";
import { AgentClient, loopbackAgentEndpoint } from "../agent/runtime/AgentClient";
import { buildAgentPrepareRequest } from "../agent/runtime/context";
import { buildLocalPreparedOutput } from "../agent/runtime/localFallback";
import { GameSession } from "../src/domain/GameSession";

describe("AgentClient", () => {
  it("只接受显式 loopback 输出服务地址", () => {
    expect(loopbackAgentEndpoint(undefined)).toBeNull();
    expect(loopbackAgentEndpoint("https://agent.example/v1/prepare")).toBeNull();
    expect(loopbackAgentEndpoint("http://127.0.0.1:8787/v1/prepare")).toBe(
      "http://127.0.0.1:8787/v1/prepare",
    );
  });

  it("校验响应与当前证据绑定，非法响应静默回退", async () => {
    const request = buildAgentPrepareRequest(
      new GameSession(null, null, "agent-client-test").snapshot(),
    );
    const valid = buildLocalPreparedOutput(request);
    const fetcher = vi.fn(async () => new Response(JSON.stringify(valid), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const client = new AgentClient(
      "http://localhost:8787/v1/prepare",
      fetcher,
      100,
    );
    expect(await client.prepare(request)).toEqual(valid);

    fetcher.mockImplementationOnce(async () => new Response(JSON.stringify({
      ...valid,
      evidenceHash: "stale",
    }), { status: 200 }));
    expect(await client.prepare(request)).toBeNull();

    fetcher.mockImplementationOnce(async () => new Response(JSON.stringify({
      ...valid,
      command: { grantItem: "forbidden" },
    }), { status: 200 }));
    expect(await client.prepare(request)).toBeNull();
  });
});
