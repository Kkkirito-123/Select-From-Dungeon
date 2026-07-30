import { describe, expect, it } from "vitest";
import { floorExperience } from "../src/content/floorExperience";
import { ARMORS } from "../src/content/inventoryCatalog";
import { biomeRegionAt } from "../src/domain/biome";
import { GameSession, experienceForRank } from "../src/domain/GameSession";
import { safeZoneCellKeys } from "../src/domain/campfire";
import { advanceCampaignProgress } from "../src/domain/campaign";
import { migrationStepMarkerIds } from "../src/domain/finalMigration";
import { detectQueryFeatures } from "../src/domain/lessonEvaluator";
import { isMazeWalkable } from "../src/domain/mazeGenerator";
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
  "SELECT id, status FROM monsters WHERE id = 1",
  ["id", "status"],
  [{ id: 1, status: "idle" }],
  [1],
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
  "SELECT id FROM monsters WHERE master_id IS NULL AND status = 'cursed'",
  ["id"],
  [{ id: 3 }],
  [3],
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

function placeNearFloorLandmark(session: GameSession, landmarkId: string): void {
  const snapshot = session.snapshot();
  const landmark = floorExperience(snapshot.floor).landmarks.find(
    (entry) => entry.id === landmarkId,
  );
  if (!landmark) throw new Error(`缺少地标：${landmarkId}`);
  const zone = snapshot.mazeFloor.zones.find(
    (entry) => entry.roomNodeId === landmark.anchor.roomNodeId,
  );
  if (!zone) throw new Error(`缺少地标房间：${landmark.anchor.roomNodeId}`);
  const focus = {
    x: Math.round(zone.x + landmark.anchor.position.x * zone.width),
    y: Math.round(zone.y + landmark.anchor.position.y * zone.height),
  };
  for (let radius = 0; radius <= 3; radius += 1) {
    for (let y = focus.y - radius; y <= focus.y + radius; y += 1) {
      for (let x = focus.x - radius; x <= focus.x + radius; x += 1) {
        if (Math.abs(x - focus.x) + Math.abs(y - focus.y) !== radius) continue;
        if (session.setPlayerPosition(x, y)) return;
      }
    }
  }
  throw new Error(`地标附近没有可站立位置：${landmarkId}`);
}

function placeNearFloorNpc(session: GameSession, npcId: string): void {
  const snapshot = session.snapshot();
  const npc = floorExperience(snapshot.floor).npcPlacements.find(
    (entry) => entry.id === npcId,
  );
  if (!npc) throw new Error(`缺少 NPC：${npcId}`);
  const zone = snapshot.mazeFloor.zones.find(
    (entry) => entry.roomNodeId === npc.anchor.roomNodeId,
  );
  if (!zone) throw new Error(`缺少 NPC 房间：${npc.anchor.roomNodeId}`);
  const focus = {
    x: Math.round(zone.x + npc.anchor.position.x * zone.width),
    y: Math.round(zone.y + npc.anchor.position.y * zone.height),
  };
  for (let radius = 0; radius <= 3; radius += 1) {
    for (let y = focus.y - radius; y <= focus.y + radius; y += 1) {
      for (let x = focus.x - radius; x <= focus.x + radius; x += 1) {
        if (Math.abs(x - focus.x) + Math.abs(y - focus.y) !== radius) continue;
        if (session.setPlayerPosition(x, y)) return;
      }
    }
  }
  throw new Error(`NPC 附近没有可站立位置：${npcId}`);
}

