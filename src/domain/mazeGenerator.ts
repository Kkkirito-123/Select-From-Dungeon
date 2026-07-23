import type { LessonId, Position } from "./types";
import {
  createSeededRandom,
  stableStringHash,
  type RoomGraph,
  type RoomNode,
  type RoomType,
  type RunLessonId,
} from "./runGraph";

export const MAZE_GENERATOR_VERSION = 4 as const;
export const MAZE_WIDTH = 64;
export const MAZE_HEIGHT = 48;
export const MAZE_CHUNK_SIZE = 16;

export type MazeTile = "#" | ".";
export type MazeDecorationKind = "torch" | "rubble" | "rune";

export interface MazeZone {
  id: string;
  roomNodeId: string;
  type: RoomType;
  lessonId?: RunLessonId;
  x: number;
  y: number;
  width: number;
  height: number;
  center: Position;
}

export interface MazeGate extends Position {
  id: string;
  roomNodeId: string;
  requires: RunLessonId[];
  outside: Position;
}

export interface MazeDecoration extends Position {
  id: string;
  kind: MazeDecorationKind;
}

export interface MazeFloor {
  version: 4;
  generatorVersion: 4;
  seed: string;
  width: number;
  height: number;
  chunkSize: number;
  tiles: string[];
  spawn: Position;
  zones: MazeZone[];
  gates: MazeGate[];
  anchors: Record<string, Position>;
  decorations: MazeDecoration[];
  topologyHash: number;
}

export interface MazeGenerationOptions {
  decorDensity?: number;
  braidRatio?: number;
}

interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Direction {
  x: number;
  y: number;
  name: "north" | "east" | "south" | "west";
}

const DIRECTIONS: readonly Direction[] = [
  { x: 1, y: 0, name: "east" },
  { x: -1, y: 0, name: "west" },
  { x: 0, y: 1, name: "south" },
  { x: 0, y: -1, name: "north" },
];

// Twelve 16×16 macro chunks are the technical partition; authored POIs occupy
// ten separated slots while their exact position and the connecting maze vary.
const ZONE_SLOTS: readonly Slot[] = [
  { x: 3, y: 38, width: 7, height: 7 },
  { x: 15, y: 36, width: 7, height: 7 },
  { x: 3, y: 22, width: 7, height: 7 },
  { x: 27, y: 36, width: 7, height: 7 },
  { x: 15, y: 21, width: 7, height: 7 },
  { x: 43, y: 36, width: 7, height: 7 },
  { x: 3, y: 5, width: 7, height: 7 },
  { x: 35, y: 21, width: 7, height: 7 },
  { x: 40, y: 6, width: 7, height: 7 },
  { x: 54, y: 4, width: 8, height: 9 },
] as const;

