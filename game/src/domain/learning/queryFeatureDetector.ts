/**
 * SQL 教学特征识别器。
 *
 * 只读取 SQL 文本并返回稳定的 QueryFeature 列表，不执行 SQL、不判断结果
 * 是否正确，也不修改 GameSession。字面量和注释会先被遮蔽，避免误报。
 */
import type { QueryFeature } from "../shared/types";

function stripLiteralsAndComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""');
}

/** 从 SQL 文本提取课程锁使用的语法特征。 */
export function detectQueryFeatures(sql: string): QueryFeature[] {
  const normalized = stripLiteralsAndComments(sql).replace(/\s+/g, " ").trim();
  const features: QueryFeature[] = [];
  const selectCount = normalized.match(/\bselect\b/gi)?.length ?? 0;
  if (selectCount > 0) features.push("select");
  if (/\bfrom\b/i.test(normalized)) features.push("from");
  if (/\bwhere\b/i.test(normalized)) features.push("where");
  if (/\band\b/i.test(normalized)) features.push("and");
  if (/\bis\s+(?:not\s+)?null\b/i.test(normalized)) features.push("is-null");
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
