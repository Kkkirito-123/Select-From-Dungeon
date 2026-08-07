/** 楼层与模式对应的项目内音乐数据，不读写游戏状态或浏览器存档。 */
export type DungeonFloor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ArcadeMusicMode = "explore" | "combat" | "boss";
export type ScoreFocus = "world" | "thinking" | "resolving";
export type GentleWaveform = "sine" | "triangle";

export interface ScoreScene {
  floor: DungeonFloor;
  region: number;
  mode: ArcadeMusicMode;
}

type ScaleDegree = number | null;

export interface ScoreMovementProfile {
  readonly bpm: number;
  readonly lowPassHz: number;
  readonly voiceLimit: number;
  readonly energy: number;
  readonly melodyWave: GentleWaveform;
  readonly bassWave: GentleWaveform;
  readonly padWave: GentleWaveform;
  readonly motifs: readonly (readonly ScaleDegree[])[];
  readonly bassDegrees: readonly ScaleDegree[];
  readonly bedDegrees: readonly number[];
  readonly kicks: readonly number[];
  readonly hats: readonly number[];
  readonly cyclesBeforeVariation: number;
}

export interface FloorScoreProfile {
  readonly floor: DungeonFloor;
  readonly id: string;
  readonly title: string;
  readonly origin: "public-domain-electronic-adaptation";
  readonly sourceWork: string;
  readonly composer: string;
  readonly tonalCenter: string;
  readonly scaleName: string;
  readonly tonicMidi: number;
  readonly scaleIntervals: readonly number[];
  readonly regionOffsets: readonly number[];
  readonly movements: Readonly<Record<ArcadeMusicMode, ScoreMovementProfile>>;
}

export interface MusicPattern {
  readonly id: string;
  readonly title: string;
  readonly mode: ArcadeMusicMode;
  readonly stepSeconds: number;
  readonly phraseSteps: number;
  readonly cyclesBeforeChange: number;
  readonly melody: readonly (number | null)[];
  readonly bass: readonly (number | null)[];
  readonly bed: readonly number[];
  readonly bedDurationSeconds: number;
  readonly kicks: readonly number[];
  readonly hats: readonly number[];
  readonly melodyWave: GentleWaveform;
  readonly bassWave: GentleWaveform;
  readonly padWave: GentleWaveform;
  readonly melodyLevel: number;
  readonly bassLevel: number;
  readonly padLevel: number;
  readonly kickLevel: number;
  readonly hatLevel: number;
  readonly voiceLimit: number;
  readonly lowPassHz: number;
}

function movement(
  bpm: number,
  lowPassHz: number,
  voiceLimit: number,
  energy: number,
  motifs: readonly (readonly ScaleDegree[])[],
  bassDegrees: readonly ScaleDegree[],
  bedDegrees: readonly number[],
  kicks: readonly number[],
  hats: readonly number[],
  waves: readonly [GentleWaveform, GentleWaveform, GentleWaveform] = [
    "sine",
    "triangle",
    "sine",
  ],
): ScoreMovementProfile {
  return {
    bpm,
    lowPassHz,
    voiceLimit,
    energy,
    motifs,
    bassDegrees,
    bedDegrees,
    kicks,
    hats,
    melodyWave: waves[0],
    bassWave: waves[1],
    padWave: waves[2],
    cyclesBeforeVariation: motifs.length > 1 ? 2 : 99,
  };
}

const FLOOR_ONE: FloorScoreProfile = {
  floor: 1,
  id: "ember-archive",
  title: "余烬中的星",
  origin: "public-domain-electronic-adaptation",
  sourceWork: "《小星星变奏曲》K.265",
  composer: "Wolfgang Amadeus Mozart",
  tonalCenter: "A",
  scaleName: "A Dorian",
  tonicMidi: 57,
  scaleIntervals: [0, 2, 3, 5, 7, 9, 10],
  regionOffsets: [0, 2, -2],
  movements: {
    explore: movement(
      72,
      1_850,
      4,
      0.34,
      [
        [0, 0, 4, 4, 5, 5, 4, null, 3, 3, 2, 2, 1, 1, 0, null],
        [4, 4, 3, 3, 2, 2, 1, null, 4, 4, 3, 3, 2, 2, 1, null],
      ],
      [0, null, null, null, 3, null, null, null, 5, null, null, null, 3, null, null, null],
      [0, 4],
      [0, 8],
      [],
    ),
    combat: movement(
      100,
      2_250,
      4,
      0.58,
      [[0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0, 4, 0]],
      [0, null, 0, null, 3, null, 4, null, 0, null, 5, null, 3, null, 1, null],
      [0, 4],
      [0, 4, 8, 12],
      [6, 14],
      ["triangle", "triangle", "sine"],
    ),
    boss: movement(
      112,
      2_450,
      5,
      0.68,
      [[0, 4, 5, 4, 3, 2, 1, 0, 4, 7, 8, 7, 5, 4, 2, 0]],
      [0, null, 3, null, 0, null, 4, null, 1, null, 5, null, 3, null, 2, null],
      [0, 3],
      [0, 3, 6, 8, 11, 14],
      [5, 13],
      ["triangle", "triangle", "sine"],
    ),
  },
};

