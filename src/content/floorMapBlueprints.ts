import type { FloorNumber } from "../domain/runGraph";

export const MVP2_MAZE_WIDTH = 48;
export const MVP2_MAZE_HEIGHT = 36;
export const MVP2_MAZE_CHUNK_SIZE = 12;

export type FloorTransitKind =
  | "floodgate"
  | "freight-lift"
  | "skiff"
  | "north-ferry"
  | "tomb-gate"
  | "burial-shaft"
  | "element-switch"
  | "ascension-furnace"
  | "drawbridge"
  | "black-iron-bridge"
  | "minecart"
  | "royal-lift"
  | "crystal-gate"
  | "golden-stair"
  | "golden-door"
  | "throne-stair";

export interface FloorTransitPresentation {
  label: string;
  action: string;
  regionLabel?: string;
}

export const FLOOR_TRANSIT_PRESENTATIONS: Readonly<Record<
  FloorTransitKind,
  FloorTransitPresentation
>> = {
  floodgate: {
    label: "排水水闸",
    regionLabel: "排水渡点",
    action: "穿过",
  },
  "freight-lift": { label: "档案升降机", action: "乘坐" },
  skiff: { label: "月潮渡船", action: "乘坐" },
  "north-ferry": { label: "北岸渡船", action: "乘坐" },
  "tomb-gate": { label: "冻岸墓门", action: "穿过" },
  "burial-shaft": { label: "葬火井", action: "进入" },
  "element-switch": { label: "元素换炉台", action: "启动" },
  "ascension-furnace": { label: "垂直升炉", action: "启动" },
  drawbridge: { label: "黑铁吊桥", action: "通过" },
  "black-iron-bridge": { label: "黑铁吊桥", action: "通过" },
  minecart: { label: "龙脊矿车", action: "乘坐" },
  "royal-lift": { label: "王室升降台", action: "乘坐" },
  "crystal-gate": { label: "根系晶门", action: "穿过" },
  "golden-stair": { label: "金色长阶", action: "登上" },
  "golden-door": { label: "黑金王门", action: "穿过" },
  "throne-stair": { label: "王座长阶", action: "登上" },
};

