/**
 * Run 中玩家、战斗、装备和基础值对象的纯结构校验。
 */
import {
  mazeTileAt,
  type MazeFloor,
} from "../../domain/exploration/mazeGenerator";
import type { RoomReward } from "../../domain/progression/runGraph";
import type {
  Armor,
  ClaimableReward,
  CombatState,
  Consumable,
  ConsumableStack,
  EquipmentItem,
  GateChallengeId,
  LessonId,
  LootDrop,
  LootItem,
  Monster,
  PlayerState,
  Relic,
  Weapon,
} from "../../domain/shared/types";
import { PROFILE_LESSON_IDS } from "./profileCodec";

const LESSON_IDS: readonly LessonId[] = PROFILE_LESSON_IDS;

export const PLAY_MODES = [
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
export const GATE_CHALLENGE_IDS: readonly GateChallengeId[] = [
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
export const ROOM_TYPES = ["entry", "tutorial", "lesson", "rest", "treasure", "event", "elite", "boss"] as const;
export const ROOM_REWARDS = [
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
export const ACTOR_BEHAVIORS = ["wander", "guard", "anchored"] as const;
export const ITEM_KINDS = ["weapon", "relic", "heal", "event", "key"] as const;
export const ITEM_COLLECTIONS = ["touch", "interact"] as const;
export const DECORATION_KINDS = ["torch", "rubble", "rune"] as const;
export const ANSWER_RESULTS = [
  "correct",
  "missing-concept",
  "wrong-result",
  "syntax-error",
] as const;
export const BATTLE_OUTCOMES = ["hit", "countered", "victory", "defeat"] as const;

export function isLessonId(value: unknown): value is LessonId {
  return typeof value === "string" && LESSON_IDS.includes(value as LessonId);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isPracticeDrawState(value: unknown): boolean {
  return isRecord(value) &&
    isNonNegativeInteger(value.cursor) &&
    isNonNegativeInteger(value.cycle);
}

export function isPracticeDrawStates(value: unknown): boolean {
  return isRecord(value) &&
    isPracticeDrawState(value.L1) &&
    isPracticeDrawState(value.L2) &&
    isPracticeDrawState(value.L3);
}

export function isPosition(
  value: unknown,
): value is Record<string, unknown> & { x: number; y: number } {
  return isRecord(value) && isNonNegativeInteger(value.x) && isNonNegativeInteger(value.y);
}

export function isPositionInFloor(
  value: unknown,
  floor: MazeFloor,
): value is Record<string, unknown> & { x: number; y: number } {
  return (
    isPosition(value) &&
    value.x < floor.width &&
    value.y < floor.height
  );
}

export function isFloorCell(
  value: unknown,
  floor: MazeFloor,
): value is Record<string, unknown> & { x: number; y: number } {
  return isPositionInFloor(value, floor) && mazeTileAt(floor, value.x, value.y) === ".";
}

export function positionKey(value: { x: number; y: number }): string {
  return `${value.x}:${value.y}`;
}

export function hasUniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

export function isWeapon(value: unknown): value is Weapon {
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

export function isPlayer(value: unknown, requireArmor: boolean): value is PlayerState {
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

export function isMonster(value: unknown): value is Monster {
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

export function isCombat(value: unknown): value is CombatState | null {
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

export function isRelic(value: unknown): value is Relic {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    RELIC_IDS.includes(value.id as Relic["id"]) &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    isFiniteNumber(value.heatReduction)
  );
}

export function isLoot(value: unknown): value is LootDrop | null {
  return value === null || (isPosition(value) && isWeapon(value.weapon));
}

export function isReward(value: unknown): value is ClaimableReward | null {
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

export function isEquipmentItem(value: unknown): value is EquipmentItem {
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

export function isConsumableStack(value: unknown): value is ConsumableStack {
  return (
    isRecord(value) &&
    isConsumable(value.item) &&
    isPositiveInteger(value.quantity) &&
    value.quantity <= 5
  );
}

export function isLootItem(value: unknown): value is LootItem {
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
