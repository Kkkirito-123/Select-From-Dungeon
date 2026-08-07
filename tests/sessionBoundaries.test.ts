import { describe, expect, it } from "vitest";
import {
  movementFailure,
  movementModeIsBlocked,
} from "../src/domain/session/sessionExploration";
import { applyExperienceSettlement } from "../src/domain/session/sessionProgression";

describe("GameSession 内部职责边界", () => {
  it("移动门面使用稳定的失败结果", () => {
    expect(movementModeIsBlocked("combat")).toBe(true);
    expect(movementModeIsBlocked("explore")).toBe(false);
    expect(movementFailure({ x: 1, y: 2 }, { x: 2, y: 2 }, "wall", "blocked"))
      .toMatchObject({ ok: false, moved: false, blockedBy: "wall", encounterId: null });
  });

  it("升级计算只修改显式传入的玩家经验状态", () => {
    const player = { hp: 1, maxHp: 2, level: 1, xp: 0 };
    const settlement = applyExperienceSettlement(
      { id: 7, name: "史莱姆", rank: "normal" } as never,
      player,
      {
        experienceForRank: () => 10,
        levelForXp: (xp) => xp >= 10 ? 2 : 1,
        maxHpForLevel: (level) => level >= 2 ? 3 : 2,
      },
    );
    expect(settlement).toMatchObject({ gained: 10, previousLevel: 1, currentLevel: 2 });
    expect(player).toEqual({ hp: 2, maxHp: 3, level: 2, xp: 10 });
  });
});