const FLOOR_TWO: FloorScoreProfile = {
  floor: 2,
  id: "tidal-archipelago",
  title: "潮汐水上曲",
  origin: "public-domain-electronic-adaptation",
  sourceWork: "《水上音乐》HWV 348–350",
  composer: "George Frideric Handel",
  tonalCenter: "D",
  scaleName: "D Mixolydian",
  tonicMidi: 62,
  scaleIntervals: [0, 2, 4, 5, 7, 9, 10],
  regionOffsets: [-2, 0, 2],
  movements: {
    explore: movement(
      76,
      2_050,
      4,
      0.36,
      [
        [0, null, 1, 3, 4, 3, 1, null, 2, null, 4, 6, 5, 3, 2, null],
        [4, null, 3, 1, 0, 1, 3, null, 5, null, 4, 2, 1, 2, 0, null],
      ],
      [0, null, null, 0, 4, null, null, 4, 5, null, null, 5, 3, null, null, 3],
      [0, 3],
      [0, 8],
      [12],
      ["sine", "triangle", "sine"],
    ),
    combat: movement(
      104,
      2_400,
      4,
      0.6,
      [[0, 3, 5, 4, 2, 4, 6, 5, 1, 3, 4, 7, 6, 4, 2, 1]],
      [0, null, 4, null, 0, null, 5, null, 1, null, 4, null, 3, null, 5, null],
      [0, 4],
      [0, 4, 8, 12],
      [6, 14],
    ),
    boss: movement(
      116,
      2_650,
      5,
      0.7,
      [[0, 4, 3, 6, 5, 2, 4, 7, 1, 5, 4, 8, 7, 3, 2, 6]],
      [0, null, 4, 0, 5, null, 3, null, 1, null, 5, 1, 4, null, 2, null],
      [0, 4],
      [0, 3, 6, 8, 11, 14],
      [5, 13],
      ["triangle", "triangle", "sine"],
    ),
  },
};

const FLOOR_THREE: FloorScoreProfile = {
  floor: 3,
  id: "frost-gravefield",
  title: "冬夜墓原",
  origin: "public-domain-electronic-adaptation",
  sourceWork: "《四季·冬》第二乐章",
  composer: "Antonio Vivaldi",
  tonalCenter: "E",
  scaleName: "E Aeolian",
  tonicMidi: 64,
  scaleIntervals: [0, 2, 3, 5, 7, 8, 10],
  regionOffsets: [-3, 0, -1],
  movements: {
    explore: movement(
      66,
      1_700,
      3,
      0.28,
      [
        [0, null, null, 2, 3, null, 1, null, 4, null, 3, 2, 0, null, null, -1],
        [2, null, 4, null, 3, null, 1, 0, null, 2, 1, null, -1, null, 0, null],
      ],
      [0, null, null, null, 3, null, null, null, 4, null, null, null, 1, null, null, null],
      [0, 4],
      [0],
      [],
      ["sine", "sine", "sine"],
    ),
    combat: movement(
      96,
      2_050,
      4,
      0.54,
      [[0, 2, 4, 3, 1, 3, 5, 2, -1, 1, 3, 6, 5, 2, 1, 0]],
      [0, null, 3, null, 0, null, 4, null, -1, null, 2, null, 1, null, 3, null],
      [0, 3],
      [0, 4, 8, 12],
      [14],
      ["triangle", "sine", "sine"],
    ),
    boss: movement(
      108,
      2_250,
      4,
      0.64,
      [[0, 3, 5, 2, 4, 1, 6, 3, -1, 2, 4, 7, 5, 3, 1, 4]],
      [0, null, 3, 0, 4, null, 1, null, -1, null, 2, -1, 3, null, 1, null],
      [0, 3],
      [0, 3, 6, 8, 11, 14],
      [5, 13],
    ),
  },
};

