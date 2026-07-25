import {
  MVP2_MAZE_CHUNK_SIZE,
  MVP2_MAZE_HEIGHT,
  MVP2_MAZE_WIDTH,
  floorMapBlueprint,
  type FloorMapBlueprint,
  type FloorMapSlot,
} from "../content/floorMapBlueprints";
import type { LessonId, Position } from "./types";
import {
  createSeededRandom,
  stableStringHash,
  type RoomGraph,
  type RoomNode,
  type RoomType,
  type RunLessonId,
} from "./runGraph";

export const LEGACY_MAZE_GENERATOR_VERSION = 4 as const;
export const MAZE_GENERATOR_VERSION = 5 as const;
export const LEGACY_MAZE_WIDTH = 64;
export const LEGACY_MAZE_HEIGHT = 48;
export const LEGACY_MAZE_CHUNK_SIZE = 16;
export const MAZE_WIDTH = MVP2_MAZE_WIDTH;
export const MAZE_HEIGHT = MVP2_MAZE_HEIGHT;
export const MAZE_CHUNK_SIZE = MVP2_MAZE_CHUNK_SIZE;

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

/**
 * `version` remains 4 because the serialized shape is unchanged. The nested
 * generator version distinguishes legacy 64×48 mazes from authored 48×36
 * macro layouts.
 */
export interface MazeFloor {
  version: 4;
  generatorVersion: 4 | 5;
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

function createWallGrid(width: number, height: number): MazeTile[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "#" as MazeTile),
  );
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x > 0 && y > 0 && x < width - 1 && y < height - 1;
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

function assertSlotInsideMap(slot: FloorMapSlot, blueprint: FloorMapBlueprint): void {
  const fits =
    slot.x > 0 &&
    slot.y > 0 &&
    slot.width >= 5 &&
    slot.height >= 5 &&
    slot.x + slot.width < MAZE_WIDTH &&
    slot.y + slot.height < MAZE_HEIGHT;
  if (!fits) {
    throw new Error(
      `第 ${blueprint.floor} 层蓝图槽位 ${slot.roomNodeId} 超出 ${MAZE_WIDTH}×${MAZE_HEIGHT} 地图。`,
    );
  }
}

