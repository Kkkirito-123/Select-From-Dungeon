/** 八层生物群系内容聚合入口；每层作者数据位于 floors/floorXX。 */
import type { Monster } from "../../domain/shared/types";
import type { FloorNumber } from "../../domain/progression/runGraph";
import {
  FLOOR_ONE_BIOME_MONSTERS,
  FLOOR_BIOME_ENCOUNTERS as FLOOR_01_BIOME_ENCOUNTERS,
} from "./floors/floor01/biome";
import {
  FLOOR_TWO_BIOME_MONSTERS,
  FLOOR_BIOME_ENCOUNTERS as FLOOR_02_BIOME_ENCOUNTERS,
} from "./floors/floor02/biome";
import {
  FLOOR_THREE_BIOME_MONSTERS,
  FLOOR_BIOME_ENCOUNTERS as FLOOR_03_BIOME_ENCOUNTERS,
} from "./floors/floor03/biome";
import {
  FLOOR_FOUR_BIOME_MONSTERS,
  FLOOR_BIOME_ENCOUNTERS as FLOOR_04_BIOME_ENCOUNTERS,
} from "./floors/floor04/biome";
import {
  FLOOR_FIVE_BIOME_MONSTERS,
  FLOOR_BIOME_ENCOUNTERS as FLOOR_05_BIOME_ENCOUNTERS,
} from "./floors/floor05/biome";
import {
  FLOOR_SIX_BIOME_MONSTERS,
  FLOOR_BIOME_ENCOUNTERS as FLOOR_06_BIOME_ENCOUNTERS,
} from "./floors/floor06/biome";
import {
  FLOOR_SEVEN_BIOME_MONSTERS,
  FLOOR_BIOME_ENCOUNTERS as FLOOR_07_BIOME_ENCOUNTERS,
} from "./floors/floor07/biome";
import {
  FLOOR_EIGHT_BIOME_MONSTERS,
  FLOOR_BIOME_ENCOUNTERS as FLOOR_08_BIOME_ENCOUNTERS,
} from "./floors/floor08/biome";
import {
  MINI_ELITE_PERCENT_BY_FLOOR,
  type BiomeEncounterDefinition,
  type BiomeKind,
  type WeightedBiomeEncounter,
} from "./floors/shared/biome";

export {
  FLOOR_ONE_BIOME_MONSTERS,
  FLOOR_TWO_BIOME_MONSTERS,
  FLOOR_THREE_BIOME_MONSTERS,
  FLOOR_FOUR_BIOME_MONSTERS,
  FLOOR_FIVE_BIOME_MONSTERS,
  FLOOR_SIX_BIOME_MONSTERS,
  FLOOR_SEVEN_BIOME_MONSTERS,
  FLOOR_EIGHT_BIOME_MONSTERS,
};
export {
  MINI_ELITE_PERCENT_BY_FLOOR,
  type BiomeEncounterDefinition,
  type BiomeEncounterRole,
  type BiomeKind,
  type WeightedBiomeEncounter,
} from "./floors/shared/biome";

export const BIOME_ENCOUNTERS: readonly BiomeEncounterDefinition[] = [
  ...FLOOR_01_BIOME_ENCOUNTERS,
  ...FLOOR_02_BIOME_ENCOUNTERS,
  ...FLOOR_03_BIOME_ENCOUNTERS,
  ...FLOOR_04_BIOME_ENCOUNTERS,
  ...FLOOR_05_BIOME_ENCOUNTERS,
  ...FLOOR_06_BIOME_ENCOUNTERS,
  ...FLOOR_07_BIOME_ENCOUNTERS,
  ...FLOOR_08_BIOME_ENCOUNTERS,
];

export const BIOME_PRACTICE_STAGES = Object.fromEntries(
  BIOME_ENCOUNTERS.map((encounter) => [encounter.monsterId, encounter.stages]),
) as Readonly<Record<number, BiomeEncounterDefinition["stages"]>>;

const ALL_BIOME_MONSTERS: readonly Monster[] = [
  ...FLOOR_ONE_BIOME_MONSTERS,
  ...FLOOR_TWO_BIOME_MONSTERS,
  ...FLOOR_THREE_BIOME_MONSTERS,
  ...FLOOR_FOUR_BIOME_MONSTERS,
  ...FLOOR_FIVE_BIOME_MONSTERS,
  ...FLOOR_SIX_BIOME_MONSTERS,
  ...FLOOR_SEVEN_BIOME_MONSTERS,
  ...FLOOR_EIGHT_BIOME_MONSTERS,
];

export function biomeEncounterFor(
  monsterId: number,
): BiomeEncounterDefinition | null {
  return BIOME_ENCOUNTERS.find((encounter) => encounter.monsterId === monsterId) ?? null;
}

export function practiceStagesFor(
  monsterId: number,
): BiomeEncounterDefinition["stages"] {
  return BIOME_PRACTICE_STAGES[monsterId] ?? [];
}

export function weightedBiomeEncounterCandidates(
  floor: FloorNumber,
  biome: BiomeKind,
  unlockedLessons: ReadonlySet<Monster["lessonId"]>,
): WeightedBiomeEncounter[] {
  const available = BIOME_ENCOUNTERS.filter((encounter) => (
    encounter.floor === floor &&
    encounter.biome === biome &&
    encounter.randomEncounter &&
    unlockedLessons.has(
      ALL_BIOME_MONSTERS.find((monster) => monster.id === encounter.monsterId)?.lessonId ?? "select",
    )
  ));
  const normal = available.filter((encounter) => encounter.role === "normal");
  const elites = available.filter((encounter) => encounter.role === "mini-elite");
  if (normal.length === 0) return [];
  const eliteShare = elites.length === 0 ? 0 : MINI_ELITE_PERCENT_BY_FLOOR[floor];
  const normalWeight = (100 - eliteShare) / normal.length;
  const eliteWeight = elites.length === 0 ? 0 : eliteShare / elites.length;
  return [
    ...normal.map((encounter) => ({ monsterId: encounter.monsterId, weight: normalWeight })),
    ...elites.map((encounter) => ({ monsterId: encounter.monsterId, weight: eliteWeight })),
  ].sort((left, right) => left.monsterId - right.monsterId);
}