export interface FloorMapSlot {
  roomNodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloorMapBlueprint {
  floor: FloorNumber;
  layoutName: string;
  /**
   * 已发布的 v11 拓扑标识。这些名称只用于校验：新地图始终对 `layoutName`
   * 取哈希，本地存档恢复则可以接受其中一个精确历史名称，而不重写已保存迷宫。
   */
  legacyLayoutNames?: readonly string[];
  regionNames: readonly [string, string, string];
  routeTransit: FloorTransitKind;
  ascentTransit: FloorTransitKind;
  mainRoadWidth: 2 | 3 | 4;
  slots: readonly FloorMapSlot[];
}

function slot(
  roomNodeId: string,
  x: number,
  y: number,
  width = 5,
  height = 5,
): FloorMapSlot {
  return { roomNodeId, x, y, width, height };
}

/**
 * MVP 2.0 保持每层宏观轮廓经过设计且稳定。每个槽位都显式命名其 RoomGraph
 * 节点，避免节点重排时悄悄交换课程位置。课程身份、前置条件和物理连接仍由图负责。
 */
export const FLOOR_MAP_BLUEPRINTS = {
  1: {
    floor: 1,
    layoutName: "双岸失名档案",
    legacyLayoutNames: ["地下余烬档案回环", "回燃档案环廊"],
    regionNames: ["余烬书房", "失名迷宫", "登记前哨"],
    routeTransit: "floodgate",
    ascentTransit: "freight-lift",
    mainRoadWidth: 3,
    slots: [
      slot("floor-1-entry", 1, 13, 8, 10),
      slot("floor-1-tutorial", 11, 14, 7, 7),
      slot("floor-1-where", 18, 3, 7, 7),
      slot("floor-1-is-null", 18, 24, 7, 7),
      slot("floor-1-event", 10, 25, 7, 7),
      slot("floor-1-treasure", 10, 3, 7, 7),
      slot("floor-1-group-by", 25, 12, 7, 7),
      slot("floor-1-having-elite", 33, 3, 7, 7),
      slot("floor-1-boss", 34, 12, 8, 8),
      slot("floor-1-rest", 40, 24, 7, 10),
    ],
  },
  2: {
    floor: 2,
    layoutName: "月潮群岛船闸环线",
    legacyLayoutNames: ["月潮群岛航线"],
    regionNames: ["潮汐浅滩", "月影湖与沉水村落", "古树沼泽与灯塔岛"],
    routeTransit: "skiff",
    ascentTransit: "north-ferry",
    mainRoadWidth: 3,
    slots: [
      slot("floor-2-entry", 2, 3, 7, 6),
      slot("floor-2-order", 11, 3, 7, 6),
      slot("floor-2-distinct", 20, 3, 8, 7),
      slot("floor-2-rest", 11, 12, 7, 6),
      slot("floor-2-treasure", 2, 12, 7, 7),
      slot("floor-2-event", 20, 12, 8, 7),
      slot("floor-2-inner-join", 29, 4, 7, 7),
      slot("floor-2-left-join", 29, 14, 7, 7),
      slot("floor-2-join-elite", 29, 23, 7, 7),
      slot("floor-2-boss", 39, 24, 8, 8),
    ],
  },
  3: {
    floor: 3,
    layoutName: "白霜墓原回环",
    regionNames: ["遗骨荒地", "腐土墓园", "幽火地宫"],
    routeTransit: "tomb-gate",
    ascentTransit: "burial-shaft",
    mainRoadWidth: 3,
    slots: [
      slot("floor-3-entry", 40, 28),
      slot("floor-3-lesson-1", 32, 27),
      slot("floor-3-lesson-2", 24, 29),
      slot("floor-3-lesson-3", 25, 21),
      slot("floor-3-lesson-4", 17, 19),
      slot("floor-3-lesson-5", 10, 12),
      slot("floor-3-lesson-6", 2, 2, 7, 7),
      slot("floor-3-rest", 35, 20),
      slot("floor-3-treasure", 24, 11),
      slot("floor-3-event", 16, 27),
    ],
  },
  4: {
    floor: 4,
    layoutName: "三炉垂直升环",
    regionNames: ["烈焰熔炉", "寒霜冰库", "雷晶核心"],
    routeTransit: "element-switch",
    ascentTransit: "ascension-furnace",
    mainRoadWidth: 2,
    slots: [
      slot("floor-4-entry", 2, 28),
      slot("floor-4-lesson-1", 9, 27),
      slot("floor-4-lesson-2", 17, 28),
      slot("floor-4-lesson-3", 10, 19),
      slot("floor-4-lesson-4", 23, 18),
      slot("floor-4-lesson-5", 30, 11),
      slot("floor-4-lesson-6", 38, 3, 7, 7),
      slot("floor-4-rest", 2, 18),
      slot("floor-4-treasure", 26, 26),
      slot("floor-4-event", 32, 20),
    ],
  },
  5: {
    floor: 5,
    layoutName: "黑铁城墙双环",
    regionNames: ["黑铁外城", "黑铁兵营", "要塞内城"],
    routeTransit: "drawbridge",
    ascentTransit: "black-iron-bridge",
    mainRoadWidth: 4,
    slots: [
      slot("floor-5-entry", 2, 15),
      slot("floor-5-lesson-1", 9, 15),
      slot("floor-5-lesson-2", 16, 8),
      slot("floor-5-lesson-3", 16, 22),
      slot("floor-5-lesson-4", 24, 15),
      slot("floor-5-lesson-5", 32, 15),
      slot("floor-5-lesson-6", 39, 13, 7, 7),
      slot("floor-5-rest", 8, 3),
      slot("floor-5-treasure", 25, 5),
      slot("floor-5-event", 25, 26),
    ],
  },
  6: {
    floor: 6,
    layoutName: "龙脊工坊折线",
    regionNames: ["岩浆孵化场", "龙晶洞窟", "提交王巢"],
    routeTransit: "minecart",
    ascentTransit: "royal-lift",
    mainRoadWidth: 3,
    slots: [
      slot("floor-6-entry", 2, 28),
      slot("floor-6-lesson-1", 10, 28),
      slot("floor-6-lesson-2", 18, 28),
      slot("floor-6-lesson-3", 10, 20),
      slot("floor-6-lesson-4", 20, 19),
      slot("floor-6-lesson-5", 30, 11),
      slot("floor-6-lesson-6", 38, 3, 7, 7),
      slot("floor-6-rest", 2, 18),
      slot("floor-6-treasure", 27, 26),
      slot("floor-6-event", 34, 21),
    ],
  },
  7: {
    floor: 7,
    layoutName: "残照索引王苑",
    regionNames: ["水晶林地", "盘根迷宫", "索引树心"],
    routeTransit: "crystal-gate",
    ascentTransit: "golden-stair",
    mainRoadWidth: 3,
    slots: [
      slot("floor-7-entry", 22, 29),
      slot("floor-7-lesson-1", 22, 22),
      slot("floor-7-lesson-2", 14, 23),
      slot("floor-7-lesson-3", 29, 22),
      slot("floor-7-lesson-4", 22, 14),
      slot("floor-7-lesson-5", 31, 8),
      slot("floor-7-lesson-6", 38, 2, 7, 7),
      slot("floor-7-rest", 12, 29),
      slot("floor-7-treasure", 2, 21),
      slot("floor-7-event", 12, 12),
    ],
  },
  8: {
    floor: 8,
    layoutName: "黑金七翼王座轴",
    regionNames: ["黑曜长厅", "虚空王庭", "数据王座"],
    routeTransit: "golden-door",
    ascentTransit: "throne-stair",
    mainRoadWidth: 4,
    slots: [
      slot("floor-8-entry", 2, 28),
      slot("floor-8-lesson-1", 9, 27),
      slot("floor-8-lesson-2", 16, 25),
      slot("floor-8-lesson-3", 23, 28),
      slot("floor-8-lesson-4", 23, 19),
      slot("floor-8-lesson-5", 30, 15),
      slot("floor-8-lesson-6", 34, 8),
      slot("floor-8-lesson-7", 40, 1, 7, 7),
      slot("floor-8-rest", 9, 17),
      slot("floor-8-treasure", 2, 17),
      slot("floor-8-event", 16, 12),
    ],
  },
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

/**
 * 第一层是一张连续回环地图，排水渠之间必须靠步行、水位变化和实体捷径理解空间。
 * BiomePlan 仍保留旧区域门数据以兼容已保存的 v11 Run，但运行时不再展示或启用它们。
 */
export function regionPortalsEnabledForFloor(floor: FloorNumber): boolean {
  return floor !== 1;
}
