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
import {
  WORLD_STORY_SCHEMA_DDL,
  worldStorySeedDml,
} from "./worldStorySchema";

const MAX_RESULT_ROWS = 50;

interface MonsterSignalFixture {
  id: number;
  monsterId: number;
  channel: string;
  charge: number;
}

interface MonsterGearFixture {
  id: number;
  monsterId: number;
  gearName: string;
  power: number;
}

const MONSTER_SIGNAL_FIXTURES: readonly MonsterSignalFixture[] = [
  { id: 1, monsterId: 4, channel: "echo", charge: 7 },
  { id: 2, monsterId: 4, channel: "echo", charge: 8 },
  { id: 3, monsterId: 4, channel: "echo", charge: 9 },
  { id: 4, monsterId: 4, channel: "noise", charge: 1 },
  { id: 5, monsterId: 5, channel: "echo", charge: 7 },
  { id: 6, monsterId: 5, channel: "echo", charge: 8 },
  { id: 7, monsterId: 5, channel: "echo", charge: 9 },
  { id: 8, monsterId: 5, channel: "ward", charge: 4 },
  { id: 9, monsterId: 5, channel: "ward", charge: 5 },
  { id: 10, monsterId: 5, channel: "noise", charge: 1 },
  { id: 11, monsterId: 9, channel: "echo", charge: 6 },
  { id: 12, monsterId: 9, channel: "echo", charge: 7 },
  { id: 13, monsterId: 9, channel: "noise", charge: 2 },
  { id: 14, monsterId: 9, channel: "noise", charge: 3 },
  { id: 15, monsterId: 10, channel: "pulse", charge: 9 },
  { id: 16, monsterId: 10, channel: "surge", charge: 13 },
  { id: 17, monsterId: 10, channel: "arc", charge: 11 },
  { id: 18, monsterId: 15, channel: "arc", charge: 7 },
  { id: 19, monsterId: 15, channel: "surge", charge: 10 },
  { id: 20, monsterId: 11, channel: "echo", charge: 5 },
  { id: 21, monsterId: 11, channel: "echo", charge: 6 },
  { id: 22, monsterId: 11, channel: "mirror", charge: 8 },
  { id: 23, monsterId: 11, channel: "mirror", charge: 9 },
  { id: 24, monsterId: 16, channel: "echo", charge: 4 },
  { id: 25, monsterId: 16, channel: "echo", charge: 5 },
  { id: 26, monsterId: 16, channel: "mirror", charge: 7 },
  { id: 27, monsterId: 21, channel: "deep", charge: 7 },
  { id: 28, monsterId: 21, channel: "wake", charge: 11 },
  { id: 29, monsterId: 21, channel: "wake", charge: 9 },
  { id: 30, monsterId: 21, channel: "surge", charge: 14 },
  { id: 31, monsterId: 21, channel: "surge", charge: 13 },
] as const;

