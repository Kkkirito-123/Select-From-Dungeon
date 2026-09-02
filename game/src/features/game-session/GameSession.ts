/**
 * 游戏运行时的唯一状态所有者。
 *
 * GameSession 负责把移动、遭遇、战斗、篝火、死亡复活、剧情进度、奖励和
 * 存档转换编排成一次状态提交；背包和战斗的可复用转换分别位于
 * domain/session/inventory/ 与 domain/session/combat/。UI 与 Phaser 只能调用
 * 公开动作并读取 snapshot()，不能直接写入规则字段。Agent 只消费受限快照或
 * 复盘数据，不能成为状态来源。本类会产生快照通知，但不直接操作 DOM、浏览器
 * 存储或外部服务。
 */
import {
  DATA_BLADE,
  lessonById,
} from "../../content/curriculum/mvpLevel";
import {
  evaluateGateChallenge,
  gateChallengeForFloor,
  gateChallengeIdForFloor,
} from "../../content/curriculum/gateChallenges";
import { RELICS, rewardDetails } from "../../content/world/runContent";
import {
  ARMORS,
  CONSUMABLE_SLOT_CAPACITY,
  EQUIPMENT_CAPACITY,
  lootCandidatesForBiome,
} from "../../content/inventory/inventoryCatalog";
import {
  biomeEncounterFor,
  weightedBiomeEncounterCandidates,
} from "../../content/world/biomeContent";
import {
  QUESTION_BANK_VERSION,
  type PracticeDrawState,
  type PracticeQuestionTier,
  type QuestionBankCatalog,
} from "../../content/curriculum/questionBank";
import {
  floorMapBlueprint,
  floorTransitPresentation,
  regionPortalsEnabledForFloor,
} from "../../content/world/floorMapBlueprints";
import { floorLandmarkMessage } from "../../content/world/floors/landmarkRegistry";
import {
  floorExperience,
  hasFloorExperience,
} from "../../content/world/floorExperience";
import { floorLabyrinth } from "../../content/world/floorLabyrinth";
import {
  WORLD_RUNTIME_CONFIG,
} from "../../contracts/config/runtime";
import {
  cloneMazeFloor,
  generateMazeFloor,
  isMazeWalkable,
  mazeGateAt,
  mazeTileAt,
  mazeZoneAt,
  type MazeFloor,
} from "../../domain/exploration/mazeGenerator";
import {
  advanceMonsterPatrol,
  cloneWorldActor,
  type WorldActor,
} from "../../domain/exploration/monsterRoaming";
import {
  INITIAL_SAFE_STEPS,
  advanceEncounterMeter,
  recordSafeZoneMovement,
  resetEncounterMeterAfterBattle,
  suppressThirdConsecutiveEncounter,
  type EncounterMeter,
} from "../../domain/exploration/encounterDirector";
import {
  generateRoomGraph,
  stableStringHash,
  type FloorNumber,
  type RoomGraph,
  type RoomNode,
  type RoomReward,
} from "../../domain/progression/runGraph";
import {
  generateCampfires,
  isSafeZonePosition,
  nearbyCampfire,
  safeZoneCellKeys,
} from "../../domain/exploration/campfire";
import {
  FLOOR_ONE_MIMIC_MONSTER_ID,
  floorOneChestKind,
  floorOneChestReward,
  floorOneWalkableNeighborCount,
  generateFloorOneChestItems,
  isFloorOneChestItem,
} from "../../domain/exploration/floorOneTreasure";
import {
  evaluateStage,
  evaluateUnrevealedIdentityQuery,
  unrevealedIdentityQueryMessage,
} from "../../domain/learning/lessonEvaluator";
import {
  floorStoryEvidenceIdForLandmark,
  floorStoryEvidenceQueryForLandmark,
  storyEvidenceMarkerId,
  storyEvidenceMarkerIdsForFloor,
} from "../../domain/progression/floorStory";
import {
  finalMigrationProgress,
  migrationStepMarkerId,
  type MigrationStepId,
} from "../../domain/progression/finalMigration";
import {
  monsterIdLabel,
  monsterIntentName,
  monsterNameForProfile,
  recoverMonsterIdentity,
} from "../../domain/progression/monsterIdentity";
import {
  generateGuidedMapPlan,
  nearbyShortcut,
  shortcutDestination,
  type GuidedMapPlan,
} from "../../domain/exploration/guidedMap";
import { rollLootItems } from "../../domain/inventory/lootDirector";
import {
  biomeGuardianIdForStep,
  biomeRegionAt,
  generateBiomePlan,
  type BiomePortal,
  type BiomePlan,
} from "../../domain/exploration/biome";
import {
  advanceCampaignProgress,
  cloneCampaignProgress,
  createCampaignProgress,
  type CampaignProgress,
} from "../../domain/progression/campaign";
import {
  counterDamageForMonster,
} from "../../domain/combat/combatBalance";
import {
  movementFailure,
  movementModeIsBlocked,
} from "../../domain/session/sessionExploration";
import {
  createAdminFloorPreview,
  resolveAdminPreset,
  resolveAdminRegion,
} from "../../domain/session/admin/adminPreview";
import {
  advanceNavigationGuidance,
  createNavigationGuidance,
  floorLandmarkPosition as selectFloorLandmarkPosition,
  floorNpcPosition as selectFloorNpcPosition,
  revealAt as revealSessionAt,
  type NavigationGuidanceContext,
} from "../../domain/session/exploration";
import { interactionFailure, travelFailure } from "../../domain/session/sessionInteraction";
import {
  applyConsumable,
  equipInventoryItem as equipStoredInventoryItem,
  inventoryFailure,
  addRelic as addInventoryRelic,
  applyReward as applyInventoryReward,
  availableWeaponLoot as selectAvailableWeaponLoot,
  claimableRoomReward as selectClaimableRoomReward,
  discardConsumable as discardInventoryConsumable,
  discardInventoryEquipment,
  takeLootItemAction,
  useConsumable as useInventoryConsumable,
} from "../../domain/session/inventory";
import { createCombatState, emptyTurn } from "../../domain/session/sessionCombat";
import {
  applyPlayerDamage as applyCombatPlayerDamage,
  appendAnswerRecord as appendCombatAnswerRecord,
  awardExperience,
  beginBattleReview as beginCombatBattleReview,
  describeExperience,
  preparePracticeBattle as prepareCombatPracticeBattle,
  recentEncounterMonsterIds as recentCombatEncounterMonsterIds,
} from "../../domain/session/combat";
import {
  advanceCombatSuccessStep,
  resolveCombatHit,
} from "../../domain/session/combat/resolveCombatHit";
import { livingRequiredBoss } from "../../domain/session/progression/regionAccess";
import {
  isReadOnlyAdminPreview,
  resolveCampaignVictory,
} from "../../domain/session/progression/floorCompletion";
import { resolveLessonCompletion } from "../../domain/session/learning/lessonCompletion";
export {
  experienceForRank,
  LEVEL_XP_THRESHOLDS,
  levelForXp,
  maxHpForLevel,
} from "../../domain/session/sessionProgression";
import {
  cloneAnswerHistory,
  cloneCombat,
  cloneConsumableStack,
  cloneEquipment,
  cloneGraph,
  cloneItem,
  cloneLootBundle,
  cloneProfile,
  distance,
  emptyProfile,
  positionKey,
} from "../../domain/session/sessionState";
import {
  createSessionSnapshot,
  serializeSession,
  type SessionSnapshotContext,
} from "../../domain/session/sessionSnapshot";
import {
  selectActorForRoom,
  selectAvailableRoomIds,
  selectChallengeGateId,
  selectCombatStagesForMonster,
  selectCurrentCombatStages,
  selectCurrentLesson,
  selectCurrentRoom,
  selectFloorHazards,
  selectLivingActorAt,
  selectMonsterForCurrentRoom,
  selectNearbyLockedChallengeGate,
  selectRoomAccessMessage,
  type CombatStageSelectionContext,
  type LessonSelectionContext,
  type RoomAccessContext,
} from "../../domain/session/sessionSelectors";
import {
  createRunInstanceId,
  INITIAL_EXPLORATION_BANNER,
  initialActors,
  initialGroundItems,
  monstersForFloor,
} from "../../domain/session/lifecycle/sessionWorld";
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
} from "../../domain/shared/types";

