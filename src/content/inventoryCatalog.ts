import type {
  Armor,
  Consumable,
  LootItem,
  Weapon,
} from "../domain/types";
import type { FloorNumber } from "../domain/runGraph";
import {
  DATA_BLADE,
  FILTER_BOW,
  NULL_LANTERN,
  AGGREGATE_HAMMER,
} from "./mvpLevel";
import { JOIN_CHAIN, SORT_SABER } from "./floor2Level";

export const EQUIPMENT_CAPACITY = 12;
export const CONSUMABLE_SLOT_CAPACITY = 3;
export const CONSUMABLE_STACK_CAPACITY = 5;

export const BONE_BLADE: Weapon = {
  id: "bone-blade",
  name: "骨剑",
  damage: 16,
  heatReduction: 0,
  description: "来自下一层的稀有武器。提高伤害，但不会减少课程要求的正确作答次数。",
};

export const ARMORS: Readonly<Record<Armor["id"], Armor>> = {
  "slime-vest": {
    id: "slime-vest",
    name: "软泥甲",
    maxArmor: 1,
    description: "提供 1 点护甲生命。受到攻击时优先消耗护甲。",
  },
  "vine-armor": {
    id: "vine-armor",
    name: "藤甲",
    maxArmor: 1,
    description: "森林藤蔓编成的护甲，提供 1 点护甲生命。",
  },
};

export const CONSUMABLES: Readonly<Record<Consumable["id"], Consumable>> = {
  "slime-gel": {
    id: "slime-gel",
    name: "凝胶",
    description: "恢复 1 点基础生命。",
    effect: "heal-hp",
    amount: 1,
  },
  "water-drop": {
    id: "water-drop",
    name: "水珠",
    description: "恢复 1 点护甲生命。",
    effect: "heal-armor",
    amount: 1,
  },
  "forest-fruit": {
    id: "forest-fruit",
    name: "树果",
    description: "优先恢复 1 点基础生命；生命已满时恢复 1 点护甲生命。",
    effect: "heal-both",
    amount: 1,
  },
  whetstone: {
    id: "whetstone",
    name: "磨刀石",
    description: "重复武器转化物。当前 MVP 使用后恢复 1 点基础生命。",
    effect: "heal-hp",
    amount: 1,
  },
  "repair-shard": {
    id: "repair-shard",
    name: "修理片",
    description: "恢复当前防具的全部护甲生命。",
    effect: "heal-armor",
    amount: 3,
  },
};

export const WEAPONS: Readonly<Record<Weapon["id"], Weapon>> = {
  "data-blade": DATA_BLADE,
  "filter-bow": FILTER_BOW,
  "null-lantern": NULL_LANTERN,
  "aggregate-hammer": AGGREGATE_HAMMER,
  "sort-saber": SORT_SABER,
  "join-chain": JOIN_CHAIN,
  "bone-blade": BONE_BLADE,
};

export interface LootCandidate {
  item: Omit<LootItem, "dropId" | "guaranteed" | "probability">;
  probability: number;
}

function weaponCandidate(weapon: Weapon, probability: number): LootCandidate {
  return {
    probability,
    item: {
      itemId: weapon.id,
      kind: "weapon",
      name: weapon.name,
      description: weapon.description,
      protected: false,
      weapon: { ...weapon },
    },
  };
}

function armorCandidate(armor: Armor, probability: number): LootCandidate {
  return {
    probability,
    item: {
      itemId: armor.id,
      kind: "armor",
      name: armor.name,
      description: armor.description,
      protected: false,
      armor: { ...armor },
    },
  };
}

function consumableCandidate(
  consumable: Consumable,
  probability: number,
): LootCandidate {
  return {
    probability,
    item: {
      itemId: consumable.id,
      kind: "consumable",
      name: consumable.name,
      description: consumable.description,
      protected: false,
      consumable: { ...consumable },
    },
  };
}

const FLOOR_ONE_CANDIDATES: readonly LootCandidate[] = [
  consumableCandidate(CONSUMABLES["slime-gel"], 0.06),
  consumableCandidate(CONSUMABLES.whetstone, 0.02),
  weaponCandidate(FILTER_BOW, 0.0075),
  armorCandidate(ARMORS["slime-vest"], 0.005),
  weaponCandidate(SORT_SABER, 0.0025),
];

const FLOOR_TWO_CANDIDATES: readonly LootCandidate[] = [
  consumableCandidate(CONSUMABLES["forest-fruit"], 0.05),
  consumableCandidate(CONSUMABLES["repair-shard"], 0.02),
  weaponCandidate(SORT_SABER, 0.0075),
  armorCandidate(ARMORS["vine-armor"], 0.005),
  weaponCandidate(BONE_BLADE, 0.0025),
];

export function lootCandidatesForFloor(floor: FloorNumber): LootCandidate[] {
  const candidates = floor === 1 ? FLOOR_ONE_CANDIDATES : FLOOR_TWO_CANDIDATES;
  return candidates.map((candidate) => ({
    probability: candidate.probability,
    item: {
      ...candidate.item,
      weapon: candidate.item.weapon ? { ...candidate.item.weapon } : undefined,
      armor: candidate.item.armor ? { ...candidate.item.armor } : undefined,
      consumable: candidate.item.consumable
        ? { ...candidate.item.consumable }
        : undefined,
    },
  }));
}
