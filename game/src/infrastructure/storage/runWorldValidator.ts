/**
 * Run 的房间图、物理地图和世界实体校验。
 */
import {
  MAZE_CHUNK_SIZE,
  MAZE_HEIGHT,
  MAZE_WIDTH,
  mazeLayoutName,
  type MazeFloor,
} from "../../domain/exploration/mazeGenerator";
import { validateMazeFloor } from "../../domain/exploration/mazeValidation";
import { generateCampfires } from "../../domain/exploration/campfire";
import type { BiomePlan } from "../../domain/exploration/biome";
import { isFloorOneChestMarker } from "../../domain/exploration/floorOneTreasure";
import type { WorldActor } from "../../domain/exploration/monsterRoaming";
import { CURRENT_MONSTER_IDS_BY_FLOOR } from "../../content/world/monsterIds";
import {
  stableStringHash,
  validateRoomGraph,
  type FloorNumber,
  type RoomGraph,
  type RoomReward,
  type RoomType,
} from "../../domain/progression/runGraph";
import type {
  AnswerAttemptRecord,
  Campfire,
  GroundItem,
  LootBundle,
  Monster,
} from "../../domain/shared/types";
import {
  ACTOR_BEHAVIORS,
  ANSWER_RESULTS,
  BATTLE_OUTCOMES,
  DECORATION_KINDS,
  ITEM_COLLECTIONS,
  ITEM_KINDS,
  ROOM_REWARDS,
  ROOM_TYPES,
  hasUniqueValues,
  isFiniteNumber,
  isFloorCell,
  isLessonId,
  isLootItem,
  isNonNegativeInteger,
  isPosition,
  isPositionInFloor,
  isPositiveInteger,
  isRecord,
  isWeapon,
  positionKey,
} from "./runDataValidators";

export function isLootBundle(
  value: unknown,
  floor: MazeFloor,
  graph: RoomGraph,
  reachableCells: ReadonlySet<string>,
): value is LootBundle {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (value.sourceMonsterId === null || isPositiveInteger(value.sourceMonsterId)) &&
    typeof value.sourceRoomId === "string" &&
    graph.nodes.some((node) => node.id === value.sourceRoomId) &&
    value.floor === graph.floor &&
    isFloorCell(value, floor) &&
    reachableCells.has(positionKey(value)) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.length <= 4 &&
    value.items.every(isLootItem) &&
    hasUniqueValues(value.items.map((item) => item.dropId)) &&
    value.items.filter((item) => item.rewardId !== "floor-key").length <= 3
  );
}

export function isValidGraph(value: unknown): value is RoomGraph {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    (
      value.floor !== 1 &&
      value.floor !== 2 &&
      value.floor !== 3 &&
      value.floor !== 4 &&
      value.floor !== 5 &&
      value.floor !== 6 &&
      value.floor !== 7 &&
      value.floor !== 8
    ) ||
    typeof value.seed !== "string" ||
    value.seed.length === 0 ||
    typeof value.entryId !== "string" ||
    typeof value.bossId !== "string" ||
    !Array.isArray(value.nodes) ||
    !value.nodes.every((node) => (
      isRecord(node) &&
      typeof node.id === "string" &&
      node.id.length > 0 &&
      typeof node.type === "string" &&
      ROOM_TYPES.includes(node.type as RoomType) &&
      typeof node.title === "string" &&
      isNonNegativeInteger(node.depth) &&
      isFiniteNumber(node.lane) &&
      typeof node.required === "boolean" &&
      (node.lessonId === undefined || isLessonId(node.lessonId)) &&
      Array.isArray(node.prerequisiteLessons) &&
      node.prerequisiteLessons.every(isLessonId) &&
      (node.reward === null || (
        typeof node.reward === "string" &&
        ROOM_REWARDS.includes(node.reward as RoomReward)
      )) &&
      Array.isArray(node.next) &&
      node.next.every((id) => typeof id === "string")
    ))
  ) return false;
  try {
    return validateRoomGraph(value as unknown as RoomGraph).valid;
  } catch {
    return false;
  }
}

