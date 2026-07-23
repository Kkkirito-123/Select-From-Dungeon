import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/GameSession";
import type { SavedRun } from "../src/domain/types";
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

function expectRunRejected(storage: MemoryStorage, run: SavedRun): void {
  storage.setItem(RUN_SAVE_KEY, JSON.stringify(run));
  expect(() => loadRun(storage)).not.toThrow();
  expect(loadRun(storage)).toBeNull();
}

describe("localProgress", () => {
  it("v4 Run 与永久 Profile 使用独立 key 并能完整恢复迷宫状态", () => {
    const storage = new MemoryStorage();
    const session = new GameSession(null, null, "storage-seed");
    const saved = session.toSavedRun();
    const profile = createEmptyProfile();
    profile.masteredLessons.push("select");
    profile.attempts.select = 2;
    saveRun(storage, saved);
    saveProfile(storage, profile);

    expect(RUN_SAVE_KEY).toBe("select-from-dungeon:run:v4");
    expect(PROFILE_SAVE_KEY).toBe("select-from-dungeon:profile:v2");
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(true);
    expect(storage.values.has(PROFILE_SAVE_KEY)).toBe(true);
    const loaded = loadRun(storage);
    expect(loaded?.graph.seed).toBe("storage-seed");
    expect(loaded?.mazeFloor).toEqual(saved.mazeFloor);
    expect(loaded?.worldActors).toEqual(saved.worldActors);
    expect(loaded?.groundItems).toEqual(saved.groundItems);
    expect(loaded?.discoveredCells).toEqual(saved.discoveredCells);
    expect(loadProfile(storage).masteredLessons).toEqual(["select"]);

    const restored = new GameSession(loaded, loadProfile(storage));
    const snapshot = restored.snapshot();
    expect(snapshot.mazeFloor.topologyHash).toBe(saved.mazeFloor.topologyHash);
    expect(snapshot.worldActors).toEqual(saved.worldActors);
    expect(snapshot.groundItems).toEqual(saved.groundItems);
    expect(snapshot.discoveredCells).toEqual(saved.discoveredCells);
  });

  it("旧 run:v1/v2 不读取，也不会被 v4 清理动作删除", () => {
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
    expect(storage.readKeys).toEqual([RUN_SAVE_KEY]);
    clearRun(storage);
    expect(storage.removedKeys).toEqual([RUN_SAVE_KEY]);
    expect(storage.values.has(legacyKey)).toBe(true);
    expect(storage.values.has(previousKey)).toBe(true);
    expect(storage.values.has(RUN_SAVE_KEY)).toBe(false);
  });

  it("战斗中的房间、玩家与 Actor 状态也能通过 v4 恢复", () => {
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
