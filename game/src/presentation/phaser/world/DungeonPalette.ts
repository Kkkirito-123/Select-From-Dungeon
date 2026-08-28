import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { MazeZone } from "../../../domain/exploration/mazeGenerator";

/**
 * 地图渲染使用的颜色目录。
 * 颜色属于表现层配置，按楼层/区域选择，不应被领域规则读取；数值采用 Phaser 的
 * 0xRRGGBB 格式，避免在每个 renderer 中重复解析颜色字符串。
 */
export const COLORS = {
  void: 0x08090c,
  wall: 0x252a34,
  wallTop: 0x505766,
  floor: 0x171b22,
  floorAlt: 0x1d222b,
  line: 0x0e1117,
  query: 0x78c9b8,
  gold: 0xd7ad55,
  ember: 0xc75248,
  paper: 0xe8dfc7,
  plum: 0x7f5a87,
  fog: 0x030407,
} as const;

export const HAZARD_STYLES = {
  "archive-cutter": { base: 0x2a3137, accent: 0xc75850, blade: 0xd9c9ad, motion: "spin", duration: 1_500 },
  "tidal-current": { base: 0x163a63, accent: 0x66e3ff, blade: 0x9fe8f2, motion: "spin", duration: 2_100 },
  "frost-crack": { base: 0x273143, accent: 0x9ad9ef, blade: 0xd9f4ff, motion: "pulse", duration: 2_600 },
  "elemental-vent": { base: 0x3c2431, accent: 0xf0a64d, blade: 0xd9c6ff, motion: "pulse", duration: 1_300 },
  "alarm-wire": { base: 0x322a25, accent: 0xd7ad55, blade: 0xa9a39a, motion: "sway", duration: 1_100 },
  "magma-fissure": { base: 0x421d18, accent: 0xff765a, blade: 0xffc06a, motion: "pulse", duration: 1_700 },
  "root-snare": { base: 0x203427, accent: 0xa6cf79, blade: 0x78c9b8, motion: "sway", duration: 2_300 },
  "migration-rift": { base: 0x17131f, accent: 0xd2b36b, blade: 0xa58ad8, motion: "spin", duration: 1_900 },
} as const;

export type HazardKind = keyof typeof HAZARD_STYLES;
export type HazardStyle = (typeof HAZARD_STYLES)[HazardKind];

const ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x25231d,
  tutorial: 0x16302e,
  lesson: 0x261f2b,
  rest: 0x2d211d,
  treasure: 0x2a291a,
  event: 0x221d2a,
  elite: 0x31281a,
  boss: 0x32191e,
};

const FLOOR_TWO_COLORS = {
  void: 0x070b18,
  wall: 0x281f4d,
  wallTop: 0x664f9f,
  floor: 0x102844,
  floorAlt: 0x163a63,
  line: 0x0a1528,
  query: 0x66e3ff,
  gold: 0xffd166,
  ember: 0xff4d8d,
  paper: 0xe9f7ff,
  plum: 0x8d6dff,
  fog: 0x030611,
} as const;

const FLOOR_TWO_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x142e52,
  tutorial: 0x163c5d,
  lesson: 0x27255a,
  rest: 0x19374b,
  treasure: 0x34304f,
  event: 0x2d2054,
  elite: 0x39224f,
  boss: 0x411b48,
};

const FLOOR_THREE_COLORS = {
  void: 0x080706,
  wall: 0x35302b,
  wallTop: 0x726657,
  floor: 0x25211f,
  floorAlt: 0x302925,
  line: 0x13100f,
  query: 0xa8d7c2,
  gold: 0xd5ba78,
  ember: 0x9c5149,
  paper: 0xeee6d1,
  plum: 0x785c83,
  fog: 0x050403,
} as const;

const FLOOR_THREE_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x2b2924,
  tutorial: 0x293630,
  lesson: 0x322d35,
  rest: 0x3b2921,
  treasure: 0x38321f,
  event: 0x2e2835,
  elite: 0x44331f,
  boss: 0x421f25,
};

