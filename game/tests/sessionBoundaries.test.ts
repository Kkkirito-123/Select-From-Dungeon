import { describe, expect, it } from "vitest";
import { NAVIGATION_RUNTIME_CONFIG } from "../src/contracts/config/runtime";
import { GameSession } from "../src/features/game-session/GameSession";
import {
  movementFailure,
  movementModeIsBlocked,
} from "../src/domain/session/sessionExploration";
import { createCombatState } from "../src/domain/session/sessionCombat";
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
import { advanceNavigationGuidance } from "../src/domain/session/exploration/navigationGuidance";
import {
  createAdminFloorPreview,
  resolveAdminPreset,
  resolveAdminRegion,
} from "../src/domain/session/admin/adminPreview";
import { createCampaignProgress } from "../src/domain/progression/campaign";

describe("GameSession 内部职责边界", () => {
  it("导航引导只返回下一状态，不修改输入快照", () => {
    const snapshot = new GameSession(null, null, "guidance-boundary").snapshot();
    const objective = snapshot.roomGraph.nodes.find((node) => node.lessonId === "select");
    if (!objective) throw new Error("测试图缺少 SELECT 引导目标");
    const state = {
      objectiveId: objective.id,
      steps: NAVIGATION_RUNTIME_CONFIG.directionHintAt - 1,
      level: 0 as const,
    };
    const result = advanceNavigationGuidance({
      floor: snapshot.floor,
      graph: snapshot.roomGraph,
      mazeFloor: snapshot.mazeFloor,
      biomePlan: snapshot.biomePlan,
      monsters: snapshot.monsters,
      completedLessons: new Set(snapshot.completedLessons),
      openedGateIds: new Set(snapshot.openedGateIds),
      player: snapshot.player,
      currentRoomId: snapshot.currentRoomId,
    }, state);

    expect(state).toEqual({
      objectiveId: objective.id,
      steps: NAVIGATION_RUNTIME_CONFIG.directionHintAt - 1,
      level: 0,
    });
    expect(result).toMatchObject({
      state: {
        objectiveId: objective.id,
        steps: NAVIGATION_RUNTIME_CONFIG.directionHintAt,
        level: 1,
      },
      raised: true,
      banner: expect.stringContaining("余烬指路"),
    });
  });

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

  it("初始战斗状态复制首题锁定条件", () => {
    const locks = ["where"];
    const combat = createCombatState(
      {
        id: 7,
        attackName: "撞击",
        damage: 2,
        rank: "normal",
        encounterType: "ambush",
      } as never,
      { locks } as never,
    );
    locks.push("order-by");
    expect(combat).toMatchObject({
      targetId: 7,
      kind: "ambush",
      round: 1,
      successStep: 0,
      intent: { name: "撞击", locks: ["where"] },
    });
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

  it("管理员预览计算返回显式状态且不修改输入", () => {
    const snapshot = new GameSession(null, null, "admin-boundary").snapshot();
    const originalPlayer = { ...snapshot.player, weapon: { ...snapshot.player.weapon } };
    const preview = createAdminFloorPreview(
      snapshot.campaign.baseSeed,
      2,
      snapshot.player,
    );
    if (!preview) throw new Error("测试缺少第二层管理员预览");
    expect(snapshot.player).toEqual(originalPlayer);
    expect(preview).toMatchObject({ floor: 2, currentRoomId: preview.graph.entryId });

    const originalHp = preview.monsters.map((monster) => monster.hp);
    const preset = resolveAdminPreset({
      floor: preview.floor,
      presetId: "f2-admin-village",
      graph: preview.graph,
      mazeFloor: preview.mazeFloor,
      campfires: preview.campfires,
      guidedMap: preview.guidedMap,
      monsters: preview.monsters,
      worldActors: preview.worldActors,
    });
    expect(preview.monsters.map((monster) => monster.hp)).toEqual(originalHp);
    expect(preset).toMatchObject({ ok: true, label: "F2 沉水村落" });
    if (!preset.ok) throw new Error(preset.message);

    const region = resolveAdminRegion({
      regionId: preview.biomePlan.regions[1].id,
      biomePlan: preview.biomePlan,
      mazeFloor: preview.mazeFloor,
      campfires: preview.campfires,
      monsters: preset.monsters,
      worldActors: preview.worldActors,
      player: preview.player,
    });
    expect(region).toMatchObject({ ok: true, toName: preview.biomePlan.regions[1].name });
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
