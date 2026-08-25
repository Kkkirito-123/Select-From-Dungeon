/**
 * GameSession 的只读视图与存档转换。
 *
 * 本模块只负责把显式传入的运行状态复制成 GameSnapshot 或 SavedRun。
 * 它不修改游戏状态，不访问浏览器存储、DOM、Phaser 或 Agent；需要计算
 * 当前房间、导航和交互提示时，由 GameSession 通过回调提供已经绑定的查询。
 */
import { gateChallengeForFloor } from "../../content/curriculum/gateChallenges";
import { INITIAL_MONSTERS } from "../../content/curriculum/mvpLevel";
import { lessonTaskBriefFor } from "../../content/curriculum/lessonTaskBrief";
import { roomFlavor } from "../../content/world/runContent";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { SavedRun } from "../../contracts/game/persistence";
import {
  biomeRegionAt,
  cloneBiomePlan,
  type BiomePlan,
} from "../exploration/biome";
import { isSafeZonePosition } from "../exploration/campfire";
import { cloneGuidedMapPlan, type GuidedMapPlan } from "../exploration/guidedMap";
import { cloneMazeFloor, type MazeFloor } from "../exploration/mazeGenerator";
import { cloneWorldActor, type WorldActor } from "../exploration/monsterRoaming";
import { cloneCampaignProgress, type CampaignProgress } from "../progression/campaign";
import type { FloorNumber, RoomGraph, RoomNode } from "../progression/runGraph";
import {
  allMapCellKeys,
  cloneAnswerHistory,
  cloneCombat,
  cloneConsumableStack,
  cloneEquipment,
  cloneGraph,
  cloneItem,
  cloneLootBundle,
  cloneMonsters,
  cloneProfile,
} from "./sessionState";
import type { FloorHazard } from "../exploration/floorLabyrinth";
import type {
  AnswerAttemptRecord,
  Campfire,
  ClaimableReward,
  CombatState,
  ConsumableStack,
  EquipmentItem,
  GateChallengeId,
  GroundItem,
  LessonDefinition,
  LessonId,
  LessonStageDefinition,
  LootBundle,
  LootDrop,
  Monster,
  PlayerState,
  ProfileProgress,
  Relic,
} from "../shared/types";
import {
  monsterIdLabel,
  monsterIntentName,
  monsterNameForProfile,
  redactUndiscoveredMonsterIdentityText,
} from "../progression/monsterIdentity";

/**
 * 快照和存档转换所需的显式上下文。
 *
 * 数组、集合和嵌套对象都属于 GameSession 的内部状态；转换函数会复制它们，
 * 因此调用者拿到结果后不能反向修改运行中的会话。回调只用于读取派生信息。
 */
export interface SessionSnapshotContext {
  runInstanceId: string;
  questionBankVersion: string;
  mode: GameSnapshot["mode"];
  adminMode: boolean;
  /** 仅普通管理员预览可把答案交给输入框；Agent 试玩必须保持玩家输入。 */
  exposeAdminAnswer: boolean;
  adminPanelOpen: boolean;
  adminIdentityMonsterIds: Set<number>;
  regionTransfer: GameSnapshot["regionTransfer"];
  campaign: CampaignProgress;
  floorNumber: FloorNumber;
  graph: RoomGraph;
  mazeFloor: MazeFloor;
  guidedMap: GuidedMapPlan;
  biomePlan: BiomePlan;
  campfires: Campfire[];
  activeCampfireId: string | null;
  respawnCampfireId: string | null;
  activeLootBundleId: string | null;
  currentRoomId: string;
  player: PlayerState;
  monsters: Monster[];
  worldActors: WorldActor[];
  groundItems: GroundItem[];
  lootBundles: LootBundle[];
  equipmentInventory: EquipmentItem[];
  consumables: ConsumableStack[];
  keyItems: string[];
  acquiredUniqueItemIds: Set<string>;
  discoveredCells: Set<string>;
  combat: CombatState | null;
  selectedMonsterId: number | null;
  visitedRoomIds: Set<string>;
  completedRoomIds: Set<string>;
  completedLessons: Set<LessonId>;
  openedGateIds: Set<string>;
  activeGateChallengeId: GateChallengeId | null;
  relics: Relic[];
  profile: ProfileProgress;
  queryCount: number;
  totalMoves: number;
  stepsSinceEncounter: number;
  safeStepsRemaining: number;
  hintLevel: number;
  answerHistory: AnswerAttemptRecord[];
  reviewBattleId: number | null;
  practiceDrawStates: {
    L1: { cursor: number; cycle: number };
    L2: { cursor: number; cycle: number };
    L3: { cursor: number; cycle: number };
  };
  activePracticeMonsterId: number | null;
  activePracticeQuestionIds: string[];
  rewardedPracticeMonsterIds: Set<number>;
  guidanceObjectiveId: string | null;
  guidanceSteps: number;
  guidanceLevel: 0 | 1 | 2 | 3;
  battleSequence: number;
  banner: string;
  currentRoom: () => RoomNode;
  currentLesson: () => LessonDefinition;
  currentCombatStages: () => readonly LessonStageDefinition[];
  monsterForCurrentRoom: () => Monster | undefined;
  availableRoomIds: () => string[];
  availableWeaponLoot: () => LootDrop | null;
  claimableRoomReward: () => ClaimableReward | null;
  challengeGateId: () => string;
  floorHazards: () => FloorHazard[];
  navigationGuidance: () => GameSnapshot["navigationGuidance"];
  interactionPrompt: () => string;
}

