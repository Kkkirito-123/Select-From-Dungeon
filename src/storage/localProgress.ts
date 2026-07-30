import {
  LEGACY_MAZE_CHUNK_SIZE,
  LEGACY_MAZE_HEIGHT,
  LEGACY_MAZE_WIDTH,
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
  type BiomePlan,
} from "../domain/biome";
import { generateFloorHazards } from "../domain/floorLabyrinth";
import { isFloorOneChestMarker } from "../domain/floorOneTreasure";
import { storyEvidenceMarkerIdsForFloor } from "../domain/floorStory";
import {
  advanceCampaignProgress,
  createCampaignProgress,
  isCampaignProgress,
} from "../domain/campaign";
import type { WorldActor } from "../domain/monsterRoaming";
import {
  gateChallengeIdForFloor,
} from "../content/gateChallenges";
import { compatibleFloorLayoutNames } from "../content/floorMapBlueprints";
import { hiddenAreaGateIdsForFloor } from "../content/floorExperience";
import {
  CURRENT_MONSTER_IDS_BY_FLOOR,
  currentMasterIdForLegacyMonster,
  currentMonsterIdForLegacy,
  detectMonsterIdScheme,
} from "../content/monsterIds";
import { LESSONS } from "../content/mvpLevel";
import { rewardDetails } from "../content/runContent";
import {
  lessonsForFloor,
  stableStringHash,
  validateRoomGraph,
  type FloorNumber,
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

export const RUN_SAVE_KEY = "select-from-dungeon:run:v11";
export const PROFILE_SAVE_KEY = "select-from-dungeon:profile:v3";
const LEGACY_RUN_SAVE_KEY = "select-from-dungeon:run:v10";
const OLDER_RUN_SAVE_KEY = "select-from-dungeon:run:v9";
const OLDEST_RUN_SAVE_KEY = "select-from-dungeon:run:v8";
const ANCIENT_RUN_SAVE_KEY = "select-from-dungeon:run:v7";
const ARCHAIC_RUN_SAVE_KEY = "select-from-dungeon:run:v6";
const PRIMITIVE_RUN_SAVE_KEY = "select-from-dungeon:run:v5";
const ORIGINAL_RUN_SAVE_KEY = "select-from-dungeon:run:v4";
const LEGACY_PROFILE_V2_SAVE_KEY = "select-from-dungeon:profile:v2";
const LEGACY_PROFILE_SAVE_KEY = "select-from-dungeon:profile:v1";
// v9 through v4 are read as compatible baselines and upgraded in memory.
// Legacy keys are never deleted, so v10 recovery cannot mutate a previous Run.

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
const PRE_V08_LESSON_IDS: readonly LessonId[] = LESSON_IDS.slice(0, 10);

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
  "grave-breach",
  "forge-breach",
  "iron-breach",
  "dragon-breach",
  "index-breach",
  "throne-breach",
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
  "rune-staff",
  "iron-axe",
  "dragon-spear",
  "crystal-blade",
  "royal-sword",
] as const;
const ARMOR_IDS = [
  "slime-vest",
  "vine-armor",
  "bone-armor",
  "rune-armor",
  "ember-echo-robe",
  "iron-armor",
  "dragon-armor",
  "crystal-armor",
  "royal-armor",
] as const;
const CONSUMABLE_IDS = [
  "slime-gel",
  "water-drop",
  "frog-potion",
  "forest-fruit",
  "holy-water",
  "fire-crystal",
  "ice-crystal",
  "repair-plate",
  "dragon-potion",
  "crystal-fruit",
  "black-potion",
  "full-potion",
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
  "skeleton",
  "zombie",
  "ghost",
  "necromancer",
  "fire-spirit",
  "ice-spirit",
  "thunder-spirit",
  "elemental-king",
  "goblin",
  "orc",
  "knight",
  "troll",
  "castle-lord",
  "hatchling",
  "wyvern",
  "dragon",
  "dragon-king",
  "index-guard",
  "root-beast",
  "crystal-spirit",
  "vine-witch",
  "index-eye",
  "index-tree",
  "demon-soldier",
  "dark-knight",
  "lich",
  "obsidian-golem",
  "replica-twin",
  "shard-beast",
  "demon-king",
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
  "bone-blade",
  "rune-staff",
  "iron-axe",
  "dragon-spear",
  "crystal-blade",
  "royal-sword",
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

function discoveredMonsterIdsForLessons(
  masteredLessons: readonly LessonId[],
): number[] {
  const mastered = new Set(masteredLessons);
  return LESSONS
    .filter((lesson) => mastered.has(lesson.id))
    .map((lesson) => lesson.primaryMonsterId)
    .filter((id, index, values) => values.indexOf(id) === index)
    .sort((left, right) => left - right);
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

function isFloorNumber(value: unknown): value is FloorNumber {
  return value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6 ||
    value === 7 ||
    value === 8;
}

function migratedMonsterReference(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const id = value[key];
  return typeof id === "number" && Number.isInteger(id)
    ? { ...value, [key]: currentMonsterIdForLegacy(id) }
    : { ...value };
}

/**
 * MVP 2.0 numbers the canonical monsters 1..89 in floor/content order.
 * Existing v4-v10 Runs used a sparse first-two-floor scheme followed by 1..67.
 * A floor's old and current ID sets are disjoint, so migration is deterministic
 * and idempotent without changing the storage key or save schema.
 */
function migrateLegacyMonsterIds(value: unknown): unknown {
  if (
    !isRecord(value) ||
    !isFloorNumber(value.floor) ||
    !Array.isArray(value.monsters)
  ) {
    return value;
  }
  const ids = value.monsters.map((monster) => (
    isRecord(monster) && typeof monster.id === "number"
      ? monster.id
      : Number.NaN
  ));
  if (detectMonsterIdScheme(value.floor, ids) !== "legacy") return value;

  const monsters = value.monsters.map((monster) => {
    if (!isRecord(monster)) return monster;
    const migrated = migratedMonsterReference(monster, "id");
    const id = migrated.id;
    const masterId = monster.masterId;
    return typeof id === "number" && Number.isInteger(id) && (
      masterId === null ||
      (typeof masterId === "number" && Number.isInteger(masterId))
    )
      ? {
          ...migrated,
          masterId: currentMasterIdForLegacyMonster(id, masterId),
        }
      : migrated;
  });
  const worldActors = Array.isArray(value.worldActors)
    ? value.worldActors.map((actor) => (
        isRecord(actor) ? migratedMonsterReference(actor, "monsterId") : actor
      ))
    : value.worldActors;
  const combat = isRecord(value.combat)
    ? migratedMonsterReference(value.combat, "targetId")
    : value.combat;
  const answerHistory = Array.isArray(value.answerHistory)
    ? value.answerHistory.map((record) => (
        isRecord(record)
          ? (() => {
              const migrated = migratedMonsterReference(record, "monsterId");
              const monsterId = migrated.monsterId;
              const lesson = isLessonId(migrated.lessonId)
                ? LESSONS.find((entry) => entry.id === migrated.lessonId)
                : undefined;
              const stage = lesson?.stages.find((entry) => entry.id === migrated.stageId);
              const safeId = typeof monsterId === "number" && Number.isInteger(monsterId)
                ? monsterId
                : 0;
              return {
                ...migrated,
                monsterName: `ID #${String(safeId).padStart(3, "0")}`,
                stageObjective: stage?.objective
                  ?? `旧版作答已迁移：按 ID #${String(safeId).padStart(3, "0")} 复盘。`,
                sql: "",
                answerSql: stage?.answerSql
                  ?? `SELECT id FROM monsters WHERE id = ${safeId};`,
                feedback: "旧版作答记录已迁移；怪物姓名仍需在当前版本重新恢复。",
              };
            })()
          : record
      ))
    : value.answerHistory;
  const lootBundles = Array.isArray(value.lootBundles)
    ? value.lootBundles.map((bundle) => (
        isRecord(bundle) && bundle.sourceMonsterId !== null
          ? migratedMonsterReference(bundle, "sourceMonsterId")
          : bundle
      ))
    : value.lootBundles;

  return {
    ...value,
    monsters,
    worldActors,
    combat,
    answerHistory,
    lootBundles,
    banner: "旧版怪物编号与答题记录已迁移；未恢复的姓名继续只显示 ID。",
  };
}

/**
 * Early v10 builds entered victory before committing the eighth campaign slot.
 * Repair only that one internally valid historical shape; every other mismatch
 * is left untouched for the strict save validator to reject.
 */
function migrateLegacyVictoryCampaign(value: unknown): unknown {
  if (
    !isRecord(value) ||
    value.version !== 10 ||
    value.mode !== "victory" ||
    !isCampaignProgress(value.campaign) ||
    value.campaign.currentFloor !== 8 ||
    value.campaign.status !== "active"
  ) {
    return value;
  }
  const completion = advanceCampaignProgress(value.campaign);
  return completion.ok && completion.completed
    ? { ...value, campaign: completion.progress }
    : value;
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
  const levelThresholds = [0, 2, 4, 6, 8, 14, 22, 32, 44, 58, 74, 92, 112] as const;
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
  ) {
    return false;
  }
  return value.armor === null
    ? value.armorHp === 0
    : value.armorHp <= value.armor.maxArmor;
}

function isMonster(value: unknown): value is Monster {
  return (
    isPosition(value) &&
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
    isPositiveInteger(value.id) &&
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
    isPositiveInteger(value.targetId) &&
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

function isValidGraph(value: unknown): value is RoomGraph {
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

function isMazeFloor(value: unknown, graph: RoomGraph): value is MazeFloor {
  const generatorVersion = isRecord(value) ? value.generatorVersion : null;
  const expectedDimensions = generatorVersion === 4
    ? {
        width: LEGACY_MAZE_WIDTH,
        height: LEGACY_MAZE_HEIGHT,
        chunkSize: LEGACY_MAZE_CHUNK_SIZE,
      }
    : {
        width: MAZE_WIDTH,
        height: MAZE_HEIGHT,
        chunkSize: MAZE_CHUNK_SIZE,
      };
  if (
    !isRecord(value) ||
    value.version !== 4 ||
    (value.generatorVersion !== 4 && value.generatorVersion !== 5) ||
    value.seed !== graph.seed ||
    value.width !== expectedDimensions.width ||
    value.height !== expectedDimensions.height ||
    value.chunkSize !== expectedDimensions.chunkSize ||
    !Array.isArray(value.tiles) ||
    value.tiles.length !== expectedDimensions.height ||
    !value.tiles.every((row) => (
      typeof row === "string" &&
      row.length === expectedDimensions.width &&
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
  const compatibleLayoutNames = floor.generatorVersion === 5
    ? compatibleFloorLayoutNames(graph.floor)
    : [""];
  const hasCompatibleTopologyHash = compatibleLayoutNames.some((layoutName) => (
    floor.topologyHash === stableStringHash(
      `${layoutName ? `${layoutName}|` : ""}${topologyBody}`,
    )
  ));
  if (!hasCompatibleTopologyHash) {
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
  const isFloorOneChest = graph.floor === 1 && isFloorOneChestMarker(value.id);
  return (
    isFloorOneChest ||
    value.rewardId !== null ||
    value.weapon !== undefined
  ) && (value.weapon === undefined || value.kind === "weapon");
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
  legacy = false,
): Campfire[] | null {
  if (
    !Array.isArray(value) ||
    (legacy ? value.length !== 2 && value.length !== 3 : value.length !== 2) ||
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
  if (legacy) return campfires;
  let expected: Campfire[];
  let legacyExpected: Campfire[];
  let legacyFloorOneExpected: Campfire[];
  let legacyHiddenFloorOneExpected: Campfire[];
  try {
    expected = generateCampfires(graph, floor);
    legacyExpected = generateCampfires(graph, floor, {
      includeHiddenTreasureRooms: true,
    });
    legacyFloorOneExpected = generateCampfires(graph, floor, {
      useLegacyFloorOnePlacement: true,
    });
    legacyHiddenFloorOneExpected = generateCampfires(graph, floor, {
      includeHiddenTreasureRooms: true,
      useLegacyFloorOnePlacement: true,
    });
  } catch {
    return null;
  }
  return (
    JSON.stringify(campfires) === JSON.stringify(expected) ||
    JSON.stringify(campfires) === JSON.stringify(legacyExpected) ||
    JSON.stringify(campfires) === JSON.stringify(legacyFloorOneExpected) ||
    JSON.stringify(campfires) === JSON.stringify(legacyHiddenFloorOneExpected)
  ) ? campfires : null;
}

function isSavedRunVersion(
  value: unknown,
  version: 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11,
): boolean {
  if (!isRecord(value)) return false;
  const run = value as Partial<SavedRun>;
  const candidateVersion: unknown = run.version;
  if (
    candidateVersion !== version ||
    (
      run.generatorVersion !== 4 &&
      run.generatorVersion !== 5
    ) ||
    (
      run.floor !== 1 &&
      run.floor !== 2 &&
      run.floor !== 3 &&
      run.floor !== 4 &&
      run.floor !== 5 &&
      run.floor !== 6 &&
      (version < 10 || (run.floor !== 7 && run.floor !== 8))
    ) ||
    !isValidGraph(run.graph)
  ) return false;
  const graph = run.graph;
  if (run.floor !== graph.floor) return false;
  if (
    version >= 9 &&
    (
      !isCampaignProgress(run.campaign) ||
      run.campaign.currentFloor !== run.floor ||
      ((run.mode === "victory") !== (run.campaign.status === "completed"))
    )
  ) return false;
  if (!isMazeFloor(run.mazeFloor, graph)) return false;
  const mazeFloor = run.mazeFloor;
  const challengeGateId = `gate:${graph.bossId}`;
  const hiddenAreaGateIds = hiddenAreaGateIdsForFloor(Number(run.floor));
  const expectedChallengeId = gateChallengeIdForFloor(run.floor);
  const openedGateIds = version >= 5 ? run.openedGateIds : [];
  const activeGateChallengeId = version >= 5 ? run.activeGateChallengeId : null;
  const answerHistory = version >= 6 ? run.answerHistory : [];
  const battleSequence = version >= 6 ? run.battleSequence : 0;
  const reviewBattleId = version >= 6 ? run.reviewBattleId : null;
  const campfires = version >= 7
    ? validatedCampfires(run.campfires, graph, mazeFloor, version <= 10)
    : [];
  const guidedMap = version >= 7 && campfires
    ? generateGuidedMapPlan(graph, mazeFloor, campfires)
    : null;
  const biomePlan = version >= 7 && campfires && guidedMap
    ? generateBiomePlan(graph, mazeFloor, campfires, guidedMap)
    : null;
  const floorHazardIds = biomePlan && campfires && guidedMap
    ? new Set(generateFloorHazards(
        graph.floor,
        mazeFloor,
        campfires,
        guidedMap,
        biomePlan,
      ).map((hazard) => hazard.id))
    : new Set<string>();
  const storyEvidenceMarkerIds = new Set(
    storyEvidenceMarkerIdsForFloor(run.floor),
  );
  if (
    version >= 7 &&
    guidedMap &&
    !validateGuidedMapPlan(graph, mazeFloor, campfires ?? [], guidedMap).valid
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
      hiddenAreaGateIds.includes(id) ||
      guidedMap?.shortcuts.some((shortcut) => shortcut.id === id) ||
      guidedMap?.deadEndCaches.some((cache) => cache.id === id) ||
      floorHazardIds.has(id) ||
      storyEvidenceMarkerIds.has(id) ||
      (run.floor === 1 && isFloorOneChestMarker(id))
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
    !run.monsters.every((monster) => (
      CURRENT_MONSTER_IDS_BY_FLOOR[run.floor as FloorNumber].includes(monster.id)
    )) ||
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
  const interactiveReward = run.groundItems.find((item) => {
    if (item.sourceRoomId !== run.currentRoomId || item.collection !== "interact") {
      return false;
    }
    const room = graph.nodes.find((node) => node.id === item.sourceRoomId);
    return !room?.lessonId || run.completedLessons?.includes(room.lessonId);
  });
  if (
    version >= 7 &&
    (
      (run.claimableReward === null) !== (interactiveReward?.rewardId == null) ||
      (
        run.claimableReward !== null &&
        run.claimableReward.id !== interactiveReward?.rewardId
      )
    )
  ) return false;
  return true;
}

export function isSavedRun(value: unknown): value is SavedRun {
  return isSavedRunVersion(value, 11);
}

type LegacyPlayerState = Omit<PlayerState, "armor" | "armorHp">;

type SavedRunV10 = Omit<SavedRun, "version"> & {
  version: 10;
};

type SavedRunV9 = Omit<SavedRunV10, "version"> & {
  version: 9;
};

type SavedRunV8 = Omit<SavedRunV9, "version" | "campaign"> & {
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

function migrateV10Run(value: unknown): SavedRun | null {
  if (!isSavedRunVersion(value, 10)) return null;
  const legacy = value as SavedRunV10;
  const campfires = generateCampfires(legacy.graph, legacy.mazeFloor);
  const oldCampfireFor = (id: string | null): Campfire | null => (
    id ? legacy.campfires.find((campfire) => campfire.id === id) ?? null : null
  );
  const nearestCampfire = (oldCampfire: Campfire | null): Campfire | null => {
    if (!oldCampfire) return null;
    return [...campfires].sort((left, right) => (
      Math.abs(left.x - oldCampfire.x) + Math.abs(left.y - oldCampfire.y) -
      (Math.abs(right.x - oldCampfire.x) + Math.abs(right.y - oldCampfire.y))
    ))[0] ?? null;
  };
  const activeCampfire = nearestCampfire(oldCampfireFor(legacy.activeCampfireId));
  const respawnCampfire = nearestCampfire(oldCampfireFor(legacy.respawnCampfireId));
  const overlappingCampfire = campfires.find((campfire) => (
    campfire.x === legacy.player.x && campfire.y === legacy.player.y
  ));
  const movedCampfire = activeCampfire ?? overlappingCampfire ?? null;
  const player = movedCampfire
    ? { ...legacy.player, ...movedCampfire.restPosition }
    : legacy.player;
  const currentRoomId = movedCampfire?.roomNodeId ?? legacy.currentRoomId;
  const migrated: SavedRun = {
    ...legacy,
    version: 11,
    campfires,
    activeCampfireId: activeCampfire?.id ?? null,
    respawnCampfireId: respawnCampfire?.id ?? null,
    player,
    currentRoomId,
    visitedRoomIds: [...new Set([
      ...legacy.visitedRoomIds,
      ...(movedCampfire ? [movedCampfire.roomNodeId] : []),
    ])],
    discoveredCells: [...new Set([
      ...legacy.discoveredCells,
      positionKey(player),
    ])],
    banner: `${legacy.banner} 篝火路线已收束为中、后两个检查点。`,
  };
  return isSavedRun(migrated) ? migrated : null;
}

function migrateV9Run(value: unknown): SavedRun | null {
  if (!isSavedRunVersion(value, 9)) return null;
  const legacy = value as SavedRunV9;
  const migrated: SavedRunV10 = {
    ...legacy,
    version: 10,
    banner: `${legacy.banner} 第七、八层课程已开放，当前进度完整保留。`,
  };
  return isSavedRunVersion(migrated, 10) ? migrateV10Run(migrated) : null;
}

function migrateV8Run(value: unknown): SavedRun | null {
  if (!isSavedRunVersion(value, 8)) return null;
  const legacy = value as SavedRunV8;
  const migrated: SavedRunV9 = {
    ...legacy,
    version: 9,
    campaign: createCampaignProgress(legacy.graph.seed, legacy.floor),
    banner: `${legacy.banner} 八层课程框架已接入，当前双层进度保持不变。`,
  };
  return isSavedRunVersion(migrated, 9) ? migrateV9Run(migrated) : null;
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
  const interactiveReward = groundItems.find((item) => {
    if (
      item.sourceRoomId !== currentRoomId ||
      item.collection !== "interact" ||
      item.rewardId === null
    ) return false;
    const room = legacy.graph.nodes.find((node) => node.id === item.sourceRoomId);
    return !room?.lessonId || legacy.completedLessons.includes(room.lessonId);
  });
  const claimableReward = interactiveReward?.rewardId
    ? rewardDetails(interactiveReward.rewardId)
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
    profile.version === 3 &&
    Array.isArray(profile.masteredLessons) &&
    profile.masteredLessons.every(isLessonId) &&
    Boolean(profile.attempts) &&
    LESSON_IDS.every((id) => isNonNegativeInteger(profile.attempts?.[id])) &&
    Array.isArray(profile.discoveredMonsterIds) &&
    profile.discoveredMonsterIds.every(isNonNegativeInteger) &&
    new Set(profile.discoveredMonsterIds).size === profile.discoveredMonsterIds.length &&
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
  migrated.discoveredMonsterIds = discoveredMonsterIdsForLessons(
    migrated.masteredLessons,
  );
  return migrated;
}

function migrateV2Profile(value: unknown): ProfileProgress | null {
  if (!isRecord(value)) return null;
  const attempts = isRecord(value.attempts) ? value.attempts : null;
  if (
    value.version !== 2 ||
    !Array.isArray(value.masteredLessons) ||
    !value.masteredLessons.every(isLessonId) ||
    !attempts ||
    !PRE_V08_LESSON_IDS.every((lesson) => isNonNegativeInteger(attempts[lesson])) ||
    !isNonNegativeInteger(value.victories) ||
    !(value.bestRunQueries === null || isNonNegativeInteger(value.bestRunQueries))
  ) return null;
  const migrated = createEmptyProfile();
  migrated.masteredLessons = [...value.masteredLessons] as LessonId[];
  LESSON_IDS.forEach((lesson) => {
    if (isNonNegativeInteger(attempts[lesson])) {
      migrated.attempts[lesson] = Number(attempts[lesson]);
    }
  });
  migrated.victories = value.victories;
  migrated.bestRunQueries = value.bestRunQueries;
  migrated.discoveredMonsterIds = discoveredMonsterIdsForLessons(
    migrated.masteredLessons,
  );
  return migrated;
}

export function loadRun(storage: StorageLike): SavedRun | null {
  const readRun = (key: string): unknown => (
    migrateLegacyVictoryCampaign(
      migrateLegacyMonsterIds(parseJson(safeGetItem(storage, key))),
    )
  );
  const value = readRun(RUN_SAVE_KEY);
  if (isSavedRun(value)) return value;
  return migrateV10Run(readRun(LEGACY_RUN_SAVE_KEY))
    ?? migrateV9Run(readRun(OLDER_RUN_SAVE_KEY))
    ?? migrateV8Run(readRun(OLDEST_RUN_SAVE_KEY))
    ?? migrateV7Run(readRun(ANCIENT_RUN_SAVE_KEY))
    ?? migrateV6Run(readRun(ARCHAIC_RUN_SAVE_KEY))
    ?? migrateV5Run(readRun(PRIMITIVE_RUN_SAVE_KEY))
    ?? migrateV4Run(readRun(ORIGINAL_RUN_SAVE_KEY));
}

export function loadProfile(storage: StorageLike): ProfileProgress {
  const value = parseJson(safeGetItem(storage, PROFILE_SAVE_KEY));
  if (isProfileProgress(value)) return value;
  const migratedCurrent = migrateV2Profile(value);
  if (migratedCurrent) return migratedCurrent;
  const migratedV2 = migrateV2Profile(
    parseJson(safeGetItem(storage, LEGACY_PROFILE_V2_SAVE_KEY)),
  );
  if (migratedV2) return migratedV2;
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
