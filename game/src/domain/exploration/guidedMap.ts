/**
 * 主线路线、死路补给和实体捷径的确定性规划。
 *
 * 规划依赖地图、房间和篝火，只生成导航证据与可交互位置；它不能传送
 * 玩家、跳过课程门，也不负责更新 openedGateIds。
 */
import { NAVIGATION_RUNTIME_CONFIG } from "../../contracts/config/runtime";
import { mazeTileAt, mazeZoneAt, type MazeFloor } from "./mazeGenerator";
import { findGridPath } from "./pathfinding";
import {
  lessonsForFloor,
  stableStringHash,
  type RoomGraph,
  type RoomReward,
} from "../progression/runGraph";
import type {
  Campfire,
  CampfirePhase,
  LessonId,
  Position,
} from "../shared/types";

export const GUIDED_MAP_VERSION = 1 as const;
export const ROUTE_MARKER_SPACING = NAVIGATION_RUNTIME_CONFIG.routeMarkerSpacing;

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

const SHORTCUT_NAMES: Readonly<Record<RoomGraph["floor"], string>> = {
  1: "排水回廊捷径",
  2: "月潮船闸捷径",
  3: "王陵侧门捷径",
  4: "升炉检修梯",
  5: "城墙吊桥捷径",
  6: "龙脊矿道捷径",
  7: "根系晶门捷径",
  8: "王座侍从门",
};

export function shortcutNameForFloor(floor: RoomGraph["floor"]): string {
  return SHORTCUT_NAMES[floor];
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
  if (floor.gates.some((gate) => distance(gate, position) <= 3)) return false;
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
  const minimumDetour = 12;
  // 捷径必须服务主课程路线；钥匙所在的可选房间可能离出生点很近，
  // 不能再拿“出生点 → 钥匙”这段短路来决定水闸是否存在。
  const route = stitchedCourseRoute(graph, floor);
  if (route.length < minimumDetour + 6) return null;
  const preferredEntryIndex = graph.floor === 1
    ? Math.min(route.length - 3, 6)
    : Math.max(3, Math.floor(route.length * 0.16));
  const preferredExitIndex = Math.min(
    route.length - 3,
    Math.floor(route.length * 0.84),
  );
  const preferredEntry = nearestEligiblePathCell(
    route,
    preferredEntryIndex,
    floor,
    campfires,
  );
  const preferredExit = nearestEligiblePathCell(
    route,
    preferredExitIndex,
    floor,
    campfires,
  );
  let entry = preferredEntry;
  let exit = preferredExit;
  let detour = entry && exit && positionKey(entry) !== positionKey(exit)
    ? pathBetween(floor, entry, exit)
    : [];

  // 某些复合楼层会让 16% / 84% 两点在空间上意外靠近。此时在课程
  // 前、后段中寻找真正能缩短折返的端点，而不是让整个 Seed 丢掉捷径。
  if (detour.length < minimumDetour) {
    const candidates = route
      .map((position, index) => ({ position, index }))
      .filter(({ position }) => (
        isShortcutEndpointCandidate(floor, campfires, position)
      ));
    const early = candidates.filter(({ index }) => (
      index <= Math.max(preferredEntryIndex + 10, Math.floor(route.length * 0.4))
    ));
    const late = candidates.filter(({ index }) => (
      index >= Math.min(preferredExitIndex - 10, Math.ceil(route.length * 0.6))
    ));
    let best: {
      entry: Position;
      exit: Position;
      detour: Position[];
      score: number;
    } | null = null;
    for (const left of early) {
      for (const right of late) {
        if (
          left.index >= right.index ||
          positionKey(left.position) === positionKey(right.position)
        ) continue;
        const candidateDetour = pathBetween(floor, left.position, right.position);
        if (candidateDetour.length < minimumDetour) continue;
        const score =
          candidateDetour.length * 100 -
          Math.abs(left.index - preferredEntryIndex) * 3 -
          Math.abs(right.index - preferredExitIndex);
        if (!best || score > best.score) {
          best = {
            entry: { ...left.position },
            exit: { ...right.position },
            detour: candidateDetour,
            score,
          };
        }
      }
    }
    entry = best?.entry ?? null;
    exit = best?.exit ?? null;
    detour = best?.detour ?? [];
  }
  if (!entry || !exit || detour.length < minimumDetour) return null;
  const keyRoom = graph.nodes.find((node) => node.id === keyRoomNodeId);
  return {
    id: `shortcut:${graph.floor}:return`,
    keyId: `shortcut-key:${graph.floor}`,
    name: shortcutNameForFloor(graph.floor),
    entry,
    exit,
    keyPosition: { ...keyPosition },
    keyRoomNodeId,
    requires: [...(keyRoom?.prerequisiteLessons ?? [])],
    detourDistance: detour.length - 1,
  };
}