const MONSTER_GEAR_FIXTURES: readonly MonsterGearFixture[] = [
  { id: 1, monsterId: 10, gearName: "雷序军刀", power: 13 },
  { id: 2, monsterId: 11, gearName: "镜像甲片", power: 8 },
  { id: 3, monsterId: 12, gearName: "古树链刃", power: 15 },
  { id: 4, monsterId: 14, gearName: "主透镜", power: 21 },
  { id: 5, monsterId: 14, gearName: "备用透镜", power: 17 },
  { id: 6, monsterId: 15, gearName: "湖鳞", power: 7 },
  { id: 7, monsterId: 16, gearName: "镜蛇蜕", power: 6 },
  { id: 8, monsterId: 17, gearName: "沼叶", power: 9 },
  { id: 9, monsterId: 23, gearName: "骨短刀", power: 15 },
  { id: 10, monsterId: 25, gearName: "魂灯", power: 16 },
  { id: 11, monsterId: 26, gearName: "墓卫剑", power: 18 },
  { id: 12, monsterId: 27, gearName: "骨枪", power: 20 },
  { id: 13, monsterId: 28, gearName: "死灵冠", power: 24 },
  { id: 14, monsterId: 31, gearName: "鬼火瓶", power: 17 },
  { id: 15, monsterId: 33, gearName: "墓主印", power: 22 },
  { id: 16, monsterId: 36, gearName: "雷晶", power: 17 },
  { id: 17, monsterId: 37, gearName: "炉心", power: 18 },
  { id: 18, monsterId: 38, gearName: "炎冠", power: 20 },
  { id: 19, monsterId: 39, gearName: "元素核", power: 26 },
  { id: 20, monsterId: 42, gearName: "雷兽爪", power: 19 },
  { id: 21, monsterId: 44, gearName: "霜炉锤", power: 22 },
  { id: 22, monsterId: 43, gearName: "电容核", power: 16 },
  { id: 23, monsterId: 45, gearName: "短矛", power: 18 },
  { id: 24, monsterId: 47, gearName: "黑铁盾", power: 20 },
  { id: 25, monsterId: 48, gearName: "骑枪", power: 22 },
  { id: 26, monsterId: 49, gearName: "城墙锤", power: 24 },
  { id: 27, monsterId: 50, gearName: "城主冠", power: 28 },
  { id: 28, monsterId: 53, gearName: "卫队盾", power: 24 },
  { id: 29, monsterId: 55, gearName: "堡垒弩", power: 26 },
  { id: 30, monsterId: 56, gearName: "幼龙爪", power: 20 },
  { id: 31, monsterId: 58, gearName: "雷龙角", power: 24 },
  { id: 32, monsterId: 59, gearName: "龙晶甲", power: 25 },
  { id: 33, monsterId: 60, gearName: "古龙鳞", power: 28 },
  { id: 34, monsterId: 61, gearName: "龙王冠", power: 32 },
  { id: 35, monsterId: 64, gearName: "电龙核", power: 29 },
  { id: 36, monsterId: 66, gearName: "古龙骨", power: 30 },
  { id: 49, monsterId: 46, gearName: "战斧", power: 20 },
  { id: 50, monsterId: 51, gearName: "侦察短刀", power: 18 },
  { id: 51, monsterId: 52, gearName: "兽骨肩甲", power: 20 },
  { id: 52, monsterId: 54, gearName: "石魔投索", power: 22 },
  { id: 53, monsterId: 57, gearName: "翼爪", power: 22 },
  { id: 54, monsterId: 62, gearName: "火壳", power: 21 },
  { id: 55, monsterId: 63, gearName: "翼刃", power: 23 },
  { id: 56, monsterId: 65, gearName: "矿龙晶爪", power: 27 },
  { id: 57, monsterId: 67, gearName: "枝剑", power: 31 },
  { id: 58, monsterId: 69, gearName: "镜盾", power: 33 },
  { id: 59, monsterId: 71, gearName: "晶眼", power: 35 },
  { id: 60, monsterId: 72, gearName: "树心", power: 38 },
  { id: 61, monsterId: 75, gearName: "晶核", power: 34 },
  { id: 62, monsterId: 77, gearName: "林王冠", power: 37 },
  { id: 63, monsterId: 78, gearName: "旧版灯", power: 39 },
  { id: 64, monsterId: 79, gearName: "锁骑链", power: 41 },
  { id: 65, monsterId: 81, gearName: "黑曜拳", power: 43 },
  { id: 66, monsterId: 82, gearName: "双塔印", power: 45 },
  { id: 67, monsterId: 83, gearName: "分片角", power: 46 },
  { id: 68, monsterId: 84, gearName: "档案王冠", power: 50 },
  { id: 69, monsterId: 87, gearName: "魔将刃", power: 44 },
  { id: 70, monsterId: 89, gearName: "王兽牙", power: 48 },
] as const;

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

      ${WORLD_STORY_SCHEMA_DDL}

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

      INSERT INTO rooms(id, name, sector, floor) VALUES
        (1, '水轮大厅', 'drainage', 1),
        (2, '青石排水渠', 'drainage', 1),
        (3, '无名宿舍', 'dormitory', 1),
        (4, '聚合档案室', 'ember', 1),
        (5, '登记大厅', 'core', 1),
        (11, '暗渠水口', 'drainage', 1),
        (12, '软泥池', 'slime-pool', 1),
        (13, '余烬地窖', 'ember-cellar', 1),
        (14, '沉默箱室', 'drainage', 1),
        (21, '白沙浅滩', 'coast', 2),
        (22, '月影湖', 'lake', 2),
        (23, '古树桥', 'forest', 2),
        (24, '芦苇沼泽', 'swamp', 2),
        (25, '灯塔岛', 'lighthouse', 2),
        (31, '湖泊', 'lake', 2),
        (32, '镜潮湾', 'lake', 2),
        (33, '泥沼石径', 'swamp', 2),
        (34, '毒雾洼地', 'swamp', 2),
        (35, '北林巡道', 'forest', 2),
        (36, '盘根林地', 'forest', 2),
        (37, '深水影潭', 'lake', 2),
        (38, '泥冠宫', 'swamp', 2),
        (41, '骨桥前庭', 'grave', 3),
        (42, '空甲墓道', 'grave', 3),
        (43, '回声灵堂', 'crypt', 3),
        (44, '骑士墓', 'crypt', 3),
        (45, '合葬厅', 'throne', 3),
        (46, '死灵王庭', 'throne', 3),
        (47, '遗骨荒地', 'bone-yard', 3),
        (48, '腐土墓园', 'grave-mire', 3),
        (49, '幽火地宫', 'spirit-crypt', 3),
        (50, '墓主祭坛', 'grave-mire', 3),
        (51, '火室', 'flame', 4),
        (52, '冰库', 'frost', 4),
        (53, '雷池', 'storm', 4),
        (54, '石炉', 'forge', 4),
        (55, '符文环', 'rune', 4),
        (56, '元素王座', 'core', 4),
        (57, '火苗池', 'fire-forge', 4),
        (58, '冰晶窟', 'frost-vault', 4),
        (59, '雷兽巢', 'storm-core', 4),
        (60, '寒霜炉心', 'frost-vault', 4),
        (61, '黑铁外门', 'outer', 5),
        (62, '外城军阵', 'outer', 5),
        (63, '竞技场', 'arena', 5),
        (64, '巡逻城墙', 'arena', 5),
        (65, '累计城墙', 'wall', 5),
        (66, '城主厅', 'core', 5),
        (67, '黑铁外城', 'iron-yard', 5),
        (68, '兽人兵营', 'barracks', 5),
        (69, '要塞内城', 'black-citadel', 5),
        (70, '堡主炮台', 'barracks', 5),
        (71, '孵化台', 'hatchery', 6),
        (72, '翼龙巢', 'sky', 6),
        (73, '雷龙洞', 'thunder', 6),
        (74, '龙晶门', 'crystal', 6),
        (75, '事务熔洞', 'magma', 6),
        (76, '龙王巢', 'core', 6),
        (77, '岩浆孵化场', 'magma-nest', 6),
        (78, '龙晶洞窟', 'crystal-cavern', 6),
        (79, '古龙骨道', 'dragon-throne', 6),
        (80, '古龙王台', 'crystal-cavern', 6),
        (81, '水晶枝径', 'crystal-grove', 7),
        (82, '盘根索道', 'root-maze', 7),
        (83, '镜晶湖', 'crystal-grove', 7),
        (84, '藤门', 'root-maze', 7),
        (85, '计划晶眼', 'index-heart', 7),
        (86, '索引树心', 'index-heart', 7),
        (87, '枝根野径', 'crystal-grove', 7),
        (88, '水晶根窟', 'root-maze', 7),
        (89, '计划碑林', 'index-heart', 7),
        (90, '林王树台', 'root-maze', 7),
        (91, '版本厅', 'obsidian-hall', 8),
        (92, '双骑门', 'void-court', 8),
        (93, '隔离幻境', 'void-court', 8),
        (94, '石像庭', 'obsidian-hall', 8),
        (95, '复制双塔', 'data-throne', 8),
        (96, '分片巨兽桥', 'data-throne', 8),
        (97, '迁移王座', 'data-throne', 8),
        (98, '魔兵长廊', 'obsidian-hall', 8),
        (99, '黑骑王庭', 'void-court', 8),
        (100, '黑曜阶梯', 'data-throne', 8),
        (101, '王兽台', 'void-court', 8);

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

      ${worldStorySeedDml()}
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

    this.seedMonsterRelations(new Set(monsters.map((monster) => monster.id)));
  }

  private seedMonsterRelations(monsterIds: ReadonlySet<number>): void {
    const insertSignal = this.database.prepare(`
      INSERT INTO monster_signals(id, monster_id, channel, charge)
      VALUES ($id, $monsterId, $channel, $charge)
    `);
    try {
      MONSTER_SIGNAL_FIXTURES
        .filter((fixture) => monsterIds.has(fixture.monsterId))
        .forEach((fixture) => {
          insertSignal.run({
            $id: fixture.id,
            $monsterId: fixture.monsterId,
            $channel: fixture.channel,
            $charge: fixture.charge,
          });
        });
    } finally {
      insertSignal.free();
    }

    const insertGear = this.database.prepare(`
      INSERT INTO monster_gear(id, monster_id, gear_name, power)
      VALUES ($id, $monsterId, $gearName, $power)
    `);
    try {
      MONSTER_GEAR_FIXTURES
        .filter((fixture) => monsterIds.has(fixture.monsterId))
        .forEach((fixture) => {
          insertGear.run({
            $id: fixture.id,
            $monsterId: fixture.monsterId,
            $gearName: fixture.gearName,
            $power: fixture.power,
          });
        });
    } finally {
      insertGear.free();
    }
  }
}
