/**
 * 开发态密文挑战的桥内预选答案。
 *
 * 这些 SQL 只供协议 v2 桥写入真实挑战编辑器并触发正式 SQLite 判定；不会进入玩家
 * 投影、Node Runner、日志、截图或报告。模块只会被开发态动态桥引用，生产构建必须
 * 完全裁掉本文件内容。
 */

import type { FloorNumber } from "../../domain/progression/runGraph";

/**
 * Smoke 密文输入辅助只存在于开发态动态模块。
 * 查询仍会经过真实 SQLite、身份策略和机关结果判定，不直接改变门或课程状态。
 */
const ANSWERS: Readonly<Record<FloorNumber, string>> = {
  1: `SELECT m.id, COUNT(s.id) AS echo_count, SUM(s.charge) AS total_charge
      FROM monsters m JOIN monster_signals s ON s.monster_id = m.id
      WHERE s.channel = 'echo' GROUP BY m.id
      HAVING COUNT(s.id) >= 3 AND SUM(s.charge) >= 24
      ORDER BY total_charge DESC, m.id ASC`,
  2: `SELECT r.id, r.name AS room_name, COUNT(DISTINCT m.id) AS monster_count,
        COALESCE(SUM(g.power), 0) AS total_power
      FROM rooms r LEFT JOIN monsters m ON m.room_id = r.id
      LEFT JOIN monster_gear g ON g.monster_id = m.id
      WHERE r.floor = 2 GROUP BY r.id, r.name
      HAVING COALESCE(SUM(g.power), 0) >= 10
      ORDER BY total_power DESC, r.id ASC LIMIT 2`,
  3: `SELECT m.id, r.name AS room_name, g.power
      FROM monsters m JOIN rooms r ON m.room_id = r.id
      JOIN monster_gear g ON m.id = g.monster_id
      WHERE r.floor = 3 AND g.power >= 20
      ORDER BY g.power DESC, m.id ASC LIMIT 2`,
  4: `WITH strong AS (
        SELECT monster_id, MAX(power) AS max_power FROM monster_gear
        GROUP BY monster_id HAVING MAX(power) >= 20
      ) SELECT m.id, s.max_power FROM monsters m
      JOIN strong s ON m.id = s.monster_id
      WHERE m.room_id BETWEEN 51 AND 60
      ORDER BY s.max_power DESC, m.id ASC LIMIT 3`,
  5: `WITH ranked AS (
        SELECT r.sector, m.id, g.power,
          ROW_NUMBER() OVER (PARTITION BY r.sector ORDER BY g.power DESC, m.id ASC) AS rn
        FROM monsters m JOIN rooms r ON m.room_id = r.id
        JOIN monster_gear g ON g.monster_id = m.id WHERE r.floor = 5
      ) SELECT sector, id, power, rn FROM ranked WHERE rn = 1
      ORDER BY power DESC, sector ASC LIMIT 3`,
  6: `WITH ranked AS (
        SELECT m.id, g.power,
          ROW_NUMBER() OVER (PARTITION BY r.sector ORDER BY g.power DESC, m.id ASC) AS rn
        FROM monsters m JOIN rooms r ON m.room_id = r.id
        JOIN monster_gear g ON g.monster_id = m.id WHERE r.floor = 6
      ) SELECT id, power FROM ranked WHERE rn = 1
      ORDER BY power DESC, id ASC LIMIT 3`,
  7: `WITH ranked AS (
        SELECT realm, code, score,
          ROW_NUMBER() OVER (PARTITION BY realm ORDER BY score DESC, id ASC) AS rn
        FROM index_records
      ) SELECT realm, code, score FROM ranked WHERE rn = 1
      ORDER BY score DESC LIMIT 3`,
  8: `WITH ranked AS (
        SELECT region, node, lag_ms,
          ROW_NUMBER() OVER (PARTITION BY region ORDER BY lag_ms ASC, node ASC) AS rn
        FROM replica_status WHERE role = 'replica' AND healthy = 1
      ) SELECT region, node, lag_ms FROM ranked WHERE rn = 1 ORDER BY lag_ms ASC`,
};

/**
 * 返回指定楼层的固定挑战答案。
 * @param floor 已校验的 1 至 8 层编号。
 * @returns 仅供桥内部提交的 SQL；调用方不得记录或向外投影。
 */
export function gateAnswer(floor: FloorNumber): string {
  return ANSWERS[floor];
}