function chooseRegionalKeyRoom(
  graph: RoomGraph,
  progress: number,
  excluded: ReadonlySet<string>,
): string {
  const candidates = graph.nodes.filter((node) => (
    node.id !== graph.entryId &&
    node.id !== graph.bossId &&
    node.depth >= 2 &&
    !excluded.has(node.id)
  ));
  const maximumDepth = Math.max(1, ...graph.nodes.map((node) => node.depth));
  return candidates.sort((left, right) => (
    Math.abs(left.depth / maximumDepth - progress) -
      Math.abs(right.depth / maximumDepth - progress) ||
    stableStringHash(`${graph.seed}:regional-key:${left.id}`) -
      stableStringHash(`${graph.seed}:regional-key:${right.id}`)
  ))[0]?.id ?? chooseKeyRoom(graph);
}

function createRegionalShortcut(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  route: readonly Position[],
  region: "middle" | "rear",
  entryProgress: number,
  exitProgress: number,
  keyRoomNodeId: string,
): GuidedShortcut | null {
  const minimumDetour = 12;
  const progressPairs = [
    [Math.max(0.04, entryProgress - 0.16), Math.min(0.97, exitProgress + 0.16)],
    [entryProgress, exitProgress],
    [Math.max(0.04, entryProgress - 0.16), exitProgress],
    [entryProgress, Math.min(0.97, exitProgress + 0.16)],
  ] as const;
  let selected: { entry: Position; exit: Position; detour: Position[] } | null = null;
  for (const [fromProgress, toProgress] of progressPairs) {
    const entry = nearestEligiblePathCell(
      route,
      Math.floor((route.length - 1) * fromProgress),
      floor,
      campfires,
    );
    const exit = nearestEligiblePathCell(
      route,
      Math.floor((route.length - 1) * toProgress),
      floor,
      campfires,
    );
    if (!entry || !exit || positionKey(entry) === positionKey(exit)) continue;
    const detour = pathBetween(floor, entry, exit);
    if (detour.length >= minimumDetour) {
      selected = { entry, exit, detour };
      break;
    }
  }
  if (!selected) {
    const expectedEntry = Math.floor((route.length - 1) * entryProgress);
    const expectedExit = Math.floor((route.length - 1) * exitProgress);
    const eligible = route
      .map((position, index) => ({ position, index }))
      .filter(({ position }) => isShortcutEndpointCandidate(floor, campfires, position));
    let best: {
      entry: Position;
      exit: Position;
      detour: Position[];
      score: number;
    } | null = null;
    for (const from of eligible) {
      for (const to of eligible) {
        if (
          from.index >= to.index ||
          positionKey(from.position) === positionKey(to.position)
        ) continue;
        const detour = pathBetween(floor, from.position, to.position);
        if (detour.length < minimumDetour) continue;
        const score =
          Math.abs(from.index - expectedEntry) * 2 +
          Math.abs(to.index - expectedExit);
        if (!best || score < best.score) {
          best = {
            entry: { ...from.position },
            exit: { ...to.position },
            detour,
            score,
          };
        }
      }
    }
    selected = best;
  }
  if (!selected) return null;
  const keyRoom = graph.nodes.find((node) => node.id === keyRoomNodeId);
  const regionLabel = region === "middle" ? "中段" : "后段";
  return {
    id: `shortcut:${graph.floor}:${region}`,
    keyId: `shortcut-key:${graph.floor}:${region}`,
    name: `${shortcutNameForFloor(graph.floor)}·${regionLabel}`,
    entry: selected.entry,
    exit: selected.exit,
    keyPosition: chooseKeyPosition(graph, floor, campfires, keyRoomNodeId),
    keyRoomNodeId,
    requires: [...(keyRoom?.prerequisiteLessons ?? [])],
    detourDistance: selected.detour.length - 1,
  };
}

