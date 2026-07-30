import { describe, expect, it } from "vitest";
import {
  landmarkActionVerb,
  landmarkInteractionLabel,
  shouldRenderPassiveFeature,
} from "../src/game/worldVisualLanguage";

describe("world visual language", () => {
  it("uses direct verbs for each interactive landmark role", () => {
    expect(landmarkActionVerb("sql-seal")).toBe("解读");
    expect(landmarkActionVerb("transit")).toBe("启动");
    expect(landmarkActionVerb("shortcut")).toBe("开启");
    expect(landmarkActionVerb("world-machine")).toBe("调查");
  });

  it("reveals the E action only when the player is nearby", () => {
    const landmark = {
      name: "执行计划巨树",
      kind: "world-machine" as const,
      interaction: "读取执行计划",
    };
    expect(landmarkInteractionLabel({ ...landmark, nearby: false }))
      .toBe("执行计划巨树");
    expect(landmarkInteractionLabel({ ...landmark, nearby: true }))
      .toBe("E · 调查执行计划巨树");
  });

  it("thins passive biome features without random flicker", () => {
    expect([0, 1, 2, 3, 4].filter(shouldRenderPassiveFeature))
      .toEqual([0, 2, 4]);
  });
});
