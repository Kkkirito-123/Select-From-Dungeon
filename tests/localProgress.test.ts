import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/GameSession";
import { detectQueryFeatures } from "../src/domain/lessonEvaluator";
import type { SavedRun, SqlQueryResult } from "../src/domain/types";
import {
  PROFILE_SAVE_KEY,
  RUN_SAVE_KEY,
  clearRun,
  createEmptyProfile,
  loadProfile,
  loadRun,
  persistProfileIfChanged,
  saveProfile,
  saveRun,
  type StorageLike,
} from "../src/storage/localProgress";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly readKeys: string[] = [];
  readonly removedKeys: string[] = [];

  getItem(key: string): string | null {
    this.readKeys.push(key);
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removedKeys.push(key);
    this.values.delete(key);
  }
}

class UnavailableStorage implements StorageLike {
  getItem(): string | null {
    throw new DOMException("blocked", "SecurityError");
  }

  setItem(): void {
    throw new DOMException("quota", "QuotaExceededError");
  }

  removeItem(): void {
    throw new DOMException("blocked", "SecurityError");
  }
}

class FlakyProfileStorage extends MemoryStorage {
  private profileFailuresRemaining = 1;

  override setItem(key: string, value: string): void {
    if (key === PROFILE_SAVE_KEY && this.profileFailuresRemaining > 0) {
      this.profileFailuresRemaining -= 1;
      throw new DOMException("temporary quota", "QuotaExceededError");
    }
    super.setItem(key, value);
  }
}

function freshRun(seed: string): SavedRun {
  return structuredClone(new GameSession(null, null, seed).toSavedRun());
}

function queryResult(
  sql: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): SqlQueryResult {
  return {
    sql,
    columns,
    rows,
    targetIds: [],
    plan: ["SEARCH teaching fixture"],
    baseHeat: 3,
    features: detectQueryFeatures(sql),
  };
}

function completeSelect(session: GameSession): void {
  const selectRoom = session.snapshot().roomGraph.nodes.find((node) => (
    node.lessonId === "select"
  ));
  if (!selectRoom) throw new Error("测试迷宫缺少 SELECT 区域");
  expect(session.travelToRoom(selectRoom.id).ok).toBe(true);
  const actor = session.snapshot().worldActors.find((entry) => (
    entry.roomNodeId === selectRoom.id
  ));
  if (!actor) throw new Error("测试迷宫缺少 SELECT Actor");
  expect(session.startEncounter(actor.monsterId).ok).toBe(true);
  expect(session.resolveQuery(queryResult(
    "SELECT name FROM monsters WHERE id = 101",
    ["name"],
    [{ name: "史莱姆" }],
  )).accepted).toBe(true);
  expect(session.resolveQuery(queryResult(
    "SELECT weakness FROM monsters WHERE id = 101",
    ["weakness"],
    [{ weakness: "slash" }],
  )).lessonCompleted).toBe("select");
}

function expectRunRejected(storage: MemoryStorage, run: SavedRun): void {
  storage.setItem(RUN_SAVE_KEY, JSON.stringify(run));
  expect(() => loadRun(storage)).not.toThrow();
  expect(loadRun(storage)).toBeNull();
}

