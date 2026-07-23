import { mazeTileAt, mazeZoneAt, type MazeFloor } from "./mazeGenerator";
import { findGridPath } from "./pathfinding";
import {
  lessonsForFloor,
  stableStringHash,
  type RoomGraph,
  type RoomReward,
} from "./runGraph";
import type {
  Campfire,
  CampfirePhase,
  LessonId,
  Position,
} from "./types";

export const GUIDED_MAP_VERSION = 1 as const;
export const ROUTE_MARKER_SPACING = 14;

export interface GuidedRouteMarker extends Position {
  id: string;
  phase: CampfirePhase;
  order: number;
  pathIndex: number;
}

export interface GuidedDeadEndCache extends Position {
  id: string;
  sourceRoomId: string;
  rewardId: RoomReward;
}

export interface GuidedShortcut {
  id: string;
  keyId: string;
  name: string;
  entry: Position;
  exit: Position;
  keyPosition: Position;
  keyRoomNodeId: string;
  requires: LessonId[];
  detourDistance: number;
}

export interface GuidedMapPlan {
  version: 1;
  seed: string;
  floor: RoomGraph["floor"];
  routeMarkers: GuidedRouteMarker[];
  deadEndCaches: GuidedDeadEndCache[];
  shortcuts: GuidedShortcut[];
}

export interface GuidedMapValidation {
  valid: boolean;
  errors: string[];
  maxMarkerGap: number;
  emptyDeadEnds: number;
}

const DIRECTIONS: readonly Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const CACHE_REWARDS: readonly RoomReward[] = [
  "restore-12-hp",
  "cool-8-heat",
  "hint-token",
  "schema-shard",
];

function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}

function distance(left: Position, right: Position): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function isFloor(floor: MazeFloor, position: Position): boolean {
  return mazeTileAt(floor, position.x, position.y) === ".";
}

function pathBetween(
  floor: MazeFloor,
  start: Position,
  target: Position,
): Position[] {
  return findGridPath(
    start,
    target,
    (x, y) => mazeTileAt(floor, x, y) === ".",
  );
}

function distanceFromSpawn(floor: MazeFloor, position: Position): number {
  const path = pathBetween(floor, floor.spawn, position);
  return path.length > 0 ? path.length - 1 : Number.MAX_SAFE_INTEGER;
}

function phaseFor(progress: number): CampfirePhase {
  if (progress < 1 / 3) return "front";
  if (progress < 2 / 3) return "middle";
  return "rear";
}

function chooseKeyRoom(graph: RoomGraph): string {
  const candidates = graph.nodes
    .filter((node) => (
      node.id !== graph.entryId &&
      node.id !== graph.bossId &&
      !node.lessonId
    ))
    .sort((left, right) => (
      right.depth - left.depth ||
      stableStringHash(`${graph.seed}:guided-key-room:${left.id}`) -
        stableStringHash(`${graph.seed}:guided-key-room:${right.id}`)
    ));
  return candidates[0]?.id ?? graph.nodes.at(-2)?.id ?? graph.entryId;
}

function chooseKeyPosition(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  roomNodeId: string,
): Position {
  const zone = floor.zones.find((entry) => entry.roomNodeId === roomNodeId);
  if (!zone) return { ...floor.spawn };
  const occupied = new Set([
    ...campfires.map(positionKey),
    ...campfires.map((campfire) => positionKey(campfire.restPosition)),
    ...Object.values(floor.anchors).map(positionKey),
    ...floor.gates.map(positionKey),
  ]);
  const candidates: Position[] = [];
  for (let y = zone.y + 1; y < zone.y + zone.height - 1; y += 1) {
    for (let x = zone.x + 1; x < zone.x + zone.width - 1; x += 1) {
      const position = { x, y };
      if (!occupied.has(positionKey(position)) && isFloor(floor, position)) {
        candidates.push(position);
      }
    }
  }
  candidates.sort((left, right) => (
    stableStringHash(`${graph.seed}:guided-key:${left.x}:${left.y}`) -
    stableStringHash(`${graph.seed}:guided-key:${right.x}:${right.y}`)
  ));
  return { ...(candidates[0] ?? zone.center) };
}

