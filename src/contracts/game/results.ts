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
