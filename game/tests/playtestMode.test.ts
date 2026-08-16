import { describe, expect, it } from "vitest";
import {
  createPlaytestStore,
  playtestLaunchFromUrl,
  savePlaytestCheckpoint,
} from "../src/application/playtest/mode";
import { GameSession } from "../src/domain/session/GameSession";
import { createEmptyProfile } from "../src/infrastructure/storage/localProgress";

describe("playtest mode", () => {
  it("只在开发态本机地址显式启用", () => {
    expect(playtestLaunchFromUrl(
      new URL("http://127.0.0.1:4173/?playtest=agent&floor=1"),
      true,
    )).toEqual({ mode: "agent", floor: 1 });
    expect(playtestLaunchFromUrl(
      new URL("http://localhost:4173/?playtest=agent&floor=8"),
      true,
    )).toEqual({ mode: "agent", floor: 8 });

    expect(playtestLaunchFromUrl(
      new URL("https://game.example/?playtest=agent"),
      true,
    )).toBeNull();
    expect(playtestLaunchFromUrl(
      new URL("http://127.0.0.1:4173/?playtest=agent"),
      false,
    )).toBeNull();
    expect(playtestLaunchFromUrl(
      new URL("http://127.0.0.1:4173/?playtest=agent&floor=9"),
      true,
    )).toBeNull();
  });

  it("使用页面内存存储且不保留 Run、Profile 或引导写入", () => {
    const store = createPlaytestStore();
    expect(store.loadRun()).toBeNull();
    expect(store.loadProfile().masteredLessons).toEqual([]);

    store.setItem("guide", "done");
    expect(store.getItem("guide")).toBe("done");
    store.removeItem("guide");
    expect(store.getItem("guide")).toBeNull();

    store.saveRun({} as never);
    store.saveProfile({ masteredLessons: ["projection"] } as never);
    expect(store.loadRun()).toBeNull();
    expect(store.loadProfile().masteredLessons).toEqual([]);
  });

  it("刷新检查点只恢复一次并在读取后删除", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const session = new GameSession(null, createEmptyProfile(), "playtest-checkpoint");

    expect(savePlaytestCheckpoint(storage, session.toSavedRun(), session.toProfile())).toBe(true);
    const restored = createPlaytestStore(storage);
    expect(restored.checkpointState).toBe("restored");
    expect(restored.loadRun()?.runInstanceId).toBe(session.toSavedRun().runInstanceId);
    expect(values.size).toBe(0);

    const next = createPlaytestStore(storage);
    expect(next.checkpointState).toBe("none");
    expect(next.loadRun()).toBeNull();
  });

  it("损坏的刷新检查点会标记为无效而不是伪装恢复", () => {
    const storage = {
      getItem: () => "{broken",
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    const store = createPlaytestStore(storage);
    expect(store.checkpointState).toBe("invalid");
    expect(store.loadRun()).toBeNull();
  });
});
