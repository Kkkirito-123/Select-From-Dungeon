import { describe, expect, it } from "vitest";
import {
  applySqlSuggestion,
  getSqlCompletions,
  parseSchemaRelations,
  parseSchemaLines,
} from "../src/presentation/dom/sqlAutocomplete";

const SCHEMA = [
  "monsters(id, room_id, name, status, weakness)",
  "monster_gear(id, monster_id, gear_name, power)",
  "monster_signals(id, monster_id, channel, charge)",
  "关系：monster_signals.monster_id = monsters.id",
];

describe("SQL autocomplete", () => {
  it("从可见 Schema 行提取完整表名和字段，不把关系说明当成表", () => {
    expect(parseSchemaLines(SCHEMA)).toEqual([
      {
        name: "monsters",
        columns: ["id", "room_id", "name", "status", "weakness"],
      },
      {
        name: "monster_gear",
        columns: ["id", "monster_id", "gear_name", "power"],
      },
      {
        name: "monster_signals",
        columns: ["id", "monster_id", "channel", "charge"],
      },
    ]);
  });

  it("按前缀提示 SQL 关键词，并保留替换区间", () => {
    const completion = getSqlCompletions("sel", 3, 3, SCHEMA);
    expect(completion).toMatchObject({ replaceStart: 0, replaceEnd: 3 });
    expect(completion.suggestions[0]).toMatchObject({
      label: "SELECT",
      kind: "keyword",
    });
  });

  it("已有对象前缀时优先表和字段，不继续套用空编辑器的 SELECT 权重", () => {
    const completion = getSqlCompletions("m", 1, 1, SCHEMA);
    expect(completion.suggestions.slice(0, 3).map((suggestion) => suggestion.label))
      .toEqual(["monsters", "monster_gear", "monster_signals"]);
  });

  it("同等表名前缀命中时先显示短名称，再显示长名称", () => {
    const sql = "SELECT name FROM mo";
    const completion = getSqlCompletions(sql, sql.length, sql.length, SCHEMA);
    expect(completion.suggestions.map((suggestion) => suggestion.label)).toEqual([
      "monsters",
      "monster_gear",
      "monster_signals",
    ]);
  });

  it("在 FROM 后强制触发时优先提示数据表", () => {
    const sql = "SELECT id FROM ";
    const completion = getSqlCompletions(sql, sql.length, sql.length, SCHEMA, true);
    expect(completion.suggestions[0]).toMatchObject({
      label: "monsters",
      kind: "table",
    });
    expect(completion.suggestions[1]).toMatchObject({
      label: "monster_gear",
      kind: "table",
    });
    expect(completion.suggestions[2]).toMatchObject({
      label: "monster_signals",
      kind: "table",
    });
  });

  it("识别 FROM/JOIN 别名并只提示对应表的限定字段", () => {
    const sql = "SELECT m. FROM monsters AS m";
    const cursor = "SELECT m.".length;
    const completion = getSqlCompletions(sql, cursor, cursor, SCHEMA);
    expect(completion.suggestions.map((suggestion) => suggestion.label)).toEqual([
      "m.id",
      "m.name",
      "m.status",
      "m.room_id",
      "m.weakness",
    ]);
    expect(completion.suggestions.every((suggestion) => (
      suggestion.detail.startsWith("monsters")
    ))).toBe(true);
  });

  it("进入 monsters WHERE 后只提示主表字段，不把明细表 monster_id 混进来", () => {
    const sql = "SELECT name, hp FROM monsters WHERE ";
    const completion = getSqlCompletions(sql, sql.length, sql.length, SCHEMA, true);
    const fieldLabels = completion.suggestions
      .filter((suggestion) => suggestion.kind === "column")
      .map((suggestion) => suggestion.label);
    expect(fieldLabels).toContain("id");
    expect(fieldLabels).not.toContain("monster_id");
  });

  it("本题锁定 INNER JOIN 时优先于更短的 IN，并在 ON 后给出真实关系", () => {
    const joinPrefix = "SELECT m.name FROM monsters m in";
    const keywordCompletion = getSqlCompletions(
      joinPrefix,
      joinPrefix.length,
      joinPrefix.length,
      SCHEMA,
      false,
      ["INNER JOIN", "ON"],
    );
    expect(keywordCompletion.suggestions[0]?.label).toBe("INNER JOIN");

    const onSql = "SELECT m.name, r.name FROM monsters m INNER JOIN rooms r ON ";
    const schemaWithRelation = [
      ...SCHEMA,
      "rooms(id, name, sector, floor)",
      "关系：monsters.room_id = rooms.id",
    ];
    expect(getSqlCompletions(
      onSql,
      onSql.length,
      onSql.length,
      schemaWithRelation,
      true,
      ["INNER JOIN", "ON"],
    ).suggestions[0]).toMatchObject({
      label: "m.room_id = r.id",
      kind: "relation",
    });
  });

  it("从关系说明中提取两侧表与字段", () => {
    expect(parseSchemaRelations([
      "关系：monsters.room_id = rooms.id",
    ])).toEqual([{
      leftTable: "monsters",
      leftColumn: "room_id",
      rightTable: "rooms",
      rightColumn: "id",
    }]);
  });

  it("自连接保留同表两个别名，并用已有行的外键连接新加入的主记录", () => {
    const sql =
      "SELECT child.name, master.name FROM monsters child INNER JOIN monsters master ON ";
    const schema = [
      "monsters(id, master_id, name)",
      "关系：monsters.master_id = monsters.id",
    ];
    const relations = getSqlCompletions(
      sql,
      sql.length,
      sql.length,
      schema,
      true,
      ["SELF JOIN", "ON"],
    ).suggestions.filter((suggestion) => suggestion.kind === "relation");

    expect(relations[0]).toMatchObject({
      label: "child.master_id = master.id",
      kind: "relation",
    });
    expect(relations.map((suggestion) => suggestion.label))
      .not.toContain("master.master_id = master.id");
  });

  it("三表链式 JOIN 的新 ON 只提示涉及当前新表的尚未使用关系", () => {
    const sql =
      "SELECT r.name, m.name, g.power FROM rooms r " +
      "INNER JOIN monsters m ON m.room_id = r.id " +
      "INNER JOIN monster_gear g ON ";
    const schema = [
      "rooms(id, name)",
      "monsters(id, room_id, name)",
      "monster_gear(id, monster_id, power)",
      "关系：monsters.room_id = rooms.id",
      "关系：monster_gear.monster_id = monsters.id",
    ];
    const relationLabels = getSqlCompletions(
      sql,
      sql.length,
      sql.length,
      schema,
      true,
      ["INNER JOIN", "ON"],
    ).suggestions
      .filter((suggestion) => suggestion.kind === "relation")
      .map((suggestion) => suggestion.label);

    expect(relationLabels[0]).toBe("g.monster_id = m.id");
    expect(relationLabels).not.toContain("m.room_id = r.id");
  });

  it("字符串字面量和行注释中不弹出建议", () => {
    const literal = "SELECT * FROM monsters WHERE name = 'sel";
    const comment = "SELECT id -- sel";
    expect(getSqlCompletions(literal, literal.length, literal.length, SCHEMA).suggestions)
      .toEqual([]);
    expect(getSqlCompletions(comment, comment.length, comment.length, SCHEMA).suggestions)
      .toEqual([]);
  });

  it("应用函数建议后把光标放在括号内", () => {
    const completion = getSqlCompletions("cou", 3, 3, SCHEMA);
    const suggestion = completion.suggestions.find((entry) => entry.label === "COUNT()");
    if (!suggestion) throw new Error("缺少 COUNT 建议");
    expect(applySqlSuggestion("cou", completion, suggestion)).toEqual({
      value: "COUNT()",
      cursor: 6,
    });
  });

  it("提示第三、四层需要的集合、子查询、CTE 与聚合词汇", () => {
    expect(getSqlCompletions("uni", 3, 3, SCHEMA).suggestions[0]?.label).toBe("UNION");
    expect(getSqlCompletions("exi", 3, 3, SCHEMA).suggestions[0]?.label).toBe("EXISTS");
    expect(getSqlCompletions("rec", 3, 3, SCHEMA).suggestions[0]?.label).toBe("WITH RECURSIVE");
    expect(getSqlCompletions("max", 3, 3, SCHEMA).suggestions[0]?.label).toBe("MAX()");
  });

  it("提示第五、六层需要的窗口函数与事务词汇", () => {
    expect(getSqlCompletions("row_", 4, 4, SCHEMA).suggestions[0]?.label)
      .toBe("ROW_NUMBER()");
    expect(getSqlCompletions("part", 4, 4, SCHEMA).suggestions[0]?.label)
      .toBe("PARTITION BY");
    expect(getSqlCompletions("save", 4, 4, SCHEMA).suggestions[0]?.label)
      .toBe("SAVEPOINT");
    expect(getSqlCompletions("roll", 4, 4, SCHEMA).suggestions[0]?.label)
      .toBe("ROLLBACK");
  });

  it("在 INSERT INTO 与 UPDATE 后优先提示可写沙箱表", () => {
    const sandboxSchema = ["repair_queue(id, item, quantity, status)"];
    const insert = "INSERT INTO ";
    const update = "UPDATE ";
    expect(getSqlCompletions(
      insert,
      insert.length,
      insert.length,
      sandboxSchema,
      true,
    ).suggestions[0]?.label).toBe("repair_queue");
    expect(getSqlCompletions(
      update,
      update.length,
      update.length,
      sandboxSchema,
      true,
    ).suggestions[0]?.label).toBe("repair_queue");
  });
});
