/**
 * 从 GameSession 快照变化中提取低频语义事件。
 *
 * Bus 只负责比较前后快照和广播事件，不决定哪个 Agent 是否执行。这样
 * 新增死亡复盘或抄写员 Hook 时，不需要把判断逻辑塞进 GameSession。
 */
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { Trigger, TriggerListener } from "./events";
import { inCampfireRange } from "./policy";

export interface SnapshotSource {
  subscribe(listener: (snapshot: GameSnapshot) => void): () => void;
}

function newlyAddedAnswers(
  previous: GameSnapshot,
  snapshot: GameSnapshot,
): Trigger[] {
  const previousIds = new Set(previous.floorReview.map((record) => record.id));
  return snapshot.floorReview
    .filter((record) => !previousIds.has(record.id))
    .sort((left, right) => left.id - right.id)
    .map((record) => ({
      type: "answer" as const,
      snapshot,
      previous,
      record,
    }));
}

export class TriggerBus {
  private readonly listeners = new Set<TriggerListener>();

  subscribe(listener: TriggerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(source: SnapshotSource): () => void {
    let previous: GameSnapshot | null = null;
    return source.subscribe((snapshot) => {
      const oldSnapshot = previous;
      if (oldSnapshot) {
        newlyAddedAnswers(oldSnapshot, snapshot).forEach((event) => this.emit(event));
        if (oldSnapshot.floor !== snapshot.floor) {
          this.emit({ type: "floor", snapshot, previous: oldSnapshot });
        }
        if (
          oldSnapshot.mode !== "defeat" &&
          oldSnapshot.mode !== "death-review" &&
          (snapshot.mode === "defeat" || snapshot.mode === "death-review")
        ) {
          this.emit({ type: "death", snapshot, previous: oldSnapshot });
        }
      }

      snapshot.campfires.forEach((campfire) => {
        const entered = inCampfireRange(snapshot, campfire.id) && (
          oldSnapshot === null || !inCampfireRange(oldSnapshot, campfire.id)
        );
        if (entered) {
          this.emit({
            type: "campfire",
            snapshot,
            previous: oldSnapshot,
            campfireId: campfire.id,
          });
        }
      });
      previous = snapshot;
    });
  }

  private emit(event: Trigger): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
