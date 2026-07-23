import {
  JOIN_CHAIN,
  SORT_SABER,
} from "../content/floor2Level";
import {
  AGGREGATE_HAMMER,
  DATA_BLADE,
  FILTER_BOW,
  INITIAL_MONSTERS,
  LOOT_AFTER_LESSON,
  NULL_LANTERN,
  lessonById,
  practiceStageFor,
} from "../content/mvpLevel";
import {
  evaluateGateChallenge,
  gateChallengeForFloor,
  gateChallengeIdForFloor,
} from "../content/gateChallenges";
import { RELICS, rewardDetails, roomFlavor } from "../content/runContent";
import {
  cloneMazeFloor,
  generateMazeFloor,
  isMazeWalkable,
  mazeGateAt,
  mazeZoneAt,
  revealAround,
  type MazeFloor,
} from "./mazeGenerator";
import {
  advanceMonsterPatrol,
  cloneWorldActor,
  isActorPatrolPosition,
  type WorldActor,
} from "./monsterRoaming";
import {
  INITIAL_SAFE_STEPS,
  advanceEncounterMeter,
  resetEncounterMeterAfterBattle,
  type EncounterMeter,
} from "./encounterDirector";
import {
  generateRoomGraph,
  lessonsForFloor,
  type FloorNumber,
  type RoomGraph,
  type RoomNode,
  type RoomReward,
} from "./runGraph";
import { evaluateStage } from "./lessonEvaluator";
import type {
  ClaimableReward,
  CombatEvent,
  CombatState,
  ExperienceSettlement,
  GateChallengeId,
  GateChallengeResolution,
  GameSnapshot,
  GroundItem,
  InteractionResolution,
  LessonDefinition,
  LessonId,
  LessonStageDefinition,
  LootDrop,
  Monster,
  MoveResolution,
  PatrolBatchResolution,
  PlayerState,
  Position,
  ProfileProgress,
  Relic,
  SavedRun,
  SqlQueryResult,
  TravelResolution,
  TurnResolution,
  Weapon,
} from "./types";

type SessionListener = (snapshot: GameSnapshot) => void;

const LESSON_ORDER: readonly LessonId[] = [
  "select",
  "where",
  "is-null",
  "group-by",
  "having",
  "order-by",
  "distinct",
  "inner-join",
  "left-join",
  "join-boss",
];

export const LEVEL_XP_THRESHOLDS = [0, 2, 4, 6, 8, 12, 16, 20, 24] as const;

const XP_BY_RANK: Readonly<Record<Monster["rank"], number>> = {
  normal: 1,
  elite: 3,
  boss: 5,
};

export function experienceForRank(rank: Monster["rank"]): number {
  return XP_BY_RANK[rank];
}

export function levelForXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  return LEVEL_XP_THRESHOLDS.reduce(
    (level, threshold, index) => safeXp >= threshold ? index + 1 : level,
    1,
  );
}

function cloneMonsters(monsters: readonly Monster[]): Monster[] {
  return monsters.map((monster) => ({ ...monster }));
}

function cloneCombat(combat: CombatState | null): CombatState | null {
  return combat
    ? { ...combat, intent: { ...combat.intent, locks: [...combat.intent.locks] } }
    : null;
}

function cloneGraph(graph: RoomGraph): RoomGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      prerequisiteLessons: [...node.prerequisiteLessons],
      next: [...node.next],
    })),
  };
}

function cloneProfile(profile: ProfileProgress): ProfileProgress {
  return {
    version: 2,
    masteredLessons: [...profile.masteredLessons],
    attempts: { ...profile.attempts },
    victories: profile.victories,
    bestRunQueries: profile.bestRunQueries,
  };
}

function cloneItem(item: GroundItem): GroundItem {
  return {
    ...item,
    weapon: item.weapon ? { ...item.weapon } : undefined,
  };
}

function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}

function emptyProfile(): ProfileProgress {
  return {
    version: 2,
    masteredLessons: [],
    attempts: {
      select: 0,
      where: 0,
      "is-null": 0,
      "group-by": 0,
      having: 0,
      "order-by": 0,
      distinct: 0,
      "inner-join": 0,
      "left-join": 0,
      "join-boss": 0,
    },
    victories: 0,
    bestRunQueries: null,
  };
}

function rewardItemKind(reward: ClaimableReward): GroundItem["kind"] {
  if (reward.kind === "weapon") return "weapon";
  if (reward.kind === "relic") return "relic";
  if (reward.kind === "heal" || reward.kind === "cool") return "heal";
  if (reward.kind === "key") return "key";
  return "event";
}

function monstersForFloor(floor: FloorNumber): Monster[] {
  return cloneMonsters(INITIAL_MONSTERS.filter((monster) => monster.floor === floor));
}

function restoredMonstersForFloor(
  savedMonsters: readonly Monster[],
  floor: FloorNumber,
): Monster[] {
  const canonicalNames = new Map(
    monstersForFloor(floor).map((monster) => [monster.id, monster.name]),
  );
  return cloneMonsters(savedMonsters).map((monster) => ({
    ...monster,
    name: canonicalNames.get(monster.id) ?? monster.name,
  }));
}

function initialActors(
  graph: RoomGraph,
  floor: MazeFloor,
  monsters: readonly Monster[],
): WorldActor[] {
  return monsters
    .filter((monster) => monster.encounterType === "curriculum")
    .map((monster) => {
    const room = graph.nodes.find((node) => node.lessonId === monster.lessonId);
    const home = room ? floor.anchors[room.id] : floor.spawn;
    return {
      monsterId: monster.id,
      roomNodeId: room?.id ?? graph.entryId,
      x: home.x,
      y: home.y,
      home: { ...home },
      behavior: monster.isBoss ? "anchored" : monster.id === 800 ? "guard" : "wander",
      roamRadius: monster.id === 101 ? 3 : 4,
      moveTick: 0,
    };
    });
}

function initialGroundItems(graph: RoomGraph, floor: MazeFloor): GroundItem[] {
  const items: GroundItem[] = [];
  graph.nodes.forEach((node) => {
    if (node.lessonId || !node.reward) return;
    const reward = rewardDetails(node.reward);
    const position = floor.anchors[node.id];
    if (!reward || !position) return;
    items.push({
      id: `room-reward:${node.id}`,
      sourceRoomId: node.id,
      ...position,
      name: reward.name,
      description: reward.description,
      kind: rewardItemKind(reward),
      collection: "interact",
      rewardId: node.reward,
    });
  });
  return items;
}

export class GameSession {
  private floorNumber: FloorNumber = 1;
  private graph: RoomGraph;
  private mazeFloor: MazeFloor;
  private mode: GameSnapshot["mode"] = "explore";
  private currentRoomId: string;
  private player: PlayerState;
  private monsters = monstersForFloor(1);
  private worldActors: WorldActor[];
  private groundItems: GroundItem[];
  private discoveredCells = new Set<string>();
  private combat: CombatState | null = null;
  private visitedRoomIds = new Set<string>();
  private completedRoomIds = new Set<string>();
  private completedLessons = new Set<LessonId>();
  private openedGateIds = new Set<string>();
  private activeGateChallengeId: GateChallengeId | null = null;
  private relics: Relic[] = [];
  private selectedMonsterId: number | null = null;
  private queryCount = 0;
  private encounterMeter: EncounterMeter = {
    totalMoves: 0,
    stepsSinceEncounter: 0,
    safeStepsRemaining: INITIAL_SAFE_STEPS,
  };
  private hintLevel = 0;
  private banner = "迷宫已经生成。沿青色信标寻找 SELECT 数据石碑。";
  private profile: ProfileProgress;
  private readonly listeners = new Set<SessionListener>();