/** 生成不会泄漏未发现怪物身份的玩家视图。 */
function visibleProfileFor(context: SessionSnapshotContext): ProfileProgress {
  const profile = cloneProfile(context.profile);
  if (context.adminMode && context.adminIdentityMonsterIds.size > 0) {
    // 管理员显示仅是临时视图，不写回 Profile，也不改变永久图鉴进度。
    profile.discoveredMonsterIds = [...new Set([
      ...profile.discoveredMonsterIds,
      ...context.adminIdentityMonsterIds,
    ])].sort((left, right) => left - right);
  }
  return profile;
}

/**
 * 将当前会话转换成展示层和 Agent 使用的只读快照。
 *
 * 这里保留身份脱敏、任务提示和派生导航信息的原有顺序，避免快照字段
 * 在重构过程中出现行为漂移。
 */
export function createSessionSnapshot(context: SessionSnapshotContext): GameSnapshot {
  const room = context.currentRoom();
  const lesson = context.currentLesson();
  const combatStages = context.currentCombatStages();
  const stageIndex = Math.min(context.combat?.successStep ?? 0, combatStages.length - 1);
  const stage = combatStages[stageIndex];
  const roomTarget = context.monsterForCurrentRoom();
  const target = context.combat
    ? context.monsters.find((monster) => monster.id === context.combat?.targetId)
    : roomTarget;
  const looseWeapon = context.availableWeaponLoot();
  const looseWeaponItem = looseWeapon
    ? context.groundItems.find((item) => item.weapon?.id === looseWeapon.weapon.id)
    : null;
  const roomReward = context.claimableRoomReward();
  const activeGateChallenge = context.activeGateChallengeId
    ? gateChallengeForFloor(context.floorNumber, context.challengeGateId())
    : null;
  const visibleProfile = visibleProfileFor(context);
  const redactIdentity = (value: string): string => (
    redactUndiscoveredMonsterIdentityText(
      value,
      context.monsters,
      visibleProfile.discoveredMonsterIds,
    )
  );
  const visibleRoomGraph = cloneGraph(context.graph);
  visibleRoomGraph.nodes = visibleRoomGraph.nodes.map((node) => ({
    ...node,
    title: redactIdentity(node.title),
  }));
  const visibleBiomePlan = cloneBiomePlan(context.biomePlan);
  visibleBiomePlan.regions = visibleBiomePlan.regions.map((region) => ({
    ...region,
    name: redactIdentity(region.name),
  }));
  visibleBiomePlan.portals = visibleBiomePlan.portals.map((portal) => ({
    ...portal,
    name: redactIdentity(portal.name),
  }));
  const missionTitle = context.mode === "victory"
    ? "八层贯通 · RUN COMMITTED"
    : context.mode === "transition"
      ? `传送门启动 · FLOOR ${String(context.floorNumber + 1).padStart(2, "0")} LOADING`
    : context.mode === "defeat"
      ? "生命归零 · YOU DIED"
      : context.mode === "death-review"
        ? "死亡复盘 · RETURN TO CHECKPOINT"
        : context.mode === "campfire"
          ? "篝火休整 · CHECKPOINT"
          : context.mode === "inventory"
            ? "装备背包 · LOADOUT"
            : context.mode === "loot"
              ? "战利品包 · LOOT"
              : context.mode === "challenge" && activeGateChallenge
                ? activeGateChallenge.title
                : context.combat?.kind === "ambush"
                  ? `${lesson.title} · 突发遭遇`
                  : room.lessonId && roomTarget?.hp
                    ? lesson.title
                    : room.title;
  const missionBody = context.mode === "victory"
    ? "你击败了魔王。八层 SQL 图鉴和练习记录已经永久保留。"
    : context.mode === "transition"
      ? `第 ${context.floorNumber + 1} 层传送门已经展开。无需按键，正在自动进入下一层。`
      : context.mode === "defeat"
        ? "生命值归零。正在返回最近休息的篝火；尚未休息时返回本层出生点。"
        : context.mode === "death-review"
          ? "生命已恢复。先复盘导致本次死亡的战斗，再重新出发。"
          : context.mode === "campfire"
            ? "选择在此休息恢复满生命并更新复活点，或查看当前楼层答案复盘。"
            : context.mode === "inventory"
              ? "管理 12 格装备背包、当前武器、防具和三格恢复品；战斗中不能换装。"
              : context.mode === "loot"
                ? "处理战利品包。背包已满时物品会留在包中，不会静默消失。"
                : context.mode === "challenge" && activeGateChallenge
                  ? activeGateChallenge.objective
                  : looseWeapon
                    ? looseWeaponItem?.collection === "interact"
                      ? `装有 ${looseWeapon.weapon.name} 的战利品宝箱仍在迷宫中。靠近后按 E 打开。`
                      : `走到发光掉落上自动拾取 ${looseWeapon.weapon.name}。`
                    : roomReward
                      ? `${roomReward.description} 站到核心旁按 E 调查。`
                      : context.combat && target && target.hp > 0
                        ? stage.objective
                        : room.lessonId && roomTarget && roomTarget.hp > 0
                          ? stage.objective
                          : roomFlavor(room.type, context.floorNumber);
  const taskMonster = target ?? context.monsters.find(
    (monster) => monster.id === lesson.primaryMonsterId,
  );
  const rawTaskBrief = !activeGateChallenge && (context.combat || room.lessonId) && taskMonster
    ? lessonTaskBriefFor({
        floor: context.floorNumber,
        lesson,
        stage,
        monster: taskMonster,
        stageIndex,
      })
    : null;
  const taskBrief = rawTaskBrief ? {
    ...rawTaskBrief,
    situation: redactIdentity(rawTaskBrief.situation),
    queryGoal: redactIdentity(rawTaskBrief.queryGoal),
    outputColumns: rawTaskBrief.outputColumns.map(redactIdentity),
    fieldGuide: rawTaskBrief.fieldGuide.map((field) => ({
      expression: redactIdentity(field.expression),
      meaning: redactIdentity(field.meaning),
    })),
    relations: rawTaskBrief.relations.map(redactIdentity),
    constraints: rawTaskBrief.constraints.map(redactIdentity),
    successEffect: redactIdentity(rawTaskBrief.successEffect),
    focusTopics: rawTaskBrief.focusTopics.map(redactIdentity),
    reviewTopics: rawTaskBrief.reviewTopics.map(redactIdentity),
    hints: rawTaskBrief.hints.map(redactIdentity),
  } : null;
  const visibleCombat = cloneCombat(context.combat);
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
          ? record.outcome === "victory"
            ? monsterNameForProfile(monster, visibleProfile)
            : monsterIdLabel(monster.id)
          : redactRecordIdentity(record.monsterName),
        stageObjective: redactRecordIdentity(record.stageObjective),
        feedback: redactRecordIdentity(record.feedback),
      };
    })
  );
  const navigationGuidance = context.navigationGuidance();
  return {
    runInstanceId: context.runInstanceId,
    questionBankVersion: context.questionBankVersion,
    mode: context.mode,
    adminMode: context.adminMode,
    adminPanelOpen: context.adminPanelOpen,
    regionTransfer: context.regionTransfer ? {
      ...context.regionTransfer,
      fromName: redactIdentity(context.regionTransfer.fromName),
      toName: redactIdentity(context.regionTransfer.toName),
    } : null,
    campaign: cloneCampaignProgress(context.campaign),
    biomePlan: visibleBiomePlan,
    currentBiome: biomeRegionAt(context.biomePlan, context.player).kind,
    lessonId: lesson.id,
    lessonStageId: stage.id,
    lessonStageIndex: stageIndex,
    player: {
      ...context.player,
      weapon: { ...context.player.weapon },
      armor: context.player.armor ? { ...context.player.armor } : null,
    },
    monsters: cloneMonsters(context.monsters),
    combat: visibleCombat,
    focusMonsterId: context.combat?.targetId ?? context.selectedMonsterId ?? target?.id ?? null,
    roomGraph: visibleRoomGraph,
    mazeFloor: cloneMazeFloor(context.mazeFloor),
    guidedMap: cloneGuidedMapPlan(context.guidedMap),
    campfires: context.campfires.map((campfire) => ({
      ...campfire,
      restPosition: { ...campfire.restPosition },
    })),
    hazards: context.floorHazards(),
    activeCampfireId: context.activeCampfireId,
    respawnCampfireId: context.respawnCampfireId,
    activeLootBundleId: context.activeLootBundleId,
    inSafeZone: isSafeZonePosition(context.mazeFloor, context.campfires, context.player),
    worldActors: context.worldActors.map(cloneWorldActor),
    groundItems: context.groundItems.map(cloneItem),
    lootBundles: context.lootBundles.map(cloneLootBundle),
    equipmentInventory: context.equipmentInventory.map(cloneEquipment),
    consumables: context.consumables.map(cloneConsumableStack),
    keyItems: [...context.keyItems],
    acquiredUniqueItemIds: [...context.acquiredUniqueItemIds],
    discoveredCells: context.adminMode
      ? allMapCellKeys(context.mazeFloor)
      : [...context.discoveredCells],
    currentRoomId: context.currentRoomId,
    currentRoomTitle: redactIdentity(room.title),
    currentRoomType: room.type,
    visitedRoomIds: [...context.visitedRoomIds],
    completedRoomIds: [...context.completedRoomIds],
    availableRoomIds: context.availableRoomIds(),
    completedLessons: [...context.completedLessons],
    challengeGateId: context.challengeGateId(),
    openedGateIds: [...context.openedGateIds],
    activeGateChallenge: activeGateChallenge ? {
      ...activeGateChallenge,
      objective: redactIdentity(activeGateChallenge.objective),
      schema: activeGateChallenge.schema.map(redactIdentity),
      hints: activeGateChallenge.hints.map(redactIdentity),
    } : null,
    relics: context.relics.map((relic) => ({ ...relic })),
    profile: visibleProfile,
    availableLoot: looseWeapon,
    claimableReward: roomReward,
    runSeed: context.graph.seed,
    floor: context.floorNumber,
    queryCount: context.queryCount,
    totalMoves: context.totalMoves,
    stepsSinceEncounter: context.stepsSinceEncounter,
    safeStepsRemaining: context.safeStepsRemaining,
    navigationGuidance,
    hintLevel: context.hintLevel,
    battleReview: visibleAnswerHistory(context.answerHistory.filter(
      (record) => record.battleId === context.reviewBattleId,
    )),
    floorReview: visibleAnswerHistory(context.answerHistory.filter(
      (record) => record.floor === context.floorNumber,
    )),
    missionTitle: redactIdentity(missionTitle),
    missionBody: redactIdentity(missionBody),
    lessonIntro: activeGateChallenge
      ? "可选越级机关：破解只打开当前物理门，不授予课程掌握、经验或战利品。"
      : context.combat || room.lessonId ? redactIdentity(lesson.intro) : "",
    taskBrief,
    // 正式玩家永远拿不到答案；管理员只把它交给输入框辅助，不参与存档或 Agent 投影。
    adminAnswerSql: context.exposeAdminAnswer && context.mode === "combat"
      ? stage.answerSql
      : null,
    schema: activeGateChallenge
      ? [...activeGateChallenge.schema]
      : context.combat || room.lessonId
        ? [...lesson.schema]
        : ["当前区域没有强制查询。继续探索迷宫或调查发光核心。"],
    queryTemplate: redactIdentity(stage.queryTemplate),
    hints: (taskBrief?.hints ?? stage.hints)
      .slice(0, context.hintLevel)
      .map(redactIdentity),
    locks: [...stage.locks],
    banner: redactIdentity(context.banner),
    interactionPrompt: redactIdentity(context.interactionPrompt()),
  };
}

