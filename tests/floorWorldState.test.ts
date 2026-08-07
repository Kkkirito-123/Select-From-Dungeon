import { describe, expect, it } from "vitest";
import { deriveFloorWorldState } from "../src/domain/progression/floorWorldState";
import type { RunLessonId } from "../src/domain/progression/runGraph";

function input(
  floor: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
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

  it("第三层关系逐段成形，第四层炉主让回燃门从缺席变为可开启", () => {
    expect(deriveFloorWorldState(input(3))).toMatchObject({
      boneBridge: "severed",
      steles: "anonymous",
      reliquary: "sealed",
      burialShaft: "cold",
    });
    expect(deriveFloorWorldState(input(
      3,
      ["f3-inner", "f3-left", "f3-self", "f3-chain", "f3-union", "f3-audit"],
      [28, 33],
      ["gate:floor-3-treasure"],
    ))).toMatchObject({
      boneBridge: "linked",
      missingGear: "kept",
      steles: "aliased",
      relicChain: "linked",
      witnesses: "united",
      reliquary: "open",
      graveLord: "defeated",
      burialShaft: "lit",
    });

    expect(deriveFloorWorldState(input(4))).toMatchObject({
      forgeLord: "guarding",
      echoGate: "absent",
      dependency: "fragmented",
    });
    expect(deriveFloorWorldState(input(
      4,
      ["f4-scalar", "f4-in", "f4-exists", "f4-correlated", "f4-cte"],
      [44],
    ))).toMatchObject({
      forgeLord: "defeated",
      echoGate: "sealed",
      dependency: "named",
    });
    expect(deriveFloorWorldState(input(
      4,
      ["f4-scalar", "f4-in", "f4-exists", "f4-correlated", "f4-cte"],
      [44],
      ["gate:floor-4-treasure"],
    ))).toMatchObject({ echoGate: "open" });
  });

  it("第五至第八层把窗口、事务、索引与迁移结果写回实体地图", () => {
    expect(deriveFloorWorldState(input(5))).toMatchObject({
      roster: "folded",
      patrol: "isolated",
      clock: "enforcing",
      cipher: "sealed",
    });
    expect(deriveFloorWorldState(input(
      5,
      ["f5-over", "f5-row-number", "f5-rank", "f5-lag-lead", "f5-frame", "f5-top-n"],
      [50],
      ["gate:floor-5-lesson-6", "gate:floor-5-treasure"],
    ))).toMatchObject({
      roster: "numbered",
      standards: "ties-visible",
      patrol: "linked",
      alert: "framed",
      silentRoster: "open",
      clock: "reordered",
      cipher: "decoded",
    });

    expect(deriveFloorWorldState(input(
      6,
      ["f6-insert", "f6-update", "f6-delete", "f6-constraint", "f6-transaction", "f6-savepoint"],
      [61],
      ["gate:floor-6-lesson-6", "gate:floor-6-treasure"],
    ))).toMatchObject({
      sandbox: "updated",
      cleanup: "targeted",
      constraint: "protected",
      bridge: "rolled-back",
      savepoint: "validated",
      rookery: "open",
      throne: "validated",
      cipher: "decoded",
    });

    expect(deriveFloorWorldState(input(
      7,
      ["f7-btree", "f7-composite", "f7-covering", "f7-invalid", "f7-plan", "f7-optimize"],
      [72],
      ["gate:floor-7-lesson-6", "gate:floor-7-treasure"],
    ))).toMatchObject({
      indexPath: "composite",
      lake: "covering",
      rootGate: "range-open",
      planTree: "explained",
      blindGarden: "open",
      throne: "paths-compared",
      cipher: "decoded",
    });

    expect(deriveFloorWorldState(input(
      8,
      ["f8-mvcc", "f8-lock", "f8-isolation", "f8-modeling", "f8-replication", "f8-sharding", "f8-security"],
      [84],
      ["gate:floor-8-lesson-7", "gate:floor-8-treasure"],
    ))).toMatchObject({
      gallery: "snapshot",
      deadlock: "cycle-exposed",
      wings: 4,
      chapel: "open",
      migration: "ready",
      throne: "committed",
      vista: "new-dawn",
      cipher: "decoded",
    });
  });
});
