import type { Monster, MonsterKind } from "../domain/types";

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
  | "humanoid"
  | "dragon"
  | "frog"
  | "treant"
  | "water-beast"
  | "jungle-king"
  | "index-guard"
  | "root-beast"
  | "crystal-spirit"
  | "vine-witch"
  | "index-eye"
  | "index-tree"
  | "demon"
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
  if (monster.species.includes("frog")) return "frog";
  if (monster.species.includes("treant")) return "treant";
  if (
    monster.species.includes("lake") ||
    monster.species.includes("water_snake")
  ) return "water-beast";
  if (monster.species.includes("jungle_king")) return "jungle-king";
  return MONSTER_KIND_VISUALS[monster.kind];
}
