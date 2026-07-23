export type ArcadeMusicMode = "explore" | "combat" | "boss";

export type ArcadeSfx =
  | "step"
  | "bump"
  | "encounter"
  | "query-cast"
  | "enemy-hurt"
  | "player-hurt"
  | "stage-clear"
  | "drop"
  | "pickup-weapon"
  | "pickup-relic"
  | "heal"
  | "gate"
  | "victory"
  | "defeat"
  // Compatibility aliases for the first MVP call sites.
  | "room"
  | "attack"
  | "hit"
  | "reward";

export interface ArcadeAudioOptions {
  mode?: ArcadeMusicMode;
  muted?: boolean;
  volume?: number;
}

interface MusicPattern {
  id: string;
  title: string;
  stepSeconds: number;
  cyclesBeforeChange: number;
  melody: readonly (number | null)[];
  bass: readonly (number | null)[];
  kicks: readonly number[];
  hats: readonly number[];
  melodyWave: OscillatorType;
  bassWave: OscillatorType;
}

type AudioContextConstructor = new () => AudioContext;

const SILENCE = 0.0001;
const MUSIC_GAIN_LEVEL = 0.42;
const SCHEDULE_AHEAD_SECONDS = 0.24;
const SCHEDULER_INTERVAL_MS = 80;
const MODE_FADE_SECONDS = 0.05;
const MODE_FADE_MS = MODE_FADE_SECONDS * 1_000;

// Exploration arrangements are original chip-synth miniatures built from the
// public-domain harmonic language of the credited works. No recording or
// third-party audio asset is bundled; every sound is synthesized at runtime.
const EXPLORE_PLAYLIST: readonly MusicPattern[] = [
  {
    id: "bach-c-major-circuit",
    title: "C 大调回路",
    stepSeconds: 0.225,
    cyclesBeforeChange: 4,
    melody: [60, 64, 67, 72, 64, 67, 72, 76, 59, 62, 67, 71, 62, 67, 71, 74, 57, 60, 64, 69, 60, 64, 69, 72, 55, 59, 62, 67, 59, 62, 67, 71],
    bass: [36, null, null, null, null, null, null, null, 35, null, null, null, null, null, null, null, 33, null, null, null, null, null, null, null, 31, null, null, null, null, null, null, null],
    kicks: [0, 16],
    hats: [],
    melodyWave: "sine",
    bassWave: "triangle",
  },
  {
    id: "moonlight-data-lake",
    title: "月光数据湖",
    stepSeconds: 0.245,
    cyclesBeforeChange: 4,
    melody: [61, 64, 68, 61, 64, 68, 61, 64, 59, 64, 68, 59, 64, 68, 59, 64, 57, 61, 66, 57, 61, 66, 57, 61, 56, 60, 64, 56, 60, 64, 56, 60],
    bass: [37, null, null, null, null, null, 32, null, 35, null, null, null, null, null, 32, null, 33, null, null, null, null, null, 28, null, 32, null, null, null, null, null, 27, null],
    kicks: [0, 16],
    hats: [],
    melodyWave: "triangle",
    bassWave: "sine",
  },
  {
    id: "nocturne-cache",
    title: "夜曲缓存",
    stepSeconds: 0.235,
    cyclesBeforeChange: 4,
    melody: [67, null, 71, 74, 79, 78, 76, 74, 71, null, 74, 76, 78, 76, 74, 71, 69, null, 72, 76, 81, 79, 76, 72, 71, null, 74, 79, 78, 74, 71, 67],
    bass: [31, null, null, null, 38, null, null, null, 35, null, null, null, 38, null, null, null, 33, null, null, null, 40, null, null, null, 35, null, null, null, 38, null, null, null],
    kicks: [0, 16],
    hats: [7, 15, 23, 31],
    melodyWave: "sine",
    bassWave: "triangle",
  },
  {
    id: "mozart-adagio-terminal",
    title: "柔板终端",
    stepSeconds: 0.22,
    cyclesBeforeChange: 4,
    melody: [69, 72, 76, 74, 72, 71, 69, null, 67, 71, 74, 72, 71, 69, 67, null, 64, 67, 71, 69, 67, 66, 64, null, 62, 66, 69, 71, 69, 66, 64, null],
    bass: [33, null, null, null, 40, null, null, null, 31, null, null, null, 38, null, null, null, 28, null, null, null, 35, null, null, null, 26, null, null, null, 33, null, null, null],
    kicks: [0, 16],
    hats: [],
    melodyWave: "triangle",
    bassWave: "sine",
  },
];

