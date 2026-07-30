import type {
  Armor,
  Monster,
  PlayerState,
  Weapon,
} from "../domain/types";
import type { FloorNumber } from "../domain/runGraph";
import {
  monsterVisualArchetype,
  type MonsterVisualArchetype,
} from "./monsterVisuals";

export type ActorSilhouette =
  | "blob"
  | "quadruped"
  | "spirit"
  | "construct"
  | "drake"
  | "mimic"
  | "arachnid"
  | "humanoid"
  | "amphibian"
  | "treant"
  | "aquatic"
  | "dragon"
  | "crystal"
  | "eye"
  | "demon"
  | "twin";

export type ActorIdleMotion = "breathe" | "float" | "squash" | "pulse";

export interface MonsterActorProfile {
  id: MonsterVisualArchetype;
  silhouette: ActorSilhouette;
  base: number;
  accent: number;
  shadow: number;
  eye: number;
  idle: ActorIdleMotion;
  hasCrown?: boolean;
  hasWings?: boolean;
  hasWeapon?: boolean;
}

export interface PlayerActorProfile {
  stage: "keyless" | "archivist" | "migrator" | "history-set";
  coat: number;
  coatSecondary: number;
  lining: number;
  trim: number;
  face: number;
  eye: number;
  weapon: number;
  armor: number | null;
  armorStyle: "standard" | "ember-echo";
  hasMantle: boolean;
  hasLongCoat: boolean;
}

export const MONSTER_ACTOR_PROFILES: Readonly<Record<
  MonsterVisualArchetype,
  MonsterActorProfile
>> = {
  slime: profile("slime", "blob", 0x4f9a8f, 0x85c8ae, "squash"),
  hound: profile("hound", "quadruped", 0x9b6747, 0xc08b5f, "breathe"),
  ghost: profile("ghost", "spirit", 0x74558f, 0xbda4d1, "float"),
  golem: profile("golem", "construct", 0x786b57, 0xb29b77, "pulse"),
  drake: wingedProfile("drake", "drake", 0x3f67a8, 0x5ad9df, "breathe"),
  mimic: profile("mimic", "mimic", 0x6e4aa0, 0x465fc0, "squash"),
  spider: profile("spider", "arachnid", 0x68449a, 0x68e8ee, "pulse"),
  wraith: profile("wraith", "spirit", 0x7547a7, 0x68e8ee, "float"),
  titan: profile("titan", "construct", 0x303e88, 0x8d51bf, "pulse", true),
  skeleton: profile("skeleton", "humanoid", 0xd8cfb6, 0xa59b83, "breathe", false, true),
  zombie: profile("zombie", "humanoid", 0x70805a, 0x98a57b, "breathe"),
  necromancer: profile("necromancer", "spirit", 0x68447d, 0xc2a45c, "float", true),
  elemental: profile("elemental", "crystal", 0xd28a48, 0xffd26e, "pulse"),
  "storm-beast": profile("storm-beast", "quadruped", 0x57517f, 0xb997dc, "pulse"),
  humanoid: profile("humanoid", "humanoid", 0x66727a, 0xa9b0b2, "breathe", false, true),
  dragon: wingedProfile("dragon", "dragon", 0xa54b38, 0xe19056, "breathe"),
  frog: profile("frog", "amphibian", 0x62a95e, 0xa8cc65, "squash"),
  treant: profile("treant", "treant", 0x745037, 0x4d8c57, "breathe"),
  "branch-imp": profile("branch-imp", "treant", 0x5e5235, 0x76a25a, "squash"),
  "water-beast": profile("water-beast", "aquatic", 0x397e9d, 0x5fb2c7, "float"),
  "jungle-king": profile("jungle-king", "treant", 0x69543a, 0x3f7645, "breathe", true),
  "index-guard": profile("index-guard", "crystal", 0x315f57, 0x83d9c4, "pulse", false, true),
  "root-beast": profile("root-beast", "quadruped", 0x5c7042, 0x8f7650, "breathe"),
  "crystal-spirit": profile("crystal-spirit", "crystal", 0x53b6b7, 0xa9f4eb, "float"),
  "vine-witch": profile("vine-witch", "humanoid", 0x47613d, 0x789167, "float", false, true),
  "index-eye": profile("index-eye", "eye", 0x315b59, 0x91ddd3, "pulse"),
  "index-tree": profile("index-tree", "treant", 0x6f5339, 0x55956d, "breathe", true),
  demon: wingedProfile("demon", "demon", 0x6f3140, 0x8a3d4c, "breathe"),
  "demon-general": profile(
    "demon-general",
    "humanoid",
    0x532d3b,
    0xa85458,
    "breathe",
    false,
    true,
  ),
  "dark-knight": profile("dark-knight", "humanoid", 0x333743, 0xba5362, "breathe", false, true),
  lich: profile("lich", "spirit", 0x40376f, 0x63e1cb, "float"),
  "obsidian-golem": profile("obsidian-golem", "construct", 0x292633, 0x9f6abb, "pulse"),
  "replica-twin": profile("replica-twin", "twin", 0x4a4162, 0x496d82, "breathe"),
  "shard-beast": profile("shard-beast", "quadruped", 0x433552, 0x9d72b4, "pulse"),
  "demon-king": wingedProfile("demon-king", "demon", 0x5c2535, 0xf0c75e, "breathe", true),
};