describe("localProgress", () => {
  it("v8 Run 与永久 Profile 使用独立 key 并能完整恢复迷宫、篝火、背包和答题状态", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(null, null, "storage-seed");
    const saved = session.toSavedRun();
    const profile = createEmptyProfile();
    profile.masteredLessons.push("select");
    profile.attempts.select = 2;
    saveRun(storage, saved);
    saveProfile(storage, profile);

    expect(RUN_SAVE_KEY).toBe("select-from-dungeon:run:v8");
    expect(PROFILE_SAVE_KEY).toBe("select-from-dungeon:profile:v2");
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(true);
    expect(storage.values.has(PROFILE_SAVE_KEY)).toBe(true);
    const loaded = loadRun(storage);
    expect(loaded?.graph.seed).toBe("storage-seed");
    expect(loaded?.mazeFloor).toEqual(saved.mazeFloor);
    expect(loaded?.worldActors).toEqual(saved.worldActors);
    expect(loaded?.groundItems).toEqual(saved.groundItems);
    expect(loaded?.campfires).toEqual(saved.campfires);
    expect(loaded?.lootBundles).toEqual(saved.lootBundles);
    expect(loaded?.equipmentInventory).toEqual(saved.equipmentInventory);
    expect(loaded?.consumables).toEqual(saved.consumables);
    expect(loaded?.activeCampfireId).toBeNull();
    expect(loaded?.respawnCampfireId).toBeNull();
    expect(loaded?.discoveredCells).toEqual(saved.discoveredCells);
    expect(loadProfile(storage).masteredLessons).toEqual(["select"]);

    const restored = new GameSession(loaded, loadProfile(storage));
    const snapshot = restored.snapshot();
    expect(snapshot.mazeFloor.topologyHash).toBe(saved.mazeFloor.topologyHash);
    expect(snapshot.worldActors).toEqual(saved.worldActors);
    expect(snapshot.groundItems).toEqual(saved.groundItems);
    expect(snapshot.campfires).toEqual(saved.campfires);
    expect(snapshot.discoveredCells).toEqual(saved.discoveredCells);
  });

  it("旧 run:v1/v2 不读取，也不会被 v8 清理动作删除", () => {
    const storage = new MemoryStorage();
    const legacyKey = "select-from-dungeon:run:v1";
    const legacyRun = {
      ...freshRun("legacy-v1"),
      version: 1,
      generatorVersion: 1,
    };
    storage.setItem(legacyKey, JSON.stringify(legacyRun));
    const previousKey = "select-from-dungeon:run:v2";
    storage.setItem(previousKey, JSON.stringify({ ...legacyRun, version: 2, generatorVersion: 2 }));

    expect(loadRun(storage)).toBeNull();
    expect(storage.readKeys).toEqual([
      RUN_SAVE_KEY,
      "select-from-dungeon:run:v7",
      "select-from-dungeon:run:v6",
      "select-from-dungeon:run:v5",
      "select-from-dungeon:run:v4",
    ]);
    clearRun(storage);
    expect(storage.removedKeys).toEqual([RUN_SAVE_KEY]);
    expect(storage.values.has(legacyKey)).toBe(true);
    expect(storage.values.has(previousKey)).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  });

  it("战斗中的房间、玩家与 Actor 状态也能通过 v8 恢复", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(null, null, "combat-restore");
    const selectRoom = session.snapshot().roomGraph.nodes.find((node) => (
      node.lessonId === "select"
    ));
    expect(selectRoom).toBeDefined();
    if (!selectRoom) throw new Error("测试迷宫缺少 SELECT 区域");
    expect(session.travelToRoom(selectRoom.id).ok).toBe(true);
    const actor = session.snapshot().worldActors.find((entry) => (
      entry.roomNodeId === selectRoom.id
    ));
    expect(actor).toBeDefined();
    if (!actor) throw new Error("测试迷宫缺少 SELECT Actor");
    expect(session.startEncounter(actor.monsterId).ok).toBe(true);

    const saved = session.toSavedRun();
    saveRun(storage, saved);
    const loaded = loadRun(storage);

    expect(loaded?.mode).toBe("combat");
    expect(loaded?.currentRoomId).toBe(selectRoom.id);
    expect(loaded?.combat?.targetId).toBe(actor.monsterId);
    expect(new GameSession(loaded).snapshot().combat).toEqual(saved.combat);
  });

  it("非空篝火菜单、复活点与死亡复盘能通过 v8 完整恢复", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(null, null, "campfire-state-roundtrip");
    completeSelect(session);
    const checkpoint = session.snapshot().campfires[0];
    if (!checkpoint) throw new Error("测试楼层缺少前段篝火");

    expect(session.setPlayerPosition(
      checkpoint.restPosition.x,
      checkpoint.restPosition.y,
    )).toBe(true);
    expect(session.interact().ok).toBe(true);
    saveRun(storage, session.toSavedRun());

    const campfireRun = loadRun(storage);
    expect(campfireRun).toMatchObject({
      mode: "campfire",
      activeCampfireId: checkpoint.id,
      respawnCampfireId: null,
    });
    if (!campfireRun) throw new Error("篝火菜单存档恢复失败");

    const restored = new GameSession(campfireRun);
    expect(restored.restAtCampfire().ok).toBe(true);
    const whereRoom = restored.snapshot().roomGraph.nodes.find((node) => (
      node.lessonId === "where"
    ));
    if (!whereRoom) throw new Error("测试迷宫缺少 WHERE 区域");
    expect(restored.travelToRoom(whereRoom.id).ok).toBe(true);
    const actor = restored.snapshot().worldActors.find((entry) => (
      entry.roomNodeId === whereRoom.id
    ));
    if (!actor) throw new Error("测试迷宫缺少 WHERE Actor");
    expect(restored.startEncounter(actor.monsterId).ok).toBe(true);
    expect(restored.registerQueryError(
      "第一次语法错误",
      "SELECT FORM monsters",
    ).playerDamage).toBe(1);
    expect(restored.registerQueryError(
      "第二次语法错误",
      "SELECT name FORM monsters",
    ).mode).toBe("defeat");
    expect(restored.respawnAfterDefeat()).toBe(true);
    saveRun(storage, restored.toSavedRun());

    const deathReviewRun = loadRun(storage);
    expect(deathReviewRun).toMatchObject({
      mode: "death-review",
      activeCampfireId: null,
      respawnCampfireId: checkpoint.id,
      player: {
        x: checkpoint.restPosition.x,
        y: checkpoint.restPosition.y,
        hp: 2,
        maxHp: 2,
      },
    });
    expect(deathReviewRun?.answerHistory).toHaveLength(4);
    expect(new GameSession(deathReviewRun).snapshot().battleReview).toHaveLength(2);
  }, 15_000);

  it("恢复旧存档时使用当前内容中的简短怪物名", () => {
    const saved = freshRun("canonical-monster-names");
    const slime = saved.monsters.find((monster) => monster.id === 101);
    if (!slime) throw new Error("旧存档缺少史莱姆");
    slime.name = "旧版名称 · 装饰后缀";

    const restored = new GameSession(saved).snapshot();
    expect(restored.monsters.find((monster) => monster.id === 101)?.name).toBe("史莱姆");
  });

  it("当前 v7 Run 会迁移到 v8 背包结构，且不会删除原始存档", () => {
    const storage = new MemoryStorage();
    const current = freshRun("migrate-run-v7");
    const {
      activeLootBundleId: _activeLootBundleId,
      lootBundles: _lootBundles,
      equipmentInventory: _equipmentInventory,
      consumables: _consumables,
      keyItems: _keyItems,
      acquiredUniqueItemIds: _acquiredUniqueItemIds,
      player: currentPlayer,
      ...legacyFields
    } = current;
    const {
      armor: _armor,
      armorHp: _armorHp,
      ...legacyPlayer
    } = currentPlayer;
    storage.setItem("select-from-dungeon:run:v7", JSON.stringify({
      ...legacyFields,
      version: 7,
      player: legacyPlayer,
    }));

    const migrated = loadRun(storage);
    expect(migrated).toMatchObject({
      version: 8,
      activeLootBundleId: null,
      lootBundles: [],
      equipmentInventory: [],
      consumables: [],
      keyItems: [],
      player: { armor: null, armorHp: 0 },
      graph: { seed: "migrate-run-v7" },
    });
    expect(migrated?.acquiredUniqueItemIds).toContain("data-blade");
    expect(storage.values.has("select-from-dungeon:run:v7")).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  });

  it("当前 v6 Run 会生成三处篝火并迁移到 v8，且不会删除原始存档", () => {
    const storage = new MemoryStorage();
    const current = freshRun("migrate-run-v6");
    const {
      campfires: _campfires,
      activeCampfireId: _activeCampfireId,
      respawnCampfireId: _respawnCampfireId,
      ...legacyFields
    } = current;
    storage.setItem("select-from-dungeon:run:v6", JSON.stringify({
      ...legacyFields,
      version: 6,
    }));

    const migrated = loadRun(storage);
    expect(migrated).toMatchObject({
      version: 8,
      activeCampfireId: null,
      respawnCampfireId: null,
      graph: { seed: "migrate-run-v6" },
    });
    expect(migrated?.campfires).toHaveLength(3);
    expect(migrated?.campfires.map((campfire) => campfire.phase)).toEqual([
      "front",
      "middle",
      "rear",
    ]);
    expect(storage.values.has("select-from-dungeon:run:v6")).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  });

  it("v6 玩家若站在新增篝火中心，迁移时移动到相邻安全格而不丢档", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(null, null, "migrate-v6-overlapping-campfire");
    completeSelect(session);
    const current = structuredClone(session.toSavedRun());
    const checkpoint = current.campfires[0];
    if (!checkpoint) throw new Error("测试楼层缺少前段篝火");
    const {
      campfires: _campfires,
      activeCampfireId: _activeCampfireId,
      respawnCampfireId: _respawnCampfireId,
      ...legacyFields
    } = current;
    storage.setItem("select-from-dungeon:run:v6", JSON.stringify({
      ...legacyFields,
      version: 6,
      currentRoomId: checkpoint.roomNodeId,
      player: {
        ...legacyFields.player,
        x: checkpoint.x,
        y: checkpoint.y,
      },
      visitedRoomIds: [
        ...new Set([...legacyFields.visitedRoomIds, checkpoint.roomNodeId]),
      ],
      discoveredCells: [
        ...new Set([
          ...legacyFields.discoveredCells,
          `${checkpoint.x}:${checkpoint.y}`,
        ]),
      ],
    }));

    const migrated = loadRun(storage);
    expect(migrated).toMatchObject({
      version: 8,
      currentRoomId: checkpoint.roomNodeId,
      player: checkpoint.restPosition,
      activeCampfireId: null,
      respawnCampfireId: null,
    });
    expect(migrated?.discoveredCells).toContain(
      `${checkpoint.restPosition.x}:${checkpoint.restPosition.y}`,
    );
    expect(migrated?.banner).toContain("已移至相邻安全格");
  }, 15_000);

  it("v6 的失败态不会在升级后卡死，会满血回到出生安全区", () => {
    const storage = new MemoryStorage();
    const current = freshRun("migrate-defeat-v6");
    const {
      campfires: _campfires,
      activeCampfireId: _activeCampfireId,
      respawnCampfireId: _respawnCampfireId,
      ...legacyFields
    } = current;
    storage.setItem("select-from-dungeon:run:v6", JSON.stringify({
      ...legacyFields,
      version: 6,
      mode: "defeat",
      player: { ...legacyFields.player, hp: 0 },
      combat: null,
      activeGateChallengeId: null,
      reviewBattleId: null,
      answerHistory: [],
    }));

    const migrated = loadRun(storage);
    expect(migrated).toMatchObject({
      version: 8,
      mode: "explore",
      currentRoomId: current.graph.entryId,
      player: {
        ...current.mazeFloor.spawn,
        hp: current.player.maxHp,
        maxHp: current.player.maxHp,
      },
      activeCampfireId: null,
      respawnCampfireId: null,
    });
  });

  it("当前 v5 Run 会迁移到 v8，且不会删除原始存档", () => {
    const storage = new MemoryStorage();
    const current = freshRun("migrate-run-v5");
    const {
      campfires: _campfires,
      activeCampfireId: _activeCampfireId,
      respawnCampfireId: _respawnCampfireId,
      answerHistory: _answerHistory,
      battleSequence: _battleSequence,
      reviewBattleId: _reviewBattleId,
      ...legacyFields
    } = current;
    storage.setItem("select-from-dungeon:run:v5", JSON.stringify({
      ...legacyFields,
      version: 5,
    }));

    const migrated = loadRun(storage);
    expect(migrated).toMatchObject({
      version: 8,
      activeCampfireId: null,
      respawnCampfireId: null,
      answerHistory: [],
      battleSequence: 0,
      reviewBattleId: null,
      graph: { seed: "migrate-run-v5" },
    });
    expect(migrated?.campfires).toHaveLength(3);
    expect(storage.values.has("select-from-dungeon:run:v5")).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  }, 15_000);

  it("当前 v4 Run 会迁移到 v8，且不会删除原始存档", () => {
    const storage = new MemoryStorage();
    const current = freshRun("migrate-run-v4");
    const {
      campfires: _campfires,
      activeCampfireId: _activeCampfireId,
      respawnCampfireId: _respawnCampfireId,
      openedGateIds: _openedGateIds,
      activeGateChallengeId: _activeGateChallengeId,
      answerHistory: _answerHistory,
      battleSequence: _battleSequence,
      reviewBattleId: _reviewBattleId,
      ...legacyFields
    } = current;
    const legacy = { ...legacyFields, version: 4 };
    storage.setItem("select-from-dungeon:run:v4", JSON.stringify(legacy));

    const migrated = loadRun(storage);
    expect(migrated).toMatchObject({
      version: 8,
      activeCampfireId: null,
      respawnCampfireId: null,
      openedGateIds: [],
      activeGateChallengeId: null,
      answerHistory: [],
      battleSequence: 0,
      reviewBattleId: null,
      graph: { seed: "migrate-run-v4" },
    });
    expect(migrated?.campfires).toHaveLength(3);
    expect(storage.values.has("select-from-dungeon:run:v4")).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  });

  it("永久 Profile v1 会迁移为包含第二层课程的 v2", () => {
    const storage = new MemoryStorage();
    storage.setItem("select-from-dungeon:profile:v1", JSON.stringify({
      version: 1,
      masteredLessons: ["select", "where"],
      attempts: {
        select: 2,
        where: 1,
        "is-null": 0,
        "group-by": 0,
        having: 0,
      },
      victories: 3,
      bestRunQueries: 14,
    }));

    expect(loadProfile(storage)).toEqual({
      ...createEmptyProfile(),
      masteredLessons: ["select", "where"],
      attempts: {
        ...createEmptyProfile().attempts,
        select: 2,
        where: 1,
      },
      victories: 3,
      bestRunQueries: 14,
    });
  });

  it("清除 Run 不会删除永久 Profile", () => {
    const storage = new MemoryStorage();
    saveRun(storage, new GameSession(null, null, "clear-run").toSavedRun());
    const profile = createEmptyProfile();
    profile.victories = 3;
    saveProfile(storage, profile);
    clearRun(storage);

    expect(loadRun(storage)).toBeNull();
    expect(loadProfile(storage).victories).toBe(3);
  });

  it("Profile 首次写入失败不推进缓存，后续生命周期 flush 会重试并恢复", () => {
    const storage = new FlakyProfileStorage();
    const original = createEmptyProfile();
    const changed = createEmptyProfile();
    changed.masteredLessons.push("select");
    changed.attempts.select = 2;
    let lastPersistedJson = JSON.stringify(original);

    lastPersistedJson = persistProfileIfChanged(storage, changed, lastPersistedJson);
    expect(lastPersistedJson).toBe(JSON.stringify(original));
    expect(storage.values.has(PROFILE_SAVE_KEY)).toBe(false);

    lastPersistedJson = persistProfileIfChanged(storage, changed, lastPersistedJson);
    expect(lastPersistedJson).toBe(JSON.stringify(changed));
    expect(loadProfile(storage)).toEqual(changed);
  });

  it("损坏或旧版本数据会被忽略而不是让页面崩溃", () => {
    const storage = new MemoryStorage();
    storage.setItem(RUN_SAVE_KEY, "{broken");
    storage.setItem(PROFILE_SAVE_KEY, JSON.stringify({ version: 0 }));
    expect(loadRun(storage)).toBeNull();
    expect(loadProfile(storage)).toEqual(createEmptyProfile());
  });

  it("版本正确但内部结构损坏时安全回退", () => {
    const storage = new MemoryStorage();
    storage.setItem(RUN_SAVE_KEY, JSON.stringify({
      version: 4,
      generatorVersion: 4,
      graph: {},
    }));
    expect(() => loadRun(storage)).not.toThrow();
    expect(loadRun(storage)).toBeNull();

    const run = new GameSession(null, null, "shape-check").toSavedRun();
    storage.setItem(RUN_SAVE_KEY, JSON.stringify({
      ...run,
      mode: "combat",
      combat: null,
      player: { ...run.player, hp: "42" },
    }));
    expect(loadRun(storage)).toBeNull();

    storage.setItem(PROFILE_SAVE_KEY, JSON.stringify({
      ...createEmptyProfile(),
      victories: -1,
    }));
    expect(loadProfile(storage)).toEqual(createEmptyProfile());
  });

  it("答题历史损坏或超出查询序号时拒绝恢复整个 Run", () => {
    const storage = new MemoryStorage();
    const run = freshRun("broken-answer-history");
    run.queryCount = 1;
    run.battleSequence = 1;
    run.reviewBattleId = 1;
    run.answerHistory = [{
      id: 2,
      battleId: 1,
      floor: 1,
      monsterId: 101,
      monsterName: "史莱姆",
      lessonId: "select",
      stageId: "select-name",
      stageObjective: "查询史莱姆名字",
      round: 1,
      sql: "SELECT name FROM monsters",
      answerSql: "SELECT name FROM monsters WHERE id = 101;",
      result: "wrong-result",
      outcome: "countered",
      feedback: "结果不匹配",
      hintLevel: 0,
    }];

    expectRunRejected(storage, run);
    run.answerHistory[0].id = 1;
    run.answerHistory[0].answerSql = "";
    expectRunRejected(storage, run);
  });

  it("64×48 迷宫结构损坏或拓扑不可达时拒绝恢复", () => {
    const storage = new MemoryStorage();
    const malformed = freshRun("malformed-maze");
    malformed.mazeFloor.tiles[0] = malformed.mazeFloor.tiles[0].slice(1);
    expectRunRejected(storage, malformed);

    const unreachable = freshRun("unreachable-player");
    const lockedRoom = unreachable.graph.nodes.find((node) => (
      node.lessonId === "where" && node.prerequisiteLessons.length > 0
    ));
    expect(lockedRoom).toBeDefined();
    const lockedAnchor = unreachable.mazeFloor.anchors[lockedRoom?.id ?? ""];
    expect(lockedAnchor).toBeDefined();
    if (!lockedRoom || !lockedAnchor) throw new Error("测试迷宫缺少 WHERE 锁定区");
    unreachable.currentRoomId = lockedRoom.id;
    unreachable.player.x = lockedAnchor.x;
    unreachable.player.y = lockedAnchor.y;
    unreachable.visitedRoomIds.push(lockedRoom.id);
    unreachable.discoveredCells.push(`${lockedAnchor.x}:${lockedAnchor.y}`);
    expectRunRejected(storage, unreachable);
  });

  it("越界或失配的怪物 Actor 会安全回退", () => {
    const storage = new MemoryStorage();
    const run = freshRun("broken-actor");
    expect(run.worldActors.length).toBeGreaterThan(0);
    run.worldActors[0].x = run.mazeFloor.width;
    expectRunRejected(storage, run);
  });

  it("越界或来源无效的地面物品会安全回退", () => {
    const storage = new MemoryStorage();
    const run = freshRun("broken-item");
    expect(run.groundItems.length).toBeGreaterThan(0);
    run.groundItems[0].sourceRoomId = "missing-room";
    expectRunRejected(storage, run);
  });

  it("篝火缺失、休息点越界或复活点引用失配时拒绝恢复", () => {
    const storage = new MemoryStorage();

    const missingCampfire = freshRun("broken-campfire-count");
    missingCampfire.campfires.pop();
    expectRunRejected(storage, missingCampfire);

    const invalidRestPosition = freshRun("broken-campfire-rest");
    invalidRestPosition.campfires[0].restPosition.x = invalidRestPosition.mazeFloor.width;
    expectRunRejected(storage, invalidRestPosition);

    const unknownCheckpoint = freshRun("broken-campfire-checkpoint");
    unknownCheckpoint.respawnCampfireId = "campfire:1:missing";
    expectRunRejected(storage, unknownCheckpoint);
  });

  it("探索格必须是无重复的迷宫内规范坐标", () => {
    const storage = new MemoryStorage();
    const outOfBounds = freshRun("broken-discovery-bounds");
    outOfBounds.discoveredCells.push(`${outOfBounds.mazeFloor.width}:0`);
    expectRunRejected(storage, outOfBounds);

    const duplicate = freshRun("broken-discovery-duplicate");
    duplicate.discoveredCells.push(duplicate.discoveredCells[0]);
    expectRunRejected(storage, duplicate);
  });

  it("博客 iframe 禁用 localStorage 时仍回退为内存游戏", () => {
    const storage = new UnavailableStorage();
    const session = new GameSession(null, null, "iframe-fallback");
    expect(loadRun(storage)).toBeNull();
    expect(loadProfile(storage)).toEqual(createEmptyProfile());
    expect(() => saveRun(storage, session.toSavedRun())).not.toThrow();
    expect(() => saveProfile(storage, session.toProfile())).not.toThrow();
    expect(() => clearRun(storage)).not.toThrow();
  });
});
