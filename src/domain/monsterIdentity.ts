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
  "demon-king": "档案领主",
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
    // 已写入图鉴的名字也不回流到活体标签，避免新 Run 提前泄露身份。
    nameLabel: idLabel,
    worldLabel: idLabel,
    speciesLabel: "类型 = 未识别",
  };
}

export function monsterIntentName(
  monster: Pick<Monster, "id" | "attackName" | "isBoss">,
  discoveredMonsterIds: readonly number[],
): string {
  void discoveredMonsterIds;
  return monster.isBoss ? "规则反击正在蓄力" : "攻击正在蓄力";
}

/**
 * 最后一层展示边界：内容脚本可以继续持有 canonical 名称，但未恢复身份时，
 * 任何进入玩家 UI 的自由文本都只能留下稳定 ID，species 也必须隐藏。
 */
export function redactUndiscoveredMonsterIdentityText(
  value: string,
  monsters: readonly Pick<Monster, "id" | "name" | "species" | "kind">[],
  discoveredMonsterIds: readonly number[],
): string {
  const hidden = monsters
    .filter((monster) => !isMonsterIdentityDiscovered(
      monster.id,
      discoveredMonsterIds,
    ))
    .sort((left, right) => (
      right.name.length - left.name.length || left.id - right.id
    ));
  return hidden.reduce((text, monster) => {
    const identity = monsterIdentityPresentation(monster, discoveredMonsterIds);
    const withoutName = text.split(monster.name).join(identity.idLabel);
    return withoutName.split(monster.species).join("未识别类型");
  }, value);
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
