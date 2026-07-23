import { lessonById } from "../content/mvpLevel";
import type {
  LessonId,
  LessonStageDefinition,
  LessonStageId,
  QueryEvaluation,
  QueryFeature,
  SqlQueryResult,
} from "./types";

function stripLiteralsAndComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""');
}

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

function normalizeStructure(sql: string): string {
  return stripComments(sql).replace(/\s+/g, " ").trim();
}

function isFlatBeginnerSelect(sql: string): boolean {
  const keywordSql = stripLiteralsAndComments(sql).replace(/\s+/g, " ").trim();
  const selectCount = keywordSql.match(/\bselect\b/gi)?.length ?? 0;
  return (
    selectCount === 1 &&
    !/\b(?:union|intersect|except|or)\b/i.test(keywordSql)
  );
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

export function detectQueryFeatures(sql: string): QueryFeature[] {
  const normalized = stripLiteralsAndComments(sql).replace(/\s+/g, " ").trim();
  const features: QueryFeature[] = [];
  const selectCount = normalized.match(/\bselect\b/gi)?.length ?? 0;
  if (selectCount > 0) features.push("select");
  if (/\bfrom\b/i.test(normalized)) features.push("from");
  if (/\bwhere\b/i.test(normalized)) features.push("where");
  if (/\band\b/i.test(normalized)) features.push("and");
  if (/\bis\s+null\b/i.test(normalized)) features.push("is-null");
  if (/\bcount\s*\(/i.test(normalized)) features.push("count");
  if (/\bgroup\s+by\b/i.test(normalized)) features.push("group-by");
  if (/\bhaving\b/i.test(normalized)) features.push("having");
  if (/\border\s+by\b/i.test(normalized)) features.push("order-by");
  if (/\blimit\s+\d+\b/i.test(normalized)) features.push("limit");
  if (/\bselect\s+distinct\b/i.test(normalized)) features.push("distinct");
  if (/\bleft\s+(?:outer\s+)?join\b/i.test(normalized)) {
    features.push("left-join");
  } else if (/\b(?:inner\s+)?join\b/i.test(normalized)) {
    features.push("join");
  }
  if (/\bon\b/i.test(normalized)) features.push("on");
  if (
    /\bfrom\s+monsters\s+(?:as\s+)?([a-z_]\w*)\s+(?:inner\s+)?join\s+monsters\s+(?:as\s+)?([a-z_]\w*)\b/i
      .test(normalized)
  ) features.push("self-join");
  if (/\bunion(?:\s+all)?\b/i.test(normalized)) features.push("union");
  if (selectCount > 1) features.push("subquery");
  if (/\bin\s*\(\s*select\b/i.test(normalized)) features.push("in");
  if (/\bexists\s*\(\s*select\b/i.test(normalized)) features.push("exists");
  if (/^with\b/i.test(normalized)) features.push("cte");
  if (/^with\s+recursive\b/i.test(normalized)) features.push("recursive");
  if (/\bover\s*\(/i.test(normalized)) features.push("over");
  if (/\bpartition\s+by\b/i.test(normalized)) features.push("partition-by");
  if (/\brow_number\s*\(/i.test(normalized)) features.push("row-number");
  if (/\brank\s*\(/i.test(normalized)) features.push("rank");
  if (/\bdense_rank\s*\(/i.test(normalized)) features.push("dense-rank");
  if (/\blag\s*\(/i.test(normalized)) features.push("lag");
  if (/\blead\s*\(/i.test(normalized)) features.push("lead");
  if (
    /\brows\s+between\s+(?:unbounded\s+preceding|\d+\s+preceding)\s+and\s+(?:current\s+row|\d+\s+following)\b/i
      .test(normalized)
  ) features.push("window-frame");
  if (/(?:^|;)\s*insert\b/i.test(normalized)) features.push("insert");
  if (/(?:^|;)\s*update\b/i.test(normalized)) features.push("update");
  if (/(?:^|;)\s*delete\b/i.test(normalized)) features.push("delete");
  if (/\binsert\s+or\s+ignore\b/i.test(normalized)) features.push("constraint");
  if (/(?:^|;)\s*begin\b/i.test(normalized)) features.push("transaction");
  if (/\bsavepoint\s+[a-z_]\w*\b/i.test(normalized)) features.push("savepoint");
  if (/\brollback(?:\s+to)?\b/i.test(normalized)) features.push("rollback");
  if (/\bcommit\b/i.test(normalized)) features.push("commit");
  return features;
}

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

const NON_FLAT_STAGES = new Set<LessonStageId>([
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

function stageMatches(stageId: LessonStageId, result: SqlQueryResult): boolean {
  if (!NON_FLAT_STAGES.has(stageId) && !isFlatBeginnerSelect(result.sql)) return false;
  const normalizedSql = normalizeStructure(result.sql);
  const whereClause = clauseBetween(normalizedSql, "where");
  const groupClause = clauseBetween(normalizedSql, "group by");
  const havingClause = clauseBetween(normalizedSql, "having");

  switch (stageId) {
    case "select-name":
      return (
        projectsOnlyColumn(normalizedSql, "name") &&
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 101) &&
        hasSingleValue(result, "name", "史莱姆")
      );
    case "select-weakness":
      return (
        projectsOnlyColumn(normalizedSql, "weakness") &&
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 101) &&
        hasSingleValue(result, "weakness", "slash")
      );
    case "where-target":
      return (
        projectsOnlyColumn(normalizedSql, "id") &&
        columnEqualsNumber(whereClause, "room_id", 2) &&
        columnEqualsString(whereClause, "status", "escaped") &&
        !filtersByDirectId(whereClause) &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [201])
      );
    case "where-weakness":
      return (
        projectsOnlyColumn(normalizedSql, "weakness") &&
        columnEqualsString(whereClause, "name", "水胶怪") &&
        columnEqualsString(whereClause, "status", "escaped") &&
        !filtersByDirectId(whereClause) &&
        hasSingleValue(result, "weakness", "focus")
      );
    case "null-target":
      return (
        projectsOnlyColumn(normalizedSql, "id") &&
        columnEqualsNumber(whereClause, "room_id", 3) &&
        columnIsNull(whereClause, "master_id") &&
        !filtersByDirectId(whereClause) &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [301])
      );
    case "null-name":
      return (
        projectsOnlyColumn(normalizedSql, "name") &&
        columnIsNull(whereClause, "master_id") &&
        columnEqualsString(whereClause, "status", "cursed") &&
        !filtersByDirectId(whereClause) &&
        hasSingleValue(result, "name", "毒胶怪")
      );
    case "group-signals":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        hasAggregateProjection(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 800) &&
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
        columnEqualsNumber(whereClause, "monster_id", 900) &&
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
        columnEqualsNumber(whereClause, "monster_id", 900) &&
        new RegExp(qualifiedColumn("channel"), "i").test(groupClause) &&
        /\b(?:count\s*\([^)]*\)|total)\s*(?:>=\s*3\b|>\s*2\b)/i.test(havingClause) &&
        hasExactColumns(result.columns, ["channel", "total"]) &&
        hasExactAggregateRows(result.rows, [{ channel: "echo", total: 3 }])
      );
    case "practice-select":
      return (
        projectsOnlyColumn(normalizedSql, "name") &&
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 111) &&
        hasSingleValue(result, "name", "软泥怪")
      );
    case "practice-where":
      return (
        projectsOnlyColumn(normalizedSql, "id") &&
        columnEqualsNumber(whereClause, "room_id", 12) &&
        columnEqualsString(whereClause, "status", "wet") &&
        !filtersByDirectId(whereClause) &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [211])
      );
    case "practice-null":
      return (
        projectsOnlyColumn(normalizedSql, "name") &&
        columnIsNull(whereClause, "master_id") &&
        columnEqualsString(whereClause, "status", "toxic") &&
        !filtersByDirectId(whereClause) &&
        hasSingleValue(result, "name", "毒胶怪")
      );
    case "practice-group":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        hasAggregateProjection(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 810) &&
        new RegExp(qualifiedColumn("channel"), "i").test(groupClause) &&
        hasExactColumns(result.columns, ["channel", "total"]) &&
        hasExactAggregateRows(result.rows, [
          { channel: "echo", total: 2 },
          { channel: "noise", total: 2 },
        ])
      );
    case "practice-group-core":
      return (
        projectsOnlyColumn(normalizedSql, "name") &&
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 810) &&
        hasSingleValue(result, "name", "铁胶怪")
      );
    case "order-peak":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 1200) &&
        /\border\s+by\s+(?:\w+\.)?charge\s+desc\b/i.test(normalizedSql) &&
        /\blimit\s+1\b/i.test(normalizedSql) &&
        hasSingleValue(result, "channel", "surge")
      );
    case "order-top-two":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 1200) &&
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
        columnEqualsNumber(whereClause, "monster_id", 1300) &&
        /\border\s+by\s+(?:\w+\.)?channel(?:\s+asc)?\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["channel"], [["echo"], ["mirror"]])
      );
    case "inner-join-room":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 1400) &&
        hasExactOrderedRows(result, ["name", "room_name"], [
          ["树妖", "古树桥"],
        ])
      );
    case "inner-join-sector":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 1400) &&
        hasExactOrderedRows(result, ["name", "sector"], [
          ["树妖", "forest-bridge"],
        ])
      );
    case "left-join-unarmed":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id", true) &&
        columnEqualsNumber(whereClause, "room_id", 24) &&
        columnIsNull(whereClause, "monster_id") &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [1500])
      );
    case "join-boss-groups":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "floor", 2) &&
        new RegExp(qualifiedColumn("sector"), "i").test(groupClause) &&
        /\b(?:count\s*\([^)]*\)|total)\s*(?:>=\s*2\b|>\s*1\b)/i.test(havingClause) &&
        /\border\s+by\s+(?:\w+\.)?total\s+desc\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["sector", "total"], [
          ["ambush", 4],
          ["storm", 2],
        ])
      );
    case "join-boss-core":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id") &&
        columnEqualsNumber(whereClause, "id", 1900) &&
        /\border\s+by\s+(?:\w+\.)?power\s+desc\b/i.test(normalizedSql) &&
        /\blimit\s+1\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["name", "power"], [
          ["丛林王", 21],
        ])
      );
    case "practice-order":
      return (
        /\bfrom\s+monster_signals\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 1210) &&
        /\border\s+by\s+(?:\w+\.)?charge\s+desc\b/i.test(normalizedSql) &&
        /\blimit\s+1\b/i.test(normalizedSql) &&
        hasSingleValue(result, "channel", "surge")
      );
    case "practice-distinct":
      return (
        /^select\s+distinct\s+(?:\w+\.)?channel\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "monster_id", 1310) &&
        hasExactOrderedRows(result, ["channel"], [["echo"], ["mirror"]])
      );
    case "practice-inner-join":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 1410) &&
        hasExactOrderedRows(result, ["name", "room_name"], [
          ["青蛙", "泥沼石径"],
        ])
      );
    case "practice-left-join":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id", true) &&
        columnEqualsNumber(whereClause, "room_id", 34) &&
        columnIsNull(whereClause, "monster_id") &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [1510])
      );
    case "practice-left-core":
      return (
        projectsOnlyColumn(normalizedSql, "name") &&
        columnEqualsNumber(whereClause, "id", 1510) &&
        columnEqualsString(whereClause, "status", "toxic") &&
        hasSingleValue(result, "name", "毒蛙")
      );
    case "practice-forest-order":
      return (
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 1610) &&
        /\border\s+by\s+(?:\w+\.)?hp\s+desc\b/i.test(normalizedSql) &&
        /\blimit\s+1\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["name", "hp"], [["猎犬", 13]])
      );
    case "practice-forest-join":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 1710) &&
        hasExactOrderedRows(result, ["name", "room_name"], [["树妖", "树妖林地"]])
      );
    case "practice-forest-join-core":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 1710) &&
        /\border\s+by\s+(?:\w+\.)?sector(?:\s+asc)?\b/i.test(normalizedSql) &&
        /\blimit\s+1\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["name", "sector"], [["树妖", "forest-treant"]])
      );
    case "lake-boss-scan":
      return (
        /\bfrom\s+monsters\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 1810) &&
        hasExactOrderedRows(result, ["name", "status"], [["湖怪", "submerged"]])
      );
    case "lake-boss-sort":
      return (
        /^select\s+distinct\s+(?:\w+\.)?status\b/i.test(normalizedSql) &&
        columnEqualsNumber(whereClause, "id", 1810) &&
        /\border\s+by\s+(?:\w+\.)?status(?:\s+asc)?\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["status"], [["submerged"]])
      );
    case "frog-boss-left":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id", true) &&
        columnEqualsNumber(whereClause, "id", 1911) &&
        columnIsNull(whereClause, "monster_id") &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [1911])
      );
    case "frog-boss-distinct":
      return (
        /^select\s+distinct\s+(?:\w+\.)?name\b/i.test(normalizedSql) &&
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "floor", 2) &&
        columnEqualsNumber(whereClause, "id", 1911) &&
        /\border\s+by\s+(?:\w+\.)?name(?:\s+asc)?\b/i.test(normalizedSql) &&
        hasExactOrderedRows(result, ["name"], [["蛙王"]])
      );
    case "f3-inner-room":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 1) &&
        hasExactOrderedRows(result, ["name", "room_name"], [["骷髅", "骨桥前庭"]])
      );
    case "f3-left-unarmed":
      return (
        joinsTables(normalizedSql, "monsters", "monster_gear", "id", "monster_id", true) &&
        columnEqualsNumber(whereClause, "room_id", 42) &&
        columnIsNull(whereClause, "monster_id") &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [2])
      );
    case "f3-self-master":
      return (
        result.features.includes("self-join") &&
        columnEqualsNumber(whereClause, "id", 3) &&
        hasExactOrderedRows(result, ["child_name", "master_name"], [["幽灵", "死灵王"]])
      );
    case "f3-chain-gear":
      return (
        (normalizedSql.match(/\bjoin\b/gi)?.length ?? 0) >= 2 &&
        columnEqualsNumber(whereClause, "id", 4) &&
        hasExactOrderedRows(
          result,
          ["room_name", "name", "power"],
          [["骑士墓", "铠骷髅", 18]],
        )
      );
    case "f3-union-patrol":
      return hasExactOrderedRows(result, ["id", "name"], [
        [1, "骷髅"],
        [3, "幽灵"],
      ]);
    case "f3-audit-groups":
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
        hasExactOrderedRows(result, ["name", "power"], [["死灵王", 24]])
      );
    case "practice-bone":
      return (
        columnEqualsNumber(whereClause, "id", 7) &&
        hasExactOrderedRows(result, ["name", "room_name"], [["碎骨", "遗骨荒地"]])
      );
    case "practice-zombie":
      return (
        columnEqualsNumber(whereClause, "id", 8) &&
        columnIsNull(whereClause, "monster_id") &&
        hasSingleValue(result, "name", "腐尸")
      );
    case "practice-spirit":
      return (
        columnEqualsNumber(whereClause, "id", 9) &&
        hasExactOrderedRows(result, ["name", "master_name"], [["鬼火", "墓主"]])
      );
    case "practice-spirit-core":
      return (
        columnEqualsNumber(whereClause, "id", 9) &&
        columnEqualsString(whereClause, "status", "haunting") &&
        hasSingleValue(result, "name", "鬼火")
      );
    case "grave-boss-scan":
      return hasExactOrderedRows(result, ["id", "name"], [
        [9, "鬼火"],
        [10, "游魂"],
        [11, "墓主"],
      ]);
    case "grave-boss-core":
      return (
        columnEqualsNumber(whereClause, "id", 11) &&
        hasExactOrderedRows(result, ["name", "master_name"], [["墓主", "死灵王"]])
      );
    case "f4-scalar-first":
      return hasSingleValue(result, "name", "火灵");
    case "f4-in-frost":
      return hasExactOrderedRows(result, ["name"], [["冰灵"]]);
    case "f4-exists-gear":
      return columnEqualsNumber(whereClause, "id", 14) &&
        hasSingleValue(result, "name", "雷灵");
    case "f4-correlated-gear":
      return columnEqualsNumber(whereClause, "id", 15) &&
        /\bmax\s*\(/i.test(normalizedSql) &&
        hasSingleValue(result, "name", "石巨人");
    case "f4-cte-armor":
      return columnEqualsNumber(whereClause, "id", 16) &&
        hasSingleValue(result, "name", "炎王");
    case "f4-recursive-rooms":
      return hasExactOrderedRows(result, ["room_name"], [
        ["火室"],
        ["冰库"],
        ["雷池"],
      ]);
    case "f4-recursive-core":
      return hasExactOrderedRows(result, ["name", "depth"], [
        ["火灵", 1],
        ["石巨人", 2],
        ["元素王", 3],
      ]);
    case "practice-fire":
      return hasSingleValue(result, "name", "火苗");
    case "practice-ice":
      return hasExactOrderedRows(result, ["name"], [["冰晶"]]);
    case "practice-storm":
      return columnEqualsNumber(whereClause, "id", 20) &&
        hasSingleValue(result, "name", "雷兽");
    case "practice-storm-core":
      return (
        columnEqualsNumber(whereClause, "id", 20) &&
        columnEqualsString(whereClause, "status", "charged") &&
        hasSingleValue(result, "name", "雷兽")
      );
    case "practice-wraith":
      return columnEqualsNumber(whereClause, "id", 10) &&
        hasExactOrderedRows(result, ["name", "master_name"], [["游魂", "墓主"]]);
    case "practice-spark":
      return columnEqualsNumber(whereClause, "id", 21) &&
        hasSingleValue(result, "name", "电球");
    case "forge-boss-scan":
      return columnEqualsNumber(whereClause, "id", 22) &&
        hasSingleValue(result, "name", "炉主");
    case "forge-boss-core":
      return columnEqualsNumber(whereClause, "id", 22) &&
        hasSingleValue(result, "name", "炉主");
    case "f5-over-count":
      return hasExactOrderedRows(result, ["name", "guard_total"], [
        ["哥布林", 3],
        ["兽人", 3],
        ["骑士", 3],
      ]);
    case "f5-row-number-order":
      return hasExactOrderedRows(result, ["name", "sector", "pos"], [
        ["铁骑", "arena", 1],
        ["骑士", "arena", 2],
        ["兽人", "outer", 1],
        ["哥布林", "outer", 2],
      ]);
    case "f5-rank-ties":
      return hasExactOrderedRows(result, ["name", "power", "rank_no", "dense_no"], [
        ["铁骑", 22, 1, 1],
        ["兽人", 20, 2, 2],
        ["骑士", 20, 2, 2],
      ]);
    case "f5-lag-lead-delta":
      return hasExactOrderedRows(result, ["name", "power", "prev_power", "next_power"], [
        ["哥布林", 18, null, 20],
        ["兽人", 20, 18, 20],
        ["骑士", 20, 20, 22],
        ["铁骑", 22, 20, 24],
        ["巨魔", 24, 22, null],
      ]);
    case "f5-frame-running":
      return hasExactOrderedRows(result, ["name", "running_power"], [
        ["哥布林", 18],
        ["兽人", 38],
        ["骑士", 58],
        ["铁骑", 80],
        ["巨魔", 104],
      ]);
    case "f5-top-n-groups":
      return hasExactOrderedRows(result, ["sector", "name", "power"], [
        ["arena", "铁骑", 22],
        ["core", "城主", 28],
        ["outer", "兽人", 20],
        ["wall", "巨魔", 24],
      ]);
    case "f5-top-n-core":
      return hasExactOrderedRows(result, ["sector", "name", "rn"], [
        ["arena", "铁骑", 1],
        ["arena", "骑士", 2],
        ["outer", "兽人", 1],
        ["outer", "哥布林", 2],
      ]);
    case "practice-goblin":
      return hasExactOrderedRows(result, ["name", "guard_total"], [
        ["小妖", 2],
        ["战兽", 2],
      ]);
    case "practice-orc":
      return hasExactOrderedRows(result, ["name", "pos"], [
        ["战兽", 1],
        ["小妖", 2],
      ]);
    case "practice-knight":
      return hasExactOrderedRows(result, ["name", "power", "rank_no"], [
        ["铁卫", 24, 1],
        ["战兽", 20, 2],
      ]);
    case "practice-troll":
      return hasExactOrderedRows(result, ["name", "running_power"], [
        ["小妖", 18],
        ["战兽", 38],
        ["铁卫", 62],
        ["巨魔", 84],
      ]);
    case "iron-boss-scan":
      return hasExactOrderedRows(result, ["name", "power"], [["铁卫", 24]]);
    case "iron-boss-core":
      return hasExactOrderedRows(result, ["name", "prev_power"], [
        ["小妖", null],
        ["战兽", 18],
        ["铁卫", 20],
        ["巨魔", 24],
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
    case "dragon-boss-scan":
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
    case "dragon-boss-core":
      return hasSandboxRows(result, SANDBOX_BASE_ROWS.filter((row) => row[0] !== 4));
  }
}

const WRONG_RESULT_MESSAGE: Record<LessonStageId, string> = {
  "select-name": "结果没有精确读出史莱姆的 name。检查列名、来源表和 id = 101。",
  "select-weakness": "结果没有精确读出史莱姆的 weakness。检查完整 SELECT。",
  "where-target": "结果不是唯一的水胶怪。检查 room_id、status 和多余行。",
  "where-weakness": "没有按怪物名字与状态读出 weakness。不要只用 id 绕过过滤训练。",
  "null-target": "没有锁定无主毒胶怪。NULL 不能使用等号比较。",
  "null-name": "没有按空主人和诅咒状态读出毒胶怪名字。",
  "group-signals": "分组结果应为 echo = 3、noise = 1；检查执行官 ID、COUNT(*) 与 channel。",
  "having-shield": "护盾阶段应保留 echo = 3 与 ward = 2；HAVING 要过滤聚合后的组。",
  "having-core": "核心阶段只应保留 echo = 3；把 HAVING 阈值提高到 3。",
  "practice-select": "结果没有精确读出软泥怪的 name。检查列名、表名与 id = 111。",
  "practice-where": "结果没有锁定水胶怪。需要同时过滤 room_id 与 status。",
  "practice-null": "结果没有读出无主毒胶怪。检查 IS NULL 与 toxic 状态。",
  "practice-group": "铁胶怪信号应得到 echo = 2、noise = 2；检查 COUNT(*) 与 GROUP BY。",
  "practice-group-core": "没有按 id 读出铁胶怪的 name。",
  "order-peak": "没有取出 charge 最高的 surge；检查 DESC 与 LIMIT 1。",
  "order-top-two": "前两行应依次是 surge = 13、arc = 11；检查排序方向与 LIMIT 2。",
  "distinct-status": "去重结果应只有 echo、mirror；检查 DISTINCT 与排序。",
  "inner-join-room": "没有把树妖与“古树桥”正确连接；检查 room_id = rooms.id 与别名。",
  "inner-join-sector": "连接结果应显示树妖位于 forest-bridge sector。",
  "left-join-unarmed": "没有找到右表缺失的 #1500；检查 LEFT JOIN 与 g.monster_id IS NULL。",
  "join-boss-groups": "综合结果应依次为 ambush = 4、storm = 2；检查 JOIN、分组、HAVING 与排序。",
  "join-boss-core": "没有定位丛林王 power = 21 的最强装备；检查 JOIN、DESC 与 LIMIT 1。",
  "practice-order": "没有取出水怪的最高 surge 信号；检查 DESC 与 LIMIT。",
  "practice-distinct": "水蛇信号应去重为 echo、mirror。",
  "practice-inner-join": "没有把青蛙与泥沼石径正确连接。",
  "practice-left-join": "没有找出 room_id = 34 且无装备记录的毒蛙。",
  "practice-left-core": "没有按 id 与 toxic 状态读出毒蛙。",
  "practice-forest-order": "没有按 hp 降序取出猎犬记录。",
  "practice-forest-join": "没有把树妖与树妖林地正确连接。",
  "practice-forest-join-core": "没有返回树妖的 forest-treant 区域。",
  "lake-boss-scan": "没有按 id 读出湖怪的 name 与 status。",
  "lake-boss-sort": "没有用 DISTINCT 与 ORDER BY 读出湖怪状态。",
  "frog-boss-left": "没有用 LEFT JOIN 找出无装备的蛙王。",
  "frog-boss-distinct": "没有连接二层房间并去重返回蛙王名字。",
  "f3-inner-room": "没有连接骷髅与骨桥前庭；检查 room_id = rooms.id。",
  "f3-left-unarmed": "没有用 LEFT JOIN 找出 42 号房间中无装备的僵尸。",
  "f3-self-master": "没有用两个别名返回幽灵与死灵王。",
  "f3-chain-gear": "没有串联三张表返回骑士墓、铠骷髅与 power = 18。",
  "f3-union-patrol": "合并结果应依次为骷髅与幽灵；检查两侧字段和 ORDER BY。",
  "f3-audit-groups": "第三层分区统计应得到 crypt、grave、throne 各 2 只。",
  "f3-audit-core": "没有找出死灵王的最高装备 power = 24。",
  "practice-bone": "没有连接碎骨与遗骨荒地。",
  "practice-zombie": "没有用 LEFT JOIN 找出无装备的腐尸。",
  "practice-spirit": "没有用自连接返回鬼火与墓主。",
  "practice-spirit-core": "没有按 id 与 haunting 状态返回鬼火。",
  "practice-wraith": "没有用自连接返回游魂与墓主。",
  "grave-boss-scan": "UNION 结果应依次为鬼火、游魂与墓主。",
  "grave-boss-core": "没有用自连接返回墓主与死灵王。",
  "f4-scalar-first": "标量子查询没有返回 51 号房间中 id 最小的火灵。",
  "f4-in-frost": "IN 子查询没有返回第四层 frost 房间中的冰灵。",
  "f4-exists-gear": "EXISTS 没有验证雷灵的装备记录。",
  "f4-correlated-gear": "相关子查询没有验证石巨人的最高装备 power。",
  "f4-cte-armor": "CTE 没有筛出 power >= 20 的炎王。",
  "f4-recursive-rooms": "递归房间序列应依次返回火室、冰库、雷池。",
  "f4-recursive-core": "递归关系应依次返回火灵、石巨人、元素王。",
  "practice-fire": "标量子查询没有返回火苗。",
  "practice-ice": "IN 子查询没有返回冰晶。",
  "practice-storm": "EXISTS 没有验证雷兽的装备记录。",
  "practice-storm-core": "没有按 id 与 charged 状态返回雷兽。",
  "practice-spark": "EXISTS 没有验证电球的装备记录。",
  "forge-boss-scan": "CTE 没有返回拥有高 power 装备的炉主。",
  "forge-boss-core": "EXISTS 没有验证炉主的装备记录。",
  "f5-over-count": "分区计数应保留哥布林、兽人、骑士三行，并让 guard_total 均为 3。",
  "f5-row-number-order": "区域编号顺序不正确；检查 sector 分区、power DESC 和 id 稳定排序。",
  "f5-rank-ties": "并列排名不正确；兽人与骑士应共享 rank_no = 2、dense_no = 2。",
  "f5-lag-lead-delta": "前后行 power 不正确；检查 LAG、LEAD 与 id 顺序。",
  "f5-frame-running": "累计 power 应依次为 18、38、58、80、104。",
  "f5-top-n-groups": "没有返回 arena、core、outer、wall 各自装备 power 最高的守军。",
  "f5-top-n-core": "outer 与 arena 应各保留 rn 1、2 两名守军。",
  "practice-goblin": "小妖与战兽应各显示 guard_total = 2。",
  "practice-orc": "ROW_NUMBER 应先返回战兽，再返回小妖。",
  "practice-knight": "排名结果应为铁卫第一、战兽第二。",
  "practice-troll": "累计结果应依次为 18、38、62、84。",
  "iron-boss-scan": "CTE 没有找出 hp = 24 的铁卫。",
  "iron-boss-core": "LAG 结果没有按 id 返回正确的上一行 hp。",
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
  "dragon-boss-scan": "保存点局部回滚后，修复必须保留且被删行必须恢复。",
  "dragon-boss-core": "提交后只应删除 id = 4。",
};

function stageFor(lessonId: LessonId, stageIndex: number): LessonStageDefinition {
  const lesson = lessonById(lessonId);
  return lesson.stages[Math.min(Math.max(stageIndex, 0), lesson.stages.length - 1)];
}

export function evaluateLesson(
  lessonId: LessonId,
  stageIndex: number,
  result: SqlQueryResult,
): QueryEvaluation {
  const stage = stageFor(lessonId, stageIndex);
  return evaluateStage(stage, result);
}

export function evaluateStage(
  stage: LessonStageDefinition,
  result: SqlQueryResult,
): QueryEvaluation {
  const featureSet = new Set(result.features);
  const locksBroken = stage.requiredFeatures
    .map((feature, index) => ({ feature, label: stage.locks[index] }))
    .filter(({ feature }) => featureSet.has(feature))
    .map(({ label }) => label);
  const locksRemaining = stage.locks.filter((lock) => !locksBroken.includes(lock));

  if (locksRemaining.length > 0) {
    return {
      accepted: false,
      kind: "missing-concept",
      message: `结果可能接近，但还没有使用本回合核心：${locksRemaining.join(" + ")}。`,
      locksBroken,
      locksRemaining,
      attackTargetIds: [],
    };
  }

  if (!stageMatches(stage.id, result)) {
    return {
      accepted: false,
      kind: "wrong-result",
      message: WRONG_RESULT_MESSAGE[stage.id],
      locksBroken,
      locksRemaining: [],
      attackTargetIds: [],
    };
  }

  return {
    accepted: true,
    kind: "exact",
    message: `查询正确，${stage.locks.join(" + ")} 锁全部破除。`,
    locksBroken,
    locksRemaining: [],
    attackTargetIds: [...stage.attackTargetIds],
  };
}
