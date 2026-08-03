/** 页面可见性生命周期契约：暂停渲染、音频和定时任务，并在恢复时安全唤醒。 */
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
