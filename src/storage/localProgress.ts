import {
  MAZE_CHUNK_SIZE,
  MAZE_HEIGHT,
  MAZE_WIDTH,
  mazeTileAt,
  type MazeFloor,
} from "../domain/mazeGenerator";
import {
  reachableMazeCells,
  validateMazeFloor,
} from "../domain/mazeValidation";
import type { WorldActor } from "../domain/monsterRoaming";
import {
  lessonsForFloor,
  stableStringHash,
  validateRoomGraph,
  type RoomGraph,
  type RoomReward,
  type RoomType,
} from "../domain/runGraph";
import type {
  ClaimableReward,
  CombatState,
  GateChallengeId,
  GroundItem,
  LessonId,
  LootDrop,
  Monster,
  PlayerState,
  ProfileProgress,
  Relic,
  SavedRun,
  Weapon,
} from "../domain/types";

export const RUN_SAVE_KEY = "select-from-dungeon:run:v5";
export const PROFILE_SAVE_KEY = "select-from-dungeon:profile:v2";
const LEGACY_RUN_SAVE_KEY = "select-from-dungeon:run:v4";
const LEGACY_PROFILE_SAVE_KEY = "select-from-dungeon:profile:v1";
// v4 is read once as a compatible baseline and upgraded in memory. Legacy keys
// are never deleted, so v5 recovery cannot mutate a user's previous Run.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const LESSON_IDS: readonly LessonId[] = [
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

const PLAY_MODES = [
  "explore",
  "challenge",
  "combat",
  "reward",
  "transition",
  "victory",
  "defeat",
] as const;
const GATE_CHALLENGE_IDS: readonly GateChallengeId[] = [
  "aggregate-breach",
  "relation-breach",
];
const WEAPON_IDS = [
  "data-blade",
  "filter-bow",
  "null-lantern",
  "aggregate-hammer",
  "sort-saber",
  "join-chain",
] as const;
const MONSTER_KINDS = [
  "projection-slime",
  "filter-hound",
  "null-ghost",
  "aggregate-golem",
  "sort-drake",
  "distinct-mimic",
  "join-spider",
  "left-join-wraith",
  "relation-titan",
] as const;
const MONSTER_RANKS = ["normal", "elite", "boss"] as const;
const ENCOUNTER_TYPES = ["curriculum", "ambush"] as const;
const COMBAT_KINDS = ["curriculum", "ambush"] as const;
const RELIC_IDS = ["cache-chip", "schema-eye", "rollback-heart", "query-lens"] as const;
const REWARD_KINDS = ["heal", "cool", "relic", "weapon", "key", "event"] as const;
const ROOM_TYPES = ["entry", "tutorial", "lesson", "rest", "treasure", "event", "elite", "boss"] as const;
const ROOM_REWARDS = [
  "data-blade",
  "filter-rune",
  "null-lantern",
  "aggregate-hammer",
  "sort-saber",
  "join-chain",
  "restore-12-hp",
  "restore-20-hp",
  "cool-8-heat",
  "cool-12-heat",
  "hint-token",
  "schema-shard",
  "weapon-cache",
  "reroll-token",
  "elite-query-lens",
  "elite-transaction-shield",
  "floor-key",
] as const satisfies readonly RoomReward[];
const ACTOR_BEHAVIORS = ["wander", "guard", "anchored"] as const;
const ITEM_KINDS = ["weapon", "relic", "heal", "event", "key"] as const;
const ITEM_COLLECTIONS = ["touch", "interact"] as const;
const DECORATION_KINDS = ["torch", "rubble", "rune"] as const;