function slotsOverlap(first: FloorMapSlot, second: FloorMapSlot): boolean {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

function assertBlueprint(
  blueprint: FloorMapBlueprint,
  graph: RoomGraph,
): void {
  if (blueprint.slots.length !== graph.nodes.length) {
    throw new Error(
      `第 ${graph.floor} 层蓝图有 ${blueprint.slots.length} 个槽位，但课程图有 ${graph.nodes.length} 个节点。`,
    );
  }
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const slotNodeIds = blueprint.slots.map((slot) => slot.roomNodeId);
  if (
    new Set(slotNodeIds).size !== slotNodeIds.length ||
    slotNodeIds.some((roomNodeId) => !graphNodeIds.has(roomNodeId))
  ) {
    throw new Error(
      `第 ${graph.floor} 层蓝图槽位必须与 RoomGraph 节点一一显式对应。`,
    );
  }
  blueprint.slots.forEach((slot, index) => {
    assertSlotInsideMap(slot, blueprint);
    for (let otherIndex = index + 1; otherIndex < blueprint.slots.length; otherIndex += 1) {
      if (slotsOverlap(slot, blueprint.slots[otherIndex])) {
        throw new Error(
          `第 ${graph.floor} 层蓝图槽位 ${slot.roomNodeId} 与 ${blueprint.slots[otherIndex].roomNodeId} 重叠。`,
        );
      }
    }
  });
}

function placeZones(
  grid: MazeTile[][],
  graph: RoomGraph,
  blueprint: FloorMapBlueprint,
): MazeZone[] {
  assertBlueprint(blueprint, graph);
  const slotsByRoomNodeId = new Map(
    blueprint.slots.map((slot) => [slot.roomNodeId, slot]),
  );
  return graph.nodes.map((node) => {
    const slot = slotsByRoomNodeId.get(node.id);
    if (!slot) {
      throw new Error(
        `第 ${graph.floor} 层蓝图缺少 RoomGraph 节点 ${node.id} 的槽位。`,
      );
    }
    const zone: MazeZone = {
      id: `zone:${node.id}`,
      roomNodeId: node.id,
      type: node.type,
      lessonId: node.lessonId,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      center: {
        x: slot.x + Math.floor(slot.width / 2),
        y: slot.y + Math.floor(slot.height / 2),
      },
    };
    carveZone(grid, zone);
    return zone;
  });
}

function graphNeighbors(graph: RoomGraph, roomNodeId: string): string[] {
  const neighbors = new Set<string>();
  graph.nodes.forEach((node) => {
    if (node.id === roomNodeId) node.next.forEach((nextId) => neighbors.add(nextId));
    if (node.next.includes(roomNodeId)) neighbors.add(node.id);
  });
  return [...neighbors];
}

function directionTowardNeighbors(
  graph: RoomGraph,
  zone: MazeZone,
  zonesByNodeId: ReadonlyMap<string, MazeZone>,
  random: () => number,
): Direction {
  const neighbors = graphNeighbors(graph, zone.roomNodeId)
    .map((nodeId) => zonesByNodeId.get(nodeId))
    .filter((entry): entry is MazeZone => Boolean(entry));
  if (neighbors.length === 0) return DIRECTIONS[0];
  const target = {
    x: neighbors.reduce((total, entry) => total + entry.center.x, 0) / neighbors.length,
    y: neighbors.reduce((total, entry) => total + entry.center.y, 0) / neighbors.length,
  };
  const deltaX = target.x - zone.center.x;
  const deltaY = target.y - zone.center.y;
  const preferred = Math.abs(deltaX) >= Math.abs(deltaY)
    ? (deltaX >= 0 ? "east" : "west")
    : (deltaY >= 0 ? "south" : "north");
  const ordered = shuffle(DIRECTIONS, random);
  return ordered.find((direction) => direction.name === preferred) ?? ordered[0];
}

function gateCandidate(
  zone: MazeZone,
  direction: Direction,
): { gate: Position; outside: Position } {
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

function directionTowardPosition(zone: MazeZone, target: Position): Direction {
  const deltaX = target.x - zone.center.x;
  const deltaY = target.y - zone.center.y;
  const name: Direction["name"] = Math.abs(deltaX) >= Math.abs(deltaY)
    ? (deltaX >= 0 ? "east" : "west")
    : (deltaY >= 0 ? "south" : "north");
  return DIRECTIONS.find((direction) => direction.name === name) ?? DIRECTIONS[0];
}

function placeGates(
  grid: MazeTile[][],
  graph: RoomGraph,
  zones: readonly MazeZone[],
  random: () => number,
): MazeGate[] {
  const zonesByNodeId = new Map(zones.map((zone) => [zone.roomNodeId, zone]));
  return zones.map((zone) => {
    const node = graph.nodes.find((entry) => entry.id === zone.roomNodeId) as RoomNode;
    const direction = directionTowardNeighbors(graph, zone, zonesByNodeId, random);
    const candidate = gateCandidate(zone, direction);
    grid[candidate.gate.y][candidate.gate.x] = ".";
    grid[candidate.outside.y][candidate.outside.x] = ".";
    return {
      id: `gate:${zone.roomNodeId}`,
      roomNodeId: zone.roomNodeId,
      requires: [...node.prerequisiteLessons],
      ...candidate.gate,
      outside: { ...candidate.outside },
    };
  });
}

function createZoneMask(
  zones: readonly MazeZone[],
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  zones.forEach((zone) => {
    for (let y = zone.y; y < zone.y + zone.height; y += 1) {
      for (let x = zone.x; x < zone.x + zone.width; x += 1) {
        mask[y * width + x] = 1;
      }
    }
  });
  return mask;
}

function zoneMaskContains(mask: Uint8Array, width: number, x: number, y: number): boolean {
  return mask[y * width + x] === 1;
}

function routeBetween(
  start: Position,
  target: Position,
  zoneMask: Uint8Array,
  width: number,
  height: number,
  random: () => number,
  forbidden: ReadonlySet<string> = new Set<string>(),
): Position[] {
  const pending: Position[] = [{ ...start }];
  const previous = new Map<string, Position | null>([[key(start), null]]);
  const directions = shuffle(DIRECTIONS, random);

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) break;
    if (samePosition(current, target)) {
      const route: Position[] = [];
      let cursor: Position | null = current;
      while (cursor) {
        route.unshift(cursor);
        cursor = previous.get(key(cursor)) ?? null;
      }
      return route;
    }
    directions.forEach((direction) => {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next);
      if (
        previous.has(nextKey) ||
        forbidden.has(nextKey) ||
        !inBounds(next.x, next.y, width, height) ||
        zoneMaskContains(zoneMask, width, next.x, next.y)
      ) return;
      previous.set(nextKey, current);
      pending.push(next);
    });
  }

  return [];
}

function carveWideRoute(
  grid: MazeTile[][],
  route: readonly Position[],
  roadWidth: 2 | 3 | 4,
  zoneMask: Uint8Array,
): void {
  const width = grid[0].length;
  const height = grid.length;
  const minOffset = roadWidth === 2 ? 0 : -1;
  const maxOffset = roadWidth === 4 ? 2 : 1;
  route.forEach((position) => {
    for (let offsetY = minOffset; offsetY <= maxOffset; offsetY += 1) {
      for (let offsetX = minOffset; offsetX <= maxOffset; offsetX += 1) {
        const x = position.x + offsetX;
        const y = position.y + offsetY;
        if (
          !inBounds(x, y, width, height) ||
          zoneMaskContains(zoneMask, width, x, y)
        ) continue;
        grid[y][x] = ".";
      }
    }
  });
}