// Floor two crosses the map diagonally and clusters its final relation rooms
// around the upper-right conductor core, so it reads as a new place even
// though both floors retain the same iframe-friendly 64×48 footprint.
const FLOOR_TWO_ZONE_SLOTS: readonly Slot[] = [
  { x: 4, y: 5, width: 7, height: 7 },
  { x: 16, y: 8, width: 7, height: 7 },
  { x: 4, y: 22, width: 7, height: 7 },
  { x: 29, y: 4, width: 7, height: 7 },
  { x: 17, y: 24, width: 7, height: 7 },
  { x: 4, y: 37, width: 7, height: 7 },
  { x: 31, y: 21, width: 7, height: 7 },
  { x: 44, y: 34, width: 7, height: 7 },
  { x: 45, y: 18, width: 7, height: 7 },
  { x: 54, y: 4, width: 8, height: 9 },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function key(position: Position): string {
  return `${position.x}:${position.y}`;
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function createWallGrid(): MazeTile[][] {
  return Array.from({ length: MAZE_HEIGHT }, () =>
    Array.from({ length: MAZE_WIDTH }, () => "#" as MazeTile),
  );
}

function inBounds(x: number, y: number): boolean {
  return x > 0 && y > 0 && x < MAZE_WIDTH - 1 && y < MAZE_HEIGHT - 1;
}

function carveBaseMaze(grid: MazeTile[][], random: () => number): void {
  const start = { x: 1, y: 1 };
  const stack: Position[] = [start];
  grid[start.y][start.x] = ".";

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const choices = shuffle(DIRECTIONS, random).filter((direction) => {
      const nextX = current.x + direction.x * 2;
      const nextY = current.y + direction.y * 2;
      return inBounds(nextX, nextY) && grid[nextY][nextX] === "#";
    });
    const direction = choices[0];
    if (!direction) {
      stack.pop();
      continue;
    }
    const between = {
      x: current.x + direction.x,
      y: current.y + direction.y,
    };
    const next = {
      x: current.x + direction.x * 2,
      y: current.y + direction.y * 2,
    };
    grid[between.y][between.x] = ".";
    grid[next.y][next.x] = ".";
    stack.push(next);
  }
}

function jitteredSlot(slot: Slot, random: () => number, isBoss: boolean): Slot {
  const jitterX = Math.floor(random() * 3) - 1;
  const jitterY = Math.floor(random() * 3) - 1;
  const width = isBoss ? slot.width : slot.width + (random() < 0.28 ? 2 : 0);
  return {
    x: clamp(slot.x + jitterX, 2, MAZE_WIDTH - width - 2),
    y: clamp(slot.y + jitterY, 2, MAZE_HEIGHT - slot.height - 2),
    width,
    height: slot.height,
  };
}

function zoneContains(zone: MazeZone, position: Position, includeBoundary = true): boolean {
  const inset = includeBoundary ? 0 : 1;
  return (
    position.x >= zone.x + inset &&
    position.x < zone.x + zone.width - inset &&
    position.y >= zone.y + inset &&
    position.y < zone.y + zone.height - inset
  );
}

function carveZone(grid: MazeTile[][], zone: MazeZone): void {
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    for (let x = zone.x; x < zone.x + zone.width; x += 1) {
      const boundary =
        x === zone.x ||
        y === zone.y ||
        x === zone.x + zone.width - 1 ||
        y === zone.y + zone.height - 1;
      grid[y][x] = boundary ? "#" : ".";
    }
  }
}

function gateCandidate(zone: MazeZone, direction: Direction): { gate: Position; outside: Position } {
  if (direction.name === "north") {
    const x = zone.center.x;
    return { gate: { x, y: zone.y }, outside: { x, y: zone.y - 1 } };
  }
  if (direction.name === "south") {
    const x = zone.center.x;
    const y = zone.y + zone.height - 1;
    return { gate: { x, y }, outside: { x, y: y + 1 } };
  }
  if (direction.name === "west") {
    const y = zone.center.y;
    return { gate: { x: zone.x, y }, outside: { x: zone.x - 1, y } };
  }
  const y = zone.center.y;
  const x = zone.x + zone.width - 1;
  return { gate: { x, y }, outside: { x: x + 1, y } };
}

function belongsToAnyZone(position: Position, zones: readonly MazeZone[]): boolean {
  return zones.some((zone) => zoneContains(zone, position));
}

function createZoneMask(zones: readonly MazeZone[]): Uint8Array {
  const mask = new Uint8Array(MAZE_WIDTH * MAZE_HEIGHT);
  zones.forEach((zone) => {
    for (let y = zone.y; y < zone.y + zone.height; y += 1) {
      for (let x = zone.x; x < zone.x + zone.width; x += 1) {
        mask[y * MAZE_WIDTH + x] = 1;
      }
    }
  });
  return mask;
}

function zoneMaskContains(mask: Uint8Array, x: number, y: number): boolean {
  return mask[y * MAZE_WIDTH + x] === 1;
}

