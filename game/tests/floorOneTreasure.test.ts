import { describe, expect, it } from "vitest";
import { generateCampfires, safeZoneCellKeys } from "../src/domain/exploration/campfire";
import { generateGuidedMapPlan } from "../src/domain/exploration/guidedMap";
import { generateMazeFloor, mazeTileAt, mazeZoneAt } from "../src/domain/exploration/mazeGenerator";
import { floorOneAreaAt } from "../src/domain/exploration/floorOneLabyrinth";
import { generateRoomGraph } from "../src/domain/progression/runGraph";
import { GameSession } from "../src/features/game-session/GameSession";
import { detectQueryFeatures } from "../src/domain/learning/lessonEvaluator";
import type { SqlQueryResult } from "../src/domain/shared/types";
import {
  FLOOR_ONE_CHEST_IDS,
  FLOOR_ONE_MIMIC_MONSTER_ID,
  floorOneChestKind,
  floorOneWalkableNeighborCount,
  generateFloorOneChestItems,
} from "../src/domain/exploration/floorOneTreasure";

function result(
  sql: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  targetIds: number[] = [],
): SqlQueryResult {
  return {
    sql,
    columns,
    rows,
    targetIds,
    plan: ["SEARCH teaching fixture"],
    baseHeat: 3,
    features: detectQueryFeatures(sql),
  };
}

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

  it("普通箱立即反馈；沉默木箱在三项前置课后进入两阶段基础战斗", () => {
    const session = new GameSession(null, null, "f1-chest-interaction");
    const normal = session.snapshot().groundItems.find((item) => item.id === "chest:f1:normal-a");
    const mimic = session.snapshot().groundItems.find((item) => item.id === "chest:f1:mimic");
    expect(normal).toBeDefined();
    expect(mimic).toBeDefined();
    expect(JSON.stringify(mimic)).not.toContain("宝箱怪");

    expect(session.setPlayerPosition(normal!.x, normal!.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "reward" });
    expect(session.snapshot().groundItems.some((item) => item.id === normal!.id)).toBe(false);
    expect(session.snapshot().openedGateIds).toContain(normal!.id);

    expect(session.setPlayerPosition(mimic!.x, mimic!.y)).toBe(true);
    expect(session.interact()).toMatchObject({
      ok: false,
      message: expect.stringContaining("SELECT、WHERE 与 IS NULL"),
    });
    expect(session.enableAdminMode()).toMatchObject({ ok: true });
    expect(session.adminApplyPreset("f1-admin-dormitory")).toMatchObject({ ok: true });
    const unlockedMimic = session.snapshot().groundItems.find(
      (item) => item.id === "chest:f1:mimic",
    );
    expect(unlockedMimic).toBeDefined();
    expect(session.setPlayerPosition(unlockedMimic!.x, unlockedMimic!.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "combat" });
    expect(session.snapshot().mode).toBe("combat");
    expect(session.snapshot().combat?.targetId).toBe(FLOOR_ONE_MIMIC_MONSTER_ID);
    expect(session.snapshot().banner).toContain("2 道第一层基础题");
    expect(session.snapshot().banner).not.toContain("宝箱怪");
    expect(floorOneChestKind(mimic!.id)).toBe("mimic");

    expect(session.resolveQuery(result(
      "SELECT id, status FROM monsters WHERE id = 6",
      ["id", "status"],
      [{ id: 6, status: "dripping" }],
      [6],
    )).accepted).toBe(true);
    expect(session.resolveQuery(result(
      "SELECT id FROM monsters WHERE master_id IS NULL AND status = 'toxic'",
      ["id"],
      [{ id: 8 }],
      [8],
    )).accepted).toBe(true);
    expect(session.snapshot().relics.map((relic) => relic.id)).toContain("schema-eye");
    expect(session.snapshot().banner).toContain("Schema 之眼");
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
