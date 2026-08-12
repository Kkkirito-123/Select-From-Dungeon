import { describe, expect, it } from "vitest";
import type { GameSnapshot, GroundItem } from "../src/domain/shared/types";
import type { MazeGate } from "../src/domain/exploration/mazeGenerator";
import { newlyOpenedGate, pickedItemsBetween } from "../src/presentation/phaser/snapshotFeedback";

type FeedbackSnapshot = Pick<
  GameSnapshot,
  "runSeed" | "groundItems" | "completedLessons" | "availableRoomIds" | "mode"
> & { mazeFloor: Pick<GameSnapshot["mazeFloor"], "gates"> };

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
});
