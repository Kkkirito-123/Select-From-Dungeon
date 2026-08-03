/** 验证 SQL 连击/学习节奏的前端展示状态不会越过领域判题边界。 */
import { describe, expect, it } from "vitest";
import { SqlChordTracker } from "../src/ui/SqlChordTracker";

describe("SqlChordTracker", () => {
  it("Q 后按住 S 与 S 后按住 Q 都会触发组合键", () => {
    const chord = new SqlChordTracker();
    expect(chord.keyDown("KeyQ")).toBe(false);
    expect(chord.keyDown("KeyS")).toBe(true);

    chord.reset();
    expect(chord.keyDown("KeyS")).toBe(false);
    expect(chord.keyDown("KeyQ")).toBe(true);
  });

  it("任一键松开或窗口失焦重置后不会误触发", () => {
    const chord = new SqlChordTracker();
    chord.keyDown("KeyQ");
    chord.keyDown("KeyS");
    chord.keyUp("KeyS");
    expect(chord.keyDown("KeyQ")).toBe(false);

    chord.keyDown("KeyS");
    chord.reset();
    expect(chord.keyDown("KeyS")).toBe(false);
    expect(chord.keyDown("KeyA")).toBe(false);
  });
});
