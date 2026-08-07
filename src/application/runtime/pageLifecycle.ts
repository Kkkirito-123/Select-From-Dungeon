/**
 * 页面可见性生命周期适配器。
 *
 * 页面隐藏时先刷新存档、暂停 Phaser 并停止/挂起音频；页面恢复时唤醒
 * 运行时。它只编排传入的边界，不持有 GameSession，也不改变游戏规则。
 */
export interface RuntimeLoop {
  running: boolean;
  sleep(): void;
  wake(seamless?: boolean): void;
}

export interface RuntimeAudio {
  setPageHidden(hidden: boolean): Promise<void>;
}

export interface PageVisibilityRuntime {
  hidden: boolean;
  root: HTMLElement;
  loop: RuntimeLoop | null;
  audio: RuntimeAudio;
  flushProgress(): void;
}

/** 对持久化、渲染和音频统一应用同一套页面可见性边界。 */
export async function applyPageVisibilityRuntime(
  runtime: PageVisibilityRuntime,
): Promise<void> {
  runtime.root.dataset.runtimeState = runtime.hidden ? "paused" : "active";
  if (runtime.hidden) {
    runtime.flushProgress();
    runtime.loop?.sleep();
  } else if (runtime.loop && !runtime.loop.running) {
    runtime.loop.wake(true);
  }
  await runtime.audio.setPageHidden(runtime.hidden);
}
