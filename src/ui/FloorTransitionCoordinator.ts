/** 管理楼层结算后的延迟推进，确保传送只发生一次且可被销毁取消。 */
import type { GameSnapshot } from "../domain/types";

export interface FloorTransitionPolicyInput {
  mode: GameSnapshot["mode"];
  floor: number;
  finalVictoryReady: boolean;
  presentationBlocked: boolean;
}

export interface FloorTransitionPolicy {
  transitionVisible: boolean;
  victoryVisible: boolean;
  shouldScheduleAdvance: boolean;
}

export interface FloorTransitionClock {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timerId: number): void;
}

/**
 * 展示可见性与自动切层是两条独立通道。
 *
 * Boss 结算发生在钥匙领取之前，所以领取钥匙时经验结算卡可能仍覆盖
 * 传送演出。临时卡片可以隐藏演出，但不能阻止权威 transition 状态推进。
 */
export function floorTransitionPolicy({
  mode,
  floor,
  finalVictoryReady,
  presentationBlocked,
}: FloorTransitionPolicyInput): FloorTransitionPolicy {
  /** 根据当前快照计算是否允许自动进入下一层或显示最终胜利。 */
  const transitioning = mode === "transition" && floor < 8;
  return {
    transitionVisible: transitioning && !presentationBlocked,
    victoryVisible: finalVictoryReady && !presentationBlocked,
    shouldScheduleAdvance: transitioning,
  };
}

/**
 * 只负责“一次且仅一次”的切层时钟，不读取 DOM、不修改 GameSession。
 * AppShell 负责把权威状态同步进来，并在回调中执行界面清理与领域推进。
 */
export class FloorTransitionCoordinator {
  /** 对楼层推进定时器做幂等调度，并在页面销毁时取消。 */
  private timerId: number | null = null;

  constructor(
    private readonly clock: FloorTransitionClock,
    private readonly advance: () => void,
  ) {}

  sync(shouldScheduleAdvance: boolean, delayMs: number): void {
    if (!shouldScheduleAdvance) {
      this.cancel();
      return;
    }
    if (this.timerId !== null) return;
    this.timerId = this.clock.setTimeout(() => {
      this.timerId = null;
      this.advance();
    }, delayMs);
  }

  cancel(): void {
    if (this.timerId === null) return;
    this.clock.clearTimeout(this.timerId);
    this.timerId = null;
  }

  destroy(): void {
    this.cancel();
  }
}