export function isMazeFloor(value: unknown, graph: RoomGraph): value is MazeFloor {
  if (
    !isRecord(value) ||
    value.version !== 4 ||
    value.generatorVersion !== 7 ||
    value.seed !== graph.seed ||
    value.width !== MAZE_WIDTH ||
    value.height !== MAZE_HEIGHT ||
    value.chunkSize !== MAZE_CHUNK_SIZE ||
    !Array.isArray(value.tiles) ||
    value.tiles.length !== MAZE_HEIGHT ||
    !value.tiles.every((row) => (
      typeof row === "string" &&
      row.length === MAZE_WIDTH &&
      !/[^#.]/.test(row)
    )) ||
    !isPosition(value.spawn) ||
    !Array.isArray(value.zones) ||
    !Array.isArray(value.gates) ||
    !isRecord(value.anchors) ||
    !Array.isArray(value.decorations) ||
    !isNonNegativeInteger(value.topologyHash)
  ) {
    return false;
  }

  const floor = value as unknown as MazeFloor;
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!isFloorCell(floor.spawn, floor)) return false;

  if (
    floor.zones.length !== graph.nodes.length ||
    !floor.zones.every((zone) => {
      if (!isRecord(zone) || typeof zone.roomNodeId !== "string") return false;
      const node = graphNodes.get(zone.roomNodeId);
      if (
        !node ||
        zone.id !== `zone:${zone.roomNodeId}` ||
        zone.type !== node.type ||
        zone.lessonId !== node.lessonId ||
        !isPositionInFloor(zone, floor) ||
        !isPositiveInteger(zone.width) ||
        !isPositiveInteger(zone.height) ||
        zone.x + zone.width > floor.width ||
        zone.y + zone.height > floor.height ||
        !isFloorCell(zone.center, floor)
      ) return false;
      return (
        zone.center.x >= zone.x &&
        zone.center.x < zone.x + zone.width &&
        zone.center.y >= zone.y &&
        zone.center.y < zone.y + zone.height
      );
    }) ||
    !hasUniqueValues(floor.zones.map((zone) => zone.id)) ||
    !hasUniqueValues(floor.zones.map((zone) => zone.roomNodeId))
  ) {
    return false;
  }

  if (
    floor.gates.length !== graph.nodes.length ||
    !floor.gates.every((gate) => {
      if (!isRecord(gate) || typeof gate.roomNodeId !== "string") return false;
      const node = graphNodes.get(gate.roomNodeId);
      const zone = floor.zones.find((entry) => entry.roomNodeId === gate.roomNodeId);
      if (
        !node ||
        !zone ||
        gate.id !== `gate:${gate.roomNodeId}` ||
        !isFloorCell(gate, floor) ||
        !isFloorCell(gate.outside, floor) ||
        !Array.isArray(gate.requires) ||
        !gate.requires.every(isLessonId) ||
        gate.requires.join("|") !== node.prerequisiteLessons.join("|")
      ) return false;
      const onZoneBoundary = (
        (gate.x === zone.x || gate.x === zone.x + zone.width - 1) &&
        gate.y >= zone.y && gate.y < zone.y + zone.height
      ) || (
        (gate.y === zone.y || gate.y === zone.y + zone.height - 1) &&
        gate.x >= zone.x && gate.x < zone.x + zone.width
      );
      const outsideIsAdjacent = (
        Math.abs(gate.x - gate.outside.x) + Math.abs(gate.y - gate.outside.y) === 1
      );
      return onZoneBoundary && outsideIsAdjacent;
    }) ||
    !hasUniqueValues(floor.gates.map((gate) => gate.id)) ||
    !hasUniqueValues(floor.gates.map((gate) => gate.roomNodeId))
  ) {
    return false;
  }

  const anchorEntries = Object.entries(floor.anchors);
  if (
    anchorEntries.length !== graph.nodes.length ||
    !anchorEntries.every(([roomId, anchor]) => {
      const zone = floor.zones.find((entry) => entry.roomNodeId === roomId);
      return Boolean(graphNodes.get(roomId)) &&
        isFloorCell(anchor, floor) &&
        anchor.x === zone?.center.x &&
        anchor.y === zone?.center.y;
    })
  ) {
    return false;
  }
  const entryAnchor = floor.anchors[graph.entryId];
  if (
    !entryAnchor ||
    floor.spawn.x !== entryAnchor.x ||
    floor.spawn.y !== entryAnchor.y
  ) {
    return false;
  }

  if (
    !floor.decorations.every((decoration) => (
      isRecord(decoration) &&
      typeof decoration.id === "string" &&
      decoration.id.length > 0 &&
      typeof decoration.kind === "string" &&
      DECORATION_KINDS.includes(decoration.kind as (typeof DECORATION_KINDS)[number]) &&
      isFloorCell(decoration, floor)
    )) ||
    !hasUniqueValues(floor.decorations.map((decoration) => decoration.id))
  ) {
    return false;
  }

  const topologyBody = `${floor.tiles.join("|")}|${floor.gates
    .map((gate) => `${gate.roomNodeId}:${gate.x}:${gate.y}`)
    .join("|")}`;
  const layoutName = mazeLayoutName(graph.floor);
  if (floor.topologyHash !== stableStringHash(`${layoutName}|${topologyBody}`)) {
    return false;
  }

  try {
    const validation = validateMazeFloor(floor, graph);
    if (!validation.valid) {
      return false;
    }
    const floorTileCount = floor.tiles.reduce(
      (total, row) => total + [...row].filter((tile) => tile === ".").length,
      0,
    );
    return validation.reachableTiles === floorTileCount;
  } catch {
    return false;
  }
}

