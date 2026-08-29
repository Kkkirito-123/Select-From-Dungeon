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

type GuidedPickupSnapshot = Pick<
  GameSnapshot,
  "runSeed" | "floor" | "keyItems" | "openedGateIds" | "guidedMap"
>;

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

/**
 * 把保证钥匙或死路补给的快照变化转换成一次性拾取反馈。
 * 只比较已发布状态，不修改会话或界面。
 */
export function guidedPickupBetween(
  previous: GuidedPickupSnapshot,
  next: GuidedPickupSnapshot,
): GroundItem | null {
  if (previous.runSeed !== next.runSeed || previous.floor !== next.floor) return null;
  const shortcut = next.guidedMap.shortcuts.find((entry) => (
    !previous.keyItems.includes(entry.keyId) &&
    next.keyItems.includes(entry.keyId)
  ));
  if (shortcut) {
    return {
      id: shortcut.keyId,
      sourceRoomId: shortcut.keyRoomNodeId,
      ...shortcut.keyPosition,
      name: "捷径钥匙",
      description: `保证开启${shortcut.name}；不会占用背包，也不依赖随机掉落。`,
      kind: "key",
      collection: "interact",
      rewardId: null,
    };
  }
  const cache = next.guidedMap.deadEndCaches.find((entry) => (
    !previous.openedGateIds.includes(entry.id) &&
    next.openedGateIds.includes(entry.id)
  ));
  if (!cache) return null;
  return {
    id: cache.id,
    sourceRoomId: cache.sourceRoomId,
    x: cache.x,
    y: cache.y,
    name: "死路补给",
    description: "空死路已替换为可选收益；打开后本 Run 不会重复刷新。",
    kind: "event",
    collection: "interact",
    rewardId: cache.rewardId,
  };
}
