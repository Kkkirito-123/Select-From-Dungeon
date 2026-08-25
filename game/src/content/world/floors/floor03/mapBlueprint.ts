import type { FloorMapBlueprint } from "../shared/mapBlueprint";
import { mapSlot } from "../shared/mapBlueprint";

export const FLOOR_MAP_BLUEPRINT = {
floor: 3,
layoutName: "白霜墓原回环",
regionNames: ["遗骨荒地", "腐土墓园", "幽火地宫"],
routeTransit: "tomb-gate",
ascentTransit: "burial-shaft",
mainRoadWidth: 3,
slots: [
  mapSlot("floor-3-entry", 40, 28),
  mapSlot("floor-3-lesson-1", 32, 27),
  mapSlot("floor-3-lesson-2", 24, 29),
  mapSlot("floor-3-lesson-3", 25, 21),
  mapSlot("floor-3-lesson-4", 17, 19),
  mapSlot("floor-3-lesson-5", 10, 12),
  mapSlot("floor-3-lesson-6", 2, 2, 7, 7),
  mapSlot("floor-3-rest", 35, 20),
  mapSlot("floor-3-treasure", 24, 11),
  mapSlot("floor-3-event", 16, 27),
],
} as const satisfies FloorMapBlueprint;

