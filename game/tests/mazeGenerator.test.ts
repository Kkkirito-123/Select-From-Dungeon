import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAZE_CHUNK_SIZE,
  MAZE_HEIGHT,
  MAZE_WIDTH,
  generateMazeFloor,
  isMazeWalkable,
  mazeTileAt,
  type MazeFloor,
  type MazeZone,
} from "../src/domain/exploration/mazeGenerator";
import {
  validateMazeFloor,
} from "../src/domain/exploration/mazeValidation";
import {
  generateRoomGraph,
  lessonsForFloor,
  type FloorNumber,
  type RoomGraph,
} from "../src/domain/progression/runGraph";
import type { Position } from "../src/domain/shared/types";

const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly FloorNumber[];
const CANONICAL_FINGERPRINTS = [
  "5a9ccf24f805fbbdcef388c6760285164e2d83a0a480c1e2addac2985ac3b78e",
  "a7513cd40c8455e15d1ac600a9e2715c88f4d3c626d85faa518e6a0030ef0f2a",
  "12abb40295b919d2a5c79c825422c10c1006e7bec86d32def131004f981caf93",
  "178870ffa4b5b0700162307d4b290ca79493af2beeef367de5083286d9796106",
  "162da6b3a6fa345d74707fd70cb7eac9c06a6639b61be8c5c6c0ce21bf99a155",
  "a0331f669e5e2fd44ad3963e9af3d9ea2af8655abcff8e7165f85a22e0811649",
  "8445996296ca64be8ab08a2c861cef6b16ac6dbc8115bf1651116b71d2c19b14",
  "ab28e5630c8d8d63381a6ecbd69272198cd5f3ff57979e6217a6b1e0bc6d6f7a",
] as const;
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

  it("八层固定 Seed 都生成 56×42 v7 图并把课程房分散到全图", () => {
    const topologyHashes = new Set<number>();
    FLOORS.forEach((floorNumber) => {
      const graph = generateRoomGraph("mvp2-eight-floors", floorNumber);
      const floor = generateMazeFloor(graph);
      expect(floor).toMatchObject({
        version: 4,
        generatorVersion: 7,
        width: MAZE_WIDTH,
        height: MAZE_HEIGHT,
        chunkSize: MAZE_CHUNK_SIZE,
      });
      expect(floor.zones.map((zone) => zone.roomNodeId)).toEqual(
        graph.nodes.map((node) => node.id),
      );
      expect(Object.keys(floor.anchors)).toEqual(graph.nodes.map((node) => node.id));
      expect(floor.zones).toHaveLength(floorNumber === 8 ? 11 : 10);
      const minX = Math.min(...floor.zones.map((zone) => zone.x));
      const maxX = Math.max(...floor.zones.map((zone) => zone.x + zone.width - 1));
      const minY = Math.min(...floor.zones.map((zone) => zone.y));
      const maxY = Math.max(...floor.zones.map((zone) => zone.y + zone.height - 1));
      expect((maxX - minX + 1) / floor.width).toBeGreaterThanOrEqual(0.7);
      expect((maxY - minY + 1) / floor.height).toBeGreaterThanOrEqual(0.7);
      topologyHashes.add(floor.topologyHash);
    });
    expect(topologyHashes.size).toBe(8);
  });

  it("canonical Seed 的八层完整地图指纹保持稳定", () => {
    const fingerprints = FLOORS.map((floorNumber) => {
      const graph = generateRoomGraph("mvp2-eight-floors", floorNumber);
      return createHash("sha256")
        .update(JSON.stringify(generateMazeFloor(graph)))
        .digest("hex");
    });
    expect(fingerprints).toEqual(CANONICAL_FINGERPRINTS);
  });

  it("八层 160 个 Seed 均满足课程可达、门锁不可绕过和环路不变量", () => {
    FLOORS.forEach((floorNumber) => {
      for (let index = 0; index < 20; index += 1) {
        const graph = generateRoomGraph(`maze-v7-${floorNumber}-${index}`, floorNumber);
        const floor = generateMazeFloor(graph);
        const validation = validateMazeFloor(floor, graph);
        expect(
          validation,
          `失败 Seed: maze-v7-${floorNumber}-${index}`,
        ).toMatchObject({ valid: true, errors: [] });
        expect(validation.reachableTiles).toBeGreaterThan(150);
        expect(validation.cycleRank).toBeGreaterThanOrEqual(6);
        let maximumDistanceFromContent = 0;
        for (let y = 1; y < floor.height - 1; y += 1) {
          for (let x = 1; x < floor.width - 1; x += 1) {
            if (mazeTileAt(floor, x, y) !== ".") continue;
            const distance = Math.min(...floor.zones.map((zone) => {
              const dx = x < zone.x
                ? zone.x - x
                : x >= zone.x + zone.width
                  ? x - (zone.x + zone.width - 1)
                  : 0;
              const dy = y < zone.y
                ? zone.y - y
                : y >= zone.y + zone.height
                  ? y - (zone.y + zone.height - 1)
                  : 0;
              return dx + dy;
            }));
            maximumDistanceFromContent = Math.max(maximumDistanceFromContent, distance);
          }
        }
        expect(
          maximumDistanceFromContent,
          `Seed ${graph.seed} 仍存在远离内容的外围迷宫`,
        ).toBeLessThanOrEqual(12);
      }
    });
  }, 30_000);

  it("八层必修图边都可步行，关键相邻目标推荐距离不超过 35 步", () => {
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
          if (distance > 35) {
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

  it("校验器只接受当前 v7 形状", () => {
    const graph = generateRoomGraph("current-v7-only");
    const current = generateMazeFloor(graph);
    expect(validateMazeFloor(current, graph)).toMatchObject({ valid: true, errors: [] });
    const oldVersion = { ...current, generatorVersion: 6 } as unknown as MazeFloor;
    expect(validateMazeFloor(oldVersion, graph).valid).toBe(false);
  });
});
