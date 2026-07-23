import { describe, expect, it } from "vitest";
import { GameSession, experienceForRank } from "../src/domain/GameSession";
import { detectQueryFeatures } from "../src/domain/lessonEvaluator";
import { isSavedRun } from "../src/storage/localProgress";
import type { GroundItem, LessonId, SqlQueryResult } from "../src/domain/types";

function result(
  sql: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  targetIds: number[] = [],
): SqlQueryResult {
  return {
    sql,
    columns,
    rows,
    targetIds,
    plan: ["SEARCH teaching fixture"],
    baseHeat: 3,
    features: detectQueryFeatures(sql),
  };
}

const SELECT_NAME = result(
  "SELECT name FROM monsters WHERE id = 101",
  ["name"],
  [{ name: "投影史莱姆 · 青页" }],
);
const SELECT_WEAKNESS = result(
  "SELECT weakness FROM monsters WHERE id = 101",
  ["weakness"],
  [{ weakness: "slash" }],
);
const WHERE_TARGET = result(
  "SELECT id FROM monsters WHERE room_id = 2 AND status = 'escaped'",
  ["id"],
  [{ id: 201 }],
  [201],
);
const WHERE_WEAKNESS = result(
  "SELECT weakness FROM monsters WHERE name = '条件猎犬 · 逐行' AND status = 'escaped'",
  ["weakness"],
  [{ weakness: "focus" }],
);
const NULL_TARGET = result(
  "SELECT id FROM monsters WHERE room_id = 3 AND master_id IS NULL",
  ["id"],
  [{ id: 301 }],
  [301],
);
const NULL_NAME = result(
  "SELECT name FROM monsters WHERE master_id IS NULL AND status = 'cursed'",
  ["name"],
  [{ name: "NULL 幽灵 · 无主者" }],
);
const GROUP_RESULT = result(
  "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 800 GROUP BY channel",
  ["channel", "total"],
  [
    { channel: "echo", total: 3 },
    { channel: "noise", total: 1 },
  ],
);
const HAVING_SHIELD = result(
  "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 900 GROUP BY channel HAVING COUNT(*) >= 2",
  ["channel", "total"],
  [
    { channel: "echo", total: 3 },
    { channel: "ward", total: 2 },
  ],
);
const HAVING_CORE = result(
  "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 900 GROUP BY channel HAVING COUNT(*) >= 3",
  ["channel", "total"],
  [{ channel: "echo", total: 3 }],
);

function roomIdForLesson(session: GameSession, lessonId: LessonId): string {
  const room = session.snapshot().roomGraph.nodes.find((node) => node.lessonId === lessonId);
  if (!room) throw new Error(`缺少课程房：${lessonId}`);
  return room.id;
}

function enterLesson(session: GameSession, lessonId: LessonId): void {
  const roomId = roomIdForLesson(session, lessonId);
  expect(session.travelToRoom(roomId).ok).toBe(true);
  const actor = session.snapshot().worldActors.find((entry) => entry.roomNodeId === roomId);
  if (!actor) throw new Error(`缺少课程怪物：${lessonId}`);
  expect(session.setPlayerPosition(actor.x, actor.y)).toBe(true);
  expect(session.snapshot().mode).toBe("combat");
  expect(session.snapshot().lessonId).toBe(lessonId);
}

function collectTouchItem(
  session: GameSession,
  predicate: (item: GroundItem) => boolean,
): GroundItem {
  const snapshot = session.snapshot();
  const item = snapshot.groundItems.find(predicate);
  if (!item) throw new Error("缺少预期的地面掉落");
  const directions = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ];
  const approach = directions
    .map((direction) => ({
      x: item.x + direction.x,
      y: item.y + direction.y,
      moveX: -direction.x,
      moveY: -direction.y,
    }))
    .find((candidate) => snapshot.mazeFloor.tiles[candidate.y]?.[candidate.x] === "#"
      ? false
      : !snapshot.worldActors.some((actor) => {
          const monster = snapshot.monsters.find((entry) => entry.id === actor.monsterId);
          return monster && monster.hp > 0 && actor.x === candidate.x && actor.y === candidate.y;
        }));
  if (!approach) throw new Error(`掉落 ${item.id} 周围没有可用格`);
  expect(session.setPlayerPosition(approach.x, approach.y)).toBe(true);
  const resolution = session.attemptPlayerMove(approach.moveX, approach.moveY);
  expect(resolution.ok).toBe(true);
  expect(resolution.pickedItemIds).toContain(item.id);
  return item;
}

