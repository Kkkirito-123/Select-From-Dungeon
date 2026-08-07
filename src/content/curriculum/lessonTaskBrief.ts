import type { FloorNumber } from "../../domain/progression/runGraph";
import type {
  LessonDefinition,
  LessonStageDefinition,
  LessonTaskBrief,
  LessonTaskFieldGuide,
  LessonTaskTier,
  Monster,
  QueryFeature,
} from "../../domain/shared/types";
import { SQL_RELATIONS, SQL_TABLES } from "../sql/sqlSchema";

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
  "set",
  "values",
]);

const FLOOR_SUCCESS_EFFECTS: Readonly<Record<FloorNumber, string>> = {
  1: "档案机关会按真实结果恢复一段通路，当前记录的防护随之失效。",
  2: "潮路会按查询结果重新连线，正确房间与灯塔航线将在地图上显形。",
  3: "墓碑与遗物的关系会被重新接起，亡者留下的证词将成为可核对记录。",
  4: "火、冰、雷的依赖会显形，升炉将按查询结果改变长期状态。",
  5: "轮值城会按结果重排处理顺序，被延迟的档案将重新进入队列。",
  6: "改动只会作用于隔离副本；验证成功后才能推进工坊机关。",
  7: "索引路径会直接投影到树根，正确计划将打开更短且可验证的道路。",
  8: "迁移高堂会记录这次判断，作为最终 MIGRATE 审计链的一部分。",
};

const LESSON_SUCCESS_EFFECTS: Readonly<Record<string, string>> = {
  select: "档案水轮会读出指定字段，第一段排水通路随结果启动。",
  where: "被条件唯一锁定的排水记录会让软泥池退水。",
  "is-null": "空值判断会照出没有主人的床牌与封存记录。",
  "group-by": "散落的回执会按频道归档，聚合档案架随之复位。",
  having: "只有达到阈值的信号组会点燃登记厅核心。",
  "order-by": "最高电荷的航标会先亮起，安全潮路因此出现。",
  distinct: "重复水纹会被折叠，只留下真实存在的航线。",
  "inner-join": "怪物记录与房间记录会沿真实键相接，根桥由此闭合。",
  "left-join": "没有匹配装备的记录会浮出水面，失踪住户留下的路标随之显形。",
  "join-boss": "灯塔会接受可核对的关系证据，逐层撤去核心护盾。",
  "f3-inner": "怪物与墓室的对应关系会铺成第一段骨桥。",
  "f3-left": "没有装备记录的空墓会显形，封死的墓道因此松动。",
  "f3-self": "同一张表中的上下级关系会刻回双名墓碑。",
  "f3-chain": "墓室、怪物与遗物会串成一条可追溯证据链。",
  "f3-union": "两条墓道的名单会合并为同一份去重巡逻册。",
  "f3-audit": "王庭只接受逐步形成的关系证据；每次正确查询都会击碎一层审计封印。",
};

