import { describe, expect, it } from "vitest";
import { generateCampfires, safeZoneCellKeys } from "../src/domain/campfire";
import { generateGuidedMapPlan } from "../src/domain/guidedMap";
import { generateMazeFloor, mazeTileAt, mazeZoneAt } from "../src/domain/mazeGenerator";
import { floorOneAreaAt } from "../src/domain/floorOneLabyrinth";
import { generateRoomGraph } from "../src/domain/runGraph";
import { GameSession } from "../src/domain/GameSession";
import {
  FLOOR_ONE_CHEST_IDS,
  FLOOR_ONE_MIMIC_MONSTER_ID,
  floorOneChestKind,
  floorOneWalkableNeighborCount,
  generateFloorOneChestItems,
} from "../src/domain/floorOneTreasure";

describe("第一层迷宫宝箱", () => {
  it("相同 Seed 生成两个普通箱、一个宝箱怪和一个偏移箱，且不落在安全区", () => {
    const graph = generateRoomGraph("f1-chest-contract", 1);
    const floor = generateMazeFloor(graph);
    const campfires = generateCampfires(graph, floor);
    const guidedMap = generateGuidedMapPlan(graph, floor, campfires);
    const first = generateFloorOneChestItems(floor, campfires, guidedMap);
    const second = generateFloorOneChestItems(floor, campfires, guidedMap);
    const safeCells = safeZoneCellKeys(floor, campfires);

    expect(first).toEqual(second);
    expect(first.map((item) => item.id)).toEqual([...FLOOR_ONE_CHEST_IDS]);
    first.forEach((item) => {
      expect(mazeTileAt(floor, item.x, item.y)).toBe(".");
      expect(mazeZoneAt(floor, item)).toBeNull();
      expect(safeCells.has(`${item.x}:${item.y}`)).toBe(false);
      expect(item.collection).toBe("interact");
      expect(item.rewardId).toBeNull();
    });
  });

  it("按 E 打开普通箱立即反馈；沉默木箱会进入五阶段基础 SQL 战斗", () => {
    const session = new GameSession(null, null, "f1-chest-interaction");
    const normal = session.snapshot().groundItems.find((item) => item.id === "chest:f1:normal-a");
    const mimic = session.snapshot().groundItems.find((item) => item.id === "chest:f1:mimic");
    expect(normal).toBeDefined();
    expect(mimic).toBeDefined();

    expect(session.setPlayerPosition(normal!.x, normal!.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "reward" });
    expect(session.snapshot().groundItems.some((item) => item.id === normal!.id)).toBe(false);
    expect(session.snapshot().openedGateIds).toContain(normal!.id);

    expect(session.setPlayerPosition(mimic!.x, mimic!.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "combat" });
    expect(session.snapshot().mode).toBe("combat");
    expect(session.snapshot().combat?.targetId).toBe(FLOOR_ONE_MIMIC_MONSTER_ID);
    expect(floorOneChestKind(mimic!.id)).toBe("mimic");
  });

  it("偏移宝箱传送到迷宫可回返支路，不落在安全区或死路", () => {
    const session = new GameSession(null, null, "f1-chest-warp");
    const warp = session.snapshot().groundItems.find((item) => item.id === "chest:f1:warp");
    expect(warp).toBeDefined();
    expect(session.setPlayerPosition(warp!.x, warp!.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "reward" });
    const player = session.snapshot().player;
    const floor = session.snapshot().mazeFloor;
    expect(player).not.toMatchObject({ x: warp!.x, y: warp!.y });
    expect(floorOneAreaAt(floor, player)).toBe("labyrinth");
    expect(mazeTileAt(floor, player.x, player.y)).toBe(".");
    expect(floorOneWalkableNeighborCount(floor, player)).toBeGreaterThanOrEqual(2);
  });
});
