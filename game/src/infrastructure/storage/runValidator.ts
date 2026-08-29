/**
 * Run 存档版本入口与跨字段不变量组合。
 *
 * 基础值和世界结构由相邻模块校验；本模块不读取浏览器存储。
 */
import { reachableMazeCells } from "../../domain/exploration/mazeValidation";
import {
  nearbyCampfire,
  safeZoneCellKeys,
} from "../../domain/exploration/campfire";
import {
  generateGuidedMapPlan,
  validateGuidedMapPlan,
} from "../../domain/exploration/guidedMap";
import { generateBiomePlan } from "../../domain/exploration/biome";
import { generateFloorHazards } from "../../domain/exploration/floorLabyrinth";
import { isFloorOneChestMarker } from "../../domain/exploration/floorOneTreasure";
import { storyEvidenceMarkerIdsForFloor } from "../../domain/progression/floorStory";
import {
  migrationMarkersFormPrefix,
  migrationStepMarkerIds,
} from "../../domain/progression/finalMigration";
import { isCampaignProgress } from "../../domain/progression/campaign";
import { gateChallengeIdForFloor } from "../../content/curriculum/gateChallenges";
import { QUESTION_BANK_VERSION } from "../../content/curriculum/questionBank";
import { hiddenAreaGateIdsForFloor } from "../../content/world/floorExperience";
import { CURRENT_MONSTER_IDS_BY_FLOOR } from "../../content/world/monsterIds";
import {
  lessonsForFloor,
  type FloorNumber,
} from "../../domain/progression/runGraph";
import {
  MAX_ANSWER_HISTORY,
  type GateChallengeId,
} from "../../domain/shared/types";
import type { SavedRun } from "../../contracts/game/persistence";
import {
  GATE_CHALLENGE_IDS,
  PLAY_MODES,
  hasUniqueValues,
  isCombat,
  isConsumableStack,
  isEquipmentItem,
  isFloorCell,
  isLessonId,
  isLoot,
  isMonster,
  isNonNegativeInteger,
  isPlayer,
  isPositionInFloor,
  isPositiveInteger,
  isPracticeDrawStates,
  isRecord,
  isRelic,
  isReward,
  positionKey,
} from "./runDataValidators";
import {
  isAnswerAttemptRecord,
  isDiscoveredCell,
  isGroundItem,
  isLootBundle,
  isMazeFloor,
  isValidGraph,
  isWorldActor,
  validatedCampfires,
} from "./runWorldValidator";

