import type { FloorMapBlueprint } from "../shared/mapBlueprint";
import { mapSlot } from "../shared/mapBlueprint";

/** 第五层黑铁外城的宏观房间槽位；窗口函数课程沿前中后三段展开。 */
export const FLOOR_MAP_BLUEPRINT = {
floor: 5,
layoutName: "黑铁城墙双环",
regionNames: ["黑铁外城", "黑铁兵营", "要塞内城"],
routeTransit: "drawbridge",
ascentTransit: "black-iron-bridge",
mainRoadWidth: 4,
slots: [
  mapSlot("floor-5-entry", 2, 15),
  mapSlot("floor-5-lesson-1", 9, 15),
  mapSlot("floor-5-lesson-2", 16, 8),
  mapSlot("floor-5-lesson-3", 16, 22),
  mapSlot("floor-5-lesson-4", 24, 15),
  mapSlot("floor-5-lesson-5", 32, 15),
  mapSlot("floor-5-lesson-6", 39, 13, 7, 7),
  mapSlot("floor-5-rest", 8, 3),
  mapSlot("floor-5-treasure", 25, 5),
  mapSlot("floor-5-event", 25, 26),
],
} as const satisfies FloorMapBlueprint;
