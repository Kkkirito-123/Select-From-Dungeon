import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_FLOORS,
  floorContractFor,
} from "../src/content/floorContracts";
import { FLOOR_EXPERIENCES } from "../src/content/floorExperience";
import {
  FLOOR_LABYRINTHS,
  floorLabyrinth,
  validateFloorLabyrinths,
  type FloorLabyrinthContract,
} from "../src/content/floorLabyrinth";
import { floorMapBlueprint } from "../src/content/floorMapBlueprints";
import { generateBiomePlan } from "../src/domain/biome";
import { generateCampfires } from "../src/domain/campfire";
import { generateFloorHazards } from "../src/domain/floorLabyrinth";
import { generateFloorOneHazards } from "../src/domain/floorOneLabyrinth";
import { generateGuidedMapPlan } from "../src/domain/guidedMap";
import { generateMazeFloor } from "../src/domain/mazeGenerator";
import { generateRoomGraph } from "../src/domain/runGraph";

function mutableLabyrinths(): FloorLabyrinthContract[] {
  return structuredClone(Object.values(FLOOR_LABYRINTHS));
}

describe("eight-floor labyrinth content contracts", () => {
  it("F1–F8 拥有唯一拓扑、固定安全房、视野和楼层危险", () => {
    const labyrinths = Object.values(FLOOR_LABYRINTHS);
    expect(validateFloorLabyrinths(labyrinths)).toEqual([]);
    expect(labyrinths.map((entry) => entry.floor)).toEqual(CAMPAIGN_FLOORS);
    expect(new Set(labyrinths.map((entry) => entry.topologySignature)).size).toBe(8);
    expect(new Set(labyrinths.map((entry) => entry.hazardKind)).size).toBe(8);
    expect(floorLabyrinth(1)).toMatchObject({
      mazeName: "双岸失名档案",
      safeRoomIds: ["floor-1-entry", "floor-1-rest"],
      sightRadius: 3,
      hazardKind: "archive-cutter",
      hazardName: "档案切纸轮",
      hazardTrigger: "从暗槽中弹出并高速切过",
      hazardCount: 2,
      hazardDamage: 1,
    });
  });

  it("与地图蓝图、课程拓扑和体验地标保持可验证的一致", () => {
    CAMPAIGN_FLOORS.forEach((floor) => {
      const labyrinth = floorLabyrinth(floor);
      const blueprint = floorMapBlueprint(floor);
      const content = floorContractFor(floor);
      const experience = FLOOR_EXPERIENCES.find((entry) => entry.floor === floor)!;
      const slotIds = new Set(blueprint.slots.map((slot) => slot.roomNodeId));
      const spawn = experience.landmarks.find((landmark) => landmark.kind === "spawn-anchor")!;
      const seal = experience.landmarks.find((landmark) => landmark.kind === "sql-seal")!;
      const transit = experience.landmarks.find((landmark) => landmark.kind === "transit");

      expect(labyrinth.mazeName).toBe(blueprint.layoutName);
      expect(labyrinth.regionCount).toBe(blueprint.regionNames.length);
      expect(labyrinth.topologySignature.startsWith(`${content.theme.topology}:`)).toBe(true);
      expect(spawn.anchor.roomNodeId).toBe(labyrinth.entry.roomNodeId);
      expect(seal.anchor.roomNodeId).toBe(labyrinth.bossGate.roomNodeId);
      if (transit) expect(transit.anchor.roomNodeId).toBe(labyrinth.exit.roomNodeId);

      [
        labyrinth.entry.roomNodeId,
        labyrinth.exit.roomNodeId,
        labyrinth.bossGate.roomNodeId,
        labyrinth.hiddenArea.roomNodeId,
        ...labyrinth.safeRoomIds,
      ].forEach((roomNodeId) => expect(slotIds.has(roomNodeId), roomNodeId).toBe(true));

      expect(experience.hiddenAreas).toContainEqual(expect.objectContaining({
        id: labyrinth.hiddenArea.id,
        roomNodeId: labyrinth.hiddenArea.roomNodeId,
        gateId: labyrinth.hiddenArea.gateId,
      }));
    });
  });

  it("拒绝跨层房间、漂移的门 ID、重复签名和失控危险数值", () => {
    const broken = mutableLabyrinths();
    broken[1].safeRoomIds = ["floor-1-entry", "floor-2-rest"];
    broken[2].bossGate.gateId = "gate:floor-3-entry";
    broken[3].topologySignature = broken[2].topologySignature;
    broken[4].hazardKind = broken[3].hazardKind;
    broken[5].hazardCount = 0;
    broken[6].hazardDamage = 3;
    broken[7].hazardTrigger = "";

    expect(validateFloorLabyrinths(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining("引用了其他楼层的房间"),
      expect.stringContaining("首领门 ID 与房间不一致"),
      expect.stringContaining("拓扑签名无效或重复"),
      expect.stringContaining("危险类型与其他楼层重复"),
      expect.stringContaining("危险名称、数量或伤害无效"),
    ]));
  });

  it("第一层通用陷阱接口保持已发布 Seed 的位置与 ID 不变", () => {
    const graph = generateRoomGraph("f1-hazard-compatibility", 1);
    const maze = generateMazeFloor(graph);
    const campfires = generateCampfires(graph, maze);
    const guidedMap = generateGuidedMapPlan(graph, maze, campfires);
    const biome = generateBiomePlan(graph, maze, campfires, guidedMap);

    expect(generateFloorHazards(1, maze, campfires, guidedMap, biome)).toEqual(
      generateFloorOneHazards(maze, campfires, guidedMap),
    );
  });
});
