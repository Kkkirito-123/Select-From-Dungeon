import { describe, expect, it } from "vitest";
import { AgentCache } from "../agent/runtime/AgentCache";
import { buildAgentPrepareRequest } from "../agent/runtime/context";
import { AGENT_OUTPUT_CACHE_KEY } from "../agent/runtime/contracts";
import { buildLocalPreparedOutput } from "../agent/runtime/localFallback";
import { GameSession } from "../src/domain/GameSession";
import type { StorageLike } from "../src/storage/localProgress";

function memoryStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("AgentCache", () => {
  it("独立保存已验证输出且不保存原始 SQL 证据", () => {
    const storage = memoryStorage();
    const cache = new AgentCache(storage, AGENT_OUTPUT_CACHE_KEY, () => 100);
    const request = buildAgentPrepareRequest(
      new GameSession(null, null, "agent-cache-test").snapshot(),
    );
    const output = buildLocalPreparedOutput(request);
    cache.put(output);

    expect(cache.get(request)).toEqual(output);
    const raw = storage.values.get(AGENT_OUTPUT_CACHE_KEY) ?? "";
    expect(raw).not.toContain("submittedSql");
    expect(raw).not.toContain("referenceSql");
  });

  it("损坏或版本不明的缓存按未命中处理", () => {
    const storage = memoryStorage();
    const request = buildAgentPrepareRequest(
      new GameSession(null, null, "agent-cache-invalid").snapshot(),
    );
    storage.setItem(AGENT_OUTPUT_CACHE_KEY, "{broken");
    expect(new AgentCache(storage).get(request)).toBeNull();

    storage.setItem(AGENT_OUTPUT_CACHE_KEY, JSON.stringify({ version: 99, entries: [] }));
    expect(new AgentCache(storage).get(request)).toBeNull();
  });
});
