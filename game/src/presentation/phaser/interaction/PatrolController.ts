/**
 * Phaser 巡逻时钟与 GameSession 的连接边界。
 *
 * 巡逻路径和接触规则仍由 GameSession 决定；本模块只判断场景是否处于
 * 可以推进巡逻的状态，并返回一次领域结果，不负责移动精灵或触发战斗。
 */
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { PatrolBatchResolution } from "../../../contracts/game/results";

export interface PatrolSession {
  advanceMonsterPatrols(): PatrolBatchResolution;
}

export interface PatrolTickState {
  locked: boolean;
  pagePaused: boolean;
  sceneActive: boolean;
  guidanceLevel: GameSnapshot["navigationGuidance"]["level"];
  blockingOverlay: boolean;
}

/** 在满足场景运行条件时推进一次领域巡逻。 */
export function advancePatrolTick(
  session: PatrolSession,
  state: PatrolTickState,
  snapshotMode: GameSnapshot["mode"],
): PatrolBatchResolution | null {
  if (
    state.locked ||
    snapshotMode !== "explore" ||
    state.pagePaused ||
    state.blockingOverlay ||
    !state.sceneActive
  ) return null;
  return session.advanceMonsterPatrols();
}