function pathToNearestFloor(
  start: Position,
  grid: readonly MazeTile[][],
  zones: readonly MazeZone[],
  targetKeys?: ReadonlySet<string>,
): Position[] {
  const pending: Position[] = [start];
  const previous = new Map<string, Position | null>([[key(start), null]]);
  let target: Position | null = null;

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) break;
    const isRequestedTarget = targetKeys?.has(key(current)) ?? false;
    const isAnyFloor = grid[current.y]?.[current.x] === "." && !samePosition(current, start);
    if (isRequestedTarget || (!targetKeys && isAnyFloor)) {
      target = current;
      break;
    }
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next);
      if (!inBounds(next.x, next.y) || previous.has(nextKey)) continue;
      if (belongsToAnyZone(next, zones)) continue;
      previous.set(nextKey, current);
      pending.push(next);
    }
  }

  if (!target) return [start];
  const path: Position[] = [];
  let cursor: Position | null = target;
  while (cursor) {
    path.unshift(cursor);
    cursor = previous.get(key(cursor)) ?? null;
  }
  return path;
}

function reachableFloor(grid: readonly MazeTile[][], start: Position): Set<string> {
  if (grid[start.y]?.[start.x] !== ".") return new Set();
  const visited = new Set<string>([key(start)]);
  const pending: Position[] = [start];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) break;
    DIRECTIONS.forEach((direction) => {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next);
      if (
        !visited.has(nextKey) &&
        grid[next.y]?.[next.x] === "."
      ) {
        visited.add(nextKey);
        pending.push(next);
      }
    });
  }
  return visited;
}

function placeZones(
  grid: MazeTile[][],
  graph: RoomGraph,
  random: () => number,
): MazeZone[] {
  const slots = graph.floor === 1 ? ZONE_SLOTS : FLOOR_TWO_ZONE_SLOTS;
  return graph.nodes.map((node, index) => {
    const base = slots[index] ?? slots[slots.length - 1];
    const slot = jitteredSlot(base, random, node.type === "boss");
    const zone: MazeZone = {
      id: `zone:${node.id}`,
      roomNodeId: node.id,
      type: node.type,
      lessonId: node.lessonId,
      ...slot,
      center: {
        x: slot.x + Math.floor(slot.width / 2),
        y: slot.y + Math.floor(slot.height / 2),
      },
    };
    carveZone(grid, zone);
    return zone;
  });
}

function placeGates(
  grid: MazeTile[][],
  graph: RoomGraph,
  zones: readonly MazeZone[],
  random: () => number,
): MazeGate[] {
  return zones.map((zone) => {
    const node = graph.nodes.find((entry) => entry.id === zone.roomNodeId) as RoomNode;
    const options = shuffle(DIRECTIONS, random).map((direction) => {
      const candidate = gateCandidate(zone, direction);
      const path = pathToNearestFloor(candidate.outside, grid, zones);
      return { ...candidate, path };
    }).sort((a, b) => a.path.length - b.path.length);
    const chosen = options[0];
    grid[chosen.gate.y][chosen.gate.x] = ".";
    chosen.path.forEach((position) => {
      grid[position.y][position.x] = ".";
    });
    return {
      id: `gate:${zone.roomNodeId}`,
      roomNodeId: zone.roomNodeId,
      requires: [...node.prerequisiteLessons],
      ...chosen.gate,
      outside: { ...chosen.outside },
    };
  });
}

function connectAllZones(
  grid: MazeTile[][],
  zones: readonly MazeZone[],
  gates: readonly MazeGate[],
  spawn: Position,
): void {
  const entryZone = zones.find((zone) => zoneContains(zone, spawn));
  const entryGate = gates.find((gate) => gate.roomNodeId === entryZone?.roomNodeId);
  if (entryGate) {
    const entryOutside = new Set([key(entryGate.outside)]);
    gates.forEach((gate) => {
      if (gate.id === entryGate.id) return;
      const path = pathToNearestFloor(gate.outside, grid, zones, entryOutside);
      path.forEach((position) => {
        grid[position.y][position.x] = ".";
      });
    });
  }

  // The explicit gate backbone above is the deterministic repair pass. Keep a
  // bounded second pass for malformed future templates, never an open-ended
  // retry loop.
  for (let attempt = 0; attempt < zones.length; attempt += 1) {
    const reachable = reachableFloor(grid, spawn);
    const missing = zones.find((zone) => !reachable.has(key(zone.center)));
    if (!missing) break;
    const gate = gates.find((entry) => entry.roomNodeId === missing.roomNodeId);
    if (!gate) break;
    const path = pathToNearestFloor(gate.outside, grid, zones, reachable);
    path.forEach((position) => {
      grid[position.y][position.x] = ".";
    });
  }

  const reachable = reachableFloor(grid, spawn);
  for (let y = 1; y < MAZE_HEIGHT - 1; y += 1) {
    for (let x = 1; x < MAZE_WIDTH - 1; x += 1) {
      if (grid[y][x] === "." && !reachable.has(key({ x, y }))) {
        grid[y][x] = "#";
      }
    }
  }
}

