/**
 * 游戏动作和 SQL 结果的跨层返回值。
 *
 * 这些类型只描述领域动作的结果，不包含 DOM、Phaser 或存储副作用。
 */
export type {
  AnswerAttemptRecord,
  AnswerResult,
  BattleOutcome,
  ExperienceSettlement,
  GateChallengeResolution,
  InteractionResolution,
  InventoryResolution,
  MoveResolution,
  PatrolBatchResolution,
  PatrolMove,
  QueryEvaluation,
  QueryResultDisclosure,
  SqlQueryResult,
  TravelResolution,
  TurnResolution,
} from "../../domain/shared/types";

/**
 * 篝火展示的当前楼层 SQL 复盘。
 *
 * 这是游戏领域的只读结果，不代表模型输出，也不允许反向修改存档。
 */
export interface CampfireReview {
  available: boolean;
  headline: string;
  facts: readonly string[];
  focusConcept: string | null;
  nextAction: string;
  /** Agent 成功返回时显示的短复盘；本地降级结果可以为空。 */
  message?: string | null;
}
