import { describe, expect, it } from "vitest";
import { validateReadOnlyQuery } from "../src/domain/queryPolicy";

describe("validateReadOnlyQuery", () => {
  it("接受单条 SELECT 和结尾分号", () => {
    expect(validateReadOnlyQuery("SELECT id FROM monsters;")).toEqual({
      ok: true,
      sql: "SELECT id FROM monsters",
    });
  });

  it("拒绝写操作", () => {
    expect(validateReadOnlyQuery("UPDATE monsters SET hp = 0")).toMatchObject({
      ok: false,
    });
  });

  it("拒绝多语句", () => {
    expect(
      validateReadOnlyQuery("SELECT id FROM monsters; SELECT id FROM weaknesses"),
    ).toMatchObject({ ok: false });
  });
});
