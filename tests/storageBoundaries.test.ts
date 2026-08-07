import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../src/infrastructure/storage/localProgress";
import { validateProfileProgress } from "../src/infrastructure/storage/profileCodec";
import { decodeRunJson, encodeRun } from "../src/infrastructure/storage/runCodec";
import {
  migrateFirstAvailableRun,
  type RunMigrators,
} from "../src/infrastructure/storage/runMigrations";
import type { LessonId } from "../src/domain/shared/types";

describe("存档内部职责边界", () => {
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

  it("迁移链按 v11 到 v4 的兼容顺序尝试", () => {
    const calls: string[] = [];
    const migrators: RunMigrators = Object.fromEntries(
      ["v11", "v10", "v9", "v8", "v7", "v6", "v5", "v4"].map((version) => [
        version,
        (value: unknown) => {
          calls.push(`${version}:${String(value)}`);
          return version === "v9" ? ({ version: 12 } as never) : null;
        },
      ]),
    ) as unknown as RunMigrators;
    expect(migrateFirstAvailableRun("current", {
      v11: "legacy-v11",
      v10: "legacy-v10",
      v9: "legacy-v9",
      v8: "legacy-v8",
      v7: "legacy-v7",
      v6: "legacy-v6",
      v5: "legacy-v5",
      v4: "legacy-v4",
    }, migrators)).toEqual({ version: 12 });
    expect(calls).toEqual([
      "v11:current",
      "v11:legacy-v11",
      "v10:legacy-v10",
      "v9:legacy-v9",
    ]);
  });
});
