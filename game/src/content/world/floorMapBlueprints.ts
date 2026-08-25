/** 八层宏观布局的兼容入口；楼层作者数据位于 floors/floorXX。 */
import type { FloorNumber } from "../../domain/progression/runGraph";
import { FLOOR_MAP_BLUEPRINT as FLOOR_01_MAP_BLUEPRINT } from "./floors/floor01/mapBlueprint";
import { FLOOR_MAP_BLUEPRINT as FLOOR_02_MAP_BLUEPRINT } from "./floors/floor02/mapBlueprint";
import { FLOOR_MAP_BLUEPRINT as FLOOR_03_MAP_BLUEPRINT } from "./floors/floor03/mapBlueprint";
import { FLOOR_MAP_BLUEPRINT as FLOOR_04_MAP_BLUEPRINT } from "./floors/floor04/mapBlueprint";
import { FLOOR_MAP_BLUEPRINT as FLOOR_05_MAP_BLUEPRINT } from "./floors/floor05/mapBlueprint";
import { FLOOR_MAP_BLUEPRINT as FLOOR_06_MAP_BLUEPRINT } from "./floors/floor06/mapBlueprint";
import { FLOOR_MAP_BLUEPRINT as FLOOR_07_MAP_BLUEPRINT } from "./floors/floor07/mapBlueprint";
import { FLOOR_MAP_BLUEPRINT as FLOOR_08_MAP_BLUEPRINT } from "./floors/floor08/mapBlueprint";
import {
  FLOOR_TRANSIT_PRESENTATIONS,
  type FloorMapBlueprint,
  type FloorTransitKind,
  type FloorTransitPresentation,
} from "./floors/shared/mapBlueprint";

export {
  FLOOR_TRANSIT_PRESENTATIONS,
  MVP2_MAZE_CHUNK_SIZE,
  MVP2_MAZE_HEIGHT,
  MVP2_MAZE_WIDTH,
  type FloorMapBlueprint,
  type FloorMapSlot,
  type FloorTransitKind,
  type FloorTransitPresentation,
} from "./floors/shared/mapBlueprint";

export const FLOOR_MAP_BLUEPRINTS = {
  1: FLOOR_01_MAP_BLUEPRINT,
  2: FLOOR_02_MAP_BLUEPRINT,
  3: FLOOR_03_MAP_BLUEPRINT,
  4: FLOOR_04_MAP_BLUEPRINT,
  5: FLOOR_05_MAP_BLUEPRINT,
  6: FLOOR_06_MAP_BLUEPRINT,
  7: FLOOR_07_MAP_BLUEPRINT,
  8: FLOOR_08_MAP_BLUEPRINT,
} as const satisfies Record<FloorNumber, FloorMapBlueprint>;

export function floorMapBlueprint(floor: FloorNumber): FloorMapBlueprint {
  return FLOOR_MAP_BLUEPRINTS[floor];
}

export function compatibleFloorLayoutNames(floor: FloorNumber): readonly string[] {
  const blueprint = floorMapBlueprint(floor);
  return [blueprint.layoutName, ...(blueprint.legacyLayoutNames ?? [])];
}

export function floorTransitPresentation(
  kind: FloorTransitKind,
): FloorTransitPresentation {
  return FLOOR_TRANSIT_PRESENTATIONS[kind];
}

/** 第一层连续步行，不启用通用区域传送点。 */
export function regionPortalsEnabledForFloor(floor: FloorNumber): boolean {
  return floor !== 1;
}
