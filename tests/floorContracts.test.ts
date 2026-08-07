import { describe, expect, it } from "vitest";
import {
  FLOOR_CONTRACTS,
  floorContractFor,
  validateFloorContracts,
  type FloorContentContract,
} from "../src/content/curriculum/floorContracts";
import { FLOOR_EXPERIENCES } from "../src/content/world/floorExperience";
import { floorLabyrinth } from "../src/content/world/floorLabyrinth";
import { INITIAL_MONSTERS } from "../src/content/curriculum/mvpLevel";
import {
  lessonsForFloor,
  type RunLessonId,
} from "../src/domain/progression/runGraph";

function mutableContracts(): FloorContentContract[] {
  return structuredClone(FLOOR_CONTRACTS) as FloorContentContract[];
}

describe("eight-floor content contracts", () => {
  it("八层课程、题阶、怪物阶级、主题和掉落池形成完整契约", () => {
    expect(validateFloorContracts(FLOOR_CONTRACTS)).toEqual({
      valid: true,
      errors: [],
    });
    expect(FLOOR_CONTRACTS.map((contract) => contract.floor)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(FLOOR_CONTRACTS.every((contract) => (
      contract.lessons.some((lesson) => lesson.tier === 1) &&
      contract.lessons.some((lesson) => lesson.tier === 2) &&
      contract.lessons.some((lesson) => lesson.tier === 3)
    ))).toBe(true);
    expect(floorContractFor(8)).toMatchObject({
      runtime: "scenario-simulation",
      completionRewardId: "campaign-proof",
      nextFloorKeyId: null,
    });
  });

  it("契约只镜像运行时真源，不覆盖课程、标题、怪物或拓扑", () => {
    FLOOR_CONTRACTS.forEach((contract) => {
      const experience = FLOOR_EXPERIENCES.find(
        (entry) => entry.floor === contract.floor,
      );
      expect(experience).toBeDefined();
      expect(contract.name).toBe(experience?.title);
      expect(contract.lessons.map((lesson) => lesson.id)).toEqual(
        lessonsForFloor(contract.floor),
      );
      expect(floorLabyrinth(contract.floor).topologySignature).toMatch(
        new RegExp(`^${contract.theme.topology}:`),
      );
      expect([...new Set(contract.monsterPool)].sort()).toEqual(
        [...new Set(
          INITIAL_MONSTERS
            .filter((monster) => monster.floor === contract.floor)
            .map((monster) => monster.name),
        )].sort(),
      );
    });

    expect(floorContractFor(1).encounters.some(
      (encounter) => encounter.role === "area-boss",
    )).toBe(false);
    expect(floorContractFor(2).encounters).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "area-boss", name: "湖兽", required: false }),
      expect.objectContaining({ role: "fixed-elite", name: "蛙王", required: true }),
    ]));
  });

  it("缺课程或错误先修关系会被拒绝", () => {
    const missing = mutableContracts();
    missing[2].lessons = missing[2].lessons.slice(1);
    expect(validateFloorContracts(missing).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("缺少完整必修课程"),
    ]));

    const brokenPrerequisite = mutableContracts();
    brokenPrerequisite[0].lessons[0].prerequisites = [
      "future-lesson" as RunLessonId,
    ];
    expect(validateFloorContracts(brokenPrerequisite).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("尚未出现的前置课程"),
    ]));
  });

  it("缺层主、缺关键奖励或不可直接输入的怪物名会被拒绝", () => {
    const missingBoss = mutableContracts();
    missingBoss[3].encounters = missingBoss[3].encounters.filter(
      (encounter) => encounter.role !== "floor-boss",
    );
    expect(validateFloorContracts(missingBoss).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("floor-boss"),
      expect.stringContaining("缺少必修层主"),
    ]));

    const missingReward = mutableContracts();
    missingReward[4].completionRewardId = "";
    expect(validateFloorContracts(missingReward).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("缺少正确的关键结业奖励"),
    ]));

    const invalidName = mutableContracts();
    invalidName[5].encounters[0].name = "JOIN · 幼龙";
    expect(validateFloorContracts(invalidName).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("怪物名不可直接输入"),
    ]));
  });

  it("第七、八层必须保留 SQLite 与 MySQL 证据边界", () => {
    const seventh = mutableContracts();
    seventh[6].runtimeNotice = "使用通用执行计划。";
    expect(validateFloorContracts(seventh).errors).toContain(
      "第七层必须明确 SQLite 计划证据不等同 MySQL。",
    );

    const eighth = mutableContracts();
    eighth[7].runtimeNotice = "所有行为都是真实数据库证明。";
    expect(validateFloorContracts(eighth).errors).toContain(
      "第八层必须明确 MySQL 专属概念采用场景模拟。",
    );
  });
});
