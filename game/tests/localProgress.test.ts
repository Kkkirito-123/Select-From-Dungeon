import { describe, expect, it } from "vitest";
import { GameSession } from "../src/features/game-session/GameSession";
import { advanceCampaignProgress } from "../src/domain/progression/campaign";
import { detectQueryFeatures } from "../src/domain/learning/lessonEvaluator";
import { migrationStepMarkerIds } from "../src/domain/progression/finalMigration";
import type { SavedRun, SqlQueryResult } from "../src/domain/shared/types";
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
} from "../src/infrastructure/storage/localProgress";

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

function freshFloorEightRun(seed: string): SavedRun {
  const session = new GameSession(null, null, seed);
  session.enableAdminMode();
  expect(session.adminLoadFloor(8).ok).toBe(true);
  return structuredClone(session.toSavedRun());
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
  const room = session.snapshot().roomGraph.nodes.find((node) => node.lessonId === "select");
  if (!room) throw new Error("测试迷宫缺少 SELECT 区域");
  expect(session.travelToRoom(room.id).ok).toBe(true);
  const actor = session.snapshot().worldActors.find((entry) => entry.roomNodeId === room.id);
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
  it("完整往返当前 v12 Run 与 v3 Profile", () => {
    const storage = new MemoryStorage();
    const saved = freshRun("storage-seed");
    const profile = createEmptyProfile();
    profile.masteredLessons.push("select");
    profile.attempts.select = 2;

    saveRun(storage, saved);
    saveProfile(storage, profile);

    expect(RUN_SAVE_KEY).toBe("select-from-dungeon:run:v12");
    expect(PROFILE_SAVE_KEY).toBe("select-from-dungeon:profile:v3");
    expect(loadRun(storage)).toEqual(saved);
    expect(loadProfile(storage)).toEqual(profile);
    expect(new GameSession(loadRun(storage), loadProfile(storage)).snapshot()).toMatchObject({
      mazeFloor: { topologyHash: saved.mazeFloor.topologyHash },
      worldActors: saved.worldActors,
      groundItems: saved.groundItems,
      campfires: saved.campfires,
      discoveredCells: saved.discoveredCells,
    });
  });

  it("只接受当前题库、完整牌组状态和 generator-v7", () => {
    const storage = new MemoryStorage();
    const wrongBank = freshRun("wrong-question-bank");
    wrongBank.questionBankVersion = "question-bank-v2";
    expectRunRejected(storage, wrongBank);

    const { practiceDrawStates: _practiceDrawStates, ...missingTierState } = freshRun(
      "missing-tier-state",
    );
    storage.setItem(RUN_SAVE_KEY, JSON.stringify(missingTierState));
    expect(loadRun(storage)).toBeNull();

    const oldGenerator = structuredClone(freshRun("old-generator")) as unknown as {
      generatorVersion: number;
      mazeFloor: { generatorVersion: number };
    };
    oldGenerator.generatorVersion = 6;
    oldGenerator.mazeFloor.generatorVersion = 6;
    storage.setItem(RUN_SAVE_KEY, JSON.stringify(oldGenerator));
    expect(loadRun(storage)).toBeNull();

    const oldProfile = { ...createEmptyProfile(), version: 2, victories: 4 };
    storage.setItem(PROFILE_SAVE_KEY, JSON.stringify(oldProfile));
    expect(loadProfile(storage)).toEqual(createEmptyProfile());
  });

  it("历史键不再读取，清理当前 Run 时也不主动删除历史数据", () => {
    const storage = new MemoryStorage();
    const oldRunKey = "select-from-dungeon:run:v11";
    const oldProfileKey = "select-from-dungeon:profile:v2";
    storage.setItem(oldRunKey, JSON.stringify(freshRun("ignored-old-run")));
    storage.setItem(oldProfileKey, JSON.stringify({ ...createEmptyProfile(), victories: 4 }));

    expect(loadRun(storage)).toBeNull();
    expect(loadProfile(storage)).toEqual(createEmptyProfile());
    expect(storage.readKeys).toEqual([RUN_SAVE_KEY, PROFILE_SAVE_KEY]);
    clearRun(storage);
    expect(storage.removedKeys).toEqual([RUN_SAVE_KEY]);
    expect(storage.values.has(oldRunKey)).toBe(true);
    expect(storage.values.has(oldProfileKey)).toBe(true);
  });

  it("恢复当前战斗、篝火和死亡复盘状态", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(null, null, "state-roundtrip");
    completeSelect(session);
    const checkpoint = session.snapshot().campfires[0];
    if (!checkpoint) throw new Error("测试楼层缺少篝火");

    expect(session.setPlayerPosition(
      checkpoint.restPosition.x,
      checkpoint.restPosition.y,
    )).toBe(true);
    expect(session.interact().ok).toBe(true);
    saveRun(storage, session.toSavedRun());
    expect(loadRun(storage)).toMatchObject({ mode: "campfire", activeCampfireId: checkpoint.id });

    const restored = new GameSession(loadRun(storage));
    expect(restored.restAtCampfire().ok).toBe(true);
    const room = restored.snapshot().roomGraph.nodes.find((node) => node.lessonId === "where");
    if (!room) throw new Error("测试迷宫缺少 WHERE 区域");
    expect(restored.travelToRoom(room.id).ok).toBe(true);
    const actor = restored.snapshot().worldActors.find((entry) => entry.roomNodeId === room.id);
    if (!actor) throw new Error("测试迷宫缺少 WHERE Actor");
    expect(restored.startEncounter(actor.monsterId).ok).toBe(true);
    expect(restored.registerQueryError("第一次语法错误").playerDamage).toBe(1);
    expect(restored.registerQueryError("第二次语法错误").mode).toBe("defeat");
    expect(restored.respawnAfterDefeat()).toBe(true);
    saveRun(storage, restored.toSavedRun());

    expect(loadRun(storage)).toMatchObject({
      mode: "death-review",
      activeCampfireId: null,
      respawnCampfireId: checkpoint.id,
      player: { x: checkpoint.restPosition.x, y: checkpoint.restPosition.y, hp: 2 },
    });
  }, 15_000);

  it("接受当前剧情、陷阱和有序 MIGRATE 标记，拒绝伪造标记", () => {
    const story = new GameSession(null, null, "story-evidence-roundtrip");
    expect(story.recordStoryEvidence("lost-name:f1:current-record")).toBe(true);
    expect(isSavedRun(story.toSavedRun())).toBe(true);
    const forged = story.toSavedRun();
    forged.openedGateIds.push("story:evidence:lost-name:f8:identity-set");
    expect(isSavedRun(forged)).toBe(false);

    const victory = freshFloorEightRun("migration-progress-roundtrip");
    const completion = advanceCampaignProgress(victory.campaign);
    if (!completion.ok || !completion.completed) throw new Error("第八层无法进入胜利态");
    victory.mode = "victory";
    victory.campaign = completion.progress;
    victory.openedGateIds.push(...migrationStepMarkerIds().slice(0, 3));
    expect(isSavedRun(victory)).toBe(true);

    const skipped = structuredClone(victory);
    skipped.openedGateIds = [
      ...skipped.openedGateIds.filter((id) => !id.startsWith("story:migrate:")),
      "story:migrate:snapshot",
      "story:migrate:preserve-history",
    ];
    expect(isSavedRun(skipped)).toBe(false);

    const hazardSession = new GameSession(null, null, "floor-hazard-roundtrip");
    hazardSession.enableAdminMode();
    expect(hazardSession.adminLoadFloor(8).ok).toBe(true);
    const hazard = hazardSession.snapshot().hazards[0];
    if (!hazard) throw new Error("第八层测试迷宫缺少实体陷阱");
    const hazardRun = hazardSession.toSavedRun();
    hazardRun.openedGateIds.push(hazard.id);
    expect(isSavedRun(hazardRun)).toBe(true);
    hazardRun.openedGateIds[hazardRun.openedGateIds.length - 1] = "hazard:f8:999";
    expect(isSavedRun(hazardRun)).toBe(false);
  });

  it("拒绝当前 Run 中损坏或不一致的关键字段", () => {
    const storage = new MemoryStorage();
    const wrongCampaign = freshRun("broken-campaign");
    wrongCampaign.campaign.currentFloor = 2;
    expectRunRejected(storage, wrongCampaign);

    const malformedMaze = freshRun("broken-maze");
    malformedMaze.mazeFloor.tiles[0] = malformedMaze.mazeFloor.tiles[0].slice(1);
    expectRunRejected(storage, malformedMaze);

    const invalidActor = freshRun("broken-actor");
    invalidActor.worldActors[0].x = invalidActor.mazeFloor.width;
    expectRunRejected(storage, invalidActor);

    const missingCampfire = freshRun("broken-campfire");
    missingCampfire.campfires.pop();
    expectRunRejected(storage, missingCampfire);

    const duplicateCell = freshRun("broken-discovery");
    duplicateCell.discoveredCells.push(duplicateCell.discoveredCells[0]);
    expectRunRejected(storage, duplicateCell);

    const unknownMonster = freshRun("broken-monster");
    unknownMonster.monsters[0].id = 999_999;
    expectRunRejected(storage, unknownMonster);

    const missingMonster = freshRun("missing-monster");
    missingMonster.monsters.pop();
    expectRunRejected(storage, missingMonster);

    storage.setItem(RUN_SAVE_KEY, "{broken");
    storage.setItem(PROFILE_SAVE_KEY, JSON.stringify({ version: 3, victories: -1 }));
    expect(loadRun(storage)).toBeNull();
    expect(loadProfile(storage)).toEqual(createEmptyProfile());
  });

  it("只清除 Run，并在 Profile 写入失败后允许重试", () => {
    const storage = new MemoryStorage();
    saveRun(storage, freshRun("clear-run"));
    const profile = createEmptyProfile();
    profile.victories = 3;
    saveProfile(storage, profile);
    clearRun(storage);
    expect(loadRun(storage)).toBeNull();
    expect(loadProfile(storage).victories).toBe(3);

    const flaky = new FlakyProfileStorage();
    const changed = createEmptyProfile();
    changed.masteredLessons.push("select");
    changed.attempts.select = 2;
    const originalJson = JSON.stringify(createEmptyProfile());
    expect(persistProfileIfChanged(flaky, changed, originalJson)).toBe(originalJson);
    expect(flaky.values.has(PROFILE_SAVE_KEY)).toBe(false);
    expect(persistProfileIfChanged(flaky, changed, originalJson)).toBe(JSON.stringify(changed));
    expect(loadProfile(flaky)).toEqual(changed);
  });

  it("localStorage 不可用时保持内存游戏可运行", () => {
    const storage = new UnavailableStorage();
    const run = freshRun("storage-unavailable");
    expect(loadRun(storage)).toBeNull();
    expect(loadProfile(storage)).toEqual(createEmptyProfile());
    expect(() => saveRun(storage, run)).not.toThrow();
    expect(() => saveProfile(storage, createEmptyProfile())).not.toThrow();
    expect(() => clearRun(storage)).not.toThrow();
  });
});
