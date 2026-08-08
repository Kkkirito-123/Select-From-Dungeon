/**
 * 作答 Hook。
 *
 * 每次战斗写入 AnswerAttemptRecord 后只标记当前楼层证据为 dirty，不发送
 * 请求。篝火 Hook 在靠近篝火时读取这个标记并决定是否启动复盘流程。
 */
import type { Hook } from "./registry";
import type { Trigger } from "../triggers/events";

export class AnswerHook implements Hook {
  private readonly dirtyFloors = new Set<number>();

  handle(event: Trigger): void {
    if (event.type === "answer") this.dirtyFloors.add(event.snapshot.floor);
  }

  isDirty(floor: number): boolean {
    return this.dirtyFloors.has(floor);
  }

  clear(floor: number): void {
    this.dirtyFloors.delete(floor);
  }

  destroy(): void {
    this.dirtyFloors.clear();
  }
}
