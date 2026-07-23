import { describe, expect, it } from "vitest";
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

describe("ArcadeAudio", () => {
  it("在无 AudioContext 的测试环境中安全降级", async () => {
    const audio = new ArcadeAudio();

    expect(ArcadeAudio.isSupported()).toBe(false);
    expect(audio.ready).toBe(false);
    expect(await audio.initialize()).toBe(false);
    expect(await audio.resume()).toBe(false);
    await expect(audio.playSfx("step")).resolves.toBe(false);
    await expect(audio.dispose()).resolves.toBeUndefined();
    expect(await audio.initialize()).toBe(false);
  });

  it("公开状态可配置、音量会收敛到有效范围", () => {
    const audio = new ArcadeAudio({ mode: "combat", volume: 9 });

    expect(audio.mode).toBe("combat");
    expect(audio.volume).toBe(1);
    audio.setMode("boss");
    audio.setVolume(-3);
    expect(audio.mode).toBe("boss");
    expect(audio.volume).toBe(0);
    expect(audio.toggleMuted()).toBe(true);
    expect(audio.muted).toBe(true);
    expect(audio.toggleMuted()).toBe(false);
  });

  it("第二层切换到独立的古典芯片与原创太空战斗歌单", () => {
    const audio = new ArcadeAudio({ mode: "explore" });
    audio.setFloor(2);
    expect([
      "beethoven-fifth-thunder-bus",
      "beethoven-elise-packet",
      "beethoven-moonlight-voltage",
    ]).toContain(audio.trackId);
    audio.setMode("combat");
    expect(audio.trackId).toBe("relation-storm-pursuit");
    audio.setMode("boss");
    expect(audio.trackId).toBe("conductor-singularity");
  });

  it("所有新反馈与旧别名在静音状态都可无设备调用", async () => {
    const audio = new ArcadeAudio({ muted: true });
    const results = await Promise.all(ALL_SFX.map((effect) => audio.playSfx(effect)));

    expect(results).toEqual(ALL_SFX.map(() => false));
    await audio.dispose();
  });

  it("探索曲目随机换曲时不会连续重复，并记录公版音乐来源", () => {
    expect(ARCADE_MUSIC_CREDITS).toHaveLength(6);
    for (let current = 0; current < 4; current += 1) {
      for (const random of [0, 0.25, 0.5, 0.999]) {
        expect(chooseNextTrackIndex(4, current, random)).not.toBe(current);
      }
    }
  });
});
