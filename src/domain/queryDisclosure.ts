/**
 * SQL 结果身份披露边界。
 * 怪物未击败前只允许结构性反馈，不能通过查询或文本间接猜出隐藏身份。
 */
import type { Monster, SqlQueryResult } from "./types";
import { monsterIdLabel } from "./monsterIdentity";

function replaceAllLiteral(value: string, search: string, replacement: string): string {
  // 使用字面量替换而不是正则，避免名称中的特殊字符改变匹配含义。
  return search === "" ? value : value.split(search).join(replacement);
}

/**
 * 判题始终使用真实 SQLite 结果；这个函数只生成玩家可见副本。
 * 未击败记录的内部名字、物种，以及包含名字的装备/地点文本都不会穿过 UI 边界。
 */
export function redactUndiscoveredQueryIdentities(
  result: SqlQueryResult,
  monsters: readonly Monster[],
  discoveredMonsterIds: readonly number[],
): SqlQueryResult {
  // 只遮蔽未发现身份；已发现名称可在本地复盘和故事中正常显示。
  const discovered = new Set(discoveredMonsterIds);
  const hidden = monsters
    .filter((monster) => !discovered.has(monster.id))
    .sort((left, right) => {
      const nameLength = right.name.length - left.name.length;
      if (nameLength !== 0) return nameLength;
      const leftTargeted = result.targetIds.includes(left.id) ? 0 : 1;
      const rightTargeted = result.targetIds.includes(right.id) ? 0 : 1;
      return leftTargeted - rightTargeted || left.id - right.id;
    });

  const redactValue = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    const exactName = hidden.find((monster) => monster.name === value);
    if (exactName) return monsterIdLabel(exactName.id);
    const exactSpecies = hidden.find((monster) => monster.species === value);
    if (exactSpecies) return "未识别类型";

    return hidden.reduce((text, monster) => {
      const withoutName = replaceAllLiteral(text, monster.name, "未识别记录");
      return replaceAllLiteral(withoutName, monster.species, "未识别类型");
    }, value);
  };

  return {
    ...result,
    columns: [...result.columns],
    rows: result.rows.map((row) => Object.fromEntries(
      Object.entries(row).map(([column, value]) => [column, redactValue(value)]),
    )),
    targetIds: [...result.targetIds],
    plan: [...result.plan],
    features: [...result.features],
  };
}