/** 将会话状态复制成稳定的 v12 SavedRun，不在这里执行校验或迁移。 */
export function serializeSession(context: SessionSnapshotContext): SavedRun {
  return {
    version: 12,
    generatorVersion: context.mazeFloor.generatorVersion,
    runInstanceId: context.runInstanceId,
    questionBankVersion: context.questionBankVersion,
    practiceDrawCursor: context.practiceDrawStates.L1.cursor,
    practiceDrawCycle: context.practiceDrawStates.L1.cycle,
    practiceDrawStates: {
      L1: { ...context.practiceDrawStates.L1 },
      L2: { ...context.practiceDrawStates.L2 },
      L3: { ...context.practiceDrawStates.L3 },
    },
    activePracticeMonsterId: context.activePracticeMonsterId,
    activePracticeQuestionIds: [...context.activePracticeQuestionIds],
    rewardedPracticeMonsterIds: [...context.rewardedPracticeMonsterIds],
    guidanceObjectiveId: context.guidanceObjectiveId,
    guidanceSteps: context.guidanceSteps,
    guidanceLevel: context.guidanceLevel,
    campaign: cloneCampaignProgress(context.campaign),
    floor: context.floorNumber,
    graph: cloneGraph(context.graph),
    mazeFloor: cloneMazeFloor(context.mazeFloor),
    campfires: context.campfires.map((campfire) => ({
      ...campfire,
      restPosition: { ...campfire.restPosition },
    })),
    activeCampfireId: context.activeCampfireId,
    respawnCampfireId: context.respawnCampfireId,
    activeLootBundleId: context.activeLootBundleId,
    worldActors: context.worldActors.map(cloneWorldActor),
    groundItems: context.groundItems.map(cloneItem),
    lootBundles: context.lootBundles.map(cloneLootBundle),
    equipmentInventory: context.equipmentInventory.map(cloneEquipment),
    consumables: context.consumables.map(cloneConsumableStack),
    keyItems: [...context.keyItems],
    acquiredUniqueItemIds: [...context.acquiredUniqueItemIds],
    discoveredCells: [...context.discoveredCells],
    mode: context.mode,
    currentRoomId: context.currentRoomId,
    player: {
      ...context.player,
      weapon: { ...context.player.weapon },
      armor: context.player.armor ? { ...context.player.armor } : null,
    },
    monsters: cloneMonsters(context.monsters),
    combat: cloneCombat(context.combat),
    visitedRoomIds: [...context.visitedRoomIds],
    completedRoomIds: [...context.completedRoomIds],
    completedLessons: [...context.completedLessons],
    openedGateIds: [...context.openedGateIds],
    activeGateChallengeId: context.activeGateChallengeId,
    relics: context.relics.map((relic) => ({ ...relic })),
    availableLoot: context.availableWeaponLoot(),
    claimableReward: context.claimableRoomReward(),
    queryCount: context.queryCount,
    totalMoves: context.totalMoves,
    stepsSinceEncounter: context.stepsSinceEncounter,
    safeStepsRemaining: context.safeStepsRemaining,
    hintLevel: context.hintLevel,
    answerHistory: cloneAnswerHistory(context.answerHistory),
    battleSequence: context.battleSequence,
    reviewBattleId: context.reviewBattleId,
    banner: context.banner,
  };
}