export function createEmptyProfile(): ProfileProgress {
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

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function safeGetItem(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function isLessonId(value: unknown): value is LessonId {
  return typeof value === "string" && LESSON_IDS.includes(value as LessonId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isPosition(
  value: unknown,
): value is Record<string, unknown> & { x: number; y: number } {
  return isRecord(value) && isNonNegativeInteger(value.x) && isNonNegativeInteger(value.y);
}

function isPositionInFloor(
  value: unknown,
  floor: MazeFloor,
): value is Record<string, unknown> & { x: number; y: number } {
  return (
    isPosition(value) &&
    value.x < floor.width &&
    value.y < floor.height
  );
}

function isFloorCell(
  value: unknown,
  floor: MazeFloor,
): value is Record<string, unknown> & { x: number; y: number } {
  return isPositionInFloor(value, floor) && mazeTileAt(floor, value.x, value.y) === ".";
}

function positionKey(value: { x: number; y: number }): string {
  return `${value.x}:${value.y}`;
}

function hasUniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function isWeapon(value: unknown): value is Weapon {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    WEAPON_IDS.includes(value.id as Weapon["id"]) &&
    typeof value.name === "string" &&
    isFiniteNumber(value.damage) &&
    isFiniteNumber(value.heatReduction) &&
    typeof value.description === "string"
  );
}

function isPlayer(value: unknown): value is PlayerState {
  if (!isRecord(value) || !isNonNegativeInteger(value.xp)) return false;
  const xp = value.xp;
  const levelThresholds = [0, 2, 4, 6, 8, 12, 16, 20, 24] as const;
  const expectedLevel = levelThresholds.reduce(
    (level, threshold, index) => xp >= threshold ? index + 1 : level,
    1,
  );
  return (
    isPosition(value) &&
    isFiniteNumber(value.hp) &&
    isFiniteNumber(value.maxHp) &&
    value.maxHp > 0 &&
    value.hp >= 0 &&
    value.hp <= value.maxHp &&
    value.level === expectedLevel &&
    isFiniteNumber(value.heat) &&
    value.heat >= 0 &&
    isWeapon(value.weapon)
  );
}

function isMonster(value: unknown): value is Monster {
  return (
    isPosition(value) &&
    (value.floor === 1 || value.floor === 2) &&
    isNonNegativeInteger(value.id) &&
    isLessonId(value.lessonId) &&
    isNonNegativeInteger(value.roomId) &&
    typeof value.name === "string" &&
    typeof value.species === "string" &&
    typeof value.kind === "string" &&
    MONSTER_KINDS.includes(value.kind as Monster["kind"]) &&
    isFiniteNumber(value.hp) &&
    isFiniteNumber(value.maxHp) &&
    value.maxHp > 0 &&
    value.hp >= 0 &&
    value.hp <= value.maxHp &&
    isFiniteNumber(value.armor) &&
    isFiniteNumber(value.damage) &&
    typeof value.attackName === "string" &&
    typeof value.status === "string" &&
    (typeof value.weakness === "string" || value.weakness === null) &&
    (isFiniteNumber(value.masterId) || value.masterId === null) &&
    typeof value.isBoss === "boolean" &&
    typeof value.rank === "string" &&
    MONSTER_RANKS.includes(value.rank as Monster["rank"]) &&
    typeof value.encounterType === "string" &&
    ENCOUNTER_TYPES.includes(value.encounterType as Monster["encounterType"])
  );
}

function isCombat(value: unknown): value is CombatState | null {
  if (value === null) return true;
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.targetId) &&
    typeof value.kind === "string" &&
    COMBAT_KINDS.includes(value.kind as CombatState["kind"]) &&
    isNonNegativeInteger(value.round) &&
    isNonNegativeInteger(value.successStep) &&
    isRecord(value.intent) &&
    typeof value.intent.name === "string" &&
    isFiniteNumber(value.intent.damage) &&
    Array.isArray(value.intent.locks) &&
    value.intent.locks.every((lock) => typeof lock === "string")
  );
}

function isRelic(value: unknown): value is Relic {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    RELIC_IDS.includes(value.id as Relic["id"]) &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    isFiniteNumber(value.heatReduction)
  );
}

function isLoot(value: unknown): value is LootDrop | null {
  return value === null || (isPosition(value) && isWeapon(value.weapon));
}

function isReward(value: unknown): value is ClaimableReward | null {
  return value === null || (
    isRecord(value) &&
    typeof value.id === "string" &&
    ROOM_REWARDS.includes(value.id as RoomReward) &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.kind === "string" &&
    REWARD_KINDS.includes(value.kind as ClaimableReward["kind"])
  );
}