const FEATURE_TOPIC: Readonly<Partial<Record<QueryFeature, string>>> = {
  select: "SELECT / FROM",
  from: "SELECT / FROM",
  where: "WHERE / AND",
  and: "WHERE / AND",
  "is-null": "IS NULL",
  count: "COUNT / GROUP BY / HAVING",
  "group-by": "COUNT / GROUP BY / HAVING",
  having: "COUNT / GROUP BY / HAVING",
  "order-by": "ORDER BY / LIMIT",
  limit: "ORDER BY / LIMIT",
  distinct: "DISTINCT",
  join: "INNER JOIN / ON",
  on: "INNER JOIN / ON",
  "left-join": "LEFT JOIN / IS NULL",
  "self-join": "SELF JOIN / 别名",
  union: "UNION",
  subquery: "子查询",
  in: "IN 子查询",
  exists: "EXISTS",
  cte: "WITH / CTE",
  recursive: "WITH RECURSIVE",
  over: "窗口函数",
  "partition-by": "OVER / PARTITION BY",
  "row-number": "ROW_NUMBER",
  rank: "RANK / DENSE_RANK",
  "dense-rank": "RANK / DENSE_RANK",
  lag: "LAG / LEAD",
  lead: "LAG / LEAD",
  "window-frame": "窗口 Frame",
  insert: "INSERT",
  update: "UPDATE / WHERE",
  delete: "DELETE / WHERE",
  constraint: "约束与冲突处理",
  transaction: "事务",
  savepoint: "SAVEPOINT",
  rollback: "ROLLBACK",
  commit: "COMMIT",
};

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    else if (value[index] === ")") depth = Math.max(0, depth - 1);
    else if (value[index] === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function isSqlWordCharacter(value: string | undefined): boolean {
  return /[a-z0-9_]/i.test(value ?? "");
}

function keywordAt(sql: string, index: number, keyword: string): boolean {
  return (
    sql.slice(index, index + keyword.length).toLocaleLowerCase() === keyword &&
    !isSqlWordCharacter(sql[index - 1]) &&
    !isSqlWordCharacter(sql[index + keyword.length])
  );
}

interface TopLevelToken {
  keyword: "select" | "from" | "where" | "group by" | "having" | "order by" | "limit" | "union" | ";";
  start: number;
  end: number;
}

function topLevelTokens(sql: string): TopLevelToken[] {
  const keywords = [
    "group by",
    "order by",
    "select",
    "having",
    "where",
    "limit",
    "union",
    "from",
  ] as const;
  const tokens: TopLevelToken[] = [];
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      if (character !== quote) continue;
      if (quote === "'" && sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    if (character === ";") {
      tokens.push({ keyword: ";", start: index, end: index + 1 });
      continue;
    }
    const keyword = keywords.find((candidate) => keywordAt(sql, index, candidate));
    if (!keyword) continue;
    tokens.push({ keyword, start: index, end: index + keyword.length });
    index += keyword.length - 1;
  }
  return tokens;
}

function aliasMapFor(sql: string): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const match of sql.matchAll(
    /\b(?:from|join|update|into)\s+([a-z_]\w*)(?:\s+(?:as\s+)?([a-z_]\w*))?/gi,
  )) {
    const table = match[1].toLocaleLowerCase();
    const candidate = match[2]?.toLocaleLowerCase();
    aliases.set(table, table);
    if (candidate && !SQL_ALIAS_STOP_WORDS.has(candidate)) aliases.set(candidate, table);
  }
  return aliases;
}

function tableReferences(
  sql: string,
  aliases: ReadonlyMap<string, string>,
  knownTables: ReadonlySet<string>,
): string[] {
  const tables: string[] = [];
  for (const match of sql.matchAll(/\b(?:from|join|update|into)\s+([a-z_]\w*)/gi)) {
    const table = aliases.get(match[1].toLocaleLowerCase()) ?? match[1].toLocaleLowerCase();
    if (knownTables.has(table) && !tables.includes(table)) tables.push(table);
  }
  return tables;
}

function primaryTableFor(
  sql: string,
  aliases: ReadonlyMap<string, string>,
  knownTables: ReadonlySet<string>,
  fallback: string | null,
): string | null {
  const outerFrom = topLevelTokens(sql).find((token) => token.keyword === "from");
  const outerTable = outerFrom
    ? sql.slice(outerFrom.end).match(/^\s*([a-z_]\w*)/i)?.[1].toLocaleLowerCase()
    : null;
  const resolvedOuterTable = outerTable ? aliases.get(outerTable) ?? outerTable : null;
  return resolvedOuterTable && knownTables.has(resolvedOuterTable)
    ? resolvedOuterTable
    : fallback;
}

function selectOutputs(sql: string): string[] {
  const tokens = topLevelTokens(sql);
  const select = tokens.find((token) => token.keyword === "select");
  const from = select
    ? tokens.find((token) => token.keyword === "from" && token.start > select.end)
    : undefined;
  const projection = select && from ? sql.slice(select.end, from.start).trim() : null;
  if (projection) return splitTopLevel(projection).map((entry) => entry.replace(/^distinct\s+/i, "DISTINCT "));
  if (/\binsert\s+(?:or\s+\w+\s+)?into\b/i.test(sql)) return ["写入记录"];
  if (/\bupdate\b/i.test(sql)) return ["更新后的目标记录"];
  if (/\bdelete\s+from\b/i.test(sql)) return ["删除后的剩余记录"];
  return ["查询结果"];
}

