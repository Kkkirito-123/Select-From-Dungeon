import { describe, expect, it } from "vitest";
import {
  FLOOR_CONTRACTS,
  floorContractFor,
  validateFloorContracts,
  type FloorContentContract,
} from "../src/content/floorContracts";

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

  it("缺课程或错误先修关系会被拒绝", () => {
    const missing = mutableContracts();
    missing[2].lessons = missing[2].lessons.slice(1);
    expect(validateFloorContracts(missing).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("缺少完整必修课程"),
    ]));

    const brokenPrerequisite = mutableContracts();
    brokenPrerequisite[0].lessons[0].prerequisites = ["future-lesson"];
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