  constructor(
    savedRun?: SavedRun | null,
    profile?: ProfileProgress | null,
    seed = "sql-castle-demo",
  ) {
    this.profile = cloneProfile(profile ?? emptyProfile());
    this.graph = generateRoomGraph(seed, 1);
    this.mazeFloor = generateMazeFloor(this.graph);
    this.currentRoomId = this.graph.entryId;
    this.player = {
      ...this.mazeFloor.spawn,
      hp: 2,
      maxHp: 2,
      level: 1,
      xp: 0,
      heat: 0,
      weapon: { ...DATA_BLADE },
    };
    this.worldActors = initialActors(this.graph, this.mazeFloor, this.monsters);
    this.groundItems = initialGroundItems(this.graph, this.mazeFloor);
    this.visitedRoomIds.add(this.currentRoomId);
    this.completedRoomIds.add(this.currentRoomId);
    this.revealAt(this.player);

    if (savedRun?.version === 5 && savedRun.generatorVersion === 4) {
      this.floorNumber = savedRun.floor;
      this.graph = cloneGraph(savedRun.graph);
      this.mazeFloor = cloneMazeFloor(savedRun.mazeFloor);
      this.mode = savedRun.mode;
      this.currentRoomId = savedRun.currentRoomId;
      this.player = { ...savedRun.player, weapon: { ...savedRun.player.weapon } };
      this.monsters = restoredMonstersForFloor(savedRun.monsters, savedRun.floor);
      this.worldActors = savedRun.worldActors.map((savedActor) => {
        const actor = cloneWorldActor(savedActor);
        if (isActorPatrolPosition(actor, this.mazeFloor, actor)) return actor;
        return { ...actor, x: actor.home.x, y: actor.home.y };
      });
      this.groundItems = savedRun.groundItems.map(cloneItem);
      this.discoveredCells = new Set(savedRun.discoveredCells);
      this.combat = cloneCombat(savedRun.combat);
      this.visitedRoomIds = new Set(savedRun.visitedRoomIds);
      this.completedRoomIds = new Set(savedRun.completedRoomIds);
      this.completedLessons = new Set(savedRun.completedLessons);
      this.openedGateIds = new Set(savedRun.openedGateIds);
      this.activeGateChallengeId = savedRun.activeGateChallengeId;
      const masteredLessons = new Set([
        ...this.profile.masteredLessons,
        ...this.completedLessons,
      ]);
      this.profile.masteredLessons = LESSON_ORDER.filter((lesson) => masteredLessons.has(lesson));
      this.relics = savedRun.relics.map((relic) => ({ ...relic }));
      this.queryCount = savedRun.queryCount;
      this.encounterMeter = {
        totalMoves: savedRun.totalMoves,
        stepsSinceEncounter: savedRun.stepsSinceEncounter,
        safeStepsRemaining: savedRun.safeStepsRemaining,
      };
      this.hintLevel = savedRun.hintLevel;
      this.banner = savedRun.banner;
      this.selectedMonsterId = this.combat?.targetId ?? this.monsterForCurrentRoom()?.id ?? null;
      this.revealAt(this.player);
    }
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): GameSnapshot {
    const room = this.currentRoom();
    const lesson = this.currentLesson();
    const combatStages = this.currentCombatStages();
    const stageIndex = Math.min(this.combat?.successStep ?? 0, combatStages.length - 1);
    const stage = combatStages[stageIndex];
    const roomTarget = this.monsterForCurrentRoom();
    const target = this.combat
      ? this.monsters.find((monster) => monster.id === this.combat?.targetId)
      : roomTarget;
    const looseWeapon = this.availableWeaponLoot();
    const looseWeaponItem = looseWeapon
      ? this.groundItems.find((item) => item.weapon?.id === looseWeapon.weapon.id)
      : null;
    const roomReward = this.claimableRoomReward();
    const activeGateChallenge = this.activeGateChallengeId
      ? gateChallengeForFloor(this.floorNumber, this.challengeGateId())
      : null;
    const missionTitle = this.mode === "victory"
      ? "双层贯通 · RUN COMMITTED"
      : this.mode === "transition"
        ? "传送门启动 · FLOOR 02 LOADING"
      : this.mode === "defeat"
        ? "本轮回滚 · RUN ROLLBACK"
        : this.mode === "challenge" && activeGateChallenge
          ? activeGateChallenge.title
        : this.combat?.kind === "ambush"
          ? `${lesson.title} · 突发遭遇`
          : room.lessonId && roomTarget?.hp
          ? lesson.title
          : room.title;
    const missionBody = this.mode === "victory"
      ? "你关闭了雷鸣主核。两层 SQL 图鉴和练习记录已经永久保留。"
      : this.mode === "transition"
        ? "双表连接传送门已经展开。无需按键，正在自动进入雷鸣奏鸣塔。"
      : this.mode === "defeat"
        ? "生命值归零。开始新 Run 会重置迷宫、装备与生命，但不会删除已掌握知识。"
        : this.mode === "challenge" && activeGateChallenge
          ? activeGateChallenge.objective
        : looseWeapon
          ? looseWeaponItem?.collection === "interact"
            ? `装有 ${looseWeapon.weapon.name} 的战利品宝箱仍在迷宫中。靠近后按 E 打开。`
            : `走到发光掉落上自动拾取 ${looseWeapon.weapon.name}。`
          : roomReward
            ? `${roomReward.description} 站到核心旁按 E 调查。`
            : this.combat && target && target.hp > 0
              ? stage.objective
              : room.lessonId && roomTarget && roomTarget.hp > 0
              ? stage.objective
              : roomFlavor(room.type, this.floorNumber);

    return {
      mode: this.mode,
      lessonId: lesson.id,
      lessonStageId: stage.id,
      lessonStageIndex: stageIndex,
      player: { ...this.player, weapon: { ...this.player.weapon } },
      monsters: cloneMonsters(this.monsters),
      combat: cloneCombat(this.combat),
      focusMonsterId: this.combat?.targetId ?? this.selectedMonsterId ?? target?.id ?? null,
      roomGraph: cloneGraph(this.graph),
      mazeFloor: cloneMazeFloor(this.mazeFloor),
      worldActors: this.worldActors.map(cloneWorldActor),
      groundItems: this.groundItems.map(cloneItem),
      discoveredCells: [...this.discoveredCells],
      currentRoomId: this.currentRoomId,
      currentRoomTitle: room.title,
      currentRoomType: room.type,
      visitedRoomIds: [...this.visitedRoomIds],
      completedRoomIds: [...this.completedRoomIds],
      availableRoomIds: this.availableRoomIds(),
      completedLessons: [...this.completedLessons],
      challengeGateId: this.challengeGateId(),
      openedGateIds: [...this.openedGateIds],
      activeGateChallenge,
      relics: this.relics.map((relic) => ({ ...relic })),
      profile: cloneProfile(this.profile),
      availableLoot: looseWeapon,
      claimableReward: roomReward,
      runSeed: this.graph.seed,
      floor: this.floorNumber,
      queryCount: this.queryCount,
      stepsSinceEncounter: this.encounterMeter.stepsSinceEncounter,
      safeStepsRemaining: this.encounterMeter.safeStepsRemaining,
      hintLevel: this.hintLevel,
      missionTitle,
      missionBody,
      lessonIntro: activeGateChallenge
        ? "可选越级机关：破解只打开当前物理门，不授予课程掌握、经验或战利品。"
        : this.combat || room.lessonId ? lesson.intro : "",
      schema: activeGateChallenge
        ? [...activeGateChallenge.schema]
        : this.combat || room.lessonId
        ? [...lesson.schema]
        : ["当前区域没有强制查询。继续探索迷宫或调查发光核心。"],
      queryTemplate: stage.queryTemplate,
      hints: stage.hints.slice(0, this.hintLevel),
      locks: [...stage.locks],
      banner: this.banner,
      interactionPrompt: this.interactionPrompt(),
    };
  }