/** 校验当前 v12、generator v7 Run。 */
export function isSavedRun(value: unknown): value is SavedRun {
  if (!isRecord(value)) return false;
  const run = value as Partial<SavedRun>;
  if (
    run.version !== 12 ||
    run.generatorVersion !== 7 ||
    (
      run.floor !== 1 &&
      run.floor !== 2 &&
      run.floor !== 3 &&
      run.floor !== 4 &&
      run.floor !== 5 &&
      run.floor !== 6 &&
      run.floor !== 7 &&
      run.floor !== 8
    ) ||
    !isValidGraph(run.graph)
  ) return false;
  const graph = run.graph;
  if (run.floor !== graph.floor) return false;
  if (
    !isCampaignProgress(run.campaign) ||
    run.campaign.currentFloor !== run.floor ||
    ((run.mode === "victory") !== (run.campaign.status === "completed"))
  ) return false;
  if (!isMazeFloor(run.mazeFloor, graph)) return false;
  const mazeFloor = run.mazeFloor;
  const challengeGateId = `gate:${graph.bossId}`;
  const hiddenAreaGateIds = hiddenAreaGateIdsForFloor(Number(run.floor));
  const expectedChallengeId = gateChallengeIdForFloor(run.floor);
  const openedGateIds = run.openedGateIds;
  const activeGateChallengeId = run.activeGateChallengeId;
  const answerHistory = run.answerHistory;
  const battleSequence = run.battleSequence;
  const reviewBattleId = run.reviewBattleId;
  const campfires = validatedCampfires(run.campfires, graph, mazeFloor);
  if (!campfires) return false;
  const guidedMap = generateGuidedMapPlan(graph, mazeFloor, campfires);
  const biomePlan = generateBiomePlan(graph, mazeFloor, campfires, guidedMap);
  const floorHazardIds = new Set(generateFloorHazards(
    graph.floor,
    mazeFloor,
    campfires,
    guidedMap,
    biomePlan,
  ).map((hazard) => hazard.id));
  const storyEvidenceMarkerIds = new Set(
    storyEvidenceMarkerIdsForFloor(run.floor),
  );
  const finalMigrationMarkerIds = new Set(migrationStepMarkerIds());
  if (!validateGuidedMapPlan(graph, mazeFloor, campfires, guidedMap).valid) return false;
  const activeCampfireId = run.activeCampfireId;
  const respawnCampfireId = run.respawnCampfireId;
  const activeLootBundleId = run.activeLootBundleId;
  const activePracticeQuestionIds = Array.isArray(run.activePracticeQuestionIds)
    ? run.activePracticeQuestionIds
    : [];
  const activePracticeMonsterId = run.activePracticeMonsterId;
  const allCurrentMonsterIds = new Set(
    Object.values(CURRENT_MONSTER_IDS_BY_FLOOR).flat(),
  );
  const expectedMonsterIds = CURRENT_MONSTER_IDS_BY_FLOOR[run.floor as FloorNumber];
  if (
    !PLAY_MODES.includes(run.mode as (typeof PLAY_MODES)[number]) ||
    !(activeCampfireId === null || typeof activeCampfireId === "string") ||
    !(respawnCampfireId === null || typeof respawnCampfireId === "string") ||
    !(activeLootBundleId === null || typeof activeLootBundleId === "string") ||
    (
      typeof run.runInstanceId !== "string" ||
      run.runInstanceId.length < 8 ||
      run.questionBankVersion !== QUESTION_BANK_VERSION ||
      !isNonNegativeInteger(run.practiceDrawCursor) ||
      !isNonNegativeInteger(run.practiceDrawCycle) ||
      !isPracticeDrawStates(run.practiceDrawStates) ||
      !(activePracticeMonsterId === null || (
        isPositiveInteger(activePracticeMonsterId) &&
        CURRENT_MONSTER_IDS_BY_FLOOR[run.floor as FloorNumber].includes(activePracticeMonsterId)
      )) ||
      !Array.isArray(run.activePracticeQuestionIds) ||
      activePracticeQuestionIds.length > 3 ||
      !activePracticeQuestionIds.every((id) => (
        typeof id === "string" &&
        id.startsWith(`${QUESTION_BANK_VERSION}:`) &&
        /^question-bank-v\d+:f[1-8]:(?:current|review):t\d{2}:v[1-8]$/u.test(id)
      )) ||
      !hasUniqueValues(activePracticeQuestionIds) ||
      !Array.isArray(run.rewardedPracticeMonsterIds) ||
      !run.rewardedPracticeMonsterIds.every((id) => (
        isPositiveInteger(id) && allCurrentMonsterIds.has(id)
      )) ||
      !hasUniqueValues(run.rewardedPracticeMonsterIds) ||
      !(run.guidanceObjectiveId === null || typeof run.guidanceObjectiveId === "string") ||
      !isNonNegativeInteger(run.guidanceSteps) ||
      (run.guidanceLevel !== 0 && run.guidanceLevel !== 1 &&
        run.guidanceLevel !== 2 && run.guidanceLevel !== 3)
    ) ||
    (run.mode === "campfire" && activeCampfireId === null) ||
    (activeCampfireId !== null && run.mode !== "campfire" && run.mode !== "inventory") ||
    ((run.mode === "loot") !== (activeLootBundleId !== null)) ||
    (activeCampfireId !== null && !campfires.some((entry) => entry.id === activeCampfireId)) ||
    (respawnCampfireId !== null && !campfires.some((entry) => entry.id === respawnCampfireId)) ||
    !Array.isArray(openedGateIds) ||
    !openedGateIds.every((id) => (
      id === challengeGateId ||
      hiddenAreaGateIds.includes(id) ||
      guidedMap.shortcuts.some((shortcut) => shortcut.id === id) ||
      guidedMap.deadEndCaches.some((cache) => cache.id === id) ||
      floorHazardIds.has(id) ||
      storyEvidenceMarkerIds.has(id) ||
      (
        run.floor === 8 &&
        run.mode === "victory" &&
        finalMigrationMarkerIds.has(id)
      ) ||
      (run.floor === 1 && isFloorOneChestMarker(id))
    )) ||
    !migrationMarkersFormPrefix(openedGateIds) ||
    !hasUniqueValues(openedGateIds) ||
    !(activeGateChallengeId === null || (
      typeof activeGateChallengeId === "string" &&
      GATE_CHALLENGE_IDS.includes(activeGateChallengeId as GateChallengeId) &&
      activeGateChallengeId === expectedChallengeId
    )) ||
    ((run.mode === "challenge") !== (activeGateChallengeId !== null)) ||
    (activeGateChallengeId !== null && openedGateIds.includes(challengeGateId)) ||
    typeof run.currentRoomId !== "string" ||
    !graph.nodes.some((node) => node.id === run.currentRoomId) ||
    !isPlayer(run.player, true) ||
    !Array.isArray(run.monsters) ||
    run.monsters.length !== expectedMonsterIds.length ||
    !run.monsters.every(isMonster) ||
    !hasUniqueValues(run.monsters.map((monster) => monster.id)) ||
    !run.monsters.every((monster) => monster.floor === run.floor) ||
    !run.monsters.every((monster) => (
      CURRENT_MONSTER_IDS_BY_FLOOR[run.floor as FloorNumber].includes(monster.id)
    )) ||
    !expectedMonsterIds.every((id) => run.monsters?.some((monster) => monster.id === id) ?? false) ||
    !run.monsters.every((monster) => isPositionInFloor(monster, mazeFloor)) ||
    !isCombat(run.combat) ||
    ((run.mode === "combat") !== (run.combat !== null)) ||
    (
      (activePracticeMonsterId === null) !== (activePracticeQuestionIds.length === 0) ||
      (activePracticeMonsterId !== null && (
        run.mode !== "combat" ||
        run.combat?.kind !== "ambush" ||
        run.combat.targetId !== activePracticeMonsterId
      ))
    ) ||
    !Array.isArray(run.visitedRoomIds) ||
    !run.visitedRoomIds.every((id) => typeof id === "string" && graph.nodes.some((node) => node.id === id)) ||
    !hasUniqueValues(run.visitedRoomIds) ||
    !run.visitedRoomIds.includes(run.currentRoomId) ||
    !Array.isArray(run.completedRoomIds) ||
    !run.completedRoomIds.every((id) => typeof id === "string" && graph.nodes.some((node) => node.id === id)) ||
    !hasUniqueValues(run.completedRoomIds) ||
    !run.completedRoomIds.every((id) => run.visitedRoomIds?.includes(id)) ||
    !Array.isArray(run.completedLessons) ||
    !run.completedLessons.every(isLessonId) ||
    !hasUniqueValues(run.completedLessons) ||
    !Array.isArray(run.relics) ||
    !run.relics.every(isRelic) ||
    !hasUniqueValues(run.relics.map((relic) => relic.id)) ||
    !isLoot(run.availableLoot) ||
    !isReward(run.claimableReward) ||
    (run.mode === "reward" && run.availableLoot === null && run.claimableReward === null) ||
    !isNonNegativeInteger(run.queryCount) ||
    !isNonNegativeInteger(run.totalMoves) ||
    !isNonNegativeInteger(run.stepsSinceEncounter) ||
    !isNonNegativeInteger(run.safeStepsRemaining) ||
    !isNonNegativeInteger(run.hintLevel) ||
    !Array.isArray(answerHistory) ||
    answerHistory.length > MAX_ANSWER_HISTORY ||
    !answerHistory.every(isAnswerAttemptRecord) ||
    !hasUniqueValues(answerHistory.map((record) => record.id)) ||
    !isNonNegativeInteger(battleSequence) ||
    !(reviewBattleId === null || (
      isPositiveInteger(reviewBattleId) &&
      reviewBattleId <= battleSequence
    )) ||
    answerHistory.some((record) => (
      record.battleId > battleSequence ||
      record.id > Number(run.queryCount) ||
      record.floor > Number(run.floor)
    )) ||
    (run.mode === "combat" && reviewBattleId === null) ||
    typeof run.banner !== "string"
  ) return false;
  const player = run.player;
  if (
    (run.mode === "defeat" && player.hp !== 0) ||
    (run.mode !== "defeat" && player.hp <= 0) ||
    (run.mode === "death-review" && run.combat !== null)
  ) return false;
  const floorLessons = lessonsForFloor(run.floor);
  if (!floorLessons.every((id) => run.monsters?.some((monster) => (
    monster.lessonId === id && monster.encounterType === "curriculum"
  )))) return false;
  if (!run.completedLessons.every((lesson) => floorLessons.includes(lesson))) return false;

  const allReachableCells = reachableMazeCells(mazeFloor, new Set(floorLessons));
  const unlockedReachableCells = reachableMazeCells(
    mazeFloor,
    new Set(run.completedLessons),
    new Set(openedGateIds),
  );
  if (
    !isFloorCell(player, mazeFloor) ||
    !unlockedReachableCells.has(positionKey(player)) ||
    !run.discoveredCells ||
    !Array.isArray(run.discoveredCells) ||
    !run.discoveredCells.every((cell) => isDiscoveredCell(cell, mazeFloor)) ||
    !hasUniqueValues(run.discoveredCells) ||
    !run.discoveredCells.includes(positionKey(player)) ||
    !run.worldActors ||
    !Array.isArray(run.worldActors) ||
    !run.groundItems ||
    !Array.isArray(run.groundItems)
  ) return false;

  const currentAnchor = mazeFloor.anchors[run.currentRoomId];
  if (!currentAnchor || !unlockedReachableCells.has(positionKey(currentAnchor))) return false;
  const playerZone = mazeFloor.zones.find((zone) => (
    player.x >= zone.x &&
    player.x < zone.x + zone.width &&
    player.y >= zone.y &&
    player.y < zone.y + zone.height
  ));
  if (playerZone && playerZone.roomNodeId !== run.currentRoomId) return false;
  if (!run.visitedRoomIds.every((roomId) => {
    const anchor = mazeFloor.anchors[roomId];
    return Boolean(anchor) && unlockedReachableCells.has(positionKey(anchor));
  })) return false;
  const activeCampfire = activeCampfireId
    ? campfires.find((entry) => entry.id === activeCampfireId) ?? null
    : null;
  const respawnCampfire = respawnCampfireId
    ? campfires.find((entry) => entry.id === respawnCampfireId) ?? null
    : null;
  if (
    (activeCampfire !== null && nearbyCampfire([activeCampfire], player) === null) ||
    (respawnCampfire !== null && !run.visitedRoomIds.includes(respawnCampfire.roomNodeId)) ||
    campfires.some((entry) => (
      positionKey(entry) === positionKey(player) ||
      mazeFloor.gates.some((gate) => positionKey(gate) === positionKey(entry))
    ))
  ) return false;

  const monstersById = new Map(run.monsters.map((monster) => [monster.id, monster]));
  if (
    !run.worldActors.every((actor) => (
      isWorldActor(
        actor,
        mazeFloor,
        graph,
        monstersById,
        allReachableCells,
        biomePlan,
      )
    )) ||
    !hasUniqueValues(run.worldActors.map((actor) => actor.monsterId)) ||
    !run.monsters
      .filter((monster) => monster.encounterType === "curriculum")
      .every((monster) => run.worldActors?.some((actor) => actor.monsterId === monster.id)) ||
    !run.groundItems.every((item) => (
      isGroundItem(item, mazeFloor, graph, allReachableCells)
    )) ||
    !hasUniqueValues(run.groundItems.map((item) => item.id))
  ) return false;
  const fireCells = new Set(campfires.map(positionKey));
  const safeCells = safeZoneCellKeys(mazeFloor, campfires);
  if (
    run.worldActors.some((actor) => safeCells.has(positionKey(actor))) ||
    run.groundItems.some((item) => fireCells.has(positionKey(item)))
  ) return false;
  if (
    !Array.isArray(run.lootBundles) ||
    !run.lootBundles.every((bundle) => isLootBundle(
      bundle,
      mazeFloor,
      graph,
      allReachableCells,
    )) ||
    !hasUniqueValues(run.lootBundles.map((bundle) => bundle.id)) ||
    !Array.isArray(run.equipmentInventory) ||
    run.equipmentInventory.length > 12 ||
    !run.equipmentInventory.every(isEquipmentItem) ||
    !hasUniqueValues(run.equipmentInventory.map((item) => item.instanceId)) ||
    !Array.isArray(run.consumables) ||
    run.consumables.length > 3 ||
    !run.consumables.every(isConsumableStack) ||
    !hasUniqueValues(run.consumables.map((stack) => stack.item.id)) ||
    !Array.isArray(run.keyItems) ||
    !run.keyItems.every((item) => typeof item === "string" && item.length > 0) ||
    !hasUniqueValues(run.keyItems) ||
    !Array.isArray(run.acquiredUniqueItemIds) ||
    !run.acquiredUniqueItemIds.every((item) => typeof item === "string" && item.length > 0) ||
    !hasUniqueValues(run.acquiredUniqueItemIds) ||
    !run.acquiredUniqueItemIds.includes(player.weapon.id) ||
    (player.armor !== null && !run.acquiredUniqueItemIds.includes(player.armor.id)) ||
    run.equipmentInventory.some((item) => (
      !run.acquiredUniqueItemIds?.includes(item.weapon?.id ?? item.armor?.id ?? "")
    )) ||
    guidedMap.shortcuts.some((shortcut) => (
      openedGateIds.includes(shortcut.id) &&
      (
        !run.keyItems?.includes(shortcut.keyId) ||
        shortcut.requires.some((lesson) => !run.completedLessons?.includes(lesson))
      )
    ))
  ) return false;
  const activeBundle = activeLootBundleId
    ? run.lootBundles.find((bundle) => bundle.id === activeLootBundleId) ?? null
    : null;
  if (
    (activeLootBundleId !== null && !activeBundle) ||
    (activeBundle !== null && (
      Math.abs(activeBundle.x - player.x) + Math.abs(activeBundle.y - player.y) > 1
    )) ||
    run.lootBundles.some((bundle) => campfires.some(
      (campfire) => positionKey(bundle) === positionKey(campfire),
    ))
  ) return false;

  if (!run.completedLessons.every((lessonId) => (
    run.monsters?.some((monster) => (
      monster.lessonId === lessonId &&
      monster.encounterType === "curriculum" &&
      monster.hp === 0
    ))
  ))) return false;
  if (!run.monsters.every((monster) => (
    monster.hp > 0 ||
    monster.encounterType === "ambush" ||
    run.completedLessons?.includes(monster.lessonId)
  ))) return false;

  if (run.combat) {
    const target = monstersById.get(run.combat.targetId);
    const actor = run.worldActors.find((entry) => entry.monsterId === run.combat?.targetId);
    if (!target || target.hp <= 0 || target.encounterType !== run.combat.kind) return false;
    if (run.combat.kind === "curriculum" && (!actor || actor.roomNodeId !== run.currentRoomId)) {
      return false;
    }
  }

  const looseWeapon = run.groundItems.find((item) => item.weapon);
  if (
    (run.availableLoot === null) !== (looseWeapon === undefined) ||
    (run.availableLoot !== null && (
      run.availableLoot.x !== looseWeapon?.x ||
      run.availableLoot.y !== looseWeapon?.y ||
      run.availableLoot.weapon.id !== looseWeapon?.weapon?.id
    ))
  ) return false;
  const interactiveReward = run.groundItems.find((item) => {
    if (item.sourceRoomId !== run.currentRoomId || item.collection !== "interact") {
      return false;
    }
    const room = graph.nodes.find((node) => node.id === item.sourceRoomId);
    return !room?.lessonId || run.completedLessons?.includes(room.lessonId);
  });
  if (
    (run.claimableReward === null) !== (interactiveReward?.rewardId == null) ||
    (
      run.claimableReward !== null &&
      run.claimableReward.id !== interactiveReward?.rewardId
    )
  ) return false;
  return true;
}
