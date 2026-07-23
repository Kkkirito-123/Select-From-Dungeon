import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { SQL_SCHEMA_DDL } from "../content/sqlSchema";
import { detectQueryFeatures } from "../domain/lessonEvaluator";
import type { Monster, SqlQueryResult } from "../domain/types";
import { validateReadOnlyQuery } from "../domain/queryPolicy";

const MAX_RESULT_ROWS = 50;

function estimateHeat(plan: string[]): number {
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

function rowsFromResult(
  columns: string[],
  values: Array<Array<number | string | Uint8Array | null>>,
): Array<Record<string, unknown>> {
  return values.slice(0, MAX_RESULT_ROWS).map((valueRow) =>
    Object.fromEntries(columns.map((column, index) => [column, valueRow[index]])),
  );
}

export class SqlEngine {
  private constructor(
    private readonly SQL: SqlJsStatic,
    private database: Database,
  ) {}

  static async create(
    monsters: Monster[],
    wasmLocation = wasmUrl,
  ): Promise<SqlEngine> {
    const SQL = await initSqlJs({ locateFile: () => wasmLocation });
    const engine = new SqlEngine(SQL, new SQL.Database());
    engine.seed(monsters);
    return engine;
  }

  executeSelect(input: string): SqlQueryResult {
    const validation = validateReadOnlyQuery(input);
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const planResult = this.database.exec(`EXPLAIN QUERY PLAN ${validation.sql}`)[0];
    const plan = planResult
      ? planResult.values.map((row) => String(row[row.length - 1] ?? ""))
      : [];
    const queryResult = this.database.exec(validation.sql)[0];

    if (!queryResult) {
      return {
        sql: validation.sql,
        columns: [],
        rows: [],
        targetIds: [],
        plan,
        baseHeat: estimateHeat(plan),
        features: detectQueryFeatures(validation.sql),
      };
    }

    const idIndex = queryResult.columns.findIndex(
      (column) => column.toLocaleLowerCase() === "id",
    );
    const targetIds = idIndex < 0
      ? []
      : queryResult.values
          .slice(0, MAX_RESULT_ROWS)
          .map((row) => Number(row[idIndex]))
          .filter((id) => Number.isInteger(id));

    return {
      sql: validation.sql,
      columns: queryResult.columns,
      rows: rowsFromResult(queryResult.columns, queryResult.values),
      targetIds,
      plan,
      baseHeat: estimateHeat(plan),
      features: detectQueryFeatures(validation.sql),
    };
  }

  updateMonsterHp(updates: Array<{ id: number; hp: number }>): void {
    const statement = this.database.prepare(
      "UPDATE monsters SET hp = $hp WHERE id = $id",
    );
    try {
      updates.forEach(({ id, hp }) => statement.run({ $id: id, $hp: hp }));
    } finally {
      statement.free();
    }
  }

  reset(monsters: Monster[]): void {
    this.database.close();
    this.database = new this.SQL.Database();
    this.seed(monsters);
  }

  private seed(monsters: Monster[]): void {
    this.database.run(`
      ${SQL_SCHEMA_DDL}

      CREATE INDEX idx_monsters_room_status
        ON monsters(room_id, status);
      CREATE INDEX idx_monsters_room_master
        ON monsters(room_id, master_id);
      CREATE INDEX idx_signals_monster_channel
        ON monster_signals(monster_id, channel);
      CREATE INDEX idx_rooms_floor_sector
        ON rooms(floor, sector);
      CREATE INDEX idx_gear_monster_power
        ON monster_gear(monster_id, power);

      INSERT INTO monster_signals(id, monster_id, channel, charge) VALUES
        (1, 800, 'echo', 7),
        (2, 800, 'echo', 8),
        (3, 800, 'echo', 9),
        (4, 800, 'noise', 1),
        (5, 900, 'echo', 7),
        (6, 900, 'echo', 8),
        (7, 900, 'echo', 9),
        (8, 900, 'ward', 4),
        (9, 900, 'ward', 5),
        (10, 900, 'noise', 1),
        (11, 810, 'echo', 6),
        (12, 810, 'echo', 7),
        (13, 810, 'noise', 2),
        (14, 810, 'noise', 3),
        (15, 1200, 'pulse', 9),
        (16, 1200, 'surge', 13),
        (17, 1200, 'arc', 11),
        (18, 1210, 'arc', 7),
        (19, 1210, 'surge', 10),
        (20, 1300, 'echo', 5),
        (21, 1300, 'echo', 6),
        (22, 1300, 'mirror', 8),
        (23, 1300, 'mirror', 9),
        (24, 1310, 'echo', 4),
        (25, 1310, 'echo', 5),
        (26, 1310, 'mirror', 7);

      INSERT INTO rooms(id, name, sector, floor) VALUES
        (1, '青石排水室', 'drainage', 1),
        (2, '软泥水池', 'slime', 1),
        (3, '毒泥仓窖', 'slime', 1),
        (4, '铁泥巢', 'ember', 1),
        (5, '泥王巢', 'core', 1),
        (21, '森林入口', 'storm', 2),
        (22, '湖心石台', 'storm', 2),
        (23, '古树桥', 'forest-bridge', 2),
        (24, '毒雾泥沼', 'swamp', 2),
        (25, '丛林王庭', 'core', 2),
        (31, '浅水湖岸', 'ambush', 2),
        (32, '水蛇湾', 'ambush', 2),
        (33, '泥沼石径', 'ambush', 2),
        (34, '毒蛙洼地', 'ambush', 2),
        (35, '猎犬林道', 'forest-hound', 2),
        (36, '树妖林地', 'forest-treant', 2),
        (37, '湖怪深潭', 'lake-boss', 2),
        (38, '蛙王泥宫', 'swamp-boss', 2),
        (41, '骨桥前庭', 'grave', 3),
        (42, '空甲墓道', 'grave', 3),
        (43, '回声灵堂', 'crypt', 3),
        (44, '骑士墓', 'crypt', 3),
        (45, '合葬厅', 'throne', 3),
        (46, '死灵王庭', 'throne', 3),
        (47, '遗骨荒地', 'bone-yard', 3),
        (48, '腐土墓园', 'grave-mire', 3),
        (49, '幽火地宫', 'spirit-crypt', 3),
        (50, '墓主祭坛', 'tomb-boss', 3),
        (51, '火室', 'flame', 4),
        (52, '冰库', 'frost', 4),
        (53, '雷池', 'storm', 4),
        (54, '石炉', 'forge', 4),
        (55, '符文环', 'rune', 4),
        (56, '元素王座', 'core', 4),
        (57, '火苗池', 'fire-forge', 4),
        (58, '冰晶窟', 'frost-vault', 4),
        (59, '雷兽巢', 'storm-core', 4),
        (60, '炉主核心', 'forge-boss', 4);

      INSERT INTO monster_gear(id, monster_id, gear_name, power) VALUES
        (1, 1200, '雷序军刀', 13),
        (2, 1300, '镜像甲片', 8),
        (3, 1400, '古树链刃', 15),
        (4, 1900, '丛林王冠', 21),
        (5, 1900, '备用节拍器', 17),
        (6, 1210, '湖鳞', 7),
        (7, 1310, '蛇蜕', 6),
        (8, 1410, '青蛙叶', 9),
        (9, 1, '骨短刀', 15),
        (10, 3, '魂灯', 16),
        (11, 4, '墓卫剑', 18),
        (12, 5, '骨枪', 20),
        (13, 6, '死灵冠', 24),
        (14, 9, '鬼火瓶', 17),
        (15, 11, '墓主印', 22),
        (16, 14, '雷晶', 17),
        (17, 15, '炉心', 18),
        (18, 16, '炎冠', 20),
        (19, 17, '元素核', 26),
        (20, 20, '雷兽爪', 19),
        (21, 22, '炉主锤', 22),
        (22, 21, '电容核', 16);
    `);

    const insertMonster = this.database.prepare(`
      INSERT INTO monsters(
        id, room_id, name, species, hp, armor, status,
        weakness, master_id, is_boss
      ) VALUES (
        $id, $roomId, $name, $species, $hp, $armor, $status,
        $weakness, $masterId, $isBoss
      )
    `);
    try {
      monsters.forEach((monster) => {
        insertMonster.run({
          $id: monster.id,
          $roomId: monster.roomId,
          $name: monster.name,
          $species: monster.species,
          $hp: monster.hp,
          $armor: monster.armor,
          $status: monster.status,
          $weakness: monster.weakness,
          $masterId: monster.masterId,
          $isBoss: monster.isBoss ? 1 : 0,
        });
      });
    } finally {
      insertMonster.free();
    }
  }
}
