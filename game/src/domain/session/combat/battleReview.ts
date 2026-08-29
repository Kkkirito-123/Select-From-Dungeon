/** 战斗复盘游标与回答记录的边界服务；只修改调用方提供的集合。 */
import { MAX_ANSWER_HISTORY } from "../../shared/types";
import type { AnswerAttemptRecord } from "../../shared/types";

export interface BattleReviewState {
  battleSequence: number;
  reviewBattleId: number | null;
}

/** Start a review and return its stable battle id. */
export function beginBattleReview(state: BattleReviewState): number {
  state.battleSequence += 1;
  state.reviewBattleId = state.battleSequence;
  return state.reviewBattleId;
}

/** Append a defensive record while enforcing the current bounded history. */
export function appendAnswerRecord(
  records: AnswerAttemptRecord[],
  record: AnswerAttemptRecord,
): void {
  records.push({ ...record });
  if (records.length > MAX_ANSWER_HISTORY) {
    records.splice(0, records.length - MAX_ANSWER_HISTORY);
  }
}

/** Return the most recent distinct encounter monster ids. */
export function recentEncounterMonsterIds(
  records: readonly AnswerAttemptRecord[],
  limit: number,
): number[] {
  const battleIds = new Set<number>();
  const monsterIds: number[] = [];
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || battleIds.has(record.battleId)) continue;
    battleIds.add(record.battleId);
    monsterIds.push(record.monsterId);
    if (monsterIds.length >= limit) break;
  }
  return monsterIds;
}
