import {
  floorLabyrinth,
  type FloorHazardKind,
} from "../content/floorLabyrinth";
import type { BiomePlan } from "./biome";
import {
  CAMPFIRE_SAFE_RADIUS,
  safeZoneCellKeys,
} from "./campfire";
import type { GuidedMapPlan } from "./guidedMap";
import { generateFloorOneHazards } from "./floorOneLabyrinth";
import {
  mazeTileAt,
  mazeZoneAt,
  type MazeFloor,
  type MazeZone,
} from "./mazeGenerator";
import {
  stableStringHash,
  type FloorNumber,
} from "./runGraph";
import type { Campfire, Position } from "./types";

export type FloorLabyrinthArea = "safe" | "labyrinth";

export interface FloorHazard extends Position {
  id: string;
  name: string;
  damage: number;
  kind: FloorHazardKind;
}

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

function zoneCellKeys(zone: MazeZone): Set<string> {
  const keys = new Set<string>();
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    for (let x = zone.x; x < zone.x + zone.width; x += 1) {
      keys.add(`${x}:${y}`);
    }
  }
  return keys;
}

function campfireCellKeys(
  floor: MazeFloor,
  campfire: Campfire,
): Set<string> {
  const keys = new Set<string>();
  for (let dy = -CAMPFIRE_SAFE_RADIUS; dy <= CAMPFIRE_SAFE_RADIUS; dy += 1) {
    for (let dx = -CAMPFIRE_SAFE_RADIUS; dx <= CAMPFIRE_SAFE_RADIUS; dx += 1) {
      if (dx * dx + dy * dy > CAMPFIRE_SAFE_RADIUS * CAMPFIRE_SAFE_RADIUS) continue;
      const position = { x: campfire.x + dx, y: campfire.y + dy };
      if (mazeTileAt(floor, position.x, position.y) === ".") {
        keys.add(positionKey(position));
      }
    }
  }
  return keys;
}

function radiusCellKeys(
  floor: MazeFloor,
  position: Position,
  radius: number,
): Set<string> {
  const keys = new Set<string>();
  for (let y = position.y - radius; y <= position.y + radius; y += 1) {
    for (let x = position.x - radius; x <= position.x + radius; x += 1) {
      if (
        x >= 0 &&
        y >= 0 &&
        x < floor.width &&
        y < floor.height &&
        Math.abs(position.x - x) + Math.abs(position.y - y) <= radius
      ) {
        keys.add(`${x}:${y}`);
      }
    }
  }
  return keys;
}

/**
 * 安全房由内容设计，篝火范围由种子生成，但两者都不会作为第二套几何模型
 * 持久化。每次加载 Run 时，当前楼层合同都会基于已保存的 MazeFloor 重新解析。
 */
export function floorLabyrinthAreaAt(
  floorNumber: FloorNumber,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  position: Position,
): FloorLabyrinthArea {
  const safeRooms = new Set(floorLabyrinth(floorNumber).safeRoomIds);
  const zone = mazeZoneAt(floor, position);
  if (zone && safeRooms.has(zone.roomNodeId)) return "safe";
  return safeZoneCellKeys(floor, campfires).has(positionKey(position))
    ? "safe"
    : "labyrinth";
}

export function crossesIntoFloorLabyrinth(
  floorNumber: FloorNumber,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  from: Position,
  to: Position,
): boolean {
  return floorLabyrinthAreaAt(floorNumber, floor, campfires, from) === "safe" &&
    floorLabyrinthAreaAt(floorNumber, floor, campfires, to) === "labyrinth";
}

/**
 * 玩家可以看见完整的设计安全房、当前篝火圈，或敌对迷宫中按楼层设定的
 * 曼哈顿半径。已探索地块会保留在小地图上，但不会继续暴露其中角色。
 */
export function floorCurrentSightCellKeys(
  floorNumber: FloorNumber,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  position: Position,
): Set<string> {
  const contract = floorLabyrinth(floorNumber);
  const zone = mazeZoneAt(floor, position);
  if (zone && contract.safeRoomIds.includes(zone.roomNodeId)) {
    return zoneCellKeys(zone);
  }
  const campfire = campfires.find((entry) => (
    campfireCellKeys(floor, entry).has(positionKey(position))
  ));
  if (campfire) return campfireCellKeys(floor, campfire);
  return radiusCellKeys(floor, position, contract.sightRadius);
}

