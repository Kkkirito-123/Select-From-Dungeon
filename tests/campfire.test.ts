import { describe, expect, it } from "vitest";
import {
  CAMPFIRE_SAFE_RADIUS,
  campfireSafeCellKeys,
  generateCampfires,
  isSafeZonePosition,
  nearbyCampfire,
  safeZoneCellKeys,
  spawnSafeCellKeys,
} from "../src/domain/campfire";
import { generateMazeFloor, mazeTileAt } from "../src/domain/mazeGenerator";
import { generateRoomGraph, type FloorNumber } from "../src/domain/runGraph";

describe("campfire generation", () => {
  it.each([1, 2] as const)("第 %i 层固定生成前、中、后三个互异篝火", (floorNumber) => {
    for (let index = 0; index < 20; index += 1) {
      const seed = `campfire-contract:${floorNumber}:${index}`;
      const graph = generateRoomGraph(seed, floorNumber);
      const floor = generateMazeFloor(graph);
      const campfires = generateCampfires(graph, floor);

      expect(campfires).toHaveLength(3);
      expect(campfires.map((campfire) => campfire.phase)).toEqual([
        "front",
        "middle",
        "rear",
      ]);
      expect(campfires.map((campfire) => campfire.id)).toEqual([
        `campfire:${floorNumber}:front`,
        `campfire:${floorNumber}:middle`,
        `campfire:${floorNumber}:rear`,
      ]);
      expect(new Set(campfires.map((campfire) => campfire.roomNodeId)).size).toBe(3);
      expect(
        graph.nodes.find((room) => room.id === campfires[0].roomNodeId)?.type,
      ).toBe("rest");

      campfires.forEach((campfire) => {
        expect(graph.nodes.some((room) => room.id === campfire.roomNodeId)).toBe(true);
        expect(mazeTileAt(floor, campfire.x, campfire.y)).toBe(".");
        expect(mazeTileAt(
          floor,
          campfire.restPosition.x,
          campfire.restPosition.y,
        )).toBe(".");
        expect(
          Math.abs(campfire.x - campfire.restPosition.x) +
          Math.abs(campfire.y - campfire.restPosition.y),
        ).toBe(1);
      });
    }
  }, 15_000);

  it.each([1, 2] as const)("第 %i 层同一 seed 的篝火位置和休息点可重入", (floorNumber) => {
    const graph = generateRoomGraph(`campfire-stable:${floorNumber}`, floorNumber);
    const firstFloor = generateMazeFloor(graph);
    const secondFloor = generateMazeFloor(graph);

    expect(generateCampfires(graph, firstFloor)).toEqual(
      generateCampfires(graph, secondFloor),
    );
  }, 15_000);

  it("出生区域与篝火半径共同组成安全区，且相邻休息点能定位篝火", () => {
    const graph = generateRoomGraph("campfire-safe-zone");
    const floor = generateMazeFloor(graph);
    const campfires = generateCampfires(graph, floor);
    const campfireCells = campfireSafeCellKeys(floor, campfires);
    const spawnCells = spawnSafeCellKeys(floor);
    const allSafeCells = safeZoneCellKeys(floor, campfires);

    expect(CAMPFIRE_SAFE_RADIUS).toBe(2);
    expect(spawnCells.has(`${floor.spawn.x}:${floor.spawn.y}`)).toBe(true);
    expect(isSafeZonePosition(floor, campfires, floor.spawn)).toBe(true);

    campfires.forEach((campfire) => {
      const campfireKey = `${campfire.x}:${campfire.y}`;
      const restKey = `${campfire.restPosition.x}:${campfire.restPosition.y}`;
      expect(campfireCells.has(campfireKey)).toBe(true);
      expect(campfireCells.has(restKey)).toBe(true);
      expect(allSafeCells.has(campfireKey)).toBe(true);
      expect(allSafeCells.has(restKey)).toBe(true);
      expect(nearbyCampfire(campfires, campfire.restPosition)?.id).toBe(campfire.id);
    });

    expect([...spawnCells].every((key) => allSafeCells.has(key))).toBe(true);
    expect([...campfireCells].every((key) => allSafeCells.has(key))).toBe(true);
  });

  it("两层篝火契约都使用对应楼层，不混用房间引用", () => {
    ([1, 2] as const satisfies readonly FloorNumber[]).forEach((floorNumber) => {
      const graph = generateRoomGraph("floor-reference", floorNumber);
      const floor = generateMazeFloor(graph);
      generateCampfires(graph, floor).forEach((campfire) => {
        expect(campfire.id).toContain(`:${floorNumber}:`);
        expect(campfire.roomNodeId).toContain(`floor-${floorNumber}-`);
      });
    });
  });
});