function placeOutsideFloorGate(session: GameSession, gateId: string): void {
  const gate = session.snapshot().mazeFloor.gates.find((entry) => entry.id === gateId);
  if (!gate) throw new Error(`缺少实体门：${gateId}`);
  const candidates = [
    gate.outside,
    { x: gate.x + 1, y: gate.y },
    { x: gate.x - 1, y: gate.y },
    { x: gate.x, y: gate.y + 1 },
    { x: gate.x, y: gate.y - 1 },
  ].filter((position) => Math.abs(position.x - gate.x) + Math.abs(position.y - gate.y) <= 1);
  if (candidates.some((position) => session.setPlayerPosition(position.x, position.y))) return;
  throw new Error(`实体门外没有可站立位置：${gateId}`);
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
      currentMaxHp: 2,
    });
    expect(session.snapshot().player).toMatchObject({ level: 2, xp: 2, maxHp: 2 });
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
    const hidden = session.snapshot();
    const hiddenCopy = [
      hidden.missionTitle,
      hidden.missionBody,
      hidden.lessonIntro,
      hidden.banner,
      hidden.interactionPrompt,
      ...hidden.hints,
    ].join("\n");
    expect(hiddenCopy).not.toContain("史莱姆");
    expect(hiddenCopy).not.toContain("projection_slime");
    expect(hidden.combat?.intent.name).toBe("攻击正在蓄力");
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

  it("第一层旧区域门数据仅用于存档兼容，不再提供传送交互", () => {
    const session = new GameSession(null, null, "portal-access");
    const portal = session.snapshot().biomePlan.portals[0];
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
    const before = session.snapshot().player;
    expect(session.interact().kind).not.toBe("region-portal");
    expect(session.snapshot().player).toEqual(before);
  });

  it("抄写员、档案水轮与无名宿舍都可以调查，并直说当前目标", () => {
    const session = new GameSession(null, null, "landmark-interaction");
    placeNearFloorNpc(session, "npc-scribe-f1");
    const bannerBeforeInspection = session.snapshot().banner;
    expect(session.interact()).toMatchObject({
      ok: true,
      kind: "inspection",
      landmarkId: "npc-scribe-f1",
      message: expect.stringContaining("ID #001"),
    });
    expect(session.snapshot().banner).toBe(bannerBeforeInspection);

    placeNearFloorLandmark(session, "f1-water-wheel");
    const bannerBeforeWaterWheel = session.snapshot().banner;
    expect(session.interact()).toMatchObject({
      ok: true,
      kind: "inspection",
      landmarkId: "f1-water-wheel",
      message: expect.stringContaining("完成 SELECT / FROM"),
    });
    expect(session.snapshot().banner).toBe(bannerBeforeWaterWheel);

    placeNearFloorLandmark(session, "f1-nameless-beds");
    const bannerBeforeBeds = session.snapshot().banner;
    expect(session.interact()).toMatchObject({
      ok: true,
      kind: "inspection",
      message: expect.stringContaining("水位"),
    });
    expect(session.snapshot().banner).toBe(bannerBeforeBeds);

    const legacySave = session.toSavedRun();
    legacySave.banner = "抄写员：这是旧版留在右栏的调查说明。";
    const restored = new GameSession(legacySave, session.toProfile());
    expect(restored.snapshot().banner).not.toContain("抄写员：");
  });

  it("现场证据只接受当前层 canonical ID，并写入兼容的 Run 标记", () => {
    const session = new GameSession(null, null, "story-evidence-marker");
    expect(session.recordStoryEvidence("lost-name:f1:current-record")).toBe(true);
    expect(session.recordStoryEvidence("lost-name:f1:current-record")).toBe(false);
    expect(session.recordStoryEvidence("lost-name:f2:identity-count")).toBe(false);
    expect(session.snapshot().openedGateIds).toContain(
      "story:evidence:lost-name:f1:current-record",
    );
    expect(session.toSavedRun().version).toBe(11);
  });

  it("MIGRATE 只在第八层 victory 按七步顺序写入兼容 marker", () => {
    const firstFloor = new GameSession(null, null, "migration-wrong-floor");
    expect(firstFloor.recordMigrationStep("snapshot")).toBe(false);

    const floorEightRun = freshFloorEightRun("migration-ordered-steps");
    const exploring = new GameSession(floorEightRun);
    expect(exploring.recordMigrationStep("snapshot")).toBe(false);

    const completion = advanceCampaignProgress(floorEightRun.campaign);
    if (!completion.ok || !completion.completed) {
      throw new Error("第八层测试 Campaign 无法进入 victory");
    }
    floorEightRun.mode = "victory";
    floorEightRun.campaign = completion.progress;
    const victory = new GameSession(floorEightRun);

    expect(victory.recordMigrationStep("audit")).toBe(false);
    expect(victory.recordMigrationStep("snapshot")).toBe(true);
    expect(victory.recordMigrationStep("snapshot")).toBe(false);
    expect(victory.recordMigrationStep("preserve-history")).toBe(false);
    expect(victory.snapshot().openedGateIds).toContain(
      "story:migrate:snapshot",
    );

    for (const markerId of migrationStepMarkerIds().slice(1)) {
      const stepId = markerId.replace("story:migrate:", "") as Parameters<
        GameSession["recordMigrationStep"]
      >[0];
      expect(victory.recordMigrationStep(stepId)).toBe(true);
    }
    expect(victory.snapshot().openedGateIds.filter((id) =>
      id.startsWith("story:migrate:")
    )).toEqual(migrationStepMarkerIds());
    expect(victory.toSavedRun().version).toBe(11);
  });

  it("第一、二层隐藏区域需要完成前置课程并开启实体暗门，发现状态可随 Run 恢复", () => {
    const first = new GameSession(null, null, "hidden-floor-one");
    placeOutsideFloorGate(first, "gate:floor-1-treasure");
    expect(first.interact()).toMatchObject({
      ok: true,
      kind: "inspection",
      message: expect.stringContaining("WHERE 与 IS NULL"),
    });
    expect(first.snapshot().openedGateIds).not.toContain("gate:floor-1-treasure");

    expect(first.enableAdminMode()).toMatchObject({ ok: true });
    expect(first.adminApplyPreset("f1-admin-dormitory")).toMatchObject({ ok: true });
    placeOutsideFloorGate(first, "gate:floor-1-treasure");
    expect(first.snapshot().interactionPrompt).toContain("封存旧库");
    expect(first.interact()).toMatchObject({
      ok: true,
      kind: "secret",
      message: expect.stringContaining("未被焚毁"),
    });
    expect(first.snapshot().openedGateIds).toContain("gate:floor-1-treasure");
    expect(new GameSession(first.toSavedRun()).snapshot().openedGateIds)
      .toContain("gate:floor-1-treasure");
    expect(first.adminApplyPreset("f1-admin-hidden")).toMatchObject({ ok: true });
    expect(first.snapshot().openedGateIds).toContain("gate:floor-1-treasure");
    expect(first.snapshot().currentRoomId).toBe("floor-1-treasure");

    const second = new GameSession(null, null, "hidden-floor-two");
    expect(second.enableAdminMode()).toMatchObject({ ok: true });
    expect(second.adminLoadFloor(2)).toMatchObject({ ok: true });
    expect(second.adminApplyPreset("f2-admin-village")).toMatchObject({ ok: true });
    placeOutsideFloorGate(second, "gate:floor-2-treasure");
    expect(second.snapshot().interactionPrompt).toContain("沉船记录舱");
    expect(second.interact()).toMatchObject({
      ok: true,
      kind: "secret",
      message: expect.stringContaining("七只防水匣"),
    });
    expect(second.adminApplyPreset("f2-admin-hidden")).toMatchObject({ ok: true });
    expect(second.snapshot().openedGateIds).toContain("gate:floor-2-treasure");
    expect(second.snapshot().currentRoomId).toBe("floor-2-treasure");
  });

  it("第二层抄写员、浮标、沉水村落与根桥均提供当前步骤指导", () => {
    const session = new GameSession(null, null, "floor-two-landmark-guidance");
    expect(session.enableAdminMode()).toMatchObject({ ok: true });
    expect(session.adminLoadFloor(2)).toMatchObject({ ok: true });

    placeNearFloorNpc(session, "npc-scribe-f2");
    expect(session.interact()).toMatchObject({
      ok: true,
      kind: "inspection",
      message: expect.stringContaining("ORDER BY"),
    });
    placeNearFloorLandmark(session, "f2-ranked-beacons");
    expect(session.interact().message).toContain("ORDER BY / LIMIT");
    placeNearFloorLandmark(session, "f2-drowned-village");
    expect(session.interact().message).toContain("DISTINCT");
    placeNearFloorLandmark(session, "f2-root-bridge");
    expect(session.interact().message).toContain("INNER JOIN");
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

  it("八层地图房名与生态区在身份恢复前不泄露怪物姓名", () => {
    const session = new GameSession(null, null, "identity-safe-map-labels");
    expect(session.enableAdminMode()).toMatchObject({ ok: true });

    for (let floor = 1; floor <= 8; floor += 1) {
      expect(session.adminLoadFloor(floor as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8))
        .toMatchObject({ ok: true });
      const snapshot = session.snapshot();
      const serializedMapLabels = JSON.stringify({
        rooms: snapshot.roomGraph.nodes.map((room) => room.title),
        regions: snapshot.biomePlan.regions.map((region) => region.name),
        portals: snapshot.biomePlan.portals.map((portal) => portal.name),
        transfer: snapshot.regionTransfer,
      });
      snapshot.monsters.forEach((monster) => {
        expect(serializedMapLabels).not.toContain(monster.name);
        expect(serializedMapLabels).not.toContain(monster.species);
      });
    }
  });

  it("地图房名会在对应怪物身份恢复后显示 canonical 姓名", () => {
    const profile = new GameSession(null, null, "identity-map-profile").toProfile();
    profile.discoveredMonsterIds = [28];
    const session = new GameSession(null, profile, "identity-map-recovered");
    expect(session.enableAdminMode()).toMatchObject({ ok: true });
    expect(session.adminLoadFloor(3)).toMatchObject({ ok: true });

    expect(session.snapshot().roomGraph.nodes.some((room) => (
      room.title.includes("死灵王")
    ))).toBe(true);
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
    expect(session.resolveQuery(GROUP_RESULT)).toMatchObject({
      accepted: true,
      stageAdvanced: true,
      lessonCompleted: null,
    });
    expect(session.resolveQuery(NULL_NAME).lessonCompleted).toBe("group-by");
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

  it("高层旧战斗会按 canonical 阶段、锁与同一伤害函数恢复", () => {
    const saved = freshFloorEightRun("canonical-combat-restore");
    const target = saved.monsters.find((monster) => monster.id === 84);
    const actor = saved.worldActors.find((entry) => entry.monsterId === 84);
    if (!target || !actor) throw new Error("第八层缺少 ID #084 战斗锚点");
    saved.mode = "combat";
    saved.currentRoomId = actor.roomNodeId;
    saved.player = {
      ...saved.player,
      x: actor.x,
      y: actor.y,
      hp: 10,
      maxHp: 10,
      armor: { ...ARMORS["bone-armor"] },
      armorHp: 2,
    };
    saved.combat = {
      targetId: 84,
      kind: "curriculum",
      round: 7,
      successStep: 999,
      intent: {
        name: "旧版攻击",
        damage: 99,
        locks: ["旧版锁"],
      },
    };

    const session = new GameSession(saved);
    expect(session.snapshot()).toMatchObject({
      lessonStageIndex: 4,
      monsters: expect.arrayContaining([
        expect.objectContaining({ id: 84, damage: 3 }),
      ]),
      combat: {
        targetId: 84,
        successStep: 4,
        intent: {
          damage: 3,
        },
      },
    });

    const wrong = session.resolveQuery(result("SELECT 1", ["1"], [{ "1": 1 }]));
    expect(wrong).toMatchObject({
      accepted: false,
      playerDamage: 1,
      armorDamage: 2,
      events: expect.arrayContaining([
        expect.objectContaining({ type: "enemy-hit", amount: 3 }),
      ]),
    });
    expect(session.registerQueryError("near SELECT：语法错误", "SELEC 1"))
      .toMatchObject({
        playerDamage: 3,
        armorDamage: 0,
        events: expect.arrayContaining([
          expect.objectContaining({ type: "enemy-hit", amount: 3 }),
        ]),
      });
  });

  it("高伤武器也不能跳过第八层 Boss 的剩余阶段", () => {
    const saved = freshFloorEightRun("boss-stage-floor");
    const target = saved.monsters.find((monster) => monster.id === 84);
    const actor = saved.worldActors.find((entry) => entry.monsterId === 84);
    if (!target || !actor) throw new Error("第八层缺少 ID #084 战斗锚点");
    target.hp = 1;
    saved.mode = "combat";
    saved.currentRoomId = actor.roomNodeId;
    saved.player.x = actor.x;
    saved.player.y = actor.y;
    saved.combat = {
      targetId: 84,
      kind: "curriculum",
      round: 1,
      successStep: 0,
      intent: { name: "旧版攻击", damage: 99, locks: ["旧版锁"] },
    };

    const session = new GameSession(saved);
    const firstStage = session.resolveQuery(result(
      "SELECT value FROM tx_versions WHERE row_id = 2 AND created_tx <= 12 AND (expired_tx IS NULL OR expired_tx > 12)",
      ["value"],
      [{ value: "locked" }],
    ));

    expect(firstStage).toMatchObject({
      accepted: true,
      stageAdvanced: true,
      lessonCompleted: null,
    });
    expect(session.snapshot().monsters.find((monster) => monster.id === 84)?.hp).toBe(1);
    expect(session.snapshot().combat?.successStep).toBe(1);
    expect(session.snapshot().profile.discoveredMonsterIds).not.toContain(84);
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

    clearBranch(session, "where");
    returnToHub(session);
    clearBranch(session, "is-null");
    returnToHub(session);
    const hammerRoom = session.snapshot().roomGraph.nodes.find(
      (node) => node.reward === "aggregate-hammer",
    );
    if (!hammerRoom) throw new Error("测试楼层缺少聚合战锤房");
    expect(session.travelToRoom(hammerRoom.id).ok).toBe(true);
    expect(session.interact().ok).toBe(true);
    enterLesson(session, "group-by");
    expect(session.resolveQuery(GROUP_RESULT)).toMatchObject({
      accepted: true,
      stageAdvanced: true,
      lessonCompleted: null,
    });
    expect(session.resolveQuery(NULL_NAME).lessonCompleted).toBe("group-by");

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

  it("管理员状态预设可复现前四层关键世界状态、回燃换装且不污染永久图鉴", () => {
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
    expect(floorTwoLowTide.monsters.find((monster) => monster.id === 22)?.hp)
      .toBeGreaterThan(0);
    expect(floorTwoLowTide.profile.discoveredMonsterIds).toContain(21);
    expect(floorTwoLowTide.openedGateIds).toContain("shortcut:2:return");
    expect(session.toProfile()).toEqual(formalProfile);

    expect(session.adminApplyPreset("f2-admin-frog-court"))
      .toMatchObject({ ok: true });
    expect(session.snapshot().monsters.find((monster) => monster.id === 22)?.hp)
      .toBe(0);

    expect(session.adminLoadFloor(4)).toMatchObject({ ok: true });
    expect(session.adminApplyPreset("f4-admin-echo")).toMatchObject({ ok: true });
    const floorFourEcho = session.snapshot();
    expect(floorFourEcho.monsters.find((monster) => monster.id === 44)?.hp).toBe(0);
    expect(floorFourEcho.openedGateIds).toContain("gate:floor-4-treasure");
    const echoBundle = floorFourEcho.lootBundles.find(
      (bundle) => bundle.id === "hidden-reward:f4-hidden-ember-echo",
    );
    expect(echoBundle?.items[0]).toMatchObject({
      itemId: "ember-echo-robe",
      kind: "armor",
      guaranteed: true,
    });
    if (!echoBundle) throw new Error("回燃残响缺少确定护甲奖励");
    expect(session.setPlayerPosition(echoBundle.x, echoBundle.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "loot-bundle" });
    expect(session.takeLootItem(
      echoBundle.id,
      echoBundle.items[0]!.dropId,
      "equip",
    )).toMatchObject({ ok: true });
    expect(session.snapshot().player.armor?.id).toBe("ember-echo-robe");
    expect(session.toProfile()).toEqual(formalProfile);
  });

  it("第四层炉主同时封锁区域交通和普通步行边界，击败后才能穿过", () => {
    const session = new GameSession(null, null, "f4-guardian-boundary");
    expect(session.enableAdminMode()).toMatchObject({ ok: true });
    expect(session.adminLoadFloor(4)).toMatchObject({ ok: true });
    expect(session.adminApplyPreset("f4-admin-forge-lord")).toMatchObject({ ok: true });

    const before = session.snapshot();
    const portal = before.biomePlan.portals.find(
      (entry) => entry.id === "biome-portal:4:middle-rear",
    );
    if (!portal) throw new Error("第四层缺少中后段交通");
    const pairs = before.mazeFloor.tiles.flatMap((row, y) => [...row].flatMap((_tile, x) => (
      [
        { from: { x, y }, to: { x: x + 1, y } },
        { from: { x, y }, to: { x: x - 1, y } },
        { from: { x, y }, to: { x, y: y + 1 } },
        { from: { x, y }, to: { x, y: y - 1 } },
      ]
    ))).filter(({ from, to }) => (
      isMazeWalkable(
        before.mazeFloor,
        from.x,
        from.y,
        new Set(before.completedLessons),
        new Set(before.openedGateIds),
      ) &&
      isMazeWalkable(
        before.mazeFloor,
        to.x,
        to.y,
        new Set(before.completedLessons),
        new Set(before.openedGateIds),
      ) &&
      biomeRegionAt(before.biomePlan, from).id === portal.fromRegionId &&
      biomeRegionAt(before.biomePlan, to).id === portal.toRegionId
    ));
    const boundary = pairs.find(({ from }) => (
      session.setPlayerPosition(from.x, from.y)
    ));
    if (!boundary) throw new Error("第四层中后段缺少可验证步行边界");

    expect(session.attemptPlayerMove(
      boundary.to.x - boundary.from.x,
      boundary.to.y - boundary.from.y,
    )).toMatchObject({
      ok: false,
      moved: false,
      blockedBy: "gate",
      message: expect.stringContaining("ID #044"),
    });

    expect(session.adminApplyPreset("f4-admin-echo")).toMatchObject({ ok: true });
    expect(session.setPlayerPosition(boundary.from.x, boundary.from.y)).toBe(true);
    expect(session.attemptPlayerMove(
      boundary.to.x - boundary.from.x,
      boundary.to.y - boundary.from.y,
    )).toMatchObject({
      ok: true,
      moved: true,
      blockedBy: "none",
    });
  });

  it("第五至八层管理员预设、实体地标指导、密文门与隐藏护甲都可复现", () => {
    const session = new GameSession(null, null, "late-floor-presets");
    expect(session.enableAdminMode()).toMatchObject({ ok: true });

    const cases = [
      {
        floor: 5,
        entryPreset: "f5-admin-entry",
        entryLandmark: "f5-muster-board",
        entryCopy: "OVER",
        cipherPreset: "f5-admin-cipher",
        cipherGate: "gate:floor-5-lesson-6",
        hiddenPreset: "f5-admin-roster",
        hiddenBundle: "hidden-reward:f5-hidden-silent-roster",
        armorId: "iron-armor",
        areaPreset: "f5-admin-barracks",
        areaBossId: 55,
      },
      {
        floor: 6,
        entryPreset: "f6-admin-entry",
        entryLandmark: "f6-sandbox-incubator",
        entryCopy: "INSERT",
        cipherPreset: "f6-admin-cipher",
        cipherGate: "gate:floor-6-lesson-6",
        hiddenPreset: "f6-admin-rookery",
        hiddenBundle: "hidden-reward:f6-hidden-uncommitted-rookery",
        armorId: "dragon-armor",
        areaPreset: "f6-admin-crystal-cavern",
        areaBossId: 66,
      },
      {
        floor: 7,
        entryPreset: "f7-admin-entry",
        entryLandmark: "f7-scan-road",
        entryCopy: "B-Tree",
        cipherPreset: "f7-admin-cipher",
        cipherGate: "gate:floor-7-lesson-6",
        hiddenPreset: "f7-admin-garden",
        hiddenBundle: "hidden-reward:f7-hidden-blind-garden",
        armorId: "crystal-armor",
        areaPreset: "f7-admin-root-cloister",
        areaBossId: 77,
      },
      {
        floor: 8,
        entryPreset: "f8-admin-entry",
        entryLandmark: "f8-version-gallery",
        entryCopy: "MVCC",
        cipherPreset: "f8-admin-cipher",
        cipherGate: "gate:floor-8-lesson-7",
        hiddenPreset: "f8-admin-chapel",
        hiddenBundle: "hidden-reward:f8-hidden-zero-row-chapel",
        armorId: "royal-armor",
        areaPreset: "f8-admin-void-court",
        areaBossId: 89,
      },
    ] as const;

    cases.forEach((entry) => {
      expect(session.adminLoadFloor(entry.floor)).toMatchObject({ ok: true });
      expect(session.adminApplyPreset(entry.entryPreset)).toMatchObject({ ok: true });
      placeNearFloorLandmark(session, entry.entryLandmark);
      expect(session.interact()).toMatchObject({
        ok: true,
        kind: "inspection",
        message: expect.stringContaining(entry.entryCopy),
      });

      expect(session.adminApplyPreset(entry.cipherPreset)).toMatchObject({ ok: true });
      expect(session.snapshot().openedGateIds).toContain(entry.cipherGate);

      expect(session.adminApplyPreset(entry.areaPreset)).toMatchObject({ ok: true });
      expect(session.snapshot().monsters.find(
        (monster) => monster.id === entry.areaBossId,
      )?.hp).toBe(0);

      expect(session.adminApplyPreset(entry.hiddenPreset)).toMatchObject({ ok: true });
      const reward = session.snapshot().lootBundles.find(
        (bundle) => bundle.id === entry.hiddenBundle,
      );
      expect(reward?.items[0]).toMatchObject({
        itemId: entry.armorId,
        kind: "armor",
        guaranteed: true,
      });
      if (entry.floor === 6) {
        expect(JSON.stringify(reward)).not.toContain("巨龙");
      }
    });
  });
});