function isShortcutEndpointCandidate(
  floor: MazeFloor,
  campfires: readonly Campfire[],
  position: Position,
): boolean {
  if (!isFloor(floor, position) || mazeZoneAt(floor, position)) return false;
  if (floor.gates.some((gate) => distance(gate, position) <= 1)) return false;
  return !campfires.some((campfire) => (
    distance(campfire, position) <= 2 ||
    distance(campfire.restPosition, position) <= 1
  ));
}

function nearestEligiblePathCell(
  path: readonly Position[],
  preferredIndex: number,
  floor: MazeFloor,
  campfires: readonly Campfire[],
): Position | null {
  for (let offset = 0; offset < path.length; offset += 1) {
    const indexes = offset === 0
      ? [preferredIndex]
      : [preferredIndex - offset, preferredIndex + offset];
    for (const index of indexes) {
      const position = path[index];
      if (position && isShortcutEndpointCandidate(floor, campfires, position)) {
        return { ...position };
      }
    }
  }
  return null;
}

function createShortcut(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  keyRoomNodeId: string,
  keyPosition: Position,
): GuidedShortcut | null {
  const route = pathBetween(floor, floor.spawn, keyPosition);
  if (route.length < 24) return null;
  const entry = nearestEligiblePathCell(
    route,
    Math.max(3, Math.floor(route.length * 0.16)),
    floor,
    campfires,
  );
  const exit = nearestEligiblePathCell(
    route,
    Math.min(route.length - 3, Math.floor(route.length * 0.84)),
    floor,
    campfires,
  );
  if (!entry || !exit || positionKey(entry) === positionKey(exit)) return null;
  const detour = pathBetween(floor, entry, exit);
  if (detour.length < 18) return null;
  const keyRoom = graph.nodes.find((node) => node.id === keyRoomNodeId);
  return {
    id: `shortcut:${graph.floor}:return`,
    keyId: `shortcut-key:${graph.floor}`,
    name: graph.floor === 1 ? "排水回廊捷径" : "雷轨回路捷径",
    entry,
    exit,
    keyPosition: { ...keyPosition },
    keyRoomNodeId,
    requires: [...(keyRoom?.prerequisiteLessons ?? [])],
    detourDistance: detour.length - 1,
  };
}

function stitchedCourseRoute(graph: RoomGraph, floor: MazeFloor): Position[] {
  const roomByLesson = new Map(
    graph.nodes
      .filter((node) => node.lessonId)
      .map((node) => [node.lessonId, node] as const),
  );
  const targets = lessonsForFloor(graph.floor)
    .map((lesson) => roomByLesson.get(lesson))
    .filter((node) => node !== undefined)
    .map((node) => floor.anchors[node.id])
    .filter((position) => position !== undefined);
  const stitched: Position[] = [{ ...floor.spawn }];
  let cursor = floor.spawn;
  targets.forEach((target) => {
    const segment = pathBetween(floor, cursor, target);
    if (segment.length > 1) stitched.push(...segment.slice(1));
    cursor = target;
  });
  return stitched;
}

function createRouteMarkers(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  shortcut: GuidedShortcut | null,
): GuidedRouteMarker[] {
  const route = stitchedCourseRoute(graph, floor);
  const occupied = new Set([
    ...campfires.map(positionKey),
    ...floor.gates.map(positionKey),
    ...(shortcut ? [positionKey(shortcut.entry), positionKey(shortcut.exit)] : []),
  ]);
  const markers: GuidedRouteMarker[] = [];
  for (
    let index = ROUTE_MARKER_SPACING;
    index < route.length - 1;
    index += ROUTE_MARKER_SPACING
  ) {
    const searchIndexes = [0, -1, 1, -2, 2, -3, 3, -4, 4]
      .map((offset) => index + offset)
      .filter((candidateIndex) => candidateIndex > 0 && candidateIndex < route.length - 1);
    const chosenIndex = searchIndexes.find((candidateIndex) => {
      const candidate = route[candidateIndex];
      return candidate && !occupied.has(positionKey(candidate));
    });
    if (chosenIndex === undefined) continue;
    const position = route[chosenIndex];
    const progress = chosenIndex / Math.max(1, route.length - 1);
    markers.push({
      id: `route-marker:${graph.floor}:${markers.length + 1}`,
      ...position,
      phase: phaseFor(progress),
      order: markers.length + 1,
      pathIndex: chosenIndex,
    });
    occupied.add(positionKey(position));
  }
  return markers;
}

