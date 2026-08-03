/** 验证页面隐藏/恢复时渲染循环、音频和存档刷新的生命周期边界。 */
import { describe, expect, it, vi } from "vitest";
import { applyPageVisibilityRuntime } from "../src/runtime/pageLifecycle";

describe("page visibility runtime", () => {
  it("隐藏时同步存档并暂停渲染、音频，恢复时无缝唤醒", async () => {
    const root = { dataset: {} } as HTMLElement;
    const loop = {
      running: true,
      sleep: vi.fn(() => {
        loop.running = false;
      }),
      wake: vi.fn(() => {
        loop.running = true;
      }),
    };
    const audio = { setPageHidden: vi.fn(async () => undefined) };
    const flushProgress = vi.fn();

    await applyPageVisibilityRuntime({
      hidden: true,
      root,
      loop,
      audio,
      flushProgress,
    });
    expect(root.dataset.runtimeState).toBe("paused");
    expect(flushProgress).toHaveBeenCalledOnce();
    expect(loop.sleep).toHaveBeenCalledOnce();
    expect(audio.setPageHidden).toHaveBeenLastCalledWith(true);

    await applyPageVisibilityRuntime({
      hidden: false,
      root,
      loop,
      audio,
      flushProgress,
    });
    expect(root.dataset.runtimeState).toBe("active");
    expect(loop.wake).toHaveBeenCalledWith(true);
    expect(audio.setPageHidden).toHaveBeenLastCalledWith(false);
  });
});
