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
import { findGridPath } from "../src/domain/pathfinding";
import { generateRoomGraph, type FloorNumber } from "../src/domain/runGraph";

const GENERATED_SEED_SAMPLES = 8;

describe("campfire generation", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8] as const)(
    "第 %i 层固定生成中、后两个互异篝火，出生点单独承担前段安全锚点",
    (floorNumber) => {
    for (let index = 0; index < GENERATED_SEED_SAMPLES; index += 1) {
      const seed = `campfire-contract:${floorNumber}:${index}`;
      const graph = generateRoomGraph(seed, floorNumber);
      const floor = generateMazeFloor(graph);
      const campfires = generateCampfires(graph, floor);

      expect(campfires).toHaveLength(2);
      expect(campfires.map((campfire) => campfire.phase)).toEqual([
        "middle",
        "rear",
      ]);
      expect(campfires.map((campfire) => campfire.id)).toEqual([
        `campfire:${floorNumber}:middle`,
        `campfire:${floorNumber}:rear`,
      ]);
      expect(new Set(campfires.map((campfire) => campfire.roomNodeId)).size).toBe(2);
      const distances = campfires.map((campfire) => (
        findGridPath(
          floor.spawn,
          campfire,
          (x, y) => mazeTileAt(floor, x, y) === ".",
        ).length
      ));
      expect(distances).toEqual([...distances].sort((left, right) => left - right));

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
  }, 30_000);

  it.each([1, 2, 3, 4, 5, 6, 7, 8] as const)(
    "第 %i 层篝火安全圈不会覆盖课程怪物出生点",
    (floorNumber) => {
      for (let index = 0; index < GENERATED_SEED_SAMPLES; index += 1) {
        const seed = `campfire-lesson-clearance:${floorNumber}:${index}`;
        const graph = generateRoomGraph(seed, floorNumber);
        const floor = generateMazeFloor(graph);
        const campfires = generateCampfires(graph, floor);
        const safeCells = campfireSafeCellKeys(floor, campfires);
        const lessonAnchors = graph.nodes
          .filter((room) => room.lessonId)
          .map((room) => floor.anchors[room.id])
          .filter((position) => position !== undefined);

        lessonAnchors.forEach((position) => {
          expect(
            safeCells.has(`${position.x}:${position.y}`),
            `seed=${seed} 的课程锚点 ${position.x}:${position.y} 被篝火安全圈覆盖`,
          ).toBe(false);
        });
      }
    },
    30_000,
  );

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
