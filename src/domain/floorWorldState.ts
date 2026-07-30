import type { FloorNumber, RunLessonId } from "./runGraph";

export interface FloorWorldProgressInput {
  floor: FloorNumber;
  completedLessonIds: ReadonlySet<RunLessonId>;
  defeatedMonsterIds: ReadonlySet<number>;
  openedGateIds: ReadonlySet<string>;
  discoveredMonsterIds: ReadonlySet<number>;
  collectedKeyItems: ReadonlySet<string>;
  visitedRoomIds: ReadonlySet<string>;
  activeCampfireId: string | null;
}

export interface FloorOneWorldState {
  floor: 1;
  cipher: "sealed" | "decoded";
  water: "high" | "middle" | "low";
  wheel: "stalled" | "turning";
  beds: "hidden" | "visible" | "revealed";
  receipts: "scattered" | "grouped";
  shortcut: "closed" | "open";
  registry: "dormant" | "awake" | "amended";
  lift: "locked" | "active";
}

export interface FloorTwoWorldState {
  floor: 2;
  cipher: "sealed" | "decoded";
  tide: "high" | "low";
  beacons: "dark" | "ranked" | "seven-reflections";
  channels: "overlapping" | "distinct";
  rootBridge: "severed" | "linked";
  missingGearDoor: "hidden" | "found";
  drownedVillage: "submerged" | "revealed";
  shipLock: "closed" | "open";
  lighthouse: "overwriting" | "preserving";
  northFerry: "away" | "docked";
}

export interface FloorThreeWorldState {
  floor: 3;
  cipher: "sealed" | "decoded";
  boneBridge: "severed" | "linked";
  missingGear: "lost" | "kept";
  steles: "anonymous" | "aliased";
  relicChain: "loose" | "linked";
  witnesses: "buried" | "united";
  reliquary: "sealed" | "open";
  graveLord: "guarding" | "defeated";
  throne: "judging" | "audited";
  burialShaft: "cold" | "lit";
}

export interface FloorFourWorldState {
  floor: 4;
  cipher: "sealed" | "decoded";
  source: "opaque" | "identified";
  frostArray: "mixed" | "selected";
  stormRecords: "dark" | "proved";
  pipes: "separate" | "correlated";
  dependency: "fragmented" | "named" | "traced";
  forgeLord: "guarding" | "defeated";
  echoGate: "absent" | "sealed" | "open";
  throne: "open-transaction" | "audited";
  ascent: "locked" | "active";
}

export interface FloorFiveWorldState {
  floor: 5;
  cipher: "sealed" | "decoded";
  roster: "folded" | "partitioned" | "numbered";
  standards: "single-order" | "ties-visible";
  patrol: "isolated" | "linked";
  alert: "opaque" | "framed";
  silentRoster: "sealed" | "open";
  clock: "enforcing" | "reordered";
  ascent: "raised" | "lowered";
}

export interface FloorSixWorldState {
  floor: 6;
  cipher: "sealed" | "decoded";
  sandbox: "pristine" | "written" | "updated";
  cleanup: "duplicated" | "targeted";
  constraint: "testing" | "protected";
  bridge: "candidate-damaged" | "rolled-back";
  savepoint: "unverified" | "validated";
  rookery: "sealed" | "open";
  throne: "forcing-commit" | "validated";
  ascent: "locked" | "active";
}

export interface FloorSevenWorldState {
  floor: 7;
  cipher: "sealed" | "decoded";
  indexPath: "dark" | "point-search" | "composite";
  lake: "reflecting-table" | "covering";
  rootGate: "entangled" | "range-open";
  planTree: "opaque" | "explained";
  blindGarden: "sealed" | "open";
  throne: "single-path" | "paths-compared";
  ascent: "shadowed" | "sunlit";
}

export interface FloorEightWorldState {
  floor: 8;
  cipher: "sealed" | "decoded";
  gallery: "overlapping" | "snapshot";
  deadlock: "locked" | "cycle-exposed";
  wings: 0 | 1 | 2 | 3 | 4;
  chapel: "sealed" | "open";
  migration: "collecting" | "ready";
  throne: "waiting" | "migrating" | "committed";
  vista: "fading" | "new-dawn";
}

export type FloorWorldState =
  | FloorOneWorldState
  | FloorTwoWorldState
  | FloorThreeWorldState
  | FloorFourWorldState
  | FloorFiveWorldState
  | FloorSixWorldState
  | FloorSevenWorldState
  | FloorEightWorldState;

function gateIsOpen(gates: ReadonlySet<string>, floor: FloorNumber): boolean {
  return gates.has(`shortcut:${floor}:return`);
}