  toSavedRun(): SavedRun {
    return {
      version: 5,
      generatorVersion: 4,
      floor: this.floorNumber,
      graph: cloneGraph(this.graph),
      mazeFloor: cloneMazeFloor(this.mazeFloor),
      worldActors: this.worldActors.map(cloneWorldActor),
      groundItems: this.groundItems.map(cloneItem),
      discoveredCells: [...this.discoveredCells],
      mode: this.mode,
      currentRoomId: this.currentRoomId,
      player: { ...this.player, weapon: { ...this.player.weapon } },
      monsters: cloneMonsters(this.monsters),
      combat: cloneCombat(this.combat),
      visitedRoomIds: [...this.visitedRoomIds],
      completedRoomIds: [...this.completedRoomIds],
      completedLessons: [...this.completedLessons],
      openedGateIds: [...this.openedGateIds],
      activeGateChallengeId: this.activeGateChallengeId,
      relics: this.relics.map((relic) => ({ ...relic })),
      availableLoot: this.availableWeaponLoot(),
      claimableReward: this.claimableRoomReward(),
      queryCount: this.queryCount,
      totalMoves: this.encounterMeter.totalMoves,
      stepsSinceEncounter: this.encounterMeter.stepsSinceEncounter,
      safeStepsRemaining: this.encounterMeter.safeStepsRemaining,
      hintLevel: this.hintLevel,
      banner: this.banner,
    };
  }

  toProfile(): ProfileProgress {
    return cloneProfile(this.profile);
  }

  attemptPlayerMove(dx: number, dy: number): MoveResolution {
    const from = { x: this.player.x, y: this.player.y };
    const to = { x: from.x + dx, y: from.y + dy };
    if (["challenge", "combat", "transition", "victory", "defeat"].includes(this.mode)) {
      return this.moveFailure(from, to, "mode", "当前状态不能移动。");
    }

    const gate = mazeGateAt(this.mazeFloor, to);
    if (gate) {
      const gateRoom = this.graph.nodes.find((room) => room.id === gate.roomNodeId);
      const accessMessage = gateRoom ? this.roomAccessMessage(gateRoom) : null;
      if (accessMessage) {
        this.banner = accessMessage;
        this.emit();
        return this.moveFailure(from, to, "gate", accessMessage);
      }
    }

    if (!isMazeWalkable(
      this.mazeFloor,
      to.x,
      to.y,
      this.completedLessons,
      this.openedGateIds,
    )) {
      const missing = gate?.requires.filter((lesson) => !this.completedLessons.has(lesson)) ?? [];
      const message = missing.length > 0
        ? `知识门需要：${missing.map((lesson) => lessonById(lesson).concept).join("、")}。${
            gate?.id === this.challengeGateId() ? " 靠近按 E 可尝试高难越级破解。" : ""
          }`
        : "前方是无法穿过的魔王城石墙。";
      this.banner = message;
      this.emit();
      return this.moveFailure(from, to, gate ? "gate" : "wall", message);
    }

    const actor = this.livingActorAt(to);
    if (actor) {
      const encounter = this.engageActor(actor.monsterId);
      return {
        ok: encounter.ok,
        moved: false,
        from,
        to,
        encounterId: encounter.ok ? actor.monsterId : null,
        pickedItemIds: [],
        blockedBy: "none",
        message: encounter.message,
      };
    }

    this.player.x = to.x;
    this.player.y = to.y;
    this.revealAt(to);
    this.updateCurrentRoom(to);
    const pickedItemIds: string[] = [];
    const touchItems = this.groundItems.filter(
      (item) => item.collection === "touch" && item.x === to.x && item.y === to.y,
    );
    touchItems.forEach((item) => {
      const result = this.collectGroundItem(item, false);
      if (result.ok) pickedItemIds.push(item.id);
    });
    const encounterId = pickedItemIds.length === 0 && this.mode === "explore"
      ? this.rollAmbush()
      : null;
    if (pickedItemIds.length === 0 && encounterId === null && this.mode === "explore") {
      this.banner = `${this.currentRoom().title} · 已探索 ${this.discoveredCells.size} 格。`;
    }
    this.emit();
    return {
      ok: true,
      moved: true,
      from,
      to,
      encounterId,
      pickedItemIds,
      blockedBy: "none",
      message: this.banner,
    };
  }

  setPlayerPosition(x: number, y: number): boolean {
    if (["challenge", "combat", "transition", "victory", "defeat"].includes(this.mode)) return false;
    const currentZone = mazeZoneAt(this.mazeFloor, this.player);
    const targetZone = mazeZoneAt(this.mazeFloor, { x, y });
    if (targetZone && targetZone.roomNodeId !== currentZone?.roomNodeId) {
      const targetRoom = this.graph.nodes.find((room) => room.id === targetZone.roomNodeId);
      if (targetRoom && this.roomAccessMessage(targetRoom)) return false;
    }
    const actor = this.livingActorAt({ x, y });
    if (actor) return this.engageActor(actor.monsterId).ok;
    if (!isMazeWalkable(
      this.mazeFloor,
      x,
      y,
      this.completedLessons,
      this.openedGateIds,
    )) return false;
    this.player.x = x;
    this.player.y = y;
    this.revealAt(this.player);
    this.updateCurrentRoom(this.player);
    this.emit();
    return true;
  }

