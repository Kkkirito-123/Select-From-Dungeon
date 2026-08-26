import { describe, expect, it } from "vitest";
import {
  movementFailure,
  movementModeIsBlocked,
} from "../src/domain/session/sessionExploration";
import { applyExperienceSettlement } from "../src/domain/session/sessionProgression";
import {
  advanceCombatSuccessStep,
  resolveCombatHit,
} from "../src/domain/session/combat/resolveCombatHit";
import { livingRequiredBoss } from "../src/domain/session/progression/regionAccess";
import {
  isReadOnlyAdminPreview,
  resolveCampaignVictory,
} from "../src/domain/session/progression/floorCompletion";
import { resolveLessonCompletion } from "../src/domain/session/learning/lessonCompletion";
import { createCampaignProgress } from "../src/domain/progression/campaign";

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

  it("战斗生命服务只在非最终阶段保留 1 HP", () => {
    expect(advanceCombatSuccessStep(0)).toBe(1);
    expect(advanceCombatSuccessStep(4)).toBe(5);
    expect(resolveCombatHit({
      currentHp: 6,
      weaponDamage: 20,
      armor: 0,
      nextSuccessStep: 1,
      totalStages: 2,
    })).toEqual({ minimumHp: 1, damage: 5, remainingHp: 1 });
    expect(resolveCombatHit({
      currentHp: 1,
      weaponDamage: 20,
      armor: 0,
      nextSuccessStep: 2,
      totalStages: 2,
    })).toEqual({ minimumHp: 0, damage: 1, remainingHp: 0 });
  });

  it("死亡的区域首领不再阻挡通道", () => {
    const dead = { id: 9, hp: 0 } as never;
    const living = { id: 10, hp: 1 } as never;
    expect(livingRequiredBoss([dead, living], 9)).toBeNull();
    expect(livingRequiredBoss([dead, living], 10)).toBe(living);
  });

  it("管理员预览与 Agent 试玩保持单向边界", () => {
    expect(isReadOnlyAdminPreview(true, false)).toBe(true);
    expect(isReadOnlyAdminPreview(true, true)).toBe(false);
    expect(isReadOnlyAdminPreview(false, false)).toBe(false);
  });

  it("终局提交只增加一次胜利并保留最佳查询数", () => {
    const result = resolveCampaignVictory({
      campaign: createCampaignProgress("session-boundary", 8),
      victories: 2,
      bestRunQueries: 20,
      queryCount: 15,
    });
    expect(result.campaign.status).toBe("completed");
    expect(result.victories).toBe(3);
    expect(result.bestRunQueries).toBe(15);
    expect(() => resolveCampaignVictory({
      campaign: result.campaign,
      victories: result.victories,
      bestRunQueries: result.bestRunQueries,
      queryCount: 15,
    })).toThrow(/终局无法提交/u);
  });

  it("课程完成只登记学习事实，不重置怪物生命", () => {
    const monster = { id: 5, hp: 1, maxHp: 24 } as never;
    const monsters = [monster];
    const result = resolveLessonCompletion({
      lessonId: "having",
      roomId: "lesson:having",
      completedLessons: new Set(),
      completedRoomIds: new Set(),
      masteredLessons: [],
      monsters,
    });
    expect(result.completedLessons.has("having")).toBe(true);
    expect(result.completedRoomIds.has("lesson:having")).toBe(true);
    expect(result.masteredLessons).toEqual(["having"]);
    expect(result.monsters).toEqual([monster]);
    expect(result.monsters).not.toBe(monsters);
  });
});
