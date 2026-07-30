import { safeZoneCellKeys } from "./campfire";
import { mazeTileAt, mazeZoneAt, type MazeFloor } from "./mazeGenerator";
import { stableStringHash } from "./runGraph";
import type { Campfire, Position } from "./types";
import type { GuidedMapPlan } from "./guidedMap";

export const FLOOR_ONE_LEFT_SAFE_ROOM_ID = "floor-1-entry";
export const FLOOR_ONE_RIGHT_SAFE_ROOM_ID = "floor-1-rest";
export const FLOOR_ONE_LABYRINTH_SIGHT_RADIUS = 3;
export const FLOOR_ONE_HAZARD_COUNT = 2;

export type FloorOneArea = "left-safe" | "labyrinth" | "right-safe";

export interface FloorHazard extends Position {
  id: string;
  name: string;
  damage: number;
  kind: "archive-cutter";
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

export function floorOneAreaAt(
  floor: MazeFloor,
  position: Position,
): FloorOneArea {
  const roomNodeId = mazeZoneAt(floor, position)?.roomNodeId;
  if (roomNodeId === FLOOR_ONE_LEFT_SAFE_ROOM_ID) return "left-safe";
  if (roomNodeId === FLOOR_ONE_RIGHT_SAFE_ROOM_ID) return "right-safe";
  return "labyrinth";
}

export function crossesIntoFloorOneLabyrinth(
  floor: MazeFloor,
  from: Position,
  to: Position,
): boolean {
  return floorOneAreaAt(floor, from) !== "labyrinth" &&
    floorOneAreaAt(floor, to) === "labyrinth";
}

export function floorOneSafeAreaCellKeys(
  floor: MazeFloor,
  area?: "left-safe" | "right-safe",
): Set<string> {
  const keys = new Set<string>();
  const safeRoomIds = new Set(area === "left-safe"
    ? [FLOOR_ONE_LEFT_SAFE_ROOM_ID]
    : area === "right-safe"
      ? [FLOOR_ONE_RIGHT_SAFE_ROOM_ID]
      : [FLOOR_ONE_LEFT_SAFE_ROOM_ID, FLOOR_ONE_RIGHT_SAFE_ROOM_ID]);
  floor.zones
    .filter((zone) => safeRoomIds.has(zone.roomNodeId))
    .forEach((zone) => {
      for (let y = zone.y; y < zone.y + zone.height; y += 1) {
        for (let x = zone.x; x < zone.x + zone.width; x += 1) {
          keys.add(`${x}:${y}`);
        }
      }
    });
  return keys;
}

export function floorOneCurrentSightCellKeys(
  floor: MazeFloor,
  position: Position,
): Set<string> {
  const area = floorOneAreaAt(floor, position);
  if (area !== "labyrinth") {
    return floorOneSafeAreaCellKeys(floor, area);
  }
  const keys = new Set<string>();
  for (
    let y = position.y - FLOOR_ONE_LABYRINTH_SIGHT_RADIUS;
    y <= position.y + FLOOR_ONE_LABYRINTH_SIGHT_RADIUS;
    y += 1
  ) {
    for (
      let x = position.x - FLOOR_ONE_LABYRINTH_SIGHT_RADIUS;
      x <= position.x + FLOOR_ONE_LABYRINTH_SIGHT_RADIUS;
      x += 1
    ) {
      if (
        x >= 0 &&
        y >= 0 &&
        x < floor.width &&
        y < floor.height &&
        Math.abs(position.x - x) + Math.abs(position.y - y) <=
          FLOOR_ONE_LABYRINTH_SIGHT_RADIUS
      ) {
        keys.add(`${x}:${y}`);
      }
    }
  }
  return keys;
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
  minimumNeighbors: number,
): Position[] {
  const protectedPositions = [
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

export function generateFloorOneHazards(
  floor: MazeFloor,
  campfires: readonly Campfire[],
  guidedMap: GuidedMapPlan,
): FloorHazard[] {
  const primary = hazardCandidates(floor, campfires, guidedMap, 3);
  const candidates = primary.length >= FLOOR_ONE_HAZARD_COUNT
    ? primary
    : hazardCandidates(floor, campfires, guidedMap, 2);
  const ordered = [...candidates].sort((left, right) => (
    stableStringHash(`${floor.seed}:f1-hazard:${left.x}:${left.y}`) -
    stableStringHash(`${floor.seed}:f1-hazard:${right.x}:${right.y}`)
  ));
  const selected: Position[] = [];
  for (const candidate of ordered) {
    if (selected.some((position) => distance(position, candidate) < 7)) continue;
    selected.push(candidate);
    if (selected.length === FLOOR_ONE_HAZARD_COUNT) break;
  }
  return selected.map((position, index) => ({
    id: `hazard:f1:${index + 1}`,
    name: "档案切纸轮",
    damage: 1,
    kind: "archive-cutter",
    ...position,
  }));
}
