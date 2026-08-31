import { describe, expect, it } from "vitest";
import {
  AMBUSH_CHANCE,
  AMBUSH_CHANCE_MIN,
  AMBUSH_ANNEAL_SPAN,
  AMBUSH_GUARANTEE_AT,
  INITIAL_SAFE_STEPS,
  POST_BATTLE_SAFE_STEPS,
  advanceEncounterMeter,
  ambushChanceAt,
  recordSafeZoneMovement,
  suppressThirdConsecutiveEncounter,
} from "../src/domain/exploration/encounterDirector";

function candidates(...monsterIds: number[]) {
  return monsterIds.map((monsterId) => ({ monsterId, weight: 1 }));
}

describe("seeded ambush meter", () => {
  it("余弦退火让遭遇概率随累计移动数单调下降并钳制到最低值", () => {
    expect(ambushChanceAt(0)).toBe(AMBUSH_CHANCE);
    expect(ambushChanceAt(1)).toBeLessThan(AMBUSH_CHANCE);
    const mid = Math.floor(AMBUSH_ANNEAL_SPAN / 2);
    expect(ambushChanceAt(1)).toBeGreaterThan(ambushChanceAt(mid));
    expect(ambushChanceAt(mid)).toBeGreaterThan(ambushChanceAt(AMBUSH_ANNEAL_SPAN));
    expect(ambushChanceAt(AMBUSH_ANNEAL_SPAN)).toBe(AMBUSH_CHANCE_MIN);
    expect(ambushChanceAt(AMBUSH_ANNEAL_SPAN + 1000)).toBe(AMBUSH_CHANCE_MIN);
  });

  it("基础遭遇率为 2%，开局 5 步安全且第 30 个可遭遇步强制触发", () => {
    expect(AMBUSH_CHANCE).toBe(0.02);
    expect(INITIAL_SAFE_STEPS).toBe(5);
    expect(POST_BATTLE_SAFE_STEPS).toBe(5);
    expect(AMBUSH_GUARANTEE_AT).toBe(30);

    let meter = {
      totalMoves: 0,
      stepsSinceEncounter: 0,
      safeStepsRemaining: INITIAL_SAFE_STEPS,
    };
    let targetId: number | null = null;
    for (let step = 0; step < INITIAL_SAFE_STEPS; step += 1) {
      const advance = advanceEncounterMeter(meter, "safe-seed", candidates(111));
      meter = advance.meter;
      expect(advance.targetId).toBeNull();
    }
    for (let step = 0; step < AMBUSH_GUARANTEE_AT; step += 1) {
      const advance = advanceEncounterMeter(meter, "safe-seed", candidates(111));
      meter = advance.meter;
      if (advance.targetId !== null) {
        targetId = advance.targetId;
        break;
      }
    }
    expect(targetId).toBe(111);
    expect(meter.safeStepsRemaining).toBe(POST_BATTLE_SAFE_STEPS);
  });

  it("达到第 30 个可遭遇步时不再依赖 2% 随机值", () => {
    const advance = advanceEncounterMeter(
      {
        totalMoves: 91,
        stepsSinceEncounter: AMBUSH_GUARANTEE_AT - 1,
        safeStepsRemaining: 0,
      },
      "guaranteed-ambush",
      candidates(301, 101, 201),
    );

    expect(advance.targetId).not.toBeNull();
    expect([101, 201, 301]).toContain(advance.targetId);
    expect(advance.meter).toEqual({
      totalMoves: 92,
      stepsSinceEncounter: 0,
      safeStepsRemaining: POST_BATTLE_SAFE_STEPS,
    });
  });

  it("能在第 30 步保底前通过 2% 分支触发遭遇", () => {
    const beforeHit = {
      totalMoves: 16,
      stepsSinceEncounter: 10,
      safeStepsRemaining: 0,
    };
    expect(advanceEncounterMeter(beforeHit, "chance-3", candidates(201)).targetId).toBeNull();

    const hit = advanceEncounterMeter(
      { ...beforeHit, totalMoves: 17 },
      "chance-3",
      candidates(201),
    );
    expect(hit).toEqual({
      meter: {
        totalMoves: 18,
        stepsSinceEncounter: 0,
        safeStepsRemaining: POST_BATTLE_SAFE_STEPS,
      },
      targetId: 201,
    });
  });

  it("同一 Seed、移动计数和候选牌得到相同结果，且没有候选时不触发", () => {
    const meter = { totalMoves: 42, stepsSinceEncounter: 13, safeStepsRemaining: 0 };
    expect(advanceEncounterMeter(meter, "repeatable", candidates(311, 111, 211))).toEqual(
      advanceEncounterMeter(meter, "repeatable", candidates(211, 311, 111)),
    );
    expect(advanceEncounterMeter(meter, "repeatable", []).targetId).toBeNull();
  });

  it("连续两场相同 ID 时排除第三场；没有替代目标时回退原池", () => {
    expect(suppressThirdConsecutiveEncounter(
      [
        { monsterId: 17, weight: 93 },
        { monsterId: 18, weight: 7 },
      ],
      [18, 18],
    )).toEqual([{ monsterId: 17, weight: 93 }]);
    expect(suppressThirdConsecutiveEncounter(
      [{ monsterId: 18, weight: 7 }],
      [18, 18],
    )).toEqual([{ monsterId: 18, weight: 7 }]);
    expect(suppressThirdConsecutiveEncounter(
      candidates(17, 18),
      [18, 17],
    )).toEqual(candidates(17, 18));
  });

  it("安全区移动只累计成功移动总数，不消耗安全步也不推进保底计数", () => {
    const meter = {
      totalMoves: 27,
      stepsSinceEncounter: 18,
      safeStepsRemaining: 3,
    };

    expect(recordSafeZoneMovement(meter)).toEqual({
      totalMoves: 28,
      stepsSinceEncounter: 18,
      safeStepsRemaining: 3,
    });
    expect(meter).toEqual({
      totalMoves: 27,
      stepsSinceEncounter: 18,
      safeStepsRemaining: 3,
    });
  });
});
