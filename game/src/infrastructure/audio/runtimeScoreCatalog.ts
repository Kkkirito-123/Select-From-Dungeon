/** 运行时音乐目录，只提供静态曲目选择数据。 */
import {
  normalizeScoreScene,
  type ArcadeMusicMode,
  type ScoreScene,
} from "./musicScore";

export interface RuntimeScoreSource {
  readonly type: "audio/ogg" | "audio/mpeg";
  readonly path: string;
}

export interface RuntimeScoreAsset {
  readonly id: string;
  readonly floor: 1 | 2;
  readonly mode: ArcadeMusicMode;
  readonly title: string;
  readonly sourceWork: string;
  readonly composer: string;
  readonly durationSeconds: number;
  readonly loopStartSeconds: number;
  readonly loopEndSeconds: number;
  readonly sources: readonly RuntimeScoreSource[];
}

const asset = (
  floor: 1 | 2,
  mode: ArcadeMusicMode,
  title: string,
  durationSeconds: number,
): RuntimeScoreAsset => {
  const floorFolder = `f${String(floor).padStart(2, "0")}`;
  const source = floor === 1
    ? {
        work: "12 Variations on “Ah vous dirai-je, Maman”, K.265",
        composer: "Wolfgang Amadeus Mozart",
      }
    : {
        work: "Water Music, HWV 348–350",
        composer: "George Frideric Handel",
      };
  return {
    id: `f${floor}-${floor === 1 ? "ember-archive" : "tidal-archipelago"}-${mode}`,
    floor,
    mode,
    title,
    sourceWork: source.work,
    composer: source.composer,
    durationSeconds,
    loopStartSeconds: 0,
    loopEndSeconds: durationSeconds,
    sources: [
      {
        type: "audio/ogg",
        path: `assets/audio/${floorFolder}/${mode}.ogg`,
      },
      {
        type: "audio/mpeg",
        path: `assets/audio/${floorFolder}/${mode}.mp3`,
      },
    ],
  };
};

export const RUNTIME_SCORE_ASSETS = [
  asset(1, "explore", "余烬里的旧歌", 53.333333),
  asset(1, "combat", "纸页疾行", 55.384615),
  asset(1, "boss", "铜印之下", 51.428571),
  asset(2, "explore", "潮汐水上曲", 50.526316),
  asset(2, "combat", "逆潮", 46.153846),
  asset(2, "boss", "七束灯火", 49.655172),
] as const satisfies readonly RuntimeScoreAsset[];

export function runtimeScoreForScene(
  scene: ScoreScene,
): RuntimeScoreAsset | null {
  const normalized = normalizeScoreScene(scene);
  if (normalized.floor > 2) return null;
  return RUNTIME_SCORE_ASSETS.find((candidate) => (
    candidate.floor === normalized.floor &&
    candidate.mode === normalized.mode
  )) ?? null;
}

export function resolveRuntimeScoreUrl(
  source: RuntimeScoreSource,
  baseUrl = import.meta.env.BASE_URL,
): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${source.path}`;
}
