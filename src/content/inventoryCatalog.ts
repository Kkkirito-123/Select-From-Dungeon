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
import { IRON_AXE } from "./floor5Level";
import { DRAGON_SPEAR } from "./floor6Level";
import { CRYSTAL_BLADE } from "./floor7Level";
import { ROYAL_SWORD } from "./floor8Level";

export {
  BONE_BLADE,
  RUNE_STAFF,
  IRON_AXE,
  DRAGON_SPEAR,
  CRYSTAL_BLADE,
  ROYAL_SWORD,
};

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
  "ember-echo-robe": {
    id: "ember-echo-robe",
    name: "回燃衣",
    maxArmor: 2,
    description: "回燃残响中保存的记录衣，提供 2 点护甲生命。装备后外袍会显出余烬兜帽、黄铜护肩与持续发亮的恢复印。",
  },
  "iron-armor": {
    id: "iron-armor",
    name: "黑铁甲",
    maxArmor: 3,
    description: "要塞军械库锻造的重甲，提供 3 点护甲生命。",
  },
  "dragon-armor": {
    id: "dragon-armor",
    name: "龙鳞甲",
    maxArmor: 3,
    description: "巨龙鳞片编成的护甲，提供 3 点护甲生命。",
  },
  "crystal-armor": {
    id: "crystal-armor",
    name: "水晶甲",
    maxArmor: 4,
    description: "索引林水晶编成的护甲，提供 4 点护甲生命。",
  },
  "royal-armor": {
    id: "royal-armor",
    name: "王者甲",
    maxArmor: 5,
    description: "黑曜王城的最终护甲，提供 5 点护甲生命。",
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
  "repair-plate": {
    id: "repair-plate",
    name: "铁片",
    description: "黑铁要塞修理件，恢复当前防具的全部护甲生命。",
    effect: "heal-armor",
    amount: 3,
  },
  "dragon-potion": {
    id: "dragon-potion",
    name: "龙药",
    description: "龙巢热药，恢复 2 点基础生命与 1 点护甲生命。",
    effect: "heal-both",
    amount: 2,
  },
  "crystal-fruit": {
    id: "crystal-fruit",
    name: "晶果",
    description: "索引林结出的晶果，恢复 2 点基础生命。",
    effect: "heal-hp",
    amount: 2,
  },
  "black-potion": {
    id: "black-potion",
    name: "黑药",
    description: "黑曜王城的药剂，恢复 2 点基础生命与护甲生命。",
    effect: "heal-both",
    amount: 2,
  },
  "full-potion": {
    id: "full-potion",
    name: "全药",
    description: "最终补给，恢复 5 点基础生命与护甲生命。",
    effect: "heal-both",
    amount: 5,
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
  "iron-axe": IRON_AXE,
  "dragon-spear": DRAGON_SPEAR,
  "crystal-blade": CRYSTAL_BLADE,
  "royal-sword": ROYAL_SWORD,
};

export interface LootCandidate {
  item: Omit<LootItem, "dropId" | "guaranteed" | "probability">;
  probability: number;
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
  "iron-yard": CONSUMABLES["repair-plate"],
  barracks: CONSUMABLES["repair-plate"],
  "black-citadel": CONSUMABLES.whetstone,
  "magma-nest": CONSUMABLES["dragon-potion"],
  "crystal-cavern": CONSUMABLES["ice-crystal"],
  "dragon-throne": CONSUMABLES["dragon-potion"],
  "crystal-grove": CONSUMABLES["crystal-fruit"],
  "root-maze": CONSUMABLES["crystal-fruit"],
  "index-heart": CONSUMABLES["repair-shard"],
  "obsidian-hall": CONSUMABLES["black-potion"],
  "void-court": CONSUMABLES["black-potion"],
  "data-throne": CONSUMABLES["full-potion"],
};

export function optionalRecoveryProbability(
  role: BiomeEncounterRole | "curriculum" | "floor-boss",
): number {
  if (role === "mini-elite") return 0.05;
  if (role === "area-boss") return 0.1;
  if (role === "curriculum" || role === "floor-boss") return 0;
  return 0.02;
}

export function lootCandidatesForBiome(
  _floor: FloorNumber,
  biome: BiomeKind,
  role: BiomeEncounterRole | "curriculum" | "floor-boss",
): LootCandidate[] {
  const consumable = BIOME_CONSUMABLE[biome];
  const candidates = [
    consumableCandidate(consumable, optionalRecoveryProbability(role)),
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
  const candidates = lootCandidatesForBiome(
    floor,
    floor === 1
      ? "drainage"
      : floor === 2 ? "lake" : floor === 3
        ? "bone-yard"
        : floor === 4 ? "fire-forge" : floor === 5 ? "iron-yard" : floor === 6
          ? "magma-nest" : floor === 7 ? "crystal-grove" : "obsidian-hall",
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
