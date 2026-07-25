import { describe, expect, it } from "vitest";
import {
  LEGACY_MAZE_CHUNK_SIZE,
  LEGACY_MAZE_HEIGHT,
  LEGACY_MAZE_WIDTH,
  MAZE_CHUNK_SIZE,
  MAZE_HEIGHT,
  MAZE_WIDTH,
  generateMazeFloor,
  isMazeWalkable,
  mazeTileAt,
  type MazeFloor,
  type MazeZone,
} from "../src/domain/mazeGenerator";
import {
  reachableMazeCells,
  validateMazeFloor,
} from "../src/domain/mazeValidation";
import {
  generateRoomGraph,
  lessonsForFloor,
  type FloorNumber,
  type RoomGraph,
} from "../src/domain/runGraph";
import type { Position } from "../src/domain/types";

const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly FloorNumber[];
const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

function key(x: number, y: number): string {
  return `${x}:${y}`;
}

function walkingDistance(
  floor: MazeFloor,
  start: { x: number; y: number },
  target: { x: number; y: number },
  graph: RoomGraph,
  blocked: ReadonlySet<string> = new Set<string>(),
): number {
  const completed = new Set(lessonsForFloor(graph.floor));
  const pending = [{ ...start, distance: 0 }];
  const visited = new Set([key(start.x, start.y)]);
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) break;
    if (current.x === target.x && current.y === target.y) return current.distance;
    DIRECTIONS.forEach((direction) => {
      const x = current.x + direction.x;
      const y = current.y + direction.y;
      const cellKey = key(x, y);
      if (
        visited.has(cellKey) ||
        blocked.has(cellKey) ||
        !isMazeWalkable(floor, x, y, completed)
      ) return;
      visited.add(cellKey);
      pending.push({ x, y, distance: current.distance + 1 });
    });
  }
  return Number.POSITIVE_INFINITY;
}

function zoneApertures(
  floor: MazeFloor,
  zone: MazeZone,
): Array<{ gate: Position; outside: Position }> {
  return [
    {
      gate: { x: zone.center.x, y: zone.y },
      outside: { x: zone.center.x, y: zone.y - 1 },
    },
    {
      gate: { x: zone.center.x, y: zone.y + zone.height - 1 },
      outside: { x: zone.center.x, y: zone.y + zone.height },
    },
    {
      gate: { x: zone.x, y: zone.center.y },
      outside: { x: zone.x - 1, y: zone.center.y },
    },
    {
      gate: { x: zone.x + zone.width - 1, y: zone.center.y },
      outside: { x: zone.x + zone.width, y: zone.center.y },
    },
  ].filter(({ gate, outside }) => (
    mazeTileAt(floor, gate.x, gate.y) === "." &&
    mazeTileAt(floor, outside.x, outside.y) === "."
  ));
}

function asLegacyV4Floor(floor: MazeFloor): MazeFloor {
  const tiles = floor.tiles.map((row) => row.padEnd(LEGACY_MAZE_WIDTH, "#"));
  while (tiles.length < LEGACY_MAZE_HEIGHT) {
    tiles.push("#".repeat(LEGACY_MAZE_WIDTH));
  }
  return {
    ...floor,
    generatorVersion: 4,
    width: LEGACY_MAZE_WIDTH,
    height: LEGACY_MAZE_HEIGHT,
    chunkSize: LEGACY_MAZE_CHUNK_SIZE,
    tiles,
  };
}