function floorNeighborCount(grid: readonly MazeTile[][], position: Position): number {
  return DIRECTIONS.filter((direction) => (
    grid[position.y + direction.y]?.[position.x + direction.x] === "."
  )).length;
}

/**
 * Opens deterministic corridor cross-links without touching authored room
 * boundaries. The original depth-first maze remains recognizable, while most
 * backtracking-only branches become loops that return players to useful paths.
 */
function braidCorridors(
  grid: MazeTile[][],
  zoneMask: Uint8Array,
  random: () => number,
  ratio: number,
): void {
  if (ratio <= 0) return;
  const candidates: Position[] = [];
  for (let y = 1; y < MAZE_HEIGHT - 1; y += 1) {
    for (let x = 1; x < MAZE_WIDTH - 1; x += 1) {
      if (
        grid[y][x] === "." &&
        !zoneMaskContains(zoneMask, x, y) &&
        floorNeighborCount(grid, { x, y }) === 1
      ) {
        candidates.push({ x, y });
      }
    }
  }
  const deadEnds = shuffle(candidates, random);

  deadEnds.forEach((position) => {
    if (random() > ratio || floorNeighborCount(grid, position) > 1) return;
    const links = shuffle(DIRECTIONS, random).filter((direction) => {
      const wall = { x: position.x + direction.x, y: position.y + direction.y };
      const beyond = { x: position.x + direction.x * 2, y: position.y + direction.y * 2 };
      return (
        inBounds(beyond.x, beyond.y) &&
        grid[wall.y]?.[wall.x] === "#" &&
        grid[beyond.y]?.[beyond.x] === "." &&
        !zoneMaskContains(zoneMask, wall.x, wall.y) &&
        !zoneMaskContains(zoneMask, beyond.x, beyond.y)
      );
    });
    const chosen = links[0];
    if (!chosen) return;
    grid[position.y + chosen.y][position.x + chosen.x] = ".";
  });
}

function createDecorations(
  grid: readonly MazeTile[][],
  zoneMask: Uint8Array,
  random: () => number,
  density: number,
): MazeDecoration[] {
  const decorations: MazeDecoration[] = [];
  const kinds: readonly MazeDecorationKind[] = ["torch", "rubble", "rune"];
  for (let y = 2; y < MAZE_HEIGHT - 2; y += 1) {
    for (let x = 2; x < MAZE_WIDTH - 2; x += 1) {
      if (grid[y][x] !== "." || zoneMaskContains(zoneMask, x, y)) continue;
      if (random() >= density) continue;
      decorations.push({
        id: `decor:${x}:${y}`,
        x,
        y,
        kind: kinds[Math.floor(random() * kinds.length)],
      });
    }
  }
  return decorations;
}

function topologyHash(tiles: readonly string[], gates: readonly MazeGate[]): number {
  return stableStringHash(
    `${tiles.join("|")}|${gates.map((gate) => `${gate.roomNodeId}:${gate.x}:${gate.y}`).join("|")}`,
  );
}