type SessionListener = (snapshot: GameSnapshot) => void;

type PracticeDrawStates = Record<PracticeQuestionTier, PracticeDrawState>;

function emptyPracticeDrawStates(): PracticeDrawStates {
  return {
    L1: { cursor: 0, cycle: 0 },
    L2: { cursor: 0, cycle: 0 },
    L3: { cursor: 0, cycle: 0 },
  };
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

export class GameSession {
  private runInstanceId: string;
  private questionBankVersion: string;
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
  private practiceDrawStates: PracticeDrawStates = emptyPracticeDrawStates();
  private activePracticeMonsterId: number | null = null;
  private activePracticeQuestionIds: string[] = [];
  private rewardedPracticeMonsterIds = new Set<number>();
  private guidanceObjectiveId: string | null = null;
  private guidanceSteps = 0;
  private guidanceLevel: 0 | 1 | 2 | 3 = 0;
  private battleSequence = 0;
  private reviewBattleId: number | null = null;
  private banner = INITIAL_EXPLORATION_BANNER;
  private adminMode = false;
  private agentPlaytestMode = false;
  private adminPanelOpen = false;
  private adminIdentityMonsterIds = new Set<number>();
  private regionTransferSequence = 0;
  private regionTransfer: GameSnapshot["regionTransfer"] = null;
  private profile: ProfileProgress;
  private readonly listeners = new Set<SessionListener>();

  constructor(
    savedRun?: SavedRun | null,
    profile?: ProfileProgress | null,
    seed: string = WORLD_RUNTIME_CONFIG.fixedWorldSeed,
    private readonly questionBank: QuestionBankCatalog | null = null,
  ) {
    this.runInstanceId = createRunInstanceId(seed);
    this.questionBankVersion = questionBank?.version ?? QUESTION_BANK_VERSION;
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

    if (savedRun) {
      this.runInstanceId = savedRun.runInstanceId;
      this.questionBankVersion = savedRun.questionBankVersion;
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
      this.monsters = savedRun.monsters.map((monster) => ({ ...monster }));
      const restoredDiscoveries = new Set(this.profile.discoveredMonsterIds);
      this.monsters.forEach((monster) => {
        if (monster.hp === 0) restoredDiscoveries.add(monster.id);
      });
      this.profile.discoveredMonsterIds = [...restoredDiscoveries]
        .sort((left, right) => left - right);
      this.worldActors = savedRun.worldActors.map(cloneWorldActor);
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
      this.practiceDrawStates = {
        L1: { ...savedRun.practiceDrawStates.L1 },
        L2: { ...savedRun.practiceDrawStates.L2 },
        L3: { ...savedRun.practiceDrawStates.L3 },
      };
      this.activePracticeMonsterId = savedRun.activePracticeMonsterId;
      this.activePracticeQuestionIds = [...savedRun.activePracticeQuestionIds];
      this.rewardedPracticeMonsterIds = new Set(savedRun.rewardedPracticeMonsterIds);
      this.guidanceObjectiveId = savedRun.guidanceObjectiveId;
      this.guidanceSteps = savedRun.guidanceSteps;
      this.guidanceLevel = savedRun.guidanceLevel;
      this.battleSequence = savedRun.battleSequence;
      this.reviewBattleId = savedRun.reviewBattleId;
      this.banner = savedRun.banner;
      this.selectedMonsterId = this.combat?.targetId ?? this.monsterForCurrentRoom()?.id ?? null;
      this.revealAt(this.player);
    }
    this.ensureOpenedHiddenAreaRewards();
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  /** 组装快照转换所需的显式上下文，避免转换模块直接依赖私有状态。 */
  private sessionSnapshotContext(): SessionSnapshotContext {
    return {
      runInstanceId: this.runInstanceId,
      questionBankVersion: this.questionBankVersion,
      mode: this.mode,
      adminMode: this.adminMode,
      exposeAdminAnswer: isReadOnlyAdminPreview(this.adminMode, this.agentPlaytestMode),
      adminPanelOpen: this.adminPanelOpen,
      adminIdentityMonsterIds: this.adminIdentityMonsterIds,
      regionTransfer: this.regionTransfer,
      campaign: this.campaign,
      floorNumber: this.floorNumber,
      graph: this.graph,
      mazeFloor: this.mazeFloor,
      guidedMap: this.guidedMap,
      biomePlan: this.biomePlan,
      campfires: this.campfires,
      activeCampfireId: this.activeCampfireId,
      respawnCampfireId: this.respawnCampfireId,
      activeLootBundleId: this.activeLootBundleId,
      currentRoomId: this.currentRoomId,
      player: this.player,
      monsters: this.monsters,
      worldActors: this.worldActors,
      groundItems: this.groundItems,
      lootBundles: this.lootBundles,
      equipmentInventory: this.equipmentInventory,
      consumables: this.consumables,
      keyItems: this.keyItems,
      acquiredUniqueItemIds: this.acquiredUniqueItemIds,
      discoveredCells: this.discoveredCells,
      combat: this.combat,
      selectedMonsterId: this.selectedMonsterId,
      visitedRoomIds: this.visitedRoomIds,
      completedRoomIds: this.completedRoomIds,
      completedLessons: this.completedLessons,
      openedGateIds: this.openedGateIds,
      activeGateChallengeId: this.activeGateChallengeId,
      relics: this.relics,
      profile: this.profile,
      queryCount: this.queryCount,
      totalMoves: this.encounterMeter.totalMoves,
      stepsSinceEncounter: this.encounterMeter.stepsSinceEncounter,
      safeStepsRemaining: this.encounterMeter.safeStepsRemaining,
      hintLevel: this.hintLevel,
      answerHistory: this.answerHistory,
      reviewBattleId: this.reviewBattleId,
      practiceDrawStates: this.practiceDrawStates,
      activePracticeMonsterId: this.activePracticeMonsterId,
      activePracticeQuestionIds: this.activePracticeQuestionIds,
      rewardedPracticeMonsterIds: this.rewardedPracticeMonsterIds,
      guidanceObjectiveId: this.guidanceObjectiveId,
      guidanceSteps: this.guidanceSteps,
      guidanceLevel: this.guidanceLevel,
      battleSequence: this.battleSequence,
      banner: this.banner,
      currentRoom: () => this.currentRoom(),
      currentLesson: () => this.currentLesson(),
      currentCombatStages: () => this.currentCombatStages(),
      monsterForCurrentRoom: () => this.monsterForCurrentRoom(),
      availableRoomIds: () => this.availableRoomIds(),
      availableWeaponLoot: () => this.availableWeaponLoot(),
      claimableRoomReward: () => this.claimableRoomReward(),
      challengeGateId: () => this.challengeGateId(),
      floorHazards: () => this.floorHazards(),
      navigationGuidance: () => this.navigationGuidance(),
      interactionPrompt: () => this.interactionPrompt(),
    };
  }

  /**
   * 生成隔离的只读快照。
   *
   * 返回值会复制数组、集合映射出的内容和嵌套对象，并根据当前可见性
   * 脱敏未发现的怪物身份。调用方修改快照不会改变 GameSession。
   */
  snapshot(): GameSnapshot {
    return createSessionSnapshot(this.sessionSnapshotContext());
  }

  /**
   * 把运行时状态转换为 v12 存档。
   *
   * 转换会复制可变集合和嵌套对象，并保留当前 generatorVersion；
   * 这里只做格式转换，不写浏览器。真正的写入由 storage/runtime 负责。
   */
  toSavedRun(): SavedRun {
    return serializeSession(this.sessionSnapshotContext());
  }

  /** 返回独立的永久档案副本；Run 内临时状态不会泄漏到 Profile。 */
  toProfile(): ProfileProgress {
    return cloneProfile(this.profile);
  }

  /**
   * 将玩家实际取得的现场证据写入本 Run，复用 openedGateIds 保存当前证据；
   * 这里只接受当前楼层内容真源中声明过的证据。
   */
  recordStoryEvidence(evidenceId: string): boolean {
    const markerId = storyEvidenceMarkerId(evidenceId);
    if (!storyEvidenceMarkerIdsForFloor(this.floorNumber).includes(markerId)) {
      return false;
    }
    if (this.openedGateIds.has(markerId)) return false;
    this.openedGateIds.add(markerId);
    this.emit();
    return true;
  }

  /**
   * 在第八层胜利态按固定顺序提交一项 MIGRATE 步骤。
   *
   * 进度复用 openedGateIds；非终局、跳步或重复确认均不写入，也不会触发
   * 额外快照。
   */
  recordMigrationStep(stepId: MigrationStepId): boolean {
    if (this.floorNumber !== 8 || this.mode !== "victory") return false;
    const progress = finalMigrationProgress([...this.openedGateIds]);
    if (progress.nextStep?.id !== stepId) return false;
    this.openedGateIds.add(migrationStepMarkerId(stepId));
    this.emit();
    return true;
  }

  /**
   * 处理一次真实玩家移动。
   *
   * 规则顺序是：状态门控 -> 地图门/墙 -> 区域首领 -> 篝火占位 -> 怪物
   * 接触 -> 移动后揭示/拾取/机关/遭遇。只有成功移动才推进步数和伏击
   * 计量；任何阻挡都返回结构化原因，不直接让表现层猜测。
   */
  attemptPlayerMove(dx: number, dy: number): MoveResolution {
    // 第一步：计算目标格，并在非探索状态下尽早拒绝移动。
    const from = { x: this.player.x, y: this.player.y };
    const to = { x: from.x + dx, y: from.y + dy };
    if (this.adminPanelOpen || movementModeIsBlocked(this.mode)) {
      return this.moveFailure(from, to, "mode", "当前状态不能移动。");
    }

    // 第二步：依次检查知识门、墙体和跨区域首领门禁。
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

    const blockingCampfire = this.campfires.find(
      (campfire) => campfire.x === to.x && campfire.y === to.y,
    );
    if (blockingCampfire) {
      const message = "篝火正在燃烧。站到相邻格按 E 休息。";
      this.banner = message;
      this.emit();
      return this.moveFailure(from, to, "campfire", message);
    }

    // 第三步：目标格存在活跃怪物时只进入遭遇，不提交玩家坐标。
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

    // 第四步：通过全部阻挡检查后，才提交位置并更新探索派生状态。
    this.player.x = to.x;
    this.player.y = to.y;
    this.revealAt(to);
    this.updateCurrentRoom(to);
    const guidanceRaised = this.advanceGuidanceProgress();
    const pickedItemIds: string[] = [];

    // 第五步：位置提交后统一处理自动拾取、一次性机关和步数伏击。
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
      !guidanceRaised &&
      this.mode === "explore"
    ) {
      const biome = biomeRegionAt(this.biomePlan, this.player);
      this.banner = `${biome.name} · ${this.currentRoom().title} · 已探索 ${this.discoveredCells.size} 格。`;
    }

    // 只发布一次完整快照，使 DOM、Phaser 和持久化看到同一时刻的状态。
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

  cancelGuidanceEscort(): boolean {
    if (this.guidanceLevel !== 3) return false;
    this.guidanceLevel = 2;
    this.banner = "路线高亮已收起；你可以继续手动探索。";
    this.emit();
    return true;
  }

  advanceGuidanceEscort(): boolean {
    if (this.mode !== "explore" || this.guidanceLevel !== 3) return false;
    // L3 只表示强化路线高亮，不会替玩家修改坐标。
    this.banner = "自动寻路已关闭：高亮路线仍然保留，请手动前进并接触目标。";
    this.emit();
    return false;
  }

  setPlayerPosition(x: number, y: number): boolean {
    if (movementModeIsBlocked(this.mode)) return false;
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
    if (movementModeIsBlocked(this.mode)) {
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
    this.banner = `已扫描 ${monsterIdLabel(monster.id)}：错误查询最高受到 ${monster.damage} 点伤害。`;
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

  /**
   * 解析当前位置的 E 交互，按固定优先级处理掉落、捷径、篝火、隐藏区、
   * 机关门和地标。交互本身只改变领域状态，UI 根据返回 kind 决定展示。
   */
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

  /**
   * 在当前篝火建立新的复活点，并恢复生命与装备护甲。
   * 死亡不会清空课程、经验、装备或敌人剩余生命；这里只更新休息相关
   * 的运行状态，死亡后的具体返回由 respawnAfterDefeat 处理。
   */
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
    const message = takeLootItemAction({
      player: this.player,
      relics: this.relics,
      acquiredUniqueItemIds: this.acquiredUniqueItemIds,
      equipmentInventory: this.equipmentInventory,
      consumables: this.consumables,
      claimFloorKey: () => this.claimFloorKey(),
    }, bundle, item, action, replaceInstanceId);
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
    const resolution = equipStoredInventoryItem(
      this.player,
      this.equipmentInventory,
      instanceId,
    );
    if (!resolution.ok) return this.inventoryFailure(resolution.message);
    this.banner = resolution.message;
    this.emit();
    return resolution;
  }

  discardInventoryItem(instanceId: string): InventoryResolution {
    if (this.mode !== "inventory") {
      return this.inventoryFailure("只能在背包中丢弃普通装备。");
    }
    const resolution = discardInventoryEquipment({
      equipmentInventory: this.equipmentInventory,
      lootBundles: this.lootBundles,
      sourceRoomId: this.currentRoomId,
      floor: this.floorNumber,
      position: { x: this.player.x, y: this.player.y },
      nextLootBundleId: (baseId) => this.nextLootBundleId(baseId),
    }, instanceId, `discard:${this.floorNumber}:${instanceId}`);
    if (!resolution.ok) return this.inventoryFailure(resolution.message);
    this.banner = `${resolution.itemName ?? "装备"} 已放到脚下，离开本层前仍可重新拾取。`;
    this.emit();
    return { ok: true, message: this.banner, remainingItemIds: [] };
  }

  discardConsumable(consumableId: Consumable["id"]): InventoryResolution {
    if (this.mode !== "inventory") {
      return this.inventoryFailure("只能在背包中丢弃普通恢复品。");
    }
    const resolution = discardInventoryConsumable({
      consumables: this.consumables,
      lootBundles: this.lootBundles,
      sourceRoomId: this.currentRoomId,
      floor: this.floorNumber,
      position: { x: this.player.x, y: this.player.y },
      nextLootBundleId: (baseId) => this.nextLootBundleId(baseId),
    }, consumableId, `discard:${this.floorNumber}:${consumableId}:${this.queryCount}`);
    if (!resolution.ok) return this.inventoryFailure(resolution.message);
    this.banner = `${resolution.itemName ?? "恢复品"} 已放到脚下，离开本层前仍可重新拾取。`;
    this.emit();
    return { ok: true, message: this.banner, remainingItemIds: [] };
  }

  useConsumable(consumableId: Consumable["id"]): InventoryResolution {
    if (this.mode !== "inventory") {
      return this.inventoryFailure("只能在背包中使用恢复品。");
    }
    const resolution = useInventoryConsumable({
      player: this.player,
      consumables: this.consumables,
    }, consumableId);
    if (!resolution.ok) return this.inventoryFailure(resolution.message);
    this.banner = `使用 ${resolution.itemName ?? "恢复品"}：生命 ${resolution.previousHp ?? this.player.hp} → ${this.player.hp}，护甲 ${resolution.previousArmor ?? this.player.armorHp} → ${this.player.armorHp}。`;
    this.emit();
    return { ok: true, message: this.banner, remainingItemIds: [] };
  }

  /**
   * 将 defeat 状态转为 death-review。
   * 复活位置优先使用最近休息的篝火，否则使用本层出生点；复活只恢复
   * 玩家生命/护甲，不重置当前楼层进度和敌人 HP，并保留本次战斗复盘 ID。
   */
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

  /** 处理实体机关门的 SQL 结果；成功只开门，失败只造成规则定义的反噬。 */
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

  /**
   * 结算一回合 SQL 战斗。
   *
   * SQL 已由 SqlEngine 执行，本方法只依次处理概念锁、命中/反击、护甲与
   * 生命、阶段推进、死亡复盘记录、经验和战斗事件。所有可观察变化在末尾
   * 通过一次 emit() 发布，避免 UI 看到半结算状态。
   */
  resolveQuery(result: SqlQueryResult): TurnResolution {
    // 第一步：只有正在进行的战斗可以消费查询结果。
    if (this.mode !== "combat" || !this.combat) {
      return this.emptyTurn("先触碰当前区域的怪物进入遭遇。", result.targetIds);
    }

    // 第二步：固定本回合的课程、阶段和复盘上下文，再开始修改状态。
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

    // 第三步：身份保护优先；通过后再按课程阶段核对结构、结果和概念锁。
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

    // 第四步：正确结果转换为伤害、阶段推进，并在最终命中时结算课程与奖励。
    if (evaluation.accepted) {
      const target = this.monsters.find((entry) => entry.id === this.combat?.targetId);
      const mimicAccepted = target?.id === FLOOR_ONE_MIMIC_MONSTER_ID && evaluation.accepted;
      if (target && target.hp > 0 && (evaluation.attackTargetIds.includes(target.id) || mimicAccepted)) {
        const nextSuccessStep = advanceCombatSuccessStep(this.combat.successStep);
        const hit = resolveCombatHit({
          currentHp: target.hp,
          weaponDamage: this.player.weapon.damage,
          armor: target.armor,
          nextSuccessStep,
          totalStages: combatStages.length,
        });
        const damage = hit.damage;
        target.hp = hit.remainingHp;
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
          const practiceRewardEligible = !this.isRepeatablePracticeMonster(target) ||
            !this.rewardedPracticeMonsterIds.has(target.id);
          experience = practiceRewardEligible ? this.awardExperience(target) : null;
          const experienceMessage = experience
            ? this.describeExperience(experience)
            : "重复练习完成，本次不重复结算 XP 或掉落。";
          if (this.combat.kind === "ambush") {
            this.completeAmbush(
              target,
              events,
              experienceMessage,
              practiceRewardEligible,
            );
            if (this.isRepeatablePracticeMonster(target)) {
              this.rewardedPracticeMonsterIds.add(target.id);
              target.hp = target.maxHp;
              hpUpdates.push({ id: target.id, hp: target.hp });
            }
          } else {
            lessonCompleted = lesson.id;
            this.completeLesson(lesson, events, experienceMessage);
          }
        } else {
          const nextStage = combatStages[Math.min(nextSuccessStep, combatStages.length - 1)];
          this.combat.intent.locks = [...nextStage.locks];
          this.hintLevel = this.relics.some((relic) => relic.id === "schema-eye") ? 1 : 0;
          this.banner = `${evaluation.message} ${this.player.weapon.name} 命中，${monsterIdLabel(target.id)} 剩余 ${target.hp} HP。下一问：${nextStage.objective}`;
        }
      }
    } else {
      // 错误结果进入怪物反击分支，护甲和生命仍由统一伤害规则处理。
      const target = this.monsters.find((monster) => monster.id === this.combat?.targetId);
      const incomingDamage = target ? counterDamageForMonster(target) : 1;
      const damage = this.applyPlayerDamage(incomingDamage);
      playerDamage = damage.playerDamage;
      armorDamage = damage.armorDamage;
      events.push({ type: "enemy-hit", sourceId: target?.id, amount: incomingDamage });
      const damageMessage = armorDamage > 0
        ? `护甲吸收 ${armorDamage} 点${playerDamage > 0 ? `，生命损失 ${playerDamage} 点` : ""}`
        : `生命损失 ${playerDamage} 点`;
      this.banner = `${evaluation.message} ${
        target ? monsterIdLabel(target.id) : "未知记录"
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

    // 第五步：保存本回合复盘证据，内容使用结算后的身份和战斗结果。
    if (reviewTarget) {
      this.appendAnswerRecord({
        id: this.queryCount,
        battleId: this.reviewBattleId ?? this.battleSequence,
        floor: this.floorNumber,
        monsterId: reviewTarget.id,
        monsterName: killedIds.includes(reviewTarget.id)
          ? monsterNameForProfile(reviewTarget, this.profile)
          : monsterIdLabel(reviewTarget.id),
        lessonId: lesson.id,
        stageId: stage.id,
        stageObjective: stage.objective,
        round: reviewRound,
        sql: result.sql,
        answerSql: stage.answerSql,
        result: evaluation.kind === "exact" ? "correct" : evaluation.kind,
        outcome: evaluation.accepted
          ? killedIds.includes(reviewTarget.id) ? "victory" : "hit"
          : playerDefeated ? "defeat" : "countered",
        feedback: evaluation.message,
        hintLevel: reviewHintLevel,
        questionId: stage.questionId,
      });
    }

    // 所有字段完成后统一发布快照，再把同一份结算结果交给动画和界面。
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
    const incomingDamage = target ? counterDamageForMonster(target) : 1;
    const damage = this.applyPlayerDamage(incomingDamage);
    const playerDamage = damage.playerDamage;
    const armorDamage = damage.armorDamage;
    const playerDefeated = this.player.hp === 0;
    const damageMessage = armorDamage > 0
      ? `护甲吸收 ${armorDamage} 点${playerDamage > 0 ? `，生命损失 ${playerDamage} 点` : ""}`
      : `生命损失 ${playerDamage} 点`;
    this.banner = `${message} ${
      target ? monsterIdLabel(target.id) : "未知记录"
    } 趁终端失稳反击，${damageMessage}。`;
    if (playerDefeated) {
      this.enterDefeat("combat");
    } else {
      this.combat.round += 1;
    }
    const events: CombatEvent[] = [
      { type: "enemy-hit", sourceId: target?.id, amount: incomingDamage },
    ];
    if (reviewTarget) {
      this.appendAnswerRecord({
        id: this.queryCount,
        battleId: this.reviewBattleId ?? this.battleSequence,
        floor: this.floorNumber,
        monsterId: reviewTarget.id,
        monsterName: monsterIdLabel(reviewTarget.id),
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
        questionId: stage.questionId,
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

  /**
   * 完成区域首领后的自动楼层转换。
   * 新楼层重新生成物理地图和楼层临时状态，但沿用玩家装备、遗物、等级
   * 和 XP；campaign 先通过纯函数校验，再初始化新楼层，避免跳层或重复进入。
   */
  advanceFloor(): boolean {
    if (
      isReadOnlyAdminPreview(this.adminMode, this.agentPlaytestMode) ||
      this.mode !== "transition" ||
      this.floorNumber >= 8
    ) return false;
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
    this.practiceDrawStates = emptyPracticeDrawStates();
    this.activePracticeMonsterId = null;
    this.activePracticeQuestionIds = [];
    this.guidanceObjectiveId = null;
    this.guidanceSteps = 0;
    this.guidanceLevel = 0;
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

  /** 重置正式 Run；管理员预览状态下拒绝覆盖正式进度。 */
  reset(): void {
    if (this.adminMode) {
      this.banner = "管理员预览不会覆盖正式 Run。刷新页面后回到正式固定地图。";
      this.emit();
      return;
    }
    const seed = WORLD_RUNTIME_CONFIG.fixedWorldSeed;
    this.campaign = createCampaignProgress(seed);
    this.runInstanceId = createRunInstanceId(seed);
    this.questionBankVersion = this.questionBank?.version ?? QUESTION_BANK_VERSION;
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
    this.practiceDrawStates = emptyPracticeDrawStates();
    this.activePracticeMonsterId = null;
    this.activePracticeQuestionIds = [];
    this.rewardedPracticeMonsterIds.clear();
    this.guidanceObjectiveId = null;
    this.guidanceSteps = 0;
    this.guidanceLevel = 0;
    this.battleSequence = 0;
    this.reviewBattleId = null;
    this.regionTransfer = null;
    this.banner = "固定地图已重置。沿青色箭头触碰 ID #001 开始 SELECT；永久怪物图鉴保持不变。";
    this.revealAt(this.player);
    this.emit();
  }

  private currentRoom(): RoomNode {
    return selectCurrentRoom({
      graph: this.graph,
      currentRoomId: this.currentRoomId,
    });
  }

  private navigationGuidanceContext(): NavigationGuidanceContext {
    return {
      floor: this.floorNumber,
      graph: this.graph,
      mazeFloor: this.mazeFloor,
      biomePlan: this.biomePlan,
      monsters: this.monsters,
      completedLessons: this.completedLessons,
      openedGateIds: this.openedGateIds,
      player: this.player,
      currentRoomId: this.currentRoomId,
    };
  }

  private navigationGuidance(): GameSnapshot["navigationGuidance"] {
    return createNavigationGuidance(this.navigationGuidanceContext(), {
      objectiveId: this.guidanceObjectiveId,
      steps: this.guidanceSteps,
      level: this.guidanceLevel,
    });
  }

  private advanceGuidanceProgress(): boolean {
    const result = advanceNavigationGuidance(this.navigationGuidanceContext(), {
      objectiveId: this.guidanceObjectiveId,
      steps: this.guidanceSteps,
      level: this.guidanceLevel,
    });
    this.guidanceObjectiveId = result.state.objectiveId;
    this.guidanceSteps = result.state.steps;
    this.guidanceLevel = result.state.level;
    if (result.banner !== null) this.banner = result.banner;
    return result.raised;
  }

  private lessonSelectorContext(): LessonSelectionContext {
    return {
      floor: this.floorNumber,
      graph: this.graph,
      currentRoomId: this.currentRoomId,
      combat: this.combat,
      monsters: this.monsters,
      questionBank: this.questionBank,
      activePracticeQuestionIds: this.activePracticeQuestionIds,
      completedLessons: this.completedLessons,
    };
  }

  private currentLesson(): LessonDefinition {
    return selectCurrentLesson(this.lessonSelectorContext());
  }

  private currentStage(): LessonStageDefinition {
    const stages = this.currentCombatStages();
    const index = Math.min(this.combat?.successStep ?? 0, stages.length - 1);
    return stages[index];
  }

  private combatStageSelectorContext(): CombatStageSelectionContext {
    return {
      ...this.lessonSelectorContext(),
      activePracticeMonsterId: this.activePracticeMonsterId,
      worldActors: this.worldActors,
    };
  }

  private currentCombatStages(): readonly LessonStageDefinition[] {
    return selectCurrentCombatStages(this.combatStageSelectorContext());
  }

  private combatStagesForMonster(monster: Monster): readonly LessonStageDefinition[] {
    return selectCombatStagesForMonster(this.combatStageSelectorContext(), monster);
  }

  private isRepeatablePracticeMonster(monster: Monster): boolean {
    const role = biomeEncounterFor(monster.id)?.role;
    return monster.encounterType === "ambush" && (
      role === "normal" || role === "mini-elite"
    );
  }

  private preparePracticeBattle(monster: Monster): void {
    const preparation = prepareCombatPracticeBattle({
      questionBank: this.questionBank,
      floor: this.floorNumber,
      runInstanceId: this.runInstanceId,
      monster,
      practiceDrawStates: this.practiceDrawStates,
      masteredLessons: new Set(this.profile.masteredLessons),
      completedLessons: this.completedLessons,
      graph: this.graph,
      roomAccessMessage: (room) => this.roomAccessMessage(room),
    });
    this.practiceDrawStates = preparation.practiceDrawStates;
    this.activePracticeMonsterId = preparation.activePracticeMonsterId;
    this.activePracticeQuestionIds = preparation.activePracticeQuestionIds;
  }

  private monsterForCurrentRoom(): Monster | undefined {
    return selectMonsterForCurrentRoom({
      worldActors: this.worldActors,
      monsters: this.monsters,
      roomId: this.currentRoomId,
    });
  }

  private actorForRoom(roomId: string): WorldActor | undefined {
    return selectActorForRoom({
      worldActors: this.worldActors,
      roomId,
    });
  }

  private livingActorAt(position: Position): WorldActor | undefined {
    return selectLivingActorAt({
      worldActors: this.worldActors,
      monsters: this.monsters,
      position,
    });
  }

  private roomAccessSelectorContext(): RoomAccessContext {
    return {
      graph: this.graph,
      completedLessons: this.completedLessons,
      completedRoomIds: this.completedRoomIds,
      openedGateIds: this.openedGateIds,
      hiddenAreas: this.floorHiddenAreas(),
    };
  }

  private availableRoomIds(): string[] {
    return selectAvailableRoomIds(this.roomAccessSelectorContext());
  }

  private roomAccessMessage(room: RoomNode): string | null {
    return selectRoomAccessMessage(this.roomAccessSelectorContext(), room);
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
    this.preparePracticeBattle(monster);
    const stages = this.combatStagesForMonster(monster);
    const stage = stages[0];
    if (!stage) return this.interactionFailure("这只怪物尚未配置可执行的 SQL 题。");
    this.currentRoomId = room.id;
    this.visitedRoomIds.add(room.id);
    this.beginBattleReview();
    this.mode = "combat";
    this.combat = createCombatState(monster, stage);
    this.selectedMonsterId = monster.id;
    this.hintLevel = this.relics.some((relic) => relic.id === "schema-eye") ? 1 : 0;
    const roleLabel = encounter?.role === "area-boss"
      ? "区域首领"
      : encounter?.role === "mini-elite" ? "小型精英" : "触碰遭遇";
    this.banner = `${roleLabel} ${monsterIdLabel(monster.id)}（${stages.length} 阶段）。按住 Q + S 写出完整 SQL。`;
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
    if (monster) this.preparePracticeBattle(monster);
    const stages = monster ? this.combatStagesForMonster(monster) : [];
    const stage = stages[0];
    if (!monster || !stage) return null;

    this.beginBattleReview();
    this.mode = "combat";
    this.combat = createCombatState(monster, stage);
    this.selectedMonsterId = monster.id;
    this.hintLevel = this.relics.some((relic) => relic.id === "schema-eye") ? 1 : 0;
    const encounter = biomeEncounterFor(monster.id);
    const roleLabel = encounter?.role === "mini-elite" ? "小型精英" : "突发遭遇";
    this.banner = `${roleLabel} ${monsterIdLabel(monster.id)}！完成 ${
      stages.length
    } 道 ${lessonById(monster.lessonId).concept} 练习即可脱身。`;
    return monster.id;
  }

  private recentEncounterMonsterIds(limit: number): number[] {
    return recentCombatEncounterMonsterIds(this.answerHistory, limit);
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
    const state = {
      battleSequence: this.battleSequence,
      reviewBattleId: this.reviewBattleId,
    };
    beginCombatBattleReview(state);
    this.battleSequence = state.battleSequence;
    this.reviewBattleId = state.reviewBattleId;
  }

  private appendAnswerRecord(record: AnswerAttemptRecord): void {
    appendCombatAnswerRecord(this.answerHistory, record);
  }

  private awardExperience(monster: Monster): ExperienceSettlement {
    return awardExperience(monster, this.player);
  }

  private describeExperience(experience: ExperienceSettlement): string {
    return describeExperience(experience);
  }

  private inventoryFailure(message: string): InventoryResolution {
    this.banner = message;
    this.emit();
    return inventoryFailure(message);
  }

  private applyPlayerDamage(amount: number): {
    playerDamage: number;
    armorDamage: number;
  } {
    return applyCombatPlayerDamage(this.player, amount);
  }

  private claimFloorKey(): string {
    const keyId = `floor-${this.floorNumber}-key`;
    if (!this.keyItems.includes(keyId)) this.keyItems.push(keyId);
    this.completedRoomIds.add(this.currentRoomId);
    return this.completeFloorKeyCollection(false);
  }

  private completeFloorKeyCollection(openedBattleChest: boolean): string {
    const prefix = openedBattleChest ? "打开战利品宝箱，" : "";
    if (isReadOnlyAdminPreview(this.adminMode, this.agentPlaytestMode)) {
      this.mode = "explore";
      return `${prefix}管理员预览已击败第 ${this.floorNumber} 层层主；不会推进或写入正式 Run。`;
    }
    if (this.floorNumber < 8) {
      this.mode = "transition";
      return `${prefix}第 ${this.floorNumber} 层钥匙已接入传送门。无需按键，1.5 秒后自动进入第 ${this.floorNumber + 1} 层。`;
    }
    this.completeCampaignVictory();
    return `${prefix}获得第八层钥匙。魔王数据王座已平定，八层 SQL 图鉴均已永久更新。`;
  }

  private completeCampaignVictory(): void {
    const completion = resolveCampaignVictory({
      campaign: this.campaign,
      victories: this.profile.victories,
      bestRunQueries: this.profile.bestRunQueries,
      queryCount: this.queryCount,
    });
    this.campaign = completion.campaign;
    this.mode = "victory";
    this.profile.victories = completion.victories;
    this.profile.bestRunQueries = completion.bestRunQueries;
  }

  private completeAmbush(
    monster: Monster,
    events: CombatEvent[],
    experienceMessage: string,
    rewardEligible = true,
  ): void {
    const openedMimicChest = monster.id === FLOOR_ONE_MIMIC_MONSTER_ID;
    if (openedMimicChest) {
      this.groundItems = this.groundItems.filter((item) => item.id !== "chest:f1:mimic");
      this.openedGateIds.add("chest:f1:mimic");
    }
    const eliteRelic = rewardEligible && monster.id === FLOOR_ONE_MIMIC_MONSTER_ID
      ? this.addRelic(RELICS["schema-eye"])
      : false;
    const loot = rewardEligible
      ? this.spawnLootBundle(
          monster,
          this.currentRoomId,
          { x: this.player.x, y: this.player.y },
          [],
        )
      : { bundleCount: 0, recoveryNames: [] };
    if (loot.bundleCount > 0) {
      events.push({ type: "loot-drop", targetId: monster.id });
    }
    loot.recoveryNames.forEach((itemName) => {
      events.push({ type: "auto-heal", targetId: monster.id, itemName });
    });
    this.combat = null;
    this.activePracticeMonsterId = null;
    this.activePracticeQuestionIds = [];
    this.selectedMonsterId = null;
    this.mode = "explore";
    this.hintLevel = 0;
    this.encounterMeter = resetEncounterMeterAfterBattle(this.encounterMeter);
    const eliteRelicMessage = eliteRelic
      ? " 获得攻略遗物「Schema 之眼」：新题自动展示第一条提示。"
      : "";
    this.banner = loot.bundleCount > 0
      ? `${openedMimicChest ? "宝箱怪已击败。" : `${monster.name} 已清除。`}${experienceMessage} 掉落 1 个含 ${loot.bundleCount} 件物品的战利品包。`
      : loot.recoveryNames.length > 0
        ? `${openedMimicChest ? "宝箱怪已击败。" : `${monster.name} 已清除。`}${experienceMessage} ${loot.recoveryNames.join("、")}已直接使用，不占背包。`
        : `${openedMimicChest ? "宝箱怪已击败。" : `${monster.name} 已清除。`}${experienceMessage} 本次没有随机物品掉落；接下来 5 步不会再次遭遇。`;
    this.banner += eliteRelicMessage;
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
    const completion = resolveLessonCompletion({
      lessonId: lesson.id,
      roomId: this.currentRoomId,
      completedLessons: this.completedLessons,
      completedRoomIds: this.completedRoomIds,
      masteredLessons: this.profile.masteredLessons,
      monsters: this.monsters,
    });
    this.completedLessons = completion.completedLessons;
    this.completedRoomIds = completion.completedRoomIds;
    this.profile.masteredLessons = completion.masteredLessons;
    this.monsters = completion.monsters;
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

  /**
   * 为本机 Dungeon Maintainer 试玩开启管理员辅助和真实楼层推进。
   * 该标志只存在于当前 Session 实例，不进入 Snapshot、SavedRun 或 Profile。
   */
  enableAgentPlaytestMode(): InteractionResolution {
    this.agentPlaytestMode = true;
    this.adminMode = true;
    this.emit();
    return {
      ok: true,
      kind: "none",
      message: "Agent 试玩已开启：管理员辅助可用，楼层仍按真实流程推进。",
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
    const preview = createAdminFloorPreview(
      this.campaign.baseSeed,
      floor,
      this.player,
    );
    if (!preview) return this.interactionFailure("管理员预览层缺少固定地图标识。");

    this.campaign = preview.campaign;
    this.floorNumber = preview.floor;
    this.graph = preview.graph;
    this.mazeFloor = preview.mazeFloor;
    this.campfires = preview.campfires;
    this.guidedMap = preview.guidedMap;
    this.biomePlan = preview.biomePlan;
    this.activeCampfireId = null;
    this.respawnCampfireId = null;
    this.activeLootBundleId = null;
    this.mode = "explore";
    this.currentRoomId = preview.currentRoomId;
    this.player = preview.player;
    this.monsters = preview.monsters;
    this.worldActors = preview.worldActors;
    this.groundItems = preview.groundItems;
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
    this.encounterMeter = preview.encounterMeter;
    this.hintLevel = 0;
    this.regionTransfer = null;
    this.revealAt(this.player);
    this.banner = `管理员预览：第 ${floor} 层全图已载入。刷新页面可回到最后一次正式存档。`;
    this.emit();
    return { ok: true, kind: "none", message: this.banner };
  }

  /** 管理员唯一的楼层推进入口：只进入下一层出生点，不跳转到具体地点。 */
  adminNextFloor(): InteractionResolution {
    if (!this.adminMode) {
      return this.interactionFailure("请先开启管理员视图。");
    }
    if (this.floorNumber >= 8) {
      return this.interactionFailure("已经在最后一层，没有下一层初始位置。");
    }
    return this.adminLoadFloor((this.floorNumber + 1) as FloorNumber);
  }

  adminApplyPreset(presetId: string): InteractionResolution {
    if (!this.adminMode || this.mode !== "explore") {
      return this.interactionFailure("管理员状态预设当前不可用。");
    }
    const resolution = resolveAdminPreset({
      floor: this.floorNumber,
      presetId,
      graph: this.graph,
      mazeFloor: this.mazeFloor,
      campfires: this.campfires,
      guidedMap: this.guidedMap,
      monsters: this.monsters,
      worldActors: this.worldActors,
    });
    if (!resolution.ok) return this.interactionFailure(resolution.message);

    this.completedLessons = resolution.completedLessons;
    this.openedGateIds = resolution.openedGateIds;
    this.keyItems = resolution.keyItems;
    this.adminIdentityMonsterIds = resolution.adminIdentityMonsterIds;
    this.monsters = resolution.monsters;
    this.combat = null;
    this.selectedMonsterId = null;
    this.activeGateChallengeId = null;
    this.activeCampfireId = null;
    this.activeLootBundleId = null;
    this.regionTransfer = null;
    this.hintLevel = 0;

    this.visitedRoomIds = resolution.visitedRoomIds;
    this.completedRoomIds = resolution.completedRoomIds;
    this.groundItems = resolution.groundItems;
    this.lootBundles = [];
    this.ensureOpenedHiddenAreaRewards();

    this.player.x = resolution.destination.x;
    this.player.y = resolution.destination.y;
    this.player.hp = this.player.maxHp;
    this.player.heat = 0;
    this.currentRoomId = resolution.currentRoomId;
    this.revealAt(resolution.destination);
    this.banner = `管理员预设：${resolution.label} · 已定位 ${resolution.landmarkName}。预览不会写入正式进度。`;
    this.emit();
    return { ok: true, kind: "none", message: this.banner };
  }

  adminTravelToRegion(regionId: string): InteractionResolution {
    if (!this.adminMode || this.mode !== "explore") {
      return this.interactionFailure("管理员区域跳转当前不可用。");
    }
    const resolution = resolveAdminRegion({
      regionId,
      biomePlan: this.biomePlan,
      mazeFloor: this.mazeFloor,
      campfires: this.campfires,
      monsters: this.monsters,
      worldActors: this.worldActors,
      player: this.player,
    });
    if (!resolution.ok) return this.interactionFailure(resolution.message);
    this.player.x = resolution.destination.x;
    this.player.y = resolution.destination.y;
    this.updateCurrentRoom(resolution.destination);
    this.revealAt(resolution.destination);
    this.regionTransferSequence += 1;
    this.regionTransfer = {
      sequence: this.regionTransferSequence,
      fromName: resolution.fromName,
      toName: resolution.toName,
    };
    this.banner = `管理员跳转：已定位 ${resolution.toName}。`;
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
      applyConsumable(this.player, item.consumable);
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
      return this.interactionFailure("当前不能打开沉默木箱。 ");
    }
    const requiredLessons: readonly LessonId[] = ["select", "where", "is-null"];
    const missingLesson = requiredLessons.find(
      (lessonId) => !this.completedLessons.has(lessonId),
    );
    if (missingLesson) {
      return this.interactionFailure(
        "沉默木箱尚未响应：先完成 SELECT、WHERE 与 IS NULL 三项基础课程。",
      );
    }
    const monster = this.monsters.find((entry) => entry.id === FLOOR_ONE_MIMIC_MONSTER_ID);
    if (monster) this.preparePracticeBattle(monster);
    const stages = monster ? this.combatStagesForMonster(monster) : [];
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
        damage: counterDamageForMonster(monster),
        locks: [...stages[0].locks],
      },
    };
    this.selectedMonsterId = monster.id;
    this.hintLevel = this.relics.some((relic) => relic.id === "schema-eye") ? 1 : 0;
    this.banner = `沉默木箱突然合拢：ID #${String(monster.id).padStart(3, "0")} 苏醒。完成 ${stages.length} 道第一层基础题，才能打开箱腹。`;
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
      this.banner = this.completeFloorKeyCollection(openedBattleChest);
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
    applyInventoryReward({
      player: this.player,
      relics: this.relics,
      acquiredUniqueItemIds: this.acquiredUniqueItemIds,
    }, rewardId);
  }

  private addRelic(relic: Relic): boolean {
    return addInventoryRelic({
      player: this.player,
      relics: this.relics,
      acquiredUniqueItemIds: this.acquiredUniqueItemIds,
    }, relic);
  }

  private availableWeaponLoot(): LootDrop | null {
    return selectAvailableWeaponLoot(this.groundItems);
  }

  private claimableRoomReward(): ClaimableReward | null {
    return selectClaimableRoomReward({
      groundItems: this.groundItems,
      currentRoomId: this.currentRoomId,
      graph: this.graph,
      completedLessons: this.completedLessons,
    });
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
      this.banner = `${monsterIdLabel(monster.id)} 正在区域内巡逻。触碰才会开战。`;
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
    return selectFloorLandmarkPosition({
      floor: this.floorNumber,
      mazeFloor: this.mazeFloor,
    }, landmarkId);
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
    return selectFloorNpcPosition({
      floor: this.floorNumber,
      mazeFloor: this.mazeFloor,
    }, npcId);
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
      .map((landmark) => ({
        id: landmark.id,
        radius: Math.max(
          3,
          Math.ceil(landmark.anchor.clearance.width / 2),
          Math.ceil(landmark.anchor.clearance.height / 2),
        ),
      }));
    const npcId = `npc-scribe-f${this.floorNumber}`;
    return [
      { id: npcId, position: this.floorNpcPosition(npcId), radius: 3 },
      ...ids.map(({ id, radius }) => ({
        id,
        radius,
        position: this.floorLandmarkPosition(id),
      })),
    ]
      .filter((entry): entry is { id: string; position: Position; radius: number } => (
        entry.position !== null
      ))
      .filter((entry) => distance(entry.position, this.player) <= entry.radius)
      .sort((left, right) => (
        distance(left.position, this.player) - distance(right.position, this.player)
      ))[0] ?? null;
  }

  private inspectFloorLandmark(landmarkId: string): InteractionResolution {
    let message = floorLandmarkMessage({
      floor: this.floorNumber,
      landmarkId,
      completedLessons: this.completedLessons,
      openedGateIds: this.openedGateIds,
      monsters: this.monsters,
    });
    if (message === null) {
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
      const evidenceId = floorStoryEvidenceIdForLandmark(landmarkId);
      if (evidenceId) this.recordStoryEvidence(evidenceId);
    }
    return { ok: true, kind: "inspection", message, landmarkId };
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
          `${transit.label}尚未开放：先击败 ${monsterIdLabel(blocker.id)}。`,
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
    const guardian = livingRequiredBoss(this.monsters, guardianId);
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
    revealSessionAt({
      floor: this.floorNumber,
      mazeFloor: this.mazeFloor,
      campfires: this.campfires,
      discoveredCells: this.discoveredCells,
    }, position);
  }

  private floorHazards(): ReturnType<typeof selectFloorHazards> {
    return selectFloorHazards({
      floor: this.floorNumber,
      mazeFloor: this.mazeFloor,
      campfires: this.campfires,
      guidedMap: this.guidedMap,
      biomePlan: this.biomePlan,
    });
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
        : livingRequiredBoss(this.monsters, regionPortal.portal.requiredBossId);
      return boss && regionPortal.side === "entry"
        ? `E  ${transit.label}未开放 · 先击败 ${monsterIdLabel(boss.id)}`
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
      return `触碰 ${monsterIdLabel(monster.id)} 进入战斗`;
    }
    return "探索迷宫 · 已走过的区域会显示在小地图";
  }

  private challengeGateId(): string {
    return selectChallengeGateId(this.graph);
  }

  private nearbyLockedChallengeGate(): MazeFloor["gates"][number] | null {
    return selectNearbyLockedChallengeGate({
      ...this.roomAccessSelectorContext(),
      mazeFloor: this.mazeFloor,
      player: this.player,
    });
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

  /**
   * 进入短暂 defeat 状态，等待表现层调用 respawnAfterDefeat。
   * 非战斗伤害没有当前战斗，因此清空复盘 ID；战斗死亡则保留最近战斗
   * 供 death-review 展示。
   */
  private enterDefeat(source: "combat" | "gate" | "hazard"): void {
    this.mode = "defeat";
    this.combat = null;
    this.selectedMonsterId = null;
    this.activeGateChallengeId = null;
    this.activeCampfireId = null;
    this.activeLootBundleId = null;
    if (source !== "combat") {
      // 门题不会创建战斗答题记录。清除此状态可避免复活后显示无关的上一场战斗。
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
    return movementFailure(from, to, blockedBy, message);
  }

  private interactionFailure(message: string): InteractionResolution {
    this.banner = message;
    this.emit();
    return interactionFailure(message);
  }

  private travelFailure(roomId: string, message: string): TravelResolution {
    this.banner = message;
    this.emit();
    return travelFailure(roomId, message);
  }

  private emptyTurn(message: string, queryTargetIds: number[]): TurnResolution {
    return emptyTurn(this.mode, message, queryTargetIds);
  }

  /** 将当前隔离快照发布给订阅者；订阅者只能读取快照并自行决定如何展示。 */
  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