const COMBAT_PLAYLIST: readonly MusicPattern[] = [{
  id: "star-castle-overdrive",
  title: "星城超频",
  stepSeconds: 0.1,
  cyclesBeforeChange: 99,
  melody: [69, 72, 76, 81, 79, 76, 72, 74, 70, 74, 77, 82, 81, 77, 74, 72, 68, 71, 75, 80, 78, 75, 71, 73, 67, 70, 74, 79, 77, 74, 70, 67],
  bass: [33, null, 33, 40, 33, null, 36, null, 34, null, 34, 41, 34, null, 38, null, 32, null, 32, 39, 32, null, 35, null, 31, null, 31, 38, 31, 35, 38, 43],
  kicks: [0, 4, 8, 12, 16, 20, 24, 26, 28],
  hats: [2, 6, 10, 14, 18, 22, 26, 30],
  melodyWave: "square",
  bassWave: "sawtooth",
}];

const BOSS_PLAYLIST: readonly MusicPattern[] = [{
  id: "overseer-redline",
  title: "监视者红线",
  stepSeconds: 0.086,
  cyclesBeforeChange: 99,
  melody: [57, 58, 64, 69, 63, 58, 70, 64, 56, 57, 63, 68, 62, 57, 69, 63, 55, 61, 66, 72, 65, 60, 71, 65, 54, 60, 65, 71, 64, 59, 70, 64],
  bass: [33, null, 34, 40, 27, null, 28, 34, 32, null, 33, 39, 26, null, 27, 33, 31, null, 37, 43, 25, null, 31, 37, 30, null, 36, 42, 24, 30, 36, 42],
  kicks: [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30],
  hats: [1, 5, 9, 13, 17, 21, 25, 29, 31],
  melodyWave: "sawtooth",
  bassWave: "square",
}];

// Floor-two exploration uses independently sequenced chip arrangements of
// public-domain Beethoven scores. No recording, modern edition, stem, or game
// soundtrack is imported. The combat patterns below are original compositions.
const FLOOR_TWO_EXPLORE_PLAYLIST: readonly MusicPattern[] = [
  {
    id: "beethoven-fifth-thunder-bus",
    title: "命运雷鸣总线",
    stepSeconds: 0.16,
    cyclesBeforeChange: 4,
    melody: [67, 67, 67, 63, null, null, 65, 65, 65, 62, null, null, 67, 67, 67, 63, 68, 68, 68, 67, 63, 63, 63, 60],
    bass: [36, null, 36, null, 31, null, 34, null, 34, null, 29, null, 36, null, 36, null, 32, null, 32, null, 27, null, 27, null],
    kicks: [0, 6, 12, 18],
    hats: [5, 11, 17, 23],
    melodyWave: "triangle",
    bassWave: "sawtooth",
  },
  {
    id: "beethoven-elise-packet",
    title: "致爱丽丝数据包",
    stepSeconds: 0.175,
    cyclesBeforeChange: 4,
    melody: [76, 75, 76, 75, 76, 71, 74, 72, 69, null, 60, 64, 69, 71, null, 64, 68, 71, 72, null, 64, 76, 75, 76],
    bass: [45, null, null, null, 40, null, null, null, 45, null, 33, null, null, null, 40, null, 32, null, null, null, 40, null, 45, null],
    kicks: [0, 8, 16],
    hats: [7, 15, 23],
    melodyWave: "square",
    bassWave: "triangle",
  },
  {
    id: "beethoven-moonlight-voltage",
    title: "月光电压",
    stepSeconds: 0.205,
    cyclesBeforeChange: 4,
    melody: [61, 64, 68, 61, 64, 68, 61, 64, 59, 64, 68, 59, 64, 68, 59, 64, 57, 61, 66, 57, 61, 66, 57, 61],
    bass: [37, null, null, null, null, null, 32, null, 35, null, null, null, null, null, 32, null, 33, null, null, null, null, null, 28, null],
    kicks: [0, 8, 16],
    hats: [],
    melodyWave: "sine",
    bassWave: "triangle",
  },
];