function clearSelect(session: GameSession): void {
  enterLesson(session, "select");
  const first = session.resolveQuery(SELECT_NAME);
  expect(first.accepted).toBe(true);
  expect(first.lessonCompleted).toBeNull();
  expect(session.snapshot().lessonStageId).toBe("select-weakness");
  expect(session.snapshot().monsters.find((monster) => monster.id === 101)?.hp).toBe(6);

  const second = session.resolveQuery(SELECT_WEAKNESS);
  expect(second.lessonCompleted).toBe("select");
  expect(session.snapshot().mode).toBe("explore");
  collectTouchItem(session, (item) => item.id === "lesson-drop:select");
  expect(session.snapshot().player.weapon.id).toBe("filter-bow");
}

function clearBranch(session: GameSession, lessonId: "where" | "is-null"): void {
  enterLesson(session, lessonId);
  if (lessonId === "where") {
    expect(session.resolveQuery(WHERE_TARGET).accepted).toBe(true);
    expect(session.resolveQuery(WHERE_WEAKNESS).lessonCompleted).toBe("where");
  } else {
    expect(session.resolveQuery(NULL_TARGET).accepted).toBe(true);
    expect(session.resolveQuery(NULL_NAME).lessonCompleted).toBe("is-null");
    collectTouchItem(session, (item) => item.id === "lesson-drop:is-null");
    expect(session.snapshot().player.weapon.id).toBe("null-lantern");
  }
}

function returnToHub(session: GameSession): void {
  expect(session.travelToRoom(roomIdForLesson(session, "select")).ok).toBe(true);
}

function clearBothBranches(
  session: GameSession,
  order: readonly ["where" | "is-null", "where" | "is-null"],
): void {
  clearSelect(session);
  clearBranch(session, order[0]);
  returnToHub(session);
  clearBranch(session, order[1]);
  returnToHub(session);
}

