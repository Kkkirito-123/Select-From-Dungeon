/**
 * 课程结果语义实现。
 *
 * 本模块承载 47 个课程阶段的结果列、结果行、SQL 形状和计划证据匹配。
 * 它只读取执行结果，不执行 SQL、不扣血、不推进课程，也不触碰存档或 DOM。
 */
import type { AuthoredLessonStageId, SqlQueryResult } from "../shared/types";
import { isFlatBeginnerSelect } from "./lessonLocks";

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

function normalizeStructure(sql: string): string {
  return stripComments(sql).replace(/\s+/g, " ").trim();
}

function splitProjection(projection: string): string[] {
  const expressions: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < projection.length; index += 1) {
    const character = projection[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      expressions.push(projection.slice(start, index).trim());
      start = index + 1;
    }
  }
  expressions.push(projection.slice(start).trim());
  return expressions.filter(Boolean);
}

function projectionClause(sql: string): string {
  return sql.match(/^\s*select\s+([\s\S]*?)\s+from\b/i)?.[1] ?? "";
}

function qualifiedColumn(column: string): string {
  return `(?:\\b[a-z_]\\w*\\s*\\.\\s*)?\\b${column}\\b`;
}

function projectsOnlyColumn(sql: string, column: string): boolean {
  return new RegExp(
    `^(?:distinct\\s+)?${qualifiedColumn(column)}$`,
    "i",
  ).test(projectionClause(sql).trim());
}

function projectsOnlyColumns(sql: string, columns: readonly string[]): boolean {
  const projected = splitProjection(projectionClause(sql)).map((expression) => (
    expression
      .replace(/^distinct\s+/i, "")
      .replace(/\s+(?:as\s+)?[a-z_]\w*$/i, "")
      .replace(/^[a-z_]\w*\s*\.\s*/i, "")
      .trim()
      .toLowerCase()
  ));
  return projected.length === columns.length && projected.every(
    (column, index) => column === columns[index]?.toLowerCase(),
  );
}

function columnEqualsNumber(clause: string, column: string, expected: number): boolean {
  return new RegExp(
    `${qualifiedColumn(column)}\\s*=\\s*${expected}\\b`,
    "i",
  ).test(clause);
}

function columnEqualsString(clause: string, column: string, expected: string): boolean {
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `${qualifiedColumn(column)}\\s*=\\s*'${escaped}'`,
    "i",
  ).test(clause);
}

function columnIsNull(clause: string, column: string): boolean {
  return new RegExp(
    `${qualifiedColumn(column)}\\s+is\\s+null\\b`,
    "i",
  ).test(clause);
}

function filtersByDirectId(clause: string): boolean {
  return new RegExp(qualifiedColumn("id"), "i").test(clause);
}

function hasExactColumns(actual: string[], expected: string[]): boolean {
  const normalizedActual = actual.map((column) => column.toLowerCase()).sort();
  const normalizedExpected = expected.map((column) => column.toLowerCase()).sort();
  return (
    normalizedActual.length === normalizedExpected.length &&
    normalizedActual.every((column, index) => column === normalizedExpected[index])
  );
}

function hasAggregateProjection(sql: string): boolean {
  const projection = projectionClause(sql);
  return (
    new RegExp(qualifiedColumn("channel"), "i").test(projection) &&
    /\bcount\s*\(\s*\*\s*\)\s+(?:as\s+)?total\b/i.test(projection)
  );
}

/**
 * 从 SQL 文本提取教学特征。
 * 先移除字符串和注释再匹配关键字，避免把字符串内容误判为概念；这一步
 * 只服务课程锁和学习记录，不代表 SQL 已经执行成功。
 */
function sameIds(actual: number[], expected: number[]): boolean {
  const actualUnique = [...new Set(actual)].sort((a, b) => a - b);
  const expectedUnique = [...new Set(expected)].sort((a, b) => a - b);
  return (
    actualUnique.length === expectedUnique.length &&
    actualUnique.every((id, index) => id === expectedUnique[index])
  );
}

function clauseBetween(
  sql: string,
  start: "where" | "group by" | "having",
): string {
  const escapedStart = start.replace(" ", "\\s+");
  const match = sql.match(
    new RegExp(`\\b${escapedStart}\\b([\\s\\S]*?)(?=\\b(?:group\\s+by|having|order\\s+by|limit)\\b|$)`, "i"),
  );
  return match?.[1] ?? "";
}

function rowValue(row: Record<string, unknown>, column: string): unknown {
  const key = Object.keys(row).find((candidate) => candidate.toLowerCase() === column);
  return key ? row[key] : undefined;
}

function hasSingleValue(
  result: SqlQueryResult,
  column: string,
  expected: unknown,
): boolean {
  return (
    result.rows.length === 1 &&
    hasExactColumns(result.columns, [column]) &&
    rowValue(result.rows[0], column) === expected
  );
}


function hasExactAggregateRows(
  rows: Array<Record<string, unknown>>,
  expected: Array<{ channel: string; total: number }>,
): boolean {
  const actualRows = rows
    .map((row) => JSON.stringify([
      rowValue(row, "channel"),
      Number(rowValue(row, "total")),
    ]))
    .sort();
  const expectedRows = expected
    .map((row) => JSON.stringify([row.channel, row.total]))
    .sort();
  return (
    actualRows.length === expectedRows.length &&
    actualRows.every((row, index) => row === expectedRows[index])
  );
}

function hasExactOrderedRows(
  result: SqlQueryResult,
  columns: string[],
  expectedRows: unknown[][],
): boolean {
  if (!hasExactColumns(result.columns, columns)) return false;
  return (
    result.rows.length === expectedRows.length &&
    result.rows.every((row, rowIndex) => (
      columns.every((column, columnIndex) => (
        rowValue(row, column) === expectedRows[rowIndex][columnIndex]
      ))
    ))
  );
}