function floorNeighborCount(floor: MazeFloor, position: Position): number {
  return DIRECTIONS.filter((direction) => (
    mazeTileAt(floor, position.x + direction.x, position.y + direction.y) === "."
  )).length;
}

function nearestRoomId(
  graph: RoomGraph,
  floor: MazeFloor,
  position: Position,
): string {
  return [...graph.nodes]
    .sort((left, right) => {
      const leftAnchor = floor.anchors[left.id] ?? floor.spawn;
      const rightAnchor = floor.anchors[right.id] ?? floor.spawn;
      return distance(leftAnchor, position) - distance(rightAnchor, position);
    })[0]?.id ?? graph.entryId;
}

function createDeadEndCaches(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  shortcut: GuidedShortcut | null,
): GuidedDeadEndCache[] {
  const occupied = new Set([
    positionKey(floor.spawn),
    ...campfires.map(positionKey),
    ...campfires.map((campfire) => positionKey(campfire.restPosition)),
    ...floor.gates.map(positionKey),
    ...(shortcut ? [
      positionKey(shortcut.entry),
      positionKey(shortcut.exit),
      positionKey(shortcut.keyPosition),
    ] : []),
  ]);
  const candidates: Position[] = [];
  for (let y = 1; y < floor.height - 1; y += 1) {
    for (let x = 1; x < floor.width - 1; x += 1) {
      const position = { x, y };
      if (
        isFloor(floor, position) &&
        !mazeZoneAt(floor, position) &&
        !occupied.has(positionKey(position)) &&
        floorNeighborCount(floor, position) === 1
      ) {
        candidates.push(position);
      }
    }
  }
  return candidates.map((position, index) => {
    const rewardId = CACHE_REWARDS[
      stableStringHash(`${graph.seed}:dead-end-cache:${position.x}:${position.y}`) %
        CACHE_REWARDS.length
    ];
    return {
      id: `guided-cache:${graph.floor}:${index + 1}`,
      ...position,
      sourceRoomId: nearestRoomId(graph, floor, position),
      rewardId,
    };
  });
}

export function generateGuidedMapPlan(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
): GuidedMapPlan {
  const keyRoomNodeId = chooseKeyRoom(graph);
  const keyPosition = chooseKeyPosition(
    graph,
    floor,
    campfires,
    keyRoomNodeId,
  );
  const shortcut = createShortcut(
    graph,
    floor,
    campfires,
    keyRoomNodeId,
    keyPosition,
  );
  return {
    version: GUIDED_MAP_VERSION,
    seed: graph.seed,
    floor: graph.floor,
    routeMarkers: createRouteMarkers(graph, floor, campfires, shortcut),
    deadEndCaches: createDeadEndCaches(graph, floor, campfires, shortcut),
    shortcuts: shortcut ? [shortcut] : [],
  };
}

export function cloneGuidedMapPlan(plan: GuidedMapPlan): GuidedMapPlan {
  return {
    ...plan,
    routeMarkers: plan.routeMarkers.map((marker) => ({ ...marker })),
    deadEndCaches: plan.deadEndCaches.map((cache) => ({ ...cache })),
    shortcuts: plan.shortcuts.map((shortcut) => ({
      ...shortcut,
      entry: { ...shortcut.entry },
      exit: { ...shortcut.exit },
      keyPosition: { ...shortcut.keyPosition },
      requires: [...shortcut.requires],
    })),
  };
}