  travelToRoom(roomId: string): TravelResolution {
    if (["challenge", "combat", "transition", "victory", "defeat"].includes(this.mode)) {
      return this.travelFailure(roomId, "先结算当前战斗。");
    }
    const room = this.graph.nodes.find((node) => node.id === roomId);
    if (!room) return this.travelFailure(roomId, "未知迷宫区域。");
    const accessMessage = this.roomAccessMessage(room);
    if (accessMessage) return this.travelFailure(roomId, accessMessage);
    const anchor = this.mazeFloor.anchors[roomId];
    if (!anchor) return this.travelFailure(roomId, "区域缺少物理锚点。");
    const actor = this.actorForRoom(roomId);
    const candidates = [
      { x: anchor.x - 1, y: anchor.y },
      { x: anchor.x + 1, y: anchor.y },
      { x: anchor.x, y: anchor.y - 1 },
      { x: anchor.x, y: anchor.y + 1 },
      anchor,
    ];
    const destination = candidates.find(
      (position) =>
        isMazeWalkable(
          this.mazeFloor,
          position.x,
          position.y,
          this.completedLessons,
          this.openedGateIds,
        ) &&
        (!actor || position.x !== actor.x || position.y !== actor.y),
    ) ?? anchor;
    this.player.x = destination.x;
    this.player.y = destination.y;
    this.currentRoomId = roomId;
    this.visitedRoomIds.add(roomId);
    this.selectedMonsterId = this.monsterForCurrentRoom()?.id ?? null;
    this.revealAt(this.player);
    this.banner = `已进入 ${room.title}。移动触碰怪物才会开始战斗。`;
    this.emit();
    return { ok: true, roomId, message: this.banner };
  }

  startEncounter(monsterId: number): InteractionResolution {
    const actor = this.worldActors.find((entry) => entry.monsterId === monsterId);
    if (!actor || distance(actor, this.player) > 1) {
      return this.interactionFailure("怪物尚未与你发生接触。");
    }
    return this.engageActor(monsterId);
  }

  selectMonster(id: number): InteractionResolution {
    if (this.mode === "combat") {
      return this.interactionFailure("战斗目标已经锁定。");
    }
    const actor = this.actorForRoom(this.currentRoomId);
    const monster = this.monsters.find((entry) => entry.id === id && entry.hp > 0);
    if (!actor || actor.monsterId !== id || !monster) {
      return this.interactionFailure("这只怪物不在当前迷宫区域。");
    }
    this.selectedMonsterId = id;
    this.banner = `已扫描 ${monster.name}（ID #${monster.id}）：错误查询最高受到 ${monster.damage} 点伤害。`;
    this.emit();
    return { ok: true, kind: "none", message: this.banner };
  }

  interact(): InteractionResolution {
    if (["transition", "victory", "defeat"].includes(this.mode)) {
      if (this.mode === "transition") {
        return this.interactionFailure("传送门正在自动校准，无需按键。");
      }
      return this.interactionFailure("本轮已经结束。开始新 Run 可以再次挑战。");
    }
    if (this.mode === "combat") {
      return this.interactionFailure("战斗已经开始。按住 Q + S 打开 SQL 终端。");
    }
    if (this.mode === "challenge") {
      return this.interactionFailure("机关破解终端已经开启。提交查询或按 ESC 退出。");
    }
    const item = this.groundItems.find(
      (entry) => entry.collection === "interact" && distance(entry, this.player) <= 1,
    );
    if (item) return this.collectGroundItem(item, true);
    const challengeGate = this.nearbyLockedChallengeGate();
    if (challengeGate) {
      this.activeGateChallengeId = gateChallengeIdForFloor(this.floorNumber);
      this.mode = "challenge";
      const challenge = gateChallengeForFloor(this.floorNumber, challengeGate.id);
      this.banner = `${challenge.title} 已接入。错误查询会损失 1 点生命；ESC 可无代价退出。`;
      this.emit();
      return { ok: true, kind: "challenge", message: this.banner };
    }
    return this.interactionFailure("附近没有可调查对象。松散掉落需要走到它所在的格子。");
  }

  cancelGateChallenge(): boolean {
    if (this.mode !== "challenge" || !this.activeGateChallengeId) return false;
    this.mode = "explore";
    this.activeGateChallengeId = null;
    this.banner = "已断开越级破解终端。机关门仍保持锁定，退出不会损失生命。";
    this.emit();
    return true;
  }

  resolveGateChallenge(result: SqlQueryResult): GateChallengeResolution {
    const gateId = this.challengeGateId();
    if (this.mode !== "challenge" || !this.activeGateChallengeId) {
      return {
        accepted: false,
        opened: false,
        gateId,
        message: "当前没有正在破解的机关门。",
        playerDamage: 0,
        mode: this.mode,
      };
    }
    this.queryCount += 1;
    const evaluation = evaluateGateChallenge(this.floorNumber, result);
    if (evaluation.accepted) {
      this.openedGateIds.add(gateId);
      this.activeGateChallengeId = null;
      this.mode = "explore";
      this.banner = "越级查询通过：机关门已经永久开启。课程掌握、经验与战利品均未改变。";
      this.emit();
      return {
        accepted: true,
        opened: true,
        gateId,
        message: this.banner,
        playerDamage: 0,
        mode: this.mode,
      };
    }
    return this.failGateChallenge(evaluation.message);
  }

  registerGateChallengeError(message: string): GateChallengeResolution {
    if (this.mode !== "challenge" || !this.activeGateChallengeId) {
      return {
        accepted: false,
        opened: false,
        gateId: this.challengeGateId(),
        message,
        playerDamage: 0,
        mode: this.mode,
      };
    }
    this.queryCount += 1;
    return this.failGateChallenge(`SQL 无法执行：${message}`);
  }

  advanceMonsterPatrols(): PatrolBatchResolution {
    if (this.mode !== "explore") return { moves: [], encounterId: null };
    const moves: PatrolBatchResolution["moves"] = [];
    const blocked = new Set(this.groundItems.map(positionKey));
    const occupied = new Set(
      this.worldActors
        .filter((actor) => this.monsters.some((monster) => monster.id === actor.monsterId && monster.hp > 0))
        .map(positionKey),
    );

    for (let index = 0; index < this.worldActors.length; index += 1) {
      const actor = this.worldActors[index];
      const monster = this.monsters.find((entry) => entry.id === actor.monsterId);
      if (!monster || monster.hp <= 0) continue;
      const from = { x: actor.x, y: actor.y };
      occupied.delete(positionKey(actor));
      const resolution = advanceMonsterPatrol(actor, {
        floor: this.mazeFloor,
        completedLessons: this.completedLessons,
        player: this.player,
        occupied,
        blocked,
      });
      this.worldActors[index] = resolution.actor;
      occupied.add(positionKey(resolution.actor));
      moves.push({
        monsterId: actor.monsterId,
        from,
        to: { x: resolution.actor.x, y: resolution.actor.y },
        moved: resolution.moved,
      });
      if (resolution.encounter) {
        const encounter = this.engageActor(actor.monsterId);
        return { moves, encounterId: encounter.ok ? actor.monsterId : null };
      }
    }
    return { moves, encounterId: null };
  }

  requestHint(): string {
    const room = this.currentRoom();
    if (!room.lessonId && !this.combat) {
      const message = "当前区域没有 SQL 题。继续寻找怪物或知识门。";
      this.banner = message;
      this.emit();
      return message;
    }
    const stage = this.currentStage();
    this.hintLevel = Math.min(stage.hints.length, this.hintLevel + 1);
    const message = stage.hints[Math.max(0, this.hintLevel - 1)] ?? "暂无更多提示。";
    this.banner = `提示 ${this.hintLevel}/${stage.hints.length}：${message}`;
    this.emit();
    return message;
  }

