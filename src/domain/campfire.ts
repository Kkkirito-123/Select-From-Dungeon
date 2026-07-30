import { findGridPath } from "./pathfinding";
import { mazeTileAt, mazeZoneAt, type MazeFloor, type MazeZone } from "./mazeGenerator";
import { stableStringHash, type RoomGraph } from "./runGraph";
import type { Campfire, CampfirePhase, Position } from "./types";

export const CAMPFIRE_SAFE_RADIUS = 2;

const PHASES: readonly CampfirePhase[] = ["middle", "rear"];

function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}

function pathDistance(floor: MazeFloor, position: Position): number {
  const path = findGridPath(
    floor.spawn,
    position,
    (x, y) => mazeTileAt(floor, x, y) === ".",
  );
  return path.length === 0 ? Number.MAX_SAFE_INTEGER : path.length;
}

function campfirePosition(floor: MazeFloor, zone: MazeZone): Position {
  const candidates = [
    { x: zone.x + 1, y: zone.y + 1 },
    { x: zone.x + zone.width - 2, y: zone.y + 1 },
    { x: zone.x + 1, y: zone.y + zone.height - 2 },
    { x: zone.x + zone.width - 2, y: zone.y + zone.height - 2 },
  ].filter((position) => mazeTileAt(floor, position.x, position.y) === ".");
  const start = stableStringHash(`${floor.seed}:campfire:${zone.roomNodeId}`) %
    Math.max(1, candidates.length);
  return { ...(candidates[start] ?? zone.center) };
}

function restPosition(floor: MazeFloor, campfire: Position, zone: MazeZone): Position {
  const candidates = [
    { x: campfire.x + 1, y: campfire.y },
    { x: campfire.x - 1, y: campfire.y },
    { x: campfire.x, y: campfire.y + 1 },
    { x: campfire.x, y: campfire.y - 1 },
  ].filter((position) => (
    mazeTileAt(floor, position.x, position.y) === "." &&
    position.x > zone.x &&
    position.x < zone.x + zone.width - 1 &&
    position.y > zone.y &&
    position.y < zone.y + zone.height - 1
  ));
  return { ...(candidates[0] ?? zone.center) };
}

/**
 * Every floor keeps two physical checkpoints: one around the middle of the
 * route and one before the rear/Boss segment. The entry zone is already a
 * safe recovery anchor, so an additional front fire only adds visual clutter.
 * Exact corners remain seeded.
 */
export function generateCampfires(
  graph: RoomGraph,
  floor: MazeFloor,
  options: {
    includeHiddenTreasureRooms?: boolean;
    useLegacyFloorOnePlacement?: boolean;
  } = {},
): Campfire[] {
  if (graph.floor === 1 && options.useLegacyFloorOnePlacement !== true) {
    const safeRooms = ["floor-1-entry", "floor-1-rest"] as const;
    const phases = ["front", "rear"] as const;
    return safeRooms.map((roomNodeId, index) => {
      const zone = floor.zones.find((entry) => entry.roomNodeId === roomNodeId);
      if (!zone) throw new Error(`第一层缺少安全区 ${roomNodeId}。`);
      const position = campfirePosition(floor, zone);
      return {
        id: `campfire:1:${phases[index]}`,
        phase: phases[index],
        roomNodeId,
        ...position,
        restPosition: restPosition(floor, position, zone),
      };
    });
  }
  const candidates = floor.zones
    .filter((zone) => {
      const room = graph.nodes.find((node) => node.id === zone.roomNodeId);
      return Boolean(
        room &&
        !room.required &&
        room.type !== "entry" &&
        room.type !== "boss" &&
        (
          room.type !== "treasure" ||
          graph.floor > 2 ||
          options.includeHiddenTreasureRooms === true
        ) &&
        !room.lessonId,
      );
    })
    .map((zone) => {
      const position = campfirePosition(floor, zone);
      return {
        zone,
        position,
        depth: graph.nodes.find((node) => node.id === zone.roomNodeId)?.depth ?? 0,
        distance: pathDistance(floor, position),
      };
    })
    .sort((left, right) => (
      left.distance - right.distance ||
      left.depth - right.depth ||
      left.zone.roomNodeId.localeCompare(right.zone.roomNodeId)
    ));

  if (candidates.length < 2) {
    throw new Error(`第 ${graph.floor} 层缺少中、后两个篝火候选区域。`);
  }
  const rear = candidates.at(-1);
  if (!rear) {
    throw new Error(`第 ${graph.floor} 层缺少后段篝火候选区域。`);
  }
  const midpoint = rear.distance * 0.5;
  const middlePool = candidates
    .filter(({ zone }) => zone.roomNodeId !== rear.zone.roomNodeId)
    .sort((left, right) => (
      Math.abs(left.distance - midpoint) - Math.abs(right.distance - midpoint) ||
      stableStringHash(`${floor.seed}:campfire:middle:${left.zone.roomNodeId}`) -
        stableStringHash(`${floor.seed}:campfire:middle:${right.zone.roomNodeId}`)
    ));
  const middle = middlePool[0];
  if (!middle) {
    throw new Error(`第 ${graph.floor} 层缺少中段篝火候选区域。`);
  }
  const selected = [middle, rear];
  return selected.map(({ zone, position }, index) => {
    return {
      id: `campfire:${graph.floor}:${PHASES[index]}`,
      phase: PHASES[index],
      roomNodeId: zone.roomNodeId,
      ...position,
      restPosition: restPosition(floor, position, zone),
    };
  });
}

