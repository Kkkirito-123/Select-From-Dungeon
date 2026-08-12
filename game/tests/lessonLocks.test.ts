import { describe, expect, it } from "vitest";
import { isFlatBeginnerSelect, stageFor } from "../src/domain/learning/lessonLocks";

describe("lesson lock boundary", () => {
  it("accepts one flat SELECT and ignores strings/comments", () => {
    expect(isFlatBeginnerSelect(
      "SELECT 'OR' AS note FROM monsters /* SELECT */ WHERE id = 1",
    )).toBe(true);
  });

  it("rejects set operators, OR, and nested SELECT", () => {
    expect(isFlatBeginnerSelect("SELECT id FROM monsters WHERE id = 1 OR id = 2")).toBe(false);
    expect(isFlatBeginnerSelect(
      "SELECT id FROM monsters WHERE id IN (SELECT id FROM monsters)",
    )).toBe(false);
    expect(isFlatBeginnerSelect("SELECT id FROM monsters UNION SELECT id FROM monsters")).toBe(false);
  });

  it("clamps a restored stage index to the lesson boundaries", () => {
    expect(stageFor("select", -1).id).toBe("select-weakness");
    expect(stageFor("select", 999).id).toBe("select-name");
  });
});
