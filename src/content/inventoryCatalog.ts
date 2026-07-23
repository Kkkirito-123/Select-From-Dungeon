import type {
  Armor,
  Consumable,
  LootItem,
  Weapon,
} from "../domain/types";
import type { FloorNumber } from "../domain/runGraph";
import {
  type BiomeEncounterRole,
  type BiomeKind,
} from "./biomeContent";
import {
  DATA_BLADE,
  FILTER_BOW,
  NULL_LANTERN,
  AGGREGATE_HAMMER,
} from "./mvpLevel";
import { JOIN_CHAIN, SORT_SABER } from "./floor2Level";
import { BONE_BLADE } from "./floor3Level";
import { RUNE_STAFF } from "./floor4Level";

export { BONE_BLADE, RUNE_STAFF };

export const EQUIPMENT_CAPACITY = 12;
export const CONSUMABLE_SLOT_CAPACITY = 3;
export const CONSUMABLE_STACK_CAPACITY = 5;

export const SLIME_SWORD: Weapon = {
  id: "slime-sword",
  name: "软泥短剑",
  damage: 8,
  heatReduction: 0,
  description: "余烬地窖的轻型武器。正确查询造成 8 点伤害，不会跳过题目阶段。",
};

export const HUNTER_BOW: Weapon = {
  id: "hunter-bow",
  name: "猎人弓",
  damage: 14,
  heatReduction: 0,
  description: "森林猎具仓的主题武器。正确查询造成 14 点伤害，不会跳过题目阶段。",
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
  "bone-armor": {
    id: "bone-armor",
    name: "骨甲",
    maxArmor: 2,
    description: "墓城遗骨拼合的护甲，提供 2 点护甲生命。",
  },
  "rune-armor": {
    id: "rune-armor",
    name: "符文甲",
    maxArmor: 2,
    description: "元素符文稳定的护甲，提供 2 点护甲生命。",
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
  "frog-potion": {
    id: "frog-potion",
    name: "蛙药",
    description: "恢复 1 点基础生命；生命已满时恢复 1 点护甲生命。",
    effect: "heal-both",
    amount: 1,
  },
  "forest-fruit": {
    id: "forest-fruit",
    name: "树果",
    description: "优先恢复 1 点基础生命；生命已满时恢复 1 点护甲生命。",
    effect: "heal-both",
    amount: 1,
  },
  "holy-water": {
    id: "holy-water",
    name: "圣水",
    description: "驱散墓城寒意，恢复 1 点基础生命与 1 点护甲生命。",
    effect: "heal-both",
    amount: 1,
  },
  "fire-crystal": {
    id: "fire-crystal",
    name: "火晶",
    description: "熔炉结晶，恢复 1 点基础生命。",
    effect: "heal-hp",
    amount: 1,
  },
  "ice-crystal": {
    id: "ice-crystal",
    name: "冰晶",
    description: "寒霜结晶，恢复当前防具的全部护甲生命。",
    effect: "heal-armor",
    amount: 3,
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
  "slime-sword": SLIME_SWORD,
  "hunter-bow": HUNTER_BOW,
  "bone-blade": BONE_BLADE,
  "rune-staff": RUNE_STAFF,
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

const BIOME_CONSUMABLE: Readonly<Record<BiomeKind, Consumable>> = {
  drainage: CONSUMABLES["water-drop"],
  "slime-pool": CONSUMABLES["slime-gel"],
  "ember-cellar": CONSUMABLES.whetstone,
  lake: CONSUMABLES["water-drop"],
  swamp: CONSUMABLES["frog-potion"],
  forest: CONSUMABLES["forest-fruit"],
  "bone-yard": CONSUMABLES["holy-water"],
  "grave-mire": CONSUMABLES["holy-water"],
  "spirit-crypt": CONSUMABLES["repair-shard"],
  "fire-forge": CONSUMABLES["fire-crystal"],
  "frost-vault": CONSUMABLES["ice-crystal"],
  "storm-core": CONSUMABLES["repair-shard"],
};

function roleProbability(
  role: BiomeEncounterRole | "curriculum" | "floor-boss",
  normal: number,
  miniElite: number,
  areaBoss: number,
  floorBoss: number,
): number {
  if (role === "mini-elite") return miniElite;
  if (role === "area-boss") return areaBoss;
  if (role === "floor-boss") return floorBoss;
  return normal;
}

export function lootCandidatesForBiome(
  floor: FloorNumber,
  biome: BiomeKind,
  role: BiomeEncounterRole | "curriculum" | "floor-boss",
): LootCandidate[] {
  const consumable = BIOME_CONSUMABLE[biome];
  const weapon = floor === 1
    ? SLIME_SWORD
    : floor === 2 ? HUNTER_BOW : floor === 3 ? BONE_BLADE : RUNE_STAFF;
  const armor = floor === 1
    ? ARMORS["slime-vest"]
    : floor === 2 ? ARMORS["vine-armor"] : floor === 3
      ? ARMORS["bone-armor"] : ARMORS["rune-armor"];
  const nextWeapon = floor === 1
    ? SORT_SABER
    : floor === 2 ? BONE_BLADE : floor === 3 ? RUNE_STAFF : null;
  const candidates = [
    consumableCandidate(consumable, roleProbability(role, 0.06, 0.12, 0.24, 0.24)),
    consumableCandidate(
      CONSUMABLES["repair-shard"],
      roleProbability(role, 0.02, 0.08, 0.16, 0.16),
    ),
    weaponCandidate(weapon, roleProbability(role, 0.0075, 0.03, 0.075, 0.075)),
    armorCandidate(armor, roleProbability(role, 0.005, 0.025, 0.075, 0.075)),
    ...(nextWeapon
      ? [weaponCandidate(
        nextWeapon,
        roleProbability(role, 0.0025, 0.005, 0.01, 0.015),
      )]
      : []),
  ];
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

export function lootCandidatesForFloor(floor: FloorNumber): LootCandidate[] {
  const candidates = floor === 1
    ? FLOOR_ONE_CANDIDATES
    : floor === 2
      ? FLOOR_TWO_CANDIDATES
      : lootCandidatesForBiome(
        floor,
        floor === 3 ? "bone-yard" : "fire-forge",
        "normal",
      );
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
