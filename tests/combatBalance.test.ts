/** 验证角色、楼层和战斗结果对应的确定性伤害与经验结算。 */
import { describe, expect, it } from "vitest";
import { INITIAL_MONSTERS, lessonById, practiceStagesFor } from "../src/content/mvpLevel";
import { BIOME_ENCOUNTERS } from "../src/content/biomeContent";
import {
  counterDamageForEncounter,
  counterDamageForMonster,
  encounterDamageRoleFor,
  stageCountForEncounter,
  stagesForEncounter,
  type EncounterDamageRole,
} from "../src/domain/combatBalance";
import { lessonsForFloor, type FloorNumber } from "../src/domain/runGraph";

function authoredStages(monster: (typeof INITIAL_MONSTERS)[number]) {
  return monster.encounterType === "ambush"
    ? practiceStagesFor(monster.id)
    : lessonById(monster.lessonId).stages;
}

function balancedStages(monster: (typeof INITIAL_MONSTERS)[number]) {
  const floorLessons = lessonsForFloor(monster.floor);
  const lessonIndex = floorLessons.indexOf(monster.lessonId);
  const reviewStages = floorLessons
    .slice(0, Math.max(0, lessonIndex))
    .flatMap((lessonId) => lessonById(lessonId).stages);
  return stagesForEncounter(monster, authoredStages(monster), reviewStages);
}

describe("MVP 2.0 combat balance", () => {
  it("生态战斗锁与查询特征逐项对应", () => {
    BIOME_ENCOUNTERS.flatMap((encounter) => encounter.stages).forEach((stage) => {
      expect(stage.locks, stage.id).toHaveLength(stage.requiredFeatures.length);
    });
  });

  it("反击伤害严格遵守八层四角色矩阵", () => {
    const roles: readonly EncounterDamageRole[] = [
      "normal",
      "elite",
      "area-boss",
      "floor-boss",
    ];
    const expected: Readonly<Record<FloorNumber, readonly number[]>> = {
      1: [1, 1, 1, 1],
      2: [1, 1, 1, 1],
      3: [1, 1, 2, 2],
      4: [1, 1, 2, 2],
      5: [1, 2, 2, 2],
      6: [1, 2, 2, 2],
      7: [2, 2, 2, 3],
      8: [2, 2, 2, 3],
    };

    for (let floor = 1; floor <= 8; floor += 1) {
      roles.forEach((role, index) => {
        expect(counterDamageForEncounter(floor as FloorNumber, role))
          .toBe(expected[floor as FloorNumber][index]);
      });
    }
  });

  it("89 个怪物的 canonical damage 与角色解析保持一致", () => {
    expect(INITIAL_MONSTERS).toHaveLength(89);
    INITIAL_MONSTERS.forEach((monster) => {
      const role = encounterDamageRoleFor(monster);
      expect(counterDamageForMonster(monster))
        .toBe(counterDamageForEncounter(monster.floor, role));
    });
  });

  it("所有怪物阶段数符合普通、精英、区域首领和楼层 Boss 矩阵", () => {
    INITIAL_MONSTERS.forEach((monster) => {
      const authored = authoredStages(monster);
      const stages = balancedStages(monster);
      expect(stages).toHaveLength(stageCountForEncounter(monster, authored.length));
      expect(stages.every((stage) => (
        stage.attackTargetIds.length === 1 && stage.attackTargetIds[0] === monster.id
      ))).toBe(true);

      const role = encounterDamageRoleFor(monster);
      if (role === "normal") expect(stages.length).toBeGreaterThanOrEqual(1);
      if (role === "elite" || role === "area-boss") expect(stages).toHaveLength(2);
      if (role === "floor-boss") {
        const expected = monster.floor <= 2
          ? 2
          : monster.floor <= 4 ? 3 : monster.floor <= 7 ? 4 : 5;
        expect(stages).toHaveLength(expected);
      }
    });
  });

  it("宝箱怪只复习已学的一层基础题且固定两阶段", () => {
    const mimic = INITIAL_MONSTERS.find((monster) => monster.id === 9);
    if (!mimic) throw new Error("缺少 ID #009");
    const stages = balancedStages(mimic);
    expect(stages).toHaveLength(2);
    expect(stages.map((stage) => stage.id)).toEqual(["practice-select", "practice-null"]);
    expect(stages.flatMap((stage) => stage.requiredFeatures)).not.toContain("group-by");
    expect(stages.flatMap((stage) => stage.requiredFeatures)).not.toContain("having");
  });

  it("八个特殊区域首领使用计划指定的复合概念", () => {
    const concepts = new Map([
      [22, ["join", "left-join"]],
      [33, ["self-join", "join"]],
      [44, ["in", "exists"]],
      [55, ["rank", "lag", "lead"]],
      [66, ["delete", "constraint"]],
      [77, ["idx_index_records_realm_score", "SEARCH"]],
      [89, ["lock_waits", "isolation_cases"]],
    ] as const);

    concepts.forEach((needles, monsterId) => {
      const monster = INITIAL_MONSTERS.find((entry) => entry.id === monsterId);
      if (!monster) throw new Error(`缺少 ID #${monsterId}`);
      const serialized = JSON.stringify(balancedStages(monster)).toLowerCase();
      needles.forEach((needle) => expect(serialized).toContain(needle.toLowerCase()));
    });
  });
});
