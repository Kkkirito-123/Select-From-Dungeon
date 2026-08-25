import type { FloorMapBlueprint } from "../shared/mapBlueprint";
import { mapSlot } from "../shared/mapBlueprint";

export const FLOOR_MAP_BLUEPRINT = {
floor: 4,
layoutName: "三炉垂直升环",
regionNames: ["烈焰熔炉", "寒霜冰库", "雷晶核心"],
routeTransit: "element-switch",
ascentTransit: "ascension-furnace",
mainRoadWidth: 2,
slots: [
  mapSlot("floor-4-entry", 2, 28),
  mapSlot("floor-4-lesson-1", 9, 27),
  mapSlot("floor-4-lesson-2", 17, 28),
  mapSlot("floor-4-lesson-3", 10, 19),
  mapSlot("floor-4-lesson-4", 23, 18),
  mapSlot("floor-4-lesson-5", 30, 11),
  mapSlot("floor-4-lesson-6", 38, 3, 7, 7),
  mapSlot("floor-4-rest", 2, 18),
  mapSlot("floor-4-treasure", 26, 26),
  mapSlot("floor-4-event", 32, 20),
],
} as const satisfies FloorMapBlueprint;

