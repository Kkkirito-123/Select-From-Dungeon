import { safeZoneCellKeys } from "./campfire";
import { mazeTileAt, mazeZoneAt, type MazeFloor } from "./mazeGenerator";
import { stableStringHash } from "../progression/runGraph";
import type { Campfire, GroundItem, Position } from "../shared/types";
import type { GuidedMapPlan } from "./guidedMap";

/**
 * 第一层迷宫宝箱使用现有 GroundItem 存档形状，开启状态复用 openedGateIds。
 * 这样不用升级存档版本，也能让旧 Run 在恢复时补齐尚未开启的宝箱。
 */
// 第一层现有的 ID #009 被改造成宝箱怪，保持全局 1..89 ID 不变。
export const FLOOR_ONE_MIMIC_MONSTER_ID = 9;
export const FLOOR_ONE_CHEST_IDS = [
  "chest:f1:normal-a",
  "chest:f1:normal-b",
  "chest:f1:mimic",
  "chest:f1:warp",
] as const;

export type FloorOneChestId = (typeof FLOOR_ONE_CHEST_IDS)[number];
export type FloorOneChestKind = "normal" | "mimic" | "warp";

const CHEST_DISTANCE = 6;
const DIRECTIONS: readonly Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}

function distance(left: Position, right: Position): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

export function floorOneWalkableNeighborCount(floor: MazeFloor, position: Position): number {
  return DIRECTIONS.filter((direction) => (
    mazeTileAt(floor, position.x + direction.x, position.y + direction.y) === "."
  )).length;
}

function isFloorOneChestId(value: string): value is FloorOneChestId {
  return (FLOOR_ONE_CHEST_IDS as readonly string[]).includes(value);
}

export function isFloorOneChestItem(item: Pick<GroundItem, "id">): boolean {
  return isFloorOneChestId(item.id);
}

export function floorOneChestKind(id: string): FloorOneChestKind | null {
  if (id === "chest:f1:mimic") return "mimic";
  if (id === "chest:f1:warp") return "warp";
  if (id === "chest:f1:normal-a" || id === "chest:f1:normal-b") return "normal";
  return null;
}

function chestLabel(kind: FloorOneChestKind, index: number): {
  name: string;
  description: string;
} {
  if (kind === "mimic") {
    return {
      name: "沉默木箱",
      description: "箱盖里藏着一段未归档的基础 SQL 记录。按 E 会唤醒箱中的守卫。",
    };
  }
  if (kind === "warp") {
    return {
      name: "偏移宝箱",
      description: "箱内的坐标指针会把你送到失名迷宫的另一条可行走支路。",
    };
  }
  return {
    name: index === 0 ? "迷宫补给箱" : "旧档案箱",
    description: index === 0
      ? "打开后立即恢复 1 点生命。"
      : "打开后立即清除 8 点查询热量。",
  };
}

function candidatePositions(
  floor: MazeFloor,
  campfires: readonly Campfire[],
  guidedMap: GuidedMapPlan,
): Position[] {
  const safeCells = safeZoneCellKeys(floor, campfires);
  const protectedCells = new Set([
    floor.spawn,
    ...Object.values(floor.anchors),
    ...floor.gates,
    ...campfires,
    ...campfires.map((campfire) => campfire.restPosition),
    ...guidedMap.shortcuts.flatMap((shortcut) => [
      shortcut.entry,
      shortcut.exit,
      shortcut.keyPosition,
    ]),
    ...guidedMap.deadEndCaches,
  ].map(positionKey));
  const candidates: Position[] = [];
  for (let y = 2; y < floor.height - 2; y += 1) {
    for (let x = 2; x < floor.width - 2; x += 1) {
      const position = { x, y };
      if (
        mazeTileAt(floor, x, y) !== "." ||
        mazeZoneAt(floor, position) !== null ||
        safeCells.has(positionKey(position)) ||
        protectedCells.has(positionKey(position))
      ) continue;
      candidates.push(position);
    }
  }
  return candidates;
}

function pickPosition(
  candidates: readonly Position[],
  seed: string,
  salt: string,
  selected: readonly Position[],
  predicate: (position: Position) => boolean,
): Position | null {
  const ordered = [...candidates]
    .filter(predicate)
    .sort((left, right) => (
      stableStringHash(`${seed}:${salt}:${left.x}:${left.y}`) -
      stableStringHash(`${seed}:${salt}:${right.x}:${right.y}`)
    ));
  return ordered.find((position) => (
    selected.every((other) => distance(position, other) >= CHEST_DISTANCE)
  )) ?? null;
}

export function generateFloorOneChestItems(
  floor: MazeFloor,
  campfires: readonly Campfire[],
  guidedMap: GuidedMapPlan,
): GroundItem[] {
  if (floor.seed.length === 0) return [];
  const candidates = candidatePositions(floor, campfires, guidedMap);
  const fallback = [...candidates].sort((left, right) => (
    stableStringHash(`${floor.seed}:f1-chest:${left.x}:${left.y}`) -
    stableStringHash(`${floor.seed}:f1-chest:${right.x}:${right.y}`)
  ));
  const selected: Position[] = [];
  const choose = (salt: string, predicate: (position: Position) => boolean): Position => {
    const picked = pickPosition(candidates, floor.seed, salt, selected, predicate) ??
      fallback.find((position) => selected.every((other) => distance(position, other) >= 3)) ??
      fallback[0] ?? floor.spawn;
    selected.push(picked);
    return picked;
  };
  const placements: Array<{
    id: FloorOneChestId;
    kind: FloorOneChestKind;
    position: Position;
    index: number;
  }> = [
    {
      id: "chest:f1:normal-a",
      kind: "normal",
      position: choose("normal-a", (position) => floorOneWalkableNeighborCount(floor, position) >= 2),
      index: 0,
    },
    {
      id: "chest:f1:normal-b",
      kind: "normal",
      position: choose("normal-b", (position) => floorOneWalkableNeighborCount(floor, position) >= 2),
      index: 1,
    },
    {
      id: "chest:f1:mimic",
      kind: "mimic",
      position: choose("mimic", (position) => floorOneWalkableNeighborCount(floor, position) >= 3),
      index: 0,
    },
    {
      id: "chest:f1:warp",
      kind: "warp",
      position: choose("warp", (position) => floorOneWalkableNeighborCount(floor, position) >= 2),
      index: 0,
    },
  ];
  return placements.map(({ id, kind, position, index }) => {
    const label = chestLabel(kind, index);
    return {
      id,
      sourceRoomId: "floor-1-entry",
      ...position,
      name: label.name,
      description: label.description,
      kind: "event",
      collection: "interact",
      rewardId: null,
    };
  });
}

export function floorOneChestReward(id: string): "restore-12-hp" | "cool-8-heat" | null {
  if (id === "chest:f1:normal-a") return "restore-12-hp";
  if (id === "chest:f1:normal-b") return "cool-8-heat";
  return null;
}

export function isFloorOneChestMarker(value: string): boolean {
  return isFloorOneChestId(value);
}
