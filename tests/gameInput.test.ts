/** 验证快捷键在游戏画布与输入控件之间的捕获边界。 */
import { describe, expect, it } from "vitest";
import {
  isGameplayShortcutCaptured,
  parseExternalMoveDetail,
} from "../src/game/gameInput";

describe("game input boundary", () => {
  it("accepts only one-cell cardinal touch movement", () => {
    expect(parseExternalMoveDetail({ dx: 0, dy: -1 })).toEqual({ x: 0, y: -1 });
    expect(parseExternalMoveDetail({ dx: 1, dy: 0 })).toEqual({ x: 1, y: 0 });
    expect(parseExternalMoveDetail({ x: 1, y: 0 })).toBeNull();
    expect(parseExternalMoveDetail({ dx: 1, dy: 1 })).toBeNull();
    expect(parseExternalMoveDetail({ dx: 2, dy: 0 })).toBeNull();
  });

  it("lets interactive UI capture keyboard shortcuts", () => {
    const interactiveTarget = {
      closest: (selector: string) => selector.includes("textarea") ? {} : null,
    } as unknown as EventTarget;
    const canvasTarget = {
      closest: () => null,
    } as unknown as EventTarget;
    const buttonTarget = {
      closest: (selector: string) => selector.includes("button") ? {} : null,
    } as unknown as EventTarget;

    expect(isGameplayShortcutCaptured(interactiveTarget)).toBe(true);
    expect(isGameplayShortcutCaptured(canvasTarget)).toBe(false);
    expect(isGameplayShortcutCaptured(buttonTarget)).toBe(false);
    expect(isGameplayShortcutCaptured(null)).toBe(false);
  });
});