const NON_FLAT_STAGES = new Set<AuthoredLessonStageId>([
  "f3-union-patrol",
  "grave-boss-scan",
  "f4-scalar-first",
  "f4-in-frost",
  "f4-exists-gear",
  "f4-correlated-gear",
  "f4-cte-armor",
  "f4-recursive-rooms",
  "f4-recursive-core",
  "practice-fire",
  "practice-ice",
  "practice-storm",
  "practice-spark",
  "forge-boss-scan",
  "forge-boss-core",
  "f5-over-count",
  "f5-row-number-order",
  "f5-rank-ties",
  "f5-lag-lead-delta",
  "f5-frame-running",
  "f5-top-n-groups",
  "f5-top-n-core",
  "practice-goblin",
  "practice-orc",
  "practice-knight",
  "practice-troll",
  "iron-boss-scan",
  "iron-boss-core",
  "f6-insert-row",
  "f6-update-target",
  "f6-delete-duplicate",
  "f6-constraint-ignore",
  "f6-transaction-rollback",
  "f6-savepoint-rollback",
  "f6-savepoint-commit",
  "practice-hatchling",
  "practice-wyvern",
  "practice-thunder-drake",
  "practice-crystal-drake",
  "dragon-boss-scan",
  "dragon-boss-core",
  "f8-mvcc-visible",
  "f8-final-snapshot",
  "practice-demon",
]);

const SANDBOX_BASE_ROWS: unknown[][] = [
  [1, "ore", 2, "ready"],
  [2, "scale", 1, "damaged"],
  [3, "fang", 1, "duplicate"],
  [4, "fang", 1, "duplicate"],
  [5, "core", 1, "ready"],
];

function hasSandboxRows(
  result: SqlQueryResult,
  expectedRows: unknown[][],
): boolean {
  return hasExactOrderedRows(
    result,
    ["id", "item", "quantity", "status"],
    expectedRows,
  );
}

function planContains(
  result: SqlQueryResult,
  ...fragments: string[]
): boolean {
  const plan = result.plan.join(" ").toUpperCase();
  return fragments.every((fragment) => plan.includes(fragment.toUpperCase()));
}

function joinsTables(
  sql: string,
  left: string,
  right: string,
  leftColumn: string,
  rightColumn: string,
  leftJoin = false,
): boolean {
  const joinKeyword = leftJoin ? "left\\s+(?:outer\\s+)?join" : "(?:inner\\s+)?join";
  const match = sql.match(new RegExp(
    `\\bfrom\\s+${left}\\s+(?:as\\s+)?([a-z_]\\w*)\\s+${joinKeyword}\\s+${right}\\s+(?:as\\s+)?([a-z_]\\w*)\\s+on\\s+([\\s\\S]*?)(?=\\b(?:where|group\\s+by|having|order\\s+by|limit)\\b|$)`,
    "i",
  ));
  if (!match) return false;
  const [, leftAlias, rightAlias, onClause] = match;
  const relation = [
    `${leftAlias}\\s*\\.\\s*${leftColumn}\\s*=\\s*${rightAlias}\\s*\\.\\s*${rightColumn}`,
    `${rightAlias}\\s*\\.\\s*${rightColumn}\\s*=\\s*${leftAlias}\\s*\\.\\s*${leftColumn}`,
  ].join("|");
  return new RegExp(`(?:${relation})`, "i").test(onClause);
}

