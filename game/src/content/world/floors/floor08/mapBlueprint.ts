import type { FloorMapBlueprint } from "../shared/mapBlueprint";
import { mapSlot } from "../shared/mapBlueprint";

export const FLOOR_MAP_BLUEPRINT = {
floor: 8,
layoutName: "黑金七翼王座轴",
regionNames: ["黑曜长厅", "虚空王庭", "数据王座"],
routeTransit: "golden-door",
ascentTransit: "throne-stair",
mainRoadWidth: 4,
slots: [
  mapSlot("floor-8-entry", 2, 28),
  mapSlot("floor-8-lesson-1", 9, 27),
  mapSlot("floor-8-lesson-2", 16, 25),
  mapSlot("floor-8-lesson-3", 23, 28),
  mapSlot("floor-8-lesson-4", 23, 19),
  mapSlot("floor-8-lesson-5", 30, 15),
  mapSlot("floor-8-lesson-6", 34, 8),
  mapSlot("floor-8-lesson-7", 40, 1, 7, 7),
  mapSlot("floor-8-rest", 9, 17),
  mapSlot("floor-8-treasure", 2, 17),
  mapSlot("floor-8-event", 16, 12),
],
} as const satisfies FloorMapBlueprint;

