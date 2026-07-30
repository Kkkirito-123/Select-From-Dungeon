import type { LessonId, Position } from "./types";
import {
  LEGACY_MAZE_CHUNK_SIZE,
  LEGACY_MAZE_HEIGHT,
  LEGACY_MAZE_WIDTH,
  MAZE_CHUNK_SIZE,
  MAZE_HEIGHT,
  MAZE_WIDTH,
  isMazeWalkable,
  mazeTileAt,
  type MazeFloor,
} from "./mazeGenerator";
import { lessonsForFloor, type RoomGraph } from "./runGraph";

export interface MazeValidationResult {
  valid: boolean;
  errors: string[];
  reachableTiles: number;
  cycleRank: number;
}

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

function key(position: Position): string {
  return `${position.x}:${position.y}`;
}

export function reachableMazeCells(
  floor: MazeFloor,
  completedLessons: ReadonlySet<LessonId>,
  openedGateIds: ReadonlySet<string> = new Set<string>(),
  canTraverseStep: (from: Position, to: Position) => boolean = () => true,
): Set<string> {
  if (!isMazeWalkable(
    floor,
    floor.spawn.x,
    floor.spawn.y,
    completedLessons,
    openedGateIds,
  )) return new Set();
  const visited = new Set<string>([key(floor.spawn)]);
  const pending: Position[] = [{ ...floor.spawn }];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) break;
    DIRECTIONS.forEach((direction) => {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next);
      if (
        !visited.has(nextKey) &&
        canTraverseStep(current, next) &&
        isMazeWalkable(floor, next.x, next.y, completedLessons, openedGateIds)
      ) {
        visited.add(nextKey);
        pending.push(next);
      }
    });
  }
  return visited;
}

function computeCycleRank(floor: MazeFloor): number {
  let vertices = 0;
  let edges = 0;
  for (let y = 0; y < floor.height; y += 1) {
    for (let x = 0; x < floor.width; x += 1) {
      if (mazeTileAt(floor, x, y) !== ".") continue;
      vertices += 1;
      if (mazeTileAt(floor, x + 1, y) === ".") edges += 1;
      if (mazeTileAt(floor, x, y + 1) === ".") edges += 1;
    }
  }
  return Math.max(0, edges - vertices + 1);
}

export function validateMazeFloor(floor: MazeFloor, graph: RoomGraph): MazeValidationResult {
  const errors: string[] = [];
  if (
    floor.version !== 4 ||
    (floor.generatorVersion !== 4 && floor.generatorVersion !== 5)
  ) {
    errors.push("迷宫结构版本必须是 v4，生成器版本必须是 v4 或 v5。");
  }
  const expectedDimensions = floor.generatorVersion === 4
    ? {
        width: LEGACY_MAZE_WIDTH,
        height: LEGACY_MAZE_HEIGHT,
        chunkSize: LEGACY_MAZE_CHUNK_SIZE,
      }
    : {
        width: MAZE_WIDTH,
        height: MAZE_HEIGHT,
        chunkSize: MAZE_CHUNK_SIZE,
      };
  if (
    floor.width !== expectedDimensions.width ||
    floor.height !== expectedDimensions.height ||
    floor.chunkSize !== expectedDimensions.chunkSize ||
    floor.tiles.length !== floor.height
  ) {
    errors.push(
      `生成器 v${floor.generatorVersion} 迷宫尺寸必须是 ` +
      `${expectedDimensions.width}×${expectedDimensions.height}，分块必须是 ` +
      `${expectedDimensions.chunkSize}。`,
    );
  }
  if (floor.tiles.some((row) => row.length !== floor.width || /[^#.]/.test(row))) {
    errors.push("迷宫地砖形状或字符无效。");
  }
  if (mazeTileAt(floor, floor.spawn.x, floor.spawn.y) !== ".") {
    errors.push("玩家出生点不可行走。");
  }
  if (floor.zones.length !== graph.nodes.length || floor.gates.length !== graph.nodes.length) {
    errors.push("逻辑房、物理区域与单入口门数量不一致。");
  }

  const floorLessons = lessonsForFloor(graph.floor);
  const allLessons = new Set<LessonId>(floorLessons);
  const allReachable = reachableMazeCells(floor, allLessons);
  graph.nodes.forEach((node) => {
    const anchor = floor.anchors[node.id];
    const zone = floor.zones.find((entry) => entry.roomNodeId === node.id);
    const gate = floor.gates.find((entry) => entry.roomNodeId === node.id);
    if (!anchor || !zone || !gate) {
      errors.push(`缺少房间 ${node.id} 的锚点、区域或门。`);
      return;
    }
    if (!allReachable.has(key(anchor))) {
      errors.push(`全部解锁后仍无法到达 ${node.id}。`);
    }
    if (gate.requires.join("|") !== node.prerequisiteLessons.join("|")) {
      errors.push(`房间 ${node.id} 的物理门锁与课程依赖不一致。`);
    }

    for (const required of node.prerequisiteLessons) {
      const missingOne = new Set(allLessons);
      missingOne.delete(required);
      if (reachableMazeCells(floor, missingOne).has(key(anchor))) {
        errors.push(`缺少 ${required} 时仍可绕过门进入 ${node.id}。`);
      }
    }
  });

  const noLessons = reachableMazeCells(floor, new Set<LessonId>());
  const tutorial = graph.nodes.find((node) => node.lessonId === floorLessons[0]);
  if (tutorial && !noLessons.has(key(floor.anchors[tutorial.id]))) {
    errors.push("全新 Run 无法到达 SELECT 教学区。");
  }
  if (graph.floor === 1) {
    const whereRoom = graph.nodes.find((node) => node.lessonId === "where");
    const nullRoom = graph.nodes.find((node) => node.lessonId === "is-null");
    const selectOnly = reachableMazeCells(floor, new Set<LessonId>(["select"]));
    if (whereRoom && !selectOnly.has(key(floor.anchors[whereRoom.id]))) {
      errors.push("完成 SELECT 后无法自由到达 WHERE。");
    }
    if (nullRoom && !selectOnly.has(key(floor.anchors[nullRoom.id]))) {
      errors.push("完成 SELECT 后无法自由到达 IS NULL。");
    }
  }

  const cycleRank = computeCycleRank(floor);
  if (cycleRank < 6) errors.push("迷宫环路不足，容易退化为单一路径。");

  return {
    valid: errors.length === 0,
    errors,
    reachableTiles: allReachable.size,
    cycleRank,
  };
}
