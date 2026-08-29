import { describe, expect, it } from "vitest";
import type { GameSnapshot, GroundItem } from "../src/domain/shared/types";
import type { MazeGate } from "../src/domain/exploration/mazeGenerator";
import {
  guidedPickupBetween,
  newlyOpenedGate,
  pickedItemsBetween,
} from "../src/presentation/phaser/snapshotFeedback";

type FeedbackSnapshot = Pick<
  GameSnapshot,
  "runSeed" | "groundItems" | "completedLessons" | "availableRoomIds" | "mode"
> & { mazeFloor: Pick<GameSnapshot["mazeFloor"], "gates"> };

type GuidedPickupSnapshot = Pick<
  GameSnapshot,
  "runSeed" | "floor" | "keyItems" | "openedGateIds" | "guidedMap"
>;

const weapon: GroundItem = {
  id: "lesson-drop:select",
  sourceRoomId: "select-room",
  x: 4,
  y: 4,
  name: "过滤弓",
  description: "test",
  kind: "weapon",
  collection: "touch",
  rewardId: null,
};

const floorKey: GroundItem = {
  ...weapon,
  id: "lesson-drop:having",
  name: "楼层钥匙",
  kind: "key",
  rewardId: "floor-key",
};

const groupGate: MazeGate = {
  id: "gate-group",
  roomNodeId: "group-room",
  x: 8,
  y: 8,
  requires: ["where", "is-null"],
  outside: { x: 7, y: 8 },
};

function state(overrides: Partial<FeedbackSnapshot> = {}): FeedbackSnapshot {
  return {
    runSeed: "same-run",
    groundItems: [],
    completedLessons: [],
    availableRoomIds: [],
    mode: "explore",
    mazeFloor: { gates: [groupGate] },
    ...overrides,
  };
}

function guidedState(
  overrides: Partial<GuidedPickupSnapshot> = {},
): GuidedPickupSnapshot {
  return {
    runSeed: "same-run",
    floor: 1,
    keyItems: [],
    openedGateIds: [],
    guidedMap: {
      version: 1,
      seed: "same-run",
      floor: 1,
      routeMarkers: [],
      deadEndCaches: [],
      shortcuts: [],
    },
    ...overrides,
  };
}

describe("snapshot feedback deltas", () => {
  it("reports a pickup only inside the same run", () => {
    expect(pickedItemsBetween(
      state({ groundItems: [weapon] }),
      state({ groundItems: [] }),
    )).toEqual([weapon]);
    expect(pickedItemsBetween(
      state({ runSeed: "old", groundItems: [weapon] }),
      state({ runSeed: "new", groundItems: [] }),
    )).toEqual([]);
  });

  it("lets victory own the floor-key cue", () => {
    expect(pickedItemsBetween(
      state({ groundItems: [floorKey] }),
      state({ groundItems: [], mode: "victory" }),
    )).toEqual([]);
  });

  it("reports a knowledge gate exactly when its requirements become complete", () => {
    expect(newlyOpenedGate(
      state({ completedLessons: ["where"], availableRoomIds: [] }),
      state({
        completedLessons: ["where", "is-null"],
        availableRoomIds: ["group-room"],
      }),
    )).toEqual(groupGate);
    expect(newlyOpenedGate(
      state({ availableRoomIds: ["group-room"] }),
      state({ availableRoomIds: ["group-room"] }),
    )).toBeNull();
  });

  it("also reports a gate opened by collecting its required weapon", () => {
    const completedLessons = ["where", "is-null"] as const;
    expect(newlyOpenedGate(
      state({ completedLessons: [...completedLessons], availableRoomIds: [] }),
      state({
        completedLessons: [...completedLessons],
        availableRoomIds: ["group-room"],
      }),
    )).toEqual(groupGate);
  });

  it("reports a newly collected guaranteed shortcut key", () => {
    const shortcut = {
      id: "shortcut:front-middle",
      name: "前中段回路",
      keyId: "floor-1-key-front-middle",
      keyRoomNodeId: "key-room",
      keyPosition: { x: 6, y: 7 },
      entry: { x: 10, y: 10 },
      exit: { x: 20, y: 20 },
      requires: [],
      detourDistance: 10,
    };
    expect(guidedPickupBetween(
      guidedState({
        guidedMap: {
          version: 1,
          seed: "same-run",
          floor: 1,
          routeMarkers: [],
          deadEndCaches: [],
          shortcuts: [shortcut],
        },
      }),
      guidedState({
        keyItems: [shortcut.keyId],
        guidedMap: {
          version: 1,
          seed: "same-run",
          floor: 1,
          routeMarkers: [],
          deadEndCaches: [],
          shortcuts: [shortcut],
        },
      }),
    )).toMatchObject({
      id: shortcut.keyId,
      sourceRoomId: shortcut.keyRoomNodeId,
      x: shortcut.keyPosition.x,
      y: shortcut.keyPosition.y,
      kind: "key",
    });
  });

  it("reports a newly opened dead-end cache and ignores a different run or floor", () => {
    const cache = {
      id: "cache:f1:1",
      sourceRoomId: "dead-end",
      x: 4,
      y: 5,
      rewardId: "restore-12-hp" as const,
    };
    const previous = guidedState({
      guidedMap: {
        version: 1,
        seed: "same-run",
        floor: 1,
        routeMarkers: [],
        deadEndCaches: [cache],
        shortcuts: [],
      },
    });
    const next = guidedState({
      openedGateIds: [cache.id],
      guidedMap: {
        version: 1,
        seed: "same-run",
        floor: 1,
        routeMarkers: [],
        deadEndCaches: [cache],
        shortcuts: [],
      },
    });
    expect(guidedPickupBetween(previous, next)).toMatchObject({
      id: cache.id,
      sourceRoomId: cache.sourceRoomId,
      rewardId: cache.rewardId,
      kind: "event",
    });
    expect(guidedPickupBetween(
      previous,
      { ...next, runSeed: "new-run" },
    )).toBeNull();
    expect(guidedPickupBetween(
      previous,
      { ...next, floor: 2 },
    )).toBeNull();
  });
});
