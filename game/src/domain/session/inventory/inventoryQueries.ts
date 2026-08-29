/** 背包和地面战利品的只读投影；不修改会话状态。 */
import { rewardDetails } from "../../../content/world/runContent";
import type { RoomGraph } from "../../progression/runGraph";
import type {
  ClaimableReward,
  GroundItem,
  LessonId,
  LootDrop,
  Weapon,
} from "../../shared/types";

/** Query context is limited to the fields needed by the two projections. */
export interface InventoryQueryContext {
  groundItems: readonly GroundItem[];
  currentRoomId: string;
  graph: Pick<RoomGraph, "nodes">;
  completedLessons: ReadonlySet<LessonId>;
}

/** Return the first loose weapon as a defensive player-facing projection. */
export function availableWeaponLoot(
  groundItems: readonly GroundItem[],
): LootDrop | null {
  const item = groundItems.find(
    (entry): entry is GroundItem & { weapon: Weapon } => Boolean(entry.weapon),
  );
  return item ? { x: item.x, y: item.y, weapon: { ...item.weapon } } : null;
}

/** Return the current room reward only after its lesson prerequisite is complete. */
export function claimableRoomReward(
  context: InventoryQueryContext,
): ClaimableReward | null {
  const item = context.groundItems.find(
    (entry) => (
      entry.sourceRoomId === context.currentRoomId &&
      entry.collection === "interact"
    ),
  );
  if (!item?.rewardId) return null;
  const room = context.graph.nodes.find((entry) => entry.id === item.sourceRoomId);
  if (room?.lessonId && !context.completedLessons.has(room.lessonId)) return null;
  return rewardDetails(item.rewardId);
}
