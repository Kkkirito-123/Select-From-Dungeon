/**
 * 未解锁身份字段的 SQL 规则。
 *
 * 本模块负责识别怪物、房间和装备的封存身份字段，并把命中结果转换成
 * 稳定的课程失败结果。它不执行 SQL、不读取存档，也不改变 GameSession。
 */
import type { LessonStageDefinition, QueryEvaluation } from "../shared/types";
import {
  identityQueryEvaluation,
  identityQueryMessage,
} from "./queryIdentityEvaluator";

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

const SQL_ALIAS_STOP_WORDS = new Set([
  "where",
  "inner",
  "left",
  "right",
  "full",
  "cross",
  "join",
  "on",
  "group",
  "having",
  "order",
  "limit",
  "union",
]);

const UNREVEALED_IDENTITY_MESSAGE =
  "身份字段仍被封存。本回合只允许使用题目要求的非身份字段。";

type IdentityColumn = "name" | "species";
type SealedLabelColumn = "name" | "gear_name";

interface SealedLabelRule {
  table: "rooms" | "monster_gear";
  column: SealedLabelColumn;
}

const SEALED_LABEL_RULES: readonly SealedLabelRule[] = [
  { table: "rooms", column: "name" },
  { table: "monster_gear", column: "gear_name" },
] as const;

function normalizeIdentitySql(sql: string): string {
  return stripComments(sql)
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"((?:""|[^"])*)"/g, (_, identifier: string) => (
      identifier.replace(/""/g, '"')
    ))
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]/g, "$1");
}

function monsterAliasesForSql(sql: string): Set<string> | null {
  if (!/\b(?:from|join)\s+(?:(?:[a-z_]\w*)\s*\.\s*)?monsters\b/i.test(sql)) {
    return null;
  }
  const aliases = new Set(["monsters"]);
  for (const match of sql.matchAll(
    /\b(?:from|join)\s+(?:(?:[a-z_]\w*)\s*\.\s*)?monsters\b(?:\s+(?:as\s+)?([a-z_]\w*))?/gi,
  )) {
    const alias = match[1]?.toLowerCase();
    if (alias && !SQL_ALIAS_STOP_WORDS.has(alias)) aliases.add(alias);
  }
  return aliases;
}

function tableAliasesForSql(sql: string, table: string): Set<string> | null {
  const tablePattern = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reference = new RegExp(
    `\\b(?:from|join)\\s+(?:(?:[a-z_]\\w*)\\s*\\.\\s*)?${tablePattern}\\b`,
    "i",
  );
  if (!reference.test(sql)) return null;
  const aliases = new Set([table.toLowerCase()]);
  const declarations = new RegExp(
    `\\b(?:from|join)\\s+(?:(?:[a-z_]\\w*)\\s*\\.\\s*)?${tablePattern}\\b(?:\\s+(?:as\\s+)?([a-z_]\\w*))?`,
    "gi",
  );
  for (const match of sql.matchAll(declarations)) {
    const alias = match[1]?.toLowerCase();
    if (alias && !SQL_ALIAS_STOP_WORDS.has(alias)) aliases.add(alias);
  }
  return aliases;
}

function topLevelProjectionRanges(sql: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let selectStart: number | null = null;
  const isWord = (value: string | undefined): boolean => /[a-z0-9_]/i.test(value ?? "");
  const keywordAt = (index: number, keyword: string): boolean => (
    sql.slice(index, index + keyword.length).toLowerCase() === keyword &&
    !isWord(sql[index - 1]) &&
    !isWord(sql[index + keyword.length])
  );

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    if (keywordAt(index, "select")) {
      selectStart = index + "select".length;
      index += "select".length - 1;
      continue;
    }
    if (selectStart !== null && keywordAt(index, "from")) {
      ranges.push({ start: selectStart, end: index });
      selectStart = null;
      index += "from".length - 1;
    }
  }
  return ranges;
}