const FLOOR_FOUR_COLORS = {
  void: 0x09060a,
  wall: 0x37233b,
  wallTop: 0x8a5c84,
  floor: 0x291a2d,
  floorAlt: 0x332039,
  line: 0x160d19,
  query: 0x7ce4ed,
  gold: 0xffc65c,
  ember: 0xef604e,
  paper: 0xfff1d8,
  plum: 0x9b57bb,
  fog: 0x050207,
} as const;

const FLOOR_FOUR_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x2e2137,
  tutorial: 0x233b45,
  lesson: 0x3a2348,
  rest: 0x43241d,
  treasure: 0x493b20,
  event: 0x2b2a4d,
  elite: 0x552923,
  boss: 0x571c27,
};

const FLOOR_FIVE_COLORS = {
  void: 0x05080b,
  wall: 0x222b32,
  wallTop: 0x687681,
  floor: 0x161d22,
  floorAlt: 0x1e272d,
  line: 0x0b1115,
  query: 0x82d5c8,
  gold: 0xe0ae4b,
  ember: 0xb94d42,
  paper: 0xe9e4d6,
  plum: 0x735b82,
  fog: 0x020405,
} as const;

const FLOOR_FIVE_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x22292b,
  tutorial: 0x213538,
  lesson: 0x2b3035,
  rest: 0x332820,
  treasure: 0x37321e,
  event: 0x282936,
  elite: 0x40311f,
  boss: 0x421d1b,
};

const FLOOR_SIX_COLORS = {
  void: 0x0b0303,
  wall: 0x352421,
  wallTop: 0x8a5a43,
  floor: 0x241512,
  floorAlt: 0x311b16,
  line: 0x160a08,
  query: 0x6ce0d5,
  gold: 0xf0bd55,
  ember: 0xf15a3f,
  paper: 0xffead2,
  plum: 0x8b4f86,
  fog: 0x050101,
} as const;

const FLOOR_SIX_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x31211b,
  tutorial: 0x22403c,
  lesson: 0x3d241e,
  rest: 0x43271c,
  treasure: 0x49361f,
  event: 0x382237,
  elite: 0x52251c,
  boss: 0x5d1815,
};

const FLOOR_SEVEN_COLORS = {
  void: 0x030909,
  wall: 0x163a35,
  wallTop: 0x58b9a8,
  floor: 0x102824,
  floorAlt: 0x173832,
  line: 0x071512,
  query: 0x8ff5df,
  gold: 0xd8ef8a,
  ember: 0x62d7bb,
  paper: 0xeafff8,
  plum: 0x6e82b9,
  fog: 0x010504,
} as const;

const FLOOR_SEVEN_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x173c36,
  tutorial: 0x174a40,
  lesson: 0x203f3b,
  rest: 0x354126,
  treasure: 0x3d4622,
  event: 0x21394a,
  elite: 0x34522e,
  boss: 0x1b593f,
};

const FLOOR_EIGHT_COLORS = {
  void: 0x020205,
  wall: 0x171522,
  wallTop: 0x5f5874,
  floor: 0x0e0d15,
  floorAlt: 0x171522,
  line: 0x050409,
  query: 0x82ded0,
  gold: 0xf0c75e,
  ember: 0xb8424f,
  paper: 0xf7edd2,
  plum: 0x704d8c,
  fog: 0x010102,
} as const;

const FLOOR_EIGHT_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x191721,
  tutorial: 0x17302f,
  lesson: 0x211a2a,
  rest: 0x302019,
  treasure: 0x352d18,
  event: 0x241b31,
  elite: 0x3c2b1b,
  boss: 0x43141d,
};