function clauseValues(sql: string): string[] {
  const clauses: string[] = [];
  const tokens = topLevelTokens(sql);
  const labels = new Map<TopLevelToken["keyword"], string>([
    ["where", "WHERE"],
    ["group by", "GROUP BY"],
    ["having", "HAVING"],
    ["order by", "ORDER BY"],
    ["limit", "LIMIT"],
  ]);
  tokens.forEach((token, index) => {
    const label = labels.get(token.keyword);
    if (!label) return;
    const next = tokens.slice(index + 1).find((candidate) => (
      candidate.keyword !== "select" && candidate.keyword !== "from"
    ));
    const value = sql.slice(token.end, next?.start ?? sql.length).trim();
    if (value) clauses.push(`${label} ${value}`);
  });
  if (clauses.length === 0 && /\bvalues\s*\(/i.test(sql)) clauses.push("按 VALUES 写入指定字段");
  if (clauses.length === 0 && /\bset\b/i.test(sql)) clauses.push("按 SET 修改指定字段");
  return clauses;
}

const SPECIAL_COLUMN_MEANINGS: Readonly<Record<string, string>> = {
  id: "当前表的记录主键",
  item: "物品代号",
  quantity: "物品数量",
  status: "记录当前状态",
  realm: "索引记录所属区域",
  category: "索引记录类别",
  score: "用于排序与筛选的评分",
  code: "索引记录代号",
  payload: "记录承载的数据",
  row_id: "业务记录编号",
  version_id: "同一业务记录的版本编号",
  value: "该版本保存的值",
  created_tx: "创建该版本的事务编号",
  expired_tx: "使该版本失效的事务编号；仍有效时为空",
  waiter_tx: "正在等待锁的事务",
  blocker_tx: "持锁并阻塞其他事务的事务",
  resource: "发生锁等待的资源",
  phenomenon: "隔离级别异常类型",
  first_count: "第一次读取到的行数",
  second_count: "第二次读取到的行数",
  prevented_by: "能够阻止该异常的隔离级别",
  model: "候选数据建模方案",
  has_primary_key: "方案是否包含主键",
  has_unique_email: "方案是否保证邮箱唯一",
  duplicate_groups: "方案仍会产生的重复分组数",
  node: "复制节点名称",
  role: "节点在复制拓扑中的角色",
  lag_ms: "复制延迟，单位毫秒",
  healthy: "节点是否健康：1 是，0 否",
  shard_id: "数据所在分片编号",
  route_ok: "路由是否正确：1 是，0 否",
  method: "安全访问方法",
  parameterized: "是否使用参数化查询",
  least_privilege: "是否遵守最小权限",
  allowed: "该方法是否允许执行",
};

function schemaColumns(schema: readonly string[]): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  SQL_TABLES.forEach((table) => {
    tables.set(table.name, new Set(table.columns.map((column) => column.name)));
  });
  schema.forEach((line) => {
    const match = line.match(/^\s*([a-z_]\w*)\s*\(([^)]+)\)/i);
    if (!match) return;
    const columns = tables.get(match[1].toLocaleLowerCase()) ?? new Set<string>();
    match[2].split(",").forEach((rawColumn) => {
      const column = rawColumn.trim().match(/^[a-z_]\w*/i)?.[0].toLocaleLowerCase();
      if (column) columns.add(column);
    });
    tables.set(match[1].toLocaleLowerCase(), columns);
  });
  return tables;
}

function relationValues(sql: string, aliases: ReadonlyMap<string, string>): string[] {
  return [...sql.matchAll(
    /\bon\s+([\s\S]*?)(?=\b(?:inner|left|right|full|cross)?\s*join\b|\bwhere\b|\bgroup\s+by\b|\bhaving\b|\border\s+by\b|\blimit\b|$)/gi,
  )].map((match) => {
    const expression = match[1].trim();
    const equality = expression.match(/([a-z_]\w*)\.([a-z_]\w*)\s*=\s*([a-z_]\w*)\.([a-z_]\w*)/i);
    if (!equality) return expression;
    const [, leftAlias, leftColumn, rightAlias, rightColumn] = equality;
    const leftTable = aliases.get(leftAlias.toLocaleLowerCase());
    const rightTable = aliases.get(rightAlias.toLocaleLowerCase());
    const relation = SQL_RELATIONS.find((entry) => (
      (entry.fromTable === leftTable && entry.fromColumn === leftColumn.toLocaleLowerCase() &&
        entry.toTable === rightTable && entry.toColumn === rightColumn.toLocaleLowerCase()) ||
      (entry.fromTable === rightTable && entry.fromColumn === rightColumn.toLocaleLowerCase() &&
        entry.toTable === leftTable && entry.toColumn === leftColumn.toLocaleLowerCase())
    ));
    return relation ? `${expression}（${relation.description}）` : expression;
  });
}

