import { describe, expect, it } from "vitest";
import {
  extractModuleSpecifiers,
  isFloorAggregatorPath,
  resolveModuleSpecifier,
  targetFloorNumber,
} from "../scripts/architecture-imports.mjs";

describe("architecture import scanner", () => {
  it("识别静态、side-effect、export-from 和 dynamic import", () => {
    const source = [
      'import value from "./value";',
      'import "./side-effect";',
      'export { value } from "./re-export";',
      'const loaded = import("./dynamic");',
    ].join("\n");

    expect(extractModuleSpecifiers(source)).toEqual([
      "./value",
      "./side-effect",
      "./re-export",
      "./dynamic",
    ]);
  });

  it("解析楼层相对路径并识别聚合入口", () => {
    const sourceFile = "content/world/floors/floor01/biome.ts";
    const shared = resolveModuleSpecifier(sourceFile, "../shared/biome");
    const registry = resolveModuleSpecifier(sourceFile, "../index");
    const sibling = resolveModuleSpecifier(sourceFile, "../floor02/biome");

    expect(shared).toBe("content/world/floors/shared/biome");
    expect(isFloorAggregatorPath(registry)).toBe(true);
    expect(targetFloorNumber(sibling)).toBe("02");
  });
});
