import type { FloorNumber } from "../domain/runGraph";

export const MONSTER_ID_COUNT = 89;

const FLOOR_ONE_LEGACY_IDS = [101, 201, 301, 800, 900, 111, 211, 311, 810] as const;
const FLOOR_TWO_LEGACY_IDS = [
  1200,
  1300,
  1400,
  1500,
  1900,
  1210,
  1310,
  1410,
  1510,
  1610,
  1710,
  1810,
  1911,
] as const;

export const LEGACY_MONSTER_IDS_BY_FLOOR: Readonly<
  Record<FloorNumber, readonly number[]>
> = {
  1: FLOOR_ONE_LEGACY_IDS,
  2: FLOOR_TWO_LEGACY_IDS,
  3: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  4: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
  5: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
  6: [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44],
  7: [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55],
  8: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67],
};

export const CURRENT_MONSTER_IDS_BY_FLOOR: Readonly<
  Record<FloorNumber, readonly number[]>
> = {
  1: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  2: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
  3: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
  4: [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44],
  5: [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55],
  6: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66],
  7: [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77],
  8: [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89],
};

const FIRST_TWO_FLOOR_ID_PAIRS: readonly (readonly [number, number])[] = [
  [101, 1],
  [201, 2],
  [301, 3],
  [800, 4],
  [900, 5],
  [111, 6],
  [211, 7],
  [311, 8],
  [810, 9],
  [1200, 10],
  [1300, 11],
  [1400, 12],
  [1500, 13],
  [1900, 14],
  [1210, 15],
  [1310, 16],
  [1410, 17],
  [1510, 18],
  [1610, 19],
  [1710, 20],
  [1810, 21],
  [1911, 22],
];

const LATER_FLOOR_ID_PAIRS: readonly (readonly [number, number])[] = Array.from(
  { length: 67 },
  (_, index) => [index + 1, index + 23] as const,
);

export const LEGACY_TO_CURRENT_MONSTER_ID: ReadonlyMap<number, number> = new Map([
  ...FIRST_TWO_FLOOR_ID_PAIRS,
  ...LATER_FLOOR_ID_PAIRS,
]);

const CURRENT_TO_LEGACY_MONSTER_ID: ReadonlyMap<number, number> = new Map(
  [...LEGACY_TO_CURRENT_MONSTER_ID].map(([legacyId, currentId]) => [
    currentId,
    legacyId,
  ]),
);

export function currentMonsterIdForLegacy(id: number): number {
  return LEGACY_TO_CURRENT_MONSTER_ID.get(id) ?? id;
}

const NORMALIZED_FIRST_TWO_FLOOR_MASTER_IDS: ReadonlyMap<
  number,
  number | null
> = new Map([
  [1, 5],
  [2, 5],
  [3, null],
  [4, 5],
  [5, null],
  [10, 14],
  [11, 14],
  [12, 14],
  [13, null],
  [14, null],
]);

export function currentMasterIdForLegacyMonster(
  currentMonsterId: number,
  legacyMasterId: number | null,
): number | null {
  if (NORMALIZED_FIRST_TWO_FLOOR_MASTER_IDS.has(currentMonsterId)) {
    return NORMALIZED_FIRST_TWO_FLOOR_MASTER_IDS.get(currentMonsterId) ?? null;
  }
  return legacyMasterId === null
    ? null
    : currentMonsterIdForLegacy(legacyMasterId);
}

/**
 * Stable internal identity for seeded systems that existed before the 1..89
 * presentation/database renumbering. This prevents an upgraded Run from
 * rerolling future patrol paths or optional loot only because its visible ID
 * changed.
 */
export function legacyMonsterIdForCurrent(id: number): number {
  return CURRENT_TO_LEGACY_MONSTER_ID.get(id) ?? id;
}

export type MonsterIdScheme = "legacy" | "current" | "mixed-or-unknown";

export function detectMonsterIdScheme(
  floor: FloorNumber,
  ids: readonly number[],
): MonsterIdScheme {
  if (ids.length === 0) return "mixed-or-unknown";
  const legacyIds = new Set(LEGACY_MONSTER_IDS_BY_FLOOR[floor]);
  const currentIds = new Set(CURRENT_MONSTER_IDS_BY_FLOOR[floor]);
  if (ids.every((id) => legacyIds.has(id))) return "legacy";
  if (ids.every((id) => currentIds.has(id))) return "current";
  return "mixed-or-unknown";
}