export const BIOME_COLORS = {
  drainage: { floor: 0x203138, wall: 0x364a50, accent: 0x6d9da5 },
  "slime-pool": { floor: 0x21372f, wall: 0x344b3d, accent: 0x70c489 },
  "ember-cellar": { floor: 0x3a2922, wall: 0x56352a, accent: 0xd78a4b },
  lake: { floor: 0x173b52, wall: 0x244e62, accent: 0x66c9e8 },
  swamp: { floor: 0x303b27, wall: 0x475136, accent: 0x91ad57 },
  forest: { floor: 0x17352b, wall: 0x284b39, accent: 0x62bd78 },
  "bone-yard": { floor: 0x36312a, wall: 0x51493d, accent: 0xd8c89f },
  "grave-mire": { floor: 0x2f3429, wall: 0x465044, accent: 0x9ab18b },
  "spirit-crypt": { floor: 0x2d243d, wall: 0x493759, accent: 0xb88ad6 },
  "fire-forge": { floor: 0x4a211c, wall: 0x682d24, accent: 0xff8c51 },
  "frost-vault": { floor: 0x18384b, wall: 0x28556b, accent: 0x8cdef4 },
  "storm-core": { floor: 0x282451, wall: 0x403a72, accent: 0xc58df4 },
  "iron-yard": { floor: 0x202a2d, wall: 0x38464b, accent: 0x94b9bd },
  barracks: { floor: 0x352b22, wall: 0x504136, accent: 0xd39d5e },
  "black-citadel": { floor: 0x28282c, wall: 0x434248, accent: 0xd5b65b },
  "magma-nest": { floor: 0x482018, wall: 0x682d21, accent: 0xff7749 },
  "crystal-cavern": { floor: 0x263046, wall: 0x3f4d68, accent: 0x75dfdc },
  "dragon-throne": { floor: 0x3d171b, wall: 0x5a252b, accent: 0xf0b955 },
  "crystal-grove": { floor: 0x173c35, wall: 0x27584e, accent: 0x8debd3 },
  "root-maze": { floor: 0x28392c, wall: 0x3d5941, accent: 0xa6cf79 },
  "index-heart": { floor: 0x173c3d, wall: 0x28595d, accent: 0xa9f1df },
  "obsidian-hall": { floor: 0x17151e, wall: 0x2a2736, accent: 0x8c829f },
  "void-court": { floor: 0x21162b, wall: 0x382043, accent: 0xa96fc6 },
  "data-throne": { floor: 0x2c2017, wall: 0x4c3820, accent: 0xf0c75e },
} as const;

export function colorsForFloor(floor: GameSnapshot["floor"]) {
  // 楼层 1 使用基础色板，其余楼层按固定编号切换主题色，不产生随机颜色。
  if (floor === 2) return FLOOR_TWO_COLORS;
  if (floor === 3) return FLOOR_THREE_COLORS;
  if (floor === 4) return FLOOR_FOUR_COLORS;
  if (floor === 5) return FLOOR_FIVE_COLORS;
  if (floor === 6) return FLOOR_SIX_COLORS;
  if (floor === 7) return FLOOR_SEVEN_COLORS;
  if (floor === 8) return FLOOR_EIGHT_COLORS;
  return COLORS;
}

export function zoneColorsForFloor(floor: GameSnapshot["floor"]): Record<MazeZone["type"], number> {
  // 区域色板与楼层色板分开：前者区分入口/课程/Boss，后者控制整层基调。
  if (floor === 2) return FLOOR_TWO_ZONE_COLORS;
  if (floor === 3) return FLOOR_THREE_ZONE_COLORS;
  if (floor === 4) return FLOOR_FOUR_ZONE_COLORS;
  if (floor === 5) return FLOOR_FIVE_ZONE_COLORS;
  if (floor === 6) return FLOOR_SIX_ZONE_COLORS;
  if (floor === 7) return FLOOR_SEVEN_ZONE_COLORS;
  if (floor === 8) return FLOOR_EIGHT_ZONE_COLORS;
  return ZONE_COLORS;
}