function projectionRangesAtAnyDepth(sql: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const selectStartByDepth = new Map<number, number>();
  let depth = 0;
  const isWord = (value: string | undefined): boolean => /[a-z0-9_]/i.test(value ?? "");
  const keywordAt = (index: number, keyword: string): boolean => (
    sql.slice(index, index + keyword.length).toLowerCase() === keyword &&
    !isWord(sql[index - 1]) &&
    !isWord(sql[index + keyword.length])
  );

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      selectStartByDepth.delete(depth);
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (keywordAt(index, "select")) {
      selectStartByDepth.set(depth, index + "select".length);
      index += "select".length - 1;
      continue;
    }
    const selectStart = selectStartByDepth.get(depth);
    if (selectStart !== undefined && keywordAt(index, "from")) {
      ranges.push({ start: selectStart, end: index });
      selectStartByDepth.delete(depth);
      index += "from".length - 1;
    }
  }
  return ranges;
}

function hasSealedSourceWildcardProjection(sql: string): boolean {
  const normalized = normalizeIdentitySql(sql);
  const aliases = [
    monsterAliasesForSql(normalized),
    tableAliasesForSql(normalized, "rooms"),
    tableAliasesForSql(normalized, "monster_gear"),
  ].filter((entry): entry is Set<string> => entry !== null);
  if (aliases.length === 0) return false;
  const sealedAliases = new Set(aliases.flatMap((entry) => [...entry]));

  return projectionRangesAtAnyDepth(normalized).some((range) => (
    splitProjection(normalized.slice(range.start, range.end)).some((expression) => {
      const wildcard = expression.trim().match(
        /^(?:distinct\s+)?(?:([a-z_]\w*)\s*\.\s*)?\*$/i,
      );
      if (!wildcard) return false;
      const qualifier = wildcard[1]?.toLowerCase();
      return qualifier === undefined || sealedAliases.has(qualifier);
    })
  ));
}

function sealedLabelColumnsInFragment(
  fragment: string,
  aliases: ReadonlySet<string>,
  column: SealedLabelColumn,
): boolean {
  const qualifiedPattern = new RegExp(
    `\\b([a-z_]\\w*)\\s*\\.\\s*\\b${column}\\b`,
    "gi",
  );
  let qualified = false;
  const unqualified = fragment.replace(
    qualifiedPattern,
    (_reference, qualifier: string) => {
      if (aliases.has(qualifier.toLowerCase())) qualified = true;
      return " ";
    },
  ).replace(new RegExp(`\\bas\\s+${column}\\b`, "gi"), " ");
  return qualified || new RegExp(`\\b${column}\\b`, "i").test(unqualified);
}

function isDirectSealedLabelProjection(
  expression: string,
  aliases: ReadonlySet<string>,
  column: SealedLabelColumn,
): boolean {
  const match = expression.trim().match(
    new RegExp(
      `^(?:distinct\\s+)?(?:([a-z_]\\w*)\\s*\\.\\s*)?${column}(?:\\s+(?:as\\s+)?[a-z_]\\w*)?$`,
      "i",
    ),
  );
  if (!match) return false;
  const qualifier = match[1]?.toLowerCase();
  return !qualifier || aliases.has(qualifier);
}

function hasSealedLabelPredicateUse(sql: string): boolean {
  const normalized = normalizeIdentitySql(sql);
  const projectionRanges = topLevelProjectionRanges(normalized);

  for (const rule of SEALED_LABEL_RULES) {
    const aliases = tableAliasesForSql(normalized, rule.table);
    if (!aliases) continue;
    for (const range of projectionRanges) {
      const projection = normalized.slice(range.start, range.end);
      for (const expression of splitProjection(projection)) {
        if (!sealedLabelColumnsInFragment(expression, aliases, rule.column)) continue;
        if (!isDirectSealedLabelProjection(expression, aliases, rule.column)) {
          return true;
        }
      }
    }

    const withoutTopLevelProjections = projectionRanges.reduceRight(
      (value, range) => (
        `${value.slice(0, range.start)}${" ".repeat(range.end - range.start)}${value.slice(range.end)}`
      ),
      normalized,
    );
    if (sealedLabelColumnsInFragment(
      withoutTopLevelProjections,
      aliases,
      rule.column,
    )) return true;
  }
  return false;
}

