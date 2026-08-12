/**
 * 管理员战斗输入辅助。
 *
 * 这里只决定什么时候把快照中的管理员答案写入输入框，不参与 SQL 执行、
 * 判题、奖励或存档。快照中的答案只在管理员战斗状态下存在，普通模式会
 * 被 GameSession 投影为 null。
 */
import type { GameSnapshot } from "../../contracts/game/snapshots";

export function shouldAutofillAdminAnswer(
  previous: GameSnapshot | null,
  current: GameSnapshot,
): boolean {
  if (!current.adminMode || current.mode !== "combat" || !current.adminAnswerSql) {
    return false;
  }
  if (!previous || previous.mode !== "combat") return true;
  return previous.lessonStageId !== current.lessonStageId ||
    previous.combat?.targetId !== current.combat?.targetId;
}

export function adminAnswerForInput(snapshot: GameSnapshot): string | null {
  return snapshot.adminMode && snapshot.mode === "combat"
    ? snapshot.adminAnswerSql
    : null;
}
