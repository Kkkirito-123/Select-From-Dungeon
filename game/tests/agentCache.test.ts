import { describe, expect, it } from "vitest";
import { AgentCache } from "../src/application/agent/AgentCache";
import type { CampfireAgentContent } from "../src/contracts/agent/campfireReview";

const content: CampfireAgentContent = {
  headline: "复盘",
  facts: [],
  focusConcept: null,
  nextAction: "继续",
  message: "保持节奏",
};

describe("AgentCache", () => {
  it("三类 Map 独立，并按 ready/local TTL 过期", () => {
    let now = 0;
    const cache = new AgentCache(() => now);
    cache.set("campfire", "same", content, "ready");
    expect(cache.get("campfire", "same")).toEqual(content);
    expect(cache.get("scribe", "same")).toBeNull();

    now = 30_001;
    expect(cache.get("campfire", "same")).toEqual(content);
    cache.set("campfire", "local", content, "fallback");
    now += 30_001;
    expect(cache.get("campfire", "local")).toBeNull();

    now = 600_001;
    expect(cache.get("campfire", "same")).toBeNull();
  });

  it("每类最多保留 32 条并淘汰最旧项", () => {
    let now = 0;
    const cache = new AgentCache(() => now);
    for (let index = 0; index < 33; index += 1) {
      now = index;
      cache.set("campfire", String(index), content, "ready");
    }

    expect(cache.size("campfire")).toBe(32);
    expect(cache.get("campfire", "0")).toBeNull();
    expect(cache.get("campfire", "32")).toEqual(content);
  });
});
