import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/GameSession";
import type { GameSnapshot } from "../src/domain/types";
import { createEmptyProfile, type StorageLike } from "../src/storage/localProgress";
import {
  PROGRESS_SAVE_DEBOUNCE_MS,
  isCriticalPersistenceChange,
  persistenceFingerprint,
  startProgressPersistence,
} from "../src/storage/progressPersistence";

describe("progress persistence", () => {
  it("连续移动快照只保留一个尾随写入，关键查询变化立即写入", () => {
    const session = new GameSession(null, createEmptyProfile(), "persistence-budget");
    const listenerRef: { current: ((snapshot: GameSnapshot) => void) | null } = {
      current: null,
    };
    const source = {
      subscribe(next: (snapshot: GameSnapshot) => void) {
        listenerRef.current = next;
        next(session.snapshot());
        return () => {
          listenerRef.current = null;
        };
      },
      snapshot: () => session.snapshot(),
      toSavedRun: () => session.toSavedRun(),
      toProfile: () => session.toProfile(),
    };
    const writes: string[] = [];
    const storage: StorageLike = {
      getItem: () => null,
      setItem: (key) => writes.push(key),
      removeItem: () => undefined,
    };
    let pending: (() => void) | null = null;
    let nextTimer = 0;
    const timerApi = {
      setTimeout(callback: () => void, delay: number) {
        expect(delay).toBe(PROGRESS_SAVE_DEBOUNCE_MS);
        pending = callback;
        nextTimer += 1;
        return nextTimer;
      },
      clearTimeout() {
        pending = null;
      },
    };
    const controller = startProgressPersistence(
      source,
      storage,
      JSON.stringify(createEmptyProfile()),
      timerApi,
    );
    expect(writes).toHaveLength(1);

    const initial = session.snapshot();
    for (let move = 1; move <= 80; move += 1) {
      listenerRef.current?.({ ...initial, totalMoves: move });
    }
    expect(writes).toHaveLength(1);
    expect(pending).not.toBeNull();
    const trailingWrite = pending as unknown as () => void;
    trailingWrite();
    expect(writes).toHaveLength(2);

    listenerRef.current?.({ ...initial, queryCount: 1 });
    expect(writes).toHaveLength(3);
    controller.destroy();
    expect(listenerRef.current).toBeNull();
  });

  it("进入管理员预览前先保存待写的正式移动，之后不再覆盖正式 Run", () => {
    const session = new GameSession(null, createEmptyProfile(), "admin-persistence");
    const writes: string[] = [];
    const storage: StorageLike = {
      getItem: () => null,
      setItem: (key) => writes.push(key),
      removeItem: () => undefined,
    };
    const controller = startProgressPersistence(
      session,
      storage,
      JSON.stringify(createEmptyProfile()),
      {
        setTimeout: () => 1,
        clearTimeout: () => undefined,
      },
    );
    expect(writes).toHaveLength(1);

    const beforeMove = session.snapshot();
    const direction = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ].find(({ x, y }) => (
      beforeMove.mazeFloor.tiles[beforeMove.player.y + y]?.[
        beforeMove.player.x + x
      ] === "."
    ));
    expect(direction).toBeDefined();
    expect(session.attemptPlayerMove(direction?.x ?? 0, direction?.y ?? 0).moved)
      .toBe(true);
    expect(writes).toHaveLength(1);

    expect(session.enableAdminMode().ok).toBe(true);
    expect(writes).toHaveLength(2);
    expect(session.adminLoadFloor(8).ok).toBe(true);
    controller.flush();
    expect(writes).toHaveLength(2);
    controller.destroy();
  });

  it("只有会改变恢复结果的字段才判定为关键变化", () => {
    const session = new GameSession(null, createEmptyProfile(), "fingerprint");
    const snapshot = session.snapshot();
    const initial = persistenceFingerprint(snapshot);
    const moved = persistenceFingerprint({
      ...snapshot,
      totalMoves: snapshot.totalMoves + 1,
      player: { ...snapshot.player, x: snapshot.player.x + 1 },
    });
    const queried = persistenceFingerprint({
      ...snapshot,
      queryCount: snapshot.queryCount + 1,
    });

    expect(isCriticalPersistenceChange(initial, moved)).toBe(false);
    expect(isCriticalPersistenceChange(initial, queried)).toBe(true);
    expect(isCriticalPersistenceChange(null, initial)).toBe(true);
  });
});
