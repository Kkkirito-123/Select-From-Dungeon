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
  if (/^select\b/i.test(normalized)) features.push("select");
  if (/\bfrom\b/i.test(normalized)) features.push("from");
  if (/\bwhere\b/i.test(normalized)) features.push("where");
  if (/\band\b/i.test(normalized)) features.push("and");
  if (/\bis\s+null\b/i.test(normalized)) features.push("is-null");
  if (/\bcount\s*\(/i.test(normalized)) features.push("count");
  if (/\bgroup\s+by\b/i.test(normalized)) features.push("group-by");
  if (/\bhaving\b/i.test(normalized)) features.push("having");
  if (/\border\s+by\b/i.test(normalized)) features.push("order-by");
  if (/\blimit\s+\d+\b/i.test(normalized)) features.push("limit");
  if (/^select\s+distinct\b/i.test(normalized)) features.push("distinct");
  if (/\bleft\s+(?:outer\s+)?join\b/i.test(normalized)) {
    features.push("left-join");
  } else if (/\b(?:inner\s+)?join\b/i.test(normalized)) {
    features.push("join");
  }
  if (/\bon\b/i.test(normalized)) features.push("on");
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
  if (!isFlatBeginnerSelect(result.sql)) return false;
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
        hasSingleValue(result, "name", "投影史莱姆 · 青页")
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
        columnEqualsString(whereClause, "name", "条件猎犬 · 逐行") &&
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
        hasSingleValue(result, "name", "NULL 幽灵 · 无主者")
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
        hasSingleValue(result, "name", "投影史莱姆 · 余像")
      );
    case "practice-where":
      return (
        projectsOnlyColumn(normalizedSql, "id") &&
        columnEqualsNumber(whereClause, "room_id", 12) &&
        columnEqualsString(whereClause, "status", "lurking") &&
        !filtersByDirectId(whereClause) &&
        hasExactColumns(result.columns, ["id"]) &&
        sameIds(result.targetIds, [211])
      );
    case "practice-null":
      return (
        projectsOnlyColumn(normalizedSql, "name") &&
        columnIsNull(whereClause, "master_id") &&
        columnEqualsString(whereClause, "status", "faded") &&
        !filtersByDirectId(whereClause) &&
        hasSingleValue(result, "name", "NULL 幽灵 · 残响")
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
          ["连接蛛后 · 双表桥", "双表桥"],
        ])
      );
    case "inner-join-sector":
      return (
        joinsTables(normalizedSql, "monsters", "rooms", "room_id", "id") &&
        columnEqualsNumber(whereClause, "id", 1400) &&
        hasExactOrderedRows(result, ["name", "sector"], [
          ["连接蛛后 · 双表桥", "bridge"],
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
          ["JOIN 指挥家 · 雷鸣主核", 21],
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
          ["连接幼蛛 · 外键丝", "伏击桥"],
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
  }
}

const WRONG_RESULT_MESSAGE: Record<LessonStageId, string> = {
  "select-name": "结果没有精确读出青页的 name。检查列名、来源表和 id = 101。",
  "select-weakness": "结果没有精确读出青页的 weakness。检查完整 SELECT。",
  "where-target": "结果不是唯一的条件猎犬。检查 room_id、status 和多余行。",
  "where-weakness": "没有按怪物名字与状态读出 weakness。不要只用 id 绕过过滤训练。",
  "null-target": "没有锁定无主幽灵。NULL 不能使用等号比较。",
  "null-name": "没有按空主人和诅咒状态读出幽灵名字。",
  "group-signals": "分组结果应为 echo = 3、noise = 1；检查执行官 ID、COUNT(*) 与 channel。",
  "having-shield": "护盾阶段应保留 echo = 3 与 ward = 2；HAVING 要过滤聚合后的组。",
  "having-core": "核心阶段只应保留 echo = 3；把 HAVING 阈值提高到 3。",
  "practice-select": "结果没有精确读出余像的 name。检查列名、表名与 id = 111。",
  "practice-where": "结果没有锁定伏行猎犬。需要同时过滤 room_id 与 status。",
  "practice-null": "结果没有读出残响幽灵。检查 IS NULL 与 faded 状态。",
  "practice-group": "双频哨兵应得到 echo = 2、noise = 2；检查 COUNT(*) 与 GROUP BY。",
  "order-peak": "没有取出 charge 最高的 surge；检查 DESC 与 LIMIT 1。",
  "order-top-two": "前两行应依次是 surge = 13、arc = 11；检查排序方向与 LIMIT 2。",
  "distinct-status": "去重结果应只有 echo、mirror；检查 DISTINCT 与排序。",
  "inner-join-room": "没有把蛛后与“双表桥”正确连接；检查 room_id = rooms.id 与别名。",
  "inner-join-sector": "连接结果应显示蛛后位于 bridge sector。",
  "left-join-unarmed": "没有找到右表缺失的 #1500；检查 LEFT JOIN 与 g.monster_id IS NULL。",
  "join-boss-groups": "综合结果应依次为 ambush = 4、storm = 2；检查 JOIN、分组、HAVING 与排序。",
  "join-boss-core": "没有定位魔王 power = 21 的最强装备；检查 JOIN、DESC 与 LIMIT 1。",
  "practice-order": "没有取出侧峰的最高 surge 信号；检查 DESC 与 LIMIT。",
  "practice-distinct": "伏击镜像应去重为 echo、mirror。",
  "practice-inner-join": "没有把连接幼蛛与伏击桥正确连接。",
  "practice-left-join": "没有找出 room_id = 34 且无装备记录的 #1510。",
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
