import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/session/GameSession";
import { createEmptyProfile } from "../src/infrastructure/storage/localProgress";
import {
  createDungeonAgentStore,
  parseDungeonAgentLaunch,
  saveDungeonAgentCheckpoint,
} from "../src/devtools/dungeon-agent/protocol";
import { DungeonAgentTrace } from "../src/devtools/dungeon-agent/trace";

describe("Dungeon Agent 开发态协议", () => {
  it("只接受开发态、本机地址和显式 playtest=agent", () => {
    expect(parseDungeonAgentLaunch(
      new URL("http://127.0.0.1:4173/?playtest=agent"),
      true,
    )).toEqual({ mode: "agent", floor: 1 });
    expect(parseDungeonAgentLaunch(
      new URL("http://localhost:4173/?playtest=agent&floor=8"),
      true,
    )).toEqual({ mode: "agent", floor: 8 });

    expect(parseDungeonAgentLaunch(
      new URL("https://game.example/?playtest=agent"),
      true,
    )).toBeNull();
    expect(parseDungeonAgentLaunch(
      new URL("http://127.0.0.1:4173/?playtest=agent"),
      false,
    )).toBeNull();
    expect(parseDungeonAgentLaunch(
      new URL("http://127.0.0.1:4173/?playtest=agent&floor=9"),
      true,
    )).toBeNull();
    expect(parseDungeonAgentLaunch(
      new URL("http://127.0.0.1:4173/"),
      true,
    )).toBeNull();
  });

  it("试玩存储不保留 Run、Profile 或正式引导数据", () => {
    const store = createDungeonAgentStore();
    const session = new GameSession(null, createEmptyProfile(), "agent-memory-store");

    store.saveRun(session.toSavedRun());
    store.saveProfile({ masteredLessons: ["select"] } as never);
    expect(store.loadRun()).toBeNull();
    expect(store.loadProfile().masteredLessons).toEqual([]);

    store.setItem("guide", "done");
    expect(store.getItem("guide")).toBe("done");
    store.removeItem("guide");
    expect(store.getItem("guide")).toBeNull();
  });

  it("刷新检查点只消费一次，且损坏内容会明确标记 invalid", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const session = new GameSession(null, createEmptyProfile(), "agent-checkpoint");

    expect(saveDungeonAgentCheckpoint(
      storage,
      session.toSavedRun(),
      session.toProfile(),
    )).toBe(true);
    const restored = createDungeonAgentStore(storage);
    expect(restored.checkpointState).toBe("restored");
    expect(restored.loadRun()?.runInstanceId).toBe(session.toSavedRun().runInstanceId);
    expect(values.size).toBe(0);

    expect(createDungeonAgentStore(storage).checkpointState).toBe("none");
    values.set("dungeon.maintainer.checkpoint.v1", "{broken");
    expect(createDungeonAgentStore(storage).checkpointState).toBe("invalid");
    expect(values.size).toBe(0);
  });

  it("语义 Trace 使用单调序号、固定容量并遮蔽查询正文", () => {
    const trace = new DungeonAgentTrace(2);
    trace.record("look", "floor=1 mode=explore");
    trace.record("query", "SELECT * FROM monsters");
    trace.record("go", "target=objective steps=4 result=mode");

    expect(trace.eventsAfter(0)).toEqual([
      { sequence: 2, type: "query", summary: "[查询正文未记录]" },
      { sequence: 3, type: "go", summary: "target=objective steps=4 result=mode" },
    ]);
    expect(trace.eventsAfter(2)).toEqual([
      { sequence: 3, type: "go", summary: "target=objective steps=4 result=mode" },
    ]);
  });
});