function identityColumnsInFragment(
  fragment: string,
  monsterAliases: ReadonlySet<string>,
): Set<IdentityColumn> {
  const columns = new Set<IdentityColumn>();
  const unqualified = fragment.replace(
    /\b([a-z_]\w*)\s*\.\s*\b(name|species)\b/gi,
    (_reference, qualifier: string, column: string) => {
      if (monsterAliases.has(qualifier.toLowerCase())) {
        columns.add(column.toLowerCase() as IdentityColumn);
      }
      return " ";
    },
  ).replace(/\bas\s+(?:name|species)\b/gi, " ");

  for (const match of unqualified.matchAll(/\b(name|species)\b/gi)) {
    columns.add(match[1].toLowerCase() as IdentityColumn);
  }
  return columns;
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

function directMonsterIdentityProjection(
  expression: string,
  monsterAliases: ReadonlySet<string>,
): IdentityColumn | null {
  const match = expression.trim().match(
    /^(?:distinct\s+)?(?:([a-z_]\w*)\s*\.\s*)?(name|species)(?:\s+(?:as\s+)?[a-z_]\w*)?$/i,
  );
  if (!match) return null;
  const qualifier = match[1]?.toLowerCase();
  if (qualifier && !monsterAliases.has(qualifier)) return null;
  return match[2].toLowerCase() as IdentityColumn;
}

function hasSealedIdentityUse(
  sql: string,
  allowedProjectionColumns: ReadonlySet<IdentityColumn>,
): boolean {
  const normalized = normalizeIdentitySql(sql);
  const aliases = monsterAliasesForSql(normalized);
  if (!aliases) return false;
  const projectionMatch = normalized.match(/^\s*select\s+([\s\S]*?)\s+from\b/i);
  if (!projectionMatch || projectionMatch.index === undefined) {
    return identityColumnsInFragment(normalized, aliases).size > 0;
  }

  const projection = projectionMatch[1];
  for (const expression of splitProjection(projection)) {
    const used = identityColumnsInFragment(expression, aliases);
    if (used.size === 0) continue;
    const direct = directMonsterIdentityProjection(expression, aliases);
    if (!direct || used.size !== 1 || !allowedProjectionColumns.has(direct)) {
      return true;
    }
  }

  const projectionStart = projectionMatch.index + projectionMatch[0].indexOf(projection);
  const remainder = `${normalized.slice(0, projectionStart)} ${normalized.slice(
    projectionStart + projection.length,
  )}`;
  return identityColumnsInFragment(remainder, aliases).size > 0;
}

export function evaluateUnrevealedIdentityQuery(
  floor: number,
  stage: LessonStageDefinition,
  sql: string,
  identityRevealed: boolean,
): QueryEvaluation | null {
  const message = unrevealedIdentityQueryMessage(
    floor,
    stage.answerSql,
    sql,
    identityRevealed,
  );
  return identityQueryEvaluation(stage, message);
}

export function unrevealedIdentityQueryMessage(
  floor: number,
  _answerSql: string,
  sql: string,
  identityRevealed: boolean,
): string | null {
  const detected = (
    hasSealedIdentityUse(sql, new Set()) ||
    hasSealedLabelPredicateUse(sql) ||
    hasSealedSourceWildcardProjection(sql)
  );
  return identityQueryMessage(
    floor,
    identityRevealed,
    detected,
    UNREVEALED_IDENTITY_MESSAGE,
  );
}
