import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { INITIAL_MONSTERS } from "../src/content/mvpLevel";
import { evaluateLesson } from "../src/domain/lessonEvaluator";
import { SqlEngine } from "../src/sql/SqlEngine";

describe("SqlEngine floor-two schema", () => {
  it("真实 SQLite 可以执行第二层五组课程查询并通过语义判定", async () => {
    const wasmLocation = fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    ));
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);
    const queries = [
      ["order-by", 0, "SELECT channel FROM monster_signals WHERE monster_id = 1200 ORDER BY charge DESC LIMIT 1"],
      ["distinct", 0, "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 1300 ORDER BY channel"],
      ["inner-join", 0, "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 1400"],
      ["left-join", 0, "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 24 AND g.monster_id IS NULL"],
      ["join-boss", 0, "SELECT r.sector, COUNT(*) AS total FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE r.floor = 2 GROUP BY r.sector HAVING COUNT(*) >= 2 ORDER BY total DESC"],
      ["join-boss", 1, "SELECT m.name, g.power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 1900 ORDER BY g.power DESC LIMIT 1"],
    ] as const;

    queries.forEach(([lessonId, stageIndex, sql]) => {
      const result = engine.executeSelect(sql);
      expect(
        evaluateLesson(lessonId, stageIndex, result),
        `${lessonId} stage ${stageIndex}`,
      ).toMatchObject({ accepted: true });
    });
  });
});