/**
 * Curriculum actors occupy room centers. A single anchored area Boss or
 * patrol actor must not be able to seal the only doorway. Every curriculum
 * transition therefore receives a second physical route between the same two
 * RoomGraph nodes. Both apertures still resolve through each room's one
 * serialized MazeGate and prerequisite list.
 */
function ensureCurriculumAccessRedundancy(
  grid: MazeTile[][],
  graph: RoomGraph,
  zones: readonly MazeZone[],
  gates: readonly MazeGate[],
  random: () => number,
): void {
  const width = grid[0].length;
  const height = grid.length;
  const zoneMask = createZoneMask(zones, width, height);
  const gateByNodeId = new Map(gates.map((gate) => [gate.roomNodeId, gate]));
  const zoneByNodeId = new Map(zones.map((zone) => [zone.roomNodeId, zone]));
  graph.nodes.filter((node) => node.lessonId).forEach((node) => {
    const predecessor = graph.nodes
      .filter((entry) => entry.next.includes(node.id) && entry.depth < node.depth)
      .sort((left, right) => right.depth - left.depth)[0];
    const zone = zoneByNodeId.get(node.id);
    const predecessorZone = predecessor ? zoneByNodeId.get(predecessor.id) : undefined;
    const gate = gateByNodeId.get(node.id);
    const predecessorGate = predecessor ? gateByNodeId.get(predecessor.id) : undefined;
    if (!zone || !predecessor || !predecessorZone || !gate || !predecessorGate) {
      throw new Error(`课程房 ${node.id} 缺少前置房、物理区域或门。`);
    }
    const primaryFromDirection = directionTowardPosition(predecessorZone, zone.center);
    const primaryToDirection = directionTowardPosition(zone, predecessorZone.center);
    const primaryFrom = gateCandidate(predecessorZone, primaryFromDirection);
    const primaryTo = gateCandidate(zone, primaryToDirection);
    const forbidden = new Set<string>([
      key(primaryFrom.outside),
      key(primaryTo.outside),
      ...DIRECTIONS.flatMap((direction) => [
        key({
          x: primaryFrom.outside.x + direction.x,
          y: primaryFrom.outside.y + direction.y,
        }),
        key({
          x: primaryTo.outside.x + direction.x,
          y: primaryTo.outside.y + direction.y,
        }),
      ]),
    ]);
    const fromCandidates = shuffle(
      DIRECTIONS.filter((direction) => direction.name !== primaryFromDirection.name),
      random,
    ).map((direction) => gateCandidate(predecessorZone, direction))
      .filter((door) => (
        inBounds(door.outside.x, door.outside.y, width, height) &&
        !zoneMaskContains(zoneMask, width, door.outside.x, door.outside.y) &&
        !forbidden.has(key(door.outside))
      ));
    const toCandidates = shuffle(
      DIRECTIONS.filter((direction) => direction.name !== primaryToDirection.name),
      random,
    ).map((direction) => gateCandidate(zone, direction))
      .filter((door) => (
        inBounds(door.outside.x, door.outside.y, width, height) &&
        !zoneMaskContains(zoneMask, width, door.outside.x, door.outside.y) &&
        !forbidden.has(key(door.outside))
      ));
    const candidates = fromCandidates.flatMap((fromDoor) => (
      toCandidates.map((toDoor) => ({
        fromDoor,
        toDoor,
        route: routeBetween(
          fromDoor.outside,
          toDoor.outside,
          zoneMask,
          width,
          height,
          random,
          forbidden,
        ),
      }))
    )).filter(({ route }) => route.length > 0)
      .sort((left, right) => left.route.length - right.route.length);
    const selected = candidates[0];
    if (!selected) {
      throw new Error(`课程房 ${node.id} 无法建立第二条独立入口。`);
    }
    grid[selected.fromDoor.gate.y][selected.fromDoor.gate.x] = ".";
    grid[selected.fromDoor.outside.y][selected.fromDoor.outside.x] = ".";
    grid[selected.toDoor.gate.y][selected.toDoor.gate.x] = ".";
    grid[selected.toDoor.outside.y][selected.toDoor.outside.x] = ".";
    carveWideRoute(grid, selected.route, 2, zoneMask);
  });
}