const FLOOR_FOUR: FloorScoreProfile = {
  floor: 4,
  id: "elemental-forge",
  title: "升炉赋格",
  origin: "public-domain-electronic-adaptation",
  sourceWork: "《平均律键盘曲集》C 小调赋格 BWV 847",
  composer: "Johann Sebastian Bach",
  tonalCenter: "B",
  scaleName: "B Phrygian",
  tonicMidi: 59,
  scaleIntervals: [0, 1, 3, 5, 7, 8, 10],
  regionOffsets: [0, 3, -2],
  movements: {
    explore: movement(
      82,
      2_150,
      4,
      0.4,
      [
        [0, 1, null, 3, 4, null, 2, 1, 0, 3, null, 5, 4, 2, 1, null],
        [0, null, 4, 3, 1, 2, null, 5, 3, null, 6, 4, 2, 3, 1, null],
      ],
      [0, null, 0, null, 3, null, 4, null, 0, null, 5, null, 2, null, 1, null],
      [0, 4],
      [0, 8],
      [6, 14],
    ),
    combat: movement(
      110,
      2_650,
      4,
      0.64,
      [[0, 1, 4, 6, 3, 5, 2, 7, 0, 3, 5, 8, 4, 2, 6, 1]],
      [0, null, 0, 4, 3, null, 5, null, 0, null, 3, 5, 2, null, 4, null],
      [0, 4],
      [0, 4, 8, 12],
      [6, 14],
      ["triangle", "triangle", "sine"],
    ),
    boss: movement(
      122,
      2_850,
      5,
      0.72,
      [[0, 4, 1, 7, 3, 6, 2, 8, 1, 5, 3, 9, 4, 7, 2, 6]],
      [0, 0, 4, null, 3, 3, 5, null, 1, 1, 5, null, 2, 2, 4, null],
      [0, 4],
      [0, 3, 6, 8, 11, 14],
      [5, 13],
    ),
  },
};

const FLOOR_FIVE: FloorScoreProfile = {
  floor: 5,
  id: "iron-outer-city",
  title: "黑铁萨拉班德",
  origin: "public-domain-electronic-adaptation",
  sourceWork: "《D 小调萨拉班德》HWV 437",
  composer: "George Frideric Handel",
  tonalCenter: "G",
  scaleName: "G Dorian",
  tonicMidi: 55,
  scaleIntervals: [0, 2, 3, 5, 7, 9, 10],
  regionOffsets: [0, -2, 2],
  movements: {
    explore: movement(
      78,
      2_250,
      4,
      0.42,
      [
        [0, 2, null, 4, 3, null, 5, 4, 1, 3, null, 6, 5, 3, 2, null],
        [4, 3, null, 1, 2, null, 5, 6, 3, 2, null, 0, 1, 3, 4, null],
      ],
      [0, null, 0, null, 4, null, 4, null, 1, null, 1, null, 3, null, 3, null],
      [0, 4],
      [0, 8],
      [6],
      ["triangle", "triangle", "sine"],
    ),
    combat: movement(
      108,
      2_700,
      4,
      0.64,
      [[0, 2, 5, 4, 3, 6, 4, 1, 2, 4, 7, 6, 3, 5, 2, 0]],
      [0, null, 0, 4, 1, null, 3, null, 2, null, 2, 5, 3, null, 1, null],
      [0, 4],
      [0, 4, 8, 12],
      [6, 14],
    ),
    boss: movement(
      118,
      2_900,
      5,
      0.72,
      [[0, 3, 6, 5, 2, 7, 4, 1, 3, 5, 8, 7, 4, 6, 2, 5]],
      [0, 0, 4, null, 1, 1, 5, null, 2, 2, 5, null, 3, 3, 1, null],
      [0, 4],
      [0, 3, 6, 8, 11, 14],
      [5, 13],
    ),
  },
};

