import { describe, expect, it } from "vitest";
import type { StorageLike } from "../src/contracts/storage/storageLike";
import { GUIDE_KEY } from "../src/contracts/storage/keys";
import { GameSession } from "../src/domain/session/GameSession";
import { BrowserDataStore } from "../src/infrastructure/storage/browserDataStore";
import { createEmptyProfile, PROFILE_SAVE_KEY, RUN_SAVE_KEY } from "../src/infrastructure/storage/localProgress";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("浏览器数据仓库", () => {
  it("IndexedDB 不可用时保留旧存储回退", async () => {
    const old = new MemoryStorage();
    const run = new GameSession(null, null, "data-store-fallback").toSavedRun();
    const profile = createEmptyProfile();
    profile.victories = 2;
    old.setItem(RUN_SAVE_KEY, JSON.stringify(run));
    old.setItem(PROFILE_SAVE_KEY, JSON.stringify(profile));

    const store = await BrowserDataStore.open(old, null);
    expect(store.loadRun()).toEqual(run);
    expect(store.loadProfile()).toEqual(profile);

    store.setItem(GUIDE_KEY, JSON.stringify({ version: 1, finished: true, skipped: false }));
    expect(store.getItem(GUIDE_KEY)).toContain("finished");
    store.close();
  });
});
