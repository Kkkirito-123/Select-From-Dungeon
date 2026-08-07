/**
 * SQLite 结果的基础转换工具。
 *
 * 这里只负责把 SQLite 原始行转换成游戏内部行对象，并从执行计划估算
 * 教学热量；不执行 SQL、不同步怪物 HP，也不判断课程答案是否正确。
 */

/** 将 SQLite EXPLAIN QUERY PLAN 文本转换为教学热量。 */
export function estimateQueryHeat(plan: readonly string[]): number {
  if (plan.length === 0) return 4;
  return Math.max(
    2,
    plan.reduce((total, detail) => {
      const upper = detail.toUpperCase();
      if (upper.includes("USE TEMP B-TREE")) return total + 6;
      if (upper.includes("SCAN")) return total + 10;
      if (upper.includes("SEARCH")) return total + 3;
      return total + 2;
    }, 0),
  );
}

/** 截断并命名 SQLite 返回行，避免 UI 直接依赖 sql.js 行数组。 */
export function mapSqlRows(
  columns: readonly string[],
  values: Array<Array<number | string | Uint8Array | null>>,
  maximumRows: number,
): Array<Record<string, unknown>> {
  return values.slice(0, maximumRows).map((valueRow) =>
    Object.fromEntries(columns.map((column, index) => [column, valueRow[index]])),
  );
}