export function floorSafeAreaCellKeysAt(
  floorNumber: FloorNumber,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  position: Position,
): Set<string> {
  if (floorLabyrinthAreaAt(floorNumber, floor, campfires, position) !== "safe") {
    return new Set<string>();
  }
  return floorCurrentSightCellKeys(floorNumber, floor, campfires, position);
}

function walkableNeighborCount(floor: MazeFloor, position: Position): number {
  return DIRECTIONS.filter((direction) => (
    mazeTileAt(floor, position.x + direction.x, position.y + direction.y) === "."
  )).length;
}

function hazardCandidates(
  floor: MazeFloor,
  campfires: readonly Campfire[],
  guidedMap: GuidedMapPlan,
  biomePlan: BiomePlan,
  minimumNeighbors: number,
): Position[] {
  const protectedPositions = [
    floor.spawn,
    ...Object.values(floor.anchors),
    ...floor.gates,
    ...campfires,
    ...campfires.map((campfire) => campfire.restPosition),
    ...guidedMap.routeMarkers,
    ...guidedMap.shortcuts.flatMap((shortcut) => [
      shortcut.entry,
      shortcut.exit,
      shortcut.keyPosition,
    ]),
    ...guidedMap.deadEndCaches,
    ...biomePlan.features,
    ...biomePlan.portals.flatMap((portal) => [portal.entry, portal.exit]),
    ...biomePlan.regions.flatMap((region) => (
      region.areaBossPosition ? [region.areaBossPosition] : []
    )),
  ];
  const safeCells = safeZoneCellKeys(floor, campfires);
  const candidates: Position[] = [];
  for (let y = 2; y < floor.height - 2; y += 1) {
    for (let x = 2; x < floor.width - 2; x += 1) {
      const position = { x, y };
      if (
        mazeTileAt(floor, x, y) !== "." ||
        mazeZoneAt(floor, position) !== null ||
        safeCells.has(positionKey(position)) ||
        walkableNeighborCount(floor, position) < minimumNeighbors ||
        protectedPositions.some((protectedPosition) => (
          distance(protectedPosition, position) < 3
        ))
      ) continue;
      candidates.push(position);
    }
  }
  return candidates;
}

function selectSpacedHazards(
  candidates: readonly Position[],
  count: number,
  floorNumber: FloorNumber,
  floor: MazeFloor,
): Position[] {
  const ordered = [...candidates].sort((left, right) => (
    stableStringHash(
      `${floor.seed}:f${floorNumber}-hazard:${left.x}:${left.y}`,
    ) -
    stableStringHash(
      `${floor.seed}:f${floorNumber}-hazard:${right.x}:${right.y}`,
    )
  ));
  for (let spacing = 7; spacing >= 3; spacing -= 1) {
    const selected: Position[] = [];
    for (const candidate of ordered) {
      if (selected.some((position) => distance(position, candidate) < spacing)) continue;
      selected.push(candidate);
      if (selected.length === count) return selected;
    }
  }
  return ordered.slice(0, count);
}

export function generateFloorHazards(
  floorNumber: FloorNumber,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  guidedMap: GuidedMapPlan,
  biomePlan: BiomePlan,
): FloorHazard[] {
  // 第一层早于八层共享合同发布，因此保留其精确种子位置，避免已有 v11 Run
  // 在载入后移动已经触发过的切割机关。
  if (floorNumber === 1) {
    return generateFloorOneHazards(floor, campfires, guidedMap);
  }
  const contract = floorLabyrinth(floorNumber);
  const primary = hazardCandidates(
    floor,
    campfires,
    guidedMap,
    biomePlan,
    3,
  );
  const candidates = primary.length >= contract.hazardCount
    ? primary
    : hazardCandidates(floor, campfires, guidedMap, biomePlan, 2);
  return selectSpacedHazards(
    candidates,
    contract.hazardCount,
    floorNumber,
    floor,
  ).map((position, index) => ({
    id: `hazard:f${floorNumber}:${index + 1}`,
    name: contract.hazardName,
    damage: contract.hazardDamage,
    kind: contract.hazardKind,
    ...position,
  }));
}

export function hasDiscoveredLabyrinthCell(
  floorNumber: FloorNumber,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  discoveredCells: ReadonlySet<string>,
): boolean {
  return [...discoveredCells].some((cell) => {
    const [x, y] = cell.split(":").map(Number);
    return Number.isInteger(x) &&
      Number.isInteger(y) &&
      floorLabyrinthAreaAt(
        floorNumber,
        floor,
        campfires,
        { x, y },
      ) === "labyrinth";
  });
}