function fieldGuideFor(
  sql: string,
  outputs: readonly string[],
  aliases: ReadonlyMap<string, string>,
  primaryTable: string | null,
  knownColumns: ReadonlyMap<string, ReadonlySet<string>>,
): LessonTaskFieldGuide[] {
  const expressions = new Set<string>();
  outputs.forEach((output) => {
    for (const match of output.matchAll(/\b([a-z_]\w*)\.([a-z_]\w*)\b/gi)) {
      expressions.add(`${match[1]}.${match[2]}`);
    }
    const direct = output.match(/^(?:DISTINCT\s+)?([a-z_]\w*)(?:\s+(?:AS\s+)?[a-z_]\w*)?$/i)?.[1];
    if (direct && primaryTable) expressions.add(`${primaryTable}.${direct}`);
  });
  for (const match of sql.matchAll(/\b([a-z_]\w*)\.([a-z_]\w*)\b/gi)) {
    expressions.add(`${match[1]}.${match[2]}`);
  }
  if (primaryTable) {
    const primaryColumns = knownColumns.get(primaryTable);
    for (const match of sql.matchAll(/\b([a-z_]\w*)\b/gi)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (sql[start - 1] === "." || sql[end] === ".") continue;
      const column = match[1].toLocaleLowerCase();
      if (primaryColumns?.has(column)) expressions.add(`${primaryTable}.${column}`);
    }
  }
  const guides: LessonTaskFieldGuide[] = [];
  expressions.forEach((expression) => {
    if (guides.length >= 7) return;
    const [qualifier, columnName] = expression.split(".");
    const tableName = aliases.get(qualifier.toLocaleLowerCase()) ?? qualifier.toLocaleLowerCase();
    const table = SQL_TABLES.find((entry) => entry.name === tableName);
    const column = table?.columns.find((entry) => entry.name === columnName.toLocaleLowerCase());
    const normalizedColumn = columnName.toLocaleLowerCase();
    if (!column && !knownColumns.get(tableName)?.has(normalizedColumn)) return;
    guides.push({
      expression,
      meaning: `${tableName}.${normalizedColumn}：${
        column?.description ?? SPECIAL_COLUMN_MEANINGS[normalizedColumn] ?? "本题数据字段"
      }`,
    });
  });
  if (/\bcount\s*\(\s*\*\s*\)\s+(?:as\s+)?total\b/i.test(sql)) {
    guides.push({ expression: "total", meaning: "COUNT(*) 的结果别名：当前分组中的记录数" });
  }
  return guides;
}

export function topicGroupsForStage(stage: LessonStageDefinition): string[] {
  const topics: string[] = [];
  const features = new Set(stage.requiredFeatures);
  const add = (topic: string | undefined): void => {
    if (topic && !topics.includes(topic)) topics.push(topic);
  };
  const hasAdvancedFeature = [...features].some((feature) => (
    !["select", "from", "where", "and"].includes(feature)
  ));
  if (hasAdvancedFeature) {
    features.delete("select");
    features.delete("from");
    features.delete("where");
    features.delete("and");
  }
  if (features.has("left-join")) {
    add("LEFT JOIN / IS NULL");
    features.delete("left-join");
    features.delete("on");
    features.delete("is-null");
  } else if (features.has("self-join")) {
    add("SELF JOIN / 别名");
    features.delete("self-join");
    features.delete("join");
    features.delete("on");
  }
  if (features.has("exists")) {
    add("EXISTS");
    features.delete("exists");
    features.delete("subquery");
  } else if (features.has("in")) {
    add("IN 子查询");
    features.delete("in");
    features.delete("subquery");
  }
  if (features.has("recursive")) {
    add("WITH RECURSIVE");
    features.delete("recursive");
    features.delete("cte");
  }
  if (features.has("savepoint")) {
    add("SAVEPOINT / ROLLBACK TO");
    features.delete("savepoint");
    features.delete("rollback");
    features.delete("commit");
    features.delete("transaction");
    features.delete("insert");
    features.delete("update");
    features.delete("delete");
  } else if (features.has("transaction")) {
    add("事务 / ROLLBACK");
    features.delete("transaction");
    features.delete("rollback");
    features.delete("commit");
    features.delete("insert");
    features.delete("update");
    features.delete("delete");
  }
  if (features.has("constraint")) {
    add("约束与冲突处理");
    features.delete("constraint");
    features.delete("insert");
    features.delete("update");
    features.delete("delete");
  }
  const windowFeature = [
    "row-number",
    "rank",
    "dense-rank",
    "lag",
    "lead",
    "window-frame",
    "partition-by",
    "over",
  ].find((feature) => features.has(feature as QueryFeature)) as QueryFeature | undefined;
  if (windowFeature) {
    add(FEATURE_TOPIC[windowFeature]);
    [
      "row-number",
      "rank",
      "dense-rank",
      "lag",
      "lead",
      "window-frame",
      "partition-by",
      "over",
    ].forEach((feature) => features.delete(feature as QueryFeature));
    features.delete("order-by");
    features.delete("limit");
  }
  stage.requiredFeatures.forEach((feature) => {
    if (features.has(feature)) add(FEATURE_TOPIC[feature]);
  });
  return topics;
}

