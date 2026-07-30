import { describe, expect, it } from "vitest";
import { generateCampfires, safeZoneCellKeys } from "../src/domain/campfire";
import {
  FLOOR_ONE_HAZARD_COUNT,
  FLOOR_ONE_LABYRINTH_SIGHT_RADIUS,
  FLOOR_ONE_LEFT_SAFE_ROOM_ID,
  FLOOR_ONE_RIGHT_SAFE_ROOM_ID,
  crossesIntoFloorOneLabyrinth,
  floorOneAreaAt,
  floorOneCurrentSightCellKeys,
  generateFloorOneHazards,
} from "../src/domain/floorOneLabyrinth";
import { GameSession } from "../src/domain/GameSession";
import { generateGuidedMapPlan } from "../src/domain/guidedMap";
import {
  generateMazeFloor,
  mazeTileAt,
  type MazeFloor,
} from "../src/domain/mazeGenerator";
import { generateRoomGraph } from "../src/domain/runGraph";
import type { Position } from "../src/domain/types";

const DIRECTIONS: readonly Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function key(position: Position): string {
  return `${position.x}:${position.y}`;
}

function firstSafeExit(floor: MazeFloor): { from: Position; to: Position } {
  for (let y = 1; y < floor.height - 1; y += 1) {
    for (let x = 1; x < floor.width - 1; x += 1) {
      const from = { x, y };
      if (
        floorOneAreaAt(floor, from) !== "left-safe" ||
        mazeTileAt(floor, x, y) !== "."
      ) continue;
      const to = DIRECTIONS
        .map((direction) => ({ x: x + direction.x, y: y + direction.y }))
        .find((position) => (
          mazeTileAt(floor, position.x, position.y) === "." &&
          crossesIntoFloorOneLabyrinth(floor, from, position)
        ));
      if (to) return { from, to };
    }
  }
  throw new Error("第一层左安全区没有通往迷宫的可行走边界。");
}

describe("第一层双岸失名迷宫", () => {
  it("左右安全区固定，两个篝火分别属于出生书房和登记前哨", () => {
    const graph = generateRoomGraph("f1-three-zone", 1);
    const floor = generateMazeFloor(graph);
    const campfires = generateCampfires(graph, floor);
    expect(campfires.map((campfire) => campfire.roomNodeId)).toEqual([
      FLOOR_ONE_LEFT_SAFE_ROOM_ID,
      FLOOR_ONE_RIGHT_SAFE_ROOM_ID,
    ]);

    const safeCells = safeZoneCellKeys(floor, campfires);
    [FLOOR_ONE_LEFT_SAFE_ROOM_ID, FLOOR_ONE_RIGHT_SAFE_ROOM_ID].forEach((roomId) => {
      const zone = floor.zones.find((entry) => entry.roomNodeId === roomId)!;
      expect(safeCells.has(key(zone.center))).toBe(true);
    });
  });

  it("相同 Seed 生成相同的两枚迷宫陷阱，且远离安全区与课程房", () => {
    for (let index = 0; index < 20; index += 1) {
      const graph = generateRoomGraph(`f1-hazard:${index}`, 1);
      const floor = generateMazeFloor(graph);
      const campfires = generateCampfires(graph, floor);
      const guidedMap = generateGuidedMapPlan(graph, floor, campfires);
      const first = generateFloorOneHazards(floor, campfires, guidedMap);
      const second = generateFloorOneHazards(floor, campfires, guidedMap);
      expect(first).toEqual(second);
      expect(first).toHaveLength(FLOOR_ONE_HAZARD_COUNT);
      first.forEach((hazard) => {
        expect(floorOneAreaAt(floor, hazard)).toBe("labyrinth");
        expect(floor.zones.some((zone) => (
          hazard.x >= zone.x && hazard.x < zone.x + zone.width &&
          hazard.y >= zone.y && hazard.y < zone.y + zone.height
        ))).toBe(false);
      });
      expect(
        Math.abs(first[0].x - first[1].x) + Math.abs(first[0].y - first[1].y),
      ).toBeGreaterThanOrEqual(7);
    }
  }, 20_000);

  it("首次越过安全区边界先确认；确认后移动只触发一次陷阱伤害", () => {
    const session = new GameSession(null, null, "f1-entry-and-hazard");
    const exit = firstSafeExit(session.snapshot().mazeFloor);
    expect(session.setPlayerPosition(exit.from.x, exit.from.y)).toBe(true);
    const blocked = session.attemptPlayerMove(
      exit.to.x - exit.from.x,
      exit.to.y - exit.from.y,
    );
    expect(blocked).toMatchObject({
      ok: false,
      moved: false,
      blockedBy: "threshold",
      hazard: null,
    });
    expect(session.confirmFloorOneLabyrinthEntry()).toBe(true);
    expect(session.attemptPlayerMove(
      exit.to.x - exit.from.x,
      exit.to.y - exit.from.y,
    )).toMatchObject({ ok: true, moved: true, blockedBy: "none" });
    expect(session.snapshot().player).toMatchObject(exit.to);
    expect(floorOneAreaAt(session.snapshot().mazeFloor, session.snapshot().player))
      .toBe("labyrinth");

    const hazard = session.snapshot().hazards[0];
    const neighbor = DIRECTIONS
      .map((direction) => ({ x: hazard.x + direction.x, y: hazard.y + direction.y }))
      .find((position) => mazeTileAt(
        session.snapshot().mazeFloor,
        position.x,
        position.y,
      ) === ".");
    expect(neighbor).toBeDefined();
    expect(session.setPlayerPosition(neighbor!.x, neighbor!.y)).toBe(true);
    const firstHit = session.attemptPlayerMove(
      hazard.x - neighbor!.x,
      hazard.y - neighbor!.y,
    );
    expect(firstHit.hazard).toMatchObject({ id: hazard.id, playerDamage: 1 });
    expect(session.snapshot().player.hp).toBe(1);
    expect(session.snapshot().openedGateIds).toContain(hazard.id);

    expect(session.setPlayerPosition(neighbor!.x, neighbor!.y)).toBe(true);
    const repeated = session.attemptPlayerMove(
      hazard.x - neighbor!.x,
      hazard.y - neighbor!.y,
    );
    expect(repeated.hazard).toBeNull();
    expect(session.snapshot().player.hp).toBe(1);
  });

  it("安全区整房可见，迷宫当前视野保持半径三", () => {
    const graph = generateRoomGraph("f1-sight", 1);
    const floor = generateMazeFloor(graph);
    const left = floor.zones.find(
      (zone) => zone.roomNodeId === FLOOR_ONE_LEFT_SAFE_ROOM_ID,
    )!;
    const safeSight = floorOneCurrentSightCellKeys(floor, left.center);
    expect(safeSight.has(key(left.center))).toBe(true);
    expect(safeSight.size).toBe(left.width * left.height);

    const mazePosition = floor.anchors["floor-1-tutorial"];
    const mazeSight = floorOneCurrentSightCellKeys(floor, mazePosition);
    mazeSight.forEach((cell) => {
      const [x, y] = cell.split(":").map(Number);
      expect(Math.abs(x - mazePosition.x) + Math.abs(y - mazePosition.y))
        .toBeLessThanOrEqual(FLOOR_ONE_LABYRINTH_SIGHT_RADIUS);
    });
  });
});
