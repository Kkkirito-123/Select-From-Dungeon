import { describe, expect, it } from "vitest";
import {
  BIOME_ENCOUNTERS,
  weightedBiomeEncounterIds,
  type BiomeKind,
} from "../src/content/biomeContent";
import { INITIAL_MONSTERS } from "../src/content/mvpLevel";
import { regionPortalsEnabledForFloor } from "../src/content/floorMapBlueprints";
import {
  biomeRegionAt,
  generateBiomePlan,
  validateBiomePlan,
} from "../src/domain/biome";
import { generateCampfires, isSafeZonePosition } from "../src/domain/campfire";
import { generateGuidedMapPlan } from "../src/domain/guidedMap";
import { generateMazeFloor } from "../src/domain/mazeGenerator";
import {
  generateRoomGraph,
  lessonsForFloor,
  type FloorNumber,
} from "../src/domain/runGraph";

function fixture(seed: string, floorNumber: FloorNumber) {
  const graph = generateRoomGraph(seed, floorNumber);
  const maze = generateMazeFloor(graph);
  const campfires = generateCampfires(graph, maze);
  const guidedMap = generateGuidedMapPlan(graph, maze, campfires);
  const biome = generateBiomePlan(graph, maze, campfires, guidedMap);
  return { graph, maze, campfires, guidedMap, biome };
}

describe("seeded biome plan", () => {
  it("八层生态方案可复现、每区 14 个地标且不侵入安全区", () => {
    for (const floorNumber of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      for (let index = 0; index < 30; index += 1) {
        const seed = `biome-contract-${floorNumber}-${index}`;
        const first = fixture(seed, floorNumber);
        const second = fixture(seed, floorNumber);

        expect(first.biome).toEqual(second.biome);
        expect(validateBiomePlan(
          first.biome,
          first.graph,
          first.maze,
          first.campfires,
          first.guidedMap,
        )).toEqual({ valid: true, errors: [] });
        expect(first.biome.regions).toHaveLength(3);
        expect(first.biome.portals).toHaveLength(2);
        first.biome.portals.forEach((portal) => {
          expect(first.maze.tiles[portal.entry.y]?.[portal.entry.x]).toBe(".");
          expect(first.maze.tiles[portal.exit.y]?.[portal.exit.x]).toBe(".");
          expect(isSafeZonePosition(first.maze, first.campfires, portal.entry)).toBe(false);
          expect(isSafeZonePosition(first.maze, first.campfires, portal.exit)).toBe(false);
        });
        first.biome.regions.forEach((region) => {
          expect(first.biome.features.filter(
            (feature) => feature.biome === region.kind,
          )).toHaveLength(14);
        });
        first.biome.features.forEach((feature) => {
          expect(isSafeZonePosition(first.maze, first.campfires, feature)).toBe(false);
          expect(biomeRegionAt(first.biome, feature).kind).toBe(feature.biome);
        });
      }
    }
  // This verifies 360 complete map/biome generations. Keep the sample size,
  // but allow slower CI runners and parallel local suites enough wall time.
  }, 60_000);

  it("第二层稳定生成湖兽与蛙王，首领不会落在安全区", () => {
    for (let index = 0; index < 60; index += 1) {
      const current = fixture(`biome-boss-${index}`, 2);
      const bosses = current.biome.regions.filter((region) => region.areaBossId !== null);
      expect(bosses.map((region) => region.areaBossId).sort()).toEqual([21, 22]);
      bosses.forEach((region) => {
        expect(region.areaBossPosition).not.toBeNull();
        if (!region.areaBossPosition) return;
        expect(isSafeZonePosition(
          current.maze,
          current.campfires,
          region.areaBossPosition,
        )).toBe(false);
        expect(biomeRegionAt(current.biome, region.areaBossPosition).kind).toBe(region.kind);
      });
    }
  }, 20_000);

  it("区域首领统一使用 Boss 标记，但保留精英等级的 3 XP 语义", () => {
    const areaBosses = BIOME_ENCOUNTERS.filter((encounter) => (
      encounter.role === "area-boss"
    ));

    expect(areaBosses.map((encounter) => encounter.monsterId)).toEqual([
      21,
      22,
      33,
      44,
      55,
      66,
      77,
      89,
    ]);
    areaBosses.forEach((encounter) => {
      expect(
        INITIAL_MONSTERS.find((monster) => monster.id === encounter.monsterId),
      ).toMatchObject({
        isBoss: true,
        rank: "elite",
      });
    });
  });

  it("第一层保持连续地图，第二至八层的后段交通均由本层中段区域首领门控", () => {
    expect(regionPortalsEnabledForFloor(1)).toBe(false);
    const floorOne = fixture("floor-one-continuous-route", 1);
    expect(floorOne.biome.portals.find(
      (portal) => portal.id === "biome-portal:1:middle-rear",
    )?.requiredBossId).toBeNull();

    const expectations = [
      { floor: 2, kind: "swamp", bossId: 22 },
      { floor: 3, kind: "grave-mire", bossId: 33 },
      { floor: 4, kind: "frost-vault", bossId: 44 },
      { floor: 5, kind: "barracks", bossId: 55 },
      { floor: 6, kind: "crystal-cavern", bossId: 66 },
      { floor: 7, kind: "root-maze", bossId: 77 },
      { floor: 8, kind: "void-court", bossId: 89 },
    ] as const;

    expectations.forEach(({ floor, kind, bossId }) => {
      for (let index = 0; index < 30; index += 1) {
        const current = fixture(`late-floor-middle-boss-${floor}-${index}`, floor);
        const middle = current.biome.regions[1];
        const rear = current.biome.regions[2];
        const rearPortal = current.biome.portals.find(
          (portal) => portal.id === `biome-portal:${floor}:middle-rear`,
        );
        expect(middle).toMatchObject({
          kind,
          areaBossId: bossId,
        });
        expect(middle.areaBossPosition).not.toBeNull();
        if (!middle.areaBossPosition) return;
        expect(biomeRegionAt(current.biome, middle.areaBossPosition).id).toBe(middle.id);
        expect(rearPortal).toMatchObject({
          fromRegionId: middle.id,
          toRegionId: rear.id,
          requiredBossId: bossId,
        });
        expect(BIOME_ENCOUNTERS.find((encounter) => encounter.monsterId === bossId))
          .toMatchObject({ floor, biome: kind, role: "area-boss" });
      }
    });
  }, 30_000);
});

