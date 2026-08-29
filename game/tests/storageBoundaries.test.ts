import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../src/infrastructure/storage/localProgress";
import { validateProfileProgress } from "../src/infrastructure/storage/profileCodec";
import { decodeRunJson, encodeRun } from "../src/infrastructure/storage/runCodec";
import { isSavedRun } from "../src/infrastructure/storage/runValidator";
import type { LessonId } from "../src/domain/shared/types";
import { GameSession } from "../src/features/game-session/GameSession";

describe("存档内部职责边界", () => {
  it("Run 校验不依赖浏览器存储即可拒绝损坏字段", () => {
    const run = new GameSession(null, null, "validator-boundary").toSavedRun();
    expect(isSavedRun(run)).toBe(true);
    expect(isSavedRun({
      ...run,
      player: { ...run.player, hp: "broken" },
    })).toBe(false);
  });

  it("JSON 编解码拒绝损坏输入并保持已验证对象内容", () => {
    expect(decodeRunJson("{broken")).toBeNull();
    const run = { version: 12 } as never;
    expect(decodeRunJson(encodeRun(run))).toEqual(run);
  });

  it("Profile 校验接收显式规则而不读取浏览器", () => {
    const profile = createEmptyProfile();
    const lessonIds = Object.keys(profile.attempts) as LessonId[];
    expect(validateProfileProgress(profile, {
      lessonIds,
      isLessonId: (value): value is LessonId => lessonIds.includes(value as LessonId),
      isNonNegativeInteger: (value) => typeof value === "number" && Number.isInteger(value) && value >= 0,
    })).toBe(true);
  });
});