export function isWorldActor(
  value: unknown,
  floor: MazeFloor,
  graph: RoomGraph,
  monstersById: ReadonlyMap<number, Monster>,
  reachableCells: ReadonlySet<string>,
  biomePlan: BiomePlan | null,
): value is WorldActor {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.monsterId) ||
    typeof value.roomNodeId !== "string" ||
    !isFloorCell(value, floor) ||
    !isFloorCell(value.home, floor) ||
    typeof value.behavior !== "string" ||
    !ACTOR_BEHAVIORS.includes(value.behavior as WorldActor["behavior"]) ||
    !isNonNegativeInteger(value.roamRadius) ||
    !isNonNegativeInteger(value.moveTick) ||
    !reachableCells.has(positionKey(value)) ||
    !reachableCells.has(positionKey(value.home))
  ) return false;
  const monster = monstersById.get(value.monsterId);
  const room = graph.nodes.find((node) => node.id === value.roomNodeId);
  const anchor = floor.anchors[value.roomNodeId];
  if (!monster || !room || !anchor || room.lessonId !== monster.lessonId) return false;
  const areaBossRegion = biomePlan?.regions.find(
    (region) => region.areaBossId === monster.id,
  );
  if (areaBossRegion) {
    const expected = areaBossRegion.areaBossPosition;
    return Boolean(expected) &&
      value.behavior === "anchored" &&
      value.roamRadius === 0 &&
      value.x === expected?.x &&
      value.y === expected?.y &&
      value.home.x === expected?.x &&
      value.home.y === expected?.y;
  }
  return value.home.x === anchor.x &&
    value.home.y === anchor.y &&
    Math.abs(value.x - value.home.x) + Math.abs(value.y - value.home.y) <= value.roamRadius;
}

