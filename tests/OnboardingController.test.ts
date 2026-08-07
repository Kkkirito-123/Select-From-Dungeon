import { describe, expect, it } from "vitest";
import {
  ONBOARDING_SAVE_KEY,
  OnboardingController,
  type OnboardingStorage,
} from "../src/presentation/dom/OnboardingController";

class MemoryStorage implements OnboardingStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

class BlockedStorage implements OnboardingStorage {
  getItem(): string | null { throw new DOMException("blocked", "SecurityError"); }
  setItem(): void { throw new DOMException("blocked", "SecurityError"); }
  removeItem(): void { throw new DOMException("blocked", "SecurityError"); }
}

describe("OnboardingController", () => {
  it("只接受当前步骤对应的真实里程碑", () => {
    const guide = new OnboardingController(new MemoryStorage());
    expect(guide.snapshot().step.id).toBe("move");
    expect(guide.advance("terminal-open")).toBe(false);
    expect(guide.advance("player-step")).toBe(true);
    expect(guide.snapshot().step.id).toBe("find-monster");
    expect(guide.advance("encounter-start")).toBe(true);
    expect(guide.advance("terminal-open")).toBe(true);
    expect(guide.advance("query-accepted")).toBe(true);
    expect(guide.snapshot().step.id).toBe("pickup");
  });

  it("完整闭环后持久化，下一次启动不再自动打断", () => {
    const storage = new MemoryStorage();
    const guide = new OnboardingController(storage);
    (["player-step", "encounter-start", "terminal-open", "query-accepted", "item-pickup"] as const)
      .forEach((event) => guide.advance(event));
    expect(guide.snapshot()).toMatchObject({ finished: true, visible: false, skipped: false });
    expect(storage.values.has(ONBOARDING_SAVE_KEY)).toBe(true);
    expect(new OnboardingController(storage).snapshot()).toMatchObject({
      finished: true,
      visible: false,
    });
  });

  it("支持跳过和重播", () => {
    const storage = new MemoryStorage();
    const guide = new OnboardingController(storage);
    guide.skip();
    expect(guide.snapshot()).toMatchObject({ finished: true, skipped: true });
    guide.replay();
    expect(guide.snapshot()).toMatchObject({ finished: false, skipped: false, visible: true });
    expect(guide.snapshot().step.id).toBe("move");
    expect(storage.values.has(ONBOARDING_SAVE_KEY)).toBe(false);
  });

  it("存储不可用时仍能完成当前页面引导", () => {
    const guide = new OnboardingController(new BlockedStorage());
    expect(() => {
      guide.advance("player-step");
      guide.skip();
      guide.replay();
    }).not.toThrow();
    expect(guide.snapshot().step.id).toBe("move");
  });
});
