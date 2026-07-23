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
import {
  generateCampfires,
  nearbyCampfire,
  safeZoneCellKeys,
} from "../domain/campfire";
import {
  generateGuidedMapPlan,
  validateGuidedMapPlan,
} from "../domain/guidedMap";
import {
  generateBiomePlan,
  validateBiomePlan,
  type BiomePlan,
} from "../domain/biome";
import {
  createCampaignProgress,
  isCampaignProgress,
} from "../domain/campaign";
import type { WorldActor } from "../domain/monsterRoaming";
import {
  lessonsForFloor,
  stableStringHash,
  validateRoomGraph,
  type RoomGraph,
  type RoomReward,
  type RoomType,
} from "../domain/runGraph";
import { MAX_ANSWER_HISTORY } from "../domain/types";
import type {
  AnswerAttemptRecord,
  Armor,
  Campfire,
  ClaimableReward,
  CombatState,
  Consumable,
  ConsumableStack,
  EquipmentItem,
  GateChallengeId,
  GroundItem,
  LessonId,
  LootDrop,
  LootBundle,
  LootItem,
  Monster,
  PlayerState,
  ProfileProgress,
  Relic,
  SavedRun,
  Weapon,
} from "../domain/types";

export const RUN_SAVE_KEY = "select-from-dungeon:run:v9";
export const PROFILE_SAVE_KEY = "select-from-dungeon:profile:v2";
const LEGACY_RUN_SAVE_KEY = "select-from-dungeon:run:v8";
const OLDER_RUN_SAVE_KEY = "select-from-dungeon:run:v7";
const OLDEST_RUN_SAVE_KEY = "select-from-dungeon:run:v6";
const ANCIENT_RUN_SAVE_KEY = "select-from-dungeon:run:v5";
const ARCHAIC_RUN_SAVE_KEY = "select-from-dungeon:run:v4";
const LEGACY_PROFILE_SAVE_KEY = "select-from-dungeon:profile:v1";
// v8 through v4 are read as compatible baselines and upgraded in memory.
// Legacy keys are never deleted, so v9 recovery cannot mutate a previous Run.

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
  "campfire",
  "inventory",
  "loot",
  "death-review",
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
  "slime-sword",
  "hunter-bow",
  "bone-blade",
] as const;
const ARMOR_IDS = ["slime-vest", "vine-armor"] as const;
const CONSUMABLE_IDS = [
  "slime-gel",
  "water-drop",
  "frog-potion",
  "forest-fruit",
  "whetstone",
  "repair-shard",
] as const;
const CONSUMABLE_EFFECTS = ["heal-hp", "heal-armor", "heal-both"] as const;
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
const ANSWER_RESULTS = [
  "correct",
  "missing-concept",
  "wrong-result",
  "syntax-error",
] as const;
const BATTLE_OUTCOMES = ["hit", "countered", "victory", "defeat"] as const;

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

function isArmor(value: unknown): value is Armor {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    ARMOR_IDS.includes(value.id as Armor["id"]) &&
    typeof value.name === "string" &&
    isPositiveInteger(value.maxArmor) &&
    typeof value.description === "string"
  );
}

function isConsumable(value: unknown): value is Consumable {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    CONSUMABLE_IDS.includes(value.id as Consumable["id"]) &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.effect === "string" &&
    CONSUMABLE_EFFECTS.includes(value.effect as Consumable["effect"]) &&
    isPositiveInteger(value.amount)
  );
}

