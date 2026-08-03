import { describe, expect, it } from "vitest";
import legacyV11Fixture from "./fixtures/legacy-v11-before-mvp2-1.json";
import { legacyMonsterIdForCurrent } from "../src/content/monsterIds";
import { GameSession } from "../src/domain/GameSession";
import { generateCampfires } from "../src/domain/campfire";
import {
  advanceCampaignProgress,
  createCampaignProgress,
} from "../src/domain/campaign";
import { detectQueryFeatures } from "../src/domain/lessonEvaluator";
import { migrationStepMarkerIds } from "../src/domain/finalMigration";
import {
  LARGE_MAZE_CHUNK_SIZE,
  LARGE_MAZE_HEIGHT,
  LARGE_MAZE_WIDTH,
  mazeLayoutNameForVersion,
} from "../src/domain/mazeGenerator";
import { stableStringHash } from "../src/domain/runGraph";
import type { SavedRun, SqlQueryResult } from "../src/domain/types";
import {
  PROFILE_SAVE_KEY,
  RUN_SAVE_KEY,
  clearRun,
  createEmptyProfile,
  isSavedRun,
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

function asLargeV6Run(source: SavedRun): SavedRun {
  const run = structuredClone(source);
  const tiles = run.mazeFloor.tiles.map((row) => row.padEnd(LARGE_MAZE_WIDTH, "#"));
  while (tiles.length < LARGE_MAZE_HEIGHT) {
    tiles.push("#".repeat(LARGE_MAZE_WIDTH));
  }
  run.generatorVersion = 6;
  run.mazeFloor = {
    ...run.mazeFloor,
    generatorVersion: 6,
    width: LARGE_MAZE_WIDTH,
    height: LARGE_MAZE_HEIGHT,
    chunkSize: LARGE_MAZE_CHUNK_SIZE,
    tiles,
  };
  const topologyBody = `${run.mazeFloor.tiles.join("|")}|${run.mazeFloor.gates
    .map((gate) => `${gate.roomNodeId}:${gate.x}:${gate.y}`)
    .join("|")}`;
  run.mazeFloor.topologyHash = stableStringHash(
    `${mazeLayoutNameForVersion(run.floor, 6)}|${topologyBody}`,
  );
  return run;
}

function freshLegacyRun(): SavedRun {
  const storage = new MemoryStorage();
  const fixture = (legacyV11Fixture as unknown as { floor1: SavedRun }).floor1;
  storage.setItem(RUN_SAVE_KEY, JSON.stringify(fixture));
  const migrated = loadRun(storage);
  if (!migrated) throw new Error("真实 v11 测试存档无法迁移");
  return structuredClone(migrated);
}

function freshFloorEightRun(seed: string): SavedRun {
  const preview = new GameSession(null, null, seed);
  preview.enableAdminMode();
  preview.adminLoadFloor(8);
  return structuredClone(preview.toSavedRun());
}

function withLegacyMonsterIds(run: SavedRun): SavedRun {
  const legacy = structuredClone(run);
  legacy.monsters = legacy.monsters.map((monster) => ({
    ...monster,
    id: legacyMonsterIdForCurrent(monster.id),
    masterId: monster.masterId === null
      ? null
      : legacyMonsterIdForCurrent(monster.masterId),
  }));
  legacy.worldActors = legacy.worldActors.map((actor) => ({
    ...actor,
    monsterId: legacyMonsterIdForCurrent(actor.monsterId),
  }));
  legacy.combat = legacy.combat
    ? {
        ...legacy.combat,
        targetId: legacyMonsterIdForCurrent(legacy.combat.targetId),
      }
    : null;
  legacy.answerHistory = legacy.answerHistory.map((record) => ({
    ...record,
    monsterId: legacyMonsterIdForCurrent(record.monsterId),
  }));
  legacy.lootBundles = legacy.lootBundles.map((bundle) => ({
    ...bundle,
    sourceMonsterId: bundle.sourceMonsterId === null
      ? null
      : legacyMonsterIdForCurrent(bundle.sourceMonsterId),
  }));
  return legacy;
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
    "SELECT weakness FROM monsters WHERE id = 1",
    ["weakness"],
    [{ weakness: "slash" }],
  )).accepted).toBe(true);
  expect(session.resolveQuery(queryResult(
    "SELECT id, status FROM monsters WHERE id = 1",
    ["id", "status"],
    [{ id: 1, status: "idle" }],
  )).lessonCompleted).toBe("select");
}