export function isGroundItem(
  value: unknown,
  floor: MazeFloor,
  graph: RoomGraph,
  reachableCells: ReadonlySet<string>,
): value is GroundItem {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.sourceRoomId !== "string" ||
    !graph.nodes.some((node) => node.id === value.sourceRoomId) ||
    !isFloorCell(value, floor) ||
    !reachableCells.has(positionKey(value)) ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.kind !== "string" ||
    !ITEM_KINDS.includes(value.kind as GroundItem["kind"]) ||
    typeof value.collection !== "string" ||
    !ITEM_COLLECTIONS.includes(value.collection as GroundItem["collection"]) ||
    !(value.rewardId === null || (
      typeof value.rewardId === "string" &&
      ROOM_REWARDS.includes(value.rewardId as RoomReward)
    )) ||
    !(value.weapon === undefined || isWeapon(value.weapon))
  ) return false;
  const isFloorOneChest = graph.floor === 1 && isFloorOneChestMarker(value.id);
  return (
    isFloorOneChest ||
    value.rewardId !== null ||
    value.weapon !== undefined
  ) && (value.weapon === undefined || value.kind === "weapon");
}

export function isDiscoveredCell(value: unknown, floor: MazeFloor): value is string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*):(0|[1-9]\d*)$/.test(value)) {
    return false;
  }
  const [x, y] = value.split(":").map(Number);
  return x < floor.width && y < floor.height;
}

export function isAnswerAttemptRecord(value: unknown): value is AnswerAttemptRecord {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    isPositiveInteger(value.battleId) &&
    (
      value.floor === 1 ||
      value.floor === 2 ||
      value.floor === 3 ||
      value.floor === 4 ||
      value.floor === 5 ||
      value.floor === 6 ||
      value.floor === 7 ||
      value.floor === 8
    ) &&
    isPositiveInteger(value.monsterId) &&
    CURRENT_MONSTER_IDS_BY_FLOOR[value.floor as FloorNumber].includes(value.monsterId) &&
    typeof value.monsterName === "string" &&
    value.monsterName.length > 0 &&
    isLessonId(value.lessonId) &&
    typeof value.stageId === "string" &&
    value.stageId.length > 0 &&
    typeof value.stageObjective === "string" &&
    value.stageObjective.length > 0 &&
    isPositiveInteger(value.round) &&
    typeof value.sql === "string" &&
    typeof value.answerSql === "string" &&
    value.answerSql.length > 0 &&
    typeof value.result === "string" &&
    ANSWER_RESULTS.includes(value.result as AnswerAttemptRecord["result"]) &&
    typeof value.outcome === "string" &&
    BATTLE_OUTCOMES.includes(value.outcome as AnswerAttemptRecord["outcome"]) &&
    typeof value.feedback === "string" &&
    isNonNegativeInteger(value.hintLevel) &&
    (value.questionId === undefined || (
      typeof value.questionId === "string" &&
      /^question-bank-v\d+:f[1-8]:(?:current|review):t\d{2}:v[1-8]$/u.test(value.questionId)
    ))
  );
}

function isCampfire(value: unknown, floor: MazeFloor): value is Campfire {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.phase === "front" || value.phase === "middle" || value.phase === "rear") &&
    typeof value.roomNodeId === "string" &&
    isFloorCell(value, floor) &&
    isFloorCell(value.restPosition, floor) &&
    Math.abs(value.x - value.restPosition.x) +
      Math.abs(value.y - value.restPosition.y) === 1
  );
}

export function validatedCampfires(
  value: unknown,
  graph: RoomGraph,
  floor: MazeFloor,
): Campfire[] | null {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((entry) => isCampfire(entry, floor))
  ) {
    return null;
  }
  const campfires = value as Campfire[];
  if (
    !hasUniqueValues(campfires.map((campfire) => campfire.id)) ||
    !hasUniqueValues(campfires.map((campfire) => campfire.phase)) ||
    !hasUniqueValues(campfires.map((campfire) => campfire.roomNodeId)) ||
    !hasUniqueValues(campfires.map(positionKey))
  ) return null;
  let expected: Campfire[];
  try {
    expected = generateCampfires(graph, floor);
  } catch {
    return null;
  }
  return JSON.stringify(campfires) === JSON.stringify(expected) ? campfires : null;
}
