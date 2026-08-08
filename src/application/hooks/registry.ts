/**
 * Hook 注册与生命周期。
 *
 * Registry 连接 TriggerBus 和 GameSession，Hook 本身不订阅 DOM、存档或
 * Phaser。销毁时先停止事件源，避免异步页面退出后继续发起请求。
 */
import type { SnapshotSource } from "../triggers/bus";
import { TriggerBus } from "../triggers/bus";
import type { Trigger } from "../triggers/events";

export interface Hook {
  handle(event: Trigger): void;
  destroy?(): void;
}
export class HookRegistry {
  private readonly hooks: Hook[] = [];
  private unsubscribeBus: (() => void) | null = null;
  private unsubscribeSource: (() => void) | null = null;

  constructor(private readonly bus: TriggerBus) {}

  add(hook: Hook): this {
    this.hooks.push(hook);
    return this;
  }

  start(source: SnapshotSource): void {
    this.stop();
    this.unsubscribeBus = this.bus.subscribe((event) => {
      this.hooks.forEach((hook) => hook.handle(event));
    });
    this.unsubscribeSource = this.bus.connect(source);
  }

  stop(): void {
    this.unsubscribeSource?.();
    this.unsubscribeSource = null;
    this.unsubscribeBus?.();
    this.unsubscribeBus = null;
    this.hooks.forEach((hook) => hook.destroy?.());
  }
}