function expectRunRejected(storage: MemoryStorage, run: SavedRun): void {
  storage.setItem(RUN_SAVE_KEY, JSON.stringify(run));
  expect(() => loadRun(storage)).not.toThrow();
  expect(loadRun(storage)).toBeNull();
}

describe("localProgress", () => {
  it("真实旧 v11 第一、二层布局存档在布局改名后仍无损恢复", () => {
    const fixtures = legacyV11Fixture as unknown as {
      floor1: SavedRun;
      floor2: SavedRun;
    };

    ([fixtures.floor1, fixtures.floor2] as const).forEach((legacyRun) => {
      const storage = new MemoryStorage();
      const originalJson = JSON.stringify(legacyRun);
      storage.setItem(RUN_SAVE_KEY, originalJson);

      const loaded = loadRun(storage);

      expect(loaded).not.toBeNull();
      expect(loaded?.floor).toBe(legacyRun.floor);
      expect(loaded?.graph.seed).toBe(legacyRun.graph.seed);
      expect(loaded?.mazeFloor).toEqual(legacyRun.mazeFloor);
      expect(loaded?.player).toEqual(legacyRun.player);
      expect(loaded?.worldActors).toEqual(legacyRun.worldActors);
      expect(loaded?.campfires).toEqual(legacyRun.campfires);
      expect(storage.getItem(RUN_SAVE_KEY)).toBe(originalJson);
      expect(storage.removedKeys).toEqual([]);
    });
  });

  it("v12 Run 与 v3 永久 Profile 使用独立 key并完整恢复地图、篝火、背包和答题状态", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(null, null, "storage-seed");
    const saved = session.toSavedRun();
    const profile = createEmptyProfile();
    profile.masteredLessons.push("select");
    profile.attempts.select = 2;
    saveRun(storage, saved);
    saveProfile(storage, profile);

    expect(RUN_SAVE_KEY).toBe("select-from-dungeon:run:v12");
    expect(PROFILE_SAVE_KEY).toBe("select-from-dungeon:profile:v3");
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(true);
    expect(storage.values.has(PROFILE_SAVE_KEY)).toBe(true);
    const loaded = loadRun(storage);
    expect(loaded?.graph.seed).toBe("storage-seed");
    expect(loaded?.mazeFloor).toEqual(saved.mazeFloor);
    expect(loaded?.worldActors).toEqual(saved.worldActors);
    expect(loaded?.groundItems).toEqual(saved.groundItems);
    expect(loaded?.campfires).toEqual(saved.campfires);
    expect(loaded?.campaign).toEqual(saved.campaign);
    expect(loaded?.lootBundles).toEqual(saved.lootBundles);
    expect(loaded?.equipmentInventory).toEqual(saved.equipmentInventory);
    expect(loaded?.consumables).toEqual(saved.consumables);
    expect(loaded?.activeCampfireId).toBeNull();
    expect(loaded?.respawnCampfireId).toBeNull();
    expect(loaded?.discoveredCells).toEqual(saved.discoveredCells);
    expect(loaded?.practiceDrawStates).toEqual({
      L1: { cursor: 0, cycle: 0 },
      L2: { cursor: 0, cycle: 0 },
      L3: { cursor: 0, cycle: 0 },
    });
    expect(loadProfile(storage).masteredLessons).toEqual(["select"]);

    const restored = new GameSession(loaded, loadProfile(storage));
    const snapshot = restored.snapshot();
    expect(snapshot.mazeFloor.topologyHash).toBe(saved.mazeFloor.topologyHash);
    expect(snapshot.worldActors).toEqual(saved.worldActors);
    expect(snapshot.groundItems).toEqual(saved.groundItems);
    expect(snapshot.campfires).toEqual(saved.campfires);
    expect(snapshot.discoveredCells).toEqual(saved.discoveredCells);

    const invalidTierState = structuredClone(saved);
    if (!invalidTierState.practiceDrawStates) throw new Error("缺少分级题库游标");
    invalidTierState.practiceDrawStates.L3.cursor = -1;
    expect(isSavedRun(invalidTierState)).toBe(false);
  });

  it("v12 继续读取已经保存的 96×72 generator-v6 Run", () => {
    const storage = new MemoryStorage();
    const legacyLarge = asLargeV6Run(freshRun("saved-large-v6"));
    storage.setItem(RUN_SAVE_KEY, JSON.stringify(legacyLarge));

    const loaded = loadRun(storage);

    expect(loaded).not.toBeNull();
    expect(loaded?.generatorVersion).toBe(6);
    expect(loaded?.mazeFloor).toMatchObject({
      generatorVersion: 6,
      width: LARGE_MAZE_WIDTH,
      height: LARGE_MAZE_HEIGHT,
      chunkSize: LARGE_MAZE_CHUNK_SIZE,
    });
  });

  it("旧 profile:v2 会补齐第三至六层计数而不丢失旧掌握记录", () => {
    const storage = new MemoryStorage();
    const oldProfile = createEmptyProfile();
    oldProfile.masteredLessons = ["select", "where"];
    oldProfile.attempts.select = 4;
    const oldAttempts = { ...oldProfile.attempts } as Record<string, number>;
    [
      "f3-inner",
      "f3-left",
      "f3-self",
      "f3-chain",
      "f3-union",
      "f3-audit",
      "f4-scalar",
      "f4-in",
      "f4-exists",
      "f4-correlated",
      "f4-cte",
      "f4-recursive",
      "f5-over",
      "f5-row-number",
      "f5-rank",
      "f5-lag-lead",
      "f5-frame",
      "f5-top-n",
      "f6-insert",
      "f6-update",
      "f6-delete",
      "f6-constraint",
      "f6-transaction",
      "f6-savepoint",
    ].forEach((lesson) => delete oldAttempts[lesson]);
    storage.setItem("select-from-dungeon:profile:v2", JSON.stringify({
      ...oldProfile,
      version: 2,
      discoveredMonsterIds: undefined,
      attempts: oldAttempts,
    }));

    const restored = loadProfile(storage);
    expect(restored.masteredLessons).toEqual(["select", "where"]);
    expect(restored.attempts.select).toBe(4);
    expect(restored.attempts["f3-inner"]).toBe(0);
    expect(restored.attempts["f4-recursive"]).toBe(0);
    expect(restored.attempts["f5-top-n"]).toBe(0);
    expect(restored.attempts["f6-savepoint"]).toBe(0);
  });

  it("旧 run:v1/v2 不读取，也不会被 v12 清理动作删除", () => {
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
      "select-from-dungeon:run:v11",
      "select-from-dungeon:run:v10",
      "select-from-dungeon:run:v9",
      "select-from-dungeon:run:v8",
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

  it("战斗中的房间、玩家与 Actor 状态也能通过 v12 恢复", () => {
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
    expect(new GameSession(loaded).snapshot().combat).toEqual({
      ...saved.combat,
      intent: {
        ...saved.combat!.intent,
        name: "攻击正在蓄力",
      },
    });
  });

  it("非空篝火菜单、复活点与死亡复盘能通过 v12 完整恢复", () => {
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

  it("v12 能恢复由迷宫派生的死路补给状态而无需重复保存引导方案", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(null, null, "guided-cache-roundtrip");
    const cache = session.snapshot().guidedMap.deadEndCaches[0];
    if (!cache) throw new Error("测试迷宫缺少死路补给");
    const saved = session.toSavedRun();
    saved.openedGateIds.push(cache.id);

    saveRun(storage, saved);
    const loaded = loadRun(storage);

    expect(loaded?.openedGateIds).toContain(cache.id);
    expect(new GameSession(loaded).snapshot().guidedMap.deadEndCaches).toContainEqual(cache);
  });

  it("v12 能恢复 canonical 剧情证据标记，并拒绝其他楼层的伪造标记", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(null, null, "story-evidence-roundtrip");
    expect(session.recordStoryEvidence("lost-name:f1:current-record")).toBe(true);

    saveRun(storage, session.toSavedRun());
    expect(loadRun(storage)?.openedGateIds).toContain(
      "story:evidence:lost-name:f1:current-record",
    );

    const forged = session.toSavedRun();
    forged.openedGateIds.push("story:evidence:lost-name:f8:identity-set");
    expect(isSavedRun(forged)).toBe(false);
  });

  it("v12 只在第八层 victory 恢复有序 MIGRATE 前缀", () => {
    const storage = new MemoryStorage();
    const run = freshFloorEightRun("migration-progress-roundtrip");
    const completion = advanceCampaignProgress(run.campaign);
    if (!completion.ok || !completion.completed) {
      throw new Error("第八层测试 Campaign 无法进入 victory");
    }
    run.mode = "victory";
    run.campaign = completion.progress;
    run.openedGateIds.push(...migrationStepMarkerIds().slice(0, 3));

    expect(isSavedRun(run)).toBe(true);
    saveRun(storage, run);
    expect(loadRun(storage)?.openedGateIds).toEqual(expect.arrayContaining([
      "story:migrate:snapshot",
      "story:migrate:audit",
      "story:migrate:preserve-history",
    ]));

    const skipped = structuredClone(run);
    skipped.openedGateIds = [
      ...skipped.openedGateIds.filter((id) => !id.startsWith("story:migrate:")),
      "story:migrate:snapshot",
      "story:migrate:preserve-history",
    ];
    expect(isSavedRun(skipped)).toBe(false);

    const exploring = structuredClone(run);
    exploring.mode = "explore";
    exploring.campaign = createCampaignProgress(exploring.campaign.baseSeed, 8);
    expect(isSavedRun(exploring)).toBe(false);

    const unknown = structuredClone(run);
    unknown.openedGateIds[unknown.openedGateIds.length - 1] =
      "story:migrate:drop-history";
    expect(isSavedRun(unknown)).toBe(false);
  });

  it("v12 只接受当前楼层与 Seed 实际生成的陷阱触发标记", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(null, null, "floor-hazard-roundtrip");
    session.enableAdminMode();
    expect(session.adminLoadFloor(8).ok).toBe(true);
    const hazard = session.snapshot().hazards[0];
    if (!hazard) throw new Error("第八层测试迷宫缺少实体陷阱");
    const saved = session.toSavedRun();
    saved.openedGateIds.push(hazard.id);

    expect(isSavedRun(saved)).toBe(true);
    saveRun(storage, saved);
    expect(loadRun(storage)?.openedGateIds).toContain(hazard.id);

    const forged = structuredClone(saved);
    forged.openedGateIds[forged.openedGateIds.length - 1] = "hazard:f8:999";
    expect(isSavedRun(forged)).toBe(false);
  });

  it("恢复旧存档时使用当前内容中的简短怪物名", () => {
    const saved = freshRun("canonical-monster-names");
    const slime = saved.monsters.find((monster) => monster.id === 1);
    if (!slime) throw new Error("旧存档缺少史莱姆");
    slime.name = "旧版名称 · 装饰后缀";

    const restored = new GameSession(saved).snapshot();
    expect(restored.monsters.find((monster) => monster.id === 1)?.name).toBe("史莱姆");
  });

  it("旧怪物编号的 v10 Run 会同步迁移战斗、Actor 与复盘引用", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(freshLegacyRun());
    completeSelect(session);
    const whereRoom = session.snapshot().roomGraph.nodes.find((node) => (
      node.lessonId === "where"
    ));
    if (!whereRoom) throw new Error("测试迷宫缺少 WHERE 区域");
    expect(session.travelToRoom(whereRoom.id).ok).toBe(true);
    const actor = session.snapshot().worldActors.find((entry) => (
      entry.roomNodeId === whereRoom.id
    ));
    if (!actor) throw new Error("测试迷宫缺少 WHERE Actor");
    expect(session.startEncounter(actor.monsterId).ok).toBe(true);
    session.registerQueryError("历史查询错误", "SELECT missing FROM monsters");

    const current = session.toSavedRun();
    const legacy = withLegacyMonsterIds(current);
    legacy.banner = "已扫描 猎犬（ID #201），幽灵与石巨人仍在等待。";
    const legacyWhereRecord = legacy.answerHistory.find((record) => record.monsterId === 201);
    if (!legacyWhereRecord) throw new Error("测试存档缺少旧版 ID #201 答题记录");
    legacyWhereRecord.monsterName = "猎犬";
    legacyWhereRecord.stageObjective = "查询猎犬 name";
    legacyWhereRecord.sql = "SELECT name FROM monsters WHERE name = '猎犬'";
    legacyWhereRecord.answerSql = "SELECT weakness FROM monsters WHERE name = '猎犬'";
    legacyWhereRecord.feedback = "猎犬、幽灵、石巨人均未命中";
    const historicMasterIds = new Map([
      [101, 7],
      [201, 11],
      [800, 42],
      [900, 0],
    ]);
    legacy.monsters.forEach((monster) => {
      if (historicMasterIds.has(monster.id)) {
        monster.masterId = historicMasterIds.get(monster.id) ?? null;
      }
    });
    expect(legacy.monsters.some((monster) => monster.id === 101)).toBe(true);
    expect(legacy.combat?.targetId).toBe(201);
    storage.setItem("select-from-dungeon:run:v10", JSON.stringify({
      ...legacy,
      version: 10,
    }));

    const migrated = loadRun(storage);
    expect(migrated?.monsters.map((monster) => monster.id)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
    expect(migrated?.worldActors.some((entry) => entry.monsterId === 1)).toBe(true);
    expect(migrated?.combat?.targetId).toBe(2);
    expect(migrated?.answerHistory.map((record) => record.monsterId)).toEqual([1, 1, 2]);
    expect(JSON.stringify({
      banner: migrated?.banner,
      history: migrated?.answerHistory,
    })).not.toMatch(/猎犬|幽灵|石巨人|ID #201/);
    expect(migrated?.answerHistory.at(-1)?.monsterName).toBe("ID #002");
    expect(migrated?.monsters.every((monster) => (
      monster.masterId === null ||
      migrated.monsters.some((candidate) => candidate.id === monster.masterId)
    ))).toBe(true);

    const restored = new GameSession(migrated).snapshot();
    expect(restored.monsters.find((monster) => monster.id === 1)?.hp).toBe(0);
    expect(restored.combat?.targetId).toBe(2);
  });

  it("混合或未知怪物编号不会被误判成可迁移存档", () => {
    const storage = new MemoryStorage();
    const mixed = freshRun("mixed-monster-ids");
    mixed.monsters[0].id = 101;
    storage.setItem(RUN_SAVE_KEY, JSON.stringify(mixed));
    expect(loadRun(storage)).toBeNull();

    const unknown = freshRun("unknown-monster-ids");
    unknown.monsters[0].id = 999_999;
    storage.setItem(RUN_SAVE_KEY, JSON.stringify(unknown));
    expect(loadRun(storage)).toBeNull();
  });

  it("当前 v9 Run 会无损迁移到 v12，且保留原始存档作为回退", () => {
    const storage = new MemoryStorage();
    const current = freshLegacyRun();
    storage.setItem("select-from-dungeon:run:v9", JSON.stringify({
      ...current,
      version: 9,
    }));

    const migrated = loadRun(storage);

    expect(migrated).toMatchObject({
      version: 12,
      floor: 1,
      graph: { seed: "legacy-v11-floor-1" },
      campaign: { currentFloor: 1, status: "active" },
    });
    expect(migrated?.campaign.floors).toHaveLength(8);
    expect(storage.values.has("select-from-dungeon:run:v9")).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  });

  it("当前 v8 Run 会迁移到 v12 八层框架，且不会删除原始存档", () => {
    const storage = new MemoryStorage();
    const current = freshLegacyRun();
    const { campaign: _campaign, ...legacyFields } = current;
    storage.setItem("select-from-dungeon:run:v8", JSON.stringify({
      ...legacyFields,
      version: 8,
    }));

    const migrated = loadRun(storage);

    expect(migrated).toMatchObject({
      version: 12,
      floor: 1,
      graph: { seed: "legacy-v11-floor-1" },
      campaign: {
        version: 1,
        baseSeed: "legacy-v11-floor-1",
        currentFloor: 1,
        status: "active",
      },
    });
    expect(migrated?.campaign.floors).toHaveLength(8);
    expect(storage.values.has("select-from-dungeon:run:v8")).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  });

  it("当前 v7 Run 会迁移到 v12 背包和八层框架，且不会删除原始存档", () => {
    const storage = new MemoryStorage();
    const current = freshLegacyRun();
    const {
      activeLootBundleId: _activeLootBundleId,
      lootBundles: _lootBundles,
      equipmentInventory: _equipmentInventory,
      consumables: _consumables,
      keyItems: _keyItems,
      acquiredUniqueItemIds: _acquiredUniqueItemIds,
      campaign: _campaign,
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
      version: 12,
      campaign: { currentFloor: 1, status: "active" },
      activeLootBundleId: null,
      lootBundles: [],
      equipmentInventory: [],
      consumables: [],
      keyItems: [],
      player: { armor: null, armorHp: 0 },
      graph: { seed: "legacy-v11-floor-1" },
    });
    expect(migrated?.acquiredUniqueItemIds).toContain("data-blade");
    expect(storage.values.has("select-from-dungeon:run:v7")).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  });

  it("当前 v6 Run 会生成两处篝火并迁移到 v12，且不会删除原始存档", () => {
    const storage = new MemoryStorage();
    const current = freshLegacyRun();
    const {
      campfires: _campfires,
      activeCampfireId: _activeCampfireId,
      respawnCampfireId: _respawnCampfireId,
      campaign: _campaign,
      ...legacyFields
    } = current;
    storage.setItem("select-from-dungeon:run:v6", JSON.stringify({
      ...legacyFields,
      version: 6,
    }));

    const migrated = loadRun(storage);
    expect(migrated).toMatchObject({
      version: 12,
      activeCampfireId: null,
      respawnCampfireId: null,
      graph: { seed: "legacy-v11-floor-1" },
    });
    expect(migrated?.campfires).toHaveLength(2);
    expect(migrated?.campfires.map((campfire) => campfire.phase)).toEqual([
      "front",
      "rear",
    ]);
    expect(storage.values.has("select-from-dungeon:run:v6")).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  });

  it("v6 玩家若站在新增篝火中心，迁移时移动到相邻安全格而不丢档", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(freshLegacyRun());
    completeSelect(session);
    const current = structuredClone(session.toSavedRun());
    const checkpoint = generateCampfires(current.graph, current.mazeFloor)[0];
    if (!checkpoint) throw new Error("测试楼层缺少前段篝火");
    const {
      campfires: _campfires,
      activeCampfireId: _activeCampfireId,
      respawnCampfireId: _respawnCampfireId,
      campaign: _campaign,
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
    const migratedCheckpoint = migrated?.campfires.find((campfire) => campfire.id === checkpoint.id);
    if (!migratedCheckpoint) throw new Error("迁移后缺少对应篝火");
    expect(migrated).toMatchObject({
      version: 12,
      currentRoomId: checkpoint.roomNodeId,
      player: migratedCheckpoint.restPosition,
      activeCampfireId: null,
      respawnCampfireId: null,
    });
    expect(migrated?.discoveredCells).toContain(
      `${migratedCheckpoint.restPosition.x}:${migratedCheckpoint.restPosition.y}`,
    );
    expect(migrated?.banner).toContain("已移至相邻安全格");
  }, 15_000);

  it("v6 的失败态不会在升级后卡死，会满血回到出生安全区", () => {
    const storage = new MemoryStorage();
    const current = freshLegacyRun();
    const {
      campfires: _campfires,
      activeCampfireId: _activeCampfireId,
      respawnCampfireId: _respawnCampfireId,
      campaign: _campaign,
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
      version: 12,
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

  it("当前 v5 Run 会迁移到 v12，且不会删除原始存档", () => {
    const storage = new MemoryStorage();
    const current = withLegacyMonsterIds(freshLegacyRun());
    const {
      campfires: _campfires,
      activeCampfireId: _activeCampfireId,
      respawnCampfireId: _respawnCampfireId,
      answerHistory: _answerHistory,
      battleSequence: _battleSequence,
      reviewBattleId: _reviewBattleId,
      campaign: _campaign,
      ...legacyFields
    } = current;
    storage.setItem("select-from-dungeon:run:v5", JSON.stringify({
      ...legacyFields,
      version: 5,
    }));

    const migrated = loadRun(storage);
    expect(migrated).toMatchObject({
      version: 12,
      activeCampfireId: null,
      respawnCampfireId: null,
      answerHistory: [],
      battleSequence: 0,
      reviewBattleId: null,
      graph: { seed: "legacy-v11-floor-1" },
    });
    expect(migrated?.campfires).toHaveLength(2);
    expect(storage.values.has("select-from-dungeon:run:v5")).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  }, 15_000);

  it("当前 v4 Run 会迁移到 v12，且不会删除原始存档", () => {
    const storage = new MemoryStorage();
    const current = withLegacyMonsterIds(freshLegacyRun());
    const {
      campfires: _campfires,
      activeCampfireId: _activeCampfireId,
      respawnCampfireId: _respawnCampfireId,
      openedGateIds: _openedGateIds,
      activeGateChallengeId: _activeGateChallengeId,
      answerHistory: _answerHistory,
      battleSequence: _battleSequence,
      reviewBattleId: _reviewBattleId,
      campaign: _campaign,
      ...legacyFields
    } = current;
    const legacy = { ...legacyFields, version: 4 };
    storage.setItem("select-from-dungeon:run:v4", JSON.stringify(legacy));

    const migrated = loadRun(storage);
    expect(migrated).toMatchObject({
      version: 12,
      activeCampfireId: null,
      respawnCampfireId: null,
      openedGateIds: [],
      activeGateChallengeId: null,
      answerHistory: [],
      battleSequence: 0,
      reviewBattleId: null,
      graph: { seed: "legacy-v11-floor-1" },
    });
    expect(migrated?.campfires).toHaveLength(2);
    expect(storage.values.has("select-from-dungeon:run:v4")).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  });

  it("永久 Profile v1 会迁移为包含怪物身份记录的 v3", () => {
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
      discoveredMonsterIds: [1, 2],
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

  it("八层骨架与当前物理楼层不一致时拒绝恢复", () => {
    const storage = new MemoryStorage();
    const wrongFloor = freshRun("broken-campaign-floor");
    wrongFloor.campaign.currentFloor = 2;
    expectRunRejected(storage, wrongFloor);

    const duplicateActive = freshRun("broken-campaign-status");
    duplicateActive.campaign.floors[1].status = "active";
    expectRunRejected(storage, duplicateActive);
  });

  it("victory 与 completed 双向一致，旧 v10 终局异常会迁移且不丢档", () => {
    const storage = new MemoryStorage();
    const completedRun = freshFloorEightRun("victory-save");
    const completion = advanceCampaignProgress(completedRun.campaign);
    expect(completion).toMatchObject({ ok: true, completed: true });
    completedRun.mode = "victory";
    completedRun.campaign = completion.progress;

    expect(isSavedRun(completedRun)).toBe(true);
    saveRun(storage, completedRun);
    expect(loadRun(storage)).toEqual(completedRun);

    const legacyVictory = structuredClone(completedRun) as Omit<SavedRun, "version"> & {
      version: number;
    };
    legacyVictory.version = 10;
    legacyVictory.campaign = createCampaignProgress(
      legacyVictory.campaign.baseSeed,
      8,
    );
    expect(isSavedRun(legacyVictory)).toBe(false);
    storage.setItem("select-from-dungeon:run:v10", JSON.stringify(legacyVictory));
    const migrated = loadRun(storage);
    expect(migrated).toMatchObject({
      version: 12,
      floor: 8,
      mode: "victory",
      campaign: {
        currentFloor: 8,
        status: "completed",
      },
    });
    expect(migrated?.campaign.floors.every(
      (slot) => slot.status === "cleared",
    )).toBe(true);
    storage.removeItem("select-from-dungeon:run:v10");

    const impossibleReverse = structuredClone(completedRun);
    impossibleReverse.mode = "explore";
    expectRunRejected(storage, impossibleReverse);
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
      monsterId: 1,
      monsterName: "史莱姆",
      lessonId: "select",
      stageId: "select-name",
      stageObjective: "查询史莱姆名字",
      round: 1,
      sql: "SELECT name FROM monsters",
      answerSql: "SELECT name FROM monsters WHERE id = 1;",
      result: "wrong-result",
      outcome: "countered",
      feedback: "结果不匹配",
      hintLevel: 0,
    }];

    expectRunRejected(storage, run);
    run.answerHistory[0].id = 1;
    run.answerHistory[0].answerSql = "";
    expectRunRejected(storage, run);

    run.answerHistory[0].answerSql = "SELECT id FROM monsters WHERE id = 84;";
    run.answerHistory[0].monsterId = 84;
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
