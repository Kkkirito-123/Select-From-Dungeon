import { describe, expect, it } from "vitest";
import {
  MONSTER_KIND_VISUALS,
  monsterVisualArchetype,
} from "../src/content/world/monsterVisuals";
import { INITIAL_MONSTERS } from "../src/content/curriculum/mvpLevel";
import type { MonsterKind } from "../src/domain/shared/types";

const ALL_MONSTER_KINDS = [
  "projection-slime",
  "filter-hound",
  "null-ghost",
  "aggregate-golem",
  "sort-drake",
  "distinct-mimic",
  "join-spider",
  "left-join-wraith",
  "relation-titan",
  "skeleton",
  "zombie",
  "ghost",
  "necromancer",
  "fire-spirit",
  "ice-spirit",
  "thunder-spirit",
  "elemental-king",
  "goblin",
  "orc",
  "knight",
  "troll",
  "castle-lord",
  "hatchling",
  "wyvern",
  "dragon",
  "dragon-king",
  "index-guard",
  "root-beast",
  "crystal-spirit",
  "vine-witch",
  "index-eye",
  "index-tree",
  "demon-soldier",
  "dark-knight",
  "lich",
  "obsidian-golem",
  "replica-twin",
  "shard-beast",
  "demon-king",
] as const satisfies readonly MonsterKind[];

describe("八层怪物像素外形契约", () => {
  it("每一种 MonsterKind 都有显式外形，不能退化成墙块兜底", () => {
    expect(Object.keys(MONSTER_KIND_VISUALS).sort()).toEqual(
      [...ALL_MONSTER_KINDS].sort(),
    );
    expect(
      INITIAL_MONSTERS.every((monster) => Boolean(monsterVisualArchetype(monster))),
    ).toBe(true);
  });

  it("物种外形会覆盖复用的 SQL 战斗类型", () => {
    const frog = INITIAL_MONSTERS.find((monster) => monster.species.includes("frog"));
    const treant = INITIAL_MONSTERS.find((monster) => monster.species.includes("treant"));
    const waterBeast = INITIAL_MONSTERS.find(
      (monster) => monster.species.includes("lake"),
    );
    const jungleKing = INITIAL_MONSTERS.find(
      (monster) => monster.species.includes("jungle_king"),
    );

    expect(frog && monsterVisualArchetype(frog)).toBe("frog");
    expect(treant && monsterVisualArchetype(treant)).toBe("treant");
    expect(waterBeast && monsterVisualArchetype(waterBeast)).toBe("water-beast");
    expect(jungleKing && monsterVisualArchetype(jungleKing)).toBe("jungle-king");
  });

  it("第七、八层不再共享旧的棕色矩形兜底", () => {
    const upperFloorVisuals = INITIAL_MONSTERS
      .filter((monster) => monster.floor >= 7)
      .map((monster) => monsterVisualArchetype(monster));

    expect(new Set(upperFloorVisuals).size).toBeGreaterThanOrEqual(10);
    expect(upperFloorVisuals).toContain("index-eye");
    expect(upperFloorVisuals).toContain("demon-king");
  });
});
