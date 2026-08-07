/**
 * Run v4-v12 迁移链与顺序协调器。
 *
 * 本模块只处理旧字段到当前格式的内存转换，并固定“当前值、v11 当前旧键、
 * v10 到 v4”的尝试顺序；浏览器存储读写和最终结构校验仍由 localProgress 负责。
 */
import type { SavedRun } from "../../contracts/game/persistence";
import { biomeEncounterFor } from "../../content/world/biomeContent";
import { QUESTION_BANK_VERSION } from "../../content/curriculum/questionBank";
import { rewardDetails } from "../../content/world/runContent";
import {
  generateCampfires,
} from "../../domain/exploration/campfire";
import { createCampaignProgress } from "../../domain/progression/campaign";
import { stableStringHash } from "../../domain/progression/runGraph";
import type {
  Campfire,
  PlayerState,
} from "../../domain/shared/types";

export interface LegacyRunCandidates {
  v11: unknown;
  v10: unknown;
  v9: unknown;
  v8: unknown;
  v7: unknown;
  v6: unknown;
  v5: unknown;
  v4: unknown;
}

export interface RunMigrators {
  v11: (value: unknown) => SavedRun | null;
  v10: (value: unknown) => SavedRun | null;
  v9: (value: unknown) => SavedRun | null;
  v8: (value: unknown) => SavedRun | null;
  v7: (value: unknown) => SavedRun | null;
  v6: (value: unknown) => SavedRun | null;
  v5: (value: unknown) => SavedRun | null;
  v4: (value: unknown) => SavedRun | null;
}

export type RunVersion = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * 迁移只依赖最终格式校验器，不直接依赖 localProgress 的存储入口。
 * 这样旧字段转换可以独立测试，同时仍然由入口决定何时读取和写入。
 */
export interface RunMigrationContext {
  isSavedRunVersion: (value: unknown, version: RunVersion) => boolean;
}

type LegacyPlayerState = Omit<PlayerState, "armor" | "armorHp">;

type SavedRunV11 = Omit<
  SavedRun,
  | "version"
  | "runInstanceId"
  | "questionBankVersion"
  | "practiceDrawCursor"
  | "practiceDrawCycle"
  | "activePracticeMonsterId"
  | "activePracticeQuestionIds"
  | "rewardedPracticeMonsterIds"
  | "guidanceObjectiveId"
  | "guidanceSteps"
  | "guidanceLevel"
> & {
  version: 11;
  generatorVersion: 4 | 5;
};

type SavedRunV10 = Omit<SavedRunV11, "version"> & { version: 10 };
type SavedRunV9 = Omit<SavedRunV10, "version"> & { version: 9 };
type SavedRunV8 = Omit<SavedRunV9, "version" | "campaign"> & { version: 8 };
type SavedRunV7 = Omit<
  SavedRunV8,
  | "version"
  | "player"
  | "activeLootBundleId"
  | "lootBundles"
  | "equipmentInventory"
  | "consumables"
  | "keyItems"
  | "acquiredUniqueItemIds"
> & {
  version: 7;
  player: LegacyPlayerState;
};
type SavedRunV6 = Omit<
  SavedRunV7,
  "version" | "campfires" | "activeCampfireId" | "respawnCampfireId"
> & { version: 6 };
type SavedRunV5 = Omit<
  SavedRunV6,
  "version" | "answerHistory" | "battleSequence" | "reviewBattleId"
> & { version: 5 };

function positionKey(value: { x: number; y: number }): string {
  return `${value.x}:${value.y}`;
}

