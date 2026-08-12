/**
 * 课程锁边界。
 *
 * 本模块只负责选择当前课程阶段，以及判断新手课程允许的 SQL 外形。
 * 它不执行 SQL、不读取存档，也不决定查询结果是否正确；结果语义由
 * `lessonResultEvaluator` 处理，课程内容仍由 content 层维护。
 */
import { lessonById } from "../../content/curriculum/mvpLevel";
import type {
  LessonId,
  LessonStageDefinition,
} from "../shared/types";

function stripLiteralsAndComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""');
}

/**
 * 第一层基础课程只允许一条扁平 SELECT。
 *
 * 这里仅检查结构边界，不能替代只读策略或题目结果判定。字符串和注释
 * 会先被擦除，避免把它们里的关键字误识别成子查询或集合操作。
 */
export function isFlatBeginnerSelect(sql: string): boolean {
  const keywordSql = stripLiteralsAndComments(sql).replace(/\s+/g, " ").trim();
  const selectCount = keywordSql.match(/\bselect\b/gi)?.length ?? 0;
  return (
    selectCount === 1 &&
    !/\b(?:union|intersect|except|or)\b/i.test(keywordSql)
  );
}

/**
 * 按题目阶段索引读取当前课程阶段。
 * 越界索引会被限制到首尾，保持旧存档和战斗恢复时的兼容行为。
 */
export function stageFor(
  lessonId: LessonId,
  stageIndex: number,
): LessonStageDefinition {
  const lesson = lessonById(lessonId);
  return lesson.stages[Math.min(Math.max(stageIndex, 0), lesson.stages.length - 1)];
}