  resolveQuery(result: SqlQueryResult): TurnResolution {
    if (this.mode !== "combat" || !this.combat) {
      return this.emptyTurn("先触碰当前区域的怪物进入遭遇。", result.targetIds);
    }
    const lesson = this.currentLesson();
    const stageIndex = this.combat.successStep;
    const combatStages = this.currentCombatStages();
    const stage = combatStages[Math.min(stageIndex, combatStages.length - 1)];
    this.queryCount += 1;
    this.profile.attempts[lesson.id] += 1;
    const relicCooling = this.relics.reduce((total, relic) => total + relic.heatReduction, 0);
    const heatAdded = Math.max(1, result.baseHeat - this.player.weapon.heatReduction - relicCooling);
    this.player.heat = Math.min(99, this.player.heat + heatAdded);
    const evaluation = evaluateStage(stage, result);
    const events: CombatEvent[] = [{ type: "query-cast", targetId: this.combat.targetId }];
    const hpUpdates: Array<{ id: number; hp: number }> = [];
    const killedIds: number[] = [];
    let playerDamage = 0;
    let stageAdvanced = false;
    let lessonCompleted: LessonId | null = null;
    let experience: ExperienceSettlement | null = null;

    if (evaluation.accepted) {
      const target = this.monsters.find((entry) => entry.id === this.combat?.targetId);
      if (target && target.hp > 0 && evaluation.attackTargetIds.includes(target.id)) {
        const nextSuccessStep = this.combat.successStep + 1;
        const minimumHp = nextSuccessStep < combatStages.length ? 1 : 0;
        const rawDamage = Math.max(1, this.player.weapon.damage - target.armor);
        const damage = Math.min(rawDamage, Math.max(1, target.hp - minimumHp));
        target.hp = Math.max(minimumHp, target.hp - damage);
        hpUpdates.push({ id: target.id, hp: target.hp });
        events.push({ type: "player-hit", targetId: target.id, amount: damage });
        this.combat.successStep = nextSuccessStep;
        this.combat.round += 1;
        stageAdvanced = true;

        if (target.hp === 0 && nextSuccessStep >= combatStages.length) {
          killedIds.push(target.id);
          events.push({ type: "death", targetId: target.id });
          experience = this.awardExperience(target);
          const experienceMessage = this.describeExperience(experience);
          if (this.combat.kind === "ambush") {
            this.completeAmbush(target, experienceMessage);
          } else {
            lessonCompleted = lesson.id;
            this.completeLesson(lesson, events, experienceMessage);
          }
        } else {
          const nextStage = combatStages[Math.min(nextSuccessStep, combatStages.length - 1)];
          this.combat.intent.locks = [...nextStage.locks];
          this.hintLevel = this.relics.some((relic) => relic.id === "schema-eye") ? 1 : 0;
          this.banner = `${evaluation.message} ${this.player.weapon.name} 命中，${target.name} 剩余 ${target.hp} HP。下一问：${nextStage.objective}`;
        }
      }
    } else {
      const target = this.monsters.find((monster) => monster.id === this.combat?.targetId);
      playerDamage = 1;
      this.player.hp = Math.max(0, this.player.hp - playerDamage);
      events.push({ type: "enemy-hit", sourceId: target?.id, amount: playerDamage });
      this.banner = `${evaluation.message} ${target?.name ?? "怪物"} 使用${target?.attackName ?? "反击"}，造成 ${playerDamage} 点伤害。`;
      if (this.player.hp === 0) {
        this.mode = "defeat";
        this.combat = null;
        this.banner += " 本轮迷宫与装备已失效，知识图鉴仍然保留。";
      } else {
        this.combat.round += 1;
      }
    }
    this.emit();
    return {
      accepted: evaluation.accepted,
      message: this.banner,
      queryTargetIds: result.targetIds,
      attackTargetIds: evaluation.attackTargetIds,
      hpUpdates,
      killedIds,
      playerDamage,
      heatAdded,
      locksBroken: evaluation.locksBroken,
      locksRemaining: evaluation.locksRemaining,
      events,
      mode: this.mode,
      stageAdvanced,
      lessonCompleted,
      experience,
    };
  }

  registerQueryError(message: string): TurnResolution {
    if (this.mode !== "combat" || !this.combat) {
      return this.emptyTurn(message, []);
    }
    const lesson = this.currentLesson();
    this.queryCount += 1;
    this.profile.attempts[lesson.id] += 1;
    this.player.heat = Math.min(99, this.player.heat + 1);
    const target = this.monsters.find((monster) => monster.id === this.combat?.targetId);
    const playerDamage = 1;
    this.player.hp = Math.max(0, this.player.hp - playerDamage);
    this.banner = `${message} ${target?.name ?? "怪物"} 趁终端失稳反击，造成 ${playerDamage} 点伤害。`;
    if (this.player.hp === 0) {
      this.mode = "defeat";
      this.combat = null;
      this.banner += " 本轮已经回滚，永久知识进度不受影响。";
    } else {
      this.combat.round += 1;
    }
    const events: CombatEvent[] = [
      { type: "enemy-hit", sourceId: target?.id, amount: playerDamage },
    ];
    this.emit();
    return {
      accepted: false,
      message: this.banner,
      queryTargetIds: [],
      attackTargetIds: [],
      hpUpdates: [],
      killedIds: [],
      playerDamage,
      heatAdded: 1,
      locksBroken: [],
      locksRemaining: [...this.currentStage().locks],
      events,
      mode: this.mode,
      stageAdvanced: false,
      lessonCompleted: null,
      experience: null,
    };
  }

  advanceFloor(): boolean {
    if (this.mode !== "transition" || this.floorNumber !== 1) return false;
    const nextSeed = `${this.graph.seed}:floor-2`;
    this.floorNumber = 2;
    this.graph = generateRoomGraph(nextSeed, 2);
    this.mazeFloor = generateMazeFloor(this.graph);
    this.mode = "explore";
    this.currentRoomId = this.graph.entryId;
    this.player = {
      ...this.player,
      ...this.mazeFloor.spawn,
      hp: Math.min(this.player.maxHp, Math.max(this.player.hp, 3)),
      heat: Math.max(0, this.player.heat - 12),
      weapon: { ...this.player.weapon },
    };
    this.monsters = monstersForFloor(2);
    this.worldActors = initialActors(this.graph, this.mazeFloor, this.monsters);
    this.groundItems = initialGroundItems(this.graph, this.mazeFloor);
    this.discoveredCells = new Set();
    this.combat = null;
    this.visitedRoomIds = new Set([this.currentRoomId]);
    this.completedRoomIds = new Set([this.currentRoomId]);
    this.completedLessons = new Set();
    this.openedGateIds = new Set();
    this.activeGateChallengeId = null;
    this.selectedMonsterId = null;
    this.encounterMeter = {
      totalMoves: 0,
      stepsSinceEncounter: 0,
      safeStepsRemaining: INITIAL_SAFE_STEPS,
    };
    this.hintLevel = 0;
    this.banner = "传送完成：已进入第二层「雷鸣奏鸣塔」。装备、遗物、等级与 XP 已保留。";
    this.revealAt(this.player);
    this.emit();
    return true;
  }

