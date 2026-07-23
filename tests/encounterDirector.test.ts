import { describe, expect, it } from "vitest";
import {
  AMBUSH_GUARANTEE_AT,
  INITIAL_SAFE_STEPS,
  POST_BATTLE_SAFE_STEPS,
  advanceEncounterMeter,
} from "../src/domain/encounterDirector";

describe("seeded ambush meter", () => {
  it("开局安全步内不遭遇，并在上限步数前必定抽到一张遭遇牌", () => {
    let meter = {
      totalMoves: 0,
      stepsSinceEncounter: 0,
      safeStepsRemaining: INITIAL_SAFE_STEPS,
    };
    let targetId: number | null = null;
    for (let step = 0; step < INITIAL_SAFE_STEPS; step += 1) {
      const advance = advanceEncounterMeter(meter, "safe-seed", [111]);
      meter = advance.meter;
      expect(advance.targetId).toBeNull();
    }
    for (let step = 0; step < AMBUSH_GUARANTEE_AT; step += 1) {
      const advance = advanceEncounterMeter(meter, "safe-seed", [111]);
      meter = advance.meter;
      if (advance.targetId !== null) {
        targetId = advance.targetId;
        break;
      }
    }
    expect(targetId).toBe(111);
    expect(meter.safeStepsRemaining).toBe(POST_BATTLE_SAFE_STEPS);
  });

  it("同一 Seed、移动计数和候选牌得到相同结果，且没有候选时不触发", () => {
    const meter = { totalMoves: 42, stepsSinceEncounter: 13, safeStepsRemaining: 0 };
    expect(advanceEncounterMeter(meter, "repeatable", [311, 111, 211])).toEqual(
      advanceEncounterMeter(meter, "repeatable", [211, 311, 111]),
    );
    expect(advanceEncounterMeter(meter, "repeatable", []).targetId).toBeNull();
  });
});