const FLOOR_TWO_COMBAT_PLAYLIST: readonly MusicPattern[] = [{
  id: "relation-storm-pursuit",
  title: "关系风暴追击",
  stepSeconds: 0.092,
  cyclesBeforeChange: 99,
  melody: [69, 76, 72, 81, 74, 79, 71, 83, 68, 75, 71, 80, 73, 78, 70, 82, 67, 74, 70, 79, 72, 77, 69, 81, 66, 73, 69, 78, 71, 76, 68, 80],
  bass: [33, null, 40, 33, 36, null, 43, 36, 32, null, 39, 32, 35, null, 42, 35, 31, null, 38, 31, 34, null, 41, 34, 30, null, 37, 30, 33, 40, 45, 40],
  kicks: [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30],
  hats: [1, 5, 9, 13, 17, 21, 25, 29],
  melodyWave: "square",
  bassWave: "sawtooth",
}];

const FLOOR_TWO_BOSS_PLAYLIST: readonly MusicPattern[] = [{
  id: "conductor-singularity",
  title: "指挥家奇点",
  stepSeconds: 0.078,
  cyclesBeforeChange: 99,
  melody: [57, 64, 70, 75, 63, 69, 76, 82, 56, 63, 69, 74, 62, 68, 75, 81, 55, 62, 68, 73, 61, 67, 74, 80, 54, 61, 67, 72, 60, 66, 73, 79],
  bass: [33, 33, 40, 28, 34, 34, 41, 29, 32, 32, 39, 27, 33, 33, 40, 28, 31, 31, 38, 26, 32, 32, 39, 27, 30, 30, 37, 25, 31, 31, 38, 26],
  kicks: [0, 2, 4, 7, 8, 10, 12, 15, 16, 18, 20, 23, 24, 26, 28, 30],
  hats: [1, 3, 5, 9, 11, 13, 17, 19, 21, 25, 27, 29, 31],
  melodyWave: "sawtooth",
  bassWave: "square",
}];

const FLOOR_ONE_PLAYLISTS: Readonly<Record<ArcadeMusicMode, readonly MusicPattern[]>> = {
  explore: EXPLORE_PLAYLIST,
  combat: COMBAT_PLAYLIST,
  boss: BOSS_PLAYLIST,
};

export const ARCADE_MUSIC_CREDITS = [
  "J. S. Bach · C 大调前奏曲 BWV 846（公版作品的和声语汇）",
  "L. van Beethoven · 月光奏鸣曲第一乐章（公版作品的分解和弦语汇）",
  "F. Chopin · 夜曲体裁（公版作品的抒情语汇）",
  "W. A. Mozart · 柔板体裁（公版作品的旋律语汇）",
  "L. van Beethoven · 第五交响曲第一乐章（公版乐谱的原创芯片编曲）",
  "L. van Beethoven · 致爱丽丝 WoO 59（公版乐谱的原创芯片编曲）",
] as const;

function playlistFor(
  mode: ArcadeMusicMode,
  floor: 1 | 2 | 3 | 4,
): readonly MusicPattern[] {
  if (floor === 1) return FLOOR_ONE_PLAYLISTS[mode];
  if (mode === "combat") return FLOOR_TWO_COMBAT_PLAYLIST;
  if (mode === "boss") return FLOOR_TWO_BOSS_PLAYLIST;
  return FLOOR_TWO_EXPLORE_PLAYLIST;
}

export function chooseNextTrackIndex(
  trackCount: number,
  currentIndex: number,
  randomValue: number,
): number {
  if (trackCount <= 1) return 0;
  const slot = Math.min(trackCount - 2, Math.floor(clamp(randomValue, 0, 0.999999) * (trackCount - 1)));
  return slot >= currentIndex ? slot + 1 : slot;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  try {
    const browserWindow = window as typeof window & {
      webkitAudioContext?: AudioContextConstructor;
    };
    return browserWindow.AudioContext ?? browserWindow.webkitAudioContext ?? null;
  } catch {
    // Embedded browsers can expose `window` while denying audio APIs.
    return null;
  }
}

