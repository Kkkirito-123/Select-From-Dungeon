import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BIOME_ENCOUNTERS } from "../src/content/biomeContent";
import { FLOOR_ONE_MIMIC_MONSTER_ID } from "../src/domain/floorOneTreasure";
import {
  CURRENT_MONSTER_IDS_BY_FLOOR,
  LEGACY_MONSTER_IDS_BY_FLOOR,
  MONSTER_ID_COUNT,
  currentMonsterIdForLegacy,
  detectMonsterIdScheme,
  legacyMonsterIdForCurrent,
} from "../src/content/monsterIds";
import { INITIAL_MONSTERS, LESSONS } from "../src/content/mvpLevel";
import { SqlEngine } from "../src/sql/SqlEngine";

describe("MVP 2.0 monster IDs", () => {
  it("按游戏楼层和内容顺序使用全局连续的 1..89", () => {
    expect(INITIAL_MONSTERS).toHaveLength(MONSTER_ID_COUNT);
    expect(INITIAL_MONSTERS.map((monster) => monster.id)).toEqual(
      Array.from({ length: MONSTER_ID_COUNT }, (_, index) => index + 1),
    );
    for (let floor = 1; floor <= 8; floor += 1) {
      expect(
        INITIAL_MONSTERS
          .filter((monster) => monster.floor === floor)
          .map((monster) => monster.id),
      ).toEqual(CURRENT_MONSTER_IDS_BY_FLOOR[floor as keyof typeof CURRENT_MONSTER_IDS_BY_FLOOR]);
    }
  });

  it("同一楼层的 canonical 显示名称保持唯一", () => {
    for (let floor = 1; floor <= 8; floor += 1) {
      const names = INITIAL_MONSTERS
        .filter((monster) => monster.floor === floor)
        .map((monster) => monster.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("课程目标、生态遭遇和 master_id 都指向真实怪物主键", () => {
    const monstersById = new Map(
      INITIAL_MONSTERS.map((monster) => [monster.id, monster]),
    );
    INITIAL_MONSTERS.forEach((monster) => {
      if (monster.masterId !== null) {
        expect(
          monstersById.has(monster.masterId),
          `${monster.name} 的 master_id=${monster.masterId} 无对应怪物`,
        ).toBe(true);
      }
    });
    LESSONS.forEach((lesson) => {
      expect(monstersById.has(lesson.primaryMonsterId), lesson.id).toBe(true);
      lesson.stages.forEach((stage) => {
        expect(
          stage.attackTargetIds,
          `${lesson.id}/${stage.id} 应攻击主课程怪物 ${lesson.primaryMonsterId}`,
        ).toContain(lesson.primaryMonsterId);
        stage.attackTargetIds.forEach((id) => {
          expect(monstersById.has(id), `${lesson.id}/${stage.id}`).toBe(true);
        });
      });
    });
    expect(BIOME_ENCOUNTERS.filter((encounter) => encounter.monsterId !== FLOOR_ONE_MIMIC_MONSTER_ID).flatMap((encounter) => (
      encounter.stages
        .filter((stage) => !stage.attackTargetIds.includes(encounter.monsterId))
        .map((stage) => `${encounter.monsterId}:${stage.id}=>${stage.attackTargetIds.join(",")}`)
    ))).toEqual([]);
    BIOME_ENCOUNTERS.forEach((encounter) => {
      expect(monstersById.get(encounter.monsterId)?.floor).toBe(encounter.floor);
    });
  });

  it("旧编号映射覆盖八层且能和新编号集合无歧义地区分", () => {
    for (let floor = 1; floor <= 8; floor += 1) {
      const floorNumber = floor as keyof typeof LEGACY_MONSTER_IDS_BY_FLOOR;
      const legacyIds = LEGACY_MONSTER_IDS_BY_FLOOR[floorNumber];
      const currentIds = CURRENT_MONSTER_IDS_BY_FLOOR[floorNumber];
      expect(legacyIds.map(currentMonsterIdForLegacy)).toEqual(currentIds);
      expect(currentIds.map(legacyMonsterIdForCurrent)).toEqual(legacyIds);
      expect(detectMonsterIdScheme(floorNumber, legacyIds)).toBe("legacy");
      expect(detectMonsterIdScheme(floorNumber, currentIds)).toBe("current");
    }
  });

  it("八层独立 SQLite 的关系表 monster_id 均只关联当前层 monsters.id", async () => {
    const wasmLocation = fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    ));

    for (let floor = 1; floor <= 8; floor += 1) {
      const floorMonsters = INITIAL_MONSTERS.filter(
        (monster) => monster.floor === floor,
      );
      const engine = await SqlEngine.create([...floorMonsters], wasmLocation);

      for (const table of ["monster_signals", "monster_gear"] as const) {
        const result = engine.executeSelect(
          `SELECT COUNT(*) AS orphan_total FROM ${table} child ` +
          "LEFT JOIN monsters parent ON child.monster_id = parent.id " +
          "WHERE parent.id IS NULL",
        );
        expect(result.rows, `第 ${floor} 层 ${table}`).toEqual([
          { orphan_total: 0 },
        ]);
      }
    }
  });
});
