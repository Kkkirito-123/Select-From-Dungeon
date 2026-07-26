import type { Monster, ProfileProgress } from "./types";

export interface MonsterIdentityPresentation {
  discovered: boolean;
  idLabel: string;
  nameLabel: string;
  worldLabel: string;
  speciesLabel: string;
}

export function monsterIdLabel(id: number): string {
  return `ID #${String(id).padStart(3, "0")}`;
}

const MONSTER_KIND_LABEL: Readonly<Record<Monster["kind"], string>> = {
  "projection-slime": "软体记录",
  "filter-hound": "追踪兽",
  "null-ghost": "空值幽灵",
  "aggregate-golem": "聚合石像",
  "sort-drake": "序列龙兽",
  "distinct-mimic": "镜像拟态",
  "join-spider": "关系织者",
  "left-join-wraith": "残缺幽影",
  "relation-titan": "关系巨像",
  skeleton: "骸骨",
  zombie: "腐尸",
  ghost: "游魂",
  necromancer: "墓地术士",
  "fire-spirit": "火灵",
  "ice-spirit": "冰灵",
  "thunder-spirit": "雷灵",
  "elemental-king": "元素领主",
  goblin: "地精",
  orc: "战兽",
  knight: "铁甲骑士",
  troll: "巨魔",
  "castle-lord": "城堡领主",
  hatchling: "幼龙",
  wyvern: "翼龙",
  dragon: "巨龙",
  "dragon-king": "古龙领主",
  "index-guard": "索引守卫",
  "root-beast": "根兽",
  "crystal-spirit": "晶灵",
  "vine-witch": "藤蔓巫师",
  "index-eye": "索引之眼",
  "index-tree": "索引古树",
  "demon-soldier": "魔兵",
  "dark-knight": "黑骑士",
  lich: "巫妖",
  "obsidian-golem": "黑曜石像",
  "replica-twin": "镜像双生",
  "shard-beast": "分片兽",
  "demon-king": "魔王",
};

export function monsterKindLabel(
  monster: Pick<Monster, "kind">,
): string {
  return MONSTER_KIND_LABEL[monster.kind];
}

export function isMonsterIdentityDiscovered(
  monsterId: number,
  discoveredMonsterIds: readonly number[],
): boolean {
  return discoveredMonsterIds.includes(monsterId);
}

export function monsterIdentityPresentation(
  monster: Pick<Monster, "id" | "name" | "species" | "kind">,
  discoveredMonsterIds: readonly number[],
): MonsterIdentityPresentation {
  const idLabel = monsterIdLabel(monster.id);
  const discovered = isMonsterIdentityDiscovered(
    monster.id,
    discoveredMonsterIds,
  );
  return {
    discovered,
    idLabel,
    nameLabel: discovered ? monster.name : idLabel,
    worldLabel: discovered ? `${monster.name} · ${idLabel}` : idLabel,
    speciesLabel: discovered
      ? `类型 = ${monsterKindLabel(monster)}`
      : "类型 = 未识别",
  };
}

export function monsterIntentName(
  monster: Pick<Monster, "id" | "attackName" | "isBoss">,
  discoveredMonsterIds: readonly number[],
): string {
  if (isMonsterIdentityDiscovered(monster.id, discoveredMonsterIds)) {
    return monster.attackName;
  }
  return monster.isBoss ? "规则反击正在蓄力" : "攻击正在蓄力";
}

export function monsterNameForProfile(
  monster: Pick<Monster, "id" | "name">,
  profile: Pick<ProfileProgress, "discoveredMonsterIds">,
): string {
  return isMonsterIdentityDiscovered(
    monster.id,
    profile.discoveredMonsterIds,
  )
    ? monster.name
    : monsterIdLabel(monster.id);
}

export function recoverMonsterIdentity(
  profile: ProfileProgress,
  monsterId: number,
): boolean {
  if (profile.discoveredMonsterIds.includes(monsterId)) return false;
  profile.discoveredMonsterIds = [...profile.discoveredMonsterIds, monsterId]
    .sort((left, right) => left - right);
  return true;
}
