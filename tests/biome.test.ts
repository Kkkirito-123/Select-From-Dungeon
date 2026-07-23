import { describe, expect, it } from "vitest";
import {
  BIOME_ENCOUNTERS,
  weightedBiomeEncounterIds,
  type BiomeKind,
} from "../src/content/biomeContent";
import {
  biomeRegionAt,
  generateBiomePlan,
  validateBiomePlan,
} from "../src/domain/biome";
import { generateCampfires, isSafeZonePosition } from "../src/domain/campfire";
import { generateGuidedMapPlan } from "../src/domain/guidedMap";
import { generateMazeFloor } from "../src/domain/mazeGenerator";
import { generateRoomGraph, lessonsForFloor } from "../src/domain/runGraph";

function fixture(seed: string, floorNumber: 1 | 2) {
  const graph = generateRoomGraph(seed, floorNumber);
  const maze = generateMazeFloor(graph);
  const campfires = generateCampfires(graph, maze);
  const guidedMap = generateGuidedMapPlan(graph, maze, campfires);
  const biome = generateBiomePlan(graph, maze, campfires, guidedMap);
  return { graph, maze, campfires, guidedMap, biome };
}

describe("seeded biome plan", () => {
  it("两层生态方案可复现、每区 14 个地标且不侵入安全区", () => {
    for (const floorNumber of [1, 2] as const) {
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
  });

  it("第二层稳定生成湖怪与蛙王，首领不会落在安全区", () => {
    for (let index = 0; index < 60; index += 1) {
      const current = fixture(`biome-boss-${index}`, 2);
      const bosses = current.biome.regions.filter((region) => region.areaBossId !== null);
      expect(bosses.map((region) => region.areaBossId).sort()).toEqual([1810, 1911]);
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
  });
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
      expect(ids).not.toContain(1810);
      expect(ids).not.toContain(1911);
    }
  });

  it("小型精英只在有基础怪物的生态内保持约 5% / 7% 权重", () => {
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
    expect(floorOne.filter((id) => id === 810).length / floorOne.length)
      .toBeCloseTo(0.05, 2);
    expect(floorTwo.filter((id) => id === 1510).length / floorTwo.length)
      .toBeCloseTo(0.07, 2);
  });
});
