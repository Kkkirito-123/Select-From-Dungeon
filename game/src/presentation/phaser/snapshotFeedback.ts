/**
 * 快照前后差异到反馈事件的转换辅助。
 * 只比较已发布状态并生成语义反馈，不直接播放音频、不改变领域状态。
 */
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { GroundItem } from "../../domain/shared/types";

type FeedbackSnapshot = Pick<
  GameSnapshot,
  "runSeed" | "groundItems" | "completedLessons" | "availableRoomIds" | "mode"
> & { mazeFloor: Pick<GameSnapshot["mazeFloor"], "gates"> };

type SnapshotGate = FeedbackSnapshot["mazeFloor"]["gates"][number];

export function newlyOpenedGate(
  previous: FeedbackSnapshot,
  next: FeedbackSnapshot,
): SnapshotGate | null {
  if (previous.runSeed !== next.runSeed) return null;
  return next.mazeFloor.gates.find(
    (gate) => !previous.availableRoomIds.includes(gate.roomNodeId)
      && next.availableRoomIds.includes(gate.roomNodeId),
  ) ?? null;
}

export function pickedItemsBetween(
  previous: FeedbackSnapshot,
  next: FeedbackSnapshot,
): GroundItem[] {
  if (previous.runSeed !== next.runSeed) return [];
  return previous.groundItems.filter((item) => {
    const removed = !next.groundItems.some((candidate) => candidate.id === item.id);
    const victoryOwnsKeyFeedback = item.kind === "key" && next.mode === "victory";
    return removed && !victoryOwnsKeyFeedback;
  });
}
