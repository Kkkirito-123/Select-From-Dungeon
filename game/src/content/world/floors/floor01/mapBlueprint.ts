import type { FloorMapBlueprint } from "../shared/mapBlueprint";
import { mapSlot } from "../shared/mapBlueprint";

export const FLOOR_MAP_BLUEPRINT = {
floor: 1,
layoutName: "双岸失名档案",
legacyLayoutNames: ["地下余烬档案回环", "回燃档案环廊"],
regionNames: ["余烬书房", "失名迷宫", "登记前哨"],
routeTransit: "floodgate",
ascentTransit: "freight-lift",
mainRoadWidth: 3,
slots: [
  mapSlot("floor-1-entry", 1, 13, 8, 10),
  mapSlot("floor-1-tutorial", 11, 14, 7, 7),
  mapSlot("floor-1-where", 18, 3, 7, 7),
  mapSlot("floor-1-is-null", 18, 24, 7, 7),
  mapSlot("floor-1-event", 10, 25, 7, 7),
  mapSlot("floor-1-treasure", 10, 3, 7, 7),
  mapSlot("floor-1-group-by", 25, 12, 7, 7),
  mapSlot("floor-1-having-elite", 33, 3, 7, 7),
  mapSlot("floor-1-boss", 34, 12, 8, 8),
  mapSlot("floor-1-rest", 40, 24, 7, 10),
],
} as const satisfies FloorMapBlueprint;