/** 创建按 v4 -> v12 兼容链转换的迁移函数集合。 */
export function createRunMigrators(context: RunMigrationContext): RunMigrators {
  const migrateV11Run = (value: unknown): SavedRun | null => {
    if (!context.isSavedRunVersion(value, 11)) return null;
    const legacy = value as SavedRunV11;
    const rewardedPracticeMonsterIds = legacy.monsters
      .filter((monster) => {
        const role = biomeEncounterFor(monster.id)?.role;
        return monster.hp === 0 && (role === "normal" || role === "mini-elite");
      })
      .map((monster) => monster.id);
    const monsters = legacy.monsters.map((monster) => (
      rewardedPracticeMonsterIds.includes(monster.id)
        ? { ...monster, hp: monster.maxHp }
        : monster
    ));
    const migrated: SavedRun = {
      ...legacy,
      version: 12,
      runInstanceId: `run-${stableStringHash(
        `${legacy.graph.seed}:${legacy.queryCount}:${legacy.battleSequence}`,
      ).toString(36)}`,
      questionBankVersion: QUESTION_BANK_VERSION,
      practiceDrawCursor: 0,
      practiceDrawCycle: 0,
      activePracticeMonsterId: null,
      activePracticeQuestionIds: [],
      rewardedPracticeMonsterIds,
      guidanceObjectiveId: null,
      guidanceSteps: 0,
      guidanceLevel: 0,
      monsters,
      banner: `${legacy.banner} 练习题库与本地复盘账本已升级。`,
    };
    return context.isSavedRunVersion(migrated, 12) ? migrated : null;
  };

  const migrateV10Run = (value: unknown): SavedRun | null => {
    if (!context.isSavedRunVersion(value, 10)) return null;
    const legacy = value as SavedRunV10;
    const campfires = generateCampfires(legacy.graph, legacy.mazeFloor);
    const oldCampfireFor = (id: string | null): Campfire | null => (
      id ? legacy.campfires.find((campfire) => campfire.id === id) ?? null : null
    );
    const nearestCampfire = (oldCampfire: Campfire | null): Campfire | null => {
      if (!oldCampfire) return null;
      return [...campfires].sort((left, right) => (
        Math.abs(left.x - oldCampfire.x) + Math.abs(left.y - oldCampfire.y) -
        (Math.abs(right.x - oldCampfire.x) + Math.abs(right.y - oldCampfire.y))
      ))[0] ?? null;
    };
    const activeCampfire = nearestCampfire(oldCampfireFor(legacy.activeCampfireId));
    const respawnCampfire = nearestCampfire(oldCampfireFor(legacy.respawnCampfireId));
    const overlappingCampfire = campfires.find((campfire) => (
      campfire.x === legacy.player.x && campfire.y === legacy.player.y
    ));
    const movedCampfire = activeCampfire ?? overlappingCampfire ?? null;
    const player = movedCampfire
      ? { ...legacy.player, ...movedCampfire.restPosition }
      : legacy.player;
    const currentRoomId = movedCampfire?.roomNodeId ?? legacy.currentRoomId;
    const migrated: SavedRunV11 = {
      ...legacy,
      version: 11,
      campfires,
      activeCampfireId: activeCampfire?.id ?? null,
      respawnCampfireId: respawnCampfire?.id ?? null,
      player,
      currentRoomId,
      visitedRoomIds: [...new Set([
        ...legacy.visitedRoomIds,
        ...(movedCampfire ? [movedCampfire.roomNodeId] : []),
      ])],
      discoveredCells: [...new Set([
        ...legacy.discoveredCells,
        positionKey(player),
      ])],
      banner: `${legacy.banner} 篝火路线已收束为中、后两个检查点。`,
    };
    return context.isSavedRunVersion(migrated, 11) ? migrateV11Run(migrated) : null;
  };

  const migrateV9Run = (value: unknown): SavedRun | null => {
    if (!context.isSavedRunVersion(value, 9)) return null;
    const legacy = value as SavedRunV9;
    const migrated: SavedRunV10 = {
      ...legacy,
      version: 10,
      banner: `${legacy.banner} 第七、八层课程已开放，当前进度完整保留。`,
    };
    return context.isSavedRunVersion(migrated, 10) ? migrateV10Run(migrated) : null;
  };

  const migrateV8Run = (value: unknown): SavedRun | null => {
    if (!context.isSavedRunVersion(value, 8)) return null;
    const legacy = value as SavedRunV8;
    const migrated: SavedRunV9 = {
      ...legacy,
      version: 9,
      campaign: createCampaignProgress(legacy.graph.seed, legacy.floor),
      banner: `${legacy.banner} 八层课程框架已接入，当前双层进度保持不变。`,
    };
    return context.isSavedRunVersion(migrated, 9) ? migrateV9Run(migrated) : null;
  };

  const migrateV7Run = (value: unknown): SavedRun | null => {
    if (!context.isSavedRunVersion(value, 7)) return null;
    const legacy = value as SavedRunV7;
    const acquiredUniqueItemIds = [...new Set([
      "data-blade",
      legacy.player.weapon.id,
      ...legacy.groundItems.flatMap((item) => item.weapon ? [item.weapon.id] : []),
    ])];
    const migrated: SavedRunV8 = {
      ...legacy,
      version: 8,
      activeLootBundleId: null,
      lootBundles: [],
      equipmentInventory: [],
      consumables: [],
      keyItems: [],
      acquiredUniqueItemIds,
      player: {
        ...legacy.player,
        weapon: { ...legacy.player.weapon },
        armor: null,
        armorHp: 0,
      },
      banner: `${legacy.banner} 背包系统已升级，旧版装备与局内进度均已保留。`,
    };
    return context.isSavedRunVersion(migrated, 8) ? migrateV8Run(migrated) : null;
  };

  const migrateV6Run = (value: unknown): SavedRun | null => {
    if (!context.isSavedRunVersion(value, 6)) return null;
    const legacy = value as SavedRunV6;
    const campfires = generateCampfires(legacy.graph, legacy.mazeFloor);
    const groundItems = legacy.groundItems.filter((item) => (
      legacy.graph.nodes.find((node) => node.id === item.sourceRoomId)?.type !== "rest"
    ));
    const wasDefeated = legacy.mode === "defeat";
    const overlappingCampfire = wasDefeated
      ? null
      : campfires.find((campfire) => (
          campfire.x === legacy.player.x && campfire.y === legacy.player.y
        )) ?? null;
    const hasDefeatReview = wasDefeated &&
      legacy.reviewBattleId !== null &&
      legacy.answerHistory.some((record) => (
        record.battleId === legacy.reviewBattleId && record.outcome === "defeat"
      ));
    const mode = wasDefeated
      ? hasDefeatReview ? "death-review" : "explore"
      : legacy.mode;
    const currentRoomId = wasDefeated ? legacy.graph.entryId : legacy.currentRoomId;
    const migratedPlayerPosition = wasDefeated
      ? legacy.mazeFloor.spawn
      : overlappingCampfire?.restPosition ?? null;
    const player = migratedPlayerPosition
      ? {
          ...legacy.player,
          ...migratedPlayerPosition,
          hp: wasDefeated ? legacy.player.maxHp : legacy.player.hp,
          weapon: { ...legacy.player.weapon },
        }
      : legacy.player;
    const visitedRoomIds = wasDefeated
      ? [...new Set([...legacy.visitedRoomIds, legacy.graph.entryId])]
      : legacy.visitedRoomIds;
    const completedRoomIds = [...new Set([...legacy.completedRoomIds, legacy.graph.entryId])];
    const discoveredCells = migratedPlayerPosition
      ? [...new Set([...legacy.discoveredCells, positionKey(migratedPlayerPosition)])]
      : legacy.discoveredCells;
    const looseWeapon = groundItems.find((item) => item.weapon);
    const availableLoot = looseWeapon?.weapon
      ? {
          x: looseWeapon.x,
          y: looseWeapon.y,
          weapon: { ...looseWeapon.weapon },
        }
      : null;
    const interactiveReward = groundItems.find((item) => {
      if (
        item.sourceRoomId !== currentRoomId ||
        item.collection !== "interact" ||
        item.rewardId === null
      ) return false;
      const room = legacy.graph.nodes.find((node) => node.id === item.sourceRoomId);
      return !room?.lessonId || legacy.completedLessons.includes(room.lessonId);
    });
    const claimableReward = interactiveReward?.rewardId
      ? rewardDetails(interactiveReward.rewardId)
      : null;
    const migrated: SavedRunV7 = {
      ...legacy,
      version: 7,
      campfires,
      activeCampfireId: null,
      respawnCampfireId: null,
      groundItems,
      mode,
      currentRoomId,
      player,
      combat: wasDefeated ? null : legacy.combat,
      visitedRoomIds,
      completedRoomIds,
      activeGateChallengeId: wasDefeated ? null : legacy.activeGateChallengeId,
      availableLoot,
      claimableReward,
      reviewBattleId: wasDefeated
        ? hasDefeatReview ? legacy.reviewBattleId : null
        : legacy.reviewBattleId,
      discoveredCells,
      banner: wasDefeated
        ? hasDefeatReview
          ? "旧版失败记录已恢复：已返回出生安全区，请完成本场死亡复盘。"
          : "旧版失败记录已恢复：已返回出生安全区，可以继续探索。"
        : overlappingCampfire
          ? `${legacy.banner} 旧版站位与新增篝火重叠，已移至相邻安全格。`
          : legacy.banner,
    };
    return context.isSavedRunVersion(migrated, 7) ? migrateV7Run(migrated) : null;
  };

  const migrateV5RunToV6 = (value: unknown): SavedRunV6 | null => {
    if (!context.isSavedRunVersion(value, 5)) return null;
    const legacy = value as Omit<
      SavedRunV6,
      "version" | "answerHistory" | "battleSequence" | "reviewBattleId"
    > & { version: 5 };
    const hasActiveBattle = legacy.mode === "combat";
    return {
      ...legacy,
      version: 6,
      answerHistory: [],
      battleSequence: hasActiveBattle ? 1 : 0,
      reviewBattleId: hasActiveBattle ? 1 : null,
    };
  };

  const migrateV5Run = (value: unknown): SavedRun | null => {
    const v6 = migrateV5RunToV6(value);
    return v6 ? migrateV6Run(v6) : null;
  };

  const migrateV4Run = (value: unknown): SavedRun | null => {
    if (!context.isSavedRunVersion(value, 4)) return null;
    const legacy = value as Omit<
      SavedRunV5,
      | "version"
      | "openedGateIds"
      | "activeGateChallengeId"
      | "answerHistory"
      | "battleSequence"
      | "reviewBattleId"
    > & { version: 4 };
    const v5: SavedRunV5 = {
      ...legacy,
      version: 5,
      openedGateIds: [],
      activeGateChallengeId: null,
    };
    return migrateV5Run(v5);
  };

  return {
    v11: migrateV11Run,
    v10: migrateV10Run,
    v9: migrateV9Run,
    v8: migrateV8Run,
    v7: migrateV7Run,
    v6: migrateV6Run,
    v5: migrateV5Run,
    v4: migrateV4Run,
  };
}

/** 按兼容协议选择第一份可恢复的旧 Run。 */
export function migrateFirstAvailableRun(
  current: unknown,
  legacy: LegacyRunCandidates,
  migrators: RunMigrators,
): SavedRun | null {
  return migrators.v11(current)
    ?? migrators.v11(legacy.v11)
    ?? migrators.v10(legacy.v10)
    ?? migrators.v9(legacy.v9)
    ?? migrators.v8(legacy.v8)
    ?? migrators.v7(legacy.v7)
    ?? migrators.v6(legacy.v6)
    ?? migrators.v5(legacy.v5)
    ?? migrators.v4(legacy.v4);
}