function stageMatches(stageId: AuthoredLessonStageId, result: SqlQueryResult): boolean {
  if (!NON_FLAT_STAGES.has(stageId) && !isFlatBeginnerSelect(result.sql)) return false;
  const normalizedSql = normalizeStructure(result.sql);
  const whereClause = clauseBetween(normalizedSql, "where");
  const groupClause = clauseBetween(normalizedSql, "group by");
  const havingClause = clauseBetween(normalizedSql, "having");

  switch (stageId) {
    case "select-name":
      return (
        projectsOnlyColumns(normalizedSql, ["id", "status"]) &&
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 1) &&
        hasExactOrderedRows(result, ["id", "status"], [[1, "idle"]])
      );
    case "select-weakness":
      return (
        projectsOnlyColumn(normalizedSql, "weakness") &&
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 1) &&
        hasSingleValue(result, "weakness", "slash")
      );
    case "where-target":
      return (
        projectsOnlyColumn(normalizedSql, "id") &&
        columnEqualsNumber(whereClause, "room_id", 2) &&
        columnEqualsString(whereClause, "status", "escaped") &&
        !filtersByDirectId(whereClause) &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [2])
      );
    case "where-weakness":
      return (
        projectsOnlyColumn(normalizedSql, "weakness") &&
        columnEqualsNumber(whereClause, "id", 2) &&
        columnEqualsString(whereClause, "status", "escaped") &&
        hasSingleValue(result, "weakness", "focus")
      );
    case "null-target":
      return (
        projectsOnlyColumn(normalizedSql, "id") &&
        columnEqualsNumber(whereClause, "room_id", 3) &&
        columnIsNull(whereClause, "master_id") &&
        !filtersByDirectId(whereClause) &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [3])
      );
    case "null-name":
      return (
        projectsOnlyColumn(normalizedSql, "id") &&
        columnIsNull(whereClause, "master_id") &&
        columnEqualsString(whereClause, "status", "cursed") &&
        !filtersByDirectId(whereClause) &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [3])
      );
    case "group-signals":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        hasAggregateProjection(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 4) &&
        new RegExp(qualifiedColumn("channel"), "i").test(groupClause) &&
        hasExactColumns(result.columns, ["channel", "total"]) &&
        hasExactAggregateRows(result.rows, [
          { channel: "echo", total: 3 },
          { channel: "noise", total: 1 },
        ])
      );
    case "having-shield":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        hasAggregateProjection(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 5) &&
        new RegExp(qualifiedColumn("channel"), "i").test(groupClause) &&
        /\b(?:count\s*\([^)]*\)|total)\s*(?:>=\s*2\b|>\s*1\b)/i.test(havingClause) &&
        hasExactColumns(result.columns, ["channel", "total"]) &&
        hasExactAggregateRows(result.rows, [
          { channel: "echo", total: 3 },
          { channel: "ward", total: 2 },
        ])
      );
    case "having-core":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        hasAggregateProjection(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 5) &&
        new RegExp(qualifiedColumn("channel"), "i").test(groupClause) &&
        /\b(?:count\s*\([^)]*\)|total)\s*(?:>=\s*3\b|>\s*2\b)/i.test(havingClause) &&
        hasExactColumns(result.columns, ["channel", "total"]) &&
        hasExactAggregateRows(result.rows, [{ channel: "echo", total: 3 }])
      );
    case "practice-select":
      return (
        projectsOnlyColumns(normalizedSql, ["id", "status"]) &&
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 6) &&
        hasExactOrderedRows(result, ["id", "status"], [[6, "dripping"]])
      );
    case "practice-where":
      return (
        projectsOnlyColumn(normalizedSql, "id") &&
        columnEqualsNumber(whereClause, "room_id", 12) &&
        columnEqualsString(whereClause, "status", "wet") &&
        !filtersByDirectId(whereClause) &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [7])
      );
    case "practice-null":
      return (
        projectsOnlyColumn(normalizedSql, "id") &&
        columnIsNull(whereClause, "master_id") &&
        columnEqualsString(whereClause, "status", "toxic") &&
        !filtersByDirectId(whereClause) &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [8])
      );
    case "practice-group":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        hasAggregateProjection(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 9) &&
        new RegExp(qualifiedColumn("channel"), "i").test(groupClause) &&
        hasExactColumns(result.columns, ["channel", "total"]) &&
        hasExactAggregateRows(result.rows, [
          { channel: "echo", total: 2 },
          { channel: "noise", total: 2 },
        ])
      );
    case "practice-group-core":
      return (
        projectsOnlyColumns(normalizedSql, ["id", "status"]) &&
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 9) &&
        hasExactOrderedRows(result, ["id", "status"], [[9, "armored"]])
      );
    case "order-peak":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 10) &&
        /\border\s+by\s+(?:\w+\.)?charge\s+desc\b/i.test(normalizedSql) &&
        /\blimit\s+1\b/i.test(normalizedSql) &&
        hasSingleValue(result, "channel", "surge")
      );
    case "order-top-two":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 10) &&
        /\border\s+by\s+(?:\w+\.)?charge\s+desc\b/i.test(normalizedSql) &&
        /\blimit\s+2\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["channel", "charge"], [
          ["surge", 13],
          ["arc", 11],
        ])
      );
    case "distinct-status":
      return (
        /^select\s+distinct\s+(?:\w+\.)?channel\b/i.test(normalizedSql) &&
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 11) &&
        hasExactOrderedRows(result, ["channel"], [["echo"], ["mirror"]])
      );
    case "inner-join-room":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 12) &&
        hasExactOrderedRows(result, ["id", "room_name"], [
          [12, "古树桥"],
        ])
      );
    case "inner-join-sector":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 12) &&
        hasExactOrderedRows(result, ["id", "sector"], [
          [12, "forest"],
        ])
      );
    case "left-join-unarmed":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id", true) &&
        columnEqualsNumber(whereClause, "room_id", 24) &&
        columnIsNull(whereClause, "monster_id") &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [13])
      );
    case "join-boss-groups":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 14) &&
        hasExactOrderedRows(result, ["id", "sector"], [[14, "lighthouse"]])
      );
    case "join-boss-core":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id") &&
        columnEqualsNumber(whereClause, "id", 14) &&
        /\border\s+by\s+(?:\w+\.)?power\s+desc\b/i.test(normalizedSql) &&
        /\blimit\s+1\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["id", "power"], [
          [14, 21],
        ])
      );
    case "practice-order":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 15) &&
        /\border\s+by\s+(?:\w+\.)?charge\s+desc\b/i.test(normalizedSql) &&
        /\blimit\s+1\b/i.test(normalizedSql) &&
        hasSingleValue(result, "channel", "surge")
      );
    case "practice-distinct":
      return (
        /^select\s+distinct\s+(?:\w+\.)?channel\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 16) &&
        hasExactOrderedRows(result, ["channel"], [["echo"], ["mirror"]])
      );
    case "practice-inner-join":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 17) &&
        hasExactOrderedRows(result, ["id", "room_name"], [
          [17, "泥沼石径"],
        ])
      );
    case "practice-left-join":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id", true) &&
        columnEqualsNumber(whereClause, "room_id", 34) &&
        columnIsNull(whereClause, "monster_id") &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [18])
      );
    case "practice-left-core":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id", true) &&
        projectsOnlyColumn(normalizedSql, "id") &&
        columnEqualsNumber(whereClause, "id", 18) &&
        columnEqualsString(whereClause, "status", "toxic") &&
        columnIsNull(whereClause, "monster_id") &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [18])
      );
    case "practice-forest-order":
      return (
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 19) &&
        /\border\s+by\s+(?:\w+\.)?hp\s+desc\b/i.test(normalizedSql) &&
        /\blimit\s+1\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["id", "hp"], [[19, 13]])
      );
    case "practice-forest-join":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 20) &&
        hasExactOrderedRows(result, ["id", "room_name"], [[20, "盘根林地"]])
      );
    case "practice-forest-join-core":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 20) &&
        /\border\s+by\s+(?:\w+\.)?sector(?:\s+asc)?\b/i.test(normalizedSql) &&
        /\blimit\s+1\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["id", "room_sector"], [[20, "forest"]])
      );
    case "lake-boss-scan":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 21) &&
        /\border\s+by\s+(?:\w+\.)?charge\s+desc\b/i.test(normalizedSql) &&
        /\blimit\s+2\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["channel", "charge"], [
          ["surge", 14],
          ["surge", 13],
        ])
      );
    case "lake-boss-sort":
      return (
        /^select\s+distinct\s+(?:\w+\.)?channel\b/i.test(normalizedSql) &&
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 21) &&
        /\border\s+by\s+(?:\w+\.)?channel(?:\s+asc)?\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["channel"], [["deep"], ["surge"], ["wake"]])
      );
    case "frog-boss-left":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id", true) &&
        columnEqualsNumber(whereClause, "id", 22) &&
        columnIsNull(whereClause, "monster_id") &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [22])
      );
    case "frog-boss-distinct":
      return (
        /^select\s+distinct\s+(?:\w+\.)?id\b/i.test(normalizedSql) &&
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "floor", 2) &&
        columnEqualsNumber(whereClause, "id", 22) &&
        /\border\s+by\s+(?:\w+\.)?id(?:\s+asc)?\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["id", "room_name"], [[22, "泥冠宫"]])
      );
    case "f3-inner-room":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 23) &&
        hasExactOrderedRows(result, ["id", "room_name"], [[23, "骨桥前庭"]])
      );
    case "f3-left-unarmed":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id", true) &&
        columnEqualsNumber(whereClause, "room_id", 42) &&
        columnIsNull(whereClause, "monster_id") &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [24])
      );
    case "f3-self-master":
      return (
        result.features.includes("self-join") &&
        columnEqualsNumber(whereClause, "id", 25) &&
        hasExactOrderedRows(result, ["child_id", "master_id"], [[25, 28]])
      );
    case "f3-chain-gear":
      return (
        (normalizedSql.match(/\bjoin\b/gi)?.length ?? 0) >= 2 &&
        columnEqualsNumber(whereClause, "id", 26) &&
        hasExactOrderedRows(
          result,
          ["room_name", "id", "power"],
          [["骑士墓", 26, 18]],
        )
      );
    case "f3-union-patrol":
      return hasExactOrderedRows(result, ["id"], [
        [23],
        [25],
      ]);
    case "f3-audit-groups":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 28) &&
        hasExactOrderedRows(result, ["id", "sector"], [[28, "throne"]])
      );
    case "f3-audit-verdict":
      return (
        /\bbetween\s+41\s+and\s+46\b/i.test(whereClause) &&
        hasExactOrderedRows(result, ["sector", "total"], [
          ["crypt", 2],
          ["grave", 2],
          ["throne", 2],
        ])
      );
    case "f3-audit-core":
      return (
        /\bbetween\s+41\s+and\s+46\b/i.test(whereClause) &&
        hasExactOrderedRows(result, ["id", "power"], [[28, 24]])
      );
    case "practice-bone":
      return (
        columnEqualsNumber(whereClause, "id", 29) &&
        hasExactOrderedRows(result, ["id", "room_name"], [[29, "遗骨荒地"]])
      );
    case "practice-zombie":
      return (
        columnEqualsNumber(whereClause, "id", 30) &&
        columnIsNull(whereClause, "monster_id") &&
        hasSingleValue(result, "id", 30)
      );
    case "practice-spirit":
      return (
        columnEqualsNumber(whereClause, "id", 31) &&

        hasExactOrderedRows(result, ["child_id", "master_id"], [[31, 33]])
      );
    case "practice-spirit-core":
      return (
        result.features.includes("self-join") &&
        columnEqualsNumber(whereClause, "id", 31) &&
        columnEqualsString(whereClause, "status", "haunting") &&
        hasExactOrderedRows(result, ["child_id", "master_id"], [[31, 33]])
      );
    case "grave-boss-scan":
      return hasExactOrderedRows(result, ["id", "room_name", "power"], [
        [33, "墓主祭坛", 22],
      ]);
    case "grave-boss-core":
      return (
        columnEqualsNumber(whereClause, "id", 33) &&
        hasExactOrderedRows(result, ["child_id", "master_id"], [[33, 28]])
      );
    case "f4-scalar-first":
      return hasSingleValue(result, "id", 34);
    case "f4-in-frost":
      return hasExactOrderedRows(result, ["id"], [[35]]);
    case "f4-exists-gear":
      return columnEqualsNumber(whereClause, "id", 36) &&
        hasSingleValue(result, "id", 36);
    case "f4-correlated-gear":
      return columnEqualsNumber(whereClause, "id", 37) &&
        /\bmax\s*\(/i.test(normalizedSql) &&
        hasSingleValue(result, "id", 37);
    case "f4-cte-armor":
      return columnEqualsNumber(whereClause, "id", 38) &&
        hasSingleValue(result, "id", 38);
    case "f4-recursive-rooms":
      return hasExactOrderedRows(result, ["room_name"], [
        ["火室"],
        ["冰库"],
        ["雷池"],
      ]);
    case "f4-recursive-core":
      return hasExactOrderedRows(result, ["id", "depth"], [
        [34, 1],
        [37, 2],
        [39, 3],
      ]);
    case "practice-fire":
      return hasSingleValue(result, "id", 40);
    case "practice-ice":
      return hasExactOrderedRows(result, ["id"], [[41], [44]]);
    case "practice-storm":
      return columnEqualsNumber(whereClause, "id", 42) &&
        hasSingleValue(result, "id", 42);
    case "practice-storm-core":
      return (
        columnEqualsNumber(whereClause, "id", 42) &&
        columnEqualsString(whereClause, "status", "charged") &&
        hasSingleValue(result, "id", 42)
      );
    case "practice-wraith":
      return columnEqualsNumber(whereClause, "id", 32) &&
        hasExactOrderedRows(result, ["child_id", "master_id"], [[32, 33]]);
    case "practice-spark":
      return columnEqualsNumber(whereClause, "id", 43) &&
        hasSingleValue(result, "id", 43);
    case "forge-boss-scan":
      return columnEqualsNumber(whereClause, "id", 44) &&
        hasSingleValue(result, "id", 44);
    case "forge-boss-core":
      return columnEqualsNumber(whereClause, "id", 44) &&
        hasSingleValue(result, "id", 44);
    case "f5-over-count":
      return hasExactOrderedRows(result, ["id", "guard_total"], [
        [45, 3],
        [46, 3],
        [47, 3],
      ]);
    case "f5-row-number-order":
      return hasExactOrderedRows(result, ["id", "sector", "pos"], [
        [48, "arena", 1],
        [47, "arena", 2],
        [46, "outer", 1],
        [45, "outer", 2],
      ]);
    case "f5-rank-ties":
      return hasExactOrderedRows(result, ["id", "power", "rank_no", "dense_no"], [
        [48, 22, 1, 1],
        [46, 20, 2, 2],
        [47, 20, 2, 2],
      ]);
    case "f5-lag-lead-delta":
      return hasExactOrderedRows(result, ["id", "power", "prev_power", "next_power"], [
        [45, 18, null, 20],
        [46, 20, 18, 20],
        [47, 20, 20, 22],
        [48, 22, 20, 24],
        [49, 24, 22, null],
      ]);
    case "f5-frame-running":
      return hasExactOrderedRows(result, ["id", "running_power"], [
        [45, 18],
        [46, 38],
        [47, 58],
        [48, 80],
        [49, 104],
      ]);
    case "f5-top-n-groups":
      return hasExactOrderedRows(result, ["sector", "id", "power"], [
        ["arena", 48, 22],
        ["core", 50, 28],
        ["outer", 46, 20],
        ["wall", 49, 24],
      ]);
    case "f5-top-n-core":
      return hasExactOrderedRows(result, ["sector", "id", "rn"], [
        ["arena", 48, 1],
        ["arena", 47, 2],
        ["outer", 46, 1],
        ["outer", 45, 2],
      ]);
    case "practice-goblin":
      return hasExactOrderedRows(result, ["id", "guard_total"], [
        [51, 2],
        [52, 2],
      ]);
    case "practice-orc":
      return hasExactOrderedRows(result, ["id", "pos"], [
        [52, 1],
        [51, 2],
      ]);
    case "practice-knight":
      return hasExactOrderedRows(result, ["id", "power", "rank_no"], [
        [53, 24, 1],
        [52, 20, 2],
      ]);
    case "practice-troll":
      return hasExactOrderedRows(result, ["id", "running_power"], [
        [51, 18],
        [52, 38],
        [53, 62],
        [54, 84],
      ]);
    case "iron-boss-scan":
      return hasExactOrderedRows(result, ["id", "rank_no"], [
        [51, 5],
        [52, 4],
        [53, 2],
        [54, 3],
        [55, 1],
      ]);
    case "iron-boss-core":
      return hasExactOrderedRows(result, ["id", "prev_power", "next_power"], [
        [51, null, 20],
        [52, 18, 24],
        [53, 20, 22],
        [54, 24, 26],
        [55, 22, null],
      ]);
    case "f6-insert-row":
      return hasSandboxRows(result, [
        ...SANDBOX_BASE_ROWS,
        [6, "claw", 2, "ready"],
      ]);
    case "f6-update-target":
      return hasSandboxRows(result, [
        SANDBOX_BASE_ROWS[0],
        [2, "scale", 1, "fixed"],
        ...SANDBOX_BASE_ROWS.slice(2),
      ]);
    case "f6-delete-duplicate":
      return hasSandboxRows(result, SANDBOX_BASE_ROWS.filter((row) => row[0] !== 4));
    case "f6-constraint-ignore":
    case "f6-transaction-rollback":
    case "practice-thunder-drake":
    case "practice-crystal-drake":
      return hasSandboxRows(result, SANDBOX_BASE_ROWS);
    case "f6-savepoint-rollback":
      return hasSandboxRows(result, [
        SANDBOX_BASE_ROWS[0],
        [2, "scale", 1, "fixed"],
        ...SANDBOX_BASE_ROWS.slice(2),
      ]);
    case "f6-savepoint-commit":
      return hasSandboxRows(result, [
        SANDBOX_BASE_ROWS[0],
        [2, "scale", 1, "fixed"],
        ...SANDBOX_BASE_ROWS.slice(2).filter((row) => row[0] !== 4),
      ]);
    case "practice-hatchling":
      return hasSandboxRows(result, [
        ...SANDBOX_BASE_ROWS,
        [7, "ember", 1, "ready"],
      ]);
    case "practice-wyvern":
      return hasSandboxRows(result, [
        [1, "ore", 3, "ready"],
        ...SANDBOX_BASE_ROWS.slice(1),
      ]);
    case "dragon-boss-scan":
      return hasSandboxRows(result, SANDBOX_BASE_ROWS.filter((row) => row[0] !== 4));
    case "dragon-boss-core":
      return hasSandboxRows(result, SANDBOX_BASE_ROWS);
    case "f7-btree-search":
      return hasExactOrderedRows(result, ["code", "score"], [["CRY-103", 72]]) &&
        planContains(result, "SEARCH", "INTEGER PRIMARY KEY");
    case "f7-composite-prefix":
      return hasExactOrderedRows(result, ["code", "score"], [
        ["CRY-106", 95],
        ["CRY-104", 88],
        ["CRY-102", 84],
        ["CRY-107", 82],
      ]) && planContains(result, "SEARCH", "idx_index_records_realm_score");
    case "f7-covering-read":
      return hasExactOrderedRows(result, ["category", "code"], [
        ["guard", "CRY-101"],
        ["guard", "CRY-102"],
        ["guard", "CRY-104"],
        ["guard", "EMB-201"],
        ["guard", "VOI-301"],
      ]) && planContains(result, "COVERING INDEX", "idx_index_records_category_code");
    case "f7-invalid-rewrite":
      return hasExactOrderedRows(result, ["code"], [
        ["CRY-105"],
        ["CRY-106"],
        ["CRY-107"],
      ]) && planContains(result, "SEARCH", "idx_index_records_code");
    case "f7-plan-audit":
      return hasExactOrderedRows(result, ["realm", "peak"], [["ember", 92]]) &&
        planContains(result, "SEARCH", "idx_index_records_realm_score");
    case "f7-optimize-top":
      return hasExactOrderedRows(result, ["code", "score"], [
        ["CRY-106", 95],
        ["CRY-104", 88],
      ]) &&
        planContains(result, "SEARCH", "idx_index_records_realm_score") &&
        !planContains(result, "USE TEMP B-TREE");
    case "f7-optimize-core":
      return hasExactOrderedRows(result, ["code"], [
        ["CRY-106"],
        ["CRY-107"],
        ["EMB-203"],
        ["VOI-302"],
      ]) && planContains(result, "COVERING INDEX", "idx_index_records_category_code");
    case "practice-branch":
      return hasExactOrderedRows(result, ["code"], [["CRY-101"]]) &&
        planContains(result, "SEARCH");
    case "practice-root":
      return hasExactOrderedRows(result, ["code", "score"], [
        ["CRY-106", 95],
        ["CRY-104", 88],
      ]) && planContains(result, "idx_index_records_realm_score");
    case "practice-crystal":
      return hasExactOrderedRows(result, ["category", "code"], [
        ["charm", "CRY-105"],
        ["charm", "EMB-202"],
      ]) && planContains(result, "COVERING INDEX");
    case "practice-vine":
      return hasExactOrderedRows(result, ["code"], [
        ["CRY-101"],
        ["CRY-102"],
      ]) && planContains(result, "idx_index_records_code");
    case "index-boss-scan":
      return hasExactOrderedRows(result, ["code", "score"], [
        ["VOI-302", 86],
        ["VOI-301", 68],
      ]) && planContains(result, "idx_index_records_realm_score");
    case "index-boss-core":
      return hasExactOrderedRows(result, ["code"], [["VOI-302"]]) &&
        planContains(result, "SEARCH");
    case "f8-mvcc-visible":
      return hasExactOrderedRows(result, ["row_id", "value"], [
        [1, "crystal"],
        [2, "locked"],
        [3, "safe"],
      ]);
    case "f8-lock-cycle":
      return hasExactOrderedRows(result, ["waiter_tx", "blocker_tx"], [["T1", "T2"]]);
    case "f8-isolation-phantom":
      return hasExactOrderedRows(result, ["phenomenon", "prevented_by"], [
        ["phantom_read", "SERIALIZABLE"],
      ]);
    case "f8-modeling-safe":
      return hasExactOrderedRows(result, ["model"], [["normalized"]]);
    case "f8-replication-fresh":
      return hasExactOrderedRows(result, ["node", "lag_ms"], [["replica-b", 18]]);
    case "f8-sharding-balance":
      return hasExactOrderedRows(result, ["shard_id", "total"], [
        [0, 2],
        [2, 3],
      ]);
    case "f8-final-snapshot":
      return hasExactOrderedRows(result, ["value"], [["locked"]]);
    case "f8-final-deadlock":
      return hasExactOrderedRows(result, ["waiter_tx", "resource"], [
        ["T1", "account:7"],
        ["T3", "log:2"],
      ]);
    case "f8-final-anomaly":
      return hasExactOrderedRows(result, ["prevented_by"], [["SERIALIZABLE"]]);
    case "f8-final-route":
      return hasExactOrderedRows(result, ["node", "lag_ms"], [["replica-a", 120]]);
    case "f8-final-security":
      return hasExactOrderedRows(result, ["method"], [["prepared-select"]]);
    case "practice-demon":
      return hasExactOrderedRows(result, ["value"], [["safe"]]);
    case "practice-dark-knight":
      return hasExactOrderedRows(result, ["blocker_tx", "resource"], [["T2", "log:2"]]);
    case "practice-lich":
      return hasExactOrderedRows(result, ["first_count", "second_count"], [[2, 4]]);
    case "practice-golem":
      return hasExactOrderedRows(result, ["model", "score"], [["normalized", 95]]);
    case "throne-boss-scan":
      return hasExactOrderedRows(
        result,
        ["waiter_tx", "blocker_tx", "resource"],
        [["T3", "T2", "log:2"]],
      );
    case "throne-boss-core":
      return hasExactOrderedRows(
        result,
        ["phenomenon", "first_count", "second_count", "prevented_by"],
        [["phantom_read", 2, 4, "SERIALIZABLE"]],
      );
  }
}

