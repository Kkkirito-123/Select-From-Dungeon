import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INITIAL_MONSTERS } from "../src/content/curriculum/mvpLevel";
import {
  STORY_QUERY_CATALOG,
  storyQuery,
} from "../src/content/sql/storyQueryCatalog";
import { SqlEngine } from "../src/infrastructure/sql/SqlEngine";

async function createEngine(): Promise<SqlEngine> {
  return SqlEngine.create(
    [...INITIAL_MONSTERS],
    fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    )),
  );
}

describe("read-only world story schema", () => {
  it("executes every audited story query against real SQLite", async () => {
    const engine = await createEngine();
    STORY_QUERY_CATALOG.forEach((entry) => {
      const result = engine.executeSelect(entry.sql);
      expect(result.rows, entry.id).toHaveLength(entry.expectedRowCount);
      if (entry.expectedColumns.length > 0) {
        expect(result.columns, entry.id).toEqual(entry.expectedColumns);
      }
    });
  });

  it("keeps the opening contradiction and seven-source evidence exact", async () => {
    const engine = await createEngine();
    expect(engine.executeSelect(storyQuery("f1-current-resident").sql).rows)
      .toEqual([]);
    expect(engine.executeSelect(storyQuery("f2-seven-source-pages").sql).rows)
      .toEqual([
        { alias_name: "澜", source_kind: "cargo-ledger", sector: "coast" },
        { alias_name: "苇", source_kind: "beacon-mark", sector: "coast" },
        { alias_name: "铃", source_kind: "bridge-carving", sector: "forest" },
        { alias_name: "禾", source_kind: "medicine-book", sector: "swamp" },
        { alias_name: "舟", source_kind: "doorplate", sector: "lake" },
        { alias_name: "鸥", source_kind: "cabin-list", sector: "lake" },
        { alias_name: "渡", source_kind: "lighthouse-watch", sector: "lighthouse" },
      ]);
  });

  it("does not expose story-only tables in ordinary combat schema", async () => {
    const engine = await createEngine();
    const tables = engine.executeSelect(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
    ).rows.map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining(["residents", "identity_sources"]));

    const ordinarySchema = (await import("../src/content/sql/sqlSchema"))
      .COMPLETE_SCHEMA_LINES.join("\n");
    expect(ordinarySchema).not.toContain("residents");
    expect(ordinarySchema).not.toContain("identity_sources");
  });
});
