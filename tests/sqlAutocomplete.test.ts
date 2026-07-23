import { describe, expect, it } from "vitest";
import {
  applySqlSuggestion,
  getSqlCompletions,
  parseSchemaLines,
} from "../src/ui/sqlAutocomplete";

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
});
