import {
  JOIN_CHAIN,
  SORT_SABER,
} from "../content/floor2Level";
import {
  AGGREGATE_HAMMER,
  DATA_BLADE,
  FILTER_BOW,
  INITIAL_MONSTERS,
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
  ARMORS,
  CONSUMABLE_SLOT_CAPACITY,
  CONSUMABLE_STACK_CAPACITY,
  EQUIPMENT_CAPACITY,
  lootCandidatesForBiome,
} from "../content/inventoryCatalog";
import {
  biomeEncounterFor,
  weightedBiomeEncounterCandidates,
} from "../content/biomeContent";
import {
  floorMapBlueprint,
  floorTransitPresentation,
  regionPortalsEnabledForFloor,
} from "../content/floorMapBlueprints";
import {
  floorExperience,
  hasFloorExperience,
} from "../content/floorExperience";
import { floorLabyrinth } from "../content/floorLabyrinth";
import {
  cloneMazeFloor,
  generateMazeFloor,
  isMazeWalkable,
  mazeGateAt,
  mazeTileAt,
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
  suppressThirdConsecutiveEncounter,
  type EncounterMeter,
} from "./encounterDirector";
import {
  generateRoomGraph,
  lessonsForFloor,
  stableStringHash,
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
import {
  crossesIntoFloorLabyrinth,
  floorLabyrinthAreaAt,
  floorSafeAreaCellKeysAt,
  generateFloorHazards,
  hasDiscoveredLabyrinthCell,
  type FloorHazard,
} from "./floorLabyrinth";
import {
  FLOOR_ONE_MIMIC_MONSTER_ID,
  floorOneChestKind,
  floorOneChestReward,
  floorOneWalkableNeighborCount,
  generateFloorOneChestItems,
  isFloorOneChestItem,
} from "./floorOneTreasure";
import {
  evaluateStage,
  evaluateUnrevealedIdentityQuery,
  unrevealedIdentityQueryMessage,
} from "./lessonEvaluator";
import { floorStoryEvidenceQueryForLandmark } from "./floorStory";
import {
  monsterIdLabel,
  monsterIntentName,
  monsterNameForProfile,
  redactUndiscoveredMonsterIdentityText,
  recoverMonsterIdentity,
} from "./monsterIdentity";
import {
  cloneGuidedMapPlan,
  generateGuidedMapPlan,
  nearbyShortcut,
  shortcutDestination,
  type GuidedMapPlan,
} from "./guidedMap";
import { rollLootItems } from "./lootDirector";
import {
  biomeGuardianIdForStep,
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

const INITIAL_EXPLORATION_BANNER =
  "迷宫已经生成。沿青色箭头找到 ID #001，触碰它进入 SELECT 战斗。";
const LEGACY_INSPECTION_BANNER_PREFIXES = [
  "抄写员：",
  "档案水轮",
  "无名宿舍",
] as const;

function restoredWorldBanner(banner: string): string {
  return LEGACY_INSPECTION_BANNER_PREFIXES.some((prefix) => banner.startsWith(prefix))
    ? INITIAL_EXPLORATION_BANNER
    : banner;
}

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
  "f7-btree",
  "f7-composite",
  "f7-covering",
  "f7-invalid",
  "f7-plan",
  "f7-optimize",
  "f8-mvcc",
  "f8-lock",
  "f8-isolation",
  "f8-modeling",
  "f8-replication",
  "f8-sharding",
  "f8-security",
];

export const LEVEL_XP_THRESHOLDS = [0, 2, 4, 6, 8, 14, 22, 32, 44, 58, 74, 92, 112] as const;

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

export function maxHpForLevel(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 2);
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
    version: 3,
    masteredLessons: [...profile.masteredLessons],
    attempts: { ...profile.attempts },
    discoveredMonsterIds: [...profile.discoveredMonsterIds],
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
    version: 3,
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
    discoveredMonsterIds: [],
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
      const isTutorialTarget = room?.type === "tutorial";
      return {
        monsterId: monster.id,
        roomNodeId: room?.id ?? graph.entryId,
        x: home.x,
        y: home.y,
        home: { ...home },
        behavior: monster.isBoss || isTutorialTarget
          ? "anchored"
          : monster.lessonId === "group-by"
            ? "guard"
            : "wander",
        roamRadius: isTutorialTarget ? 0 : 4,
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
  return expectedActors.map((expected) => {
    const saved = savedByMonster.get(expected.monsterId);
    if (!saved) return cloneWorldActor(expected);
    const shouldRestoreAnchor = (
      expected.behavior === "anchored" &&
      saved.behavior !== "anchored"
    );
    return cloneWorldActor({
      ...saved,
      x: shouldRestoreAnchor ? expected.home.x : saved.x,
      y: shouldRestoreAnchor ? expected.home.y : saved.y,
      home: { ...expected.home },
      behavior: expected.behavior,
      roamRadius: expected.roamRadius,
    });
  });
}

function initialGroundItems(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[] = [],
  guidedMap?: GuidedMapPlan,
): GroundItem[] {
  const items: GroundItem[] = [];
  graph.nodes.forEach((node) => {
    if (node.type === "rest" || !node.reward) return;
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
  if (graph.floor === 1 && guidedMap && campfires.length > 0) {
    items.push(...generateFloorOneChestItems(floor, campfires, guidedMap));
  }
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
  private banner = INITIAL_EXPLORATION_BANNER;
  private adminMode = false;
  private adminPanelOpen = false;
  private adminIdentityMonsterIds = new Set<number>();
  private regionTransferSequence = 0;
  private regionTransfer: GameSnapshot["regionTransfer"] = null;
  private labyrinthEntryConfirmed = false;
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
    this.groundItems = initialGroundItems(
      this.graph,
      this.mazeFloor,
      this.campfires,
      this.guidedMap,
    );
    this.visitedRoomIds.add(this.currentRoomId);
    this.completedRoomIds.add(this.currentRoomId);
    this.revealAt(this.player);

    if (
      savedRun?.version === 11 &&
      (savedRun.generatorVersion === 4 || savedRun.generatorVersion === 5)
    ) {
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
      const restoredDiscoveries = new Set(this.profile.discoveredMonsterIds);
      this.monsters.forEach((monster) => {
        if (monster.hp === 0) restoredDiscoveries.add(monster.id);
      });
      this.profile.discoveredMonsterIds = [...restoredDiscoveries]
        .sort((left, right) => left - right);
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
      if (this.floorNumber === 1) {
        const savedChestIds = new Set(this.groundItems.map((item) => item.id));
        generateFloorOneChestItems(this.mazeFloor, this.campfires, this.guidedMap)
          .filter((item) => (
            !this.openedGateIds.has(item.id) &&
            !savedChestIds.has(item.id)
          ))
          .forEach((item) => this.groundItems.push(item));
      }
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
      this.banner = restoredWorldBanner(savedRun.banner);
      this.selectedMonsterId = this.combat?.targetId ?? this.monsterForCurrentRoom()?.id ?? null;
      this.labyrinthEntryConfirmed =
        floorLabyrinthAreaAt(
          this.floorNumber,
          this.mazeFloor,
          this.campfires,
          this.player,
        ) === "labyrinth" ||
        hasDiscoveredLabyrinthCell(
          this.floorNumber,
          this.mazeFloor,
          this.campfires,
          this.discoveredCells,
        ) ||
        this.visitedRoomIds.size > 1;
      this.revealAt(this.player);
    }
    this.ensureOpenedHiddenAreaRewards();
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
    const visibleProfile = cloneProfile(this.profile);
    if (this.adminMode && this.adminIdentityMonsterIds.size > 0) {
      visibleProfile.discoveredMonsterIds = [...new Set([
        ...visibleProfile.discoveredMonsterIds,
        ...this.adminIdentityMonsterIds,
      ])].sort((left, right) => left - right);
    }
    const redactIdentity = (value: string): string => (
      redactUndiscoveredMonsterIdentityText(
        value,
        this.monsters,
        visibleProfile.discoveredMonsterIds,
      )
    );
    const visibleRoomGraph = cloneGraph(this.graph);
    visibleRoomGraph.nodes = visibleRoomGraph.nodes.map((node) => ({
      ...node,
      title: redactIdentity(node.title),
    }));
    const visibleBiomePlan = cloneBiomePlan(this.biomePlan);
    visibleBiomePlan.regions = visibleBiomePlan.regions.map((region) => ({
      ...region,
      name: redactIdentity(region.name),
    }));
    visibleBiomePlan.portals = visibleBiomePlan.portals.map((portal) => ({
      ...portal,
      name: redactIdentity(portal.name),
    }));
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
    const visibleCombat = cloneCombat(this.combat);
    if (visibleCombat && target) {
      visibleCombat.intent.name = monsterIntentName(
        target,
        visibleProfile.discoveredMonsterIds,
      );
    }
    const visibleAnswerHistory = (records: readonly AnswerAttemptRecord[]) => (
      cloneAnswerHistory(records).map((record) => {
        const monster = INITIAL_MONSTERS.find((entry) => entry.id === record.monsterId);
        const redactRecordIdentity = (value: string): string => (
          redactUndiscoveredMonsterIdentityText(
            value,
            INITIAL_MONSTERS.filter((entry) => entry.floor === record.floor),
            visibleProfile.discoveredMonsterIds,
          )
        );
        return {
          ...record,
          answerSql: redactRecordIdentity(record.answerSql),
          monsterName: monster
            ? monsterNameForProfile(monster, visibleProfile)
            : redactRecordIdentity(record.monsterName),
          stageObjective: redactRecordIdentity(record.stageObjective),
          feedback: redactRecordIdentity(record.feedback),
        };
      })
    );

    return {
      mode: this.mode,
      adminMode: this.adminMode,
      adminPanelOpen: this.adminPanelOpen,
      regionTransfer: this.regionTransfer ? {
        ...this.regionTransfer,
        fromName: redactIdentity(this.regionTransfer.fromName),
        toName: redactIdentity(this.regionTransfer.toName),
      } : null,
      campaign: cloneCampaignProgress(this.campaign),
      biomePlan: visibleBiomePlan,
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
      combat: visibleCombat,
      focusMonsterId: this.combat?.targetId ?? this.selectedMonsterId ?? target?.id ?? null,
      roomGraph: visibleRoomGraph,
      mazeFloor: cloneMazeFloor(this.mazeFloor),
      guidedMap: cloneGuidedMapPlan(this.guidedMap),
      campfires: this.campfires.map((campfire) => ({
        ...campfire,
        restPosition: { ...campfire.restPosition },
      })),
      hazards: this.floorHazards(),
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
      currentRoomTitle: redactIdentity(room.title),
      currentRoomType: room.type,
      visitedRoomIds: [...this.visitedRoomIds],
      completedRoomIds: [...this.completedRoomIds],
      availableRoomIds: this.availableRoomIds(),
      completedLessons: [...this.completedLessons],
      challengeGateId: this.challengeGateId(),
      openedGateIds: [...this.openedGateIds],
      activeGateChallenge: activeGateChallenge ? {
        ...activeGateChallenge,
        objective: redactIdentity(activeGateChallenge.objective),
        schema: activeGateChallenge.schema.map(redactIdentity),
        hints: activeGateChallenge.hints.map(redactIdentity),
      } : null,
      relics: this.relics.map((relic) => ({ ...relic })),
      profile: visibleProfile,
      availableLoot: looseWeapon,
      claimableReward: roomReward,
      runSeed: this.graph.seed,
      floor: this.floorNumber,
      queryCount: this.queryCount,
      totalMoves: this.encounterMeter.totalMoves,
      stepsSinceEncounter: this.encounterMeter.stepsSinceEncounter,
      safeStepsRemaining: this.encounterMeter.safeStepsRemaining,
      hintLevel: this.hintLevel,
      battleReview: visibleAnswerHistory(this.answerHistory.filter(
        (record) => record.battleId === this.reviewBattleId,
      )),
      floorReview: visibleAnswerHistory(this.answerHistory.filter(
        (record) => record.floor === this.floorNumber,
      )),
      missionTitle: redactIdentity(missionTitle),
      missionBody: redactIdentity(missionBody),
      lessonIntro: activeGateChallenge
        ? "可选越级机关：破解只打开当前物理门，不授予课程掌握、经验或战利品。"
        : this.combat || room.lessonId ? redactIdentity(lesson.intro) : "",
      schema: activeGateChallenge
        ? [...activeGateChallenge.schema]
        : this.combat || room.lessonId
        ? [...lesson.schema]
        : ["当前区域没有强制查询。继续探索迷宫或调查发光核心。"],
      queryTemplate: redactIdentity(stage.queryTemplate),
      hints: stage.hints.slice(0, this.hintLevel).map(redactIdentity),
      locks: [...stage.locks],
      banner: redactIdentity(this.banner),
      interactionPrompt: redactIdentity(this.interactionPrompt()),
    };
  }

  toSavedRun(): SavedRun {
    return {
      version: 11,
      generatorVersion: this.mazeFloor.generatorVersion,
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
            gate?.id === this.challengeGateId() ? " 靠近按 E 可解读本层 SQL 密文。" : ""
          }`
        : "前方是无法穿过的魔王城石墙。";
      this.banner = message;
      this.emit();
      return this.moveFailure(from, to, gate ? "gate" : "wall", message);
    }

    const regionGuardianMessage = this.regionGuardianAccessMessage(from, to);
    if (regionGuardianMessage) {
      this.banner = regionGuardianMessage;
      this.emit();
      return this.moveFailure(from, to, "gate", regionGuardianMessage);
    }

    if (
      !this.adminMode &&
      !this.labyrinthEntryConfirmed &&
      crossesIntoFloorLabyrinth(
        this.floorNumber,
        this.mazeFloor,
        this.campfires,
        from,
        to,
      )
    ) {
      const contract = floorLabyrinth(this.floorNumber);
      const message = `${contract.entryPrompt} 迷宫中会出现「${contract.hazardName}」，进入后仍可原路返回安全区。`;
      this.banner = message;
      this.emit();
      return this.moveFailure(from, to, "threshold", message);
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
        hazard: null,
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
    let hazardResolution: MoveResolution["hazard"] = null;
    const hazard = this.floorHazards().find((entry) => (
      entry.x === to.x &&
      entry.y === to.y &&
      !this.openedGateIds.has(entry.id)
    ));
    if (hazard) {
      this.openedGateIds.add(hazard.id);
      const damage = this.applyPlayerDamage(hazard.damage);
      hazardResolution = {
        id: hazard.id,
        name: hazard.name,
        playerDamage: damage.playerDamage,
        armorDamage: damage.armorDamage,
      };
      const damageMessage = damage.armorDamage > 0
        ? `护甲吸收 ${damage.armorDamage} 点${damage.playerDamage > 0 ? `，生命损失 ${damage.playerDamage} 点` : ""}`
        : `生命损失 ${damage.playerDamage} 点`;
      const trigger = floorLabyrinth(this.floorNumber).hazardTrigger;
      this.banner = `${hazard.name}${trigger}：${damageMessage}。这类机关不会进入 SQL 战斗。`;
      if (this.player.hp <= 0) this.enterDefeat("hazard");
    }
    const encounterId = this.mode === "explore" && hazardResolution === null
      ? this.rollAmbush(pickedItemIds.length === 0)
      : null;
    if (
      hazardResolution === null &&
      pickedItemIds.length === 0 &&
      encounterId === null &&
      this.mode === "explore"
    ) {
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
      hazard: hazardResolution,
      message: this.banner,
    };
  }

  confirmLabyrinthEntry(): boolean {
    if (this.mode !== "explore") return false;
    this.labyrinthEntryConfirmed = true;
    return true;
  }

  /** @deprecated Kept for the shipped F1 UI/test contract. */
  confirmFloorOneLabyrinthEntry(): boolean {
    return this.confirmLabyrinthEntry();
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
        ) &&
        !this.guidedMap.shortcuts.some(
          (shortcut) => distance(shortcut.keyPosition, position) <= 1,
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
    this.banner = `已扫描 ${monsterNameForProfile(monster, this.profile)}：错误查询最高受到 ${monster.damage} 点伤害。`;
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
      return this.interactionFailure("SQL 密文终端已经开启。提交查询或按 ESC 退出。");
    }
    const shortcutKey = this.guidedMap.shortcuts.find((shortcut) => (
      !this.keyItems.includes(shortcut.keyId) &&
      distance(shortcut.keyPosition, this.player) <= 1
    ));
    const nearbyLootBundle = [...this.lootBundles].reverse().find(
      (entry) => distance(entry, this.player) <= 1,
    );
    const nearbyGroundItem = this.groundItems
      .filter((entry) => {
        if (entry.collection !== "interact" || distance(entry, this.player) > 1) {
          return false;
        }
        const sourceRoom = this.graph.nodes.find(
          (room) => room.id === entry.sourceRoomId,
        );
        return !sourceRoom?.lessonId || this.completedLessons.has(sourceRoom.lessonId);
      })
      .sort((left, right) => {
        const distanceDelta = distance(left, this.player) - distance(right, this.player);
        if (distanceDelta !== 0) return distanceDelta;

        const leftIsCurrentRoom = left.sourceRoomId === this.currentRoomId ? 0 : 1;
        const rightIsCurrentRoom = right.sourceRoomId === this.currentRoomId ? 0 : 1;
        if (leftIsCurrentRoom !== rightIsCurrentRoom) {
          return leftIsCurrentRoom - rightIsCurrentRoom;
        }

        return left.id.localeCompare(right.id);
      })[0];
    const nearbyGroundRoom = nearbyGroundItem
      ? this.graph.nodes.find((room) => room.id === nearbyGroundItem.sourceRoomId)
      : null;
    if (
      nearbyGroundItem &&
      isFloorOneChestItem(nearbyGroundItem) &&
      distance(nearbyGroundItem, this.player) === 0
    ) {
      return this.openFloorOneChest(nearbyGroundItem);
    }
    if (nearbyGroundItem && distance(nearbyGroundItem, this.player) === 0) {
      return this.collectGroundItem(nearbyGroundItem, true);
    }
    if (nearbyLootBundle && distance(nearbyLootBundle, this.player) === 0) {
      return this.openLootBundle(nearbyLootBundle);
    }
    if (shortcutKey) {
      this.keyItems.push(shortcutKey.keyId);
      this.banner = `获得捷径钥匙：${shortcutKey.name}。回到任一捷径门旁按 E，即可永久开启本层往返通道。`;
      this.emit();
      return { ok: true, kind: "shortcut", message: this.banner };
    }
    const campfire = nearbyCampfire(this.campfires, this.player);
    if (campfire) {
      this.activeCampfireId = campfire.id;
      this.mode = "campfire";
      this.banner = `${this.campfirePhaseName(campfire)}已点燃。可以在此休息，或复盘第 ${this.floorNumber} 层答案。`;
      this.emit();
      return { ok: true, kind: "campfire", message: this.banner };
    }
    const hiddenAreaEntrance = this.nearbyHiddenAreaEntrance();
    if (hiddenAreaEntrance) {
      const { area } = hiddenAreaEntrance;
      const missingLessons = area.requiredLessonIds.filter(
        (lessonId) => !this.completedLessons.has(lessonId),
      );
      if (missingLessons.length > 0) {
        return {
          ok: true,
          kind: "inspection",
          message: `${area.title}：${area.sealedMessage}`,
        };
      }
      const livingGuardians = (area.requiredMonsterIds ?? []).filter(
        (monsterId) => this.monsters.some(
          (monster) => monster.id === monsterId && monster.hp > 0,
        ),
      );
      if (livingGuardians.length > 0) {
        return {
          ok: true,
          kind: "inspection",
          message: `${area.title}：${area.sealedMessage}`,
        };
      }
      this.openedGateIds.add(area.gateId);
      this.ensureHiddenAreaReward(area);
      this.banner = area.openedMessage;
      this.emit();
      return { ok: true, kind: "secret", message: this.banner };
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
      const regionGuardianMessage = this.regionGuardianAccessMessage(
        this.player,
        destination,
      );
      if (regionGuardianMessage) {
        return this.interactionFailure(
          `${shortcut.name}的远端仍被区域首领封锁。${regionGuardianMessage}`,
        );
      }
      this.player.x = destination.x;
      this.player.y = destination.y;
      this.revealAt(destination);
      this.updateCurrentRoom(destination);
      this.banner = `穿过${shortcut.name}，跳过 ${shortcut.detourDistance} 格已探索折返路。`;
      this.emit();
      return { ok: true, kind: "shortcut", message: this.banner };
    }
    if (
      nearbyGroundItem &&
      nearbyGroundRoom?.required === true &&
      nearbyGroundItem.kind === "weapon"
    ) {
      return this.collectGroundItem(nearbyGroundItem, true);
    }
    const regionPortal = this.nearbyRegionPortal();
    if (regionPortal) {
      return this.travelThroughRegionPortal(regionPortal.portal, regionPortal.side);
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
    const floorLandmark = this.nearbyInspectableFloorLandmark();
    if (floorLandmark) return this.inspectFloorLandmark(floorLandmark.id);
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
    this.banner = "已断开 SQL 密文终端。机关门仍保持锁定，退出不会损失生命。";
    this.emit();
    return true;
  }

  resolveGateChallenge(result: SqlQueryResult): GateChallengeResolution {
    const gateId = this.challengeGateId();
    if (this.mode !== "challenge" || !this.activeGateChallengeId) {
      return {
        accepted: false,
        resultDisclosure: "shape-only",
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
      this.banner = "SQL 密文解开：机关门已经永久开启，地图留下新的通路。课程掌握、经验与战利品均未改变。";
      this.emit();
      return {
        accepted: true,
        resultDisclosure: "safe-values",
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
        resultDisclosure: "shape-only",
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
    const regionPortalCells = regionPortalsEnabledForFloor(this.floorNumber)
      ? this.biomePlan.portals.flatMap((portal) => [
          positionKey(portal.entry),
          positionKey(portal.exit),
        ])
      : [];
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
      ...regionPortalCells,
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

  validateCombatQuery(sql: string): { ok: true } | { ok: false; message: string } {
    if (this.mode !== "combat" || !this.combat) return { ok: true };
    const evaluation = evaluateUnrevealedIdentityQuery(
      this.floorNumber,
      this.currentStage(),
      sql,
      this.areCurrentFloorMonsterIdentitiesDiscovered(),
    );
    return evaluation
      ? { ok: false, message: evaluation.message }
      : { ok: true };
  }

  validateGateChallengeQuery(sql: string): { ok: true } | { ok: false; message: string } {
    if (this.mode !== "challenge" || !this.activeGateChallengeId) return { ok: true };
    const message = unrevealedIdentityQueryMessage(
      this.floorNumber,
      "SELECT id FROM monsters",
      sql,
      false,
    );
    return message ? { ok: false, message } : { ok: true };
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
    const identityEvaluation = evaluateUnrevealedIdentityQuery(
      this.floorNumber,
      stage,
      result.sql,
      this.areCurrentFloorMonsterIdentitiesDiscovered(),
    );
    const evaluation = identityEvaluation ?? evaluateStage(stage, result);
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
      const mimicAccepted = target?.id === FLOOR_ONE_MIMIC_MONSTER_ID && evaluation.accepted;
      if (target && target.hp > 0 && (evaluation.attackTargetIds.includes(target.id) || mimicAccepted)) {
        const nextSuccessStep = this.combat.successStep + 1;
        const minimumHp = nextSuccessStep < combatStages.length ? 1 : 0;
        const rawDamage = Math.max(1, this.player.weapon.damage - target.armor);
        const damage = nextSuccessStep >= combatStages.length
          ? target.hp
          : Math.min(rawDamage, Math.max(1, target.hp - minimumHp));
        target.hp = Math.max(minimumHp, target.hp - damage);
        hpUpdates.push({ id: target.id, hp: target.hp });
        events.push({ type: "player-hit", targetId: target.id, amount: damage });
        this.combat.successStep = nextSuccessStep;
        this.combat.round += 1;
        stageAdvanced = true;

        if (target.hp === 0 && nextSuccessStep >= combatStages.length) {
          killedIds.push(target.id);
          events.push({ type: "death", targetId: target.id });
          if (recoverMonsterIdentity(this.profile, target.id)) {
            events.push({
              type: "identity-recovered",
              targetId: target.id,
              itemName: target.name,
            });
          }
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
          this.banner = `${evaluation.message} ${this.player.weapon.name} 命中，${monsterNameForProfile(target, this.profile)} 剩余 ${target.hp} HP。下一问：${nextStage.objective}`;
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
      this.banner = `${evaluation.message} ${
        target ? monsterNameForProfile(target, this.profile) : "未知记录"
      }：${
        target
          ? monsterIntentName(target, this.profile.discoveredMonsterIds)
          : "反击"
      }，${damageMessage}。`;
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
        monsterName: monsterNameForProfile(reviewTarget, this.profile),
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
      resultDisclosure: evaluation.accepted
        ? experience
          ? "full-values"
          : "safe-values"
        : "shape-only",
      message: this.banner,
      queryTargetIds: identityEvaluation ? [] : result.targetIds,
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
    this.banner = `${message} ${
      target ? monsterNameForProfile(target, this.profile) : "未知记录"
    } 趁终端失稳反击，${damageMessage}。`;
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
        monsterName: monsterNameForProfile(reviewTarget, this.profile),
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
      resultDisclosure: "shape-only",
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
    this.groundItems = initialGroundItems(
      this.graph,
      this.mazeFloor,
      this.campfires,
      this.guidedMap,
    );
    this.lootBundles = [];
    this.activeLootBundleId = null;
    this.discoveredCells = new Set();
    this.combat = null;
    this.visitedRoomIds = new Set([this.currentRoomId]);
    this.completedRoomIds = new Set([this.currentRoomId]);
    this.completedLessons = new Set();
    this.openedGateIds = new Set();
    this.adminIdentityMonsterIds = new Set();
    this.activeGateChallengeId = null;
    this.selectedMonsterId = null;
    this.encounterMeter = {
      totalMoves: 0,
      stepsSinceEncounter: 0,
      safeStepsRemaining: INITIAL_SAFE_STEPS,
    };
    this.hintLevel = 0;
    this.regionTransfer = null;
    this.labyrinthEntryConfirmed = false;
    const floorNames: Record<FloorNumber, string> = {
      1: "余烬地窖",
      2: "潮汐群岛",
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
    this.groundItems = initialGroundItems(
      this.graph,
      this.mazeFloor,
      this.campfires,
      this.guidedMap,
    );
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
    this.labyrinthEntryConfirmed = false;
    this.banner = "新迷宫已生成。沿青色箭头触碰 ID #001 开始 SELECT；永久怪物图鉴保持不变。";
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
    const hiddenArea = this.floorHiddenAreas().find(
      (area) => area.roomNodeId === room.id,
    );
    if (hiddenArea && !this.openedGateIds.has(hiddenArea.gateId)) {
      return `${hiddenArea.title}没有出现在当前路线中。留意附近不自然的墙缝或船体裂口。`;
    }
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
    const encounter = biomeEncounterFor(monster.id);
    const accessMessage = this.roomAccessMessage(room);
    if (accessMessage && encounter?.role !== "area-boss") {
      return this.interactionFailure(accessMessage);
    }
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
    const roleLabel = encounter?.role === "area-boss"
      ? "区域首领"
      : encounter?.role === "mini-elite" ? "小型精英" : "触碰遭遇";
    this.banner = `${roleLabel} ${monsterNameForProfile(monster, this.profile)}（${stages.length} 阶段）。按住 Q + S 写出完整 SQL。`;
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
    const weightedCandidates = weightedBiomeEncounterCandidates(
      this.floorNumber,
      currentBiome,
      unlockedLessons,
    );
    const livingIds = new Set(
      this.monsters
        .filter((monster) => monster.encounterType === "ambush" && monster.hp > 0)
        .map((monster) => monster.id),
    );
    const livingCandidates = allowEncounter
      ? weightedCandidates.filter((candidate) => livingIds.has(candidate.monsterId))
      : [];
    const candidates = suppressThirdConsecutiveEncounter(
      livingCandidates,
      this.recentEncounterMonsterIds(2),
    );
    const advance = advanceEncounterMeter(this.encounterMeter, this.graph.seed, candidates);
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
    this.banner = `${roleLabel} ${monsterNameForProfile(monster, this.profile)}！完成 ${
      stages.length
    } 道 ${lessonById(monster.lessonId).concept} 练习即可脱身。`;
    return monster.id;
  }

  private recentEncounterMonsterIds(limit: number): number[] {
    const battleIds = new Set<number>();
    const monsterIds: number[] = [];
    for (let index = this.answerHistory.length - 1; index >= 0; index -= 1) {
      const record = this.answerHistory[index];
      if (!record || battleIds.has(record.battleId)) continue;
      battleIds.add(record.battleId);
      monsterIds.push(record.monsterId);
      if (monsterIds.length >= limit) break;
    }
    return monsterIds;
  }

  /**
   * 查询可以命中当前层任意记录，因此不能只按当前战斗目标判断身份是否解封。
   * 只有本层全部姓名均已恢复后，name / species 才能参与玩家查询。
   */
  private areCurrentFloorMonsterIdentitiesDiscovered(): boolean {
    const discovered = new Set(this.profile.discoveredMonsterIds);
    return this.monsters.every((monster) => discovered.has(monster.id));
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
    const maxHpGained = Math.max(
      0,
      maxHpForLevel(this.player.level) - maxHpForLevel(previousLevel),
    );
    if (maxHpGained > 0) {
      this.player.maxHp += maxHpGained;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + maxHpGained);
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
    const maxHpGained = experience.currentMaxHp - experience.previousMaxHp;
    if (experience.currentLevel > experience.previousLevel) {
      return maxHpGained > 0
        ? `获得 ${experience.gained} XP，升至 LV.${experience.currentLevel}，生命上限 +${maxHpGained}。`
        : `获得 ${experience.gained} XP，升至 LV.${experience.currentLevel}。生命上限暂不变化。`;
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
    this.completeCampaignVictory();
    return "获得第八层钥匙。魔王数据王座已平定，八层 SQL 图鉴均已永久更新。";
  }

  private completeCampaignVictory(): void {
    const completion = advanceCampaignProgress(this.campaign);
    if (
      !completion.ok ||
      !completion.completed ||
      completion.from !== 8 ||
      completion.to !== 8
    ) {
      throw new Error("第八层终局无法提交：Campaign 状态与当前楼层不一致。");
    }
    this.campaign = completion.progress;
    this.mode = "victory";
    this.profile.victories += 1;
    this.profile.bestRunQueries = this.profile.bestRunQueries === null
      ? this.queryCount
      : Math.min(this.profile.bestRunQueries, this.queryCount);
  }

  private completeAmbush(
    monster: Monster,
    events: CombatEvent[],
    experienceMessage: string,
  ): void {
    const openedMimicChest = monster.id === FLOOR_ONE_MIMIC_MONSTER_ID;
    if (openedMimicChest) {
      this.groundItems = this.groundItems.filter((item) => item.id !== "chest:f1:mimic");
      this.openedGateIds.add("chest:f1:mimic");
    }
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
      ? `${openedMimicChest ? "宝箱怪已击败。" : `${monster.name} 已清除。`}${experienceMessage} 掉落 1 个含 ${loot.bundleCount} 件物品的战利品包。`
      : loot.recoveryNames.length > 0
        ? `${openedMimicChest ? "宝箱怪已击败。" : `${monster.name} 已清除。`}${experienceMessage} ${loot.recoveryNames.join("、")}已直接使用，不占背包。`
        : `${openedMimicChest ? "宝箱怪已击败。" : `${monster.name} 已清除。`}${experienceMessage} 本次没有物品掉落；接下来 5 步不会再次遭遇。`;
    const transferMessage = this.autoTransferAfterAreaBoss(monster);
    if (transferMessage) this.banner = `${this.banner} ${transferMessage}`;
  }

  private autoTransferAfterAreaBoss(monster: Monster): string | null {
    if (!regionPortalsEnabledForFloor(this.floorNumber)) return null;
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
      return `区域交通已开放，但主线门仍锁定：${accessMessage}完成后可在交通设施旁按 E 进入。`;
    }
    const destination = this.safeRegionPortalDestination(
      portal.exit,
      targetRegion.id,
    );
    if (!destination) {
      return "区域交通已开放，但落点暂被占用；离开再回来后可在交通设施旁按 E 进入。";
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
    _events: CombatEvent[],
    experienceMessage: string,
  ): void {
    this.completedLessons.add(lesson.id);
    this.completedRoomIds.add(this.currentRoomId);
    if (!this.profile.masteredLessons.includes(lesson.id)) {
      this.profile.masteredLessons.push(lesson.id);
    }
    this.combat = null;
    this.selectedMonsterId = null;
    this.mode = "explore";
    this.hintLevel = 0;
    this.encounterMeter = resetEncounterMeterAfterBattle(this.encounterMeter);

    const roomReward = this.groundItems.find(
      (item) => item.sourceRoomId === this.currentRoomId,
    );
    this.banner = `${lesson.title} 已掌握。${experienceMessage} 获得知识记录；本次没有随机物品掉落。${
      roomReward ? ` 房间宝箱「${roomReward.name}」现在可以调查。` : ""
    }`;
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
      message: "管理员视图已开启：全图、怪物与区域交通均可见；预览操作不会写入正式存档。",
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
    this.groundItems = initialGroundItems(
      this.graph,
      this.mazeFloor,
      this.campfires,
      this.guidedMap,
    );
    this.lootBundles = [];
    this.discoveredCells = new Set();
    this.combat = null;
    this.visitedRoomIds = new Set([this.currentRoomId]);
    this.completedRoomIds = new Set([this.currentRoomId]);
    this.completedLessons = new Set();
    this.openedGateIds = new Set();
    this.adminIdentityMonsterIds = new Set();
    this.activeGateChallengeId = null;
    this.selectedMonsterId = null;
    this.encounterMeter = {
      totalMoves: 0,
      stepsSinceEncounter: 0,
      safeStepsRemaining: INITIAL_SAFE_STEPS,
    };
    this.hintLevel = 0;
    this.regionTransfer = null;
    this.labyrinthEntryConfirmed = true;
    this.revealAt(this.player);
    this.banner = `管理员预览：第 ${floor} 层全图已载入。刷新页面可回到最后一次正式存档。`;
    this.emit();
    return { ok: true, kind: "none", message: this.banner };
  }

  adminApplyPreset(presetId: string): InteractionResolution {
    if (!this.adminMode || this.mode !== "explore") {
      return this.interactionFailure("管理员状态预设当前不可用。");
    }
    if (!hasFloorExperience(this.floorNumber)) {
      return this.interactionFailure("当前楼层还没有可用的精修状态预设。");
    }
    const experience = floorExperience(this.floorNumber);
    const preset = experience.adminPresets.find((entry) => entry.id === presetId);
    if (!preset) return this.interactionFailure("未知管理员状态预设。");

    const completedLessons = new Set<LessonId>(preset.completedLessonIds);
    const defeatedMonsterIds = new Set(preset.defeatedMonsterIds);
    const focusLandmark = experience.landmarks.find(
      (landmark) => landmark.id === preset.focusLandmarkId,
    );
    if (!focusLandmark) {
      return this.interactionFailure("管理员预设缺少有效地标落点。");
    }
    const focusZone = this.mazeFloor.zones.find(
      (zone) => zone.roomNodeId === focusLandmark.anchor.roomNodeId,
    );
    if (!focusZone) {
      return this.interactionFailure("管理员预设地标没有对应的物理房间。");
    }

    this.completedLessons = completedLessons;
    this.openedGateIds = new Set(preset.openedGateIds);
    this.keyItems = [...preset.collectedKeyItems];
    this.adminIdentityMonsterIds = defeatedMonsterIds;
    this.monsters = this.monsters.map((monster) => ({
      ...monster,
      hp: defeatedMonsterIds.has(monster.id) ? 0 : monster.maxHp,
    }));
    this.combat = null;
    this.selectedMonsterId = null;
    this.activeGateChallengeId = null;
    this.activeCampfireId = null;
    this.activeLootBundleId = null;
    this.regionTransfer = null;
    this.hintLevel = 0;

    const progressedRoomIds = new Set<string>([
      this.graph.entryId,
      focusLandmark.anchor.roomNodeId,
      ...this.graph.nodes
        .filter((room) => room.lessonId && completedLessons.has(room.lessonId))
        .map((room) => room.id),
    ]);
    this.visitedRoomIds = new Set(progressedRoomIds);
    this.completedRoomIds = new Set(progressedRoomIds);
    this.groundItems = initialGroundItems(
      this.graph,
      this.mazeFloor,
      this.campfires,
      this.guidedMap,
    ).filter(
      (item) => isFloorOneChestItem(item) || !progressedRoomIds.has(item.sourceRoomId),
    );
    this.lootBundles = [];
    this.ensureOpenedHiddenAreaRewards();

    const target = {
      x: Math.round(
        focusZone.x + focusLandmark.anchor.position.x * Math.max(1, focusZone.width - 1),
      ),
      y: Math.round(
        focusZone.y + focusLandmark.anchor.position.y * Math.max(1, focusZone.height - 1),
      ),
    };
    const candidates: Position[] = [];
    for (let radius = 0; radius <= Math.max(focusZone.width, focusZone.height); radius += 1) {
      for (let y = target.y - radius; y <= target.y + radius; y += 1) {
        for (let x = target.x - radius; x <= target.x + radius; x += 1) {
          if (Math.abs(x - target.x) + Math.abs(y - target.y) !== radius) continue;
          candidates.push({ x, y });
        }
      }
    }
    const destination = candidates.find((position) => (
      position.x >= focusZone.x &&
      position.x < focusZone.x + focusZone.width &&
      position.y >= focusZone.y &&
      position.y < focusZone.y + focusZone.height &&
      isMazeWalkable(
        this.mazeFloor,
        position.x,
        position.y,
        this.completedLessons,
        this.openedGateIds,
      ) &&
      !this.livingActorAt(position)
    )) ?? this.mazeFloor.anchors[focusZone.roomNodeId] ?? this.mazeFloor.spawn;

    this.player.x = destination.x;
    this.player.y = destination.y;
    this.player.hp = this.player.maxHp;
    this.player.heat = 0;
    this.currentRoomId = focusZone.roomNodeId;
    this.revealAt(destination);
    this.banner = `管理员预设：${preset.label} · 已定位 ${focusLandmark.name}。预览不会写入正式进度。`;
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

  private spawnLootBundle(
    monster: Monster,
    sourceRoomId: string,
    position: Position,
    fixedItems: readonly LootItem[],
  ): LootSpawnResolution {
    const biome = biomeRegionAt(this.biomePlan, position).kind;
    const encounter = biomeEncounterFor(monster.id);
    const role = monster.id === FLOOR_ONE_MIMIC_MONSTER_ID
      ? "curriculum" as const
      : encounter?.role ?? (
      monster.isBoss ? "floor-boss" as const : "curriculum"
    );
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
      const changed = previousHp !== this.player.hp || previousArmor !== this.player.armorHp;
      recoveryNames.push(changed
        ? `${item.name}（生命 ${previousHp}→${this.player.hp}，护甲 ${previousArmor}→${this.player.armorHp}）`
        : `${item.name}（恢复品未产生效果）`);
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

  private openFloorOneChest(item: GroundItem): InteractionResolution {
    if (this.floorNumber !== 1 || !isFloorOneChestItem(item)) {
      return this.interactionFailure("这个箱子不属于当前迷宫。 ");
    }
    const kind = floorOneChestKind(item.id);
    if (!kind) return this.interactionFailure("箱子记录已经损坏。 ");
    if (kind === "mimic") {
      return this.engageMimicChest();
    }

    const itemIndex = this.groundItems.findIndex((entry) => entry.id === item.id);
    if (itemIndex < 0) return this.interactionFailure("这个箱子已经被打开。 ");
    this.groundItems.splice(itemIndex, 1);
    this.openedGateIds.add(item.id);
    this.completedRoomIds.add(item.sourceRoomId);

    if (kind === "warp") {
      const destination = this.floorOneWarpDestination(item.id);
      if (!destination) {
        this.banner = "偏移宝箱已经打开，但迷宫没有找到安全支路。请沿原路继续探索。";
      } else {
        const from = { x: this.player.x, y: this.player.y };
        this.player.x = destination.x;
        this.player.y = destination.y;
        this.revealAt(destination);
        this.updateCurrentRoom(destination);
        this.banner = `打开偏移宝箱：坐标被重新写入（${from.x},${from.y} → ${destination.x},${destination.y}）。已传送到非死路迷宫支路。`;
      }
    } else {
      const rewardId = floorOneChestReward(item.id);
      const reward = rewardDetails(rewardId);
      const previousHp = this.player.hp;
      const previousHeat = this.player.heat;
      if (rewardId) this.applyReward(rewardId);
      this.banner = rewardId === "restore-12-hp"
        ? `打开${item.name}：${reward?.name ?? "恢复品"}直接使用，生命 ${previousHp} → ${this.player.hp}。${reward?.description ?? ""}`
        : `打开${item.name}：${reward?.name ?? "冷却片"}直接使用，热量 ${previousHeat} → ${this.player.heat}。${reward?.description ?? ""}`;
    }
    this.emit();
    return { ok: true, kind: "reward", message: this.banner };
  }

  private engageMimicChest(): InteractionResolution {
    if (this.mode !== "explore") {
      return this.interactionFailure("当前不能打开宝箱怪。 ");
    }
    const monster = this.monsters.find((entry) => entry.id === FLOOR_ONE_MIMIC_MONSTER_ID);
    const stages = monster ? practiceStagesFor(monster.id) : [];
    if (!monster || monster.hp <= 0 || stages.length === 0) {
      return this.interactionFailure("箱盖已经安静下来。 ");
    }
    this.beginBattleReview();
    this.mode = "combat";
    this.combat = {
      targetId: monster.id,
      kind: "ambush",
      round: 1,
      successStep: 0,
      intent: {
        name: monster.attackName,
        damage: monster.damage,
        locks: [...stages[0].locks],
      },
    };
    this.selectedMonsterId = monster.id;
    this.hintLevel = this.relics.some((relic) => relic.id === "schema-eye") ? 1 : 0;
    this.banner = `沉默木箱突然合拢：ID #${String(monster.id).padStart(3, "0")} 宝箱怪苏醒。完成 ${stages.length} 道第一层基础题，才能打开箱腹。`;
    this.emit();
    return { ok: true, kind: "combat", message: this.banner };
  }

  private floorOneWarpDestination(chestId: string): Position | null {
    const safeCells = safeZoneCellKeys(this.mazeFloor, this.campfires);
    const occupied = new Set([
      ...this.groundItems.map((item) => `${item.x}:${item.y}`),
      ...this.lootBundles.map((bundle) => `${bundle.x}:${bundle.y}`),
      ...this.worldActors
        .filter((actor) => this.monsters.some((monster) => monster.id === actor.monsterId && monster.hp > 0))
        .map((actor) => `${actor.x}:${actor.y}`),
    ]);
    const hazards = new Set(this.floorHazards().map((hazard) => `${hazard.x}:${hazard.y}`));
    const candidates: Position[] = [];
    for (let y = 2; y < this.mazeFloor.height - 2; y += 1) {
      for (let x = 2; x < this.mazeFloor.width - 2; x += 1) {
        const position = { x, y };
        const key = `${x}:${y}`;
        if (
          mazeTileAt(this.mazeFloor, x, y) !== "." ||
          mazeZoneAt(this.mazeFloor, position) !== null ||
          safeCells.has(key) ||
          occupied.has(key) ||
          hazards.has(key) ||
          floorOneWalkableNeighborCount(this.mazeFloor, position) < 2
        ) continue;
        candidates.push(position);
      }
    }
    const ordered = candidates.sort((left, right) => (
      stableStringHash(`${this.mazeFloor.seed}:${chestId}:${left.x}:${left.y}`) -
      stableStringHash(`${this.mazeFloor.seed}:${chestId}:${right.x}:${right.y}`)
    ));
    return ordered.find((position) => distance(position, this.player) >= 8) ?? ordered[0] ?? null;
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
    const openedBattleChest =
      item.id.startsWith("lesson-drop:") ||
      item.id.startsWith("room-reward:");
    if (item.rewardId === "floor-key") {
      if (this.floorNumber < 8) {
        this.mode = "transition";
        this.banner = `${openedBattleChest ? "打开战利品宝箱，" : ""}第 ${this.floorNumber} 层钥匙已接入传送门。无需按键，1.5 秒后自动进入第 ${this.floorNumber + 1} 层。`;
      } else {
        this.completeCampaignVictory();
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
    const room = this.graph.nodes.find((entry) => entry.id === item.sourceRoomId);
    if (room?.lessonId && !this.completedLessons.has(room.lessonId)) return null;
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
    this.banner = `${monsterNameForProfile(monster, this.profile)} 正在区域内巡逻。触碰才会开战。`;
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
    if (!regionPortalsEnabledForFloor(this.floorNumber)) return null;
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

  private floorLandmarkPosition(landmarkId: string): Position | null {
    if (!hasFloorExperience(this.floorNumber)) return null;
    const landmark = floorExperience(this.floorNumber).landmarks.find(
      (entry) => entry.id === landmarkId,
    );
    if (!landmark) return null;
    const zone = this.mazeFloor.zones.find(
      (entry) => entry.roomNodeId === landmark.anchor.roomNodeId,
    );
    if (!zone) return null;
    return {
      x: Math.round(zone.x + landmark.anchor.position.x * zone.width),
      y: Math.round(zone.y + landmark.anchor.position.y * zone.height),
    };
  }

  private floorHiddenAreas() {
    if (!hasFloorExperience(this.floorNumber)) return [];
    return floorExperience(this.floorNumber).hiddenAreas;
  }

  private ensureOpenedHiddenAreaRewards(): void {
    this.floorHiddenAreas()
      .filter((area) => this.openedGateIds.has(area.gateId))
      .forEach((area) => this.ensureHiddenAreaReward(area));
  }

  private ensureHiddenAreaReward(
    area: ReturnType<GameSession["floorHiddenAreas"]>[number],
  ): void {
    const armorId = area.rewardArmorId;
    if (!armorId || this.acquiredUniqueItemIds.has(armorId)) return;
    const bundleId = `hidden-reward:${area.id}`;
    if (this.lootBundles.some((bundle) => bundle.id === bundleId)) return;
    const armor = ARMORS[armorId];
    const position = this.mazeFloor.anchors[area.roomNodeId];
    if (!armor || !position) return;
    this.lootBundles.push({
      id: bundleId,
      sourceMonsterId: null,
      sourceRoomId: area.roomNodeId,
      floor: this.floorNumber,
      ...position,
      items: [{
        dropId: `${bundleId}:${armor.id}`,
        itemId: armor.id,
        kind: "armor",
        name: armor.name,
        description: armor.description,
        guaranteed: true,
        probability: 1,
        protected: false,
        armor: { ...armor },
        armorHp: armor.maxArmor,
      }],
    });
  }

  private nearbyHiddenAreaEntrance(): {
    area: ReturnType<GameSession["floorHiddenAreas"]>[number];
    gate: MazeFloor["gates"][number];
  } | null {
    const areas = this.floorHiddenAreas();
    for (const area of areas) {
      if (this.openedGateIds.has(area.gateId)) continue;
      const gate = this.mazeFloor.gates.find((entry) => entry.id === area.gateId);
      if (gate && distance(gate, this.player) <= 1) return { area, gate };
    }
    return null;
  }

  private floorNpcPosition(npcId: string): Position | null {
    if (!hasFloorExperience(this.floorNumber)) return null;
    const npc = floorExperience(this.floorNumber).npcPlacements.find(
      (entry) => entry.id === npcId,
    );
    if (!npc) return null;
    const zone = this.mazeFloor.zones.find(
      (entry) => entry.roomNodeId === npc.anchor.roomNodeId,
    );
    if (!zone) return null;
    return {
      x: Math.round(zone.x + npc.anchor.position.x * zone.width),
      y: Math.round(zone.y + npc.anchor.position.y * zone.height),
    };
  }

  private nearbyInspectableFloorLandmark(): { id: string; position: Position } | null {
    if (!hasFloorExperience(this.floorNumber)) return null;
    const experience = floorExperience(this.floorNumber);
    const ids = experience.landmarks
      .filter((landmark) => (
        landmark.interaction !== null
        && landmark.kind !== "campfire"
        && landmark.kind !== "transit"
        && landmark.kind !== "sql-seal"
      ))
      .map((landmark) => landmark.id);
    const npcId = `npc-scribe-f${this.floorNumber}`;
    return [
      { id: npcId, position: this.floorNpcPosition(npcId) },
      ...ids.map((id) => ({ id, position: this.floorLandmarkPosition(id) })),
    ]
      .filter((entry): entry is { id: string; position: Position } => entry.position !== null)
      .filter((entry) => distance(entry.position, this.player) <= 3)
      .sort((left, right) => (
        distance(left.position, this.player) - distance(right.position, this.player)
      ))[0] ?? null;
  }

  private inspectFloorLandmark(landmarkId: string): InteractionResolution {
    let message: string;
    if (landmarkId === "npc-scribe-f1") {
      message = !this.completedLessons.has("select")
        ? "抄写员：先去档案水轮。找出 ID #001 的记录，学会用 SELECT 读取字段、用 FROM 指定表。"
        : !this.completedLessons.has("where")
          ? "抄写员：水轮已经醒了。下一步用 WHERE 只留下目标记录，让积水退去。"
          : !this.completedLessons.has("is-null")
            ? "抄写员：宿舍床牌露出来了。NULL 不是空字符串；去确认那条真正缺失关联值的记录。"
            : !this.completedLessons.has("group-by")
              ? "抄写员：名字散在多条信号里。用 COUNT 与 GROUP BY 把同类记录聚成一组。"
              : !this.completedLessons.has("having")
                ? "抄写员：分组已经完成。最后用 HAVING 筛选聚合后的结果，打开登记大厅。"
                : "抄写员：这一层的记录已经完整。前往回燃登记大厅，击败守门者后乘升降机上行。";
    } else if (landmarkId === "f1-water-wheel") {
      message = !this.completedLessons.has("select")
        ? "档案水轮停在 ID #001 卡住的控制记录上。击败它并完成 SELECT / FROM，水轮会自动启动。"
        : !this.completedLessons.has("where")
          ? "档案水轮正在转动，但排水记录仍未筛准。继续完成 WHERE，让水位降到宿舍门槛以下。"
          : "档案水轮稳定运转，排水渠已降到低水位；它是 SQL 结果驱动的世界机关，不需要再次启动。";
    } else if (landmarkId === "f1-nameless-beds") {
      message = !this.completedLessons.has("where")
        ? "无名宿舍仍被高水遮住。先完成 SELECT / FROM 与 WHERE，让水位下降。"
        : !this.completedLessons.has("is-null")
          ? "床牌已经露出，但仍显示 ???。击败 ID #003，并用 IS NULL 确认缺失的 master_id。"
          : "床牌已经显示 NULL：这条记录真实存在，只是名字关联值缺失。";
    } else if (landmarkId === "f1-sealed-vault") {
      message = "封存旧库：旧页右下角都有同一枚恢复印，姓名栏却被裁去。宝箱只提供本轮构筑奖励；真正留下的是‘被移出当前表仍可能存在’这条证据。";
    } else if (landmarkId === "npc-scribe-f2") {
      message = !this.completedLessons.has("order-by")
        ? "抄写员：先读取七盏浮标的强度，用 ORDER BY 排出第一条可走航线。"
        : !this.completedLessons.has("distinct")
          ? "抄写员：航线已经有顺序。接下来用 DISTINCT 判断哪些水纹重复、哪些仍来自不同岛屿。"
          : !this.completedLessons.has("inner-join")
            ? "抄写员：沉水村落已经露出。去双端根桥，用 INNER JOIN 说明怪物记录与房间记录如何相连。"
            : !this.completedLessons.has("left-join")
              ? "抄写员：根桥接通了两端。再用 LEFT JOIN 保留没有装备记录的怪物，别让缺失关系把整行吞掉。"
              : !this.completedLessons.has("join-boss")
                ? "抄写员：七个来源都已保留。前往月潮灯塔，用完整 JOIN 阻止守卫只留下出现最多的一页。"
                : "抄写员：灯塔已经同时照亮七个方向。北岸渡船会带我们去白霜墓原。";
    } else if (landmarkId === "f2-ranked-beacons") {
      message = !this.completedLessons.has("order-by")
        ? "七盏月潮浮标的信号强弱混在一起。完成 ORDER BY / LIMIT 后，最强信号会先点亮可走航线。"
        : "浮标已按强度排列，但顺序只决定先去哪里，不能证明七份记录是同一个人。";
    } else if (landmarkId === "f2-drowned-village") {
      message = !this.completedLessons.has("distinct")
        ? "水下门牌在重复波纹中重叠。先完成 DISTINCT，分清重复显示与真实存在的不同来源。"
        : !this.completedLessons.has("left-join")
          ? "七块门牌已经分开，其中一扇门没有装备记录。之后用 LEFT JOIN 保留它，再确认缺失的一侧。"
          : "沉水村落的无装备门牌仍被保留：右表没有匹配记录，不等于左表居民不存在。";
    } else if (landmarkId === "f2-root-bridge") {
      message = !this.completedLessons.has("inner-join")
        ? "古树根桥的两端分别刻着 monsters.room_id 与 rooms.id。完成 INNER JOIN 后，两端才会接合。"
        : "根桥已经按 monsters.room_id = rooms.id 接通。关系必须说明两端，不能只凭相似名字猜测。";
    } else if (landmarkId === "f2-wreck-ledger") {
      message = "沉船记录舱：七只防水匣来自七个港口，共享同一枚恢复印。构筑宝箱不会替你选出唯一真名；这间舱室只证明来源不能被粗暴去重。";
    } else if (landmarkId === "npc-scribe-f3") {
      message = !this.completedLessons.has("f3-inner")
        ? "抄写员：先走到断裂骨桥。给 monsters 和 rooms 各取一个短别名，再用 ON 明确连接两端。"
        : !this.completedLessons.has("f3-left")
          ? "抄写员：匹配成功的记录已经接上。现在保留没有装备记录的怪物，别让缺失的右表吞掉左表。"
          : !this.completedLessons.has("f3-self")
            ? "抄写员：同一张 monsters 表里同时有死者和主人。给它两种身份，再沿 master_id 找过去。"
            : !this.completedLessons.has("f3-chain")
              ? "抄写员：两端还不够。把怪物、墓室与遗物串成三段证据链。"
              : !this.completedLessons.has("f3-union")
                ? "抄写员：两片墓园都留下了证词。用 UNION 保留双方，而不是替它们选一个胜者。"
                : "抄写员：关系已经完整。去审计死灵王所谓的唯一继承人，然后点燃葬火井。";
    } else if (landmarkId === "f3-relation-bridge") {
      message = this.completedLessons.has("f3-inner")
        ? "骨桥已按 monsters.room_id = rooms.id 接合。桥能成立，是因为关系明确写出了两端。"
        : "断桥两端分别刻着 monsters.room_id 与 rooms.id。完成 INNER JOIN / ON，桥骨才会找到对应的墓室。";
    } else if (landmarkId === "f3-master-steles") {
      message = this.completedLessons.has("f3-self")
        ? "双名墓碑已分别标为 child 与 master：同一张表可以在一次查询中承担不同身份。"
        : "两块墓碑来自同一张 monsters 表。若不给它们不同别名，无法分清谁是死者、谁是主人。";
    } else if (landmarkId === "f3-relic-chain") {
      message = this.completedLessons.has("f3-chain")
        ? "三段遗物链已经闭合：怪物记录连到墓室，墓室旁的装备记录再提供遗物力量。"
        : "断链横跨 monsters、rooms 与 monster_gear。只有三张表都写出别名与连接条件，证据才完整。";
    } else if (landmarkId === "f3-reliquary") {
      message = "无主遗物室：current_owner 已确认是 NULL。它没有现在的主人，不代表它从未属于任何人。";
    } else if (landmarkId === "npc-scribe-f4") {
      message = !this.completedLessons.has("f4-scalar")
        ? "抄写员：不要同时追三条管线。先让内层查询返回一个 id，再由外层读取对应记录。"
        : !this.completedLessons.has("f4-in")
          ? "抄写员：一个结果已经找到。冰库需要一组房间 id，用 IN 判断怪物是否属于这组结果。"
          : !this.completedLessons.has("f4-exists")
            ? "抄写员：雷晶只关心记录是否存在。用 EXISTS，让内层回答有或没有。"
            : !this.completedLessons.has("f4-correlated")
              ? "抄写员：下一步让内层查询引用当前外层记录，逐行核对各自的装备力量。"
              : !this.completedLessons.has("f4-cte")
                ? "抄写员：依赖链太长了。先用 WITH 给中间结果命名，再从这个结果继续查询。"
                : "抄写员：最后沿 master_id 递归追到源头。三场事故会回到同一个仍为 OPEN 的命令。";
    } else if (landmarkId === "f4-source-core") {
      message = this.completedLessons.has("f4-scalar")
        ? "命令源炉已经显示内层得到的单一 id；外层只负责读取这个 id 对应的记录。"
        : "源炉外层没有目标。先在括号内查询一个确定 id，再把它交给外层条件。";
    } else if (landmarkId === "f4-frost-array") {
      message = this.completedLessons.has("f4-in")
        ? "属于第四层 frost 区域的冰槽已被同时选中。IN 接受的是一组结果，不必把每个 id 写死。"
        : "冻结阵列需要 rooms 表返回一组 id，再由 monsters.room_id 判断成员关系。";
    } else if (landmarkId === "f4-forge-lord") {
      const defeated = this.monsters.some((monster) => monster.id === 44 && monster.hp <= 0);
      message = defeated
        ? "霜炉主已经倒下。它身后的回燃门开始显形，保存着第一层登记厅的一段残响。"
        : "中层首领 ID #044 截断了火炉与雷晶核心之间的依赖链。击败它，才能让回燃门出现。";
    } else if (landmarkId === "f4-dependency-spine") {
      message = this.completedLessons.has("f4-recursive")
        ? "完整递归链已经落在 ROYAL-UPDATE-01；事务状态是 OPEN，而不是失败或已撤销。"
        : this.completedLessons.has("f4-cte")
          ? "公共表表达式已有名字。继续用递归项沿 master_id 逐层追溯，直到没有上级记录。"
          : "三种元素管线都连到同一根脊柱。用 WITH 命名中间结果，避免反复重写同一段子查询。";
    } else if (landmarkId === "f4-echo-gate") {
      message = this.openedGateIds.has("gate:floor-4-treasure")
        ? "回燃残响：这里复制了第一层的墙与火，却没有复制当时的你。房间深处留着一件可换装的回燃衣。"
        : "回燃门仍封闭。完成前三种子查询并击败中层首领 ID #044，余烬轮廓才会成为入口。";
    } else if (landmarkId === "f4-echo-registry") {
      message = "残响登记台：水轮只是一次保存下来的调用轮廓。旧页上的姓名仍被裁去，只有“恢复许可有效”这一枚印记在四层之后继续返回真值。";
    } else if (landmarkId === "f4-echo-ember") {
      message = "无温余烬：它记得你曾被火送回，却不提供新的休息与复活点。当前复活点仍由第四层真正点燃的篝火决定。";
    } else if (landmarkId === "f4-echo-null-bed") {
      message = "NULL 床位残影：床位记录仍在，只是姓名关联缺失。四层过去，这条区别依然成立——NULL 不是空字符串，也不是整行不存在。";
    } else if (landmarkId === "f4-echo-return") {
      message = "依赖返回门：沿原路离开即可回到三相升炉。残响不会重置第四层怪物、篝火、迷雾，也不会改写第一层的真实进度。";
    } else if (landmarkId === "npc-scribe-f5") {
      message = !this.completedLessons.has("f5-over")
        ? "抄写员：先别急着排名。用 OVER 指定窗口，让每一名守卫仍保留自己的明细。"
        : !this.completedLessons.has("f5-row-number")
          ? "抄写员：分区已经可见。现在用 ROW_NUMBER 给同一分区建立稳定岗次。"
          : !this.completedLessons.has("f5-rank")
            ? "抄写员：相同分数不该被假装成不同。比较 RANK 与 DENSE_RANK，看看空档落在哪里。"
            : !this.completedLessons.has("f5-lag-lead")
              ? "抄写员：排名只能告诉你位置。用 LAG 与 LEAD 读取前后岗，找出巡逻断点。"
              : !this.completedLessons.has("f5-frame")
                ? "抄写员：警戒值正在逐行累积。把窗口范围写清楚，不要让未来行泄露进当前判断。"
                : "抄写员：最后只保留每个分区的前几名。可我开始怀疑，决定公开顺序的人才是这座城真正的主人。";
    } else if (landmarkId === "f5-muster-board") {
      message = this.completedLessons.has("f5-row-number")
        ? "轮值表已按 sector 分区，并为每名守卫保留稳定 row_number。没有一行因为聚合而消失。"
        : this.completedLessons.has("f5-over")
          ? "轮值表已经按分区展开，但同分守卫的先后仍不稳定。下一步补上确定排序。"
          : "整座外城只显示一条总计。用 OVER (PARTITION BY ...) 保留明细，再观察每个分区内部的结果。";
    } else if (landmarkId === "f5-rank-standards") {
      message = this.completedLessons.has("f5-rank")
        ? "两面旗已经同时升起：RANK 为并列名次留下空档，DENSE_RANK 则紧密衔接。"
        : "两面标准旗把同分守卫强行排成不同名次。完成排名题，让并列关系真正显形。";
    } else if (landmarkId === "f5-patrol-chain") {
      message = this.completedLessons.has("f5-lag-lead")
        ? "岗灯已连接前后记录；链条断开的地方就是巡逻空档。"
        : "每盏岗灯只知道自己。用 LAG / LEAD 让当前行看到同一分区中的前一岗与后一岗。";
    } else if (landmarkId === "f5-alert-wall") {
      message = this.completedLessons.has("f5-frame")
        ? "警戒墙只累计到当前岗，未来记录不再提前污染判断。"
        : "警戒墙把整个分区一次性照亮。为窗口指定从首行到当前行的范围，恢复真实累计过程。";
    } else if (landmarkId === "f5-silent-roster") {
      message = this.openedGateIds.has("gate:floor-5-treasure")
        ? "静默名册室保存着从未公开的居民顺序。黑铁甲放在中央，穿上后角色会换成重甲轮廓。"
        : "无编号铁门只接受完整窗口推理：OVER、ROW_NUMBER 与 RANK 都成立后，名册才会开口。";
    } else if (landmarkId === "npc-scribe-f6") {
      message = !this.completedLessons.has("f6-insert")
        ? "抄写员：所有写操作都只发生在一次性副本。先明确列名和值，再插入一条修复记录。"
        : !this.completedLessons.has("f6-update")
          ? "抄写员：新记录已经存在。用 WHERE 只更新目标鳞片，别让整张表一起改变。"
          : !this.completedLessons.has("f6-delete")
            ? "抄写员：重复记录可以删除，但必须先用条件证明你锁定的是哪一行。"
            : !this.completedLessons.has("f6-constraint")
              ? "抄写员：让约束替我们拒绝不可能的候选状态。失败也应当留下可读原因。"
              : !this.completedLessons.has("f6-transaction")
                ? "抄写员：现在同时看原始状态和候选状态。BEGIN 后修改，再用 ROLLBACK 安全返回。"
                : "抄写员：最后用 SAVEPOINT 只撤销错误的一段。安全不是永远不改，而是让每次改变都能被验证。";
    } else if (landmarkId === "f6-sandbox-incubator") {
      message = this.completedLessons.has("f6-update")
        ? "孵化副本显示原始与候选两列；只有被 WHERE 锁定的记录发生了改变。"
        : this.completedLessons.has("f6-insert")
          ? "新鳞片已经写入隔离副本。下一步只更新指定 id，不要省略 WHERE。"
          : "孵化台每次都会重置。写出明确列名的 INSERT，观察新记录怎样进入候选状态。";
    } else if (landmarkId === "f6-cleanup-sluice") {
      message = this.completedLessons.has("f6-delete")
        ? "清理槽只吞下了被 id 与状态共同锁定的重复鳞片，其余记录仍在。"
        : "槽内混有真鳞与重复鳞片。DELETE 前先写 WHERE；没有边界的删除不会被工坊接受。";
    } else if (landmarkId === "f6-constraint-door") {
      message = this.completedLessons.has("f6-constraint")
        ? "无效候选被 CHECK 约束挡在门外；原始数据没有受到污染。"
        : "龙晶门正在测试一条违反约束的候选记录。读懂失败原因，再处理合法值。";
    } else if (landmarkId === "f6-state-bridge") {
      message = this.completedLessons.has("f6-transaction")
        ? "双轨桥重新重合：候选修改已经回滚，原始状态保持完整。"
        : "左轨是事务开始前，右轨是修改后。完成 BEGIN / ROLLBACK，让损坏的候选回到原点。";
    } else if (landmarkId === "f6-savepoint-altar") {
      message = this.completedLessons.has("f6-savepoint")
        ? "祭台保留了已验证步骤，只撤销保存点之后的错误操作。"
        : "整次回滚会丢掉已经正确的修改。设置 SAVEPOINT，再局部退回。";
    } else if (landmarkId === "f6-uncommitted-rookery") {
      message = this.openedGateIds.has("gate:floor-6-treasure")
        ? "未提交育龙室保存着候选生命的审计痕迹。龙鳞甲已可领取并换装。"
        : "育龙室要求你先证明三件事：能明确写入、能定向更新、也能精确删除。";
    } else if (landmarkId === "npc-scribe-f7") {
      message = !this.completedLessons.has("f7-btree")
        ? "抄写员：先沿 B-Tree 找到单点路径。索引不是答案，只是缩短抵达答案的路。"
        : !this.completedLessons.has("f7-composite")
          ? "抄写员：复合索引有顺序。先使用最左列，再观察后续列是否还能收窄范围。"
          : !this.completedLessons.has("f7-covering")
            ? "抄写员：若索引已经包含所需字段，就不必每次回到主表湖底。"
            : !this.completedLessons.has("f7-invalid")
              ? "抄写员：函数、隐式转换和范围条件可能让好索引失效。先解释为什么，再修查询。"
              : !this.completedLessons.has("f7-plan")
                ? "抄写员：读取执行计划，不要只凭查询看起来短就宣布它更快。"
                : "抄写员：最后比较候选路径的代价。最快的路不是唯一的路，也不一定是永远正确的路。";
    } else if (landmarkId === "f7-scan-road" || landmarkId === "f7-index-road") {
      message = this.completedLessons.has("f7-composite")
        ? "索引石径已形成复合路径：最左前缀先定位，再由后续列继续缩小候选范围。"
        : this.completedLessons.has("f7-btree")
          ? "第一段 B-Tree 石径已经点亮。继续检查复合索引的列顺序。"
          : "石径仍暗。先让等值条件沿 B-Tree 从根节点走到目标叶节点。";
    } else if (landmarkId === "f7-covering-lake") {
      message = this.completedLessons.has("f7-covering")
        ? "索引已经覆盖本次读取字段，湖面直接映出结果，不再潜回主表。"
        : "每次查询都从索引岸边潜回主表湖底。尝试让索引包含本次真正需要的字段。";
    } else if (landmarkId === "f7-broken-root") {
      message = this.completedLessons.has("f7-invalid")
        ? "缠根条件已经改写，范围门重新使用可索引列打开。"
        : "函数包裹和隐式转换缠住了索引根。找出失效原因，再恢复可搜索条件。";
    } else if (landmarkId === "f7-plan-tree") {
      message = this.completedLessons.has("f7-plan")
        ? "执行计划树已展开：访问方式、估算行数与额外排序都可逐节点读取。"
        : "计划树只显示一个黑箱。使用 EXPLAIN，比较实际访问路径而不是猜测。";
    } else if (landmarkId === "f7-blind-garden") {
      message = this.openedGateIds.has("gate:floor-7-treasure")
        ? "盲索引花园没有路标，却保留所有候选路径。晶甲会让角色换成折光轮廓。"
        : "花园拒绝只背结论的人。完成 B-Tree、复合索引和覆盖索引，暗门才会显形。";
    } else if (landmarkId === "npc-scribe-f8") {
      message = !this.completedLessons.has("f8-mvcc")
        ? "抄写员：先看两个事务如何读取同一份历史。MVCC 让读者看到一致快照。"
        : !this.completedLessons.has("f8-lock")
          ? "抄写员：快照保护了读，却没有消除写冲突。把等待关系画成环，找出死锁。"
          : !this.completedLessons.has("f8-isolation")
            ? "抄写员：选择隔离级别，就是选择哪些并发现象可以被接受。"
            : !this.completedLessons.has("f8-modeling")
              ? "抄写员：高堂要求重新划分实体、关系与约束。模型决定未来查询能否被清楚表达。"
              : !this.completedLessons.has("f8-replication")
                ? "抄写员：复制带来可用性，也带来延迟。先声明读到旧数据时系统如何回应。"
                : !this.completedLessons.has("f8-sharding")
                  ? "抄写员：分片键会决定数据聚在一起还是永远跨区奔波。"
                  : "抄写员：最后审计最小权限与迁移顺序。我们不是来覆盖旧库，而是让它第一次承认自己改过什么。";
    } else if (landmarkId === "f8-version-gallery") {
      message = this.completedLessons.has("f8-mvcc")
        ? "版本长廊已经冻结为一致快照；较新的版本仍存在，只是不属于当前读视图。"
        : "多条版本在长廊中互相覆盖。先确定 MVCC 快照边界，让当前事务只读取应当可见的版本。";
    } else if (landmarkId === "f8-deadlock-gate") {
      message = this.completedLessons.has("f8-lock")
        ? "等待图中的环已经暴露，牺牲者被明确选择，门锁随之解除。"
        : "两扇黑金门互相等待。读取锁持有者与等待者，找出闭合环。";
    } else if (landmarkId === "f8-incident-wings") {
      const completed = ["f8-isolation", "f8-modeling", "f8-replication", "f8-sharding"]
        .filter((lessonId) => this.completedLessons.has(lessonId as LessonId)).length;
      message = `四座事故侧翼已修复 ${completed}/4：隔离、建模、复制、分片。每修复一翼，中央迁移台就多获得一份可验证输入。`;
    } else if (landmarkId === "f8-migration-dais") {
      message = this.completedLessons.has("f8-sharding")
        ? "迁移台已收齐四份事故修复记录。最终步骤必须包含校验、最小权限与可回滚边界。"
        : "迁移台仍在等待四座事故侧翼。先完成隔离、建模、复制与分片，再提交最后方案。";
    } else if (landmarkId === "f8-zero-row-chapel") {
      message = this.openedGateIds.has("gate:floor-8-treasure")
        ? "零行礼拜堂证明：结果为空不等于查询失败。王室甲已经从旧展示柜移交给你。"
        : "礼拜堂只为能区分空结果、错误结果与权限拒绝的人开启。先完成前四座事故侧翼。";
    } else if (landmarkId === "f8-sunset-vista") {
      const finished = this.monsters.some((monster) => monster.id === 84 && monster.hp <= 0)
        || this.completedLessons.has("f8-security");
      message = finished
        ? "落日之后出现了新的晨线。旧库没有被删除；它带着迁移记录成为可被追溯的历史。"
        : "高堂尽头仍只有正在褪色的落日。完成最终审计后，这里才会显示新的天光。";
    } else {
      const landmark = hasFloorExperience(this.floorNumber)
        ? floorExperience(this.floorNumber).landmarks.find(
            (entry) => entry.id === landmarkId,
          )
        : null;
      if (!landmark?.interaction) {
        return this.interactionFailure("这处地标没有可读取的记录。");
      }
      message = `${landmark.name}：${landmark.interaction}。`;
    }
    const evidence = floorStoryEvidenceQueryForLandmark(
      landmarkId,
      this.completedLessons,
      this.openedGateIds,
    );
    if (evidence) {
      const fields = evidence.expectedColumns.length > 0
        ? evidence.expectedColumns.join(" · ")
        : "无返回字段";
      message = [
        message,
        "",
        `已解密 SQL · ${evidence.title}`,
        evidence.sql,
        `真实结果：${evidence.expectedRowCount} 行 · ${fields}`,
        evidence.purpose,
      ].join("\n");
    }
    return { ok: true, kind: "inspection", message };
  }

  private travelThroughRegionPortal(
    portal: BiomePortal,
    side: "entry" | "exit",
  ): InteractionResolution {
    const transit = floorTransitPresentation(
      floorMapBlueprint(this.floorNumber).routeTransit,
    );
    const destination = side === "entry" ? portal.exit : portal.entry;
    const targetRegionId = side === "entry" ? portal.toRegionId : portal.fromRegionId;
    const fromRegionId = side === "entry" ? portal.fromRegionId : portal.toRegionId;
    const fromRegion = this.biomePlan.regions.find((region) => region.id === fromRegionId);
    const targetRegion = this.biomePlan.regions.find((region) => region.id === targetRegionId);
    if (!fromRegion || !targetRegion) {
      return this.interactionFailure(`${transit.label}的区域记录已经失效。`);
    }
    if (side === "entry" && portal.requiredBossId !== null) {
      const blocker = this.monsters.find((monster) => monster.id === portal.requiredBossId);
      if (blocker && blocker.hp > 0) {
        return this.interactionFailure(
          `${transit.label}尚未开放：先击败 ${monsterNameForProfile(blocker, this.profile)}。`,
        );
      }
    }
    const targetRoom = this.graph.nodes.find(
      (room) => room.id === targetRegion.sourceRoomNodeId,
    );
    const accessMessage = targetRoom ? this.roomAccessMessage(targetRoom) : null;
    if (accessMessage) {
      return this.interactionFailure(`${transit.label}拒绝越级：${accessMessage}`);
    }
    const safeDestination = this.safeRegionPortalDestination(
      destination,
      targetRegion.id,
    );
    if (!safeDestination) {
      return this.interactionFailure(`${transit.label}的落点暂被怪物或物品占用，请稍后再试。`);
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
    this.banner = `${transit.label}抵达：${fromRegion.name} → ${targetRegion.name}。接下来 5 步不会触发随机遭遇。`;
    this.emit();
    return { ok: true, kind: "region-portal", message: this.banner };
  }

  private regionGuardianAccessMessage(
    from: Position,
    to: Position,
  ): string | null {
    const guardianId = biomeGuardianIdForStep(this.biomePlan, from, to);
    if (guardianId === null) return null;
    const guardian = this.monsters.find(
      (monster) => monster.id === guardianId && monster.hp > 0,
    );
    if (!guardian) return null;
    const transit = floorTransitPresentation(
      floorMapBlueprint(this.floorNumber).routeTransit,
    );
    return `${transit.label}前的主线被区域首领 ${monsterIdLabel(guardian.id)} 截断。回到中段击败它；胜利后会自动送入后段区域。`;
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
    if (
      floorLabyrinthAreaAt(
        this.floorNumber,
        this.mazeFloor,
        this.campfires,
        position,
      ) === "safe"
    ) {
      floorSafeAreaCellKeysAt(
        this.floorNumber,
        this.mazeFloor,
        this.campfires,
        position,
      ).forEach(
        (cell) => this.discoveredCells.add(cell),
      );
      return;
    }
    const radius = floorLabyrinth(this.floorNumber).sightRadius + 1;
    revealAround(this.mazeFloor, position, radius).forEach(
      (cell) => this.discoveredCells.add(cell),
    );
  }

  private floorHazards(): FloorHazard[] {
    return generateFloorHazards(
      this.floorNumber,
      this.mazeFloor,
      this.campfires,
      this.guidedMap,
      this.biomePlan,
    );
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
    if (this.mode === "challenge") return "SQL 密文解读中 · Ctrl + Enter 提交 · ESC 安全退出";
    if (this.mode === "combat") return "Q + S  打开 SQL 战斗终端";
    if (this.mode === "transition") return `传送门启动 · 自动进入第 ${this.floorNumber + 1} 层`;
    if (this.mode === "victory") return "八层已贯通 · 可开始新 Run";
    if (this.mode === "defeat") return "YOU DIED · 正在返回最近篝火";
    const interactItem = this.groundItems.find(
      (item) => item.collection === "interact" && distance(item, this.player) <= 1,
    );
    if (interactItem && distance(interactItem, this.player) === 0) {
      if (isFloorOneChestItem(interactItem)) {
        return `E  ${interactItem.name} · 打开或唤醒`;
      }
      return interactItem.id.startsWith("lesson-drop:") ||
        interactItem.id.startsWith("room-reward:")
        ? `E  打开战利品宝箱 · ${interactItem.name}`
        : `E  调查 ${interactItem.name}`;
    }
    const lootBundle = this.lootBundles.find((entry) => distance(entry, this.player) <= 1);
    if (lootBundle && distance(lootBundle, this.player) === 0) {
      return `E  打开战利品包 · ${lootBundle.items.length} 件物品`;
    }
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
    const hiddenAreaEntrance = this.nearbyHiddenAreaEntrance();
    if (hiddenAreaEntrance) {
      const lessonsReady = hiddenAreaEntrance.area.requiredLessonIds.every(
        (lessonId) => this.completedLessons.has(lessonId),
      );
      const guardiansReady = (hiddenAreaEntrance.area.requiredMonsterIds ?? []).every(
        (monsterId) => this.monsters.some(
          (monster) => monster.id === monsterId && monster.hp <= 0,
        ),
      );
      return lessonsReady && guardiansReady
        ? hiddenAreaEntrance.area.openPrompt
        : hiddenAreaEntrance.area.sealedPrompt;
    }
    const regionPortal = this.nearbyRegionPortal();
    if (regionPortal) {
      const transit = floorTransitPresentation(
        floorMapBlueprint(this.floorNumber).routeTransit,
      );
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
        ? `E  ${transit.label}未开放 · 先击败 ${monsterNameForProfile(boss, this.profile)}`
        : `E  ${transit.action}${transit.label} · 前往${targetRegion?.name ?? "相邻区域"}`;
    }
    if (lootBundle) return `E  打开战利品包 · ${lootBundle.items.length} 件物品`;
    if (interactItem) {
      if (isFloorOneChestItem(interactItem)) {
        return `E  ${interactItem.name} · 打开或唤醒`;
      }
      return interactItem.id.startsWith("lesson-drop:") ||
        interactItem.id.startsWith("room-reward:")
        ? `E  打开战利品宝箱 · ${interactItem.name}`
        : `E  调查 ${interactItem.name}`;
    }
    const challengeGate = this.nearbyLockedChallengeGate();
    if (challengeGate) return "E  解读高难 SQL 密文 · 成功永久开路，错误反噬 1 点";
    const floorLandmark = this.nearbyInspectableFloorLandmark();
    if (floorLandmark) {
      const experience = floorExperience(this.floorNumber);
      const landmark = experience.landmarks.find(
        (entry) => entry.id === floorLandmark.id,
      );
      const label = floorLandmark.id.startsWith("npc-scribe-")
        ? "抄写员"
        : landmark?.name ?? "现场记录";
      return `E  调查 ${label}`;
    }
    const touchItem = this.groundItems.find((item) => distance(item, this.player) <= 2);
    if (touchItem) return `走到 ${touchItem.name} 上自动拾取`;
    const actor = this.actorForRoom(this.currentRoomId);
    const monster = actor
      ? this.monsters.find((entry) => entry.id === actor.monsterId && entry.hp > 0)
      : undefined;
    if (actor && monster) {
      return `触碰 ${monsterNameForProfile(monster, this.profile)} 进入战斗`;
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
      resultDisclosure: "shape-only",
      opened: false,
      gateId,
      message: this.banner,
      playerDamage: damage.playerDamage,
      armorDamage: damage.armorDamage,
      mode: this.mode,
    };
  }

  private enterDefeat(source: "combat" | "gate" | "hazard"): void {
    this.mode = "defeat";
    this.combat = null;
    this.selectedMonsterId = null;
    this.activeGateChallengeId = null;
    this.activeCampfireId = null;
    this.activeLootBundleId = null;
    if (source !== "combat") {
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
      hazard: null,
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
      resultDisclosure: "shape-only",
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