export function generateMazeFloor(
  graph: RoomGraph,
  options: MazeGenerationOptions = {},
): MazeFloor {
  const topologyRandom = createSeededRandom(
    `select-from-dungeon:maze:v3:floor-${graph.floor}:${graph.seed}:phase:topology`,
  );
  const decorRandom = createSeededRandom(
    `select-from-dungeon:maze:v3:floor-${graph.floor}:${graph.seed}:phase:decor`,
  );
  const grid = createWallGrid();
  carveBaseMaze(grid, topologyRandom);
  const zones = placeZones(grid, graph, topologyRandom);
  const gates = placeGates(grid, graph, zones, topologyRandom);
  const entryZone = zones.find((zone) => zone.roomNodeId === graph.entryId) ?? zones[0];
  const spawn = { ...entryZone.center };
  connectAllZones(grid, zones, gates, spawn);
  const zoneMask = createZoneMask(zones);
  braidCorridors(
    grid,
    zoneMask,
    topologyRandom,
    clamp(options.braidRatio ?? 1, 0, 1),
  );
  const tiles = grid.map((row) => row.join(""));
  const anchors = Object.fromEntries(
    zones.map((zone) => [zone.roomNodeId, { ...zone.center }]),
  );
  const density = clamp(options.decorDensity ?? 0.045, 0, 0.2);
  return {
    version: MAZE_GENERATOR_VERSION,
    generatorVersion: MAZE_GENERATOR_VERSION,
    seed: graph.seed,
    width: MAZE_WIDTH,
    height: MAZE_HEIGHT,
    chunkSize: MAZE_CHUNK_SIZE,
    tiles,
    spawn,
    zones,
    gates,
    anchors,
    decorations: createDecorations(grid, zoneMask, decorRandom, density),
    topologyHash: topologyHash(tiles, gates),
  };
}

export function countMazeDeadEnds(floor: MazeFloor): number {
  let total = 0;
  for (let y = 1; y < floor.height - 1; y += 1) {
    for (let x = 1; x < floor.width - 1; x += 1) {
      if (mazeTileAt(floor, x, y) !== ".") continue;
      const neighbors = DIRECTIONS.filter((direction) => (
        mazeTileAt(floor, x + direction.x, y + direction.y) === "."
      )).length;
      if (neighbors === 1) total += 1;
    }
  }
  return total;
}

export function mazeTileAt(floor: MazeFloor, x: number, y: number): MazeTile | null {
  const tile = floor.tiles[y]?.[x];
  return tile === "#" || tile === "." ? tile : null;
}

export function mazeZoneAt(floor: MazeFloor, position: Position): MazeZone | null {
  return floor.zones.find((zone) => zoneContains(zone, position)) ?? null;
}

export function mazeGateAt(floor: MazeFloor, position: Position): MazeGate | null {
  return floor.gates.find((gate) => samePosition(gate, position)) ?? null;
}

export function isMazeWalkable(
  floor: MazeFloor,
  x: number,
  y: number,
  completedLessons: ReadonlySet<LessonId> = new Set<LessonId>(),
  openedGateIds: ReadonlySet<string> = new Set<string>(),
): boolean {
  if (mazeTileAt(floor, x, y) !== ".") return false;
  const gate = mazeGateAt(floor, { x, y });
  return !gate ||
    openedGateIds.has(gate.id) ||
    gate.requires.every((lesson) => completedLessons.has(lesson));
}

export function revealAround(
  floor: MazeFloor,
  position: Position,
  radius = 4,
): string[] {
  const revealed: string[] = [];
  for (let y = position.y - radius; y <= position.y + radius; y += 1) {
    for (let x = position.x - radius; x <= position.x + radius; x += 1) {
      if (
        x >= 0 && y >= 0 && x < floor.width && y < floor.height &&
        Math.abs(position.x - x) + Math.abs(position.y - y) <= radius
      ) revealed.push(`${x}:${y}`);
    }
  }
  return revealed;
}

export function cloneMazeFloor(floor: MazeFloor): MazeFloor {
  return {
    ...floor,
    tiles: [...floor.tiles],
    spawn: { ...floor.spawn },
    zones: floor.zones.map((zone) => ({ ...zone, center: { ...zone.center } })),
    gates: floor.gates.map((gate) => ({
      ...gate,
      requires: [...gate.requires],
      outside: { ...gate.outside },
    })),
    anchors: Object.fromEntries(
      Object.entries(floor.anchors).map(([id, position]) => [id, { ...position }]),
    ),
    decorations: floor.decorations.map((decoration) => ({ ...decoration })),
  };
}