const PLAYER_STAGE_BY_FLOOR: Readonly<Record<FloorNumber, PlayerActorProfile["stage"]>> = {
  1: "keyless",
  2: "keyless",
  3: "archivist",
  4: "archivist",
  5: "migrator",
  6: "migrator",
  7: "history-set",
  8: "history-set",
};

const PLAYER_STAGE_COLORS: Readonly<Record<
  PlayerActorProfile["stage"],
  Omit<PlayerActorProfile, "stage" | "weapon" | "armor" | "armorStyle">
>> = {
  keyless: {
    coat: 0x3d5078,
    coatSecondary: 0x6a7fac,
    lining: 0x28364f,
    trim: 0xd7ad55,
    face: 0xe8dfc7,
    eye: 0x14161d,
    hasMantle: false,
    hasLongCoat: false,
  },
  archivist: {
    coat: 0x263650,
    coatSecondary: 0x41577c,
    lining: 0x18212f,
    trim: 0x78c9b8,
    face: 0xe8dfc7,
    eye: 0x14161d,
    hasMantle: true,
    hasLongCoat: false,
  },
  migrator: {
    coat: 0x222733,
    coatSecondary: 0x3f4753,
    lining: 0x7b302d,
    trim: 0xd7ad55,
    face: 0xe8dfc7,
    eye: 0x14161d,
    hasMantle: true,
    hasLongCoat: true,
  },
  "history-set": {
    coat: 0x171823,
    coatSecondary: 0x2a2d39,
    lining: 0x3d5078,
    trim: 0xe0bf63,
    face: 0xf1e7cc,
    eye: 0x63d7c5,
    hasMantle: true,
    hasLongCoat: true,
  },
};

export const SCRIBE_ACTOR_PROFILE = {
  robe: 0x202a3b,
  robeSecondary: 0x39455c,
  paper: 0xe8dfc7,
  hair: 0xc7c1b5,
  eye: 0x547c78,
  lamp: 0xf0ad55,
  trim: 0x78c9b8,
} as const;

function profile(
  id: MonsterVisualArchetype,
  silhouette: ActorSilhouette,
  base: number,
  accent: number,
  idle: ActorIdleMotion,
  hasCrown = false,
  hasWeapon = false,
): MonsterActorProfile {
  return {
    id,
    silhouette,
    base,
    accent,
    shadow: mixColor(base, 0x08090c, 0.52),
    eye: 0xf4e5a1,
    idle,
    hasCrown,
    hasWeapon,
  };
}

function wingedProfile(
  id: MonsterVisualArchetype,
  silhouette: ActorSilhouette,
  base: number,
  accent: number,
  idle: ActorIdleMotion,
  hasCrown = false,
): MonsterActorProfile {
  return {
    ...profile(id, silhouette, base, accent, idle, hasCrown),
    hasWings: true,
  };
}

