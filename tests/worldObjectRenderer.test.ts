import { describe, expect, it } from "vitest";
import { WorldObjectRenderer } from "../src/presentation/phaser/world/WorldObjectRenderer";

describe("WorldObjectRenderer visibility boundary", () => {
  it("requires discovery before an object can be shown", () => {
    const renderer = new WorldObjectRenderer();
    const position = { x: 4, y: 8 };
    const discovered = new Set(["4:8"]);
    expect(renderer.isDiscovered(discovered, position)).toBe(true);
    expect(renderer.isVisible(discovered, new Set(["4:8"]), position)).toBe(true);
    expect(renderer.isVisible(discovered, new Set(["5:8"]), position)).toBe(false);
  });
});
