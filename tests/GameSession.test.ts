import { describe, expect, it } from "vitest";
import { GameSession, experienceForRank } from "../src/domain/GameSession";
import { safeZoneCellKeys } from "../src/domain/campfire";
import { detectQueryFeatures } from "../src/domain/lessonEvaluator";
import { isSavedRun } from "../src/storage/localProgress";
import type {
  GroundItem,
  LessonId,
  SavedRun,
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
  "SELECT name FROM monsters WHERE id = 1",
  ["name"],
  [{ name: "史莱姆" }],
);
const SELECT_WEAKNESS = result(
  "SELECT weakness FROM monsters WHERE id = 1",
  ["weakness"],
  [{ weakness: "slash" }],
);
const WHERE_TARGET = result(
  "SELECT id FROM monsters WHERE room_id = 2 AND status = 'escaped'",
  ["id"],
  [{ id: 2 }],
  [2],
);
const WHERE_WEAKNESS = result(
  "SELECT weakness FROM monsters WHERE id = 2 AND status = 'escaped'",
  ["weakness"],
  [{ weakness: "focus" }],
);
const NULL_TARGET = result(
  "SELECT id FROM monsters WHERE room_id = 3 AND master_id IS NULL",
  ["id"],
  [{ id: 3 }],
  [3],
);
const NULL_NAME = result(
  "SELECT name FROM monsters WHERE master_id IS NULL AND status = 'cursed'",
  ["name"],
  [{ name: "毒史莱姆" }],
);
const GROUP_RESULT = result(
  "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 4 GROUP BY channel",
  ["channel", "total"],
  [
    { channel: "echo", total: 3 },
    { channel: "noise", total: 1 },
  ],
);
const HAVING_SHIELD = result(
  "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 2",
  ["channel", "total"],
  [
    { channel: "echo", total: 3 },
    { channel: "ward", total: 2 },
  ],
);
const HAVING_CORE = result(
  "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 3",
  ["channel", "total"],
  [{ channel: "echo", total: 3 }],
);
const ORDER_PEAK = result(
  "SELECT channel FROM monster_signals WHERE monster_id = 10 ORDER BY charge DESC LIMIT 1",
  ["channel"],
  [{ channel: "surge" }],
);
const ORDER_TOP_TWO = result(
  "SELECT channel, charge FROM monster_signals WHERE monster_id = 10 ORDER BY charge DESC LIMIT 2",
  ["channel", "charge"],
  [
    { channel: "surge", charge: 13 },
    { channel: "arc", charge: 11 },
  ],
);
const LAKE_BOSS_SCAN = result(
  "SELECT channel, charge FROM monster_signals WHERE monster_id = 21 ORDER BY charge DESC LIMIT 2",
  ["channel", "charge"],
  [{ channel: "surge", charge: 14 }, { channel: "surge", charge: 13 }],
);
const LAKE_BOSS_SORT = result(
  "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 21 ORDER BY channel",
  ["channel"],
  [{ channel: "deep" }, { channel: "surge" }, { channel: "wake" }],
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

function collectLessonChest(
  session: GameSession,
  lessonId: LessonId,
): GroundItem {
  const snapshot = session.snapshot();
  const roomId = roomIdForLesson(session, lessonId);
  const item = snapshot.groundItems.find((entry) => (
    entry.sourceRoomId === roomId && entry.collection === "interact"
  ));
  if (!item) throw new Error(`缺少 ${lessonId} 课程宝箱`);
  expect(session.setPlayerPosition(item.x, item.y)).toBe(true);
  expect(session.interact()).toMatchObject({ ok: true });
  return item;
}

function freshFloorEightRun(seed: string): SavedRun {
  const preview = new GameSession(null, null, seed);
  expect(preview.enableAdminMode().ok).toBe(true);
  expect(preview.adminLoadFloor(8).ok).toBe(true);
  return preview.toSavedRun();
}

function clearSelect(session: GameSession): TurnResolution {
  enterLesson(session, "select");
  const first = session.resolveQuery(SELECT_WEAKNESS);
  expect(first.accepted).toBe(true);
  expect(first.lessonCompleted).toBeNull();
  expect(session.snapshot().lessonStageId).toBe("select-name");
  expect(session.snapshot().monsters.find((monster) => monster.id === 1)?.hp).toBe(6);

  const second = session.resolveQuery(SELECT_NAME);
  expect(second.lessonCompleted).toBe("select");
  expect(second.experience).toMatchObject({
    monsterId: 1,
    gained: 1,
    previousXp: 0,
    currentXp: 1,
    previousLevel: 1,
    currentLevel: 1,
  });
  expect(session.snapshot().mode).toBe("explore");
  expect(session.snapshot().lootBundles).toEqual([]);
  collectLessonChest(session, "select");
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
    collectLessonChest(session, "is-null");
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
    expect(session.snapshot().profile.discoveredMonsterIds).not.toContain(1);
    clearSelect(session);
    expect(session.snapshot().completedLessons).toContain("select");
    expect(session.snapshot().profile.masteredLessons).toContain("select");
    expect(session.snapshot().profile.discoveredMonsterIds).toContain(1);
    expect(session.snapshot().monsters.find((monster) => monster.id === 1)?.hp).toBe(0);
  });

  it("身份只在致命一击结算，并能从 Run 中的已击败记录恢复", () => {
    const session = new GameSession(null, null, "identity-recovery");
    enterLesson(session, "select");
    const first = session.resolveQuery(SELECT_WEAKNESS);
    expect(first.events.some((event) => event.type === "identity-recovered")).toBe(false);
    expect(session.snapshot().profile.discoveredMonsterIds).toEqual([]);

    const second = session.resolveQuery(SELECT_NAME);
    expect(second.events).toContainEqual(expect.objectContaining({
      type: "identity-recovered",
      targetId: 1,
      itemName: "史莱姆",
    }));
    expect(session.snapshot().profile.discoveredMonsterIds).toEqual([1]);

    const restored = new GameSession(session.toSavedRun()).snapshot();
    expect(restored.profile.discoveredMonsterIds).toContain(1);
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
    expect(collision).toMatchObject({ moved: false, encounterId: 1, blockedBy: "none" });
    expect(session.snapshot().mode).toBe("combat");
    expect(session.snapshot().combat?.targetId).toBe(1);
  });

  it("战斗可撤退到复活点，双方生命和课程进度都不被重置", () => {
    const session = new GameSession(null, null, "retreat");
    const spawn = session.snapshot().mazeFloor.spawn;
    enterLesson(session, "select");
    expect(session.resolveQuery(SELECT_WEAKNESS).accepted).toBe(true);
    const hpBeforeRetreat = session.snapshot().monsters.find(
      (monster) => monster.id === 1,
    )?.hp;
    expect(session.retreatFromCombat()).toMatchObject({ ok: true });
    expect(session.snapshot()).toMatchObject({
      mode: "explore",
      player: spawn,
      combat: null,
    });
    expect(session.snapshot().monsters.find(
      (monster) => monster.id === 1,
    )?.hp).toBe(hpBeforeRetreat);
    expect(session.snapshot().completedLessons).not.toContain("select");
  });

  it("区域门不会越过知识门，并把玩家送到无怪物占位的目标生态", () => {
    const session = new GameSession(null, null, "portal-access");
    const portal = session.snapshot().biomePlan.portals[0];
    const targetRegion = session.snapshot().biomePlan.regions.find(
      (region) => region.id === portal.toRegionId,
    );
    const placeBesideEntry = (): void => {
      const candidates = [
        portal.entry,
        { x: portal.entry.x + 1, y: portal.entry.y },
        { x: portal.entry.x - 1, y: portal.entry.y },
        { x: portal.entry.x, y: portal.entry.y + 1 },
        { x: portal.entry.x, y: portal.entry.y - 1 },
      ];
      expect(candidates.some((position) => (
        session.setPlayerPosition(position.x, position.y)
      ))).toBe(true);
    };

    placeBesideEntry();
    const beforeBlockedTravel = session.snapshot().player;
    expect(session.interact()).toMatchObject({
      ok: false,
      kind: "none",
    });
    expect(session.snapshot().player).toEqual(beforeBlockedTravel);

    clearSelect(session);
    placeBesideEntry();
    expect(session.interact()).toMatchObject({
      ok: true,
      kind: "region-portal",
    });
    const arrived = session.snapshot();
    expect(arrived.currentBiome).toBe(targetRegion?.kind);
    expect(arrived.regionTransfer?.toName).toBe(targetRegion?.name);
    expect(arrived.worldActors.some((actor) => (
      actor.x === arrived.player.x &&
      actor.y === arrived.player.y &&
      arrived.monsters.some((monster) => (
        monster.id === actor.monsterId && monster.hp > 0
      ))
    ))).toBe(false);
  });

  it("管理员视图可预览八层全图并定位生态区", () => {
    const session = new GameSession(null, null, "admin-overview");
    expect(session.enableAdminMode()).toMatchObject({ ok: true });
    const floorOne = session.snapshot();
    expect(floorOne.adminMode).toBe(true);
    expect(floorOne.discoveredCells).toHaveLength(
      floorOne.mazeFloor.width * floorOne.mazeFloor.height,
    );
    expect(session.setAdminPanelOpen(true)).toBe(true);
    expect(session.attemptPlayerMove(1, 0)).toMatchObject({
      moved: false,
      blockedBy: "mode",
    });
    expect(session.advanceMonsterPatrols()).toEqual({
      moves: [],
      encounterId: null,
    });
    expect(session.setAdminPanelOpen(false)).toBe(true);

    expect(session.adminLoadFloor(8)).toMatchObject({ ok: true });
    const floorEight = session.snapshot();
    expect(floorEight).toMatchObject({
      adminMode: true,
      floor: 8,
      campaign: { currentFloor: 8 },
    });
    expect(floorEight.biomePlan.regions).toHaveLength(3);
    expect(floorEight.biomePlan.portals).toHaveLength(2);

    const targetRegion = floorEight.biomePlan.regions[2];
    expect(session.adminTravelToRegion(targetRegion.id)).toMatchObject({ ok: true });
    expect(session.snapshot()).toMatchObject({
      currentBiome: targetRegion.kind,
      regionTransfer: {
        toName: targetRegion.name,
      },
    });
  });

  it("第八层钥匙无论来自战利品包还是地面物品都会原子提交 Campaign", () => {
    const bundleRun = freshFloorEightRun("victory-bundle");
    const bundleId = "test:floor-8-key";
    const dropId = `${bundleId}:key`;
    bundleRun.mode = "loot";
    bundleRun.activeLootBundleId = bundleId;
    bundleRun.lootBundles = [{
      id: bundleId,
      sourceMonsterId: null,
      sourceRoomId: bundleRun.currentRoomId,
      floor: 8,
      x: bundleRun.player.x,
      y: bundleRun.player.y,
      items: [{
        dropId,
        itemId: "floor-key",
        kind: "reward",
        name: "第八层钥匙",
        description: "用于提交八层 Run。",
        guaranteed: true,
        probability: 1,
        protected: true,
        rewardId: "floor-key",
      }],
    }];
    const bundleSession = new GameSession(bundleRun);

    expect(bundleSession.takeLootItem(bundleId, dropId, "claim").ok).toBe(true);
    expect(bundleSession.snapshot()).toMatchObject({
      mode: "victory",
      campaign: {
        currentFloor: 8,
        status: "completed",
      },
    });
    expect(bundleSession.snapshot().campaign.floors.every(
      (slot) => slot.status === "cleared",
    )).toBe(true);
    expect(isSavedRun(bundleSession.toSavedRun())).toBe(true);

    const groundRun = freshFloorEightRun("victory-ground");
    const groundKey: GroundItem = {
      id: "test:ground-floor-8-key",
      sourceRoomId: groundRun.currentRoomId,
      x: groundRun.player.x,
      y: groundRun.player.y,
      name: "第八层钥匙",
      description: "用于提交八层 Run。",
      kind: "key",
      collection: "interact",
      rewardId: "floor-key",
    };
    groundRun.groundItems.push(groundKey);
    const groundSession = new GameSession(groundRun);

    expect(groundSession.interact()).toMatchObject({ ok: true, kind: "reward" });
    expect(groundSession.snapshot()).toMatchObject({
      mode: "victory",
      campaign: {
        currentFloor: 8,
        status: "completed",
      },
    });
    expect(groundSession.snapshot().campaign.floors.every(
      (slot) => slot.status === "cleared",
    )).toBe(true);
    expect(isSavedRun(groundSession.toSavedRun())).toBe(true);
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
    expect(session.snapshot().lootBundles).toEqual([]);
    collectLessonChest(session, "group-by");

    enterLesson(session, "having");
    expect(session.resolveQuery(HAVING_SHIELD).accepted).toBe(true);
    expect(session.snapshot().lessonStageId).toBe("having-core");
    expect(session.snapshot().monsters.find((monster) => monster.id === 5)?.hp).toBe(12);
    expect(session.resolveQuery(HAVING_CORE).lessonCompleted).toBe("having");
    expect(session.snapshot().mode).toBe("explore");
    collectLessonChest(session, "having");
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
      "潮汐浅滩",
      "月影湖与沉水村落",
      "古树沼泽与灯塔岛",
    ]);
    expect(session.snapshot().worldActors.filter(
      (actor) => actor.monsterId === 21 || actor.monsterId === 22,
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
    const areaBoss = session.snapshot().worldActors.find((actor) => actor.monsterId === 21);
    if (!areaBoss) throw new Error("第二层缺少湖兽区域首领");
    expect(session.snapshot().monsters.find((monster) => monster.id === 21)).toMatchObject({
      isBoss: true,
      rank: "elite",
    });
    expect(session.setPlayerPosition(areaBoss.x, areaBoss.y)).toBe(true);
    expect(session.snapshot()).toMatchObject({
      mode: "combat",
      focusMonsterId: 21,
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
        monsterId: 21,
        gained: 3,
      },
    });
    expect(session.snapshot().completedLessons).toEqual(["order-by"]);
    expect(session.snapshot().lootBundles.some(
      (bundle) => bundle.sourceMonsterId === 21,
    )).toBe(false);
    expect(session.advanceFloor()).toBe(false);
  });

  it("旧 v9 存档缺少生态怪物时会按同一 seed 补全，而不会重置进度", () => {
    const session = new GameSession(null, null, "legacy-biome-v9");
    const saved = session.toSavedRun();
    const legacyMonsterIds = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
    const legacy = {
      ...saved,
      monsters: saved.monsters
        .filter((monster) => legacyMonsterIds.has(monster.id))
        .map((monster) => monster.id === 2 ? { ...monster, name: "猎犬" } : monster),
      worldActors: saved.worldActors.filter((actor) => legacyMonsterIds.has(actor.monsterId)),
    };
    expect(isSavedRun(legacy)).toBe(true);

    const restored = new GameSession(legacy).snapshot();
    expect(restored.runSeed).toBe(saved.graph.seed);
    expect(restored.monsters.map((monster) => monster.id).sort((a, b) => a - b))
      .toEqual(saved.monsters.map((monster) => monster.id).sort((a, b) => a - b));
    expect(restored.monsters.find((monster) => monster.id === 2)?.name).toBe("水史莱姆");
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
        monsterName: "ID #001",
        lessonId: "select",
        stageId: "select-weakness",
        sql: "SELECT name FROM monsters",
        answerSql: "SELECT weakness FROM monsters WHERE id = 1;",
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
    expect(session.resolveQuery(SELECT_WEAKNESS).accepted).toBe(true);
    expect(session.resolveQuery(SELECT_NAME).lessonCompleted).toBe("select");

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
    const damagedMonster = session.snapshot().monsters.find((monster) => monster.id === 2);
    if (!damagedMonster) throw new Error("测试楼层缺少水史莱姆");
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
    expect(respawned.monsters.find((monster) => monster.id === 2)?.hp).toBe(
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
      version: 11,
      generatorVersion: 5,
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

  it("旧存档中已经巡逻走偏的首课史莱姆会回到 SELECT 石碑", () => {
    const session = new GameSession(null, null, "tutorial-actor-recovery");
    const saved = session.toSavedRun();
    const tutorialRoom = saved.graph.nodes.find((room) => room.type === "tutorial");
    const actor = saved.worldActors.find((entry) => entry.roomNodeId === tutorialRoom?.id);
    if (!tutorialRoom || !actor) throw new Error("缺少首课房间或怪物 Actor");
    actor.behavior = "wander";
    actor.roamRadius = 3;
    actor.x += 2;
    actor.y += 1;

    const restoredActor = new GameSession(saved).snapshot().worldActors.find(
      (entry) => entry.monsterId === actor.monsterId,
    );
    expect(restoredActor).toMatchObject({
      x: actor.home.x,
      y: actor.home.y,
      behavior: "anchored",
      roamRadius: 0,
    });
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
      [{ id: 1 }],
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
      `SELECT m.id, COUNT(s.id) AS echo_count, SUM(s.charge) AS total_charge
       FROM monsters AS m
       JOIN monster_signals AS s ON s.monster_id = m.id
       WHERE s.channel = 'echo'
       GROUP BY m.id
       HAVING COUNT(s.id) >= 3 AND SUM(s.charge) >= 24
       ORDER BY total_charge DESC, m.id ASC`,
      ["id", "echo_count", "total_charge"],
      [
        { id: 4, echo_count: 3, total_charge: 24 },
        { id: 5, echo_count: 3, total_charge: 24 },
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

  it("管理员模式可检查八层与三区，但不会写入 SavedRun", () => {
    const session = new GameSession(null, null, "admin-overview");
    const formalSave = session.toSavedRun();

    expect(session.enableAdminMode()).toMatchObject({ ok: true });
    expect(session.snapshot().adminMode).toBe(true);
    expect(session.snapshot().discoveredCells.length).toBeGreaterThan(1_000);
    expect(session.adminLoadFloor(8)).toMatchObject({ ok: true });
    const floorEight = session.snapshot();
    expect(floorEight.floor).toBe(8);
    expect(floorEight.biomePlan.regions).toHaveLength(3);
    expect(floorEight.biomePlan.portals).toHaveLength(2);

    const targetRegion = floorEight.biomePlan.regions[2];
    expect(session.adminTravelToRegion(targetRegion.id)).toMatchObject({ ok: true });
    expect(session.snapshot().currentBiome).toBe(targetRegion.kind);
    expect(session.snapshot().regionTransfer?.toName).toBe(targetRegion.name);

    expect(formalSave.floor).toBe(1);
    expect(formalSave.graph.seed).toBe("admin-overview");
  });

  it("管理员状态预设可复现前两层关键世界状态且不污染永久图鉴", () => {
    const session = new GameSession(null, null, "admin-presets");
    const formalProfile = session.toProfile();

    expect(session.adminApplyPreset("f1-admin-complete")).toMatchObject({ ok: false });
    expect(session.enableAdminMode()).toMatchObject({ ok: true });
    expect(session.adminLoadFloor(1)).toMatchObject({ ok: true });
    expect(session.adminApplyPreset("f1-admin-complete")).toMatchObject({ ok: true });
    const floorOneComplete = session.snapshot();
    expect(floorOneComplete.completedLessons).toEqual(expect.arrayContaining([
      "select",
      "where",
      "is-null",
      "group-by",
      "having",
    ]));
    expect(floorOneComplete.monsters.find((monster) => monster.id === 5)?.hp).toBe(0);
    expect(floorOneComplete.profile.discoveredMonsterIds).toContain(5);
    expect(floorOneComplete.currentRoomId).toBe("floor-1-boss");
    expect(floorOneComplete.openedGateIds).toContain("shortcut:1:return");
    expect(session.toProfile()).toEqual(formalProfile);

    expect(session.adminLoadFloor(2)).toMatchObject({ ok: true });
    expect(session.adminApplyPreset("f2-admin-low-tide")).toMatchObject({ ok: true });
    const floorTwoLowTide = session.snapshot();
    expect(floorTwoLowTide.completedLessons).toEqual(expect.arrayContaining([
      "order-by",
      "distinct",
      "inner-join",
    ]));
    expect(floorTwoLowTide.monsters.find((monster) => monster.id === 21)?.hp).toBe(0);
    expect(floorTwoLowTide.profile.discoveredMonsterIds).toContain(21);
    expect(floorTwoLowTide.openedGateIds).toContain("shortcut:2:return");
    expect(session.toProfile()).toEqual(formalProfile);
  });
});
