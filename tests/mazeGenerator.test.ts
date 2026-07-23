import { describe, expect, it } from "vitest";
import { countMazeDeadEnds, generateMazeFloor } from "../src/domain/mazeGenerator";
import { validateMazeFloor } from "../src/domain/mazeValidation";
import { generateRoomGraph } from "../src/domain/runGraph";

describe("generateMazeFloor", () => {
  it("同 Seed 完全一致，不同 Seed 改变拓扑", () => {
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

  it("编织通道显著减少深度优先迷宫死路", () => {
    let originalDeadEnds = 0;
    let braidedDeadEnds = 0;
    for (let index = 0; index < 40; index += 1) {
      const graph = generateRoomGraph(`braid-${index}`);
      originalDeadEnds += countMazeDeadEnds(generateMazeFloor(graph, { braidRatio: 0 }));
      braidedDeadEnds += countMazeDeadEnds(generateMazeFloor(graph));
    }
    expect(braidedDeadEnds).toBeLessThan(originalDeadEnds * 0.5);
  }, 10_000);

  it("500 个 Seed 均满足课程可达、门锁不可绕过和环路不变量", () => {
    for (let index = 0; index < 500; index += 1) {
      const graph = generateRoomGraph(`maze-invariant-${index}`);
      const validation = validateMazeFloor(generateMazeFloor(graph), graph);
      expect(validation, `失败 Seed: maze-invariant-${index}`).toMatchObject({ valid: true, errors: [] });
      expect(validation.reachableTiles).toBeGreaterThan(500);
      expect(validation.cycleRank).toBeGreaterThanOrEqual(6);
    }
  }, 60_000);

  it("第二层 100 个 Seed 均生成不同主题布局并通过拓扑校验", () => {
    for (let index = 0; index < 100; index += 1) {
      const firstGraph = generateRoomGraph(`floor-two-${index}`);
      const secondGraph = generateRoomGraph(`floor-two-${index}`, 2);
      const firstFloor = generateMazeFloor(firstGraph);
      const secondFloor = generateMazeFloor(secondGraph);
      const validation = validateMazeFloor(secondFloor, secondGraph);
      expect(validation, `失败 Seed: floor-two-${index}`).toMatchObject({
        valid: true,
        errors: [],
      });
      expect(secondFloor).toMatchObject({ version: 4, width: 64, height: 48 });
      expect(secondFloor.zones.map(({ x, y }) => `${x}:${y}`)).not.toEqual(
        firstFloor.zones.map(({ x, y }) => `${x}:${y}`),
      );
    }
  }, 30_000);
});
