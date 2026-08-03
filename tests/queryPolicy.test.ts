/** 验证只读 SQL 与第六层受控沙箱脚本的语句边界。 */
import { describe, expect, it } from "vitest";
import {
  validateReadOnlyQuery,
  validateSandboxScript,
} from "../src/domain/queryPolicy";

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

describe("validateSandboxScript", () => {
  it("只接受 repair_queue 上受控且带 WHERE 的写操作", () => {
    expect(validateSandboxScript(
      "BEGIN; UPDATE repair_queue SET status = 'fixed' WHERE id = 2; COMMIT;",
    )).toMatchObject({ ok: true });
    expect(validateSandboxScript(
      "DELETE FROM repair_queue WHERE id = 4;",
    )).toMatchObject({ ok: true });
  });

  it("拒绝全表修改、永久课程表和 DDL", () => {
    expect(validateSandboxScript(
      "UPDATE repair_queue SET status = 'fixed';",
    )).toMatchObject({ ok: false });
    expect(validateSandboxScript(
      "DELETE FROM monsters WHERE id = 1;",
    )).toMatchObject({ ok: false });
    expect(validateSandboxScript(
      "DROP TABLE repair_queue;",
    )).toMatchObject({ ok: false });
    expect(validateSandboxScript(
      "UPDATE repair_queue SET status = 'where';",
    )).toMatchObject({ ok: false });
    expect(validateSandboxScript(
      "UPDATE repair_queue SET status = 'fixed' WHERE 1 = 1;",
    )).toMatchObject({ ok: false });
  });

  it("正确忽略字符串中的分号并限制脚本条数", () => {
    expect(validateSandboxScript(
      "INSERT INTO repair_queue(id, item, quantity, status) VALUES (7, 'semi;colon', 1, 'ready');",
    )).toMatchObject({ ok: true });
    expect(validateSandboxScript(
      "BEGIN; SAVEPOINT a; SAVEPOINT b; SAVEPOINT c; SAVEPOINT d; SAVEPOINT e; SAVEPOINT f; SAVEPOINT g; COMMIT;",
    )).toMatchObject({ ok: false });
    expect(validateSandboxScript(
      "INSERT INTO repair_queue(id, item, quantity, status) VALUES (7, 'drop monsters', 1, 'ready');",
    )).toMatchObject({ ok: true });
  });
});
