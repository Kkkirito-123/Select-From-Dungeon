import type { FloorMapBlueprint } from "../shared/mapBlueprint";
import { mapSlot } from "../shared/mapBlueprint";

export const FLOOR_MAP_BLUEPRINT = {
floor: 7,
layoutName: "残照索引王苑",
regionNames: ["水晶林地", "盘根迷宫", "索引树心"],
routeTransit: "crystal-gate",
ascentTransit: "golden-stair",
mainRoadWidth: 3,
slots: [
  mapSlot("floor-7-entry", 22, 29),
  mapSlot("floor-7-lesson-1", 22, 22),
  mapSlot("floor-7-lesson-2", 14, 23),
  mapSlot("floor-7-lesson-3", 29, 22),
  mapSlot("floor-7-lesson-4", 22, 14),
  mapSlot("floor-7-lesson-5", 31, 8),
  mapSlot("floor-7-lesson-6", 38, 2, 7, 7),
  mapSlot("floor-7-rest", 12, 29),
  mapSlot("floor-7-treasure", 2, 21),
  mapSlot("floor-7-event", 12, 12),
],
} as const satisfies FloorMapBlueprint;