describe("generateMazeFloor", () => {
  it("同 Seed 完全一致，不同 Seed 改变非关键路线拓扑", () => {
    const graph = generateRoomGraph("maze-repeatable");
    expect(generateMazeFloor(graph)).toEqual(generateMazeFloor(graph));
    expect(generateMazeFloor(graph).topologyHash).not.toBe(
      generateMazeFloor(generateRoomGraph("maze-different")).topologyHash,
    );
  });

  it("装饰密度不会改变课程拓扑", () => {
    const graph = generateRoomGraph("decor-isolated");
    const sparse = generateMazeFloor(graph, { decorDensity: 0.01 });
    const dense = generateMazeFloor(graph, { decorDensity: 0.15 });
    expect(sparse.tiles).toEqual(dense.tiles);
    expect(sparse.zones).toEqual(dense.zones);
    expect(sparse.gates).toEqual(dense.gates);
    expect(sparse.topologyHash).toBe(dense.topologyHash);
    expect(sparse.decorations.length).toBeLessThan(dense.decorations.length);
  });

  it("八层固定 Seed 都生成 48×36 v5 图并保持节点一一映射", () => {
    const topologyHashes = new Set<number>();
    FLOORS.forEach((floorNumber) => {
      const graph = generateRoomGraph("mvp2-eight-floors", floorNumber);
      const floor = generateMazeFloor(graph);
      expect(floor).toMatchObject({
        version: 4,
        generatorVersion: 5,
        width: MAZE_WIDTH,
        height: MAZE_HEIGHT,
        chunkSize: MAZE_CHUNK_SIZE,
      });
      expect(floor.zones.map((zone) => zone.roomNodeId)).toEqual(
        graph.nodes.map((node) => node.id),
      );
      expect(Object.keys(floor.anchors)).toEqual(graph.nodes.map((node) => node.id));
      expect(floor.zones).toHaveLength(floorNumber === 8 ? 11 : 10);
      topologyHashes.add(floor.topologyHash);
    });
    expect(topologyHashes.size).toBe(8);
  });

  it("八层 160 个 Seed 均满足课程可达、门锁不可绕过和环路不变量", () => {
    FLOORS.forEach((floorNumber) => {
      for (let index = 0; index < 20; index += 1) {
        const graph = generateRoomGraph(`maze-v5-${floorNumber}-${index}`, floorNumber);
        const floor = generateMazeFloor(graph);
        const validation = validateMazeFloor(floor, graph);
        expect(
          validation,
          `失败 Seed: maze-v5-${floorNumber}-${index}`,
        ).toMatchObject({ valid: true, errors: [] });
        expect(validation.reachableTiles).toBeGreaterThan(150);
        expect(validation.cycleRank).toBeGreaterThanOrEqual(6);
      }
    });
  }, 30_000);

  it("八层必修图边都可步行，关键相邻目标不超过 18 步", () => {
    const violations: string[] = [];
    FLOORS.forEach((floorNumber) => {
      const graph = generateRoomGraph("mvp2-critical-distance", floorNumber);
      const floor = generateMazeFloor(graph);
      const requiredIds = new Set(
        graph.nodes.filter((node) => node.required).map((node) => node.id),
      );
      graph.nodes.filter((node) => node.required).forEach((node) => {
        node.next.filter((nextId) => requiredIds.has(nextId)).forEach((nextId) => {
          const distance = walkingDistance(
            floor,
            floor.anchors[node.id],
            floor.anchors[nextId],
            graph,
          );
          if (distance > 18) {
            violations.push(
              `第 ${floorNumber} 层 ${node.id} → ${nextId}: ${distance}`,
            );
          }
        });
      });
    });
    expect(violations).toEqual([]);
  });

  it("八层课程房均有双入口，单个门外 Actor 不能围死课程怪物", () => {
    FLOORS.forEach((floorNumber) => {
      for (let seedIndex = 0; seedIndex < 5; seedIndex += 1) {
        const graph = generateRoomGraph(
          `mvp2-course-access-${seedIndex}`,
          floorNumber,
        );
        const floor = generateMazeFloor(graph);
        floor.zones.filter((zone) => zone.lessonId).forEach((zone) => {
          const apertures = zoneApertures(floor, zone);
          expect(
            apertures.length,
            `第 ${floorNumber} 层课程房 ${zone.roomNodeId} 入口不足`,
          ).toBeGreaterThanOrEqual(2);
          const goals = DIRECTIONS.map((direction) => ({
            x: zone.center.x + direction.x,
            y: zone.center.y + direction.y,
          })).filter((position) => mazeTileAt(floor, position.x, position.y) === ".");
          const blockerCells = new Map(
            apertures.flatMap(({ gate, outside }) => [gate, outside])
              .map((position) => [key(position.x, position.y), position]),
          ).values();
          [...blockerCells].forEach((blockedCell) => {
            const blocked = new Set([key(blockedCell.x, blockedCell.y)]);
            const reachable = goals.some((goal) => (
              walkingDistance(floor, floor.spawn, goal, graph, blocked) <
              Number.POSITIVE_INFINITY
            ));
            expect(
              reachable,
              `第 ${floorNumber} 层 Seed ${seedIndex} 的 ${zone.roomNodeId} ` +
              `被 ${key(blockedCell.x, blockedCell.y)} 围死`,
            ).toBe(true);
          });
        });
      }
    });
  }, 30_000);

  it("校验器同时接受旧 v4 形状和新 v5 形状", () => {
    const graph = generateRoomGraph("legacy-v4-compatible");
    const current = generateMazeFloor(graph);
    const legacy = asLegacyV4Floor(current);
    expect(validateMazeFloor(current, graph)).toMatchObject({ valid: true, errors: [] });
    expect(validateMazeFloor(legacy, graph)).toMatchObject({ valid: true, errors: [] });
    expect(reachableMazeCells(legacy, new Set(lessonsForFloor(1))).size).toBeGreaterThan(150);
  });
});
