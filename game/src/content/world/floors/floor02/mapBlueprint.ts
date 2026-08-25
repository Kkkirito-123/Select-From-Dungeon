import type { FloorMapBlueprint } from "../shared/mapBlueprint";
import { mapSlot } from "../shared/mapBlueprint";

export const FLOOR_MAP_BLUEPRINT = {
floor: 2,
layoutName: "月潮群岛船闸环线",
legacyLayoutNames: ["月潮群岛航线"],
regionNames: ["潮汐浅滩", "月影湖与沉水村落", "古树沼泽与灯塔岛"],
routeTransit: "skiff",
ascentTransit: "north-ferry",
mainRoadWidth: 3,
slots: [
  mapSlot("floor-2-entry", 2, 3, 7, 6),
  mapSlot("floor-2-order", 11, 3, 7, 6),
  mapSlot("floor-2-distinct", 20, 3, 8, 7),
  mapSlot("floor-2-rest", 11, 12, 7, 6),
  mapSlot("floor-2-treasure", 2, 12, 7, 7),
  mapSlot("floor-2-event", 20, 12, 8, 7),
  mapSlot("floor-2-inner-join", 29, 4, 7, 7),
  mapSlot("floor-2-left-join", 29, 14, 7, 7),
  mapSlot("floor-2-join-elite", 29, 23, 7, 7),
  mapSlot("floor-2-boss", 39, 24, 8, 8),
],
} as const satisfies FloorMapBlueprint;