function isValidGraph(value: unknown): value is RoomGraph {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    (value.floor !== 1 && value.floor !== 2) ||
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

function isMazeFloor(value: unknown, graph: RoomGraph): value is MazeFloor {
  if (
    !isRecord(value) ||
    value.version !== 4 ||
    value.generatorVersion !== 4 ||
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
  ) return false;

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
  ) return false;

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
  ) return false;

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
  ) return false;
  const entryAnchor = floor.anchors[graph.entryId];
  if (
    !entryAnchor ||
    floor.spawn.x !== entryAnchor.x ||
    floor.spawn.y !== entryAnchor.y
  ) return false;

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
  ) return false;

  const expectedTopologyHash = stableStringHash(
    `${floor.tiles.join("|")}|${floor.gates
      .map((gate) => `${gate.roomNodeId}:${gate.x}:${gate.y}`)
      .join("|")}`,
  );
  if (floor.topologyHash !== expectedTopologyHash) return false;

  try {
    const validation = validateMazeFloor(floor, graph);
    if (!validation.valid) return false;
    const floorTileCount = floor.tiles.reduce(
      (total, row) => total + [...row].filter((tile) => tile === ".").length,
      0,
    );
    return validation.reachableTiles === floorTileCount;
  } catch {
    return false;
  }
}

function isWorldActor(
  value: unknown,
  floor: MazeFloor,
  graph: RoomGraph,
  monstersById: ReadonlyMap<number, Monster>,
  reachableCells: ReadonlySet<string>,
): value is WorldActor {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.monsterId) ||
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
  return Boolean(monster && room && anchor) &&
    room?.lessonId === monster?.lessonId &&
    value.home.x === anchor?.x &&
    value.home.y === anchor?.y &&
    Math.abs(value.x - value.home.x) + Math.abs(value.y - value.home.y) <= value.roamRadius;
}

function isGroundItem(
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
  return (value.rewardId !== null || value.weapon !== undefined) &&
    (value.weapon === undefined || value.kind === "weapon");
}

function isDiscoveredCell(value: unknown, floor: MazeFloor): value is string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*):(0|[1-9]\d*)$/.test(value)) {
    return false;
  }
  const [x, y] = value.split(":").map(Number);
  return x < floor.width && y < floor.height;
}

