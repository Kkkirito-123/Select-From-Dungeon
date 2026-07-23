import { describe, expect, it } from "vitest";
import { GameSession, experienceForRank } from "../src/domain/GameSession";
import { safeZoneCellKeys } from "../src/domain/campfire";
import { detectQueryFeatures } from "../src/domain/lessonEvaluator";
import { isSavedRun } from "../src/storage/localProgress";
import type {
  LessonId,
  LootItem,
  SqlQueryResult,
  TurnResolution,
} from "../src/domain/types";

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
  [{ name: "史莱姆" }],
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
  "SELECT weakness FROM monsters WHERE name = '水胶怪' AND status = 'escaped'",
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
  [{ name: "毒胶怪" }],
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
const ORDER_PEAK = result(
  "SELECT channel FROM monster_signals WHERE monster_id = 1200 ORDER BY charge DESC LIMIT 1",
  ["channel"],
  [{ channel: "surge" }],
);
const ORDER_TOP_TWO = result(
  "SELECT channel, charge FROM monster_signals WHERE monster_id = 1200 ORDER BY charge DESC LIMIT 2",
  ["channel", "charge"],
  [
    { channel: "surge", charge: 13 },
    { channel: "arc", charge: 11 },
  ],
);
const LAKE_BOSS_SCAN = result(
  "SELECT name, status FROM monsters WHERE id = 1810",
  ["name", "status"],
  [{ name: "湖怪", status: "submerged" }],
);
const LAKE_BOSS_SORT = result(
  "SELECT DISTINCT status FROM monsters WHERE id = 1810 ORDER BY status",
  ["status"],
  [{ status: "submerged" }],
);
const WRONG_SELECT_NAME = result(
  "SELECT name FROM monsters",
  ["name"],
  [{ name: "史莱姆" }, { name: "猎犬" }],
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

function collectLootItem(
  session: GameSession,
  itemId: string,
  preferredAction: "store" | "equip" | "claim" = "equip",
): LootItem {
  const snapshot = session.snapshot();
  const bundle = snapshot.lootBundles.find((entry) => (
    entry.items.some((item) => item.itemId === itemId)
  ));
  const item = bundle?.items.find((entry) => entry.itemId === itemId);
  if (!bundle || !item) throw new Error(`缺少预期战利品：${itemId}`);
  expect(session.setPlayerPosition(bundle.x, bundle.y)).toBe(true);
  expect(session.interact()).toMatchObject({ ok: true, kind: "loot-bundle" });
  if (item.rewardId === "floor-key") {
    expect(session.takeAllLoot(bundle.id).ok).toBe(true);
  } else {
    const action = item.kind === "weapon" || item.kind === "armor"
      ? preferredAction
      : "claim";
    expect(session.takeLootItem(bundle.id, item.dropId, action).ok).toBe(true);
    if (session.snapshot().mode === "loot") {
      session.takeAllLoot(bundle.id);
      if (session.snapshot().mode === "loot") session.closeLootBundle();
    }
  }
  return item;
}

function clearSelect(session: GameSession): TurnResolution {
  enterLesson(session, "select");
  const first = session.resolveQuery(SELECT_NAME);
  expect(first.accepted).toBe(true);
  expect(first.lessonCompleted).toBeNull();
  expect(session.snapshot().lessonStageId).toBe("select-weakness");
  expect(session.snapshot().monsters.find((monster) => monster.id === 101)?.hp).toBe(6);

  const second = session.resolveQuery(SELECT_WEAKNESS);
  expect(second.lessonCompleted).toBe("select");
  expect(second.experience).toMatchObject({
    monsterId: 101,
    gained: 1,
    previousXp: 0,
    currentXp: 1,
    previousLevel: 1,
    currentLevel: 1,
  });
  expect(session.snapshot().mode).toBe("explore");
  expect(session.snapshot().lootBundles.some(
    (bundle) => bundle.items.some((item) => item.itemId === "filter-bow"),
  )).toBe(true);
  collectLootItem(session, "filter-bow");
  expect(session.snapshot().player.weapon.id).toBe("filter-bow");
  return second;
}

function clearBranch(
  session: GameSession,
  lessonId: "where" | "is-null",
): TurnResolution {
  enterLesson(session, lessonId);
  if (lessonId === "where") {
    expect(session.resolveQuery(WHERE_TARGET).accepted).toBe(true);
    const completed = session.resolveQuery(WHERE_WEAKNESS);
    expect(completed.lessonCompleted).toBe("where");
    return completed;
  } else {
    expect(session.resolveQuery(NULL_TARGET).accepted).toBe(true);
    const completed = session.resolveQuery(NULL_NAME);
    expect(completed.lessonCompleted).toBe("is-null");
    collectLootItem(session, "null-lantern");
    expect(session.snapshot().player.weapon.id).toBe("null-lantern");
    return completed;
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
    const levelUp = clearBranch(session, "where");
    expect(levelUp.experience).toMatchObject({
      gained: 1,
      previousXp: 1,
      currentXp: 2,
      previousLevel: 1,
      currentLevel: 2,
      previousMaxHp: 2,
      currentMaxHp: 3,
    });
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
  }, 15_000);

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
    const groupBundle = session.snapshot().lootBundles.find(
      (bundle) => bundle.sourceMonsterId === 800,
    );
    const groupItem = groupBundle?.items[0];
    if (!groupItem) throw new Error("GROUP BY 精英没有生成战利品包");
    collectLootItem(
      session,
      groupItem.itemId,
      groupItem.kind === "weapon" || groupItem.kind === "armor" ? "equip" : "claim",
    );

    enterLesson(session, "having");
    expect(session.resolveQuery(HAVING_SHIELD).accepted).toBe(true);
    expect(session.snapshot().lessonStageId).toBe("having-core");
    expect(session.snapshot().monsters.find((monster) => monster.id === 900)?.hp).toBe(12);
    expect(session.resolveQuery(HAVING_CORE).lessonCompleted).toBe("having");
    expect(session.snapshot().mode).toBe("explore");
    collectLootItem(session, "floor-key", "claim");
    expect(session.snapshot()).toMatchObject({
      mode: "transition",
      floor: 1,
      interactionPrompt: expect.stringContaining("自动进入第 2 层"),
    });
    expect(session.toProfile().victories).toBe(0);

    const beforePortal = session.snapshot();
    expect(beforePortal.floorReview.length).toBeGreaterThan(0);
    expect(session.advanceFloor()).toBe(true);
    expect(session.snapshot()).toMatchObject({
      mode: "explore",
      floor: 2,
      campaign: {
        currentFloor: 2,
        status: "active",
      },
      runSeed: expect.stringContaining(":floor-2"),
      player: {
        level: beforePortal.player.level,
        xp: beforePortal.player.xp,
        weapon: beforePortal.player.weapon,
      },
    });
    expect(session.snapshot().floorReview).toEqual([]);
    expect(session.snapshot().battleReview).toEqual(beforePortal.battleReview);
    expect(session.snapshot().roomGraph.nodes.some((node) => node.lessonId === "order-by")).toBe(true);
    expect(session.snapshot().biomePlan.regions.map((region) => region.name)).toEqual([
      "月影湖泊",
      "毒雾泥沼",
      "古树森林",
    ]);
    expect(session.snapshot().worldActors.filter(
      (actor) => actor.monsterId === 1810 || actor.monsterId === 1911,
    )).toHaveLength(2);
    const floorTwoSave = session.toSavedRun();
    expect(isSavedRun(floorTwoSave)).toBe(true);
    expect(new GameSession(floorTwoSave).snapshot()).toMatchObject({
      floor: 2,
      campaign: { currentFloor: 2 },
      runSeed: floorTwoSave.graph.seed,
      player: floorTwoSave.player,
    });

    enterLesson(session, "order-by");
    expect(session.resolveQuery(ORDER_PEAK).accepted).toBe(true);
    expect(session.resolveQuery(ORDER_TOP_TWO).lessonCompleted).toBe("order-by");
    const areaBoss = session.snapshot().worldActors.find((actor) => actor.monsterId === 1810);
    if (!areaBoss) throw new Error("第二层缺少湖怪区域首领");
    expect(session.setPlayerPosition(areaBoss.x, areaBoss.y)).toBe(true);
    expect(session.snapshot()).toMatchObject({
      mode: "combat",
      focusMonsterId: 1810,
      lessonStageId: "lake-boss-scan",
    });
    expect(session.resolveQuery(LAKE_BOSS_SCAN)).toMatchObject({
      accepted: true,
      lessonCompleted: null,
      mode: "combat",
    });
    const areaVictory = session.resolveQuery(LAKE_BOSS_SORT);
    expect(areaVictory).toMatchObject({
      accepted: true,
      lessonCompleted: null,
      mode: "explore",
      experience: {
        monsterId: 1810,
        gained: 3,
      },
    });
    expect(session.snapshot().completedLessons).toEqual(["order-by"]);
    expect(session.snapshot().lootBundles.find(
      (bundle) => bundle.sourceMonsterId === 1810,
    )?.items.length).toBeGreaterThanOrEqual(2);
    expect(session.advanceFloor()).toBe(false);
  });

  it("旧 v9 存档缺少生态怪物时会按同一 seed 补全，而不会重置进度", () => {
    const session = new GameSession(null, null, "legacy-biome-v9");
    const saved = session.toSavedRun();
    const legacyMonsterIds = new Set([101, 201, 301, 800, 900, 111, 211, 311]);
    const legacy = {
      ...saved,
      monsters: saved.monsters
        .filter((monster) => legacyMonsterIds.has(monster.id))
        .map((monster) => monster.id === 201 ? { ...monster, name: "猎犬" } : monster),
      worldActors: saved.worldActors.filter((actor) => legacyMonsterIds.has(actor.monsterId)),
    };
    expect(isSavedRun(legacy)).toBe(true);

    const restored = new GameSession(legacy).snapshot();
    expect(restored.runSeed).toBe(saved.graph.seed);
    expect(restored.monsters.map((monster) => monster.id).sort((a, b) => a - b))
      .toEqual(saved.monsters.map((monster) => monster.id).sort((a, b) => a - b));
    expect(restored.monsters.find((monster) => monster.id === 201)?.name).toBe("水胶怪");
    expect(restored.biomePlan).toEqual(session.snapshot().biomePlan);
    expect(restored.player).toEqual(saved.player);
  });

  it("错误结果和语法错误各只结算一次确定性反击", () => {
    const session = new GameSession(null, null, "counter");
    enterLesson(session, "select");
    expect(session.requestHint()).toContain("SELECT");
    const wrong = result(
      "SELECT name FROM monsters",
      ["name"],
      [{ name: "史莱姆" }, { name: "猎犬" }],
    );
    expect(session.resolveQuery(wrong).playerDamage).toBe(1);
    expect(session.snapshot().player.hp).toBe(1);
    expect(session.registerQueryError(
      "near FROM：语法错误",
      "SELECT name FORM monsters",
    ).playerDamage).toBe(1);
    expect(session.snapshot().player.hp).toBe(0);
    expect(session.toProfile().attempts.select).toBe(2);
    expect(session.snapshot().battleReview).toEqual([
      expect.objectContaining({
        id: 1,
        battleId: 1,
        monsterName: "史莱姆",
        lessonId: "select",
        stageId: "select-name",
        sql: "SELECT name FROM monsters",
        answerSql: "SELECT name FROM monsters WHERE id = 101;",
        result: "wrong-result",
        outcome: "countered",
        hintLevel: 1,
      }),
      expect.objectContaining({
        id: 2,
        battleId: 1,
        sql: "SELECT name FORM monsters",
        result: "syntax-error",
        outcome: "defeat",
        feedback: "near FROM：语法错误",
      }),
    ]);
    expect(session.snapshot().floorReview).toEqual(session.snapshot().battleReview);
    expect(new GameSession(session.toSavedRun()).snapshot().battleReview).toEqual(
      session.snapshot().battleReview,
    );
  });

  it("相邻 E 打开篝火菜单，只有休息才回满生命并替换复活点", () => {
    const session = new GameSession(null, null, "campfire-rest");
    enterLesson(session, "select");
    expect(session.resolveQuery(WRONG_SELECT_NAME).playerDamage).toBe(1);
    expect(session.snapshot().player.hp).toBe(1);
    expect(session.resolveQuery(SELECT_NAME).accepted).toBe(true);
    expect(session.resolveQuery(SELECT_WEAKNESS).lessonCompleted).toBe("select");

    const [front, middle] = session.snapshot().campfires;
    if (!front || !middle) throw new Error("测试楼层缺少前、中篝火");
    expect(session.setPlayerPosition(front.restPosition.x, front.restPosition.y)).toBe(true);
    expect(session.snapshot().inSafeZone).toBe(true);
    expect(session.interact()).toMatchObject({
      ok: true,
      kind: "campfire",
      message: expect.stringContaining("可以在此休息"),
    });
    expect(session.snapshot()).toMatchObject({
      mode: "campfire",
      activeCampfireId: front.id,
      respawnCampfireId: null,
      player: { hp: 1, maxHp: 2 },
    });

    expect(session.leaveCampfire()).toBe(true);
    expect(session.snapshot()).toMatchObject({
      mode: "explore",
      activeCampfireId: null,
      respawnCampfireId: null,
      player: { hp: 1 },
    });
    expect(session.interact().ok).toBe(true);
    expect(session.restAtCampfire()).toMatchObject({
      ok: true,
      kind: "campfire",
      message: expect.stringMatching(/生命 1 → 2.*复活点/),
    });
    expect(session.snapshot()).toMatchObject({
      mode: "explore",
      activeCampfireId: null,
      respawnCampfireId: front.id,
      player: { hp: 2, maxHp: 2 },
    });

    expect(session.setPlayerPosition(middle.restPosition.x, middle.restPosition.y)).toBe(true);
    expect(session.interact().ok).toBe(true);
    expect(session.leaveCampfire()).toBe(true);
    expect(session.snapshot().respawnCampfireId).toBe(front.id);
    expect(session.interact().ok).toBe(true);
    expect(session.restAtCampfire().ok).toBe(true);
    expect(session.snapshot().respawnCampfireId).toBe(middle.id);
  });

  it("尚未在篝火休息时，死亡回本层出生点并进入本场复盘", () => {
    const session = new GameSession(null, null, "spawn-respawn");
    const spawn = { ...session.snapshot().mazeFloor.spawn };
    enterLesson(session, "select");
    expect(session.registerQueryError("第一次语法错误", "SELECT FORM monsters").playerDamage).toBe(1);
    expect(session.registerQueryError("第二次语法错误", "SELECT name FORM").mode).toBe("defeat");
    expect(session.snapshot()).toMatchObject({
      mode: "defeat",
      combat: null,
      player: { hp: 0 },
      respawnCampfireId: null,
    });

    expect(session.respawnAfterDefeat()).toBe(true);
    expect(session.snapshot()).toMatchObject({
      mode: "death-review",
      player: { ...spawn, hp: 2, maxHp: 2 },
      respawnCampfireId: null,
      inSafeZone: true,
    });
    expect(session.snapshot().battleReview.at(-1)).toMatchObject({
      result: "syntax-error",
      outcome: "defeat",
    });
    expect(session.continueAfterDeathReview()).toBe(true);
    expect(session.snapshot().mode).toBe("explore");
  });

  it("死亡回最近休息篝火，并保留课程、装备、经验与怪物剩余生命", () => {
    const session = new GameSession(null, null, "campfire-respawn");
    clearSelect(session);
    const checkpoint = session.snapshot().campfires[0];
    if (!checkpoint) throw new Error("测试楼层缺少篝火");
    expect(session.setPlayerPosition(
      checkpoint.restPosition.x,
      checkpoint.restPosition.y,
    )).toBe(true);
    expect(session.interact().ok).toBe(true);
    expect(session.restAtCampfire().ok).toBe(true);

    enterLesson(session, "where");
    const firstHit = session.resolveQuery(WHERE_TARGET);
    expect(firstHit.accepted).toBe(true);
    const damagedMonster = session.snapshot().monsters.find((monster) => monster.id === 201);
    if (!damagedMonster) throw new Error("测试楼层缺少水胶怪");
    expect(damagedMonster.hp).toBeGreaterThan(0);
    expect(damagedMonster.hp).toBeLessThan(damagedMonster.maxHp);
    expect(session.registerQueryError("条件缺失", "SELECT weakness FROM monsters").playerDamage).toBe(1);
    expect(session.registerQueryError("条件仍缺失", "SELECT weakness FORM monsters").mode).toBe("defeat");

    const beforeRespawn = session.snapshot();
    expect(session.respawnAfterDefeat()).toBe(true);
    const respawned = session.snapshot();
    expect(respawned).toMatchObject({
      mode: "death-review",
      respawnCampfireId: checkpoint.id,
      player: {
        x: checkpoint.restPosition.x,
        y: checkpoint.restPosition.y,
        hp: beforeRespawn.player.maxHp,
        maxHp: beforeRespawn.player.maxHp,
        xp: 1,
        weapon: { id: "filter-bow" },
      },
      completedLessons: expect.arrayContaining(["select"]),
      inSafeZone: true,
    });
    expect(respawned.monsters.find((monster) => monster.id === 201)?.hp).toBe(
      damagedMonster.hp,
    );
    expect(respawned.queryCount).toBe(beforeRespawn.queryCount);
    expect(respawned.campfires).toEqual(beforeRespawn.campfires);
    expect(session.continueAfterDeathReview()).toBe(true);
  });

  it("出生安全区内反复移动只累计 totalMoves，不消耗安全步也不刷怪", () => {
    const session = new GameSession(null, null, "safe-zone-movement");
    const initial = session.snapshot();
    const safeCells = safeZoneCellKeys(initial.mazeFloor, initial.campfires);
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    const neighbor = directions.find(({ dx, dy }) => (
      safeCells.has(`${initial.player.x + dx}:${initial.player.y + dy}`) &&
      !initial.campfires.some((campfire) => (
        campfire.x === initial.player.x + dx && campfire.y === initial.player.y + dy
      )) &&
      !initial.worldActors.some((actor) => (
        actor.x === initial.player.x + dx && actor.y === initial.player.y + dy
      ))
    ));
    if (!neighbor) throw new Error("出生安全区缺少可往返的相邻格");

    for (let index = 0; index < 80; index += 1) {
      const forward = index % 2 === 0;
      const move = session.attemptPlayerMove(
        forward ? neighbor.dx : -neighbor.dx,
        forward ? neighbor.dy : -neighbor.dy,
      );
      expect(move).toMatchObject({ ok: true, moved: true, encounterId: null });
      expect(session.snapshot().mode).toBe("explore");
    }

    expect(session.snapshot()).toMatchObject({
      totalMoves: initial.totalMoves + 80,
      stepsSinceEncounter: initial.stepsSinceEncounter,
      safeStepsRemaining: initial.safeStepsRemaining,
      inSafeZone: true,
    });
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
    expect(restored.toSavedRun()).toMatchObject({
      version: 9,
      generatorVersion: 4,
      floor: 1,
      campaign: { currentFloor: 1, status: "active" },
    });

    restored.reset("new-run");
    expect(restored.snapshot().runSeed).toBe("new-run");
    expect(restored.snapshot().player.weapon.id).toBe("data-blade");
    expect(restored.snapshot().completedLessons).toEqual([]);
    expect(restored.snapshot().profile.masteredLessons).toContain("select");
  });

  it("v9 存档中的越界巡逻怪会回到房间中心，而不是继续堵门", () => {
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

  it("Boss 门可用高难 SQL 越级破解，但不会伪造课程、XP 或战利品", () => {
    const session = new GameSession(null, null, "gate-breach");
    const initial = session.snapshot();
    const bossGate = initial.mazeFloor.gates.find(
      (gate) => gate.id === initial.challengeGateId,
    );
    if (!bossGate) throw new Error("缺少 Boss 机关门");

    expect(session.setPlayerPosition(bossGate.outside.x, bossGate.outside.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "challenge" });
    expect(session.snapshot()).toMatchObject({
      mode: "challenge",
      activeGateChallenge: { id: "aggregate-breach", gateId: bossGate.id },
      openedGateIds: [],
    });
    const restoredInChallenge = new GameSession(session.toSavedRun());
    expect(restoredInChallenge.snapshot()).toMatchObject({
      mode: "challenge",
      activeGateChallenge: { id: "aggregate-breach", gateId: bossGate.id },
      openedGateIds: [],
    });

    const wrong = result(
      "SELECT id FROM monsters ORDER BY id",
      ["id"],
      [{ id: 101 }],
    );
    expect(session.resolveGateChallenge(wrong)).toMatchObject({
      accepted: false,
      playerDamage: 1,
      mode: "challenge",
    });
    expect(session.snapshot().player.hp).toBe(1);
    expect(session.cancelGateChallenge()).toBe(true);
    expect(session.snapshot().mode).toBe("explore");

    expect(session.interact()).toMatchObject({ ok: true, kind: "challenge" });
    const correct = result(
      `SELECT m.id, m.name, COUNT(s.id) AS echo_count, SUM(s.charge) AS total_charge
       FROM monsters AS m
       JOIN monster_signals AS s ON s.monster_id = m.id
       WHERE s.channel = 'echo'
       GROUP BY m.id, m.name
       HAVING COUNT(s.id) >= 3 AND SUM(s.charge) >= 24
       ORDER BY total_charge DESC, m.id ASC`,
      ["id", "name", "echo_count", "total_charge"],
      [
        { id: 800, name: "铁胶怪", echo_count: 3, total_charge: 24 },
        { id: 900, name: "泥王", echo_count: 3, total_charge: 24 },
      ],
    );
    expect(session.resolveGateChallenge(correct)).toMatchObject({
      accepted: true,
      opened: true,
      gateId: bossGate.id,
      playerDamage: 0,
      mode: "explore",
    });
    const breached = session.snapshot();
    expect(breached.openedGateIds).toEqual([bossGate.id]);
    expect(breached.availableRoomIds).toContain(bossGate.roomNodeId);
    expect(breached.completedLessons).toEqual([]);
    expect(breached.profile.masteredLessons).toEqual([]);
    expect(breached.profile.attempts).toEqual(initial.profile.attempts);
    expect(breached.player).toMatchObject({ xp: 0, level: 1 });
    expect(breached.groundItems).toEqual(initial.groundItems);

    const restored = new GameSession(session.toSavedRun());
    expect(restored.snapshot().openedGateIds).toEqual([bossGate.id]);
    expect(restored.travelToRoom(bossGate.roomNodeId).ok).toBe(true);
  });
});
