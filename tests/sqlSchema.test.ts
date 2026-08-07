import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { INITIAL_MONSTERS } from "../src/content/curriculum/mvpLevel";
import {
  COMPLETE_SCHEMA_LINES,
  SQL_RELATIONS,
  SQL_TABLES,
  sqlTable,
} from "../src/content/sql/sqlSchema";
import { SqlEngine } from "../src/infrastructure/sql/SqlEngine";
import { parseSchemaLines } from "../src/presentation/dom/sqlAutocomplete";

describe("complete SQL schema catalog", () => {
  it("完整列出运行时四表和全部字段", () => {
    expect(SQL_TABLES.map((table) => table.name)).toEqual([
      "monsters",
      "monster_signals",
      "rooms",
      "monster_gear",
    ]);
    expect(sqlTable("monsters").columns.map((column) => column.name)).toEqual([
      "id",
      "room_id",
      "name",
      "species",
      "hp",
      "armor",
      "status",
      "weakness",
      "master_id",
      "is_boss",
    ]);
    expect(sqlTable("monster_signals").columns.map((column) => column.name)).toEqual([
      "id",
      "monster_id",
      "channel",
      "charge",
    ]);
    expect(sqlTable("rooms").columns.map((column) => column.name)).toEqual([
      "id",
      "name",
      "sector",
      "floor",
    ]);
    expect(sqlTable("monster_gear").columns.map((column) => column.name)).toEqual([
      "id",
      "monster_id",
      "gear_name",
      "power",
    ]);
    expect(SQL_TABLES.reduce(
      (total, table) => total + table.columns.length,
      0,
    )).toBe(22);
    expect(parseSchemaLines(COMPLETE_SCHEMA_LINES)).toEqual(
      SQL_TABLES.map((table) => ({
        name: table.name,
        columns: table.columns.map((column) => column.name),
      })),
    );
  });

  it("每条教学关系都指向目录中真实存在的表和字段", () => {
    SQL_RELATIONS.forEach((relation) => {
      expect(sqlTable(relation.fromTable).columns.some(
        (column) => column.name === relation.fromColumn,
      )).toBe(true);
      expect(sqlTable(relation.toTable).columns.some(
        (column) => column.name === relation.toColumn,
      )).toBe(true);
    });
  });

  it("目录字段可直接从真实 SQLite WASM 表中查询", async () => {
    const wasmLocation = fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    ));
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);

    SQL_TABLES.forEach((table) => {
      const columns = table.columns.map((column) => column.name);
      const result = engine.executeSelect(
        `SELECT ${columns.join(", ")} FROM ${table.name} LIMIT 1`,
      );
      expect(result.columns).toEqual(columns);
    });
  });

  it("区域首领在真实 SQLite monsters 表中统一标记为 is_boss = 1", async () => {
    const wasmLocation = fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    ));
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);
    const result = engine.executeSelect(
      "SELECT id, is_boss FROM monsters " +
      "WHERE id IN (21, 22, 33, 44, 55, 66, 77, 89) ORDER BY id",
    );

    expect(result).toMatchObject({
      columns: ["id", "is_boss"],
      rows: [
        { id: 21, is_boss: 1 },
        { id: 22, is_boss: 1 },
        { id: 33, is_boss: 1 },
        { id: 44, is_boss: 1 },
        { id: 55, is_boss: 1 },
        { id: 66, is_boss: 1 },
        { id: 77, is_boss: 1 },
        { id: 89, is_boss: 1 },
      ],
    });
  });

  it("生态怪物的 room_id 与 SQLite 房间 sector 保持一致", async () => {
    const wasmLocation = fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    ));
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);
    const result = engine.executeSelect(
      "SELECT m.id, m.room_id, r.sector FROM monsters m " +
      "INNER JOIN rooms r ON m.room_id = r.id " +
      "WHERE m.id IN (6, 7, 8, 9, 33, 44, 55, 63, 64, 66, 74, 75, 76, 77, 86, 88, 89) " +
      "ORDER BY m.id",
    );

    expect(result.rows).toEqual([
      { id: 6, room_id: 11, sector: "drainage" },
      { id: 7, room_id: 12, sector: "slime-pool" },
      { id: 8, room_id: 13, sector: "ember-cellar" },
      { id: 9, room_id: 14, sector: "drainage" },
      { id: 33, room_id: 50, sector: "grave-mire" },
      { id: 44, room_id: 60, sector: "frost-vault" },
      { id: 55, room_id: 70, sector: "barracks" },
      { id: 63, room_id: 79, sector: "dragon-throne" },
      { id: 64, room_id: 79, sector: "dragon-throne" },
      { id: 66, room_id: 80, sector: "crystal-cavern" },
      { id: 74, room_id: 88, sector: "root-maze" },
      { id: 75, room_id: 87, sector: "crystal-grove" },
      { id: 76, room_id: 89, sector: "index-heart" },
      { id: 77, room_id: 90, sector: "root-maze" },
      { id: 86, room_id: 99, sector: "void-court" },
      { id: 88, room_id: 100, sector: "data-throne" },
      { id: 89, room_id: 101, sector: "void-court" },
    ]);
  });
});