const FLOOR_SIX: FloorScoreProfile = {
  floor: 6,
  id: "dragon-ridge",
  title: "新世界龙脊",
  origin: "public-domain-electronic-adaptation",
  sourceWork: "《第九交响曲“自新大陆”》第四乐章",
  composer: "Antonín Dvořák",
  tonalCenter: "C",
  scaleName: "C Mixolydian",
  tonicMidi: 60,
  scaleIntervals: [0, 2, 4, 5, 7, 9, 10],
  regionOffsets: [-2, 0, 3],
  movements: {
    explore: movement(
      84,
      2_400,
      4,
      0.44,
      [
        [0, null, 3, 4, 6, 5, 3, null, 1, null, 4, 5, 7, 6, 4, 2],
        [2, null, 5, 6, 4, 3, 1, null, 3, null, 6, 7, 5, 4, 2, 0],
      ],
      [0, null, 0, null, 4, null, 3, null, 1, null, 1, null, 5, null, 4, null],
      [0, 4],
      [0, 8],
      [14],
      ["sine", "triangle", "sine"],
    ),
    combat: movement(
      114,
      2_850,
      5,
      0.66,
      [[0, 3, 6, 4, 7, 5, 2, 4, 1, 4, 7, 5, 8, 6, 3, 5]],
      [0, null, 0, 4, 1, null, 5, null, 2, null, 2, 5, 3, null, 4, null],
      [0, 4],
      [0, 4, 8, 12],
      [6, 14],
      ["triangle", "triangle", "sine"],
    ),
    boss: movement(
      124,
      3_050,
      5,
      0.74,
      [[0, 4, 7, 3, 6, 9, 5, 2, 4, 8, 6, 10, 7, 5, 3, 6]],
      [0, 0, 4, null, 1, 1, 5, null, 2, 2, 5, null, 3, 3, 4, null],
      [0, 4],
      [0, 3, 6, 8, 11, 14],
      [5, 13],
    ),
  },
};

const FLOOR_SEVEN: FloorScoreProfile = {
  floor: 7,
  id: "sunset-index-garden",
  title: "残照天鹅庭",
  origin: "public-domain-electronic-adaptation",
  sourceWork: "《天鹅湖》主题",
  composer: "Pyotr Ilyich Tchaikovsky",
  tonalCenter: "E",
  scaleName: "E Lydian",
  tonicMidi: 64,
  scaleIntervals: [0, 2, 4, 6, 7, 9, 11],
  regionOffsets: [-2, 0, 1],
  movements: {
    explore: movement(
      80,
      2_650,
      4,
      0.42,
      [
        [0, null, 2, 4, 6, null, 5, 3, 1, null, 3, 5, 7, 6, 4, null],
        [4, null, 6, 7, 5, null, 3, 2, 0, null, 2, 5, 4, 3, 1, null],
      ],
      [0, null, null, 0, 4, null, null, 4, 1, null, null, 1, 3, null, null, 3],
      [0, 4],
      [0, 8],
      [],
      ["sine", "triangle", "sine"],
    ),
    combat: movement(
      106,
      3_000,
      4,
      0.62,
      [[0, 2, 5, 7, 4, 6, 3, 5, 1, 3, 6, 8, 5, 7, 4, 2]],
      [0, null, 0, 4, 1, null, 5, null, 2, null, 2, 5, 3, null, 4, null],
      [0, 4],
      [0, 4, 8, 12],
      [6, 14],
    ),
    boss: movement(
      118,
      3_200,
      5,
      0.7,
      [[0, 3, 7, 5, 8, 6, 4, 9, 2, 5, 8, 9, 7, 4, 6, 3]],
      [0, 0, 4, null, 1, 1, 5, null, 2, 2, 5, null, 3, 3, 4, null],
      [0, 4],
      [0, 3, 6, 8, 11, 14],
      [5, 13],
    ),
  },
};

const FLOOR_EIGHT: FloorScoreProfile = {
  floor: 8,
  id: "obsidian-high-hall",
  title: "高堂终章",
  origin: "public-domain-electronic-adaptation",
  sourceWork: "《第七交响曲》第二乐章",
  composer: "Ludwig van Beethoven",
  tonalCenter: "A",
  scaleName: "A Major with modal mixture",
  tonicMidi: 57,
  scaleIntervals: [0, 2, 4, 5, 7, 9, 11],
  regionOffsets: [0, 2, 5],
  movements: {
    explore: movement(
      70,
      2_850,
      5,
      0.46,
      [
        [0, null, 2, 4, 7, 6, 4, null, 1, null, 3, 5, 8, 7, 5, 2],
        [4, null, 6, 8, 7, 5, 3, null, 2, null, 5, 7, 9, 8, 6, 4],
      ],
      [0, null, null, 0, 4, null, null, 4, 1, null, null, 1, 5, null, null, 5],
      [0, 4, 7],
      [0, 8],
      [14],
      ["sine", "triangle", "sine"],
    ),
    combat: movement(
      102,
      3_150,
      5,
      0.66,
      [[0, 3, 6, 8, 5, 7, 4, 6, 2, 5, 8, 10, 7, 9, 5, 3]],
      [0, null, 0, 4, 1, null, 5, null, 2, null, 2, 5, 3, null, 4, null],
      [0, 4],
      [0, 4, 8, 12],
      [6, 14],
      ["triangle", "triangle", "sine"],
    ),
    boss: movement(
      114,
      3_350,
      5,
      0.76,
      [[0, 4, 7, 9, 6, 10, 8, 5, 3, 6, 9, 11, 8, 5, 7, 4]],
      [0, 0, 4, null, 1, 1, 5, null, 2, 2, 5, null, 3, 3, 4, null],
      [0, 4, 7],
      [0, 3, 6, 8, 11, 14],
      [5, 13],
      ["triangle", "triangle", "sine"],
    ),
  },
};

