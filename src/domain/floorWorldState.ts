import type { FloorNumber, RunLessonId } from "./runGraph";

export interface FloorWorldProgressInput {
  floor: Extract<FloorNumber, 1 | 2>;
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

export type FloorWorldState = FloorOneWorldState | FloorTwoWorldState;

function gateIsOpen(gates: ReadonlySet<string>, floor: 1 | 2): boolean {
  return gates.has(`shortcut:${floor}:return`);
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
      water: hasWhere ? "low" : hasSelect ? "middle" : "high",
      wheel: hasSelect ? "turning" : "stalled",
      beds: hasNull ? "revealed" : hasWhere ? "visible" : "hidden",
      receipts: grouped ? "grouped" : "scattered",
      shortcut: shortcutOpen ? "open" : "closed",
      registry: bossDefeated ? "amended" : registryAwake ? "awake" : "dormant",
      lift: bossDefeated ? "active" : "locked",
    };
  }

  const bossDefeated = defeated.has(14) || completed.has("join-boss");
  const lakeBeastDefeated = defeated.has(21);
  const beaconsRanked = completed.has("order-by");
  return {
    floor: 2,
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
  if (input.floor !== 1 && input.floor !== 2) return null;
  return deriveFloorWorldState({
    floor: input.floor,
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
