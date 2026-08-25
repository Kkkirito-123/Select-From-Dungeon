import type { FloorNumber } from "../../../../domain/progression/runGraph";

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
  floodgate: { label: "排水水闸", regionLabel: "排水渡点", action: "穿过" },
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
  /** 已发布的布局名，只用于只读存档兼容。 */
  legacyLayoutNames?: readonly string[];
  regionNames: readonly [string, string, string];
  routeTransit: FloorTransitKind;
  ascentTransit: FloorTransitKind;
  mainRoadWidth: 2 | 3 | 4;
  slots: readonly FloorMapSlot[];
}

export function mapSlot(
  roomNodeId: string,
  x: number,
  y: number,
  width = 5,
  height = 5,
): FloorMapSlot {
  return { roomNodeId, x, y, width, height };
}
