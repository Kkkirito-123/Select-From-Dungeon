import { describe, expect, it } from "vitest";
import { validateReadOnlyQuery } from "../src/domain/queryPolicy";

describe("validateReadOnlyQuery", () => {
  it("接受单条 SELECT 和结尾分号", () => {
    expect(validateReadOnlyQuery("SELECT id FROM monsters;")).toEqual({
      ok: true,
      sql: "SELECT id FROM monsters",
    });
  });

  it("接受以 SELECT 结尾的普通与递归 CTE", () => {
    expect(validateReadOnlyQuery(
      "WITH target AS (SELECT id FROM monsters) SELECT id FROM target;",
    )).toMatchObject({ ok: true });
    expect(validateReadOnlyQuery(
      "WITH RECURSIVE ids(id) AS (SELECT 1 UNION ALL SELECT id + 1 FROM ids WHERE id < 3) SELECT id FROM ids;",
    )).toMatchObject({ ok: true });
  });

  it("拒绝 CTE 中隐藏的写操作", () => {
    expect(validateReadOnlyQuery(
      "WITH changed AS (DELETE FROM monsters RETURNING id) SELECT id FROM changed",
    )).toMatchObject({ ok: false });
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