describe("GameSession SQL 魔王城 Run", () => {
  it("玩家以两颗心开始，并按总经验 2/4/6/8 升级", () => {
    expect(["normal", "elite", "boss"].map((rank) => (
      experienceForRank(rank as "normal" | "elite" | "boss")
    ))).toEqual([1, 3, 5]);
    const session = new GameSession(null, null, "level-hearts");
    expect(session.snapshot().player).toMatchObject({ hp: 2, maxHp: 2, level: 1, xp: 0 });
    clearSelect(session);
    expect(session.snapshot().player).toMatchObject({ level: 1, xp: 1, maxHp: 2 });
    clearBranch(session, "where");
    expect(session.snapshot().player).toMatchObject({ level: 2, xp: 2, maxHp: 3 });
  });

  it("同一 seed 生成相同路线，入口只开放 SELECT 教学房", () => {
    const first = new GameSession(null, null, "same-seed");
    const second = new GameSession(null, null, "same-seed");
    expect(first.snapshot().roomGraph).toEqual(second.snapshot().roomGraph);
    expect(first.snapshot().availableRoomIds).toEqual([
      first.snapshot().roomGraph.entryId,
      roomIdForLesson(first, "select"),
    ]);
  });

  it("普通怪必须完成两条不同任务，不再被一次查询秒杀", () => {
    const session = new GameSession(null, null, "two-stage");
    clearSelect(session);
    expect(session.snapshot().completedLessons).toContain("select");
    expect(session.snapshot().profile.masteredLessons).toContain("select");
    expect(session.snapshot().monsters.find((monster) => monster.id === 101)?.hp).toBe(0);
  });

  it("靠近怪物不会隔空开战，只有尝试进入怪物所在格才触发遭遇", () => {
    const session = new GameSession(null, null, "touch-encounter");
    const roomId = roomIdForLesson(session, "select");
    expect(session.travelToRoom(roomId).ok).toBe(true);
    const actor = session.snapshot().worldActors.find((entry) => entry.roomNodeId === roomId);
    if (!actor) throw new Error("缺少 SELECT 怪物");
    const approach = [
      { x: actor.x - 1, y: actor.y, dx: 1, dy: 0 },
      { x: actor.x + 1, y: actor.y, dx: -1, dy: 0 },
      { x: actor.x, y: actor.y - 1, dx: 0, dy: 1 },
      { x: actor.x, y: actor.y + 1, dx: 0, dy: -1 },
    ].find((cell) => session.snapshot().mazeFloor.tiles[cell.y]?.[cell.x] === ".");
    if (!approach) throw new Error("怪物周围没有可站立格");
    expect(session.setPlayerPosition(approach.x, approach.y)).toBe(true);
    expect(session.snapshot().mode).toBe("explore");

    const collision = session.attemptPlayerMove(approach.dx, approach.dy);
    expect(collision).toMatchObject({ moved: false, encounterId: 101, blockedBy: "none" });
    expect(session.snapshot().mode).toBe("combat");
    expect(session.snapshot().combat?.targetId).toBe(101);
  });

  it("WHERE 与 IS NULL 两种顺序都能完成且不会锁死 GROUP BY 路线", () => {
    for (const order of [
      ["where", "is-null"],
      ["is-null", "where"],
    ] as const) {
      const session = new GameSession(null, null, `order-${order.join("-")}`);
      clearBothBranches(session, order);
      const aggregateGate = session.snapshot().roomGraph.nodes.find(
        (node) => node.reward === "aggregate-hammer",
      );
      expect(aggregateGate).toBeDefined();
      expect(session.snapshot().availableRoomIds).toContain(aggregateGate?.id);
    }
  });

  it("关键聚合战锤是固定房间奖励，领取后才能进入精英与 Boss 路线", () => {
    const session = new GameSession(null, null, "hammer-route");
    clearBothBranches(session, ["where", "is-null"]);
    const hammerShrine = session.snapshot().roomGraph.nodes.find(
      (node) => node.reward === "aggregate-hammer",
    );
    const groupRoomId = roomIdForLesson(session, "group-by");
    const groupGate = session.snapshot().mazeFloor.gates.find(
      (gate) => gate.roomNodeId === groupRoomId,
    );
    if (!hammerShrine || !groupGate) throw new Error("缺少聚合战锤房或 GROUP BY 物理门");

    expect(session.snapshot().availableRoomIds).not.toContain(groupRoomId);
    expect(session.travelToRoom(groupRoomId)).toMatchObject({
      ok: false,
      message: expect.stringContaining("聚合战锤"),
    });
    expect(session.setPlayerPosition(groupGate.outside.x, groupGate.outside.y)).toBe(true);
    expect(session.attemptPlayerMove(
      groupGate.x - groupGate.outside.x,
      groupGate.y - groupGate.outside.y,
    )).toMatchObject({
      ok: false,
      moved: false,
      blockedBy: "gate",
      message: expect.stringContaining("聚合战锤"),
    });

    expect(session.travelToRoom(hammerShrine.id).ok).toBe(true);
    expect(session.interact()).toMatchObject({
      kind: "reward",
      message: expect.stringMatching(/伤害 \d+ → 12 · 热量减免 \d+ → 2/),
    });
    expect(session.snapshot().player.weapon.id).toBe("aggregate-hammer");
    expect(session.snapshot().completedRoomIds).toContain(hammerShrine.id);
    expect(session.snapshot().availableRoomIds).toContain(groupRoomId);

    expect(session.setPlayerPosition(groupGate.outside.x, groupGate.outside.y)).toBe(true);
    expect(session.attemptPlayerMove(
      groupGate.x - groupGate.outside.x,
      groupGate.y - groupGate.outside.y,
    )).toMatchObject({ ok: true, moved: true, blockedBy: "none" });
    expect(session.travelToRoom(groupRoomId).ok).toBe(true);
  });

  it("GROUP BY 精英与两阶段 HAVING 魔王会启动自动第二层传送", () => {
    const session = new GameSession(null, null, "full-run");
    clearBothBranches(session, ["is-null", "where"]);
    const gate = session.snapshot().roomGraph.nodes.find((node) => node.reward === "aggregate-hammer");
    if (!gate) throw new Error("缺少聚合战锤房");
    session.travelToRoom(gate.id);
    session.interact();

    enterLesson(session, "group-by");
    expect(session.resolveQuery(GROUP_RESULT).lessonCompleted).toBe("group-by");
    expect(session.snapshot().mode).toBe("explore");
    collectTouchItem(session, (item) => item.id === "lesson-drop:group-by");

    enterLesson(session, "having");
    expect(session.resolveQuery(HAVING_SHIELD).accepted).toBe(true);
    expect(session.snapshot().lessonStageId).toBe("having-core");
    expect(session.snapshot().monsters.find((monster) => monster.id === 900)?.hp).toBe(12);
    expect(session.resolveQuery(HAVING_CORE).lessonCompleted).toBe("having");
    expect(session.snapshot().mode).toBe("explore");
    collectTouchItem(session, (item) => item.id === "lesson-drop:having");
    expect(session.snapshot()).toMatchObject({
      mode: "transition",
      floor: 1,
      interactionPrompt: expect.stringContaining("自动进入第二层"),
    });
    expect(session.toProfile().victories).toBe(0);

    const beforePortal = session.snapshot();
    expect(session.advanceFloor()).toBe(true);
    expect(session.snapshot()).toMatchObject({
      mode: "explore",
      floor: 2,
      runSeed: expect.stringContaining(":floor-2"),
      player: {
        level: beforePortal.player.level,
        xp: beforePortal.player.xp,
        weapon: beforePortal.player.weapon,
      },
    });
    expect(session.snapshot().roomGraph.nodes.some((node) => node.lessonId === "order-by")).toBe(true);
    const floorTwoSave = session.toSavedRun();
    expect(isSavedRun(floorTwoSave)).toBe(true);
    expect(new GameSession(floorTwoSave).snapshot()).toMatchObject({
      floor: 2,
      runSeed: floorTwoSave.graph.seed,
      player: floorTwoSave.player,
    });
    expect(session.advanceFloor()).toBe(false);
  });

  it("错误结果和语法错误各只结算一次确定性反击", () => {
    const session = new GameSession(null, null, "counter");
    enterLesson(session, "select");
    const wrong = result(
      "SELECT name FROM monsters",
      ["name"],
      [{ name: "投影史莱姆 · 青页" }, { name: "条件猎犬 · 逐行" }],
    );
    expect(session.resolveQuery(wrong).playerDamage).toBe(1);
    expect(session.snapshot().player.hp).toBe(1);
    expect(session.registerQueryError("near FROM：语法错误").playerDamage).toBe(1);
    expect(session.snapshot().player.hp).toBe(0);
    expect(session.toProfile().attempts.select).toBe(2);
  });

  it("Run 存档恢复同一张图，重开只清局内状态而保留永久图鉴", () => {
    const session = new GameSession(null, null, "save-run");
    clearSelect(session);
    const staleProfile = session.toProfile();
    staleProfile.masteredLessons = [];
    const restored = new GameSession(session.toSavedRun(), staleProfile, "ignored-seed");
    expect(restored.snapshot().runSeed).toBe("save-run");
    expect(restored.snapshot().roomGraph).toEqual(session.snapshot().roomGraph);
    expect(restored.snapshot().player.weapon.id).toBe("filter-bow");
    expect(restored.toProfile().masteredLessons).toContain("select");
    expect(restored.toSavedRun()).toMatchObject({ version: 4, generatorVersion: 4, floor: 1 });

    restored.reset("new-run");
    expect(restored.snapshot().runSeed).toBe("new-run");
    expect(restored.snapshot().player.weapon.id).toBe("data-blade");
    expect(restored.snapshot().completedLessons).toEqual([]);
    expect(restored.snapshot().profile.masteredLessons).toContain("select");
  });

  it("v4 存档中的越界巡逻怪会回到房间中心，而不是继续堵门", () => {
    const session = new GameSession(null, null, "actor-gate-recovery");
    const saved = session.toSavedRun();
    const actor = saved.worldActors.find((entry) => entry.behavior !== "anchored");
    const gate = actor
      ? saved.mazeFloor.gates.find((entry) => entry.roomNodeId === actor.roomNodeId)
      : undefined;
    if (!actor || !gate) throw new Error("缺少可巡逻怪物或房门");
    actor.x = gate.x;
    actor.y = gate.y;

    const restoredActor = new GameSession(saved).snapshot().worldActors.find(
      (entry) => entry.monsterId === actor.monsterId,
    );
    expect(restoredActor).toMatchObject(actor.home);
  });
});