const WRONG_RESULT_MESSAGE: Record<AuthoredLessonStageId, string> = {
  "select-name": "结果没有精确读出 ID #001 的 id 与 status。检查投影列、来源表和 id = 1。",
  "select-weakness": "结果没有精确读出 ID #001 的 weakness。检查完整 SELECT。",
  "where-target": "结果没有唯一锁定 ID #002。检查 room_id、status 和多余行。",
  "where-weakness": "没有按 id 与 status 读出 ID #002 的 weakness。",
  "null-target": "没有锁定无主的 ID #003。NULL 不能使用等号比较。",
  "null-name": "没有按空主人和诅咒状态读出 ID #003 的 id。",
  "group-signals": "分组结果应为 echo = 3、noise = 1；检查 ID #004、COUNT(*) 与 channel。",
  "having-shield": "护盾阶段应保留 echo = 3 与 ward = 2；HAVING 要过滤聚合后的组。",
  "having-core": "核心阶段只应保留 echo = 3；把 HAVING 阈值提高到 3。",
  "practice-select": "结果没有精确读出 ID #006。检查投影列、表名与 id = 6。",
  "practice-where": "结果没有锁定 ID #007。需要同时过滤 room_id 与 status。",
  "practice-null": "结果没有读出无主的 ID #008。检查 IS NULL 与 toxic 状态。",
  "practice-group": "ID #009 的信号应得到 echo = 2、noise = 2；检查 COUNT(*) 与 GROUP BY。",
  "practice-group-core": "没有按 id 读出 ID #009。",
  "order-peak": "没有取出 charge 最高的 surge；检查 DESC 与 LIMIT 1。",
  "order-top-two": "前两行应依次是 surge = 13、arc = 11；检查排序方向与 LIMIT 2。",
  "distinct-status": "去重结果应只有 echo、mirror；本题只检查 DISTINCT，不需要排序。",
  "inner-join-room": "没有用 m.id 与 r.name AS room_name 返回 ID #012 和“古树桥”。",
  "inner-join-sector": "连接结果应只返回 ID #012 的 m.id = 12 与 rooms 表的 r.sector = forest；检查投影列和 WHERE 条件。",
  "left-join-unarmed": "没有找到右表缺失的 #13；检查 LEFT JOIN 与 g.monster_id IS NULL。",
  "join-boss-groups": "第一层护盾只要求用 m.room_id = r.id 返回 ID #014 与 lighthouse 区域。",
  "join-boss-core": "没有定位 ID #014 的 power = 21 最强装备；检查 JOIN、DESC 与 LIMIT 1。",
  "practice-order": "没有取出 ID #015 的最高 surge 信号；检查 DESC 与 LIMIT。",
  "practice-distinct": "ID #016 的信号应去重为 echo、mirror。",
  "practice-inner-join": "没有把 ID #017 与泥沼石径正确连接。",
  "practice-left-join": "没有找出 room_id = 34 且无装备记录的 ID #018。",
  "practice-left-core": "第二击仍需 LEFT JOIN，同时按 toxic 状态找出无装备的 ID #018。",
  "practice-forest-order": "没有按 hp 降序取出 ID #019 的记录。",
  "practice-forest-join": "没有用 id 与 room_name 把 ID #020 和盘根林地正确连接。",
  "practice-forest-join-core": "没有返回 ID #020 的 id 与 forest 区域。",
  "lake-boss-scan": "没有按 charge 降序读出 ID #021 的两条最强信号。",
  "lake-boss-sort": "没有用 DISTINCT 与 ORDER BY 读出 ID #021 的三类信号。",
  "frog-boss-left": "没有用 LEFT JOIN 找出无装备的 ID #022。",
  "frog-boss-distinct": "没有连接二层房间并去重返回 ID #022 的 id 与 room_name。",
  "f3-inner-room": "没有连接 ID #023 与骨桥前庭；检查 room_id = rooms.id。",
  "f3-left-unarmed": "没有用 LEFT JOIN 找出 42 号房间中无装备的 ID #024。",
  "f3-self-master": "没有用两个别名返回 ID #025 与其 master_id。",
  "f3-chain-gear": "没有串联三张表返回骑士墓、ID #026 与 power = 18。",
  "f3-union-patrol": "合并结果应为 ID #023 与 #025；本题只检查 UNION，不要求排序。",
  "f3-audit-groups": "第一层封印只要求用 m.room_id = r.id 返回 ID #028 与 throne 区域。",
  "f3-audit-core": "没有找出 ID #028 的最高装备 power = 24。",
  "f3-audit-verdict": "最终分区审计应得到 crypt、grave、throne 各 2 条证词。",
  "practice-bone": "没有连接 ID #029 与遗骨荒地。",
  "practice-zombie": "没有用 LEFT JOIN 找出无装备的 ID #030。",
  "practice-spirit": "没有用自连接返回 ID #031 与其 master_id。",
  "practice-spirit-core": "第二击仍需自连接，并按 haunting 状态返回 ID #031 与其 master_id。",
  "practice-wraith": "没有用自连接返回 ID #032 与其 master_id。",
  "grave-boss-scan": "三表连接应返回 ID #033、墓主祭坛与 power = 22。",
  "grave-boss-core": "没有用自连接返回 ID #033 与其 master_id。",
  "f4-scalar-first": "标量子查询没有返回 51 号房间中 id 最小的 ID #034。",
  "f4-in-frost": "IN 子查询没有返回第四层 frost 房间中的 ID #035。",
  "f4-exists-gear": "EXISTS 没有验证 ID #036 的装备记录。",
  "f4-correlated-gear": "相关子查询没有验证 ID #037 的最高装备 power。",
  "f4-cte-armor": "CTE 没有筛出 power >= 20 的 ID #038。",
  "f4-recursive-rooms": "递归房间序列应依次返回火室、冰库、雷池。",
  "f4-recursive-core": "递归关系应依次返回 ID #034、#037 与 #039。",
  "practice-fire": "标量子查询没有返回 ID #040。",
  "practice-ice": "IN 子查询应按 id 返回 frost-vault 中的 ID #041 与 #044。",
  "practice-storm": "EXISTS 没有验证 ID #042 的装备记录。",
  "practice-storm-core": "没有按 id 与 charged 状态返回 ID #042。",
  "practice-spark": "EXISTS 没有验证 ID #043 的装备记录。",
  "forge-boss-scan": "IN 子查询没有返回拥有 power >= 22 装备的 ID #044。",
  "forge-boss-core": "EXISTS 没有验证 ID #044 的装备记录。",
  "f5-over-count": "分区计数应保留 ID #045、#046、#047 三行，并让 guard_total 均为 3。",
  "f5-row-number-order": "区域编号顺序不正确；检查 sector 分区、power DESC 和 id 稳定排序。",
  "f5-rank-ties": "并列排名不正确；ID #046 与 #047 应共享 rank_no = 2、dense_no = 2。",
  "f5-lag-lead-delta": "前后行 power 不正确；检查 LAG、LEAD 与 id 顺序。",
  "f5-frame-running": "累计 power 应依次为 18、38、58、80、104。",
  "f5-top-n-groups": "没有返回 arena、core、outer、wall 各自装备 power 最高的守军。",
  "f5-top-n-core": "outer 与 arena 应各保留 rn 1、2 两名守军。",
  "practice-goblin": "ID #051 与 #052 应各显示 guard_total = 2。",
  "practice-orc": "ROW_NUMBER 应先返回 ID #052，再返回 ID #051。",
  "practice-knight": "排名结果应为 ID #053 第一、ID #052 第二。",
  "practice-troll": "累计结果应依次为 18、38、62、84。",
  "iron-boss-scan": "RANK 结果没有按装备 power 给 ID #051–#055 正确排名。",
  "iron-boss-core": "LAG / LEAD 没有按 id 返回正确的前后 power。",
  "f6-insert-row": "沙箱最终状态缺少 id = 6 的 claw 记录，或修改了其他行。",
  "f6-update-target": "只应把 id = 2 的 status 改为 fixed。",
  "f6-delete-duplicate": "只应删除 id = 4，id = 3 的重复证据必须保留。",
  "f6-constraint-ignore": "违反 CHECK 的行不应进入沙箱，其他初始行必须保持不变。",
  "f6-transaction-rollback": "ROLLBACK 后沙箱必须完全恢复进入事务前的五行。",
  "f6-savepoint-rollback": "局部回滚后 id = 2 应保持 fixed，id = 3 必须恢复。",
  "f6-savepoint-commit": "提交后应保留 id = 2 的修复，并只删除 id = 4。",
  "practice-hatchling": "沙箱最终状态缺少 id = 7 的 ember 记录。",
  "practice-wyvern": "只应把 id = 1 的 quantity 更新为 3。",
  "practice-thunder-drake": "ROLLBACK 后沙箱必须恢复原始五行。",
  "practice-crystal-drake": "无效 quantity 不应写入沙箱。",
  "dragon-boss-scan": "DELETE 只能移除 repair_queue 的 id = 4。",
  "dragon-boss-core": "CHECK 约束应拒绝 quantity = -2，沙箱必须保持不变。",
  "f7-btree-search": "结果或计划不正确：应返回 CRY-103、72，并通过主键 SEARCH 点查。",
  "f7-composite-prefix": "应按 95、88、84、82 返回 crystal 高分记录，并命中 realm/score 联合索引。",
  "f7-covering-read": "应只返回 guard 的 category、code，并在计划中出现覆盖索引。",
  "f7-invalid-rewrite": "范围结果应为 CRY-105 到 CRY-107，并沿 code 索引 SEARCH。",
  "f7-plan-audit": "ember 的 peak 应为 92，执行计划应使用 realm/score 联合索引。",
  "f7-optimize-top": "前两名应为 CRY-106、CRY-104，且不应出现临时排序 B-Tree。",
  "f7-optimize-core": "应只从覆盖索引返回四条 boss code。",
  "practice-branch": "应通过主键点查返回 CRY-101。",
  "practice-root": "应按 95、88 返回两条 crystal 根道记录。",
  "practice-crystal": "应通过覆盖索引返回 CRY-105 与 EMB-202。",
  "practice-vine": "闭开范围应只返回 CRY-101、CRY-102。",
  "index-boss-scan": "void 区结果应依次为 VOI-302、VOI-301。",
  "index-boss-core": "VOI 前缀的 boss 记录应只返回 VOI-302。",
  "f8-mvcc-visible": "事务 12 的可见值应为 crystal、locked、safe。",
  "f8-lock-cycle": "等待图中互锁的一对是 T1 与 T2。",
  "f8-isolation-phantom": "数量变大的事故应识别为 phantom_read，并由 SERIALIZABLE 阻止。",
  "f8-modeling-safe": "满足三项约束且评分最高的模型应为 normalized。",
  "f8-replication-fresh": "健康副本中延迟最低的是 replica-b，18ms。",
  "f8-sharding-balance": "有效路由统计应得到 shard 0 = 2、shard 2 = 3。",
  "f8-final-snapshot": "事务 12 下 row_id = 2 的可见值应为 locked。",
  "f8-final-deadlock": "被 T2 阻塞的是 T1/account:7 与 T3/log:2。",
  "f8-final-anomaly": "phantom_read 的阻止策略应为 SERIALIZABLE。",
  "f8-final-route": "不健康副本应为 replica-a，延迟 120ms。",
  "f8-final-security": "同时参数化、最小权限且允许执行的方法应为 prepared-select。",
  "practice-demon": "事务 12 下 row_id = 3 的可见值应为 safe。",
  "practice-dark-knight": "T3 正被 T2 在 log:2 上阻塞。",
  "practice-lich": "phantom_read 的两次计数应为 2、4。",
  "practice-golem": "零重复组中评分最高的模型应为 normalized、95。",
  "throne-boss-scan": "锁等待链应返回 T3 等待 T2 的 log:2。",
  "throne-boss-core": "隔离异常应返回 phantom_read、2 → 4 与 SERIALIZABLE。",
};

function wrongResultMessage(
  stageId: AuthoredLessonStageId,
  result: SqlQueryResult,
): string {
  if (
    stageId === "inner-join-sector" &&
    !joinsTables(
      normalizeStructure(result.sql),
      "monsters",
      "rooms",
      "room_id",
      "id",
    )
  ) {
    return "连接键写错了：monsters.room_id 才对应 rooms.id。使用 ON m.room_id = r.id，不要写成 m.id = r.id。";
  }
  return WRONG_RESULT_MESSAGE[stageId];
}

export function matchesAuthoredStage(
  stageId: AuthoredLessonStageId,
  result: SqlQueryResult,
): boolean {
  return stageMatches(stageId, result);
}

export function authoredWrongResultMessage(
  stageId: AuthoredLessonStageId,
  result: SqlQueryResult,
): string {
  return wrongResultMessage(stageId, result);
}