function taskTier(monster: Monster, stageIndex: number): LessonTaskTier {
  if (monster.rank === "boss") return "boss";
  if (monster.rank === "elite") return stageIndex === 0 ? "reinforcement" : "composite";
  return stageIndex === 0 ? "foundation" : "reinforcement";
}

function tierLabel(tier: LessonTaskTier): string {
  if (tier === "foundation") return "基础 · 单知识点";
  if (tier === "reinforcement") return "熟练 · 同章复习";
  if (tier === "composite") return "精英 · 复合应用";
  return "首领 · 阶段审计";
}

function progressiveHints(
  stage: LessonStageDefinition,
  outputs: readonly string[],
  relations: readonly string[],
  constraints: readonly string[],
  focusTopics: readonly string[],
): string[] {
  const outputHint = outputs.join("、");
  const structure = [
    focusTopics.length > 0 ? `核心语法是 ${focusTopics.join(" + ")}` : "先确定本题的读写动作",
    relations.length > 0 ? `连接使用 ${relations.join("；")}` : "本题不需要额外连接表",
  ].join("；");
  const assembly = [
    `返回 ${outputHint}`,
    ...constraints,
  ].join("；");
  return [
    `提示 1 · 先确认要返回：${outputHint}。`,
    `提示 2 · ${structure}。`,
    `提示 3 · ${assembly}。`,
    `提示 4 · 完整写法：${stage.answerSql}`,
  ];
}

export function lessonTaskBriefFor(input: {
  floor: FloorNumber;
  lesson: LessonDefinition;
  stage: LessonStageDefinition;
  monster: Monster;
  stageIndex: number;
}): LessonTaskBrief {
  const sql = normalizeSql(input.stage.answerSql);
  const aliases = aliasMapFor(sql);
  const knownColumns = schemaColumns(input.lesson.schema);
  const knownTables = new Set(knownColumns.keys());
  const tables = tableReferences(sql, aliases, knownTables);
  const outputs = selectOutputs(sql);
  const relations = relationValues(sql, aliases);
  const constraints = clauseValues(sql);
  const primaryTable = primaryTableFor(sql, aliases, knownTables, tables[0] ?? null);
  const topics = topicGroupsForStage(input.stage);
  const focusTopics = topics.length > 0 ? topics : [input.lesson.concept];
  const isAuthoredStage = input.lesson.stages.some((stage) => stage.id === input.stage.id);
  const reviewTopics = isAuthoredStage ? [] : [...focusTopics];
  const tier = taskTier(input.monster, input.stageIndex);
  return {
    tier,
    tierLabel: tierLabel(tier),
    situation: input.lesson.intro,
    queryGoal: input.stage.objective,
    outputColumns: outputs,
    fieldGuide: fieldGuideFor(sql, outputs, aliases, primaryTable, knownColumns),
    relations,
    constraints,
    successEffect: LESSON_SUCCESS_EFFECTS[input.lesson.id] ?? FLOOR_SUCCESS_EFFECTS[input.floor],
    primaryTable,
    relatedTables: tables.filter((table) => table !== primaryTable),
    focusTopics,
    reviewTopics,
    hints: progressiveHints(input.stage, outputs, relations, constraints, focusTopics),
  };
}