function mixColor(left: number, right: number, ratio: number): number {
  const mix = (shift: number) => Math.round(
    ((left >> shift) & 0xff) * (1 - ratio) +
    ((right >> shift) & 0xff) * ratio,
  );
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

function weaponColor(weapon: Weapon): number {
  if (weapon.id.includes("crystal")) return 0x78dfd0;
  if (weapon.id.includes("royal")) return 0xf0c75e;
  if (weapon.id.includes("dragon")) return 0xe36a48;
  if (weapon.id.includes("bone")) return 0xd8cfb6;
  if (weapon.id.includes("rune") || weapon.id.includes("null")) return 0x9b78cc;
  if (weapon.id.includes("iron") || weapon.id.includes("hammer")) return 0x9ca4aa;
  if (weapon.id.includes("bow")) return 0xb67d4e;
  return 0xd7ad55;
}

function armorColor(armor: Armor | null): number | null {
  if (!armor) return null;
  if (armor.id === "royal-armor") return 0xc7a74f;
  if (armor.id === "crystal-armor") return 0x63cdbd;
  if (armor.id === "dragon-armor") return 0xb64f3b;
  if (armor.id === "iron-armor") return 0x68747b;
  if (armor.id === "rune-armor") return 0x7d5da0;
  if (armor.id === "ember-echo-robe") return 0x9d533d;
  if (armor.id === "bone-armor") return 0xbeb49a;
  if (armor.id === "vine-armor") return 0x648057;
  return 0x579084;
}

export function playerActorProfile(
  floor: FloorNumber,
  player: Pick<PlayerState, "weapon" | "armor">,
): PlayerActorProfile {
  const stage = PLAYER_STAGE_BY_FLOOR[floor];
  const echoRobe = player.armor?.id === "ember-echo-robe";
  return {
    stage,
    ...PLAYER_STAGE_COLORS[stage],
    ...(echoRobe ? {
      coat: 0x382a31,
      coatSecondary: 0x6f3e38,
      lining: 0x181b22,
      trim: 0xe0b65d,
      hasMantle: true,
      hasLongCoat: true,
    } : {}),
    weapon: weaponColor(player.weapon),
    armor: armorColor(player.armor),
    armorStyle: echoRobe ? "ember-echo" : "standard",
  };
}

export function monsterActorProfile(
  monster: Pick<Monster, "kind" | "species" | "isBoss">,
): MonsterActorProfile {
  const archetype = monsterVisualArchetype(monster);
  const source = MONSTER_ACTOR_PROFILES[archetype];
  let base = source.base;
  let accent = source.accent;

  if (archetype === "slime") {
    if (monster.species.includes("poison")) [base, accent] = [0x76538f, 0xb37bc1];
    if (monster.species.includes("water")) [base, accent] = [0x3e86a0, 0x72c5dc];
    if (monster.species.includes("iron")) [base, accent] = [0x747e83, 0xb3babd];
  }
  if (archetype === "elemental") {
    if (monster.kind === "fire-spirit") [base, accent] = [0xd94f38, 0xffb257];
    if (monster.kind === "ice-spirit") [base, accent] = [0x5caed2, 0xbceeff];
    if (monster.kind === "thunder-spirit") [base, accent] = [0x8869c8, 0xe4ccff];
  }
  if (archetype === "dragon") {
    if (monster.species.includes("crystal")) [base, accent] = [0x4f8298, 0x7ad8d2];
    if (monster.species.includes("thunder")) [base, accent] = [0x765b9c, 0xd5b1f0];
  }

  return {
    ...source,
    base,
    accent,
    shadow: mixColor(base, 0x08090c, 0.52),
    hasCrown: source.hasCrown || monster.isBoss,
  };
}

export function assertActorVisualCatalog(): string[] {
  const errors: string[] = [];
  const entries = Object.entries(MONSTER_ACTOR_PROFILES);
  if (entries.length !== 35) {
    errors.push(`怪物视觉目录应包含 35 个原型，当前为 ${entries.length}。`);
  }
  entries.forEach(([id, entry]) => {
    if (id !== entry.id) errors.push(`怪物视觉目录键与 ID 不一致：${id}。`);
    if (entry.base === entry.accent) errors.push(`怪物视觉 ${id} 缺少可辨识强调色。`);
  });
  return errors;
}