/**
 * Small Web Audio score for the dungeon. It owns every timer and audio node it
 * creates, so one `dispose()` call is enough when the app is torn down.
 */
export class ArcadeAudio {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private schedulerTimer: ReturnType<typeof setTimeout> | null = null;
  private modeTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private nextMusicStepAt = 0;
  private musicStep = 0;
  private activeTrackIndex = 0;
  private floorValue: 1 | 2 | 3 | 4 = 1;
  private completedTrackCycles = 0;
  private readonly musicSources = new Set<AudioScheduledSourceNode>();
  private readonly sfxSources = new Set<AudioScheduledSourceNode>();
  private readonly sourceCleanups = new Map<AudioScheduledSourceNode, () => void>();
  private gestureCleanup: (() => void) | null = null;
  private initializing: Promise<boolean> | null = null;
  private disposed = false;
  private modeValue: ArcadeMusicMode;
  private mutedValue: boolean;
  private volumeValue: number;

  private readonly contextStateHandler = (): void => {
    if (this.context?.state === "running") {
      this.startMusicScheduler();
    } else {
      this.clearModeTransition(true);
      this.stopMusicScheduler(true);
    }
  };

  constructor(options: ArcadeAudioOptions = {}) {
    this.modeValue = options.mode ?? "explore";
    const playlist = playlistFor(this.modeValue, this.floorValue);
    this.activeTrackIndex = Math.floor(Math.random() * playlist.length);
    this.mutedValue = options.muted ?? false;
    const initialVolume = options.volume ?? 0.55;
    this.volumeValue = clamp(Number.isFinite(initialVolume) ? initialVolume : 0, 0, 1);
  }

  static isSupported(): boolean {
    return audioContextConstructor() !== null;
  }

  get ready(): boolean {
    return this.context?.state === "running";
  }

  get muted(): boolean {
    return this.mutedValue;
  }

  get volume(): number {
    return this.volumeValue;
  }

  get mode(): ArcadeMusicMode {
    return this.modeValue;
  }

  get trackId(): string {
    return this.currentMusicPattern().id;
  }

  get trackTitle(): string {
    return this.currentMusicPattern().title;
  }

  /**
   * Arms pointer, keyboard and touch listeners. The returned function removes
   * them; listeners also remove themselves after a successful gesture attempt.
   */
  armFirstGesture(target?: EventTarget): () => void {
    this.gestureCleanup?.();

    const gestureTarget = target ?? (typeof window !== "undefined" ? window : null);
    if (!gestureTarget || this.disposed || !ArcadeAudio.isSupported()) {
      return () => undefined;
    }

    let active = true;
    const eventNames = ["pointerdown", "keydown", "touchend"] as const;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      eventNames.forEach((eventName) => {
        gestureTarget.removeEventListener(eventName, handleGesture, true);
      });
      if (this.gestureCleanup === cleanup) this.gestureCleanup = null;
    };
    const handleGesture = (): void => {
      cleanup();
      void this.initialize().then((running) => {
        // Safari can require a second gesture after an interrupted/suspended
        // context. Re-arm only when audio is actually supported.
        if (!running && !this.disposed && ArcadeAudio.isSupported()) {
          this.armFirstGesture(gestureTarget);
        }
      });
    };

