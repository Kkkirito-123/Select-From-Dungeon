import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARCADE_MUSIC_CREDITS,
  ArcadeAudio,
  chooseNextTrackIndex,
  type ArcadeSfx,
} from "../src/audio/ArcadeAudio";

const ALL_SFX = [
  "step",
  "bump",
  "encounter",
  "query-cast",
  "enemy-hurt",
  "player-hurt",
  "stage-clear",
  "drop",
  "pickup-weapon",
  "pickup-relic",
  "heal",
  "gate",
  "victory",
  "defeat",
  "room",
  "attack",
  "hit",
  "reward",
] as const satisfies readonly ArcadeSfx[];

class FakeAudioParam {
  value = 1;

  cancelScheduledValues(): void {}
  setValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }
}

class FakeAudioNode {
  connect(): this {
    return this;
  }
  disconnect(): void {}
}

class FakeSourceNode extends FakeAudioNode {
  private ended: (() => void) | null = null;

  addEventListener(_name: string, listener: () => void): void {
    this.ended = listener;
  }
  start(): void {}
  stop(): void {
    this.ended?.();
    this.ended = null;
  }
}

class FakeOscillatorNode extends FakeSourceNode {
  type: OscillatorType = "sine";
  frequency = new FakeAudioParam();
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = "lowpass";
  Q = new FakeAudioParam();
  frequency = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeSourceNode {
  buffer: unknown = null;
}

class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  sampleRate = 8_000;
  destination = new FakeAudioNode();

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createBiquadFilter(): FakeBiquadFilterNode {
    return new FakeBiquadFilterNode();
  }
  createOscillator(): FakeOscillatorNode {
    return new FakeOscillatorNode();
  }
  createBufferSource(): FakeBufferSourceNode {
    return new FakeBufferSourceNode();
  }
  createBuffer(_channels: number, frameCount: number): { getChannelData: () => Float32Array } {
    return { getChannelData: () => new Float32Array(frameCount) };
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  async suspend(): Promise<void> {
    this.state = "suspended";
  }
  async resume(): Promise<void> {
    this.state = "running";
  }
  async close(): Promise<void> {
    this.state = "closed";
  }
}

describe("ArcadeAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("在无 AudioContext 的测试环境中安全降级", async () => {
    const audio = new ArcadeAudio();

    expect(ArcadeAudio.isSupported()).toBe(false);
    expect(audio.ready).toBe(false);
    expect(await audio.initialize()).toBe(false);
    expect(await audio.resume()).toBe(false);
    await expect(audio.playSfx("step")).resolves.toBe(false);
    await expect(audio.setPageHidden(true)).resolves.toBeUndefined();
    await expect(audio.setPageHidden(false)).resolves.toBeUndefined();
    await expect(audio.dispose()).resolves.toBeUndefined();
    expect(await audio.initialize()).toBe(false);
  });

  it("公开状态可配置、音量会收敛到有效范围", () => {
    const audio = new ArcadeAudio({ mode: "combat", volume: 9 });

    expect(audio.mode).toBe("combat");
    expect(audio.focus).toBe("world");
    expect(audio.volume).toBe(1);
    audio.setMode("boss");
    audio.setFocus("thinking");
    audio.setVolume(-3);
    expect(audio.mode).toBe("boss");
    expect(audio.focus).toBe("thinking");
    expect(audio.volume).toBe(0);
    expect(audio.toggleMuted()).toBe(true);
    expect(audio.muted).toBe(true);
    expect(audio.toggleMuted()).toBe(false);
  });

  it("八层均切换到各自的原创程序化乐谱", () => {
    const audio = new ArcadeAudio({ mode: "explore" });
    const trackIds = Array.from({ length: 8 }, (_, index) => {
      audio.setFloor((index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8);
      return audio.trackId;
    });

    expect(new Set(trackIds).size).toBe(8);
    trackIds.forEach((trackId, index) => {
      expect(trackId).toMatch(new RegExp(`^f${index + 1}-`));
    });
  });

  it("原子场景 API 一次更新楼层、区域与模式，旧 setter 保持兼容", () => {
    const audio = new ArcadeAudio({ mode: "explore" });
    audio.setScene({ floor: 6, region: 2, mode: "combat" });

    expect(audio.scene).toEqual({ floor: 6, region: 2, mode: "combat" });
    expect(audio.trackId).toMatch(/^f6-dragon-ridge-combat-r2/);

    audio.setFloor(7);
    audio.setRegion(1.9);
    audio.setMode("boss");
    expect(audio.scene).toEqual({ floor: 7, region: 1, mode: "boss" });
    expect(audio.trackId).toMatch(/^f7-sunset-index-garden-boss-r1/);
  });

  it("重复场景不改曲目，同层区域切换只重定向到新的区域乐句", () => {
    const audio = new ArcadeAudio({ mode: "explore" });
    audio.setScene({ floor: 2, region: 0, mode: "explore" });
    const firstTrack = audio.trackId;

    audio.setScene({ floor: 2, region: 0, mode: "explore" });
    expect(audio.trackId).toBe(firstTrack);

    audio.setScene({ floor: 2, region: 1, mode: "explore" });
    expect(audio.trackId).toMatch(/^f2-tidal-archipelago-explore-r1/);
  });

  it("所有新反馈与旧别名在静音状态都可无设备调用", async () => {
    const audio = new ArcadeAudio({ muted: true });
    const results = await Promise.all(ALL_SFX.map((effect) => audio.playSfx(effect)));

    expect(results).toEqual(ALL_SFX.map(() => false));
    await audio.dispose();
  });

  it("活动 AudioContext 下隐藏、静音、恢复与清理仍能安全收口", async () => {
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const audio = new ArcadeAudio();

    expect(await audio.initialize()).toBe(true);
    expect(audio.ready).toBe(true);
    audio.setScene({ floor: 8, region: 2, mode: "boss" });
    audio.setFocus("resolving");
    audio.setMuted(true);
    expect(audio.muted).toBe(true);
    await audio.setPageHidden(true);
    expect(audio.ready).toBe(false);
    audio.setMuted(false);
    await audio.setPageHidden(false);
    expect(audio.ready).toBe(true);
    await audio.dispose();
    expect(audio.ready).toBe(false);
    await expect(audio.setPageHidden(true)).resolves.toBeUndefined();
  });

  it("探索乐句换奏时不会连续重复，运行时声明公共领域改编且不使用外部录音", () => {
    expect(ARCADE_MUSIC_CREDITS).toEqual([
      "MVP 2.0 八层公共领域古典主题电子改编（项目内重新配器与合成；不使用外部录音）",
      "Mozart / Handel / Vivaldi / Bach / Dvořák / Tchaikovsky / Beethoven 的公共领域作品主题",
    ]);
    for (let current = 0; current < 4; current += 1) {
      for (const random of [0, 0.25, 0.5, 0.999]) {
        expect(chooseNextTrackIndex(4, current, random)).not.toBe(current);
      }
    }
  });
});