  reset(seed = `${this.graph.seed}-next`): void {
    this.floorNumber = 1;
    this.graph = generateRoomGraph(seed, 1);
    this.mazeFloor = generateMazeFloor(this.graph);
    this.mode = "explore";
    this.currentRoomId = this.graph.entryId;
    this.player = {
      ...this.mazeFloor.spawn,
      hp: 2,
      maxHp: 2,
      level: 1,
      xp: 0,
      heat: 0,
      weapon: { ...DATA_BLADE },
    };
    this.monsters = monstersForFloor(1);
    this.worldActors = initialActors(this.graph, this.mazeFloor, this.monsters);
    this.groundItems = initialGroundItems(this.graph, this.mazeFloor);
    this.discoveredCells = new Set();
    this.combat = null;
    this.visitedRoomIds = new Set([this.currentRoomId]);
    this.completedRoomIds = new Set([this.currentRoomId]);
    this.completedLessons.clear();
    this.openedGateIds.clear();
    this.activeGateChallengeId = null;
    this.relics = [];
    this.selectedMonsterId = null;
    this.queryCount = 0;
    this.encounterMeter = {
      totalMoves: 0,
      stepsSinceEncounter: 0,
      safeStepsRemaining: INITIAL_SAFE_STEPS,
    };
    this.hintLevel = 0;
    this.banner = "新的种子迷宫已经生成。局内装备已清空，SQL 图鉴保持不变。";
    this.revealAt(this.player);
    this.emit();
  }

  private currentRoom(): RoomNode {
    return this.graph.nodes.find((node) => node.id === this.currentRoomId) ?? this.graph.nodes[0];
  }

  private currentLesson(): LessonDefinition {
    const combatMonster = this.combat
      ? this.monsters.find((monster) => monster.id === this.combat?.targetId)
      : null;
    if (combatMonster) return lessonById(combatMonster.lessonId);
    const roomLesson = this.currentRoom().lessonId as LessonId | undefined;
    if (roomLesson) return lessonById(roomLesson);
    const floorLessons = lessonsForFloor(this.floorNumber);
    const nextLesson = floorLessons.find((id) => !this.completedLessons.has(id))
      ?? floorLessons[floorLessons.length - 1];
    return lessonById(nextLesson);
  }

  private currentStage(): LessonStageDefinition {
    const stages = this.currentCombatStages();
    const index = Math.min(this.combat?.successStep ?? 0, stages.length - 1);
    return stages[index];
  }

  private currentCombatStages(): readonly LessonStageDefinition[] {
    if (this.combat?.kind === "ambush") {
      const practice = practiceStageFor(this.combat.targetId);
      if (practice) return [practice];
    }
    return this.currentLesson().stages;
  }

  private monsterForCurrentRoom(): Monster | undefined {
    const actor = this.actorForRoom(this.currentRoomId);
    return actor ? this.monsters.find((monster) => monster.id === actor.monsterId) : undefined;
  }

  private actorForRoom(roomId: string): WorldActor | undefined {
    return this.worldActors.find((actor) => actor.roomNodeId === roomId);
  }

  private livingActorAt(position: Position): WorldActor | undefined {
    return this.worldActors.find((actor) => {
      const monster = this.monsters.find((entry) => entry.id === actor.monsterId);
      return monster && monster.hp > 0 && actor.x === position.x && actor.y === position.y;
    });
  }

  private availableRoomIds(): string[] {
    return this.graph.nodes
      .filter((room) => this.roomAccessMessage(room) === null)
      .map((room) => room.id);
  }

  private requiredCompletedRoomIds(room: RoomNode): string[] {
    return this.graph.nodes
      .filter((candidate) => (
        candidate.reward === "aggregate-hammer" && candidate.next.includes(room.id)
      ))
      .map((candidate) => candidate.id);
  }

  private roomAccessMessage(room: RoomNode): string | null {
    if (this.openedGateIds.has(`gate:${room.id}`)) return null;
    const missingLessons = room.prerequisiteLessons.filter(
      (lesson) => !this.completedLessons.has(lesson),
    );
    if (missingLessons.length > 0) {
      return `知识门仍需要：${missingLessons.map((lesson) => lessonById(lesson).concept).join("、")}。`;
    }
    const missingRooms = this.requiredCompletedRoomIds(room).filter(
      (roomId) => !this.completedRoomIds.has(roomId),
    );
    if (missingRooms.length > 0) {
      const shrine = this.graph.nodes.find((candidate) => candidate.id === missingRooms[0]);
      return `聚合门仍锁定：先在「${shrine?.title ?? "聚合战锤祭坛"}」调查核心并领取聚合战锤。`;
    }
    return null;
  }

  private engageActor(monsterId: number): InteractionResolution {
    if (this.mode !== "explore") {
      return this.interactionFailure("当前不能开始新的遭遇。");
    }
    const actor = this.worldActors.find((entry) => entry.monsterId === monsterId);
    const monster = this.monsters.find((entry) => entry.id === monsterId);
    const room = actor
      ? this.graph.nodes.find((entry) => entry.id === actor.roomNodeId)
      : undefined;
    if (!actor || !monster || !room?.lessonId || monster.hp <= 0) {
      return this.interactionFailure("这只怪物已经不再构成遭遇。");
    }
    const accessMessage = this.roomAccessMessage(room);
    if (accessMessage) return this.interactionFailure(accessMessage);
    const lesson = lessonById(room.lessonId);
    const stage = lesson.stages[0];
    this.currentRoomId = room.id;
    this.visitedRoomIds.add(room.id);
    this.mode = "combat";
    this.combat = {
      targetId: monster.id,
      kind: "curriculum",
      round: 1,
      successStep: 0,
      intent: {
        name: monster.attackName,
        damage: monster.damage,
        locks: [...stage.locks],
      },
    };
    this.selectedMonsterId = monster.id;
    this.hintLevel = this.relics.some((relic) => relic.id === "schema-eye") ? 1 : 0;
    this.banner = `触碰遭遇 ${monster.name}（ID #${monster.id}）。按住 Q + S 写出完整 SQL。`;
    this.emit();
    return { ok: true, kind: "combat", message: this.banner };
  }

  private rollAmbush(): number | null {
    const candidateIds = this.monsters
      .filter((monster) => {
        if (monster.encounterType !== "ambush" || monster.hp <= 0) return false;
        const lessonRoom = this.graph.nodes.find((room) => room.lessonId === monster.lessonId);
        return Boolean(lessonRoom) && this.roomAccessMessage(lessonRoom as RoomNode) === null;
      })
      .map((monster) => monster.id);
    const advance = advanceEncounterMeter(this.encounterMeter, this.graph.seed, candidateIds);
    this.encounterMeter = advance.meter;
    if (advance.targetId === null) return null;
    const monster = this.monsters.find((entry) => entry.id === advance.targetId);
    const stage = monster ? practiceStageFor(monster.id) : null;
    if (!monster || !stage) return null;

    this.mode = "combat";
    this.combat = {
      targetId: monster.id,
      kind: "ambush",
      round: 1,
      successStep: 0,
      intent: {
        name: monster.attackName,
        damage: 1,
        locks: [...stage.locks],
      },
    };
    this.selectedMonsterId = monster.id;
    this.hintLevel = this.relics.some((relic) => relic.id === "schema-eye") ? 1 : 0;
    this.banner = `突发遭遇 ${monster.name}（ID #${monster.id}）！完成这条 ${lessonById(monster.lessonId).concept} 练习即可脱身。`;
    return monster.id;
  }

