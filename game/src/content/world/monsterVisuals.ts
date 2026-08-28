import type { Monster, MonsterKind } from "../../domain/shared/types";

/**
 * 视觉原型是“规则怪物种类 -> 程序化绘制配方”的中间层。
 * 规则层只保存 kind/species，不直接依赖 Phaser 颜色或几何。
 */
export type MonsterVisualArchetype =
  | "slime"
  | "hound"
  | "ghost"
  | "golem"
  | "drake"
  | "mimic"
  | "spider"
  | "wraith"
  | "titan"
  | "skeleton"
  | "zombie"
  | "necromancer"
  | "elemental"
  | "storm-beast"
  | "humanoid"
  | "dragon"
  | "frog"
  | "treant"
  | "branch-imp"
  | "water-beast"
  | "jungle-king"
  | "index-guard"
  | "root-beast"
  | "crystal-spirit"
  | "vine-witch"
  | "index-eye"
  | "index-tree"
  | "demon"
  | "demon-general"
  | "dark-knight"
  | "lich"
  | "obsidian-golem"
  | "replica-twin"
  | "shard-beast"
  | "demon-king";

export const MONSTER_KIND_VISUALS: Readonly<Record<
  MonsterKind,
  MonsterVisualArchetype
>> = {
  // 默认按 MonsterKind 映射；特殊物种在 monsterVisualArchetype 中覆盖。
  "projection-slime": "slime",
  "filter-hound": "hound",
  "null-ghost": "ghost",
  "aggregate-golem": "golem",
  "sort-drake": "drake",
  "distinct-mimic": "mimic",
  "join-spider": "spider",
  "left-join-wraith": "wraith",
  "relation-titan": "titan",
  skeleton: "skeleton",
  zombie: "zombie",
  ghost: "ghost",
  necromancer: "necromancer",
  "fire-spirit": "elemental",
  "ice-spirit": "elemental",
  "thunder-spirit": "elemental",
  "elemental-king": "elemental",
  goblin: "humanoid",
  orc: "humanoid",
  knight: "humanoid",
  troll: "humanoid",
  "castle-lord": "humanoid",
  hatchling: "dragon",
  wyvern: "dragon",
  dragon: "dragon",
  "dragon-king": "dragon",
  "index-guard": "index-guard",
  "root-beast": "root-beast",
  "crystal-spirit": "crystal-spirit",
  "vine-witch": "vine-witch",
  "index-eye": "index-eye",
  "index-tree": "index-tree",
  "demon-soldier": "demon",
  "dark-knight": "dark-knight",
  lich: "lich",
  "obsidian-golem": "obsidian-golem",
  "replica-twin": "replica-twin",
  "shard-beast": "shard-beast",
  "demon-king": "demon-king",
};

export function monsterVisualArchetype(
  monster: Pick<Monster, "kind" | "species">,
): MonsterVisualArchetype {
  // species 是内容作者的细粒度标签，例如 frog/treant；它比通用 kind 更适合表达外观变体。
  if (monster.species.includes("frog")) return "frog";
  if (monster.species.includes("treant")) return "treant";
  if (monster.species.includes("storm_beast")) return "storm-beast";
  if (monster.species.includes("branch_imp")) return "branch-imp";
  if (monster.species.includes("demon_general")) return "demon-general";
  if (
    monster.species.includes("lake") ||
    monster.species.includes("water_snake")
  ) return "water-beast";
  if (monster.species.includes("jungle_king")) return "jungle-king";
  return MONSTER_KIND_VISUALS[monster.kind];
}