function cipherGateId(floor: FloorNumber): string {
  const lesson = floor === 1
    ? "boss"
    : floor === 2
      ? "boss"
      : floor === 8
        ? "lesson-7"
        : "lesson-6";
  return `gate:floor-${floor}-${lesson}`;
}

function cipherState(
  gates: ReadonlySet<string>,
  floor: FloorNumber,
): "sealed" | "decoded" {
  return gates.has(cipherGateId(floor)) ? "decoded" : "sealed";
}

export function deriveFloorWorldState(
  input: FloorWorldProgressInput,
): FloorWorldState {
  const completed = input.completedLessonIds;
  const defeated = input.defeatedMonsterIds;
  const shortcutOpen = gateIsOpen(input.openedGateIds, input.floor);

  if (input.floor === 1) {
    const hasSelect = completed.has("select");
    const hasWhere = completed.has("where");
    const hasNull = completed.has("is-null");
    const grouped = completed.has("group-by");
    const bossDefeated = defeated.has(5) || completed.has("having");
    const registryAwake = shortcutOpen && hasSelect && hasWhere && hasNull;
    return {
      floor: 1,
      cipher: cipherState(input.openedGateIds, 1),
      water: hasWhere ? "low" : hasSelect ? "middle" : "high",
      wheel: hasSelect ? "turning" : "stalled",
      beds: hasNull ? "revealed" : hasWhere ? "visible" : "hidden",
      receipts: grouped ? "grouped" : "scattered",
      shortcut: shortcutOpen ? "open" : "closed",
      registry: bossDefeated ? "amended" : registryAwake ? "awake" : "dormant",
      lift: bossDefeated ? "active" : "locked",
    };
  }

  if (input.floor === 2) {
    const bossDefeated = defeated.has(14) || completed.has("join-boss");
    const lakeBeastDefeated = defeated.has(21);
    const beaconsRanked = completed.has("order-by");
    return {
      floor: 2,
      cipher: cipherState(input.openedGateIds, 2),
      tide: lakeBeastDefeated ? "low" : "high",
      beacons: shortcutOpen
        ? "seven-reflections"
        : beaconsRanked
          ? "ranked"
          : "dark",
      channels: completed.has("distinct") ? "distinct" : "overlapping",
      rootBridge: completed.has("inner-join") ? "linked" : "severed",
      missingGearDoor: completed.has("left-join") ? "found" : "hidden",
      drownedVillage: lakeBeastDefeated ? "revealed" : "submerged",
      shipLock: shortcutOpen ? "open" : "closed",
      lighthouse: bossDefeated ? "preserving" : "overwriting",
      northFerry: bossDefeated ? "docked" : "away",
    };
  }

  if (input.floor === 3) {
    const bossDefeated = defeated.has(28) || completed.has("f3-audit");
    return {
      floor: 3,
      cipher: cipherState(input.openedGateIds, 3),
      boneBridge: completed.has("f3-inner") ? "linked" : "severed",
      missingGear: completed.has("f3-left") ? "kept" : "lost",
      steles: completed.has("f3-self") ? "aliased" : "anonymous",
      relicChain: completed.has("f3-chain") ? "linked" : "loose",
      witnesses: completed.has("f3-union") ? "united" : "buried",
      reliquary: input.openedGateIds.has("gate:floor-3-treasure") ? "open" : "sealed",
      graveLord: defeated.has(33) ? "defeated" : "guarding",
      throne: bossDefeated ? "audited" : "judging",
      burialShaft: bossDefeated ? "lit" : "cold",
    };
  }

  if (input.floor === 4) {
    const forgeLordDefeated = defeated.has(44);
    const finalBossDefeated = defeated.has(39) || completed.has("f4-recursive");
    return {
      floor: 4,
      cipher: cipherState(input.openedGateIds, 4),
      source: completed.has("f4-scalar") ? "identified" : "opaque",
      frostArray: completed.has("f4-in") ? "selected" : "mixed",
      stormRecords: completed.has("f4-exists") ? "proved" : "dark",
      pipes: completed.has("f4-correlated") ? "correlated" : "separate",
      dependency: completed.has("f4-recursive")
        ? "traced"
        : completed.has("f4-cte")
          ? "named"
          : "fragmented",
      forgeLord: forgeLordDefeated ? "defeated" : "guarding",
      echoGate: input.openedGateIds.has("gate:floor-4-treasure")
        ? "open"
        : forgeLordDefeated
          ? "sealed"
          : "absent",
      throne: finalBossDefeated ? "audited" : "open-transaction",
      ascent: finalBossDefeated ? "active" : "locked",
    };
  }

  if (input.floor === 5) {
    const complete = defeated.has(50) || completed.has("f5-top-n");
    return {
      floor: 5,
      cipher: cipherState(input.openedGateIds, 5),
      roster: completed.has("f5-row-number")
        ? "numbered"
        : completed.has("f5-over")
          ? "partitioned"
          : "folded",
      standards: completed.has("f5-rank") ? "ties-visible" : "single-order",
      patrol: completed.has("f5-lag-lead") ? "linked" : "isolated",
      alert: completed.has("f5-frame") ? "framed" : "opaque",
      silentRoster: input.openedGateIds.has("gate:floor-5-treasure") ? "open" : "sealed",
      clock: complete ? "reordered" : "enforcing",
      ascent: complete ? "lowered" : "raised",
    };
  }

  if (input.floor === 6) {
    const complete = defeated.has(61) || completed.has("f6-savepoint");
    return {
      floor: 6,
      cipher: cipherState(input.openedGateIds, 6),
      sandbox: completed.has("f6-update")
        ? "updated"
        : completed.has("f6-insert")
          ? "written"
          : "pristine",
      cleanup: completed.has("f6-delete") ? "targeted" : "duplicated",
      constraint: completed.has("f6-constraint") ? "protected" : "testing",
      bridge: completed.has("f6-transaction") ? "rolled-back" : "candidate-damaged",
      savepoint: completed.has("f6-savepoint") ? "validated" : "unverified",
      rookery: input.openedGateIds.has("gate:floor-6-treasure") ? "open" : "sealed",
      throne: complete ? "validated" : "forcing-commit",
      ascent: complete ? "active" : "locked",
    };
  }

  if (input.floor === 7) {
    const complete = defeated.has(72) || completed.has("f7-optimize");
    return {
      floor: 7,
      cipher: cipherState(input.openedGateIds, 7),
      indexPath: completed.has("f7-composite")
        ? "composite"
        : completed.has("f7-btree")
          ? "point-search"
          : "dark",
      lake: completed.has("f7-covering") ? "covering" : "reflecting-table",
      rootGate: completed.has("f7-invalid") ? "range-open" : "entangled",
      planTree: completed.has("f7-plan") ? "explained" : "opaque",
      blindGarden: input.openedGateIds.has("gate:floor-7-treasure") ? "open" : "sealed",
      throne: complete ? "paths-compared" : "single-path",
      ascent: complete ? "sunlit" : "shadowed",
    };
  }

  const completedWings = [
    "f8-isolation",
    "f8-modeling",
    "f8-replication",
    "f8-sharding",
  ].filter((lessonId) => completed.has(lessonId as RunLessonId)).length as 0 | 1 | 2 | 3 | 4;
  const migrating = completed.has("f8-sharding");
  const complete = defeated.has(84) || completed.has("f8-security");
  return {
    floor: 8,
    cipher: cipherState(input.openedGateIds, 8),
    gallery: completed.has("f8-mvcc") ? "snapshot" : "overlapping",
    deadlock: completed.has("f8-lock") ? "cycle-exposed" : "locked",
    wings: completedWings,
    chapel: input.openedGateIds.has("gate:floor-8-treasure") ? "open" : "sealed",
    migration: migrating ? "ready" : "collecting",
    throne: complete ? "committed" : migrating ? "migrating" : "waiting",
    vista: complete ? "new-dawn" : "fading",
  };
}

export function floorWorldStateFromSnapshot(input: {
  floor: FloorNumber;
  completedLessons: readonly RunLessonId[];
  monsters: readonly { id: number; hp: number }[];
  openedGateIds: readonly string[];
  profile: { discoveredMonsterIds: readonly number[] };
  keyItems: readonly string[];
  visitedRoomIds: readonly string[];
  activeCampfireId: string | null;
}): FloorWorldState | null {
  if (input.floor < 1 || input.floor > 8) return null;
  const floor = input.floor;
  return deriveFloorWorldState({
    floor,
    completedLessonIds: new Set(input.completedLessons),
    defeatedMonsterIds: new Set(
      input.monsters.filter((monster) => monster.hp <= 0).map((monster) => monster.id),
    ),
    openedGateIds: new Set(input.openedGateIds),
    discoveredMonsterIds: new Set(input.profile.discoveredMonsterIds),
    collectedKeyItems: new Set(input.keyItems),
    visitedRoomIds: new Set(input.visitedRoomIds),
    activeCampfireId: input.activeCampfireId,
  });
}