  private awardExperience(monster: Monster): ExperienceSettlement {
    const gained = experienceForRank(monster.rank);
    const previousXp = this.player.xp;
    const previousLevel = this.player.level;
    const previousMaxHp = this.player.maxHp;
    this.player.xp += gained;
    this.player.level = levelForXp(this.player.xp);
    const levelsGained = this.player.level - previousLevel;
    if (levelsGained > 0) {
      this.player.maxHp += levelsGained;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + levelsGained);
    }
    return {
      monsterId: monster.id,
      monsterName: monster.name,
      gained,
      previousXp,
      currentXp: this.player.xp,
      previousLevel,
      currentLevel: this.player.level,
      previousMaxHp,
      currentMaxHp: this.player.maxHp,
    };
  }

  private describeExperience(experience: ExperienceSettlement): string {
    const levelsGained = experience.currentLevel - experience.previousLevel;
    if (levelsGained > 0) {
      return `获得 ${experience.gained} XP，升至 LV.${experience.currentLevel}，生命上限 +${levelsGained}。`;
    }
    return `获得 ${experience.gained} XP（${experience.currentXp} XP / LV.${experience.currentLevel}）。`;
  }

  private completeAmbush(monster: Monster, experienceMessage: string): void {
    this.combat = null;
    this.selectedMonsterId = null;
    this.mode = "explore";
    this.hintLevel = 0;
    this.encounterMeter = resetEncounterMeterAfterBattle(this.encounterMeter);
    this.banner = `${monster.name} 已清除。${experienceMessage} 接下来 5 步不会再次遭遇。`;
  }

  private completeLesson(
    lesson: LessonDefinition,
    events: CombatEvent[],
    experienceMessage: string,
  ): void {
    this.completedLessons.add(lesson.id);
    this.completedRoomIds.add(this.currentRoomId);
    if (!this.profile.masteredLessons.includes(lesson.id)) {
      this.profile.masteredLessons.push(lesson.id);
    }
    const actor = this.worldActors.find((entry) => entry.monsterId === lesson.primaryMonsterId);
    const dropPosition = actor ? { x: actor.x, y: actor.y } : this.mazeFloor.anchors[this.currentRoomId];
    this.combat = null;
    this.selectedMonsterId = null;
    this.mode = "explore";
    this.hintLevel = 0;
    this.encounterMeter = resetEncounterMeterAfterBattle(this.encounterMeter);

    const fixedLoot = LOOT_AFTER_LESSON[lesson.id];
    if (fixedLoot && dropPosition) {
      this.groundItems.push({
        id: `lesson-drop:${lesson.id}`,
        sourceRoomId: this.currentRoomId,
        ...dropPosition,
        name: fixedLoot.weapon.name,
        description: fixedLoot.weapon.description,
        kind: "weapon",
        collection: "interact",
        rewardId: null,
        weapon: { ...fixedLoot.weapon },
      });
      events.push({ type: "loot-drop", targetId: lesson.primaryMonsterId });
      this.banner = `${lesson.title} 完成，装有 ${fixedLoot.weapon.name} 的战利品宝箱已掉落。${experienceMessage} 靠近后按 E 打开。`;
      return;
    }

    const roomReward = rewardDetails(this.currentRoom().reward);
    if (roomReward && dropPosition) {
      this.groundItems.push({
        id: `lesson-drop:${lesson.id}`,
        sourceRoomId: this.currentRoomId,
        ...dropPosition,
        name: roomReward.name,
        description: roomReward.description,
        kind: rewardItemKind(roomReward),
        collection: "interact",
        rewardId: this.currentRoom().reward,
      });
      events.push({ type: "loot-drop", targetId: lesson.primaryMonsterId });
      this.banner = `${lesson.title} 完成，装有 ${roomReward.name} 的战利品宝箱已掉落。${experienceMessage} 靠近后按 E 打开。`;
      return;
    }
    this.banner = `${lesson.title} 已掌握。${experienceMessage} 继续探索迷宫。`;
  }

  private collectGroundItem(item: GroundItem, shouldEmit: boolean): InteractionResolution {
    const index = this.groundItems.findIndex((entry) => entry.id === item.id);
    if (index < 0) return this.interactionFailure("该物品已经被拾取。");
    const previousWeapon = { ...this.player.weapon };
    const previousHp = this.player.hp;
    if (item.weapon) {
      this.player.weapon = { ...item.weapon };
    } else if (item.rewardId) {
      this.applyReward(item.rewardId);
    }
    this.groundItems.splice(index, 1);
    this.completedRoomIds.add(item.sourceRoomId);
    const openedBattleChest = item.id.startsWith("lesson-drop:");
    if (item.rewardId === "floor-key") {
      if (this.floorNumber === 1) {
        this.mode = "transition";
        this.banner = `${openedBattleChest ? "打开战利品宝箱，" : ""}第一层钥匙已接入双表连接传送门。无需按键，1.2 秒后自动进入第二层。`;
      } else {
        this.mode = "victory";
        this.profile.victories += 1;
        this.profile.bestRunQueries = this.profile.bestRunQueries === null
          ? this.queryCount
          : Math.min(this.profile.bestRunQueries, this.queryCount);
        this.banner = `${openedBattleChest ? "打开战利品宝箱，" : ""}获得第二层钥匙。雷鸣主核已关闭，两层 SQL 图鉴均已永久更新。`;
      }
    } else if (
      item.weapon ||
      this.player.weapon.id !== previousWeapon.id ||
      this.player.weapon.damage !== previousWeapon.damage ||
      this.player.weapon.heatReduction !== previousWeapon.heatReduction
    ) {
      this.banner = `${openedBattleChest ? "打开战利品宝箱，" : ""}获得 ${item.name} · 伤害 ${previousWeapon.damage} → ${this.player.weapon.damage} · 热量减免 ${previousWeapon.heatReduction} → ${this.player.weapon.heatReduction}。${item.description}`;
    } else if (this.player.hp !== previousHp) {
      this.banner = `${openedBattleChest ? "打开战利品宝箱，" : ""}获得 ${item.name} · 生命 ${previousHp} → ${this.player.hp}。${item.description}`;
    } else {
      this.banner = `${openedBattleChest ? "打开战利品宝箱，" : ""}获得 ${item.name}。${item.description} 已加入本轮构筑。`;
    }
    if (shouldEmit) this.emit();
    return {
      ok: true,
      kind: item.weapon ? "loot" : "reward",
      message: this.banner,
    };
  }

  private applyReward(rewardId: RoomReward): void {
    if (rewardId === "restore-12-hp") {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
    } else if (rewardId === "restore-20-hp") {
      this.player.hp = this.player.maxHp;
    } else if (rewardId === "cool-8-heat" || rewardId === "reroll-token") {
      this.player.heat = Math.max(0, this.player.heat - 8);
    } else if (rewardId === "cool-12-heat") {
      this.player.heat = Math.max(0, this.player.heat - 12);
    } else if (rewardId === "hint-token") {
      this.addRelic(RELICS["schema-eye"]);
    } else if (rewardId === "schema-shard") {
      this.addRelic(RELICS["cache-chip"]);
    } else if (rewardId === "weapon-cache") {
      this.addRelic(RELICS["rollback-heart"]);
      this.player.maxHp += 1;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
    } else if (rewardId === "elite-query-lens") {
      this.addRelic(RELICS["query-lens"]);
    } else if (rewardId === "elite-transaction-shield") {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      this.player.heat = 0;
    } else if (rewardId === "aggregate-hammer") {
      this.player.weapon = { ...AGGREGATE_HAMMER };
    } else if (rewardId === "sort-saber") {
      this.player.weapon = { ...SORT_SABER };
    } else if (rewardId === "join-chain") {
      this.player.weapon = { ...JOIN_CHAIN };
    } else if (rewardId === "filter-rune") {
      this.player.weapon = { ...FILTER_BOW };
    } else if (rewardId === "null-lantern") {
      this.player.weapon = { ...NULL_LANTERN };
    } else if (rewardId === "data-blade") {
      this.player.weapon = { ...DATA_BLADE };
    }
  }

  private addRelic(relic: Relic): void {
    if (!this.relics.some((entry) => entry.id === relic.id)) {
      this.relics.push({ ...relic });
    }
  }

  private availableWeaponLoot(): LootDrop | null {
    const item = this.groundItems.find(
      (entry): entry is GroundItem & { weapon: Weapon } => Boolean(entry.weapon),
    );
    return item ? { x: item.x, y: item.y, weapon: { ...item.weapon } } : null;
  }

  private claimableRoomReward(): ClaimableReward | null {
    const item = this.groundItems.find(
      (entry) => entry.sourceRoomId === this.currentRoomId && entry.collection === "interact",
    );
    if (!item?.rewardId) return null;
    return rewardDetails(item.rewardId);
  }

  private updateCurrentRoom(position: Position): void {
    const zone = mazeZoneAt(this.mazeFloor, position);
    if (!zone || zone.roomNodeId === this.currentRoomId) return;
    this.currentRoomId = zone.roomNodeId;
    this.visitedRoomIds.add(zone.roomNodeId);
    const monster = this.monsterForCurrentRoom();
    this.selectedMonsterId = monster && monster.hp > 0 ? monster.id : null;
    const item = this.groundItems.find((entry) => entry.sourceRoomId === zone.roomNodeId);
    if (monster && monster.hp > 0) {
      this.banner = `${monster.name}（ID #${monster.id}）正在区域内巡逻。触碰才会开战。`;
    } else if (item) {
      this.banner = `${item.name} 在区域核心发光。靠近后${item.collection === "touch" ? "直接拾取" : "按 E 调查"}。`;
    } else {
      this.banner = `${this.currentRoom().title} 已记录到小地图。`;
    }
  }

  private revealAt(position: Position): void {
    revealAround(this.mazeFloor, position, 5).forEach((cell) => this.discoveredCells.add(cell));
  }

  private interactionPrompt(): string {
    if (this.mode === "challenge") return "机关破解中 · Ctrl + Enter 提交 · ESC 安全退出";
    if (this.mode === "combat") return "Q + S  打开 SQL 战斗终端";
    if (this.mode === "transition") return "双表连接传送门启动 · 自动进入第二层";
    if (this.mode === "victory") return "双层已贯通 · 可开始新 Run";
    if (this.mode === "defeat") return "本轮已回滚 · 知识图鉴仍保留";
    const interactItem = this.groundItems.find(
      (item) => item.collection === "interact" && distance(item, this.player) <= 1,
    );
    if (interactItem) {
      return interactItem.id.startsWith("lesson-drop:")
        ? `E  打开战利品宝箱 · ${interactItem.name}`
        : `E  调查 ${interactItem.name}`;
    }
    const challengeGate = this.nearbyLockedChallengeGate();
    if (challengeGate) return "E  接入高难 SQL 机关 · 错误会损失 1 点生命";
    const touchItem = this.groundItems.find((item) => distance(item, this.player) <= 2);
    if (touchItem) return `走到 ${touchItem.name} 上自动拾取`;
    const actor = this.actorForRoom(this.currentRoomId);
    const monster = actor
      ? this.monsters.find((entry) => entry.id === actor.monsterId && entry.hp > 0)
      : undefined;
    if (actor && monster) {
      return `触碰 ${monster.name}（ID #${monster.id}）进入战斗`;
    }
    return "探索迷宫 · 已走过的区域会显示在小地图";
  }

  private challengeGateId(): string {
    return `gate:${this.graph.bossId}`;
  }

  private nearbyLockedChallengeGate(): MazeFloor["gates"][number] | null {
    const gate = this.mazeFloor.gates.find((entry) => entry.id === this.challengeGateId());
    if (
      !gate ||
      this.openedGateIds.has(gate.id) ||
      distance(gate, this.player) > 1
    ) return null;
    const room = this.graph.nodes.find((entry) => entry.id === gate.roomNodeId);
    return room && this.roomAccessMessage(room) !== null ? gate : null;
  }

  private failGateChallenge(message: string): GateChallengeResolution {
    const gateId = this.challengeGateId();
    this.player.hp = Math.max(0, this.player.hp - 1);
    this.banner = `${message} 机关反噬造成 1 点伤害。`;
    if (this.player.hp === 0) {
      this.mode = "defeat";
      this.activeGateChallengeId = null;
      this.banner += " 生命归零，本轮已回滚；永久 SQL 图鉴不受影响。";
    }
    this.emit();
    return {
      accepted: false,
      opened: false,
      gateId,
      message: this.banner,
      playerDamage: 1,
      mode: this.mode,
    };
  }

  private moveFailure(
    from: Position,
    to: Position,
    blockedBy: MoveResolution["blockedBy"],
    message: string,
  ): MoveResolution {
    return {
      ok: false,
      moved: false,
      from,
      to,
      encounterId: null,
      pickedItemIds: [],
      blockedBy,
      message,
    };
  }

  private interactionFailure(message: string): InteractionResolution {
    this.banner = message;
    this.emit();
    return { ok: false, kind: "none", message };
  }

  private travelFailure(roomId: string, message: string): TravelResolution {
    this.banner = message;
    this.emit();
    return { ok: false, roomId, message };
  }

  private emptyTurn(message: string, queryTargetIds: number[]): TurnResolution {
    return {
      accepted: false,
      message,
      queryTargetIds,
      attackTargetIds: [],
      hpUpdates: [],
      killedIds: [],
      playerDamage: 0,
      heatAdded: 0,
      locksBroken: [],
      locksRemaining: [],
      events: [],
      mode: this.mode,
      stageAdvanced: false,
      lessonCompleted: null,
      experience: null,
    };
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
