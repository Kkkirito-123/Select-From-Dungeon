import { describe, expect, it } from "vitest";
import { deriveFloorWorldState } from "../src/domain/floorWorldState";
import type { RunLessonId } from "../src/domain/runGraph";

function input(
  floor: 1 | 2,
  lessons: readonly RunLessonId[] = [],
  monsters: readonly number[] = [],
  gates: readonly string[] = [],
) {
  return {
    floor,
    completedLessonIds: new Set(lessons),
    defeatedMonsterIds: new Set(monsters),
    openedGateIds: new Set(gates),
    discoveredMonsterIds: new Set<number>(),
    collectedKeyItems: new Set<string>(),
    visitedRoomIds: new Set<string>(),
    activeCampfireId: null,
  } as const;
}

describe("deriveFloorWorldState", () => {
  it("derives the complete first-floor environmental arc", () => {
    expect(deriveFloorWorldState(input(1))).toMatchObject({
      water: "high",
      wheel: "stalled",
      beds: "hidden",
      registry: "dormant",
      lift: "locked",
    });
    expect(deriveFloorWorldState(input(1, ["select", "where", "is-null"])))
      .toMatchObject({ water: "low", wheel: "turning", beds: "revealed" });
    expect(deriveFloorWorldState(input(
      1,
      ["select", "where", "is-null", "group-by"],
      [1, 2, 3, 4],
      ["shortcut:1:return"],
    ))).toMatchObject({ receipts: "grouped", shortcut: "open", registry: "awake" });
    expect(deriveFloorWorldState(input(
      1,
      ["select", "where", "is-null", "group-by", "having"],
      [1, 2, 3, 4, 5],
      ["shortcut:1:return"],
    ))).toMatchObject({ registry: "amended", lift: "active" });
  });

  it("derives the archipelago route, tide, lock and lighthouse", () => {
    expect(deriveFloorWorldState(input(2))).toMatchObject({
      tide: "high",
      beacons: "dark",
      rootBridge: "severed",
      shipLock: "closed",
      lighthouse: "overwriting",
    });
    expect(deriveFloorWorldState(input(
      2,
      ["order-by", "distinct", "inner-join", "left-join"],
      [10, 11, 12, 13, 21],
      ["shortcut:2:return"],
    ))).toMatchObject({
      tide: "low",
      beacons: "seven-reflections",
      channels: "distinct",
      rootBridge: "linked",
      missingGearDoor: "found",
      drownedVillage: "revealed",
      shipLock: "open",
    });
    expect(deriveFloorWorldState(input(2, ["join-boss"], [14])))
      .toMatchObject({ lighthouse: "preserving", northFerry: "docked" });
  });

  it("is deterministic and returns no shared mutable object", () => {
    const progress = input(1, ["select", "where"]);
    const first = deriveFloorWorldState(progress);
    const second = deriveFloorWorldState(progress);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});
