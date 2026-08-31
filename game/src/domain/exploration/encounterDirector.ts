/**
 * 确定性遭遇计量器。
 *
 * 每次合法移动只更新一次计数，并用 Run seed 和总步数生成稳定判定，因而
 * 刷新页面不会重新抽取结果。模块不创建怪物、不改变玩家生命，调用方
 * 负责把 targetId 转成实际遭遇。
 */
import { ENCOUNTER_RUNTIME_CONFIG } from "../../contracts/config/runtime";
import { stableStringHash } from "../progression/runGraph";

export const INITIAL_SAFE_STEPS: number = ENCOUNTER_RUNTIME_CONFIG.initialSafeSteps;
export const POST_BATTLE_SAFE_STEPS: number = ENCOUNTER_RUNTIME_CONFIG.postBattleSafeSteps;
export const AMBUSH_ROLL_START: number = ENCOUNTER_RUNTIME_CONFIG.ambushRollStart;
export const AMBUSH_CHANCE: number = ENCOUNTER_RUNTIME_CONFIG.ambushChance;
export const AMBUSH_CHANCE_MIN: number = ENCOUNTER_RUNTIME_CONFIG.ambushChanceMin;
export const AMBUSH_ANNEAL_SPAN: number = ENCOUNTER_RUNTIME_CONFIG.ambushAnnealSpan;
export const AMBUSH_GUARANTEE_AT: number = ENCOUNTER_RUNTIME_CONFIG.ambushGuaranteeAt;

/**
 * 余弦退火遭遇概率：随累计移动数从 AMBUSH_CHANCE 单调衰减到 AMBUSH_CHANCE_MIN，
 * 超过退火周期后钳制到最低值。保留确定性（只依赖 totalMoves，不引入随机）。
 */
export function ambushChanceAt(totalMoves: number): number {
  if (totalMoves <= 0) return AMBUSH_CHANCE;
  if (totalMoves >= AMBUSH_ANNEAL_SPAN) return AMBUSH_CHANCE_MIN;
  const progress = totalMoves / AMBUSH_ANNEAL_SPAN;
  const cosine = (1 + Math.cos(Math.PI * progress)) / 2;
  return AMBUSH_CHANCE_MIN + (AMBUSH_CHANCE - AMBUSH_CHANCE_MIN) * cosine;
}

export interface EncounterMeter {
  totalMoves: number;
  stepsSinceEncounter: number;
  safeStepsRemaining: number;
}

export interface EncounterAdvance {
  meter: EncounterMeter;
  targetId: number | null;
}

export interface WeightedEncounterCandidate {
  monsterId: number;
  weight: number;
}

function hashUnit(value: string): number {
  return stableStringHash(value) / 0x1_0000_0000;
}

/** 每次有效移动只进行一次确定性判定，重新加载页面不能重抽结果。 */
export function advanceEncounterMeter(
  current: EncounterMeter,
  seed: string,
  candidates: readonly WeightedEncounterCandidate[],
): EncounterAdvance {
  const meter = {
    totalMoves: current.totalMoves + 1,
    stepsSinceEncounter: current.stepsSinceEncounter,
    safeStepsRemaining: Math.max(0, current.safeStepsRemaining - 1),
  };
  if (current.safeStepsRemaining > 0 || candidates.length === 0) {
    return { meter, targetId: null };
  }

  meter.stepsSinceEncounter += 1;
  if (meter.stepsSinceEncounter < AMBUSH_ROLL_START) {
    return { meter, targetId: null };
  }

  const shouldTrigger = meter.stepsSinceEncounter >= AMBUSH_GUARANTEE_AT ||
    hashUnit(`${seed}:ambush-roll:${meter.totalMoves}`) < ambushChanceAt(meter.totalMoves);
  if (!shouldTrigger) return { meter, targetId: null };

  const ordered = [...candidates]
    .filter((candidate) => Number.isFinite(candidate.weight) && candidate.weight > 0)
    .sort((left, right) => left.monsterId - right.monsterId);
  const totalWeight = ordered.reduce((total, candidate) => total + candidate.weight, 0);
  if (totalWeight <= 0) return { meter, targetId: null };
  const roll = hashUnit(`${seed}:ambush-card:${meter.totalMoves}`) * totalWeight;
  let accumulated = 0;
  let targetId = ordered.at(-1)?.monsterId ?? null;
  for (const candidate of ordered) {
    accumulated += candidate.weight;
    if (roll < accumulated) {
      targetId = candidate.monsterId;
      break;
    }
  }
  return {
    meter: {
      ...meter,
      stepsSinceEncounter: 0,
      safeStepsRemaining: POST_BATTLE_SAFE_STEPS,
    },
    targetId,
  };
}

/**
 * 同一区域仍有其他合法目标时，最近两个遭遇若都是同一 ID，则第三次排除它。
 * 调用方传入从新到旧的最近战斗 ID；空候选时回退原池，避免破坏保底遭遇。
 */
export function suppressThirdConsecutiveEncounter(
  candidates: readonly WeightedEncounterCandidate[],
  recentMonsterIds: readonly number[],
): WeightedEncounterCandidate[] {
  const [latest, previous] = recentMonsterIds;
  if (latest === undefined || latest !== previous) return [...candidates];
  const alternatives = candidates.filter(
    (candidate) => candidate.monsterId !== latest,
  );
  return alternatives.length > 0 ? alternatives : [...candidates];
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
