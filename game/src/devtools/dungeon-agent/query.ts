/**
 * Dungeon Agent 的桥内预选查询执行。
 *
 * 本模块封装开发态复现所需的固定答案与正式游戏查询规则：combat 使用当前 Session 的
 * 受限 admin 预选答案，challenge 使用开发模块内固定密文答案；两者仍必须通过身份策略、
 * SQLite 执行和 Session 判定。它不接受模型传入的 SQL，不返回 SQL/答案正文，不写存储，
 * 也不直接操作 DOM。
 *
 * `accepted` 表示真实游戏是否接受查询，而不是函数是否顺利返回。重放层必须把 rejected
 * 视为失败证据，避免把桥内异常或错误答案误判为修复通过。
 */

import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { FloorNumber } from "../../domain/progression/runGraph";
import type { GameSession } from "../../domain/session/GameSession";
import type { SqlEngine } from "../../infrastructure/sql/SqlEngine";

/** 查询结果的稳定事件标签。 */
export type DungeonAgentQueryEvent =
  | "query-accepted"
  | "query-rejected"
  | "answer-not-ready";

/** 查询执行后只向桥层返回低敏结果。 */
export interface DungeonAgentQueryResult {
  accepted: boolean;
  event: DungeonAgentQueryEvent;
}

/** 查询执行所需的当前隔离游戏依赖。 */
export interface DungeonAgentQueryContext {
  snapshot: GameSnapshot;
  session: GameSession;
  sql: SqlEngine;
}

const DUNGEON_AGENT_GATE_ANSWERS: Readonly<Record<FloorNumber, string>> = {
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
 * 执行当前 combat/challenge 的开发态预选查询。
 *
 * @param context 当前快照、Session 和 SQL 引擎；三者必须属于同一临时页面实例。
 * @returns 低敏 accepted/event 结果；查询正文永不返回。
 * @throws 不主动抛出游戏规则错误，规则拒绝会转换为 `query-rejected`。
 */
export function executeDungeonAgentQuery(
  context: DungeonAgentQueryContext,
): DungeonAgentQueryResult {
  const { snapshot, session, sql } = context;
  let accepted = false;

  if (snapshot.mode === "combat") {
    const assistedSql = snapshot.adminAnswerSql;
    if (!assistedSql) return { accepted: false, event: "answer-not-ready" };
    try {
      const policy = session.validateCombatQuery(assistedSql);
      if (!policy.ok) throw new Error("identity-policy");
      const queryResult = sql.execute(
        assistedSql,
        snapshot.floor,
        snapshot.lessonId,
      );
      const resolution = session.resolveQuery(queryResult);
      if (resolution.hpUpdates.length > 0) {
        sql.updateMonsterHp(resolution.hpUpdates);
      }
      accepted = resolution.accepted;
    } catch {
      const resolution = session.registerQueryError(
        "桥内预选查询执行失败。",
        assistedSql,
      );
      accepted = resolution.accepted;
    }
  } else if (snapshot.mode === "challenge") {
    // 密文答案只存在于开发态动态模块，并仍经过正式只读策略、SQLite 与机关判定。
    const assistedSql = DUNGEON_AGENT_GATE_ANSWERS[snapshot.floor];
    if (!assistedSql) return { accepted: false, event: "answer-not-ready" };
    try {
      const policy = session.validateGateChallengeQuery(assistedSql);
      if (!policy.ok) throw new Error("identity-policy");
      const queryResult = sql.executeSelect(assistedSql);
      const resolution = session.resolveGateChallenge(queryResult);
      accepted = resolution.accepted;
    } catch {
      const resolution = session.registerGateChallengeError(
        "桥内预选查询执行失败。",
      );
      accepted = resolution.accepted;
    }
  }

  return {
    accepted,
    event: accepted ? "query-accepted" : "query-rejected",
  };
}
