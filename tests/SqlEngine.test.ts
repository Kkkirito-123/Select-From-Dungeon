import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { INITIAL_MONSTERS, LESSONS } from "../src/content/mvpLevel";
import { FLOOR_FIVE_LESSON_DEFINITIONS } from "../src/content/floor5Level";
import { FLOOR_SIX_LESSON_DEFINITIONS } from "../src/content/floor6Level";
import { FLOOR_SEVEN_LESSON_DEFINITIONS } from "../src/content/floor7Level";
import { FLOOR_EIGHT_LESSON_DEFINITIONS } from "../src/content/floor8Level";
import { evaluateLesson } from "../src/domain/lessonEvaluator";
import type { FloorNumber } from "../src/domain/runGraph";
import { SqlEngine } from "../src/sql/SqlEngine";

describe("SqlEngine floor-two schema", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8] as const)(
    "第 %i 层独立数据库可执行该层全部课程标准答案",
    async (floor) => {
      const wasmLocation = fileURLToPath(new URL(
        "../node_modules/sql.js/dist/sql-wasm.wasm",
        import.meta.url,
      ));
      const floorMonsters = INITIAL_MONSTERS.filter(
        (monster) => monster.floor === floor,
      );
      const monsterIds = new Set(floorMonsters.map((monster) => monster.id));
      const floorLessons = LESSONS.filter(
        (lesson) => monsterIds.has(lesson.primaryMonsterId),
      );
      const engine = await SqlEngine.create([...floorMonsters], wasmLocation);

      expect(floorLessons.length, `第 ${floor} 层课程不能为空`).toBeGreaterThan(0);
      for (const lesson of floorLessons) {
        lesson.stages.forEach((stage, stageIndex) => {
          const result = engine.execute(stage.answerSql, floor as FloorNumber);
          const evaluation = evaluateLesson(lesson.id, stageIndex, result);
          expect(
            evaluation.accepted,
            `第 ${floor} 层 ${lesson.id}/${stage.id}: ${evaluation.message}; ${
              JSON.stringify(result.rows)
            }`,
          ).toBe(true);
        });
      }
    },
  );

  it("真实 SQLite 可以执行第二层五组课程查询并通过语义判定", async () => {
    const wasmLocation = fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    ));
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);
    const queries = [
      ["order-by", 0, "SELECT channel FROM monster_signals WHERE monster_id = 10 ORDER BY charge DESC LIMIT 1"],
      ["distinct", 0, "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 11 ORDER BY channel"],
      ["inner-join", 0, "SELECT m.id, r.sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 12"],
      ["left-join", 0, "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 24 AND g.monster_id IS NULL"],
      ["join-boss", 0, "SELECT r.sector, COUNT(*) AS total FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE r.floor = 2 GROUP BY r.sector HAVING COUNT(*) >= 3 ORDER BY total DESC, r.sector ASC"],
      ["join-boss", 1, "SELECT m.name, g.power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 14 ORDER BY g.power DESC LIMIT 1"],
    ] as const;

    queries.forEach(([lessonId, stageIndex, sql]) => {
      const result = engine.executeSelect(sql);
      expect(
        evaluateLesson(lessonId, stageIndex, result),
        `${lessonId} stage ${stageIndex}`,
      ).toMatchObject({ accepted: true });
    });
  });

  it("真实 SQLite 可以执行第三、四层高级查询并通过语义判定", async () => {
    const wasmLocation = fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    ));
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);
    const queries = [
      ["f3-inner", 0, "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 23"],
      ["f3-left", 0, "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 42 AND g.monster_id IS NULL"],
      ["f3-self", 0, "SELECT child.name AS child_name, master.name AS master_name FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 25"],
      ["f3-chain", 0, "SELECT r.name AS room_name, m.name, g.power FROM rooms r INNER JOIN monsters m ON r.id = m.room_id INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 26"],
      ["f3-union", 0, "SELECT id, name FROM monsters WHERE room_id = 41 UNION SELECT id, name FROM monsters WHERE room_id = 43 ORDER BY id"],
      ["f3-audit", 0, "SELECT r.sector, COUNT(*) AS total FROM rooms r INNER JOIN monsters m ON r.id = m.room_id WHERE r.floor = 3 AND m.room_id BETWEEN 41 AND 46 GROUP BY r.sector HAVING COUNT(*) >= 2 ORDER BY r.sector"],
      ["f3-audit", 1, "SELECT m.name, g.power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id BETWEEN 41 AND 46 ORDER BY g.power DESC LIMIT 1"],
      ["f4-scalar", 0, "SELECT name FROM monsters WHERE id = (SELECT MIN(id) FROM monsters WHERE room_id = 51)"],
      ["f4-in", 0, "SELECT name FROM monsters WHERE room_id IN (SELECT id FROM rooms WHERE floor = 4 AND sector = 'frost') ORDER BY name"],
      ["f4-exists", 0, "SELECT m.name FROM monsters m WHERE m.id = 36 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id)"],
      ["f4-correlated", 0, "SELECT m.name FROM monsters m WHERE m.id = 37 AND (SELECT MAX(g.power) FROM monster_gear g WHERE g.monster_id = m.id) >= 18"],
      ["f4-cte", 0, "WITH armored AS (SELECT monster_id FROM monster_gear WHERE power >= 20) SELECT m.name FROM monsters m INNER JOIN armored a ON m.id = a.monster_id WHERE m.id = 38"],
      ["f4-recursive", 0, "WITH RECURSIVE room_ids(id) AS (SELECT 51 UNION ALL SELECT id + 1 FROM room_ids WHERE id < 53) SELECT r.name AS room_name FROM rooms r INNER JOIN room_ids x ON r.id = x.id ORDER BY r.id"],
      ["f4-recursive", 1, "WITH RECURSIVE lineage(id, name, master_id, depth) AS (SELECT id, name, master_id, 1 FROM monsters WHERE id = 34 UNION ALL SELECT m.id, m.name, m.master_id, l.depth + 1 FROM monsters m INNER JOIN lineage l ON m.id = l.master_id WHERE l.depth < 3) SELECT name, depth FROM lineage ORDER BY depth"],
    ] as const;

    queries.forEach(([lessonId, stageIndex, sql]) => {
      expect(
        evaluateLesson(lessonId, stageIndex, engine.executeSelect(sql)),
        `${lessonId} stage ${stageIndex}`,
      ).toMatchObject({ accepted: true });
    });
  });

  it("第五层窗口查询在真实 HP 回写后仍稳定，第六层脚本使用一次性沙箱", async () => {
    const wasmLocation = fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    ));
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);

    for (const lesson of FLOOR_FIVE_LESSON_DEFINITIONS) {
      lesson.stages.forEach((stage, stageIndex) => {
        const result = engine.execute(stage.answerSql, 5);
        const evaluation = evaluateLesson(lesson.id, stageIndex, result);
        expect(
          evaluation.accepted,
          `${lesson.id} stage ${stageIndex}: ${evaluation.message}`,
        ).toBe(true);
        engine.updateMonsterHp(stage.attackTargetIds.map((id) => ({ id, hp: 0 })));
      });
    }

    for (const lesson of FLOOR_SIX_LESSON_DEFINITIONS) {
      lesson.stages.forEach((stage, stageIndex) => {
        const result = engine.execute(stage.answerSql, 6);
        const evaluation = evaluateLesson(lesson.id, stageIndex, result);
        expect(
          evaluation.accepted,
          `${lesson.id} stage ${stageIndex}: ${evaluation.message}; ${JSON.stringify(result)}`,
        ).toBe(true);
      });
    }
  });

  it("第六层每次执行都从同一份初始 repair_queue 开始", async () => {
    const wasmLocation = fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    ));
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);
    const inserted = engine.execute(
      "INSERT INTO repair_queue(id, item, quantity, status) VALUES (6, 'claw', 2, 'ready');",
      6,
    );
    expect(inserted.rows.some((row) => row.id === 6)).toBe(true);

    const fresh = engine.execute(
      "SELECT id, item, quantity, status FROM repair_queue ORDER BY id;",
      6,
    );
    expect(fresh.rows).toHaveLength(5);
    expect(fresh.rows.some((row) => row.id === 6)).toBe(false);
    expect(fresh.plan).toContain("DISCARD sandbox after this turn");
  });

  it("第七层使用真实 SQLite 查询计划，第八层五阶段事故夹具均可复现", async () => {
    const wasmLocation = fileURLToPath(new URL(
      "../node_modules/sql.js/dist/sql-wasm.wasm",
      import.meta.url,
    ));
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);

    for (const lesson of FLOOR_SEVEN_LESSON_DEFINITIONS) {
      lesson.stages.forEach((stage, stageIndex) => {
        const result = engine.execute(stage.answerSql, 7);
        const evaluation = evaluateLesson(lesson.id, stageIndex, result);
        expect(
          evaluation.accepted,
          `${lesson.id} stage ${stageIndex}: ${evaluation.message}; ${result.plan.join(" | ")}`,
        ).toBe(true);
        expect(result.plan.length).toBeGreaterThan(0);
      });
    }

    for (const lesson of FLOOR_EIGHT_LESSON_DEFINITIONS) {
      lesson.stages.forEach((stage, stageIndex) => {
        const result = engine.execute(stage.answerSql, 8);
        const evaluation = evaluateLesson(lesson.id, stageIndex, result);
        expect(
          evaluation.accepted,
          `${lesson.id} stage ${stageIndex}: ${evaluation.message}; ${JSON.stringify(result.rows)}`,
        ).toBe(true);
      });
    }

    const finalBoss = FLOOR_EIGHT_LESSON_DEFINITIONS.find(
      (lesson) => lesson.id === "f8-security",
    );
    expect(finalBoss?.stages).toHaveLength(5);
  });
});