    eventNames.forEach((eventName) => {
      gestureTarget.addEventListener(eventName, handleGesture, true);
    });
    this.gestureCleanup = cleanup;
    return cleanup;
  }

  /** Call directly from a user gesture when the host already owns that event. */
  async initialize(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.context) return this.resume();
    if (this.initializing) return this.initializing;

    const pending = this.initializeContext();
    this.initializing = pending;
    try {
      return await pending;
    } finally {
      if (this.initializing === pending) this.initializing = null;
    }
  }

  /** Retries a suspended AudioContext, normally from a fresh user gesture. */
  async resume(): Promise<boolean> {
    if (this.disposed) return false;
    if (!this.context) return this.initialize();
    if (this.context.state === "closed") return false;

    if (this.context.state !== "running") {
      try {
        await this.context.resume();
      } catch {
        return false;
      }
    }

    const running = !this.disposed && this.context.state === "running";
    if (running) this.startMusicScheduler();
    return running;
  }

  setMode(mode: ArcadeMusicMode): void {
    if (this.modeValue === mode || this.disposed) return;
    this.modeValue = mode;
    this.restartMusicPlaylist();
  }

  setFloor(floor: 1 | 2 | 3 | 4): void {
    if (this.floorValue === floor || this.disposed) return;
    this.floorValue = floor;
    this.restartMusicPlaylist();
  }

  private restartMusicPlaylist(): void {
    this.musicStep = 0;
    this.completedTrackCycles = 0;
    const playlist = playlistFor(this.modeValue, this.floorValue);
    this.activeTrackIndex = Math.floor(Math.random() * playlist.length);
    this.nextMusicStepAt = 0;

    const context = this.context;
    const musicGain = this.musicGain;
    if (!context || context.state !== "running" || !musicGain || this.mutedValue) {
      this.clearModeTransition();
      this.stopMusicScheduler(true);
      return;
    }

    // A short fade-out/fade-in avoids hard-stopping an oscillator at a
    // non-zero crossing. The complete mode hand-off is nominally 100 ms.
    this.clearModeTransition();
    this.stopMusicScheduler(false);
    const now = context.currentTime;
    const switchAt = now + MODE_FADE_SECONDS;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(Math.max(SILENCE, musicGain.gain.value), now);
    musicGain.gain.linearRampToValueAtTime(SILENCE, switchAt);
    this.stopSourcesAt(this.musicSources, switchAt + 0.005);

    this.modeTransitionTimer = globalThis.setTimeout(() => {
      this.modeTransitionTimer = null;
      if (
        this.disposed ||
        this.mutedValue ||
        this.context !== context ||
        context.state !== "running" ||
        this.musicGain !== musicGain
      ) return;

      const fadeInAt = context.currentTime;
      musicGain.gain.cancelScheduledValues(fadeInAt);
      musicGain.gain.setValueAtTime(SILENCE, fadeInAt);
      musicGain.gain.linearRampToValueAtTime(
        MUSIC_GAIN_LEVEL,
        fadeInAt + MODE_FADE_SECONDS,
      );
      this.startMusicScheduler();
    }, MODE_FADE_MS);
  }

  setMuted(muted: boolean): void {
    if (this.disposed || this.mutedValue === muted) return;
    this.mutedValue = muted;
    this.applyMasterVolume();

    if (muted) {
      this.clearModeTransition(true);
      this.stopMusicScheduler(true);
      this.stopSources(this.sfxSources);
    } else {
      void this.resume();
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.mutedValue);
    return this.mutedValue;
  }

  setVolume(volume: number): void {
    if (this.disposed) return;
    this.volumeValue = clamp(Number.isFinite(volume) ? volume : 0, 0, 1);
    this.applyMasterVolume();
  }

  async playSfx(effect: ArcadeSfx): Promise<boolean> {
    if (this.disposed || this.mutedValue) return false;
    if (!(await this.resume()) || !this.context || !this.sfxGain) return false;

    const startAt = this.context.currentTime + 0.012;
    this.scheduleEffect(effect, startAt);
    return true;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.gestureCleanup?.();
    this.gestureCleanup = null;
    this.clearModeTransition();
    this.stopMusicScheduler(true);
    this.stopSources(this.sfxSources);

    const context = this.context;
    if (context) {
      context.removeEventListener("statechange", this.contextStateHandler);
    }
    this.masterGain?.disconnect();
    this.musicGain?.disconnect();
    this.sfxGain?.disconnect();
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.context = null;

    if (context && context.state !== "closed") {
      try {
        await context.close();
      } catch {
        // Some WebKit builds throw if close races with an interrupted context.
      }
    }
  }

  private async initializeContext(): Promise<boolean> {
    const Context = audioContextConstructor();
    if (!Context || this.disposed) return false;

    let context: AudioContext;
    try {
      context = new Context();
    } catch {
      return false;
    }

    if (this.disposed) {
      void context.close().catch(() => undefined);
      return false;
    }

    let masterGain: GainNode;
    let musicGain: GainNode;
    let sfxGain: GainNode;
    let noiseBuffer: AudioBuffer;
    try {
      masterGain = context.createGain();
      musicGain = context.createGain();
      sfxGain = context.createGain();
      musicGain.gain.value = MUSIC_GAIN_LEVEL;
      sfxGain.gain.value = 0.66;
      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(context.destination);
      noiseBuffer = this.createNoiseBuffer(context);
    } catch {
      void context.close().catch(() => undefined);
      return false;
    }

    this.context = context;
    this.masterGain = masterGain;
    this.musicGain = musicGain;
    this.sfxGain = sfxGain;
    this.noiseBuffer = noiseBuffer;
    context.addEventListener("statechange", this.contextStateHandler);
    this.applyMasterVolume();

    if (context.state !== "running") {
      try {
        await context.resume();
      } catch {
        return false;
      }
    }

    if (this.disposed || context.state !== "running") return false;
    this.startMusicScheduler();
    return true;
  }

  private applyMasterVolume(): void {
    if (!this.context || !this.masterGain || this.context.state === "closed") return;
    const gain = this.masterGain.gain;
    const now = this.context.currentTime;
    const target = this.mutedValue ? 0 : this.volumeValue;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0, gain.value), now);
    gain.linearRampToValueAtTime(target, now + 0.025);
  }

  private startMusicScheduler(): void {
    if (
      this.schedulerTimer !== null ||
      this.disposed ||
      this.mutedValue ||
      this.context?.state !== "running" ||
      !this.musicGain
    ) return;

    if (this.nextMusicStepAt < this.context.currentTime - 0.1) {
      this.nextMusicStepAt = this.context.currentTime + 0.035;
    }
    this.scheduleMusicWindow();
  }

  private scheduleMusicWindow(): void {
    this.schedulerTimer = null;
    const context = this.context;
    if (
      this.disposed ||
      this.mutedValue ||
      !context ||
      context.state !== "running" ||
      !this.musicGain
    ) return;

    if (this.nextMusicStepAt < context.currentTime - 0.1) {
      this.nextMusicStepAt = context.currentTime + 0.035;
    }

    let scheduledSteps = 0;
    while (
      this.nextMusicStepAt < context.currentTime + SCHEDULE_AHEAD_SECONDS &&
      scheduledSteps < 64
    ) {
      this.scheduleMusicStep(this.nextMusicStepAt);
      scheduledSteps += 1;
    }

    this.schedulerTimer = globalThis.setTimeout(
      () => this.scheduleMusicWindow(),
      SCHEDULER_INTERVAL_MS,
    );
  }

  private stopMusicScheduler(stopScheduledSources: boolean): void {
    if (this.schedulerTimer !== null) {
      globalThis.clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (stopScheduledSources) this.stopSources(this.musicSources);
  }

  private clearModeTransition(resetGain = false): void {
    if (this.modeTransitionTimer !== null) {
      globalThis.clearTimeout(this.modeTransitionTimer);
      this.modeTransitionTimer = null;
    }
    const context = this.context;
    const musicGain = this.musicGain;
    if (resetGain && context && context.state !== "closed" && musicGain) {
      const now = context.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(MUSIC_GAIN_LEVEL, now);
    }
  }

  private scheduleMusicStep(startAt: number): void {
    if (!this.musicGain) return;
    const pattern = this.currentMusicPattern();
    const step = this.musicStep % pattern.melody.length;
    const melodyNote = pattern.melody[step];
    const bassNote = pattern.bass[step];

    if (melodyNote !== null) {
      this.scheduleTone(
        this.musicGain,
        this.musicSources,
        startAt,
        midiToFrequency(melodyNote),
        pattern.stepSeconds * 0.72,
        pattern.melodyWave,
        this.modeValue === "boss" ? 0.065 : 0.052,
      );
    }
    if (bassNote !== null) {
      this.scheduleTone(
        this.musicGain,
        this.musicSources,
        startAt,
        midiToFrequency(bassNote),
        pattern.stepSeconds * 1.8,
        pattern.bassWave,
        this.modeValue === "explore" ? 0.055 : 0.072,
      );
    }
    if (pattern.kicks.includes(step)) {
      this.scheduleTone(
        this.musicGain,
        this.musicSources,
        startAt,
        95,
        0.09,
        "sine",
        0.12,
        43,
      );
    }
    if (pattern.hats.includes(step)) {
      this.scheduleNoise(
        this.musicGain,
        this.musicSources,
        startAt,
        0.035,
        this.modeValue === "boss" ? 0.038 : 0.025,
      );
    }

    this.musicStep = (step + 1) % pattern.melody.length;
    if (this.musicStep === 0) {
      this.completedTrackCycles += 1;
      if (
        this.modeValue === "explore" &&
        this.completedTrackCycles >= pattern.cyclesBeforeChange
      ) {
        this.activeTrackIndex = chooseNextTrackIndex(
          playlistFor("explore", this.floorValue).length,
          this.activeTrackIndex,
          Math.random(),
        );
        this.completedTrackCycles = 0;
      }
    }
    this.nextMusicStepAt += pattern.stepSeconds;
  }

  private currentMusicPattern(): MusicPattern {
    const playlist = playlistFor(this.modeValue, this.floorValue);
    return playlist[this.activeTrackIndex] ?? playlist[0];
  }

  private scheduleEffect(effect: ArcadeSfx, startAt: number): void {
    if (!this.sfxGain) return;
    const output = this.sfxGain;
    const sources = this.sfxSources;

    switch (effect) {
      case "step":
        this.scheduleTone(output, sources, startAt, 155, 0.045, "square", 0.035, 104);
        this.scheduleNoise(output, sources, startAt, 0.024, 0.018);
        break;
      case "bump":
        this.scheduleTone(output, sources, startAt, 92, 0.075, "triangle", 0.075, 52);
        this.scheduleNoise(output, sources, startAt, 0.032, 0.04);
        break;
      case "encounter":
        [48, 55, 60, 67].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.052, midiToFrequency(note), 0.13, "square", 0.1);
        });
        this.scheduleTone(output, sources, startAt, 128, 0.25, "sawtooth", 0.09, 54);
        break;
      case "attack":
      case "query-cast":
        [72, 76, 79].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.038, midiToFrequency(note), 0.1, "square", 0.085);
        });
        this.scheduleTone(output, sources, startAt + 0.09, 820, 0.14, "sawtooth", 0.14, 170);
        this.scheduleNoise(output, sources, startAt + 0.12, 0.055, 0.055);
        break;
      case "enemy-hurt":
        this.scheduleNoise(output, sources, startAt, 0.085, 0.13);
        this.scheduleTone(output, sources, startAt, 310, 0.13, "square", 0.16, 72);
        this.scheduleTone(output, sources, startAt + 0.025, 860, 0.065, "sine", 0.08, 240);
        break;
      case "hit":
      case "player-hurt":
        this.scheduleNoise(output, sources, startAt, 0.15, 0.17);
        this.scheduleTone(output, sources, startAt, 132, 0.18, "sawtooth", 0.16, 46);
        this.scheduleTone(output, sources, startAt + 0.055, 66, 0.14, "square", 0.07, 41);
        break;
      case "stage-clear":
        [60, 64, 67, 72].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.07, midiToFrequency(note), 0.2, "square", 0.1);
        });
        break;
      case "drop":
        [84, 79, 76].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.045, midiToFrequency(note), 0.12, "square", 0.075);
        });
        this.scheduleTone(output, sources, startAt + 0.12, 112, 0.1, "triangle", 0.08, 64);
        break;
      case "pickup-weapon":
        this.scheduleNoise(output, sources, startAt, 0.055, 0.055);
        [55, 67, 74, 79].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.055, midiToFrequency(note), 0.19, "square", 0.11);
        });
        this.scheduleTone(output, sources, startAt + 0.19, 1_080, 0.1, "sine", 0.075, 430);
        break;
      case "reward":
      case "pickup-relic":
        [67, 71, 74, 79].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.085, midiToFrequency(note), 0.22, "square", 0.11);
        });
        this.scheduleTone(output, sources, startAt + 0.26, midiToFrequency(55), 0.34, "triangle", 0.08);
        this.scheduleTone(output, sources, startAt + 0.285, midiToFrequency(91), 0.28, "sine", 0.055);
        break;
      case "heal":
        [60, 64, 67, 72, 76].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.052, midiToFrequency(note), 0.22, "sine", 0.09);
        });
        break;
      case "room":
      case "gate":
        this.scheduleNoise(output, sources, startAt, 0.12, 0.055);
        this.scheduleTone(output, sources, startAt, 78, 0.18, "triangle", 0.08, 48);
        [60, 67, 74].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.065, midiToFrequency(note), 0.13, "square", 0.12);
        });
        break;
      case "victory":
        [60, 64, 67, 72, 67, 76, 79].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.09, midiToFrequency(note), 0.27, "square", 0.12);
        });
        [36, 43, 48].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.18, midiToFrequency(note), 0.34, "triangle", 0.09);
        });
        break;
      case "defeat":
        [64, 60, 57, 52].forEach((note, index) => {
          this.scheduleTone(output, sources, startAt + index * 0.14, midiToFrequency(note), 0.24, "sawtooth", 0.115);
        });
        this.scheduleNoise(output, sources, startAt + 0.44, 0.24, 0.08);
        break;
    }
  }

  private scheduleTone(
    output: GainNode,
    sourceSet: Set<AudioScheduledSourceNode>,
    startAt: number,
    frequency: number,
    duration: number,
    wave: OscillatorType,
    level: number,
    slideTo?: number,
  ): void {
    const context = this.context;
    if (!context || context.state === "closed") return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const endAt = startAt + Math.max(0.02, duration);
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), startAt);
    if (slideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), endAt);
    }
    envelope.gain.setValueAtTime(SILENCE, startAt);
    envelope.gain.linearRampToValueAtTime(level, startAt + Math.min(0.008, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(SILENCE, endAt);
    oscillator.connect(envelope);
    envelope.connect(output);
    this.trackSource(oscillator, envelope, sourceSet);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.015);
  }

  private scheduleNoise(
    output: GainNode,
    sourceSet: Set<AudioScheduledSourceNode>,
    startAt: number,
    duration: number,
    level: number,
  ): void {
    const context = this.context;
    if (!context || context.state === "closed" || !this.noiseBuffer) return;

    const source = context.createBufferSource();
    const envelope = context.createGain();
    const endAt = startAt + Math.max(0.02, duration);
    source.buffer = this.noiseBuffer;
    envelope.gain.setValueAtTime(level, startAt);
    envelope.gain.exponentialRampToValueAtTime(SILENCE, endAt);
    source.connect(envelope);
    envelope.connect(output);
    this.trackSource(source, envelope, sourceSet);
    source.start(startAt);
    source.stop(endAt + 0.01);
  }

  private trackSource(
    source: AudioScheduledSourceNode,
    envelope: GainNode,
    sourceSet: Set<AudioScheduledSourceNode>,
  ): void {
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      sourceSet.delete(source);
      this.sourceCleanups.delete(source);
      try {
        source.disconnect();
      } catch {
        // Disconnect is best-effort when a context closes mid-callback.
      }
      try {
        envelope.disconnect();
      } catch {
        // The envelope may already be detached by a disposing context.
      }
    };
    sourceSet.add(source);
    this.sourceCleanups.set(source, cleanup);
    source.addEventListener("ended", cleanup, { once: true });
  }

  private stopSourcesAt(
    sourceSet: Set<AudioScheduledSourceNode>,
    stopAt: number,
  ): void {
    [...sourceSet].forEach((source) => {
      try {
        source.stop(stopAt);
      } catch {
        // A source can finish between scheduling the transition and this call.
      }
    });
  }

  private stopSources(sourceSet: Set<AudioScheduledSourceNode>): void {
    [...sourceSet].forEach((source) => {
      try {
        source.stop();
      } catch {
        // A source may have naturally ended between the copy and stop call.
      }
      const cleanup = this.sourceCleanups.get(source);
      if (cleanup) cleanup();
      else sourceSet.delete(source);
    });
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(context.sampleRate * 0.28));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let state = 0x5f3759df;
    for (let index = 0; index < samples.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      samples[index] = ((state >>> 0) / 0xffffffff) * 2 - 1;
    }
    return buffer;
  }
}