function connectRoomGraph(
  grid: MazeTile[][],
  graph: RoomGraph,
  gates: readonly MazeGate[],
  zones: readonly MazeZone[],
  blueprint: FloorMapBlueprint,
  random: () => number,
): void {
  const zoneMask = createZoneMask(zones, grid[0].length, grid.length);
  const gateByNodeId = new Map(gates.map((gate) => [gate.roomNodeId, gate]));
  const zoneByNodeId = new Map(zones.map((zone) => [zone.roomNodeId, zone]));
  graph.nodes.forEach((node) => {
    const from = gateByNodeId.get(node.id);
    const fromZone = zoneByNodeId.get(node.id);
    if (!from || !fromZone) throw new Error(`缺少房间 ${node.id} 的物理门。`);
    node.next.forEach((nextId) => {
      const to = gateByNodeId.get(nextId);
      const toZone = zoneByNodeId.get(nextId);
      if (!to || !toZone) throw new Error(`缺少房间 ${nextId} 的物理门。`);
      // One canonical gate remains serialized per room. Additional graph-edge
      // apertures are derived from the saved zones and tiles, so the shape does
      // not grow while branching rooms can face each connected objective.
      const fromDoor = gateCandidate(
        fromZone,
        directionTowardPosition(fromZone, toZone.center),
      );
      const toDoor = gateCandidate(
        toZone,
        directionTowardPosition(toZone, fromZone.center),
      );
      grid[fromDoor.gate.y][fromDoor.gate.x] = ".";
      grid[fromDoor.outside.y][fromDoor.outside.x] = ".";
      grid[toDoor.gate.y][toDoor.gate.x] = ".";
      grid[toDoor.outside.y][toDoor.outside.x] = ".";
      const route = routeBetween(
        fromDoor.outside,
        toDoor.outside,
        zoneMask,
        grid[0].length,
        grid.length,
        random,
      );
      if (route.length === 0) {
        throw new Error(
          `无法连接宏观路线 ${key(fromDoor.outside)} → ${key(toDoor.outside)}。`,
        );
      }
      carveWideRoute(grid, route, blueprint.mainRoadWidth, zoneMask);
    });
  });
  ensureCurriculumAccessRedundancy(grid, graph, zones, gates, random);
}

function createDecorations(
  grid: readonly MazeTile[][],
  zoneMask: Uint8Array,
  random: () => number,
  density: number,
): MazeDecoration[] {
  const decorations: MazeDecoration[] = [];
  const width = grid[0].length;
  const height = grid.length;
  const kinds: readonly MazeDecorationKind[] = ["torch", "rubble", "rune"];
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      if (grid[y][x] !== "." || zoneMaskContains(zoneMask, width, x, y)) continue;
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

function topologyHash(
  tiles: readonly string[],
  gates: readonly MazeGate[],
  blueprint: FloorMapBlueprint,
): number {
  return stableStringHash(
    `${blueprint.layoutName}|${tiles.join("|")}|${gates
      .map((gate) => `${gate.roomNodeId}:${gate.x}:${gate.y}`)
      .join("|")}`,
  );
}

export function generateMazeFloor(
  graph: RoomGraph,
  options: MazeGenerationOptions = {},
): MazeFloor {
  const blueprint = floorMapBlueprint(graph.floor);
  const topologyRandom = createSeededRandom(
    `select-from-dungeon:maze:v5:floor-${graph.floor}:${graph.seed}:phase:topology`,
  );
  const decorRandom = createSeededRandom(
    `select-from-dungeon:maze:v5:floor-${graph.floor}:${graph.seed}:phase:decor`,
  );
  const grid = createWallGrid(MAZE_WIDTH, MAZE_HEIGHT);
  const zones = placeZones(grid, graph, blueprint);
  const gates = placeGates(grid, graph, zones, topologyRandom);
  connectRoomGraph(grid, graph, gates, zones, blueprint, topologyRandom);
  const entryZone = zones.find((zone) => zone.roomNodeId === graph.entryId) ?? zones[0];
  const spawn = { ...entryZone.center };
  const tiles = grid.map((row) => row.join(""));
  const anchors = Object.fromEntries(
    zones.map((zone) => [zone.roomNodeId, { ...zone.center }]),
  );
  const zoneMask = createZoneMask(zones, MAZE_WIDTH, MAZE_HEIGHT);
  const density = clamp(options.decorDensity ?? 0.045, 0, 0.2);
  return {
    version: 4,
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
    topologyHash: topologyHash(tiles, gates, blueprint),
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
  const exact = floor.gates.find((gate) => samePosition(gate, position));
  if (exact) return exact;
  const boundaryZone = floor.zones.find((zone) => (
    zoneContains(zone, position) &&
    (
      position.x === zone.x ||
      position.x === zone.x + zone.width - 1 ||
      position.y === zone.y ||
      position.y === zone.y + zone.height - 1
    )
  ));
  if (!boundaryZone || mazeTileAt(floor, position.x, position.y) !== ".") return null;
  return floor.gates.find((gate) => gate.roomNodeId === boundaryZone.roomNodeId) ?? null;
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
