export type SqlTableName =
  | "monsters"
  | "monster_signals"
  | "rooms"
  | "monster_gear";

export type SqlColumnType = "INTEGER" | "TEXT";

export interface SqlColumnDefinition {
  name: string;
  type: SqlColumnType;
  nullable: boolean;
  primaryKey?: boolean;
  description: string;
}

export interface SqlTableDefinition {
  name: SqlTableName;
  title: string;
  description: string;
  columns: readonly SqlColumnDefinition[];
}

export interface SqlRelationDefinition {
  fromTable: SqlTableName;
  fromColumn: string;
  toTable: SqlTableName;
  toColumn: string;
  description: string;
}

export const SQL_TABLES: readonly SqlTableDefinition[] = [
  {
    name: "monsters",
    title: "怪物主表",
    description: "查怪物名字、血量或状态时使用。怪物主键统一写 monsters.id，MVP 2.0 从 1 连续编号。",
    columns: [
      column("id", "INTEGER", "怪物主键；从 1 连续编号", { primaryKey: true }),
      column("room_id", "INTEGER", "怪物所在房间编号"),
      column("name", "TEXT", "游戏画面显示的怪物名称"),
      column("species", "TEXT", "怪物种族代号"),
      column("hp", "INTEGER", "怪物当前生命值"),
      column("armor", "INTEGER", "怪物护甲值"),
      column("status", "TEXT", "怪物当前状态"),
      column("weakness", "TEXT", "怪物弱点；部分记录未知", { nullable: true }),
      column("master_id", "INTEGER", "主人怪物编号；关联 monsters.id，无主时为空", { nullable: true }),
      column("is_boss", "INTEGER", "是否为魔王：1 是，0 否"),
    ],
  },
  {
    name: "monster_signals",
    title: "信号明细表",
    description: "一只怪物可有多条信号；monster_id 只在这张关联表中表示所属怪物。",
    columns: [
      column("id", "INTEGER", "信号唯一编号", { primaryKey: true }),
      column("monster_id", "INTEGER", "所属怪物编号；关联 monsters.id，不是 monsters 表字段"),
      column("channel", "TEXT", "信号频道名称"),
      column("charge", "INTEGER", "信号电荷强度"),
    ],
  },
  {
    name: "rooms",
    title: "房间主表",
    description: "八层魔王城的房间、区域与楼层信息。",
    columns: [
      column("id", "INTEGER", "房间唯一编号", { primaryKey: true }),
      column("name", "TEXT", "游戏画面显示的房间名称"),
      column("sector", "TEXT", "房间所属区域代号"),
      column("floor", "INTEGER", "所在楼层：1 至 8"),
    ],
  },
  {
    name: "monster_gear",
    title: "装备明细表",
    description: "一只怪物可有装备记录；monster_id 只在这张关联表中表示持有者。",
    columns: [
      column("id", "INTEGER", "装备记录唯一编号", { primaryKey: true }),
      column("monster_id", "INTEGER", "持有者编号；关联 monsters.id，不是 monsters 表字段"),
      column("gear_name", "TEXT", "装备名称"),
      column("power", "INTEGER", "装备力量数值"),
    ],
  },
];

export const SQL_RELATIONS: readonly SqlRelationDefinition[] = [
  {
    fromTable: "monsters",
    fromColumn: "room_id",
    toTable: "rooms",
    toColumn: "id",
    description: "怪物所在房间",
  },
  {
    fromTable: "monster_signals",
    fromColumn: "monster_id",
    toTable: "monsters",
    toColumn: "id",
    description: "信号所属怪物",
  },
  {
    fromTable: "monster_gear",
    fromColumn: "monster_id",
    toTable: "monsters",
    toColumn: "id",
    description: "装备所属怪物",
  },
  {
    fromTable: "monsters",
    fromColumn: "master_id",
    toTable: "monsters",
    toColumn: "id",
    description: "怪物的主人；允许为空",
  },
];

function column(
  name: string,
  type: SqlColumnType,
  description: string,
  options: { nullable?: boolean; primaryKey?: boolean } = {},
): SqlColumnDefinition {
  return {
    name,
    type,
    nullable: options.nullable ?? false,
    primaryKey: options.primaryKey,
    description,
  };
}

function columnDdl(columnDefinition: SqlColumnDefinition): string {
  const constraints = columnDefinition.primaryKey
    ? " PRIMARY KEY"
    : columnDefinition.nullable ? "" : " NOT NULL";
  return `${columnDefinition.name} ${columnDefinition.type}${constraints}`;
}

export const SQL_SCHEMA_DDL = SQL_TABLES.map((table) => (
  `CREATE TABLE ${table.name} (\n` +
  table.columns.map((entry) => `  ${columnDdl(entry)}`).join(",\n") +
  "\n);"
)).join("\n\n");

export function sqlTable(name: SqlTableName): SqlTableDefinition {
  const table = SQL_TABLES.find((entry) => entry.name === name);
  if (!table) throw new Error(`未知 SQL 表：${name}`);
  return table;
}

export function sqlSchemaLine(name: SqlTableName): string {
  const table = sqlTable(name);
  return `${table.name}(${table.columns.map((entry) => entry.name).join(", ")})`;
}

export const COMPLETE_SCHEMA_LINES = SQL_TABLES.map((table) => (
  sqlSchemaLine(table.name)
));

export const COMPLETE_RELATION_LINES = SQL_RELATIONS.map((relation) => (
  `关系：${relation.fromTable}.${relation.fromColumn} = ${
    relation.toTable
  }.${relation.toColumn}`
));