describe("biome encounter pools", () => {
  it("随机池只使用当前层、当前生态且排除区域首领", () => {
    const unlocked = new Set(lessonsForFloor(2));
    for (const biome of ["lake", "swamp", "forest"] as const satisfies readonly BiomeKind[]) {
      const ids = weightedBiomeEncounterIds(2, biome, unlocked);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids)).toEqual(new Set(
        BIOME_ENCOUNTERS
          .filter((entry) => (
            entry.floor === 2 &&
            entry.biome === biome &&
            entry.randomEncounter
          ))
          .map((entry) => entry.monsterId),
      ));
      expect(ids).not.toContain(21);
      expect(ids).not.toContain(22);
    }
  });

  it("随机小型精英只在有基础怪物的生态内保持权重；宝箱怪只由宝箱触发", () => {
    const floorOne = weightedBiomeEncounterIds(
      1,
      "ember-cellar",
      new Set(lessonsForFloor(1)),
    );
    const floorTwo = weightedBiomeEncounterIds(
      2,
      "swamp",
      new Set(lessonsForFloor(2)),
    );
    const floorThree = weightedBiomeEncounterIds(
      3,
      "spirit-crypt",
      new Set(lessonsForFloor(3)),
    );
    const floorFour = weightedBiomeEncounterIds(
      4,
      "storm-core",
      new Set(lessonsForFloor(4)),
    );
    expect(floorOne).not.toContain(9);
    expect(floorTwo.filter((id) => id === 18).length / floorTwo.length)
      .toBeCloseTo(0.07, 2);
    expect(floorThree.filter((id) => id === 31).length / floorThree.length)
      .toBeCloseTo(0.09, 2);
    expect(floorFour.filter((id) => id === 42).length / floorFour.length)
      .toBeCloseTo(0.11, 2);
  });
});