export const FLOOR_SCORE_PROFILES = [
  FLOOR_ONE,
  FLOOR_TWO,
  FLOOR_THREE,
  FLOOR_FOUR,
  FLOOR_FIVE,
  FLOOR_SIX,
  FLOOR_SEVEN,
  FLOOR_EIGHT,
] as const satisfies readonly FloorScoreProfile[];

export function floorScoreProfile(floor: DungeonFloor): FloorScoreProfile {
  return FLOOR_SCORE_PROFILES[floor - 1];
}

export function normalizeScoreScene(scene: ScoreScene): ScoreScene {
  return {
    floor: scene.floor,
    region: Math.max(0, Math.floor(Number.isFinite(scene.region) ? scene.region : 0)),
    mode: scene.mode,
  };
}

export type ScoreSceneTransition = "none" | "retarget" | "restart";

export function classifyScoreSceneTransition(
  previous: ScoreScene,
  next: ScoreScene,
): ScoreSceneTransition {
  if (
    previous.floor === next.floor &&
    previous.region === next.region &&
    previous.mode === next.mode
  ) return "none";
  if (previous.floor === next.floor && previous.mode === next.mode) return "retarget";
  return "restart";
}

function degreeToMidi(
  baseMidi: number,
  scaleIntervals: readonly number[],
  degree: number,
): number {
  const scaleLength = scaleIntervals.length;
  const octave = Math.floor(degree / scaleLength);
  const index = ((degree % scaleLength) + scaleLength) % scaleLength;
  return baseMidi + octave * 12 + scaleIntervals[index];
}

function renderDegrees(
  degrees: readonly ScaleDegree[],
  baseMidi: number,
  profile: FloorScoreProfile,
  transpose: number,
): readonly (number | null)[] {
  return degrees.map((degree) => (
    degree === null
      ? null
      : degreeToMidi(baseMidi, profile.scaleIntervals, degree) + transpose
  ));
}

export function musicPatternsForScene(scene: ScoreScene): readonly MusicPattern[] {
  const normalized = normalizeScoreScene(scene);
  const profile = floorScoreProfile(normalized.floor);
  const movementProfile = profile.movements[normalized.mode];
  const regionSlot = normalized.region % profile.regionOffsets.length;
  const transpose = profile.regionOffsets[regionSlot];
  const stepSeconds = 30 / movementProfile.bpm;

  return movementProfile.motifs.map((motif, variantIndex) => ({
    id: `f${profile.floor}-${profile.id}-${normalized.mode}-r${regionSlot}-v${variantIndex + 1}`,
    title: `${profile.title} · ${normalized.mode.toUpperCase()} ${variantIndex + 1}`,
    mode: normalized.mode,
    stepSeconds,
    phraseSteps: motif.length,
    cyclesBeforeChange: movementProfile.cyclesBeforeVariation,
    melody: renderDegrees(motif, profile.tonicMidi, profile, transpose),
    bass: renderDegrees(
      movementProfile.bassDegrees,
      Math.max(48, profile.tonicMidi - 12),
      profile,
      transpose,
    ),
    // 不叠加持续低频 Pad。旋律和短低音靠无缝调度保持连续，
    // 避免长时间驻波形成玩家反馈的“嗡嗡声”。
    bed: [],
    bedDurationSeconds: 0,
    kicks: movementProfile.kicks,
    hats: movementProfile.hats,
    melodyWave: movementProfile.melodyWave,
    bassWave: movementProfile.bassWave,
    padWave: movementProfile.padWave,
    melodyLevel: 0.026 + movementProfile.energy * 0.026,
    bassLevel: 0.018 + movementProfile.energy * 0.012,
    padLevel: 0,
    kickLevel: 0.055 + movementProfile.energy * 0.04,
    hatLevel: 0.006 + movementProfile.energy * 0.009,
    voiceLimit: movementProfile.voiceLimit,
    lowPassHz: movementProfile.lowPassHz,
  }));
}
