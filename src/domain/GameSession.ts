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
  practiceStagesFor,
} from "../content/mvpLevel";
import {
  evaluateGateChallenge,
  gateChallengeForFloor,
  gateChallengeIdForFloor,
} from "../content/gateChallenges";
import { RELICS, rewardDetails, roomFlavor } from "../content/runContent";
import {
  CONSUMABLE_SLOT_CAPACITY,
  CONSUMABLE_STACK_CAPACITY,
  EQUIPMENT_CAPACITY,
  WEAPONS,
  lootCandidatesForBiome,
} from "../content/inventoryCatalog";
import {
  biomeEncounterFor,
  weightedBiomeEncounterIds,
} from "../content/biomeContent";
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
  recordSafeZoneMovement,
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
import {
  generateCampfires,
  isSafeZonePosition,
  nearbyCampfire,
  safeZoneCellKeys,
} from "./campfire";
import { evaluateStage } from "./lessonEvaluator";
import {
  cloneGuidedMapPlan,
  generateGuidedMapPlan,
  nearbyShortcut,
  shortcutDestination,
  type GuidedMapPlan,
} from "./guidedMap";
import { rollLootItems } from "./lootDirector";
import {
  biomeRegionAt,
  cloneBiomePlan,
  generateBiomePlan,
  type BiomePortal,
  type BiomePlan,
} from "./biome";
import {
  advanceCampaignProgress,
  cloneCampaignProgress,
  createCampaignProgress,
  type CampaignProgress,
} from "./campaign";
import { MAX_ANSWER_HISTORY } from "./types";
import type {
  AnswerAttemptRecord,
  Campfire,
  ClaimableReward,
  CombatEvent,
  CombatState,
  Consumable,
  ConsumableStack,
  EquipmentItem,
  ExperienceSettlement,
  GateChallengeId,
  GateChallengeResolution,
  GameSnapshot,
  GroundItem,
  InventoryResolution,
  InteractionResolution,
  LessonDefinition,
  LessonId,
  LessonStageDefinition,
  LootDrop,
  LootBundle,
  LootItem,
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

interface LootSpawnResolution {
  bundleCount: number;
  recoveryNames: string[];
}

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
  "f3-inner",
  "f3-left",
  "f3-self",
  "f3-chain",
  "f3-union",
  "f3-audit",
  "f4-scalar",
  "f4-in",
  "f4-exists",
  "f4-correlated",
  "f4-cte",
  "f4-recursive",
  "f5-over",
  "f5-row-number",
  "f5-rank",
  "f5-lag-lead",
  "f5-frame",
  "f5-top-n",
  "f6-insert",
  "f6-update",
  "f6-delete",
  "f6-constraint",
  "f6-transaction",
  "f6-savepoint",
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

function cloneAnswerHistory(records: readonly AnswerAttemptRecord[]): AnswerAttemptRecord[] {
  return records.map((record) => ({ ...record }));
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

function cloneEquipment(item: EquipmentItem): EquipmentItem {
  return {
    ...item,
    weapon: item.weapon ? { ...item.weapon } : undefined,
    armor: item.armor ? { ...item.armor } : undefined,
  };
}

function cloneConsumableStack(stack: ConsumableStack): ConsumableStack {
  return {
    item: { ...stack.item },
    quantity: stack.quantity,
  };
}

function cloneLootItem(item: LootItem): LootItem {
  return {
    ...item,
    weapon: item.weapon ? { ...item.weapon } : undefined,
    armor: item.armor ? { ...item.armor } : undefined,
    consumable: item.consumable ? { ...item.consumable } : undefined,
  };
}

function cloneLootBundle(bundle: LootBundle): LootBundle {
  return {
    ...bundle,
    items: bundle.items.map(cloneLootItem),
  };
}

function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function allMapCellKeys(floor: MazeFloor): string[] {
  return floor.tiles.flatMap((row, y) => (
    [...row].map((_tile, x) => `${x}:${y}`)
  ));
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
      "f3-inner": 0,
      "f3-left": 0,
      "f3-self": 0,
      "f3-chain": 0,
      "f3-union": 0,
      "f3-audit": 0,
      "f4-scalar": 0,
      "f4-in": 0,
      "f4-exists": 0,
      "f4-correlated": 0,
      "f4-cte": 0,
      "f4-recursive": 0,
      "f5-over": 0,
      "f5-row-number": 0,
      "f5-rank": 0,
      "f5-lag-lead": 0,
      "f5-frame": 0,
      "f5-top-n": 0,
      "f6-insert": 0,
      "f6-update": 0,
      "f6-delete": 0,
      "f6-constraint": 0,
      "f6-transaction": 0,
      "f6-savepoint": 0,
      "f7-btree": 0,
      "f7-composite": 0,
      "f7-covering": 0,
      "f7-invalid": 0,
      "f7-plan": 0,
      "f7-optimize": 0,
      "f8-mvcc": 0,
      "f8-lock": 0,
      "f8-isolation": 0,
      "f8-modeling": 0,
      "f8-replication": 0,
      "f8-sharding": 0,
      "f8-security": 0,
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
  const savedById = new Map(savedMonsters.map((monster) => [monster.id, monster]));
  return monstersForFloor(floor).map((canonical) => {
    const saved = savedById.get(canonical.id);
    return saved
      ? {
          ...canonical,
          hp: Math.min(canonical.maxHp, Math.max(0, saved.hp)),
        }
      : { ...canonical };
  });
}

function initialActors(
  graph: RoomGraph,
  floor: MazeFloor,
  monsters: readonly Monster[],
  biomePlan: BiomePlan,
): WorldActor[] {
  const curriculumActors: WorldActor[] = monsters
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
  const areaBossActors = biomePlan.regions.flatMap((region) => {
    if (region.areaBossId === null || region.areaBossPosition === null) return [];
    const monster = monsters.find((entry) => entry.id === region.areaBossId);
    const room = graph.nodes.find((entry) => entry.lessonId === monster?.lessonId);
    if (!monster || !room) return [];
    return [{
      monsterId: monster.id,
      roomNodeId: room.id,
      ...region.areaBossPosition,
      home: { ...region.areaBossPosition },
      behavior: "anchored" as const,
      roamRadius: 0,
      moveTick: 0,
    }];
  });
  return [...curriculumActors, ...areaBossActors];
}

function restoredActorsForFloor(
  savedActors: readonly WorldActor[],
  expectedActors: readonly WorldActor[],
): WorldActor[] {
  const savedByMonster = new Map(
    savedActors.map((actor) => [actor.monsterId, actor]),
  );
  return expectedActors.map((expected) => (
    cloneWorldActor(savedByMonster.get(expected.monsterId) ?? expected)
  ));
}

function initialGroundItems(graph: RoomGraph, floor: MazeFloor): GroundItem[] {
  const items: GroundItem[] = [];
  graph.nodes.forEach((node) => {
    if (node.lessonId || node.type === "rest" || !node.reward) return;
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
  private campaign: CampaignProgress;
  private floorNumber: FloorNumber = 1;
  private graph: RoomGraph;
  private mazeFloor: MazeFloor;
  private campfires: Campfire[];
  private guidedMap: GuidedMapPlan;
  private biomePlan: BiomePlan;
  private activeCampfireId: string | null = null;
  private respawnCampfireId: string | null = null;
  private activeLootBundleId: string | null = null;
  private mode: GameSnapshot["mode"] = "explore";
  private currentRoomId: string;
  private player: PlayerState;
  private monsters = monstersForFloor(1);
  private worldActors: WorldActor[];
  private groundItems: GroundItem[];
  private lootBundles: LootBundle[] = [];
  private equipmentInventory: EquipmentItem[] = [];
  private consumables: ConsumableStack[] = [];
  private keyItems: string[] = [];
  private acquiredUniqueItemIds = new Set<string>(["data-blade"]);
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
  private answerHistory: AnswerAttemptRecord[] = [];
  private battleSequence = 0;
  private reviewBattleId: number | null = null;
  private banner = "迷宫已经生成。沿青色信标寻找 SELECT 数据石碑。";
  private adminMode = false;
  private adminPanelOpen = false;
  private regionTransferSequence = 0;
  private regionTransfer: GameSnapshot["regionTransfer"] = null;
  private profile: ProfileProgress;
  private readonly listeners = new Set<SessionListener>();

  constructor(
    savedRun?: SavedRun | null,
    profile?: ProfileProgress | null,
    seed = "sql-castle-demo",
  ) {
    this.profile = cloneProfile(profile ?? emptyProfile());
    this.campaign = createCampaignProgress(seed);
    this.graph = generateRoomGraph(seed, 1);
    this.mazeFloor = generateMazeFloor(this.graph);
    this.campfires = generateCampfires(this.graph, this.mazeFloor);
    this.guidedMap = generateGuidedMapPlan(
      this.graph,
      this.mazeFloor,
      this.campfires,
    );
    this.biomePlan = generateBiomePlan(
      this.graph,
      this.mazeFloor,
      this.campfires,
      this.guidedMap,
    );
    this.currentRoomId = this.graph.entryId;
    this.player = {
      ...this.mazeFloor.spawn,
      hp: 2,
      maxHp: 2,
      level: 1,
      xp: 0,
      heat: 0,
      weapon: { ...DATA_BLADE },
      armor: null,
      armorHp: 0,
    };
    this.worldActors = initialActors(
      this.graph,
      this.mazeFloor,
      this.monsters,
      this.biomePlan,
    );
    this.groundItems = initialGroundItems(this.graph, this.mazeFloor);
    this.visitedRoomIds.add(this.currentRoomId);
    this.completedRoomIds.add(this.currentRoomId);
    this.revealAt(this.player);

    if (savedRun?.version === 10 && savedRun.generatorVersion === 4) {
      this.campaign = cloneCampaignProgress(savedRun.campaign);
      this.floorNumber = savedRun.floor;
      this.graph = cloneGraph(savedRun.graph);
      this.mazeFloor = cloneMazeFloor(savedRun.mazeFloor);
      this.campfires = savedRun.campfires.map((campfire) => ({
        ...campfire,
        restPosition: { ...campfire.restPosition },
      }));
      this.guidedMap = generateGuidedMapPlan(
        this.graph,
        this.mazeFloor,
        this.campfires,
      );
      this.biomePlan = generateBiomePlan(
        this.graph,
        this.mazeFloor,
        this.campfires,
        this.guidedMap,
      );
      this.activeCampfireId = savedRun.activeCampfireId;
      this.respawnCampfireId = savedRun.respawnCampfireId;
      this.activeLootBundleId = savedRun.activeLootBundleId;
      this.mode = savedRun.mode;
      this.currentRoomId = savedRun.currentRoomId;
      this.player = {
        ...savedRun.player,
        weapon: { ...savedRun.player.weapon },
        armor: savedRun.player.armor ? { ...savedRun.player.armor } : null,
      };
      this.monsters = restoredMonstersForFloor(savedRun.monsters, savedRun.floor);
      const expectedActors = initialActors(
        this.graph,
        this.mazeFloor,
        this.monsters,
        this.biomePlan,
      );
      this.worldActors = restoredActorsForFloor(
        savedRun.worldActors,
        expectedActors,
      ).map((savedActor) => {
        const actor = cloneWorldActor(savedActor);
        if (
          actor.behavior === "anchored" ||
          isActorPatrolPosition(actor, this.mazeFloor, actor)
        ) return actor;
        return { ...actor, x: actor.home.x, y: actor.home.y };
      });
      this.groundItems = savedRun.groundItems.map(cloneItem);
      this.lootBundles = savedRun.lootBundles.map(cloneLootBundle);
      this.equipmentInventory = savedRun.equipmentInventory.map(cloneEquipment);
      this.consumables = savedRun.consumables.map(cloneConsumableStack);
      this.keyItems = [...savedRun.keyItems];
      this.acquiredUniqueItemIds = new Set(savedRun.acquiredUniqueItemIds);
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
      this.answerHistory = cloneAnswerHistory(savedRun.answerHistory);
      this.battleSequence = savedRun.battleSequence;
      this.reviewBattleId = savedRun.reviewBattleId;
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
      ? "八层贯通 · RUN COMMITTED"
      : this.mode === "transition"
        ? `传送门启动 · FLOOR ${String(this.floorNumber + 1).padStart(2, "0")} LOADING`
      : this.mode === "defeat"
        ? "生命归零 · YOU DIED"
        : this.mode === "death-review"
          ? "死亡复盘 · RETURN TO CHECKPOINT"
        : this.mode === "campfire"
          ? "篝火休整 · CHECKPOINT"
        : this.mode === "inventory"
          ? "装备背包 · LOADOUT"
        : this.mode === "loot"
          ? "战利品包 · LOOT"
        : this.mode === "challenge" && activeGateChallenge
          ? activeGateChallenge.title
        : this.combat?.kind === "ambush"
          ? `${lesson.title} · 突发遭遇`
          : room.lessonId && roomTarget?.hp
          ? lesson.title
          : room.title;
    const missionBody = this.mode === "victory"
      ? "你击败了魔王。八层 SQL 图鉴和练习记录已经永久保留。"
      : this.mode === "transition"
        ? `第 ${this.floorNumber + 1} 层传送门已经展开。无需按键，正在自动进入下一层。`
      : this.mode === "defeat"
        ? "生命值归零。正在返回最近休息的篝火；尚未休息时返回本层出生点。"
        : this.mode === "death-review"
          ? "生命已恢复。先复盘导致本次死亡的战斗，再重新出发。"
        : this.mode === "campfire"
          ? "选择在此休息恢复满生命并更新复活点，或查看当前楼层答案复盘。"
        : this.mode === "inventory"
          ? "管理 12 格装备背包、当前武器、防具和三格恢复品；战斗中不能换装。"
        : this.mode === "loot"
          ? "处理战利品包。背包已满时物品会留在包中，不会静默消失。"
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
      adminMode: this.adminMode,
      adminPanelOpen: this.adminPanelOpen,
      regionTransfer: this.regionTransfer ? { ...this.regionTransfer } : null,
      campaign: cloneCampaignProgress(this.campaign),
      biomePlan: cloneBiomePlan(this.biomePlan),
      currentBiome: biomeRegionAt(this.biomePlan, this.player).kind,
      lessonId: lesson.id,
      lessonStageId: stage.id,
      lessonStageIndex: stageIndex,
      player: {
        ...this.player,
        weapon: { ...this.player.weapon },
        armor: this.player.armor ? { ...this.player.armor } : null,
      },
      monsters: cloneMonsters(this.monsters),
      combat: cloneCombat(this.combat),
      focusMonsterId: this.combat?.targetId ?? this.selectedMonsterId ?? target?.id ?? null,
      roomGraph: cloneGraph(this.graph),
      mazeFloor: cloneMazeFloor(this.mazeFloor),
      guidedMap: cloneGuidedMapPlan(this.guidedMap),
      campfires: this.campfires.map((campfire) => ({
        ...campfire,
        restPosition: { ...campfire.restPosition },
      })),
      activeCampfireId: this.activeCampfireId,
      respawnCampfireId: this.respawnCampfireId,
      activeLootBundleId: this.activeLootBundleId,
      inSafeZone: isSafeZonePosition(this.mazeFloor, this.campfires, this.player),
      worldActors: this.worldActors.map(cloneWorldActor),
      groundItems: this.groundItems.map(cloneItem),
      lootBundles: this.lootBundles.map(cloneLootBundle),
      equipmentInventory: this.equipmentInventory.map(cloneEquipment),
      consumables: this.consumables.map(cloneConsumableStack),
      keyItems: [...this.keyItems],
      acquiredUniqueItemIds: [...this.acquiredUniqueItemIds],
      discoveredCells: this.adminMode
        ? allMapCellKeys(this.mazeFloor)
        : [...this.discoveredCells],
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
      totalMoves: this.encounterMeter.totalMoves,
      stepsSinceEncounter: this.encounterMeter.stepsSinceEncounter,
      safeStepsRemaining: this.encounterMeter.safeStepsRemaining,
      hintLevel: this.hintLevel,
      battleReview: cloneAnswerHistory(this.answerHistory.filter(
        (record) => record.battleId === this.reviewBattleId,
      )),
      floorReview: cloneAnswerHistory(this.answerHistory.filter(
        (record) => record.floor === this.floorNumber,
      )),
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
      version: 10,
      generatorVersion: 4,
      campaign: cloneCampaignProgress(this.campaign),
      floor: this.floorNumber,
      graph: cloneGraph(this.graph),
      mazeFloor: cloneMazeFloor(this.mazeFloor),
      campfires: this.campfires.map((campfire) => ({
        ...campfire,
        restPosition: { ...campfire.restPosition },
      })),
      activeCampfireId: this.activeCampfireId,
      respawnCampfireId: this.respawnCampfireId,
      activeLootBundleId: this.activeLootBundleId,
      worldActors: this.worldActors.map(cloneWorldActor),
      groundItems: this.groundItems.map(cloneItem),
      lootBundles: this.lootBundles.map(cloneLootBundle),
      equipmentInventory: this.equipmentInventory.map(cloneEquipment),
      consumables: this.consumables.map(cloneConsumableStack),
      keyItems: [...this.keyItems],
      acquiredUniqueItemIds: [...this.acquiredUniqueItemIds],
      discoveredCells: [...this.discoveredCells],
      mode: this.mode,
      currentRoomId: this.currentRoomId,
      player: {
        ...this.player,
        weapon: { ...this.player.weapon },
        armor: this.player.armor ? { ...this.player.armor } : null,
      },
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
      answerHistory: cloneAnswerHistory(this.answerHistory),
      battleSequence: this.battleSequence,
      reviewBattleId: this.reviewBattleId,
      banner: this.banner,
    };
  }

  toProfile(): ProfileProgress {
    return cloneProfile(this.profile);
  }

  attemptPlayerMove(dx: number, dy: number): MoveResolution {
    const from = { x: this.player.x, y: this.player.y };
    const to = { x: from.x + dx, y: from.y + dy };
    if (this.adminPanelOpen || [
      "campfire",
      "inventory",
      "loot",
      "death-review",
      "challenge",
      "combat",
      "transition",
      "victory",
      "defeat",
    ].includes(this.mode)) {
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

    const blockingCampfire = this.campfires.find(
      (campfire) => campfire.x === to.x && campfire.y === to.y,
    );
    if (blockingCampfire) {
      const message = "篝火正在燃烧。站到相邻格按 E 休息。";
      this.banner = message;
      this.emit();
      return this.moveFailure(from, to, "campfire", message);
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
    const encounterId = this.mode === "explore"
      ? this.rollAmbush(pickedItemIds.length === 0)
      : null;
    if (pickedItemIds.length === 0 && encounterId === null && this.mode === "explore") {
      const biome = biomeRegionAt(this.biomePlan, this.player);
      this.banner = `${biome.name} · ${this.currentRoom().title} · 已探索 ${this.discoveredCells.size} 格。`;
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
    if ([
      "campfire",
      "inventory",
      "loot",
      "death-review",
      "challenge",
      "combat",
      "transition",
      "victory",
      "defeat",
    ].includes(this.mode)) return false;
    const currentZone = mazeZoneAt(this.mazeFloor, this.player);
    const targetZone = mazeZoneAt(this.mazeFloor, { x, y });
    if (targetZone && targetZone.roomNodeId !== currentZone?.roomNodeId) {
      const targetRoom = this.graph.nodes.find((room) => room.id === targetZone.roomNodeId);
      if (targetRoom && this.roomAccessMessage(targetRoom)) return false;
    }
    const actor = this.livingActorAt({ x, y });
    if (actor) return this.engageActor(actor.monsterId).ok;
    if (this.campfires.some((campfire) => campfire.x === x && campfire.y === y)) return false;
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
    if ([
      "campfire",
      "inventory",
      "loot",
      "death-review",
      "challenge",
      "combat",
      "transition",
      "victory",
      "defeat",
    ].includes(this.mode)) {
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
        (!actor || position.x !== actor.x || position.y !== actor.y) &&
        !this.campfires.some(
          (campfire) => campfire.x === position.x && campfire.y === position.y,
        ),
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

  retreatFromCombat(): InteractionResolution {
    if (this.mode !== "combat" || !this.combat) {
      return this.interactionFailure("当前没有可以撤退的战斗。");
    }
    const campfire = this.respawnCampfireId
      ? this.campfires.find((entry) => entry.id === this.respawnCampfireId)
      : null;
    const destination = campfire?.restPosition ?? this.mazeFloor.spawn;
    this.player.x = destination.x;
    this.player.y = destination.y;
    this.combat = null;
    this.selectedMonsterId = null;
    this.mode = "explore";
    this.hintLevel = 0;
    this.regionTransfer = null;
    this.encounterMeter = resetEncounterMeterAfterBattle(this.encounterMeter);
    this.updateCurrentRoom(destination);
    this.revealAt(destination);
    this.banner = campfire
      ? `已撤退到${this.campfirePhaseName(campfire)}复活点。生命与护甲保持当前值，怪物生命也不会重置。`
      : "已撤退到本层出生安全区。生命与护甲保持当前值，怪物生命也不会重置。";
    this.emit();
    return { ok: true, kind: "none", message: this.banner };
  }

  interact(): InteractionResolution {
    if (["transition", "victory", "defeat", "death-review", "inventory", "loot"].includes(this.mode)) {
      if (this.mode === "transition") {
        return this.interactionFailure("传送门正在自动校准，无需按键。");
      }
      if (this.mode === "death-review") {
        return this.interactionFailure("先完成本场死亡复盘，再重新出发。");
      }
      if (this.mode === "defeat") {
        return this.interactionFailure("正在返回最近篝火。");
      }
      if (this.mode === "inventory") {
        return this.interactionFailure("背包已经打开。先处理装备或关闭背包。");
      }
      if (this.mode === "loot") {
        return this.interactionFailure("战利品包已经打开。先处理物品或返回探索。");
      }
      return this.interactionFailure("本轮已经结束。开始新 Run 可以再次挑战。");
    }
    if (this.mode === "campfire") {
      return this.interactionFailure("篝火菜单已经打开。请选择休息、答案复盘或返回探索。");
    }
    if (this.mode === "combat") {
      return this.interactionFailure("战斗已经开始。按住 Q + S 打开 SQL 终端。");
    }
    if (this.mode === "challenge") {
      return this.interactionFailure("机关破解终端已经开启。提交查询或按 ESC 退出。");
    }
    const campfire = nearbyCampfire(this.campfires, this.player);
    if (campfire) {
      this.activeCampfireId = campfire.id;
      this.mode = "campfire";
      this.banner = `${this.campfirePhaseName(campfire)}已点燃。可以在此休息，或复盘第 ${this.floorNumber} 层答案。`;
      this.emit();
      return { ok: true, kind: "campfire", message: this.banner };
    }
    const nearbyLootBundle = [...this.lootBundles].reverse().find(
      (entry) => distance(entry, this.player) <= 1,
    );
    const nearbyGroundItem = this.groundItems.find(
      (entry) => entry.collection === "interact" && distance(entry, this.player) <= 1,
    );
    if (nearbyLootBundle && distance(nearbyLootBundle, this.player) === 0) {
      return this.openLootBundle(nearbyLootBundle);
    }
    if (nearbyGroundItem && distance(nearbyGroundItem, this.player) === 0) {
      return this.collectGroundItem(nearbyGroundItem, true);
    }
    const shortcutKey = this.guidedMap.shortcuts.find((shortcut) => (
      !this.keyItems.includes(shortcut.keyId) &&
      distance(shortcut.keyPosition, this.player) <= 1
    ));
    if (shortcutKey) {
      this.keyItems.push(shortcutKey.keyId);
      this.banner = `获得捷径钥匙：${shortcutKey.name}。回到任一捷径门旁按 E，即可永久开启本层往返通道。`;
      this.emit();
      return { ok: true, kind: "shortcut", message: this.banner };
    }
    const deadEndCache = this.guidedMap.deadEndCaches.find((cache) => (
      !this.openedGateIds.has(cache.id) &&
      distance(cache, this.player) <= 1
    ));
    if (deadEndCache) {
      const reward = rewardDetails(deadEndCache.rewardId);
      this.applyReward(deadEndCache.rewardId);
      this.openedGateIds.add(deadEndCache.id);
      this.banner = `打开死路补给：${reward?.name ?? "补给"}。${reward?.description ?? "本层探索收益已结算。"}`;
      this.emit();
      return { ok: true, kind: "reward", message: this.banner };
    }
    const regionPortal = this.nearbyRegionPortal();
    if (regionPortal) {
      return this.travelThroughRegionPortal(regionPortal.portal, regionPortal.side);
    }
    const nearbyGuidedShortcut = nearbyShortcut(this.guidedMap, this.player);
    if (nearbyGuidedShortcut) {
      const { shortcut, side } = nearbyGuidedShortcut;
      if (!this.openedGateIds.has(shortcut.id)) {
        if (!this.keyItems.includes(shortcut.keyId)) {
          return this.interactionFailure(
            `${shortcut.name} 已锁定。捷径钥匙保证出现在本层中后段，不依赖怪物随机掉落。`,
          );
        }
        const missingLessons = shortcut.requires.filter(
          (lesson) => !this.completedLessons.has(lesson),
        );
        if (missingLessons.length > 0) {
          return this.interactionFailure(
            `捷径机关尚未稳定：先完成 ${missingLessons.map((lesson) => lessonById(lesson).concept).join("、")}。`,
          );
        }
        this.openedGateIds.add(shortcut.id);
        this.banner = `${shortcut.name} 已永久开启。本 Run 中死亡或休息都不会重新上锁；再次按 E 可快速往返。`;
        this.emit();
        return { ok: true, kind: "shortcut", message: this.banner };
      }
      const destination = shortcutDestination(shortcut, side);
      this.player.x = destination.x;
      this.player.y = destination.y;
      this.revealAt(destination);
      this.updateCurrentRoom(destination);
      this.banner = `穿过${shortcut.name}，跳过 ${shortcut.detourDistance} 格已探索折返路。`;
      this.emit();
      return { ok: true, kind: "shortcut", message: this.banner };
    }
    if (nearbyLootBundle) return this.openLootBundle(nearbyLootBundle);
    if (nearbyGroundItem) return this.collectGroundItem(nearbyGroundItem, true);
    const challengeGate = this.nearbyLockedChallengeGate();
    if (challengeGate) {
      this.activeGateChallengeId = gateChallengeIdForFloor(this.floorNumber);
      this.mode = "challenge";
      const challenge = gateChallengeForFloor(this.floorNumber, challengeGate.id);
      this.banner = `${challenge.title} 已接入。错误查询造成 1 点伤害（护甲优先）；ESC 可无代价退出。`;
      this.emit();
      return { ok: true, kind: "challenge", message: this.banner };
    }
    return this.interactionFailure("附近没有可调查对象。松散掉落需要走到它所在的格子。");
  }

  restAtCampfire(): InteractionResolution {
    if (this.mode !== "campfire" || !this.activeCampfireId) {
      return this.interactionFailure("当前没有正在使用的篝火。");
    }
    const campfire = this.campfires.find((entry) => entry.id === this.activeCampfireId);
    if (!campfire) return this.interactionFailure("当前篝火记录已经失效。");
    const previousHp = this.player.hp;
    this.player.hp = this.player.maxHp;
    const previousArmor = this.player.armorHp;
    this.player.armorHp = this.player.armor?.maxArmor ?? 0;
    this.respawnCampfireId = campfire.id;
    this.activeCampfireId = null;
    this.mode = "explore";
    this.encounterMeter = resetEncounterMeterAfterBattle(this.encounterMeter);
    this.banner = `${this.campfirePhaseName(campfire)}休息完成：生命 ${previousHp} → ${this.player.hp}，护甲 ${previousArmor} → ${this.player.armorHp}，这里已成为当前复活点。`;
    this.emit();
    return { ok: true, kind: "campfire", message: this.banner };
  }

  leaveCampfire(): boolean {
    if (this.mode !== "campfire") return false;
    this.activeCampfireId = null;
    this.mode = "explore";
    this.banner = "离开篝火，继续探索。";
    this.emit();
    return true;
  }

  openInventory(): boolean {
    if (this.mode !== "explore" && this.mode !== "campfire") return false;
    this.mode = "inventory";
    this.banner = `背包已打开：装备 ${this.equipmentInventory.length}/${EQUIPMENT_CAPACITY}，恢复品 ${this.consumables.length}/${CONSUMABLE_SLOT_CAPACITY}。`;
    this.emit();
    return true;
  }

  closeInventory(): boolean {
    if (this.mode !== "inventory") return false;
    this.mode = this.activeCampfireId ? "campfire" : "explore";
    this.banner = this.activeCampfireId ? "返回篝火菜单。" : "背包已关闭，继续探索。";
    this.emit();
    return true;
  }

  closeLootBundle(): boolean {
    if (this.mode !== "loot") return false;
    this.activeLootBundleId = null;
    this.mode = "explore";
    this.banner = "未处理物品仍保留在战利品包中。";
    this.emit();
    return true;
  }

  takeLootItem(
    bundleId: string,
    dropId: string,
    action: "store" | "equip" | "claim",
    replaceInstanceId?: string,
  ): InventoryResolution {
    if (this.mode !== "loot" || this.activeLootBundleId !== bundleId) {
      return this.inventoryFailure("当前没有打开这个战利品包。");
    }
    const bundle = this.lootBundles.find((entry) => entry.id === bundleId);
    const item = bundle?.items.find((entry) => entry.dropId === dropId);
    if (!bundle || !item) return this.inventoryFailure("该物品已经处理或不存在。");
    let message: string | null = null;
    if (item.kind === "weapon" || item.kind === "armor") {
      message = action === "equip"
        ? this.equipLootEquipment(bundle, item, replaceInstanceId)
        : this.storeLootEquipment(bundle, item, replaceInstanceId);
    } else if (item.kind === "consumable" && item.consumable) {
      message = this.storeConsumable(item.consumable)
        ? `已将 ${item.name} 放入恢复品栏。`
        : null;
    } else if (item.kind === "reward" && item.rewardId) {
      if (item.rewardId === "floor-key") {
        message = this.claimFloorKey();
      } else {
        this.applyReward(item.rewardId);
        message = `已领取 ${item.name}。${item.description}`;
      }
    }
    if (!message) {
      return this.inventoryFailure(
        item.kind === "consumable"
          ? "恢复品栏已满或该物品已达到 5 个堆叠上限。"
          : "背包已满，请选择一件装备替换；物品会继续留在战利品包中。",
      );
    }

    bundle.items = bundle.items.filter((entry) => entry.dropId !== dropId);
    if (item.kind === "weapon" || item.kind === "armor") {
      this.acquiredUniqueItemIds.add(item.itemId);
    }
    if ((["transition", "victory"] as GameSnapshot["mode"][]).includes(this.mode)) {
      this.activeLootBundleId = null;
    }
    if (bundle.items.length === 0) {
      this.lootBundles = this.lootBundles.filter((entry) => entry.id !== bundle.id);
      this.activeLootBundleId = null;
      if (this.mode === "loot") this.mode = "explore";
    }
    this.banner = message;
    this.emit();
    return {
      ok: true,
      message,
      remainingItemIds: bundle.items.map((entry) => entry.dropId),
    };
  }

  takeAllLoot(bundleId: string): InventoryResolution {
    const bundle = this.lootBundles.find((entry) => entry.id === bundleId);
    if (!bundle || this.mode !== "loot" || this.activeLootBundleId !== bundleId) {
      return this.inventoryFailure("当前没有打开这个战利品包。");
    }
    const itemIds = [...bundle.items]
      .sort((a, b) => Number(a.rewardId === "floor-key") - Number(b.rewardId === "floor-key"))
      .map((item) => item.dropId);
    let picked = 0;
    itemIds.forEach((dropId) => {
      const current = this.lootBundles
        .find((entry) => entry.id === bundleId)
        ?.items.find((entry) => entry.dropId === dropId);
      if (!current) return;
      const resolution = this.takeLootItem(
        bundleId,
        dropId,
        current.kind === "reward" ? "claim" : "store",
      );
      if (resolution.ok) picked += 1;
    });
    const remaining = this.lootBundles.find((entry) => entry.id === bundleId)?.items ?? [];
    if ((["transition", "victory"] as GameSnapshot["mode"][]).includes(this.mode)) {
      return {
        ok: picked > 0,
        message: this.banner,
        remainingItemIds: remaining.map((item) => item.dropId),
      };
    }
    const message = remaining.length === 0
      ? `已领取 ${picked} 件战利品。`
      : `已领取 ${picked} 件；另有 ${remaining.length} 件因容量限制留在包中。`;
    this.banner = message;
    this.emit();
    return {
      ok: picked > 0,
      message,
      remainingItemIds: remaining.map((item) => item.dropId),
    };
  }

  equipInventoryItem(instanceId: string): InventoryResolution {
    if (this.mode !== "inventory") {
      return this.inventoryFailure("只能在探索或篝火打开背包后换装。");
    }
    const index = this.equipmentInventory.findIndex((item) => item.instanceId === instanceId);
    const item = this.equipmentInventory[index];
    if (!item) return this.inventoryFailure("背包中没有这件装备。");
    this.equipmentInventory.splice(index, 1);
    if (item.kind === "weapon" && item.weapon) {
      this.equipmentInventory.push(this.equippedWeaponItem());
      const previous = this.player.weapon.name;
      this.player.weapon = { ...item.weapon };
      this.banner = `已装备 ${item.weapon.name}：${previous} → ${item.weapon.name}，伤害 ${item.weapon.damage}。`;
    } else if (item.kind === "armor" && item.armor) {
      if (this.player.armor) this.equipmentInventory.push(this.equippedArmorItem());
      const previous = this.player.armor?.name ?? "无防具";
      this.player.armor = { ...item.armor };
      this.player.armorHp = Math.min(item.armor.maxArmor, item.armorHp ?? item.armor.maxArmor);
      this.banner = `已装备 ${item.armor.name}：${previous} → ${item.armor.name}，护甲生命 ${this.player.armorHp}/${item.armor.maxArmor}。`;
    } else {
      this.equipmentInventory.splice(index, 0, item);
      return this.inventoryFailure("装备数据不完整，未进行更换。");
    }
    this.emit();
    return { ok: true, message: this.banner, remainingItemIds: [] };
  }

  discardInventoryItem(instanceId: string): InventoryResolution {
    if (this.mode !== "inventory") {
      return this.inventoryFailure("只能在背包中丢弃普通装备。");
    }
    const index = this.equipmentInventory.findIndex((item) => item.instanceId === instanceId);
    const item = this.equipmentInventory[index];
    if (!item) return this.inventoryFailure("背包中没有这件装备。");
    if (item.protected) return this.inventoryFailure("基础武器和课程必需装备不能丢弃。");
    this.equipmentInventory.splice(index, 1);
    const bundleId = this.nextLootBundleId(
      `discard:${this.floorNumber}:${item.instanceId}`,
    );
    this.lootBundles.push({
      id: bundleId,
      sourceMonsterId: null,
      sourceRoomId: this.currentRoomId,
      floor: this.floorNumber,
      x: this.player.x,
      y: this.player.y,
      items: [this.lootItemFromEquipment(item, `${bundleId}:item`)],
    });
    this.banner = `${item.weapon?.name ?? item.armor?.name ?? "装备"} 已放到脚下，离开本层前仍可重新拾取。`;
    this.emit();
    return { ok: true, message: this.banner, remainingItemIds: [] };
  }

  discardConsumable(consumableId: Consumable["id"]): InventoryResolution {
    if (this.mode !== "inventory") {
      return this.inventoryFailure("只能在背包中丢弃普通恢复品。");
    }
    const stack = this.consumables.find((entry) => entry.item.id === consumableId);
    if (!stack) return this.inventoryFailure("恢复品栏中没有该物品。");
    stack.quantity -= 1;
    if (stack.quantity <= 0) {
      this.consumables = this.consumables.filter((entry) => entry !== stack);
    }
    const bundleId = this.nextLootBundleId(
      `discard:${this.floorNumber}:${consumableId}:${this.queryCount}`,
    );
    const dropId = `${bundleId}:item`;
    this.lootBundles.push({
      id: bundleId,
      sourceMonsterId: null,
      sourceRoomId: this.currentRoomId,
      floor: this.floorNumber,
      x: this.player.x,
      y: this.player.y,
      items: [{
        dropId,
        itemId: consumableId,
        kind: "consumable",
        name: stack.item.name,
        description: stack.item.description,
        guaranteed: true,
        probability: 1,
        protected: false,
        consumable: { ...stack.item },
      }],
    });
    this.banner = `${stack.item.name} 已放到脚下，离开本层前仍可重新拾取。`;
    this.emit();
    return { ok: true, message: this.banner, remainingItemIds: [] };
  }

  useConsumable(consumableId: Consumable["id"]): InventoryResolution {
    if (this.mode !== "inventory") {
      return this.inventoryFailure("只能在背包中使用恢复品。");
    }
    const stack = this.consumables.find((entry) => entry.item.id === consumableId);
    if (!stack) return this.inventoryFailure("恢复品栏中没有该物品。");
    const previousHp = this.player.hp;
    const previousArmor = this.player.armorHp;
    this.applyConsumable(stack.item);
    if (previousHp === this.player.hp && previousArmor === this.player.armorHp) {
      return this.inventoryFailure("当前生命与护甲均不需要恢复。");
    }
    stack.quantity -= 1;
    if (stack.quantity <= 0) {
      this.consumables = this.consumables.filter((entry) => entry !== stack);
    }
    this.banner = `使用 ${stack.item.name}：生命 ${previousHp} → ${this.player.hp}，护甲 ${previousArmor} → ${this.player.armorHp}。`;
    this.emit();
    return { ok: true, message: this.banner, remainingItemIds: [] };
  }

  respawnAfterDefeat(): boolean {
    if (this.mode !== "defeat") return false;
    const campfire = this.respawnCampfireId
      ? this.campfires.find((entry) => entry.id === this.respawnCampfireId)
      : null;
    const destination = campfire?.restPosition ?? this.mazeFloor.spawn;
    this.player = {
      ...this.player,
      ...destination,
      hp: this.player.maxHp,
      weapon: { ...this.player.weapon },
      armor: this.player.armor ? { ...this.player.armor } : null,
      armorHp: this.player.armor?.maxArmor ?? 0,
    };
    const zone = mazeZoneAt(this.mazeFloor, destination);
    this.currentRoomId = zone?.roomNodeId ?? this.graph.entryId;
    this.visitedRoomIds.add(this.currentRoomId);
    this.completedRoomIds.add(this.graph.entryId);
    this.combat = null;
    this.selectedMonsterId = null;
    this.activeGateChallengeId = null;
    this.activeCampfireId = null;
    this.mode = "death-review";
    this.encounterMeter = resetEncounterMeterAfterBattle(this.encounterMeter);
    this.revealAt(destination);
    this.banner = campfire
      ? `已返回${this.campfirePhaseName(campfire)}并恢复满生命。完成本场复盘后重新出发。`
      : "尚未记录篝火，已返回本层出生安全区并恢复满生命。完成本场复盘后重新出发。";
    this.emit();
    return true;
  }

  continueAfterDeathReview(): boolean {
    if (this.mode !== "death-review") return false;
    this.mode = "explore";
    this.banner = "本场死亡复盘已结束。篝火、装备、经验、课程和怪物剩余生命均已保留。";
    this.emit();
    return true;
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
        armorDamage: 0,
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
        armorDamage: 0,
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
        armorDamage: 0,
        mode: this.mode,
      };
    }
    this.queryCount += 1;
    return this.failGateChallenge(`SQL 无法执行：${message}`);
  }

  advanceMonsterPatrols(): PatrolBatchResolution {
    if (this.mode !== "explore" || this.adminPanelOpen) {
      return { moves: [], encounterId: null };
    }
    const moves: PatrolBatchResolution["moves"] = [];
    const blocked = new Set([
      ...this.groundItems.map(positionKey),
      ...this.lootBundles.map(positionKey),
      ...safeZoneCellKeys(this.mazeFloor, this.campfires),
      ...this.campfires.map(positionKey),
      ...this.guidedMap.shortcuts.flatMap((shortcut) => [
        positionKey(shortcut.entry),
        positionKey(shortcut.exit),
        positionKey(shortcut.keyPosition),
      ]),
      ...this.guidedMap.deadEndCaches
        .filter((cache) => !this.openedGateIds.has(cache.id))
        .map(positionKey),
      ...this.biomePlan.portals.flatMap((portal) => [
        positionKey(portal.entry),
        positionKey(portal.exit),
      ]),
    ]);
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
    const reviewTarget = this.monsters.find((entry) => entry.id === this.combat?.targetId);
    const reviewRound = this.combat.round;
    const reviewHintLevel = this.hintLevel;
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
    let armorDamage = 0;
    let playerDefeated = false;
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
            this.completeAmbush(target, events, experienceMessage);
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
      const damage = this.applyPlayerDamage(1);
      playerDamage = damage.playerDamage;
      armorDamage = damage.armorDamage;
      events.push({ type: "enemy-hit", sourceId: target?.id, amount: 1 });
      const damageMessage = armorDamage > 0
        ? `护甲吸收 ${armorDamage} 点${playerDamage > 0 ? `，生命损失 ${playerDamage} 点` : ""}`
        : `生命损失 ${playerDamage} 点`;
      this.banner = `${evaluation.message} ${target?.name ?? "怪物"} 使用${target?.attackName ?? "反击"}，${damageMessage}。`;
      if (this.player.hp === 0) {
        playerDefeated = true;
        this.enterDefeat("combat");
      } else {
        this.combat.round += 1;
      }
    }
    if (reviewTarget) {
      this.appendAnswerRecord({
        id: this.queryCount,
        battleId: this.reviewBattleId ?? this.battleSequence,
        floor: this.floorNumber,
        monsterId: reviewTarget.id,
        monsterName: reviewTarget.name,
        lessonId: lesson.id,
        stageId: stage.id,
        stageObjective: stage.objective,
        round: reviewRound,
        sql: result.sql,
        answerSql: stage.answerSql,
        result: evaluation.kind === "exact" ? "correct" : evaluation.kind,
        outcome: evaluation.accepted
          ? experience ? "victory" : "hit"
          : playerDefeated ? "defeat" : "countered",
        feedback: evaluation.message,
        hintLevel: reviewHintLevel,
      });
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
      armorDamage,
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

  registerQueryError(message: string, sql = ""): TurnResolution {
    if (this.mode !== "combat" || !this.combat) {
      return this.emptyTurn(message, []);
    }
    const lesson = this.currentLesson();
    const stage = this.currentStage();
    const reviewTarget = this.monsters.find((entry) => entry.id === this.combat?.targetId);
    const reviewRound = this.combat.round;
    const reviewHintLevel = this.hintLevel;
    this.queryCount += 1;
    this.profile.attempts[lesson.id] += 1;
    this.player.heat = Math.min(99, this.player.heat + 1);
    const target = this.monsters.find((monster) => monster.id === this.combat?.targetId);
    const damage = this.applyPlayerDamage(1);
    const playerDamage = damage.playerDamage;
    const armorDamage = damage.armorDamage;
    const playerDefeated = this.player.hp === 0;
    const damageMessage = armorDamage > 0
      ? `护甲吸收 ${armorDamage} 点${playerDamage > 0 ? `，生命损失 ${playerDamage} 点` : ""}`
      : `生命损失 ${playerDamage} 点`;
    this.banner = `${message} ${target?.name ?? "怪物"} 趁终端失稳反击，${damageMessage}。`;
    if (playerDefeated) {
      this.enterDefeat("combat");
    } else {
      this.combat.round += 1;
    }
    const events: CombatEvent[] = [
      { type: "enemy-hit", sourceId: target?.id, amount: playerDamage },
    ];
    if (reviewTarget) {
      this.appendAnswerRecord({
        id: this.queryCount,
        battleId: this.reviewBattleId ?? this.battleSequence,
        floor: this.floorNumber,
        monsterId: reviewTarget.id,
        monsterName: reviewTarget.name,
        lessonId: lesson.id,
        stageId: stage.id,
        stageObjective: stage.objective,
        round: reviewRound,
        sql,
        answerSql: stage.answerSql,
        result: "syntax-error",
        outcome: playerDefeated ? "defeat" : "countered",
        feedback: message,
        hintLevel: reviewHintLevel,
      });
    }
    this.emit();
    return {
      accepted: false,
      message: this.banner,
      queryTargetIds: [],
      attackTargetIds: [],
      hpUpdates: [],
      killedIds: [],
      playerDamage,
      armorDamage,
      heatAdded: 1,
      locksBroken: [],
      locksRemaining: [...stage.locks],
      events,
      mode: this.mode,
      stageAdvanced: false,
      lessonCompleted: null,
      experience: null,
    };
  }

  advanceFloor(): boolean {
    if (this.adminMode || this.mode !== "transition" || this.floorNumber >= 8) return false;
    const fromFloor = this.floorNumber;
    const transition = advanceCampaignProgress(this.campaign);
    const nextFloor = transition.to;
    if (
      !transition.ok ||
      transition.completed ||
      nextFloor !== fromFloor + 1 ||
      nextFloor > 8
    ) return false;
    this.campaign = transition.progress;
    const nextSeed = this.campaign.floors.find((slot) => slot.floor === nextFloor)?.seed;
    if (!nextSeed) return false;
    this.floorNumber = nextFloor as FloorNumber;
    this.graph = generateRoomGraph(nextSeed, this.floorNumber);
    this.mazeFloor = generateMazeFloor(this.graph);
    this.campfires = generateCampfires(this.graph, this.mazeFloor);
    this.guidedMap = generateGuidedMapPlan(
      this.graph,
      this.mazeFloor,
      this.campfires,
    );
    this.biomePlan = generateBiomePlan(
      this.graph,
      this.mazeFloor,
      this.campfires,
      this.guidedMap,
    );
    this.activeCampfireId = null;
    this.respawnCampfireId = null;
    this.mode = "explore";
    this.currentRoomId = this.graph.entryId;
    this.player = {
      ...this.player,
      ...this.mazeFloor.spawn,
      hp: this.player.maxHp,
      heat: Math.max(0, this.player.heat - 12),
      weapon: { ...this.player.weapon },
      armor: this.player.armor ? { ...this.player.armor } : null,
    };
    this.monsters = monstersForFloor(this.floorNumber);
    this.worldActors = initialActors(
      this.graph,
      this.mazeFloor,
      this.monsters,
      this.biomePlan,
    );
    this.groundItems = initialGroundItems(this.graph, this.mazeFloor);
    this.lootBundles = [];
    this.activeLootBundleId = null;
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
    this.regionTransfer = null;
    const floorNames: Record<FloorNumber, string> = {
      1: "余烬地窖",
      2: "湖沼森林",
      3: "亡者墓城",
      4: "元素熔炉",
      5: "黑铁要塞",
      6: "巨龙熔巢",
      7: "水晶索引林",
      8: "黑曜数据王座",
    };
    this.banner = `传送完成：已进入第 ${this.floorNumber} 层「${floorNames[this.floorNumber]}」。装备、遗物、等级与 XP 已保留。`;
    this.revealAt(this.player);
    this.emit();
    return true;
  }

  reset(seed = `${this.graph.seed}-next`): void {
    if (this.adminMode) {
      this.banner = "管理员预览不会覆盖正式 Run。刷新页面后再生成新迷宫。";
      this.emit();
      return;
    }
    this.campaign = createCampaignProgress(seed);
    this.floorNumber = 1;
    this.graph = generateRoomGraph(seed, 1);
    this.mazeFloor = generateMazeFloor(this.graph);
    this.campfires = generateCampfires(this.graph, this.mazeFloor);
    this.guidedMap = generateGuidedMapPlan(
      this.graph,
      this.mazeFloor,
      this.campfires,
    );
    this.biomePlan = generateBiomePlan(
      this.graph,
      this.mazeFloor,
      this.campfires,
      this.guidedMap,
    );
    this.activeCampfireId = null;
    this.respawnCampfireId = null;
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
      armor: null,
      armorHp: 0,
    };
    this.monsters = monstersForFloor(1);
    this.worldActors = initialActors(
      this.graph,
      this.mazeFloor,
      this.monsters,
      this.biomePlan,
    );
    this.groundItems = initialGroundItems(this.graph, this.mazeFloor);
    this.lootBundles = [];
    this.equipmentInventory = [];
    this.consumables = [];
    this.keyItems = [];
    this.acquiredUniqueItemIds = new Set(["data-blade"]);
    this.activeLootBundleId = null;
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
    this.answerHistory = [];
    this.battleSequence = 0;
    this.reviewBattleId = null;
    this.regionTransfer = null;
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
      const practice = practiceStagesFor(this.combat.targetId);
      if (practice.length > 0) return practice;
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
    if (
      isSafeZonePosition(this.mazeFloor, this.campfires, this.player) ||
      isSafeZonePosition(this.mazeFloor, this.campfires, actor)
    ) {
      return this.interactionFailure("安全区内不会开始战斗。离开石圈后怪物才会接近。");
    }
    const accessMessage = this.roomAccessMessage(room);
    if (accessMessage) return this.interactionFailure(accessMessage);
    const lesson = lessonById(room.lessonId);
    const combatKind = monster.encounterType;
    const stages = combatKind === "ambush"
      ? practiceStagesFor(monster.id)
      : lesson.stages;
    const stage = stages[0];
    if (!stage) return this.interactionFailure("这只怪物尚未配置可执行的 SQL 题。");
    this.currentRoomId = room.id;
    this.visitedRoomIds.add(room.id);
    this.beginBattleReview();
    this.mode = "combat";
    this.combat = {
      targetId: monster.id,
      kind: combatKind,
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
    const encounter = biomeEncounterFor(monster.id);
    const roleLabel = encounter?.role === "area-boss"
      ? "区域首领"
      : encounter?.role === "mini-elite" ? "小型精英" : "触碰遭遇";
    this.banner = `${roleLabel} ${monster.name}（ID #${monster.id}，${stages.length} 阶段）。按住 Q + S 写出完整 SQL。`;
    this.emit();
    return { ok: true, kind: "combat", message: this.banner };
  }

  private rollAmbush(allowEncounter = true): number | null {
    if (isSafeZonePosition(this.mazeFloor, this.campfires, this.player)) {
      this.encounterMeter = recordSafeZoneMovement(this.encounterMeter);
      return null;
    }
    const unlockedLessons = new Set(
      this.graph.nodes
        .filter((room) => room.lessonId && this.roomAccessMessage(room) === null)
        .map((room) => room.lessonId as LessonId),
    );
    const currentBiome = biomeRegionAt(this.biomePlan, this.player).kind;
    const weightedIds = weightedBiomeEncounterIds(
      this.floorNumber,
      currentBiome,
      unlockedLessons,
    );
    const livingIds = new Set(
      this.monsters
        .filter((monster) => monster.encounterType === "ambush" && monster.hp > 0)
        .map((monster) => monster.id),
    );
    const candidateIds = allowEncounter
      ? weightedIds.filter((id) => livingIds.has(id))
      : [];
    const advance = advanceEncounterMeter(this.encounterMeter, this.graph.seed, candidateIds);
    this.encounterMeter = advance.meter;
    if (advance.targetId === null) return null;
    const monster = this.monsters.find((entry) => entry.id === advance.targetId);
    const stages = monster ? practiceStagesFor(monster.id) : [];
    const stage = stages[0];
    if (!monster || !stage) return null;

    this.beginBattleReview();
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
    const encounter = biomeEncounterFor(monster.id);
    const roleLabel = encounter?.role === "mini-elite" ? "小型精英" : "突发遭遇";
    this.banner = `${roleLabel} ${monster.name}（ID #${monster.id}）！完成 ${
      stages.length
    } 道 ${lessonById(monster.lessonId).concept} 练习即可脱身。`;
    return monster.id;
  }

  private beginBattleReview(): void {
    this.battleSequence += 1;
    this.reviewBattleId = this.battleSequence;
  }

  private appendAnswerRecord(record: AnswerAttemptRecord): void {
    this.answerHistory.push({ ...record });
    if (this.answerHistory.length > MAX_ANSWER_HISTORY) {
      this.answerHistory.splice(0, this.answerHistory.length - MAX_ANSWER_HISTORY);
    }
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

  private inventoryFailure(message: string): InventoryResolution {
    this.banner = message;
    this.emit();
    return { ok: false, message, remainingItemIds: [] };
  }

  private equippedWeaponItem(): EquipmentItem {
    return {
      instanceId: `equipped:weapon:${this.player.weapon.id}`,
      kind: "weapon",
      // 课程必需武器只在当前装备时受保护；被更高层武器替换后即可整理或丢弃，
      // 避免长线八层流程被历史武器永久占满背包。
      protected: false,
      weapon: { ...this.player.weapon },
    };
  }

  private equippedArmorItem(): EquipmentItem {
    const armor = this.player.armor;
    if (!armor) {
      throw new Error("Cannot store an empty armor slot.");
    }
    return {
      instanceId: `equipped:armor:${armor.id}`,
      kind: "armor",
      protected: false,
      armor: { ...armor },
      armorHp: this.player.armorHp,
    };
  }

  private equipmentFromLoot(item: LootItem): EquipmentItem | null {
    if (item.kind === "weapon" && item.weapon) {
      return {
        instanceId: `loot:weapon:${item.dropId}`,
        kind: "weapon",
        protected: item.protected,
        weapon: { ...item.weapon },
      };
    }
    if (item.kind === "armor" && item.armor) {
      return {
        instanceId: `loot:armor:${item.dropId}`,
        kind: "armor",
        protected: item.protected,
        armor: { ...item.armor },
        armorHp: Math.min(item.armor.maxArmor, item.armorHp ?? item.armor.maxArmor),
      };
    }
    return null;
  }

  private lootItemFromEquipment(item: EquipmentItem, dropId: string): LootItem {
    const weapon = item.weapon ? { ...item.weapon } : undefined;
    const armor = item.armor ? { ...item.armor } : undefined;
    return {
      dropId,
      itemId: weapon?.id ?? armor?.id ?? item.instanceId,
      kind: item.kind,
      name: weapon?.name ?? armor?.name ?? "未知装备",
      description: weapon?.description ?? armor?.description ?? "装备数据不完整。",
      guaranteed: true,
      probability: 1,
      protected: item.protected,
      weapon,
      armor,
      armorHp: armor
        ? Math.min(armor.maxArmor, item.armorHp ?? armor.maxArmor)
        : undefined,
    };
  }

  private replaceInventoryItem(
    bundle: LootBundle,
    replaceInstanceId: string | undefined,
  ): EquipmentItem | null {
    if (!replaceInstanceId) return null;
    const index = this.equipmentInventory.findIndex(
      (item) => item.instanceId === replaceInstanceId,
    );
    const replaced = this.equipmentInventory[index];
    if (!replaced || replaced.protected) return null;
    this.equipmentInventory.splice(index, 1);
    bundle.items.push(this.lootItemFromEquipment(
      replaced,
      `replaced:${bundle.id}:${replaced.instanceId}`,
    ));
    return replaced;
  }

  private storeLootEquipment(
    bundle: LootBundle,
    item: LootItem,
    replaceInstanceId?: string,
  ): string | null {
    const equipment = this.equipmentFromLoot(item);
    if (!equipment) return null;
    let replaced: EquipmentItem | null = null;
    if (this.equipmentInventory.length >= EQUIPMENT_CAPACITY) {
      replaced = this.replaceInventoryItem(bundle, replaceInstanceId);
      if (!replaced) return null;
    }
    this.equipmentInventory.push(equipment);
    const replacedName = replaced?.weapon?.name ?? replaced?.armor?.name;
    return replacedName
      ? `已将 ${item.name} 放入装备背包；${replacedName} 留在当前战利品包中。`
      : `已将 ${item.name} 放入装备背包。`;
  }

  private equipLootEquipment(
    bundle: LootBundle,
    item: LootItem,
    replaceInstanceId?: string,
  ): string | null {
    const equipment = this.equipmentFromLoot(item);
    if (!equipment) return null;
    const displaced = equipment.kind === "weapon"
      ? this.equippedWeaponItem()
      : this.player.armor
        ? this.equippedArmorItem()
        : null;
    let replaced: EquipmentItem | null = null;
    if (displaced && this.equipmentInventory.length >= EQUIPMENT_CAPACITY) {
      replaced = this.replaceInventoryItem(bundle, replaceInstanceId);
      if (!replaced) return null;
    }
    if (displaced) this.equipmentInventory.push(displaced);

    if (equipment.kind === "weapon" && equipment.weapon) {
      const previous = this.player.weapon.name;
      this.player.weapon = { ...equipment.weapon };
      const replacedName = replaced?.weapon?.name ?? replaced?.armor?.name;
      return `已装备 ${equipment.weapon.name}：${previous} 已收入背包${
        replacedName ? `，${replacedName} 留在战利品包中` : ""
      }。`;
    }
    if (equipment.kind === "armor" && equipment.armor) {
      const previous = this.player.armor?.name ?? "无防具";
      this.player.armor = { ...equipment.armor };
      this.player.armorHp = Math.min(
        equipment.armor.maxArmor,
        equipment.armorHp ?? equipment.armor.maxArmor,
      );
      const replacedName = replaced?.weapon?.name ?? replaced?.armor?.name;
      return `已装备 ${equipment.armor.name}：${previous} → ${equipment.armor.name}，护甲 ${this.player.armorHp}/${
        equipment.armor.maxArmor
      }${replacedName ? `；${replacedName} 留在战利品包中` : ""}。`;
    }
    return null;
  }

  private storeConsumable(consumable: Consumable): boolean {
    const stack = this.consumables.find((entry) => entry.item.id === consumable.id);
    if (stack) {
      if (stack.quantity >= CONSUMABLE_STACK_CAPACITY) return false;
      stack.quantity += 1;
      return true;
    }
    if (this.consumables.length >= CONSUMABLE_SLOT_CAPACITY) return false;
    this.consumables.push({ item: { ...consumable }, quantity: 1 });
    return true;
  }

  private applyConsumable(consumable: Consumable): void {
    if (consumable.effect === "heal-hp" || consumable.effect === "heal-both") {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + consumable.amount);
    }
    if (
      (consumable.effect === "heal-armor" || consumable.effect === "heal-both") &&
      this.player.armor
    ) {
      const maxArmor = this.player.armor?.maxArmor ?? 0;
      this.player.armorHp = Math.min(maxArmor, this.player.armorHp + consumable.amount);
    }
  }

  private applyPlayerDamage(amount: number): {
    playerDamage: number;
    armorDamage: number;
  } {
    const incoming = Math.max(0, Math.floor(amount));
    const armorDamage = Math.min(this.player.armorHp, incoming);
    this.player.armorHp -= armorDamage;
    const playerDamage = incoming - armorDamage;
    this.player.hp = Math.max(0, this.player.hp - playerDamage);
    return { playerDamage, armorDamage };
  }

  private claimFloorKey(): string {
    const keyId = `floor-${this.floorNumber}-key`;
    if (!this.keyItems.includes(keyId)) this.keyItems.push(keyId);
    this.completedRoomIds.add(this.currentRoomId);
    if (this.adminMode) {
      this.mode = "explore";
      return `管理员预览已击败第 ${this.floorNumber} 层层主；不会推进或写入正式 Run。`;
    }
    if (this.floorNumber < 8) {
      this.mode = "transition";
      return `第 ${this.floorNumber} 层钥匙已接入传送门。无需按键，正在自动进入第 ${this.floorNumber + 1} 层。`;
    }
    this.mode = "victory";
    this.profile.victories += 1;
    this.profile.bestRunQueries = this.profile.bestRunQueries === null
      ? this.queryCount
      : Math.min(this.profile.bestRunQueries, this.queryCount);
    return "获得第八层钥匙。魔王数据王座已平定，八层 SQL 图鉴均已永久更新。";
  }

  private completeAmbush(
    monster: Monster,
    events: CombatEvent[],
    experienceMessage: string,
  ): void {
    const loot = this.spawnLootBundle(
      monster,
      this.currentRoomId,
      { x: this.player.x, y: this.player.y },
      [],
    );
    if (loot.bundleCount > 0) {
      events.push({ type: "loot-drop", targetId: monster.id });
    }
    loot.recoveryNames.forEach((itemName) => {
      events.push({ type: "auto-heal", targetId: monster.id, itemName });
    });
    this.combat = null;
    this.selectedMonsterId = null;
    this.mode = "explore";
    this.hintLevel = 0;
    this.encounterMeter = resetEncounterMeterAfterBattle(this.encounterMeter);
    this.banner = loot.bundleCount > 0
      ? `${monster.name} 已清除。${experienceMessage} 掉落 1 个含 ${loot.bundleCount} 件物品的战利品包。`
      : loot.recoveryNames.length > 0
        ? `${monster.name} 已清除。${experienceMessage} ${loot.recoveryNames.join("、")}已直接使用，不占背包。`
        : `${monster.name} 已清除。${experienceMessage} 本次没有物品掉落；接下来 5 步不会再次遭遇。`;
    const transferMessage = this.autoTransferAfterAreaBoss(monster);
    if (transferMessage) this.banner = `${this.banner} ${transferMessage}`;
  }

  private autoTransferAfterAreaBoss(monster: Monster): string | null {
    const portal = this.biomePlan.portals.find(
      (entry) => entry.requiredBossId === monster.id,
    );
    if (!portal) return null;
    const fromRegion = this.biomePlan.regions.find(
      (region) => region.id === portal.fromRegionId,
    );
    const targetRegion = this.biomePlan.regions.find(
      (region) => region.id === portal.toRegionId,
    );
    if (!fromRegion || !targetRegion) return null;
    const targetRoom = this.graph.nodes.find(
      (room) => room.id === targetRegion.sourceRoomNodeId,
    );
    const accessMessage = targetRoom ? this.roomAccessMessage(targetRoom) : null;
    if (accessMessage) {
      return `区域首领通道已供能，但主线门仍锁定：${accessMessage}完成后可在区域门旁按 E 进入。`;
    }
    const destination = this.safeRegionPortalDestination(
      portal.exit,
      targetRegion.id,
    );
    if (!destination) {
      return "区域首领通道已供能，但出口暂被占用；离开再回来后可在区域门旁按 E 进入。";
    }
    this.player.x = destination.x;
    this.player.y = destination.y;
    this.updateCurrentRoom(destination);
    this.revealAt(destination);
    this.encounterMeter = resetEncounterMeterAfterBattle(this.encounterMeter);
    this.regionTransferSequence += 1;
    this.regionTransfer = {
      sequence: this.regionTransferSequence,
      fromName: fromRegion.name,
      toName: targetRegion.name,
    };
    return `区域首领通道已开启，已自动送入 ${targetRegion.name} 主线区域。`;
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

    const target = this.monsters.find((monster) => monster.id === lesson.primaryMonsterId);
    if (target && dropPosition) {
      const fixedItems = this.fixedLootItemsForLesson(lesson);
      const loot = this.spawnLootBundle(
        target,
        this.currentRoomId,
        dropPosition,
        fixedItems,
      );
      loot.recoveryNames.forEach((itemName) => {
        events.push({ type: "auto-heal", targetId: lesson.primaryMonsterId, itemName });
      });
      if (loot.bundleCount > 0) {
        events.push({ type: "loot-drop", targetId: lesson.primaryMonsterId });
        this.banner = `${lesson.title} 完成，含 ${loot.bundleCount} 件固定奖励的战利品包已掉落。${experienceMessage}${
          loot.recoveryNames.length > 0
            ? ` ${loot.recoveryNames.join("、")}已直接使用。`
            : ""
        } 靠近后按 E 打开。`;
        return;
      }
      if (loot.recoveryNames.length > 0) {
        this.banner = `${lesson.title} 已掌握。${experienceMessage} ${loot.recoveryNames.join("、")}已直接使用，不占背包。`;
        return;
      }
    }
    this.banner = `${lesson.title} 已掌握。${experienceMessage} 本次没有额外物品掉落。`;
  }

  enableAdminMode(): InteractionResolution {
    if (this.adminMode) {
      return { ok: true, kind: "none", message: "管理员视图已经开启。" };
    }
    if (this.mode !== "explore") {
      return this.interactionFailure("请先退出战斗、篝火或背包，再开启管理员视图。");
    }
    this.adminMode = true;
    this.emit();
    return {
      ok: true,
      kind: "none",
      message: "管理员视图已开启：全图、怪物与区域门均可见；预览操作不会写入正式存档。",
    };
  }

  setAdminPanelOpen(open: boolean): boolean {
    if (!this.adminMode) return false;
    if (this.adminPanelOpen === open) return true;
    this.adminPanelOpen = open;
    this.emit();
    return true;
  }

  adminLoadFloor(floor: FloorNumber): InteractionResolution {
    if (!this.adminMode) {
      return this.interactionFailure("请先开启管理员视图。");
    }
    if (this.mode !== "explore") {
      return this.interactionFailure("管理员切层前请先退出当前交互。");
    }
    const campaign = createCampaignProgress(this.campaign.baseSeed, floor);
    const floorSeed = campaign.floors.find((slot) => slot.floor === floor)?.seed;
    if (!floorSeed) return this.interactionFailure("管理员预览层缺少 Seed。");

    this.campaign = campaign;
    this.floorNumber = floor;
    this.graph = generateRoomGraph(floorSeed, floor);
    this.mazeFloor = generateMazeFloor(this.graph);
    this.campfires = generateCampfires(this.graph, this.mazeFloor);
    this.guidedMap = generateGuidedMapPlan(this.graph, this.mazeFloor, this.campfires);
    this.biomePlan = generateBiomePlan(
      this.graph,
      this.mazeFloor,
      this.campfires,
      this.guidedMap,
    );
    this.activeCampfireId = null;
    this.respawnCampfireId = null;
    this.activeLootBundleId = null;
    this.mode = "explore";
    this.currentRoomId = this.graph.entryId;
    this.player = {
      ...this.player,
      ...this.mazeFloor.spawn,
      hp: this.player.maxHp,
      heat: 0,
      weapon: { ...this.player.weapon },
      armor: this.player.armor ? { ...this.player.armor } : null,
    };
    this.monsters = monstersForFloor(floor);
    this.worldActors = initialActors(
      this.graph,
      this.mazeFloor,
      this.monsters,
      this.biomePlan,
    );
    this.groundItems = initialGroundItems(this.graph, this.mazeFloor);
    this.lootBundles = [];
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
    this.regionTransfer = null;
    this.revealAt(this.player);
    this.banner = `管理员预览：第 ${floor} 层全图已载入。刷新页面可回到最后一次正式存档。`;
    this.emit();
    return { ok: true, kind: "none", message: this.banner };
  }

  adminTravelToRegion(regionId: string): InteractionResolution {
    if (!this.adminMode || this.mode !== "explore") {
      return this.interactionFailure("管理员区域跳转当前不可用。");
    }
    const region = this.biomePlan.regions.find((entry) => entry.id === regionId);
    if (!region) return this.interactionFailure("未知生态区域。");
    const candidates = [
      region.anchor,
      ...this.biomePlan.portals.flatMap((portal) => {
        const positions: Position[] = [];
        if (portal.fromRegionId === regionId) positions.push(portal.entry);
        if (portal.toRegionId === regionId) positions.push(portal.exit);
        return positions;
      }),
      ...allMapCellKeys(this.mazeFloor)
        .map((key) => {
          const [x, y] = key.split(":").map(Number);
          return { x, y };
        })
        .filter((position) => this.mazeFloor.tiles[position.y]?.[position.x] === ".")
        .sort((left, right) => distance(left, region.anchor) - distance(right, region.anchor)),
    ];
    const destination = candidates.find((position) => (
      this.mazeFloor.tiles[position.y]?.[position.x] === "." &&
      !this.livingActorAt(position) &&
      !this.campfires.some(
        (campfire) => campfire.x === position.x && campfire.y === position.y,
      )
    ));
    if (!destination) return this.interactionFailure("该区域没有可用的管理员落点。");
    const fromRegion = biomeRegionAt(this.biomePlan, this.player);
    this.player.x = destination.x;
    this.player.y = destination.y;
    this.updateCurrentRoom(destination);
    this.revealAt(destination);
    this.regionTransferSequence += 1;
    this.regionTransfer = {
      sequence: this.regionTransferSequence,
      fromName: fromRegion.name,
      toName: region.name,
    };
    this.banner = `管理员跳转：已定位 ${region.name}。`;
    this.emit();
    return { ok: true, kind: "none", message: this.banner };
  }

  private fixedLootItemsForLesson(lesson: LessonDefinition): LootItem[] {
    const fixedLoot = LOOT_AFTER_LESSON[lesson.id];
    if (fixedLoot) {
      return [{
        dropId: `${lesson.primaryMonsterId}:${fixedLoot.weapon.id}`,
        itemId: fixedLoot.weapon.id,
        kind: "weapon",
        name: fixedLoot.weapon.name,
        description: fixedLoot.weapon.description,
        guaranteed: true,
        probability: 1,
        protected: true,
        weapon: { ...fixedLoot.weapon },
      }];
    }
    const rewardId = this.currentRoom().reward;
    const reward = rewardDetails(rewardId);
    if (!reward || !rewardId) return [];
    const rewardWeapon = reward.kind === "weapon"
      ? WEAPONS[rewardId as Weapon["id"]]
      : undefined;
    if (rewardWeapon) {
      return [{
        dropId: `${lesson.primaryMonsterId}:${rewardWeapon.id}`,
        itemId: rewardWeapon.id,
        kind: "weapon",
        name: rewardWeapon.name,
        description: rewardWeapon.description,
        guaranteed: true,
        probability: 1,
        protected: true,
        weapon: { ...rewardWeapon },
      }];
    }
    return [{
      dropId: `${lesson.primaryMonsterId}:${rewardId}`,
      itemId: rewardId,
      kind: "reward",
      name: reward.name,
      description: reward.description,
      guaranteed: true,
      probability: 1,
      protected: reward.kind === "key",
      rewardId,
    }];
  }

  private spawnLootBundle(
    monster: Monster,
    sourceRoomId: string,
    position: Position,
    fixedItems: readonly LootItem[],
  ): LootSpawnResolution {
    const biome = biomeRegionAt(this.biomePlan, position).kind;
    const encounter = biomeEncounterFor(monster.id);
    const role = monster.isBoss
      ? "floor-boss" as const
      : encounter?.role ?? "curriculum";
    const items = rollLootItems({
      seed: this.graph.seed,
      floor: this.floorNumber,
      monster,
      candidates: lootCandidatesForBiome(this.floorNumber, biome, role),
      fixedItems,
      acquiredUniqueItemIds: this.acquiredUniqueItemIds,
    });
    const recoveryNames: string[] = [];
    const bundleItems = items.filter((item) => {
      if (item.guaranteed || item.kind !== "consumable" || !item.consumable) {
        return true;
      }
      const previousHp = this.player.hp;
      const previousArmor = this.player.armorHp;
      this.applyConsumable(item.consumable);
      const effect = `生命 ${previousHp}→${this.player.hp}，护甲 ${previousArmor}→${this.player.armorHp}`;
      recoveryNames.push(`${item.name}（${effect}）`);
      return false;
    });
    if (bundleItems.length === 0) {
      return { bundleCount: 0, recoveryNames };
    }
    const id = `loot:${this.floorNumber}:${monster.id}`;
    if (this.lootBundles.some((bundle) => bundle.id === id)) {
      return {
        bundleCount: this.lootBundles.find((bundle) => bundle.id === id)?.items.length ?? 0,
        recoveryNames: [],
      };
    }
    this.lootBundles.push({
      id,
      sourceMonsterId: monster.id,
      sourceRoomId,
      floor: this.floorNumber,
      ...position,
      items: bundleItems,
    });
    return { bundleCount: bundleItems.length, recoveryNames };
  }

  private nextLootBundleId(baseId: string): string {
    let id = baseId;
    let suffix = 2;
    while (this.lootBundles.some((bundle) => bundle.id === id)) {
      id = `${baseId}:${suffix}`;
      suffix += 1;
    }
    return id;
  }

  private collectGroundItem(item: GroundItem, shouldEmit: boolean): InteractionResolution {
    const index = this.groundItems.findIndex((entry) => entry.id === item.id);
    if (index < 0) return this.interactionFailure("该物品已经被拾取。");
    const previousWeapon = { ...this.player.weapon };
    const previousHp = this.player.hp;
    if (item.weapon) {
      this.player.weapon = { ...item.weapon };
      this.acquiredUniqueItemIds.add(item.weapon.id);
    } else if (item.rewardId) {
      this.applyReward(item.rewardId);
    }
    this.groundItems.splice(index, 1);
    this.completedRoomIds.add(item.sourceRoomId);
    const openedBattleChest = item.id.startsWith("lesson-drop:");
    if (item.rewardId === "floor-key") {
      if (this.floorNumber < 8) {
        this.mode = "transition";
        this.banner = `${openedBattleChest ? "打开战利品宝箱，" : ""}第 ${this.floorNumber} 层钥匙已接入传送门。无需按键，1.5 秒后自动进入第 ${this.floorNumber + 1} 层。`;
      } else {
        this.mode = "victory";
        this.profile.victories += 1;
        this.profile.bestRunQueries = this.profile.bestRunQueries === null
          ? this.queryCount
          : Math.min(this.profile.bestRunQueries, this.queryCount);
        this.banner = `${openedBattleChest ? "打开战利品宝箱，" : ""}获得第八层钥匙。魔王数据王座已平定，八层 SQL 图鉴均已永久更新。`;
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

  private openLootBundle(bundle: LootBundle): InteractionResolution {
    this.activeLootBundleId = bundle.id;
    this.mode = "loot";
    this.banner = `打开战利品包：${bundle.items.length} 件物品等待处理。`;
    this.emit();
    return { ok: true, kind: "loot-bundle", message: this.banner };
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
      this.acquiredUniqueItemIds.add(AGGREGATE_HAMMER.id);
    } else if (rewardId === "sort-saber") {
      this.player.weapon = { ...SORT_SABER };
      this.acquiredUniqueItemIds.add(SORT_SABER.id);
    } else if (rewardId === "join-chain") {
      this.player.weapon = { ...JOIN_CHAIN };
      this.acquiredUniqueItemIds.add(JOIN_CHAIN.id);
    } else if (rewardId === "filter-rune") {
      this.player.weapon = { ...FILTER_BOW };
      this.acquiredUniqueItemIds.add(FILTER_BOW.id);
    } else if (rewardId === "null-lantern") {
      this.player.weapon = { ...NULL_LANTERN };
      this.acquiredUniqueItemIds.add(NULL_LANTERN.id);
    } else if (rewardId === "data-blade") {
      this.player.weapon = { ...DATA_BLADE };
      this.acquiredUniqueItemIds.add(DATA_BLADE.id);
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
    const lootBundle = this.lootBundles.find((entry) => entry.sourceRoomId === zone.roomNodeId);
    if (monster && monster.hp > 0) {
      this.banner = `${monster.name}（ID #${monster.id}）正在区域内巡逻。触碰才会开战。`;
    } else if (lootBundle) {
      this.banner = `这里留有一个含 ${lootBundle.items.length} 件物品的战利品包。靠近后按 E 打开。`;
    } else if (item) {
      this.banner = `${item.name} 在区域核心发光。靠近后${item.collection === "touch" ? "直接拾取" : "按 E 调查"}。`;
    } else {
      this.banner = `${this.currentRoom().title} 已记录到小地图。`;
    }
  }

  private nearbyRegionPortal(): {
    portal: BiomePortal;
    side: "entry" | "exit";
  } | null {
    for (const portal of this.biomePlan.portals) {
      if (distance(portal.entry, this.player) <= 1) {
        return { portal, side: "entry" };
      }
      if (distance(portal.exit, this.player) <= 1) {
        return { portal, side: "exit" };
      }
    }
    return null;
  }

  private travelThroughRegionPortal(
    portal: BiomePortal,
    side: "entry" | "exit",
  ): InteractionResolution {
    const destination = side === "entry" ? portal.exit : portal.entry;
    const targetRegionId = side === "entry" ? portal.toRegionId : portal.fromRegionId;
    const fromRegionId = side === "entry" ? portal.fromRegionId : portal.toRegionId;
    const fromRegion = this.biomePlan.regions.find((region) => region.id === fromRegionId);
    const targetRegion = this.biomePlan.regions.find((region) => region.id === targetRegionId);
    if (!fromRegion || !targetRegion) {
      return this.interactionFailure("区域传送门的生态记录已经失效。");
    }
    if (side === "entry" && portal.requiredBossId !== null) {
      const blocker = this.monsters.find((monster) => monster.id === portal.requiredBossId);
      if (blocker && blocker.hp > 0) {
        return this.interactionFailure(
          `${portal.name} 尚未供能：先击败 ${blocker.name}（ID #${blocker.id}）。`,
        );
      }
    }
    const targetRoom = this.graph.nodes.find(
      (room) => room.id === targetRegion.sourceRoomNodeId,
    );
    const accessMessage = targetRoom ? this.roomAccessMessage(targetRoom) : null;
    if (accessMessage) {
      return this.interactionFailure(`区域传送门拒绝越级：${accessMessage}`);
    }
    const safeDestination = this.safeRegionPortalDestination(
      destination,
      targetRegion.id,
    );
    if (!safeDestination) {
      return this.interactionFailure("区域传送门出口暂被怪物或物品占用，请稍后再试。");
    }
    this.player.x = safeDestination.x;
    this.player.y = safeDestination.y;
    this.updateCurrentRoom(safeDestination);
    this.revealAt(safeDestination);
    this.encounterMeter = resetEncounterMeterAfterBattle(this.encounterMeter);
    this.regionTransferSequence += 1;
    this.regionTransfer = {
      sequence: this.regionTransferSequence,
      fromName: fromRegion.name,
      toName: targetRegion.name,
    };
    this.banner = `区域传送完成：${fromRegion.name} → ${targetRegion.name}。接下来 5 步不会触发随机遭遇。`;
    this.emit();
    return { ok: true, kind: "region-portal", message: this.banner };
  }

  private safeRegionPortalDestination(
    origin: Position,
    targetRegionId: string,
  ): Position | null {
    const candidates: Position[] = [];
    for (let radius = 0; radius <= 3; radius += 1) {
      for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
        for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
          if (Math.abs(x - origin.x) + Math.abs(y - origin.y) !== radius) continue;
          candidates.push({ x, y });
        }
      }
    }
    return candidates.find((position) => {
      if (
        !isMazeWalkable(
          this.mazeFloor,
          position.x,
          position.y,
          this.completedLessons,
          this.openedGateIds,
        ) ||
        biomeRegionAt(this.biomePlan, position).id !== targetRegionId ||
        this.livingActorAt(position) ||
        this.campfires.some((campfire) => (
          campfire.x === position.x && campfire.y === position.y
        )) ||
        this.groundItems.some((item) => (
          item.x === position.x && item.y === position.y
        )) ||
        this.lootBundles.some((bundle) => (
          bundle.x === position.x && bundle.y === position.y
        ))
      ) return false;
      const zone = mazeZoneAt(this.mazeFloor, position);
      const room = zone
        ? this.graph.nodes.find((entry) => entry.id === zone.roomNodeId)
        : null;
      return !room || this.roomAccessMessage(room) === null;
    }) ?? null;
  }

  private revealAt(position: Position): void {
    revealAround(this.mazeFloor, position, 5).forEach((cell) => this.discoveredCells.add(cell));
  }

  private campfirePhaseName(campfire: Campfire): string {
    return {
      front: "前段篝火",
      middle: "中段篝火",
      rear: "后段篝火",
    }[campfire.phase];
  }

  private interactionPrompt(): string {
    if (this.mode === "campfire") return "篝火休整中 · 选择在此休息或答案复盘";
    if (this.mode === "inventory") return "背包管理中 · 换装、使用或丢弃 · ESC 关闭";
    if (this.mode === "loot") return "战利品选择中 · 拾取、装备或保留 · ESC 关闭";
    if (this.mode === "death-review") return "完成本场复盘后重新出发";
    if (this.mode === "challenge") return "机关破解中 · Ctrl + Enter 提交 · ESC 安全退出";
    if (this.mode === "combat") return "Q + S  打开 SQL 战斗终端";
    if (this.mode === "transition") return `传送门启动 · 自动进入第 ${this.floorNumber + 1} 层`;
    if (this.mode === "victory") return "八层已贯通 · 可开始新 Run";
    if (this.mode === "defeat") return "YOU DIED · 正在返回最近篝火";
    const campfire = nearbyCampfire(this.campfires, this.player);
    if (campfire) {
      return this.respawnCampfireId === campfire.id
        ? "E  当前复活点 · 篝火"
        : `E  调查${this.campfirePhaseName(campfire)}`;
    }
    const shortcutKey = this.guidedMap.shortcuts.find((shortcut) => (
      !this.keyItems.includes(shortcut.keyId) &&
      distance(shortcut.keyPosition, this.player) <= 1
    ));
    if (shortcutKey) return `E  拾取捷径钥匙 · ${shortcutKey.name}`;
    const deadEndCache = this.guidedMap.deadEndCaches.find((cache) => (
      !this.openedGateIds.has(cache.id) &&
      distance(cache, this.player) <= 1
    ));
    if (deadEndCache) return "E  打开死路补给 · 支路不会空手而归";
    const guidedShortcut = nearbyShortcut(this.guidedMap, this.player);
    if (guidedShortcut) {
      return this.openedGateIds.has(guidedShortcut.shortcut.id)
        ? `E  穿过${guidedShortcut.shortcut.name}`
        : this.keyItems.includes(guidedShortcut.shortcut.keyId)
          ? `E  使用捷径钥匙 · ${guidedShortcut.shortcut.name}`
          : `E  检查锁住的${guidedShortcut.shortcut.name}`;
    }
    const regionPortal = this.nearbyRegionPortal();
    if (regionPortal) {
      const targetRegion = this.biomePlan.regions.find((region) => (
        region.id === (
          regionPortal.side === "entry"
            ? regionPortal.portal.toRegionId
            : regionPortal.portal.fromRegionId
        )
      ));
      const boss = regionPortal.portal.requiredBossId === null
        ? null
        : this.monsters.find(
            (monster) => monster.id === regionPortal.portal.requiredBossId && monster.hp > 0,
          );
      return boss && regionPortal.side === "entry"
        ? `E  区域门未供能 · 先击败 ${boss.name}`
        : `E  传送到 ${targetRegion?.name ?? "相邻区域"}`;
    }
    const lootBundle = this.lootBundles.find((entry) => distance(entry, this.player) <= 1);
    if (lootBundle) return `E  打开战利品包 · ${lootBundle.items.length} 件物品`;
    const interactItem = this.groundItems.find(
      (item) => item.collection === "interact" && distance(item, this.player) <= 1,
    );
    if (interactItem) {
      return interactItem.id.startsWith("lesson-drop:")
        ? `E  打开战利品宝箱 · ${interactItem.name}`
        : `E  调查 ${interactItem.name}`;
    }
    const challengeGate = this.nearbyLockedChallengeGate();
    if (challengeGate) return "E  接入高难 SQL 机关 · 错误造成 1 点伤害";
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
    const damage = this.applyPlayerDamage(1);
    const damageMessage = damage.armorDamage > 0
      ? `护甲吸收 ${damage.armorDamage} 点${damage.playerDamage > 0 ? `，生命损失 ${damage.playerDamage} 点` : ""}`
      : `生命损失 ${damage.playerDamage} 点`;
    this.banner = `${message} 机关反噬：${damageMessage}。`;
    if (this.player.hp === 0) {
      this.enterDefeat("gate");
    }
    this.emit();
    return {
      accepted: false,
      opened: false,
      gateId,
      message: this.banner,
      playerDamage: damage.playerDamage,
      armorDamage: damage.armorDamage,
      mode: this.mode,
    };
  }

  private enterDefeat(source: "combat" | "gate"): void {
    this.mode = "defeat";
    this.combat = null;
    this.selectedMonsterId = null;
    this.activeGateChallengeId = null;
    this.activeCampfireId = null;
    this.activeLootBundleId = null;
    if (source === "gate") {
      // Gate challenges do not create battle answer records. Clearing this
      // prevents an unrelated previous battle from appearing after respawn.
      this.reviewBattleId = null;
    }
    this.banner += " YOU DIED。正在返回最近休息的篝火；局内进度与怪物剩余生命都会保留。";
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
      armorDamage: 0,
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
