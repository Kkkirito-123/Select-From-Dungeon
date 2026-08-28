import type {
  LessonStageDefinition,
  Monster,
} from "../../../../domain/shared/types";
import type { FloorNumber } from "../../../../domain/progression/runGraph";

/** 生态内容的共享契约；作者数据提供候选，遭遇/地图域负责选择时机和坐标。 */
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

/** 八层小型精英的确定性权重；随机遭遇只读取当前层这一项。 */
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
  /** 与 monsters.id 对应的作者内容 ID，而不是显示名称。 */
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
  // 生态池只负责提供候选怪物；进入真实地图后由遭遇导演覆盖坐标和 encounterType。
  return {
    ...monster,
    x: 1,
    y: 1,
    encounterType: "ambush",
  };
}
