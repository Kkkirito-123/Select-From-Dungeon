import type {
  LessonStageDefinition,
  Monster,
} from "../../../../domain/shared/types";
import type { FloorNumber } from "../../../../domain/progression/runGraph";

export type BiomeKind =
  | "drainage"
  | "slime-pool"
  | "ember-cellar"
  | "lake"
  | "swamp"
  | "forest"
  | "bone-yard"
  | "grave-mire"
  | "spirit-crypt"
  | "fire-forge"
  | "frost-vault"
  | "storm-core"
  | "iron-yard"
  | "barracks"
  | "black-citadel"
  | "magma-nest"
  | "crystal-cavern"
  | "dragon-throne"
  | "crystal-grove"
  | "root-maze"
  | "index-heart"
  | "obsidian-hall"
  | "void-court"
  | "data-throne";

export type BiomeEncounterRole = "normal" | "mini-elite" | "area-boss";

export const MINI_ELITE_PERCENT_BY_FLOOR: Readonly<Record<FloorNumber, number>> = {
  1: 5,
  2: 7,
  3: 9,
  4: 11,
  5: 13,
  6: 15,
  7: 17,
  8: 19,
};

export interface BiomeEncounterDefinition {
  monsterId: number;
  floor: FloorNumber;
  biome: BiomeKind;
  role: BiomeEncounterRole;
  randomEncounter: boolean;
  stages: readonly LessonStageDefinition[];
}

export interface WeightedBiomeEncounter {
  monsterId: number;
  weight: number;
}

export function biomeMonster(
  monster: Omit<Monster, "x" | "y" | "encounterType">,
): Monster {
  return {
    ...monster,
    x: 1,
    y: 1,
    encounterType: "ambush",
  };
}
