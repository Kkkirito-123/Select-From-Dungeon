import { describe, expect, it } from "vitest";
import {
  FLOOR_SCORE_PROFILES,
  classifyScoreSceneTransition,
  musicPatternsForScene,
  type ArcadeMusicMode,
  type DungeonFloor,
} from "../src/infrastructure/audio/musicScore";

const MODES = ["explore", "combat", "boss"] as const satisfies readonly ArcadeMusicMode[];

describe("musicScore", () => {
  it("定义连续八层、独立标识与明确的公共领域电子改编来源", () => {
    expect(FLOOR_SCORE_PROFILES.map((profile) => profile.floor)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(new Set(FLOOR_SCORE_PROFILES.map((profile) => profile.id)).size).toBe(8);

    FLOOR_SCORE_PROFILES.forEach((profile) => {
      expect(profile.origin).toBe("public-domain-electronic-adaptation");
      expect(profile.sourceWork.length).toBeGreaterThan(0);
      expect(profile.composer.length).toBeGreaterThan(0);
      expect(profile.tonalCenter.length).toBeGreaterThan(0);
      expect(profile.scaleName.length).toBeGreaterThan(0);
      expect(profile.regionOffsets).toHaveLength(3);
      MODES.forEach((mode) => {
        const movement = profile.movements[mode];
        expect(movement.bpm).toBeGreaterThanOrEqual(66);
        expect(movement.bpm).toBeLessThanOrEqual(124);
        expect(movement.voiceLimit).toBeGreaterThanOrEqual(3);
        expect(movement.voiceLimit).toBeLessThanOrEqual(5);
        expect(movement.lowPassHz).toBeGreaterThanOrEqual(1_700);
        expect(movement.lowPassHz).toBeLessThanOrEqual(3_350);
        expect(["sine", "triangle"]).toContain(movement.melodyWave);
        expect(["sine", "triangle"]).toContain(movement.bassWave);
        expect(["sine", "triangle"]).toContain(movement.padWave);
      });
    });
  });

  it("探索乐谱移除持续低频底床，战斗限制高频、噪声密度和音高", () => {
    FLOOR_SCORE_PROFILES.forEach((profile) => {
      const floor = profile.floor as DungeonFloor;
      const explorePatterns = musicPatternsForScene({
        floor,
        region: 0,
        mode: "explore",
      });
      explorePatterns.forEach((pattern) => {
        expect(pattern.melody).toHaveLength(pattern.phraseSteps);
        expect(pattern.bass).toHaveLength(pattern.phraseSteps);
        expect(pattern.bed).toEqual([]);
        expect(pattern.bedDurationSeconds).toBe(0);
        expect(pattern.padLevel).toBe(0);
        const bassNotes = pattern.bass.filter(
          (note): note is number => note !== null,
        );
        expect(Math.min(...bassNotes)).toBeGreaterThanOrEqual(45);
        expect(pattern.bassLevel).toBeLessThan(pattern.melodyLevel);
      });

      (["combat", "boss"] as const).forEach((mode) => {
        [0, 1, 2].forEach((region) => {
          const [pattern] = musicPatternsForScene({ floor, region, mode });
          expect(pattern.melody).toHaveLength(pattern.phraseSteps);
          expect(pattern.bass).toHaveLength(pattern.phraseSteps);
          const pitchedNotes = [...pattern.melody, ...pattern.bass, ...pattern.bed]
            .filter((note): note is number => note !== null);
          expect(Math.max(...pitchedNotes)).toBeLessThanOrEqual(81);
          expect(pattern.hats.length).toBeLessThanOrEqual(
            Math.ceil(pattern.phraseSteps / 6),
          );
          expect(pattern.hatLevel).toBeLessThan(0.014);
          expect(pattern.lowPassHz).toBeLessThanOrEqual(3_350);
        });
      });
    });
  });

  it("将相同场景判为无动作、同层区域判为乐句重定向，其余只重启一次", () => {
    const base = { floor: 3, region: 0, mode: "explore" } as const;

    expect(classifyScoreSceneTransition(base, base)).toBe("none");
    expect(classifyScoreSceneTransition(base, { ...base, region: 1 })).toBe("retarget");
    expect(classifyScoreSceneTransition(base, { ...base, mode: "combat" })).toBe("restart");
    expect(classifyScoreSceneTransition(base, { ...base, floor: 4 })).toBe("restart");
  });
});