function createShortcuts(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
): GuidedShortcut[] {
  const primaryKeyRoom = chooseKeyRoom(graph);
  const primary = createShortcut(
    graph,
    floor,
    campfires,
    primaryKeyRoom,
    chooseKeyPosition(graph, floor, campfires, primaryKeyRoom),
  );
  const route = stitchedCourseRoute(graph, floor);
  const excluded = new Set(primary ? [primary.keyRoomNodeId] : []);
  const middleKeyRoom = chooseRegionalKeyRoom(graph, 0.5, excluded);
  excluded.add(middleKeyRoom);
  const rearKeyRoom = chooseRegionalKeyRoom(graph, 0.75, excluded);
  const middle = createRegionalShortcut(
    graph,
    floor,
    campfires,
    route,
    "middle",
    0.24,
    0.52,
    middleKeyRoom,
  );
  const rear = createRegionalShortcut(
    graph,
    floor,
    campfires,
    route,
    "rear",
    0.58,
    0.9,
    rearKeyRoom,
  );
  return [primary, middle, rear]
    .filter((shortcut): shortcut is GuidedShortcut => shortcut !== null);
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
  shortcuts: readonly GuidedShortcut[],
): GuidedRouteMarker[] {
  const route = stitchedCourseRoute(graph, floor);
  const occupied = new Set([
    ...campfires.map(positionKey),
    ...floor.gates.map(positionKey),
    ...shortcuts.flatMap((shortcut) => [
      positionKey(shortcut.entry),
      positionKey(shortcut.exit),
    ]),
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
  shortcuts: readonly GuidedShortcut[],
): GuidedDeadEndCache[] {
  const occupied = new Set([
    positionKey(floor.spawn),
    ...campfires.map(positionKey),
    ...campfires.map((campfire) => positionKey(campfire.restPosition)),
    ...floor.gates.map(positionKey),
    ...shortcuts.flatMap((shortcut) => [
      positionKey(shortcut.entry),
      positionKey(shortcut.exit),
      positionKey(shortcut.keyPosition),
    ]),
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
  const shortcuts = createShortcuts(graph, floor, campfires);
  return {
    version: GUIDED_MAP_VERSION,
    seed: graph.seed,
    floor: graph.floor,
    routeMarkers: createRouteMarkers(graph, floor, campfires, shortcuts),
    deadEndCaches: createDeadEndCaches(graph, floor, campfires, shortcuts),
    shortcuts,
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
  if (plan.shortcuts.length !== 3) {
    errors.push("每层三个探索区域必须各生成 1 道钥匙捷径。");
  }
  if (
    new Set(plan.shortcuts.map((shortcut) => shortcut.id)).size !== plan.shortcuts.length ||
    new Set(plan.shortcuts.map((shortcut) => shortcut.keyId)).size !== plan.shortcuts.length ||
    new Set(plan.shortcuts.map((shortcut) => shortcut.keyRoomNodeId)).size !== plan.shortcuts.length
  ) errors.push("区域捷径的 ID、钥匙或钥匙房间发生重复。");
  plan.shortcuts.forEach((shortcut) => {
    if (
      !isFloor(floor, shortcut.entry) ||
      !isFloor(floor, shortcut.exit) ||
      !isFloor(floor, shortcut.keyPosition)
    ) {
      errors.push(`捷径 ${shortcut.id} 的端点或钥匙不可达。`);
    }
    const minimumDetourDistance = 11;
    if (shortcut.detourDistance < minimumDetourDistance) {
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
