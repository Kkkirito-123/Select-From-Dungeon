import { stableStringHash } from "./runGraph";

export const INITIAL_SAFE_STEPS = 5;
export const POST_BATTLE_SAFE_STEPS = 5;
export const AMBUSH_ROLL_START = 1;
export const AMBUSH_CHANCE = 0.02;
export const AMBUSH_GUARANTEE_AT = 30;

export interface EncounterMeter {
  totalMoves: number;
  stepsSinceEncounter: number;
  safeStepsRemaining: number;
}

export interface EncounterAdvance {
  meter: EncounterMeter;
  targetId: number | null;
}

function hashUnit(value: string): number {
  return stableStringHash(value) / 0x1_0000_0000;
}

/** One deterministic roll per successful movement step; reloads cannot reroll it. */
export function advanceEncounterMeter(
  current: EncounterMeter,
  seed: string,
  candidateIds: readonly number[],
): EncounterAdvance {
  const meter = {
    totalMoves: current.totalMoves + 1,
    stepsSinceEncounter: current.stepsSinceEncounter,
    safeStepsRemaining: Math.max(0, current.safeStepsRemaining - 1),
  };
  if (current.safeStepsRemaining > 0 || candidateIds.length === 0) {
    return { meter, targetId: null };
  }

  meter.stepsSinceEncounter += 1;
  if (meter.stepsSinceEncounter < AMBUSH_ROLL_START) {
    return { meter, targetId: null };
  }

  const shouldTrigger = meter.stepsSinceEncounter >= AMBUSH_GUARANTEE_AT ||
    hashUnit(`${seed}:ambush-roll:${meter.totalMoves}`) < AMBUSH_CHANCE;
  if (!shouldTrigger) return { meter, targetId: null };

  const ordered = [...candidateIds].sort((a, b) => a - b);
  const targetIndex = Math.floor(
    hashUnit(`${seed}:ambush-card:${meter.totalMoves}`) * ordered.length,
  );
  return {
    meter: {
      ...meter,
      stepsSinceEncounter: 0,
      safeStepsRemaining: POST_BATTLE_SAFE_STEPS,
    },
    targetId: ordered[Math.min(targetIndex, ordered.length - 1)] ?? null,
  };
}

export function recordSafeZoneMovement(current: EncounterMeter): EncounterMeter {
  return {
    ...current,
    totalMoves: current.totalMoves + 1,
  };
}

export function resetEncounterMeterAfterBattle(current: EncounterMeter): EncounterMeter {
  return {
    ...current,
    stepsSinceEncounter: 0,
    safeStepsRemaining: POST_BATTLE_SAFE_STEPS,
  };
}
