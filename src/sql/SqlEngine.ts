import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
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
      CREATE TABLE monsters (
        id INTEGER PRIMARY KEY,
        room_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        species TEXT NOT NULL,
        hp INTEGER NOT NULL,
        armor INTEGER NOT NULL,
        status TEXT NOT NULL,
        weakness TEXT,
        master_id INTEGER,
        is_boss INTEGER NOT NULL
      );

      CREATE TABLE monster_signals (
        id INTEGER PRIMARY KEY,
        monster_id INTEGER NOT NULL,
        channel TEXT NOT NULL,
        charge INTEGER NOT NULL
      );

      CREATE TABLE rooms (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        sector TEXT NOT NULL,
        floor INTEGER NOT NULL
      );

      CREATE TABLE monster_gear (
        id INTEGER PRIMARY KEY,
        monster_id INTEGER NOT NULL,
        gear_name TEXT NOT NULL,
        power INTEGER NOT NULL
      );

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
        (1, '青页档案室', 'stone', 1),
        (2, '猎犬廊', 'stone', 1),
        (3, '无主墓室', 'crypt', 1),
        (4, '聚合钟楼', 'clock', 1),
        (5, '魔王核心', 'core', 1),
        (21, '雷序回廊', 'storm', 2),
        (22, '镜像阵列', 'storm', 2),
        (23, '双表桥', 'bridge', 2),
        (24, '缺口层', 'void', 2),
        (25, '雷鸣主核', 'core', 2),
        (31, '侧峰伏击区', 'ambush', 2),
        (32, '镜像伏击区', 'ambush', 2),
        (33, '伏击桥', 'ambush', 2),
        (34, '缺口伏击区', 'ambush', 2);

      INSERT INTO monster_gear(id, monster_id, gear_name, power) VALUES
        (1, 1200, '雷序军刀', 13),
        (2, 1300, '镜像甲片', 8),
        (3, 1400, '关系链刃', 15),
        (4, 1900, '雷鸣指挥核', 21),
        (5, 1900, '备用节拍器', 17),
        (6, 1210, '侧峰鳞片', 7),
        (7, 1310, '镜像碎片', 6),
        (8, 1410, '外键丝', 9);
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
