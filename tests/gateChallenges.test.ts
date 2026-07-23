import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { FLOOR_TWO_MONSTERS } from "../src/content/floor2Level";
import { evaluateGateChallenge } from "../src/content/gateChallenges";
import { INITIAL_MONSTERS } from "../src/content/mvpLevel";
import { SqlEngine } from "../src/sql/SqlEngine";

describe("high-difficulty gate challenges", () => {
  const wasmLocation = fileURLToPath(new URL(
    "../node_modules/sql.js/dist/sql-wasm.wasm",
    import.meta.url,
  ));

  it("第一层接受真实 JOIN + 聚合结果，并拒绝缺少核心结构的常量答案", async () => {
    const engine = await SqlEngine.create(
      INITIAL_MONSTERS.filter((monster) => monster.floor === 1),
      wasmLocation,
    );
    const result = engine.executeSelect(`
      SELECT
        m.id,
        m.name,
        COUNT(s.id) AS echo_count,
        SUM(s.charge) AS total_charge
      FROM monsters AS m
      JOIN monster_signals AS s ON s.monster_id = m.id
      WHERE s.channel = 'echo'
      GROUP BY m.id, m.name
      HAVING COUNT(s.id) >= 3 AND SUM(s.charge) >= 24
      ORDER BY total_charge DESC, m.id ASC
    `);

    expect(result.rows).toEqual([
      { id: 800, name: "铁胶怪", echo_count: 3, total_charge: 24 },
      { id: 900, name: "泥王", echo_count: 3, total_charge: 24 },
    ]);
    expect(evaluateGateChallenge(1, result)).toMatchObject({ accepted: true });

    const shortcut = engine.executeSelect(`
      SELECT id, name, 3 AS echo_count, 24 AS total_charge
      FROM monsters
      WHERE id IN (800, 900)
      ORDER BY id
    `);
    expect(evaluateGateChallenge(1, shortcut)).toMatchObject({
      accepted: false,
      missingFeatures: expect.arrayContaining(["join", "group-by", "having"]),
    });
  });

  it("第二层要求 LEFT JOIN、分组、HAVING、排序与 LIMIT 同时成立", async () => {
    const engine = await SqlEngine.create([...FLOOR_TWO_MONSTERS], wasmLocation);
    const result = engine.executeSelect(`
      SELECT
        r.id,
        r.name AS room_name,
        COUNT(DISTINCT m.id) AS monster_count,
        COALESCE(SUM(g.power), 0) AS total_power
      FROM rooms AS r
      LEFT JOIN monsters AS m ON m.room_id = r.id
      LEFT JOIN monster_gear AS g ON g.monster_id = m.id
      WHERE r.floor = 2
      GROUP BY r.id, r.name
      HAVING COALESCE(SUM(g.power), 0) >= 10
      ORDER BY total_power DESC, r.id ASC
      LIMIT 2
    `);

    expect(result.rows).toEqual([
      { id: 25, room_name: "丛林王庭", monster_count: 1, total_power: 38 },
      { id: 23, room_name: "古树桥", monster_count: 1, total_power: 15 },
    ]);
    expect(evaluateGateChallenge(2, result)).toMatchObject({ accepted: true });
  });

  it("第三层要求三表连接，第四层要求 CTE 聚合", async () => {
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);
    const grave = engine.executeSelect(`
      SELECT m.id, m.name, r.name AS room_name, g.power
      FROM monsters m
      INNER JOIN rooms r ON m.room_id = r.id
      INNER JOIN monster_gear g ON m.id = g.monster_id
      WHERE r.floor = 3 AND g.power >= 20
      ORDER BY g.power DESC, m.id ASC
      LIMIT 2
    `);
    expect(evaluateGateChallenge(3, grave)).toMatchObject({ accepted: true });

    const forge = engine.executeSelect(`
      WITH strong AS (
        SELECT monster_id, MAX(power) AS max_power
        FROM monster_gear
        GROUP BY monster_id
        HAVING MAX(power) >= 20
      )
      SELECT m.id, m.name, s.max_power
      FROM monsters m
      INNER JOIN strong s ON m.id = s.monster_id
      WHERE m.room_id BETWEEN 51 AND 60
      ORDER BY s.max_power DESC, m.id ASC
      LIMIT 3
    `);
    expect(evaluateGateChallenge(4, forge)).toMatchObject({ accepted: true });
  });

  it("第五、六层越级门按不可变装备 power 排名，战斗 HP 回写不改变答案", async () => {
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);
    engine.updateMonsterHp([
      { id: 28, hp: 0 },
      { id: 33, hp: 0 },
      { id: 39, hp: 0 },
      { id: 44, hp: 0 },
    ]);

    const iron = engine.executeSelect(`
      WITH ranked AS (
        SELECT
          r.sector,
          m.name,
          g.power,
          ROW_NUMBER() OVER (
            PARTITION BY r.sector
            ORDER BY g.power DESC, m.id ASC
          ) AS rn
        FROM monsters m
        INNER JOIN rooms r ON m.room_id = r.id
        INNER JOIN monster_gear g ON g.monster_id = m.id
        WHERE r.floor = 5
      )
      SELECT sector, name, power, rn
      FROM ranked
      WHERE rn = 1
      ORDER BY power DESC, sector ASC
      LIMIT 3
    `);
    expect(evaluateGateChallenge(5, iron)).toMatchObject({ accepted: true });

    const dragon = engine.executeSelect(`
      WITH ranked AS (
        SELECT
          m.id,
          m.name,
          g.power,
          ROW_NUMBER() OVER (
            PARTITION BY r.sector
            ORDER BY g.power DESC, m.id ASC
          ) AS rn
        FROM monsters m
        INNER JOIN rooms r ON m.room_id = r.id
        INNER JOIN monster_gear g ON g.monster_id = m.id
        WHERE r.floor = 6
      )
      SELECT id, name, power
      FROM ranked
      WHERE rn = 1
      ORDER BY power DESC, id ASC
      LIMIT 3
    `);
    expect(evaluateGateChallenge(6, dragon)).toMatchObject({ accepted: true });
  });
});