export function nearbyShortcut(
  plan: GuidedMapPlan,
  position: Position,
): { shortcut: GuidedShortcut; side: "entry" | "exit" } | null {
  for (const shortcut of plan.shortcuts) {
    if (distance(shortcut.entry, position) <= 1) {
      return { shortcut, side: "entry" };
    }
    if (distance(shortcut.exit, position) <= 1) {
      return { shortcut, side: "exit" };
    }
  }
  return null;
}

export function shortcutDestination(
  shortcut: GuidedShortcut,
  side: "entry" | "exit",
): Position {
  return { ...(side === "entry" ? shortcut.exit : shortcut.entry) };
}

export function validateGuidedMapPlan(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  plan: GuidedMapPlan,
): GuidedMapValidation {
  const errors: string[] = [];
  if (
    plan.version !== GUIDED_MAP_VERSION ||
    plan.seed !== graph.seed ||
    plan.floor !== graph.floor
  ) {
    errors.push("引导地图版本、Seed 或楼层不匹配。");
  }
  if (plan.shortcuts.length !== 1) {
    errors.push("当前 MVP 每层必须生成 1 道钥匙捷径。");
  }
  plan.shortcuts.forEach((shortcut) => {
    if (
      !isFloor(floor, shortcut.entry) ||
      !isFloor(floor, shortcut.exit) ||
      !isFloor(floor, shortcut.keyPosition)
    ) {
      errors.push(`捷径 ${shortcut.id} 的端点或钥匙不可达。`);
    }
    if (shortcut.detourDistance < 17) {
      errors.push(`捷径 ${shortcut.id} 没有形成足够明显的折返缩减。`);
    }
    const keyRoom = graph.nodes.find((node) => node.id === shortcut.keyRoomNodeId);
    if (
      !keyRoom ||
      keyRoom.id === graph.entryId ||
      keyRoom.id === graph.bossId ||
      keyRoom.depth < 2
    ) {
      errors.push(`捷径 ${shortcut.id} 的钥匙没有放在中后段可达区域。`);
    }
  });

  const route = stitchedCourseRoute(graph, floor);
  const markerIndexes = plan.routeMarkers
    .map((marker) => marker.pathIndex)
    .filter((index) => index > 0 && index < route.length)
    .sort((left, right) => left - right);
  const gaps: number[] = [];
  let previous = 0;
  markerIndexes.forEach((index) => {
    gaps.push(index - previous);
    previous = index;
  });
  gaps.push(Math.max(0, route.length - 1 - previous));
  const maxMarkerGap = Math.max(0, ...gaps);
  if (plan.routeMarkers.some((marker) => !isFloor(floor, marker))) {
    errors.push("路线信标存在不可行走位置。");
  }
  if (maxMarkerGap > ROUTE_MARKER_SPACING + 4) {
    errors.push(`路线兴趣点最大间距 ${maxMarkerGap}，超过 18 格。`);
  }

  const cacheKeys = new Set(plan.deadEndCaches.map(positionKey));
  let emptyDeadEnds = 0;
  for (let y = 1; y < floor.height - 1; y += 1) {
    for (let x = 1; x < floor.width - 1; x += 1) {
      const position = { x, y };
      if (
        isFloor(floor, position) &&
        !mazeZoneAt(floor, position) &&
        floorNeighborCount(floor, position) === 1 &&
        !cacheKeys.has(positionKey(position))
      ) {
        emptyDeadEnds += 1;
      }
    }
  }
  if (emptyDeadEnds > 0) errors.push(`仍有 ${emptyDeadEnds} 个空死路。`);

  const campfireDistances = campfires.map((campfire) => distanceFromSpawn(floor, campfire));
  if (
    campfireDistances.some((value) => !Number.isFinite(value)) ||
    campfireDistances.some((value, index) => index > 0 && value < campfireDistances[index - 1])
  ) {
    errors.push("前、中、后篝火没有按探索距离分段。");
  }

  return {
    valid: errors.length === 0,
    errors,
    maxMarkerGap,
    emptyDeadEnds,
  };
}
