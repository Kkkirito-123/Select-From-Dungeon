import { describe, expect, it, vi } from "vitest";
import {
  GameRuntime,
  type GameRuntimeResources,
} from "../src/features/game-runtime/GameRuntime";

interface FakeTarget {
  added: string[];
  removed: string[];
  listeners: Map<string, EventListenerOrEventListenerObject>;
  visibilityState?: Document["visibilityState"];
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  dispatch(type: string): void;
}

function target(visibilityState?: Document["visibilityState"]): FakeTarget {
  return {
    added: [],
    removed: [],
    listeners: new Map(),
    visibilityState,
    addEventListener(type, listener) {
      this.added.push(type);
      this.listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      this.removed.push(type);
      if (this.listeners.get(type) === listener) this.listeners.delete(type);
    },
    dispatch(type) {
      const listener = this.listeners.get(type);
      if (typeof listener === "function") listener(new Event(type));
      else listener?.handleEvent(new Event(type));
    },
  };
}

describe("GameRuntime", () => {
  it("destroy is idempotent and removes lifecycle listeners", () => {
    const windowTarget = target();
    const documentTarget = target();
    const calls: string[] = [];
    const resources: GameRuntimeResources = {
      persistence: {
        flush: () => calls.push("flush"),
        destroy: () => calls.push("persistence"),
      },
      disconnectTriggers: () => calls.push("triggers"),
      unsubscribeAgentEvents: () => calls.push("agent-events"),
      agentRuntime: { destroy: () => calls.push("agent") },
      learningRecorder: { destroy: () => calls.push("learning") },
      presenceClient: { destroy: () => calls.push("presence") },
      removeDungeonAgentBridge: () => calls.push("bridge"),
      app: { destroy: () => calls.push("app") },
      game: { destroy: () => calls.push("game") },
      audio: { dispose: async () => { calls.push("audio"); } },
      data: {
        loadRun: () => null,
        loadProfile: () => ({}) as never,
        saveRun: () => undefined,
        saveProfile: () => undefined,
        close: () => { calls.push("data"); },
      },
    };
    const runtime = new GameRuntime(resources);
    runtime.attachLifecycle(
      windowTarget,
      documentTarget,
      { dataset: {} } as HTMLElement,
      { setPageHidden: async () => undefined },
      null,
    );

    runtime.destroy();
    runtime.destroy();

    expect(windowTarget.added).toEqual(["pagehide", "beforeunload"]);
    expect(documentTarget.added).toEqual(["visibilitychange"]);
    expect(windowTarget.removed).toEqual(["pagehide", "beforeunload"]);
    expect(documentTarget.removed).toEqual(["visibilitychange"]);
    expect(calls).toEqual([
      "flush",
      "persistence",
      "triggers",
      "agent-events",
      "agent",
      "learning",
      "presence",
      "bridge",
      "app",
      "game",
      "audio",
      "data",
    ]);
  });

  it("continues partial cleanup after one resource throws", () => {
    const calls: string[] = [];
    const runtime = new GameRuntime({
      disconnectTriggers: () => { throw new Error("disconnect"); },
      unsubscribeAgentEvents: () => calls.push("agent-events"),
      app: { destroy: () => calls.push("app") },
    });

    runtime.destroy();

    expect(calls).toEqual(["agent-events", "app"]);
  });

  it("uses the injected visibility target and contains async lifecycle failures", async () => {
    const windowTarget = target();
    const documentTarget = target("hidden");
    const root = { dataset: {} } as HTMLElement;
    const calls: string[] = [];
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = new GameRuntime({
      persistence: {
        flush: () => calls.push("flush"),
        destroy: () => undefined,
      },
    });
    const lifecycleAudio = {
      setPageHidden: async (hidden: boolean) => {
        calls.push(hidden ? "hidden" : "visible");
        if (hidden) throw new Error("audio unavailable");
      },
    };

    runtime.attachLifecycle(windowTarget, documentTarget, root, lifecycleAudio, null);
    documentTarget.dispatch("visibilitychange");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.dataset.runtimeState).toBe("paused");
    expect(calls).toEqual(["flush", "hidden"]);
    expect(errors).toHaveBeenCalledWith("页面可见性处理失败", expect.any(Error));
    errors.mockRestore();
    runtime.destroy();
  });

  it("contains rejected async resource disposal", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = new GameRuntime({
      audio: { dispose: async () => { throw new Error("close failed"); } },
    });

    runtime.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errors).toHaveBeenCalledWith("运行时资源清理失败", expect.any(Error));
    errors.mockRestore();
  });
});
