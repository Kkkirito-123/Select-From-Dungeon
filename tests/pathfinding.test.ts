import { describe, expect, it } from "vitest";
import { findGridPath } from "../src/domain/pathfinding";

describe("findGridPath", () => {
  it("绕过障碍找到目标", () => {
    const blocked = new Set(["1,0"]);
    const path = findGridPath(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      (x, y) => x >= 0 && y >= 0 && x <= 2 && y <= 1 && !blocked.has(`${x},${y}`),
    );

    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 0 },
    ]);
  });
});