function isPlayer(value: unknown, requireArmor: boolean): value is PlayerState {
  if (!isRecord(value) || !isNonNegativeInteger(value.xp)) return false;
  const xp = value.xp;
  const levelThresholds = [0, 2, 4, 6, 8, 12, 16, 20, 24] as const;
  const expectedLevel = levelThresholds.reduce(
    (level, threshold, index) => xp >= threshold ? index + 1 : level,
    1,
  );
  const baseValid = (
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
  if (!baseValid || !requireArmor) return baseValid;
  if (
    !isNonNegativeInteger(value.armorHp) ||
    !(value.armor === null || isArmor(value.armor))
  ) return false;
  return value.armor === null
    ? value.armorHp === 0
    : value.armorHp <= value.armor.maxArmor;
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

function isEquipmentItem(value: unknown): value is EquipmentItem {
  if (
    !isRecord(value) ||
    typeof value.instanceId !== "string" ||
    value.instanceId.length === 0 ||
    (value.kind !== "weapon" && value.kind !== "armor") ||
    typeof value.protected !== "boolean"
  ) return false;
  if (value.kind === "weapon") {
    return isWeapon(value.weapon) &&
      value.armor === undefined &&
      value.armorHp === undefined;
  }
  return isArmor(value.armor) &&
    value.weapon === undefined &&
    isNonNegativeInteger(value.armorHp) &&
    value.armorHp <= value.armor.maxArmor;
}

function isConsumableStack(value: unknown): value is ConsumableStack {
  return (
    isRecord(value) &&
    isConsumable(value.item) &&
    isPositiveInteger(value.quantity) &&
    value.quantity <= 5
  );
}

function isLootItem(value: unknown): value is LootItem {
  if (
    !isRecord(value) ||
    typeof value.dropId !== "string" ||
    value.dropId.length === 0 ||
    typeof value.itemId !== "string" ||
    value.itemId.length === 0 ||
    !["weapon", "armor", "consumable", "reward"].includes(String(value.kind)) ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.guaranteed !== "boolean" ||
    !isFiniteNumber(value.probability) ||
    value.probability < 0 ||
    value.probability > 1 ||
    typeof value.protected !== "boolean"
  ) return false;
  if (value.kind === "weapon") {
    return isWeapon(value.weapon) &&
      value.itemId === value.weapon.id &&
      value.armor === undefined &&
      value.consumable === undefined &&
      value.rewardId === undefined;
  }
  if (value.kind === "armor") {
    return isArmor(value.armor) &&
      value.itemId === value.armor.id &&
      (value.armorHp === undefined || (
        isNonNegativeInteger(value.armorHp) &&
        value.armorHp <= value.armor.maxArmor
      )) &&
      value.weapon === undefined &&
      value.consumable === undefined &&
      value.rewardId === undefined;
  }
  if (value.kind === "consumable") {
    return isConsumable(value.consumable) &&
      value.itemId === value.consumable.id &&
      value.weapon === undefined &&
      value.armor === undefined &&
      value.rewardId === undefined;
  }
  return (
    typeof value.rewardId === "string" &&
    ROOM_REWARDS.includes(value.rewardId as RoomReward) &&
    value.itemId === value.rewardId &&
    value.weapon === undefined &&
    value.armor === undefined &&
    value.consumable === undefined
  );
}

function isLootBundle(
  value: unknown,
  floor: MazeFloor,
  graph: RoomGraph,
  reachableCells: ReadonlySet<string>,
): value is LootBundle {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (value.sourceMonsterId === null || isNonNegativeInteger(value.sourceMonsterId)) &&
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
  biomePlan: BiomePlan | null,
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

function isAnswerAttemptRecord(value: unknown): value is AnswerAttemptRecord {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    isPositiveInteger(value.battleId) &&
    (value.floor === 1 || value.floor === 2) &&
    isNonNegativeInteger(value.monsterId) &&
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
    isNonNegativeInteger(value.hintLevel)
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

function validatedCampfires(
  value: unknown,
  graph: RoomGraph,
  floor: MazeFloor,
): Campfire[] | null {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((entry) => isCampfire(entry, floor))) {
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

function isSavedRunVersion(value: unknown, version: 4 | 5 | 6 | 7 | 8 | 9): boolean {
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
  if (
    version >= 9 &&
    (
      !isCampaignProgress(run.campaign) ||
      run.campaign.currentFloor !== run.floor
    )
  ) return false;
  if (!isMazeFloor(run.mazeFloor, graph)) return false;
  const mazeFloor = run.mazeFloor;
  const challengeGateId = `gate:${graph.bossId}`;
  const expectedChallengeId: GateChallengeId = run.floor === 1
    ? "aggregate-breach"
    : "relation-breach";
  const openedGateIds = version >= 5 ? run.openedGateIds : [];
  const activeGateChallengeId = version >= 5 ? run.activeGateChallengeId : null;
  const answerHistory = version >= 6 ? run.answerHistory : [];
  const battleSequence = version >= 6 ? run.battleSequence : 0;
  const reviewBattleId = version >= 6 ? run.reviewBattleId : null;
  const campfires = version >= 7
    ? validatedCampfires(run.campfires, graph, mazeFloor)
    : [];
  const guidedMap = version >= 7 && campfires
    ? generateGuidedMapPlan(graph, mazeFloor, campfires)
    : null;
  const biomePlan = version >= 7 && campfires && guidedMap
    ? generateBiomePlan(graph, mazeFloor, campfires, guidedMap)
    : null;
  if (
    version >= 7 &&
    guidedMap &&
    !validateGuidedMapPlan(graph, mazeFloor, campfires ?? [], guidedMap).valid
  ) return false;
  if (
    version >= 7 &&
    biomePlan &&
    !validateBiomePlan(
      biomePlan,
      graph,
      mazeFloor,
      campfires ?? [],
      guidedMap as NonNullable<typeof guidedMap>,
    ).valid
  ) return false;
  const activeCampfireId = version >= 7 ? run.activeCampfireId : null;
  const respawnCampfireId = version >= 7 ? run.respawnCampfireId : null;
  const activeLootBundleId = version >= 8 ? run.activeLootBundleId : null;
  if (
    !PLAY_MODES.includes(run.mode as (typeof PLAY_MODES)[number]) ||
    (version === 4 && run.mode === "challenge") ||
    (version < 7 && (run.mode === "campfire" || run.mode === "death-review")) ||
    (version < 8 && (run.mode === "inventory" || run.mode === "loot")) ||
    (version >= 7 && campfires === null) ||
    !(activeCampfireId === null || typeof activeCampfireId === "string") ||
    !(respawnCampfireId === null || typeof respawnCampfireId === "string") ||
    !(activeLootBundleId === null || typeof activeLootBundleId === "string") ||
    (run.mode === "campfire" && activeCampfireId === null) ||
    (activeCampfireId !== null && run.mode !== "campfire" && run.mode !== "inventory") ||
    ((run.mode === "loot") !== (activeLootBundleId !== null)) ||
    (activeCampfireId !== null && !campfires?.some((entry) => entry.id === activeCampfireId)) ||
    (respawnCampfireId !== null && !campfires?.some((entry) => entry.id === respawnCampfireId)) ||
    !Array.isArray(openedGateIds) ||
    !openedGateIds.every((id) => (
      id === challengeGateId ||
      guidedMap?.shortcuts.some((shortcut) => shortcut.id === id) ||
      guidedMap?.deadEndCaches.some((cache) => cache.id === id)
    )) ||
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
    !isPlayer(run.player, version >= 8) ||
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
    !Array.isArray(answerHistory) ||
    answerHistory.length > MAX_ANSWER_HISTORY ||
    !answerHistory.every(isAnswerAttemptRecord) ||
    !hasUniqueValues(answerHistory.map((record) => record.id)) ||
    !isNonNegativeInteger(battleSequence) ||
    !(reviewBattleId === null || (
      isPositiveInteger(reviewBattleId) &&
      reviewBattleId <= battleSequence
    )) ||
    (version >= 6 && answerHistory.some((record) => (
      record.battleId > battleSequence ||
      record.id > Number(run.queryCount) ||
      record.floor > Number(run.floor)
    ))) ||
    (version >= 6 && run.mode === "combat" && reviewBattleId === null) ||
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
  if (version >= 7) {
    const expectedCampfires = campfires ?? [];
    const activeCampfire = activeCampfireId
      ? expectedCampfires.find((entry) => entry.id === activeCampfireId) ?? null
      : null;
    const respawnCampfire = respawnCampfireId
      ? expectedCampfires.find((entry) => entry.id === respawnCampfireId) ?? null
      : null;
    if (
      (activeCampfire !== null && nearbyCampfire([activeCampfire], player) === null) ||
      (respawnCampfire !== null && !run.visitedRoomIds.includes(respawnCampfire.roomNodeId)) ||
      expectedCampfires.some((entry) => (
        positionKey(entry) === positionKey(player) ||
        mazeFloor.gates.some((gate) => positionKey(gate) === positionKey(entry))
      ))
    ) return false;
  }

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
  if (version >= 7) {
    const expectedCampfires = campfires ?? [];
    const fireCells = new Set(expectedCampfires.map(positionKey));
    const safeCells = safeZoneCellKeys(mazeFloor, expectedCampfires);
    if (
      run.worldActors.some((actor) => safeCells.has(positionKey(actor))) ||
      run.groundItems.some((item) => fireCells.has(positionKey(item)))
    ) return false;
  }
  if (version >= 8) {
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
      guidedMap?.shortcuts.some((shortcut) => (
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
      run.lootBundles.some((bundle) => campfires?.some(
        (campfire) => positionKey(bundle) === positionKey(campfire),
      ))
    ) return false;
  }

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
  return isSavedRunVersion(value, 9);
}

type LegacyPlayerState = Omit<PlayerState, "armor" | "armorHp">;

type SavedRunV8 = Omit<SavedRun, "version" | "campaign"> & {
  version: 8;
};

type SavedRunV7 = Omit<
  SavedRunV8,
  | "version"
  | "player"
  | "activeLootBundleId"
  | "lootBundles"
  | "equipmentInventory"
  | "consumables"
  | "keyItems"
  | "acquiredUniqueItemIds"
> & {
  version: 7;
  player: LegacyPlayerState;
};

type SavedRunV6 = Omit<
  SavedRunV7,
  "version" | "campfires" | "activeCampfireId" | "respawnCampfireId"
> & { version: 6 };

type SavedRunV5 = Omit<
  SavedRunV6,
  "version" | "answerHistory" | "battleSequence" | "reviewBattleId"
> & { version: 5 };

function migrateV8Run(value: unknown): SavedRun | null {
  if (!isSavedRunVersion(value, 8)) return null;
  const legacy = value as SavedRunV8;
  const migrated: SavedRun = {
    ...legacy,
    version: 9,
    campaign: createCampaignProgress(legacy.graph.seed, legacy.floor),
    banner: `${legacy.banner} 八层课程框架已接入，当前双层进度保持不变。`,
  };
  return isSavedRun(migrated) ? migrated : null;
}

function migrateV7Run(value: unknown): SavedRun | null {
  if (!isSavedRunVersion(value, 7)) return null;
  const legacy = value as SavedRunV7;
  const acquiredUniqueItemIds = [...new Set([
    "data-blade",
    legacy.player.weapon.id,
    ...legacy.groundItems.flatMap((item) => item.weapon ? [item.weapon.id] : []),
  ])];
  const migrated: SavedRunV8 = {
    ...legacy,
    version: 8,
    activeLootBundleId: null,
    lootBundles: [],
    equipmentInventory: [],
    consumables: [],
    keyItems: [],
    acquiredUniqueItemIds,
    player: {
      ...legacy.player,
      weapon: { ...legacy.player.weapon },
      armor: null,
      armorHp: 0,
    },
    banner: `${legacy.banner} 背包系统已升级，旧版装备与局内进度均已保留。`,
  };
  return isSavedRunVersion(migrated, 8) ? migrateV8Run(migrated) : null;
}

function migrateV6Run(value: unknown): SavedRun | null {
  if (!isSavedRunVersion(value, 6)) return null;
  const legacy = value as SavedRunV6;
  const campfires = generateCampfires(legacy.graph, legacy.mazeFloor);
  const groundItems = legacy.groundItems.filter((item) => (
    legacy.graph.nodes.find((node) => node.id === item.sourceRoomId)?.type !== "rest"
  ));
  const wasDefeated = legacy.mode === "defeat";
  const overlappingCampfire = wasDefeated
    ? null
    : campfires.find((campfire) => (
        campfire.x === legacy.player.x && campfire.y === legacy.player.y
      )) ?? null;
  const hasDefeatReview = wasDefeated &&
    legacy.reviewBattleId !== null &&
    legacy.answerHistory.some((record) => (
      record.battleId === legacy.reviewBattleId && record.outcome === "defeat"
    ));
  const mode = wasDefeated
    ? hasDefeatReview ? "death-review" : "explore"
    : legacy.mode;
  const currentRoomId = wasDefeated ? legacy.graph.entryId : legacy.currentRoomId;
  const migratedPlayerPosition = wasDefeated
    ? legacy.mazeFloor.spawn
    : overlappingCampfire?.restPosition ?? null;
  const player = migratedPlayerPosition
    ? {
        ...legacy.player,
        ...migratedPlayerPosition,
        hp: wasDefeated ? legacy.player.maxHp : legacy.player.hp,
        weapon: { ...legacy.player.weapon },
      }
    : legacy.player;
  const visitedRoomIds = wasDefeated
    ? [...new Set([...legacy.visitedRoomIds, legacy.graph.entryId])]
    : legacy.visitedRoomIds;
  const completedRoomIds = [...new Set([...legacy.completedRoomIds, legacy.graph.entryId])];
  const discoveredCells = migratedPlayerPosition
    ? [...new Set([...legacy.discoveredCells, positionKey(migratedPlayerPosition)])]
    : legacy.discoveredCells;
  const looseWeapon = groundItems.find((item) => item.weapon);
  const availableLoot = looseWeapon?.weapon
    ? {
        x: looseWeapon.x,
        y: looseWeapon.y,
        weapon: { ...looseWeapon.weapon },
      }
    : null;
  const interactiveReward = groundItems.find((item) => (
    item.sourceRoomId === currentRoomId &&
    item.collection === "interact" &&
    item.rewardId !== null
  ));
  const claimableReward = interactiveReward?.rewardId === legacy.claimableReward?.id
    ? legacy.claimableReward
    : null;
  const migrated: SavedRunV7 = {
    ...legacy,
    version: 7,
    campfires,
    activeCampfireId: null,
    respawnCampfireId: null,
    groundItems,
    mode,
    currentRoomId,
    player,
    combat: wasDefeated ? null : legacy.combat,
    visitedRoomIds,
    completedRoomIds,
    activeGateChallengeId: wasDefeated ? null : legacy.activeGateChallengeId,
    availableLoot,
    claimableReward,
    reviewBattleId: wasDefeated
      ? hasDefeatReview ? legacy.reviewBattleId : null
      : legacy.reviewBattleId,
    discoveredCells,
    banner: wasDefeated
      ? hasDefeatReview
        ? "旧版失败记录已恢复：已返回出生安全区，请完成本场死亡复盘。"
        : "旧版失败记录已恢复：已返回出生安全区，可以继续探索。"
      : overlappingCampfire
        ? `${legacy.banner} 旧版站位与新增篝火重叠，已移至相邻安全格。`
        : legacy.banner,
  };
  return isSavedRunVersion(migrated, 7) ? migrateV7Run(migrated) : null;
}

function migrateV5RunToV6(value: unknown): SavedRunV6 | null {
  if (!isSavedRunVersion(value, 5)) return null;
  const legacy = value as Omit<
    SavedRunV6,
    "version" | "answerHistory" | "battleSequence" | "reviewBattleId"
  > & { version: 5 };
  const hasActiveBattle = legacy.mode === "combat";
  return {
    ...legacy,
    version: 6,
    answerHistory: [],
    battleSequence: hasActiveBattle ? 1 : 0,
    reviewBattleId: hasActiveBattle ? 1 : null,
  };
}

function migrateV5Run(value: unknown): SavedRun | null {
  const v6 = migrateV5RunToV6(value);
  return v6 ? migrateV6Run(v6) : null;
}

function migrateV4Run(value: unknown): SavedRun | null {
  if (!isSavedRunVersion(value, 4)) return null;
  const legacy = value as Omit<
    SavedRunV5,
    | "version"
    | "openedGateIds"
    | "activeGateChallengeId"
    | "answerHistory"
    | "battleSequence"
    | "reviewBattleId"
  > & { version: 4 };
  const v5: SavedRunV5 = {
    ...legacy,
    version: 5,
    openedGateIds: [],
    activeGateChallengeId: null,
  };
  return migrateV5Run(v5);
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
  return migrateV8Run(parseJson(safeGetItem(storage, LEGACY_RUN_SAVE_KEY)))
    ?? migrateV7Run(parseJson(safeGetItem(storage, OLDER_RUN_SAVE_KEY)))
    ?? migrateV6Run(parseJson(safeGetItem(storage, OLDEST_RUN_SAVE_KEY)))
    ?? migrateV5Run(parseJson(safeGetItem(storage, ANCIENT_RUN_SAVE_KEY)))
    ?? migrateV4Run(parseJson(safeGetItem(storage, ARCHAIC_RUN_SAVE_KEY)));
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