function isSavedRunVersion(value: unknown, version: 4 | 5): boolean {
  if (!isRecord(value)) return false;
  const run = value as Partial<SavedRun>;
  const candidateVersion: unknown = run.version;
  if (
    candidateVersion !== version ||
    run.generatorVersion !== 4 ||
    (run.floor !== 1 && run.floor !== 2) ||
    !isValidGraph(run.graph)
  ) return false;
  const graph = run.graph;
  if (run.floor !== graph.floor) return false;
  if (!isMazeFloor(run.mazeFloor, graph)) return false;
  const mazeFloor = run.mazeFloor;
  const challengeGateId = `gate:${graph.bossId}`;
  const expectedChallengeId: GateChallengeId = run.floor === 1
    ? "aggregate-breach"
    : "relation-breach";
  const openedGateIds = version === 5 ? run.openedGateIds : [];
  const activeGateChallengeId = version === 5 ? run.activeGateChallengeId : null;
  if (
    !PLAY_MODES.includes(run.mode as (typeof PLAY_MODES)[number]) ||
    (version === 4 && run.mode === "challenge") ||
    !Array.isArray(openedGateIds) ||
    !openedGateIds.every((id) => id === challengeGateId) ||
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
    !isPlayer(run.player) ||
    !Array.isArray(run.monsters) ||
    !run.monsters.every(isMonster) ||
    !hasUniqueValues(run.monsters.map((monster) => monster.id)) ||
    !run.monsters.every((monster) => monster.floor === run.floor) ||
    !run.monsters.every((monster) => isPositionInFloor(monster, mazeFloor)) ||
    !isCombat(run.combat) ||
    ((run.mode === "combat") !== (run.combat !== null)) ||
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
    typeof run.banner !== "string"
  ) return false;
  const player = run.player;
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

  const monstersById = new Map(run.monsters.map((monster) => [monster.id, monster]));
  if (
    !run.worldActors.every((actor) => (
      isWorldActor(actor, mazeFloor, graph, monstersById, allReachableCells)
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
  const interactiveReward = run.groundItems.find((item) => (
    item.sourceRoomId === run.currentRoomId && item.collection === "interact"
  ));
  if (
    (run.claimableReward === null) !== (interactiveReward?.rewardId == null) ||
    (run.claimableReward !== null && run.claimableReward.id !== interactiveReward?.rewardId)
  ) return false;
  return true;
}

export function isSavedRun(value: unknown): value is SavedRun {
  return isSavedRunVersion(value, 5);
}

function migrateLegacyRun(value: unknown): SavedRun | null {
  if (!isSavedRunVersion(value, 4)) return null;
  const legacy = value as Omit<
    SavedRun,
    "version" | "openedGateIds" | "activeGateChallengeId"
  > & { version: 4 };
  return {
    ...legacy,
    version: 5,
    openedGateIds: [],
    activeGateChallengeId: null,
  };
}

export function isProfileProgress(value: unknown): value is ProfileProgress {
  if (!isRecord(value)) return false;
  const profile = value as Partial<ProfileProgress>;
  return (
    profile.version === 2 &&
    Array.isArray(profile.masteredLessons) &&
    profile.masteredLessons.every(isLessonId) &&
    Boolean(profile.attempts) &&
    LESSON_IDS.every((id) => isNonNegativeInteger(profile.attempts?.[id])) &&
    isNonNegativeInteger(profile.victories) &&
    (profile.bestRunQueries === null || isNonNegativeInteger(profile.bestRunQueries))
  );
}

function migrateLegacyProfile(value: unknown): ProfileProgress | null {
  const legacyLessonIds = ["select", "where", "is-null", "group-by", "having"] as const;
  if (!isRecord(value)) return null;
  const attempts = isRecord(value.attempts) ? value.attempts : null;
  if (
    value.version !== 1 ||
    !Array.isArray(value.masteredLessons) ||
    !value.masteredLessons.every((lesson) => (
      typeof lesson === "string" &&
      legacyLessonIds.includes(lesson as (typeof legacyLessonIds)[number])
    )) ||
    !attempts ||
    !legacyLessonIds.every(
      (lesson) => isNonNegativeInteger(attempts[lesson]),
    ) ||
    !isNonNegativeInteger(value.victories) ||
    !(value.bestRunQueries === null || isNonNegativeInteger(value.bestRunQueries))
  ) return null;
  const migrated = createEmptyProfile();
  migrated.masteredLessons = [...value.masteredLessons] as LessonId[];
  legacyLessonIds.forEach((lesson) => {
    migrated.attempts[lesson] = Number(attempts[lesson]);
  });
  migrated.victories = value.victories;
  migrated.bestRunQueries = value.bestRunQueries;
  return migrated;
}

export function loadRun(storage: StorageLike): SavedRun | null {
  const value = parseJson(safeGetItem(storage, RUN_SAVE_KEY));
  if (isSavedRun(value)) return value;
  return migrateLegacyRun(parseJson(safeGetItem(storage, LEGACY_RUN_SAVE_KEY)));
}

export function loadProfile(storage: StorageLike): ProfileProgress {
  const value = parseJson(safeGetItem(storage, PROFILE_SAVE_KEY));
  if (isProfileProgress(value)) return value;
  return migrateLegacyProfile(parseJson(safeGetItem(storage, LEGACY_PROFILE_SAVE_KEY)))
    ?? createEmptyProfile();
}

export function saveRun(storage: StorageLike, run: SavedRun): void {
  try {
    storage.setItem(RUN_SAVE_KEY, JSON.stringify(run));
  } catch {
    // Sandboxed iframes and privacy modes may reject localStorage writes.
  }
}

export function saveProfile(storage: StorageLike, profile: ProfileProgress): boolean {
  try {
    storage.setItem(PROFILE_SAVE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    // The in-memory GameSession stays playable without persistence.
    return false;
  }
}

/**
 * Returns the confirmed persisted JSON. A failed write deliberately keeps the
 * previous value so a later debounce, visibility change, or pagehide can retry.
 */
export function persistProfileIfChanged(
  storage: StorageLike,
  profile: ProfileProgress,
  lastPersistedJson: string,
): string {
  const nextJson = JSON.stringify(profile);
  if (nextJson === lastPersistedJson) return lastPersistedJson;
  return saveProfile(storage, profile) ? nextJson : lastPersistedJson;
}

export function clearRun(storage: StorageLike): void {
  try {
    storage.removeItem(RUN_SAVE_KEY);
  } catch {
    // A blocked storage area already behaves like an empty persisted Run.
  }
}

export function createRunSeed(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `${values[0].toString(36)}-${values[1].toString(36)}`;
  }
  return `castle-${Date.now().toString(36)}`;
}
