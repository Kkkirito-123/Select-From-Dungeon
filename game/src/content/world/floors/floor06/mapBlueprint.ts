import type { FloorMapBlueprint } from "../shared/mapBlueprint";
import { mapSlot } from "../shared/mapBlueprint";

export const FLOOR_MAP_BLUEPRINT = {
floor: 6,
layoutName: "龙脊工坊折线",
regionNames: ["岩浆孵化场", "龙晶洞窟", "提交王巢"],
routeTransit: "minecart",
ascentTransit: "royal-lift",
mainRoadWidth: 3,
slots: [
  mapSlot("floor-6-entry", 2, 28),
  mapSlot("floor-6-lesson-1", 10, 28),
  mapSlot("floor-6-lesson-2", 18, 28),
  mapSlot("floor-6-lesson-3", 10, 20),
  mapSlot("floor-6-lesson-4", 20, 19),
  mapSlot("floor-6-lesson-5", 30, 11),
  mapSlot("floor-6-lesson-6", 38, 3, 7, 7),
  mapSlot("floor-6-rest", 2, 18),
  mapSlot("floor-6-treasure", 27, 26),
  mapSlot("floor-6-event", 34, 21),
],
} as const satisfies FloorMapBlueprint;
