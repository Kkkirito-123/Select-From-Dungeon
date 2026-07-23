import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { SQL_SCHEMA_DDL } from "../content/sqlSchema";
import { detectQueryFeatures } from "../domain/lessonEvaluator";
import type { Monster, SqlQueryResult } from "../domain/types";
import {
  validateReadOnlyQuery,
  validateSandboxScript,
} from "../domain/queryPolicy";
import type { FloorNumber } from "../domain/runGraph";

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

  execute(input: string, floor: FloorNumber): SqlQueryResult {
    return floor === 6
      ? this.executeSandbox(input)
      : this.executeSelect(input);
  }

  executeSandbox(input: string): SqlQueryResult {
    const validation = validateSandboxScript(input);
    if (!validation.ok) {
      throw new Error(validation.message);
    }
    const sandbox = new this.SQL.Database(this.database.export());
    try {
      sandbox.run(validation.sql);
      const snapshot = sandbox.exec(
        "SELECT id, item, quantity, status FROM repair_queue ORDER BY id",
      )[0];
      const columns = snapshot?.columns ?? [];
      const rows = snapshot ? rowsFromResult(snapshot.columns, snapshot.values) : [];
      return {
        sql: validation.sql,
        columns,
        rows,
        targetIds: [],
        plan: [
          "COPY in-memory SQLite sandbox",
          `${validation.statements.length} controlled statement(s)`,
          "DISCARD sandbox after this turn",
        ],
        baseHeat: 4 + validation.statements.length,
        features: detectQueryFeatures(validation.sql),
      };
    } finally {
      sandbox.close();
    }
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

      CREATE TABLE repair_queue (
        id INTEGER PRIMARY KEY,
        item TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 9),
        status TEXT NOT NULL
      );

      CREATE TABLE index_records (
        id INTEGER PRIMARY KEY,
        realm TEXT NOT NULL,
        category TEXT NOT NULL,
        score INTEGER NOT NULL,
        code TEXT NOT NULL,
        payload TEXT NOT NULL
      );

      CREATE TABLE tx_versions (
        row_id INTEGER NOT NULL,
        version_id INTEGER NOT NULL,
        value TEXT NOT NULL,
        created_tx INTEGER NOT NULL,
        expired_tx INTEGER,
        PRIMARY KEY(row_id, version_id)
      );

      CREATE TABLE lock_waits (
        waiter_tx TEXT NOT NULL,
        blocker_tx TEXT NOT NULL,
        resource TEXT NOT NULL
      );

      CREATE TABLE isolation_cases (
        id INTEGER PRIMARY KEY,
        phenomenon TEXT NOT NULL,
        first_count INTEGER NOT NULL,
        second_count INTEGER NOT NULL,
        prevented_by TEXT NOT NULL
      );

      CREATE TABLE schema_choices (
        id INTEGER PRIMARY KEY,
        model TEXT NOT NULL,
        has_primary_key INTEGER NOT NULL,
        has_unique_email INTEGER NOT NULL,
        duplicate_groups INTEGER NOT NULL,
        score INTEGER NOT NULL
      );

      CREATE TABLE replica_status (
        node TEXT PRIMARY KEY,
        region TEXT NOT NULL,
        lag_ms INTEGER NOT NULL,
        healthy INTEGER NOT NULL,
        role TEXT NOT NULL
      );

      CREATE TABLE shard_routes (
        account_id INTEGER PRIMARY KEY,
        shard_id INTEGER NOT NULL,
        region TEXT NOT NULL,
        route_ok INTEGER NOT NULL
      );

      CREATE TABLE security_cases (
        id INTEGER PRIMARY KEY,
        method TEXT NOT NULL,
        parameterized INTEGER NOT NULL,
        least_privilege INTEGER NOT NULL,
        allowed INTEGER NOT NULL
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
      CREATE INDEX idx_index_records_realm_score
        ON index_records(realm, score DESC);
      CREATE INDEX idx_index_records_category_code
        ON index_records(category, code);
      CREATE INDEX idx_index_records_code
        ON index_records(code);

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
        (60, '炉主核心', 'forge-boss', 4),
        (61, '黑铁外门', 'outer', 5),
        (62, '外城军阵', 'outer', 5),
        (63, '竞技场', 'arena', 5),
        (64, '巡逻城墙', 'arena', 5),
        (65, '累计城墙', 'wall', 5),
        (66, '城主厅', 'core', 5),
        (67, '黑铁外城', 'iron-yard', 5),
        (68, '兽人兵营', 'barracks', 5),
        (69, '要塞内城', 'black-citadel', 5),
        (70, '堡主炮台', 'citadel-boss', 5),
        (71, '孵化台', 'hatchery', 6),
        (72, '翼龙巢', 'sky', 6),
        (73, '雷龙洞', 'thunder', 6),
        (74, '龙晶门', 'crystal', 6),
        (75, '事务熔洞', 'magma', 6),
        (76, '龙王巢', 'core', 6),
        (77, '岩浆孵化场', 'magma-nest', 6),
        (78, '龙晶洞窟', 'crystal-cavern', 6),
        (79, '古龙骨道', 'dragon-throne', 6),
        (80, '古龙王台', 'dragon-boss', 6),
        (81, '水晶枝径', 'crystal-grove', 7),
        (82, '盘根索道', 'root-maze', 7),
        (83, '镜晶湖', 'crystal-grove', 7),
        (84, '藤门', 'root-maze', 7),
        (85, '计划晶眼', 'index-heart', 7),
        (86, '索引树心', 'index-heart', 7),
        (87, '枝根野径', 'crystal-grove', 7),
        (88, '水晶根窟', 'root-maze', 7),
        (89, '计划碑林', 'index-heart', 7),
        (90, '林王树台', 'index-heart', 7),
        (91, '版本厅', 'obsidian-hall', 8),
        (92, '双骑门', 'void-court', 8),
        (93, '隔离幻境', 'void-court', 8),
        (94, '石像庭', 'obsidian-hall', 8),
        (95, '复制双塔', 'data-throne', 8),
        (96, '分片巨兽桥', 'data-throne', 8),
        (97, '魔王座', 'data-throne', 8),
        (98, '魔兵长廊', 'obsidian-hall', 8),
        (99, '黑骑王庭', 'void-court', 8),
        (100, '黑曜阶梯', 'data-throne', 8),
        (101, '王兽台', 'data-throne', 8);

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
        (22, 21, '电容核', 16),
        (23, 23, '短矛', 18),
        (24, 25, '黑铁盾', 20),
        (25, 26, '骑枪', 22),
        (26, 27, '城墙锤', 24),
        (27, 28, '城主冠', 28),
        (28, 31, '卫队盾', 24),
        (29, 33, '堡垒弩', 26),
        (30, 34, '幼龙爪', 20),
        (31, 36, '雷龙角', 24),
        (32, 37, '龙晶甲', 25),
        (33, 38, '古龙鳞', 28),
        (34, 39, '龙王冠', 32),
        (35, 42, '雷核', 29),
        (36, 44, '古龙骨', 30),
        (49, 24, '战斧', 20),
        (50, 29, '侦察短刀', 18),
        (51, 30, '兽骨肩甲', 20),
        (52, 32, '投石索', 22),
        (53, 35, '翼爪', 22),
        (54, 40, '火壳', 21),
        (55, 41, '翼刃', 23),
        (56, 43, '晶爪', 27),
        (57, 45, '枝剑', 31),
        (58, 47, '镜盾', 33),
        (59, 49, '晶眼', 35),
        (60, 50, '树心', 38),
        (61, 53, '晶核', 34),
        (62, 55, '林王冠', 37),
        (63, 56, '旧版灯', 39),
        (64, 57, '锁骑链', 41),
        (65, 59, '黑曜拳', 43),
        (66, 60, '双塔印', 45),
        (67, 61, '分片角', 46),
        (68, 62, '魔王冠', 50),
        (69, 65, '魔将刃', 44),
        (70, 67, '王兽牙', 48);

      INSERT INTO repair_queue(id, item, quantity, status) VALUES
        (1, 'ore', 2, 'ready'),
        (2, 'scale', 1, 'damaged'),
        (3, 'fang', 1, 'duplicate'),
        (4, 'fang', 1, 'duplicate'),
        (5, 'core', 1, 'ready');

      INSERT INTO index_records(id, realm, category, score, code, payload) VALUES
        (1, 'crystal', 'guard', 70, 'CRY-101', 'branch'),
        (2, 'crystal', 'guard', 84, 'CRY-102', 'root'),
        (3, 'crystal', 'scout', 72, 'CRY-103', 'path'),
        (4, 'crystal', 'guard', 88, 'CRY-104', 'mirror'),
        (5, 'crystal', 'charm', 78, 'CRY-105', 'rune'),
        (6, 'crystal', 'boss', 95, 'CRY-106', 'heart'),
        (7, 'crystal', 'boss', 82, 'CRY-107', 'crown'),
        (8, 'ember', 'guard', 90, 'EMB-201', 'ash'),
        (9, 'ember', 'charm', 76, 'EMB-202', 'coal'),
        (10, 'ember', 'boss', 92, 'EMB-203', 'flame'),
        (11, 'void', 'guard', 68, 'VOI-301', 'mist'),
        (12, 'void', 'boss', 86, 'VOI-302', 'gate');

      INSERT INTO tx_versions(row_id, version_id, value, created_tx, expired_tx) VALUES
        (1, 1, 'ember', 1, 8),
        (1, 2, 'crystal', 8, NULL),
        (2, 1, 'locked', 4, 13),
        (2, 2, 'free', 13, NULL),
        (3, 1, 'safe', 11, NULL);

      INSERT INTO lock_waits(waiter_tx, blocker_tx, resource) VALUES
        ('T1', 'T2', 'account:7'),
        ('T2', 'T1', 'inventory:9'),
        ('T3', 'T2', 'log:2');

      INSERT INTO isolation_cases(id, phenomenon, first_count, second_count, prevented_by) VALUES
        (1, 'dirty_read', 5, 5, 'READ_COMMITTED'),
        (2, 'non_repeatable_read', 7, 7, 'REPEATABLE_READ'),
        (3, 'phantom_read', 2, 4, 'SERIALIZABLE');

      INSERT INTO schema_choices(id, model, has_primary_key, has_unique_email, duplicate_groups, score) VALUES
        (1, 'heap', 0, 0, 3, 20),
        (2, 'normalized', 1, 1, 0, 95),
        (3, 'over_split', 1, 1, 0, 80),
        (4, 'duplicate', 1, 0, 4, 35);

      INSERT INTO replica_status(node, region, lag_ms, healthy, role) VALUES
        ('primary-a', 'east', 0, 1, 'primary'),
        ('replica-a', 'east', 120, 0, 'replica'),
        ('replica-b', 'west', 18, 1, 'replica'),
        ('replica-c', 'north', 42, 1, 'replica');

      INSERT INTO shard_routes(account_id, shard_id, region, route_ok) VALUES
        (101, 0, 'east', 1),
        (102, 0, 'west', 1),
        (103, 1, 'north', 1),
        (104, 2, 'east', 1),
        (105, 2, 'west', 1),
        (106, 2, 'north', 1),
        (107, 9, 'unknown', 0);

      INSERT INTO security_cases(id, method, parameterized, least_privilege, allowed) VALUES
        (1, 'raw-query', 0, 0, 0),
        (2, 'prepared-select', 1, 1, 1),
        (3, 'admin-script', 1, 0, 0),
        (4, 'sanitized-text', 0, 1, 0);
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