export function campfireSafeCellKeys(
  floor: MazeFloor,
  campfires: readonly Campfire[],
): Set<string> {
  const cells = new Set<string>();
  campfires.forEach((campfire) => {
    for (let dy = -CAMPFIRE_SAFE_RADIUS; dy <= CAMPFIRE_SAFE_RADIUS; dy += 1) {
      for (let dx = -CAMPFIRE_SAFE_RADIUS; dx <= CAMPFIRE_SAFE_RADIUS; dx += 1) {
        if (dx * dx + dy * dy > CAMPFIRE_SAFE_RADIUS * CAMPFIRE_SAFE_RADIUS) continue;
        const position = { x: campfire.x + dx, y: campfire.y + dy };
        if (mazeTileAt(floor, position.x, position.y) === ".") {
          cells.add(positionKey(position));
        }
      }
    }
  });
  return cells;
}

export function spawnSafeCellKeys(floor: MazeFloor): Set<string> {
  const zone = mazeZoneAt(floor, floor.spawn);
  const cells = new Set<string>();
  if (!zone) {
    cells.add(positionKey(floor.spawn));
    return cells;
  }
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    for (let x = zone.x; x < zone.x + zone.width; x += 1) {
      if (mazeTileAt(floor, x, y) === ".") cells.add(`${x}:${y}`);
    }
  }
  return cells;
}

export function safeZoneCellKeys(
  floor: MazeFloor,
  campfires: readonly Campfire[],
): Set<string> {
  const cells = new Set([
    ...spawnSafeCellKeys(floor),
    ...campfireSafeCellKeys(floor, campfires),
  ]);
  if (campfires.some((campfire) => campfire.id.startsWith("campfire:1:"))) {
    const safeRoomIds = new Set(["floor-1-entry", "floor-1-rest"]);
    floor.zones
      .filter((zone) => safeRoomIds.has(zone.roomNodeId))
      .forEach((zone) => {
        for (let y = zone.y; y < zone.y + zone.height; y += 1) {
          for (let x = zone.x; x < zone.x + zone.width; x += 1) {
            if (mazeTileAt(floor, x, y) === ".") cells.add(`${x}:${y}`);
          }
        }
      });
  }
  return cells;
}

export function isSafeZonePosition(
  floor: MazeFloor,
  campfires: readonly Campfire[],
  position: Position,
): boolean {
  return safeZoneCellKeys(floor, campfires).has(positionKey(position));
}

export function nearbyCampfire(
  campfires: readonly Campfire[],
  position: Position,
): Campfire | null {
  return campfires.find((campfire) => (
    Math.abs(campfire.x - position.x) + Math.abs(campfire.y - position.y) <= 1
  )) ?? null;
}
