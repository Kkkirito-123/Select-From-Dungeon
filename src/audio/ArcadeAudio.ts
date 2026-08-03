/**
 * 程序化 Web Audio 播放器。
 * 负责探索/战斗音乐和事件音效的调度，不决定游戏事件，只响应已确认的场景状态。
 */
import {
  classifyScoreSceneTransition,
  floorScoreProfile,
  musicPatternsForScene,
  normalizeScoreScene,
  type ArcadeMusicMode,
  type DungeonFloor,
  type MusicPattern,
  type ScoreFocus,
  type ScoreScene,
} from "./musicScore";
import { RecordedScorePlayer } from "./RecordedScorePlayer";
import { runtimeScoreForScene } from "./runtimeScoreCatalog";

export type {
  ArcadeMusicMode,
  DungeonFloor,
  ScoreFocus,
  ScoreScene,
} from "./musicScore";

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
  // 为第一版 MVP 的调用位置保留兼容别名。
  | "room"
  | "attack"
  | "hit"
  | "reward";

export interface ArcadeAudioOptions {
  mode?: ArcadeMusicMode;
  muted?: boolean;
  volume?: number;
}

type AudioContextConstructor = new () => AudioContext;

const SILENCE = 0.0001;
const MUSIC_GAIN_LEVEL = 0.58;
const SCHEDULE_AHEAD_SECONDS = 0.24;
const SCHEDULER_INTERVAL_MS = 80;
const MODE_FADE_SECONDS = 0.05;
const MODE_FADE_MS = MODE_FADE_SECONDS * 1_000;

export const ARCADE_MUSIC_CREDITS = [
  "MVP 2.0 八层公共领域古典主题电子改编（项目内重新配器与合成；不使用外部录音）",
  "Mozart / Handel / Vivaldi / Bach / Dvořák / Tchaikovsky / Beethoven 的公共领域作品主题",
] as const;

export function chooseNextTrackIndex(
  trackCount: number,
  currentIndex: number,
  randomValue: number,
): number {
  /** 选择下一首曲目，避免在相同场景中连续重复。 */
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
    // 嵌入式浏览器可能暴露 `window`，却拒绝提供音频 API。
    return null;
  }
}

/**
 * 地牢使用的轻量 Web Audio 配乐器。它持有自己创建的全部计时器和音频节点，
 * 因此应用销毁时只需调用一次 `dispose()`。
 */
export class ArcadeAudio {
  /** 管理程序化音乐调度、页面隐藏暂停和离散事件音效。 */
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private sfxGain: GainNode | null = null;
  private recordedScorePlayer: RecordedScorePlayer | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private schedulerTimer: ReturnType<typeof setTimeout> | null = null;
  private modeTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private nextMusicStepAt = 0;
  private musicStep = 0;
  private activeTrackIndex = 0;
  private activePlaylist: readonly MusicPattern[];
  private sceneValue: ScoreScene;
  private renderedSceneValue: ScoreScene;
  private pendingSceneValue: ScoreScene | null = null;
  private focusValue: ScoreFocus = "world";
  private completedTrackCycles = 0;
  private readonly musicSources = new Set<AudioScheduledSourceNode>();
  private readonly sfxSources = new Set<AudioScheduledSourceNode>();
  private readonly sourceCleanups = new Map<AudioScheduledSourceNode, () => void>();
  private gestureCleanup: (() => void) | null = null;
  private initializing: Promise<boolean> | null = null;
  private disposed = false;
  private pageHiddenValue = false;
  private mutedValue: boolean;
  private volumeValue: number;

  private readonly contextStateHandler = (): void => {
    if (this.context?.state === "running" && !this.pageHiddenValue) {
      this.startPreferredMusic();
    } else {
      this.clearModeTransition(true);
      this.stopMusicScheduler(true);
      this.recordedScorePlayer?.stop();
    }
  };

  constructor(options: ArcadeAudioOptions = {}) {
    this.sceneValue = {
      floor: 1,
      region: 0,
      mode: options.mode ?? "explore",
    };
    this.renderedSceneValue = this.sceneValue;
    this.activePlaylist = musicPatternsForScene(this.renderedSceneValue);
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
    return this.sceneValue.mode;
  }

  get scene(): Readonly<ScoreScene> {
    return { ...this.sceneValue };
  }

  get focus(): ScoreFocus {
    return this.focusValue;
  }

  get trackId(): string {
    return runtimeScoreForScene(this.renderedSceneValue)?.id
      ?? this.currentMusicPattern().id;
  }

  get trackTitle(): string {
    return runtimeScoreForScene(this.renderedSceneValue)?.title
      ?? this.currentMusicPattern().title;
  }

  /**
   * 注册鼠标、键盘和触摸监听器。返回函数可以统一移除它们；成功捕获一次
   * 用户手势后，监听器也会自行移除。
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
        // Safari 在音频上下文被中断或挂起后可能要求第二次用户手势；
        // 只有环境确实支持音频时才重新注册监听器。
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

  /** 宿主已经持有用户手势事件时，可直接调用此方法。 */
  async initialize(): Promise<boolean> {
    if (this.disposed || this.pageHiddenValue) return false;
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

  /** 重试挂起的 AudioContext，通常应由一次新的用户手势触发。 */
  async resume(): Promise<boolean> {
    if (this.disposed || this.pageHiddenValue) return false;
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
    if (running) this.startPreferredMusic();
    return running;
  }

  /**
   * 原子切换配乐目标。楼层或模式变化只重启一次；音频播放期间，同层区域变化
   * 会在下一个乐句重新定向。
   */
  setScene(scene: ScoreScene): void {
    if (this.disposed) return;
    const normalized = normalizeScoreScene(scene);
    const transition = classifyScoreSceneTransition(this.sceneValue, normalized);
    if (transition === "none") return;

    this.sceneValue = normalized;
    if (runtimeScoreForScene(normalized)) {
      this.pendingSceneValue = null;
      this.applyRenderedScene(normalized);
      this.restartMusicPlaylist();
      return;
    }
    if (
      transition === "retarget" &&
      this.context?.state === "running" &&
      !this.mutedValue &&
      !this.pageHiddenValue
    ) {
      this.pendingSceneValue = normalized;
      return;
    }

    this.pendingSceneValue = null;
    this.applyRenderedScene(normalized);
    if (transition === "restart") this.restartMusicPlaylist();
  }

  setFocus(focus: ScoreFocus): void {
    if (this.disposed || this.focusValue === focus) return;
    this.focusValue = focus;
    this.applyMusicCharacter();
  }

  setMode(mode: ArcadeMusicMode): void {
    this.setScene({ ...this.sceneValue, mode });
  }

  setFloor(floor: DungeonFloor): void {
    this.setScene({ ...this.sceneValue, floor });
  }

  setRegion(index: number): void {
    this.setScene({ ...this.sceneValue, region: index });
  }

  private applyRenderedScene(scene: ScoreScene): void {
    this.renderedSceneValue = scene;
    this.activePlaylist = musicPatternsForScene(scene);
    this.activeTrackIndex = scene.mode === "explore"
      ? scene.region % this.activePlaylist.length
      : 0;
    this.applyMusicCharacter();
  }

  private restartMusicPlaylist(): void {
    this.musicStep = 0;
    this.completedTrackCycles = 0;
    this.nextMusicStepAt = 0;

    const context = this.context;
    const musicGain = this.musicGain;
    if (!context || context.state !== "running" || !musicGain || this.mutedValue) {
      this.clearModeTransition();
      this.stopMusicScheduler(true);
      this.recordedScorePlayer?.stop();
      return;
    }

    if (runtimeScoreForScene(this.renderedSceneValue) && this.recordedScorePlayer) {
      this.clearModeTransition();
      this.stopMusicScheduler(true);
      void this.recordedScorePlayer.play(this.renderedSceneValue).then((played) => {
        if (
          !played &&
          !this.disposed &&
          !this.mutedValue &&
          !this.pageHiddenValue &&
          this.context?.state === "running"
        ) {
          this.startMusicScheduler();
        }
      });
      return;
    }
    const wasPlayingRecordedScore =
      this.recordedScorePlayer?.playingAssetId !== null &&
      this.recordedScorePlayer?.playingAssetId !== undefined;
    this.recordedScorePlayer?.stop(0.8);
    if (wasPlayingRecordedScore) {
      this.clearModeTransition();
      this.stopMusicScheduler(true);
      this.nextMusicStepAt = context.currentTime + 0.035;
      this.startMusicScheduler();
      return;
    }

    // 短暂淡出和淡入可避免在非零交点硬停振荡器；完整模式交接约为 100 毫秒。
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
        this.musicGainTarget(),
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
      this.recordedScorePlayer?.stop();
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

  /** 页面隐藏时停止所有已调度的音频工作。 */
  async setPageHidden(hidden: boolean): Promise<void> {
    if (this.disposed) return;
    this.pageHiddenValue = hidden;
    const context = this.context;
    if (hidden) {
      this.clearModeTransition(true);
      this.stopMusicScheduler(true);
      this.recordedScorePlayer?.stop();
      this.stopSources(this.sfxSources);
      if (context?.state === "running") {
        try {
          await context.suspend();
        } catch {
          // 嵌入式浏览器可能在生命周期变化期间拒绝挂起音频。
        }
      }
      if (!this.pageHiddenValue && !this.mutedValue) await this.resume();
      return;
    }
    if (!this.mutedValue && context && context.state !== "closed") {
      await this.resume();
    }
  }

  async playSfx(effect: ArcadeSfx): Promise<boolean> {
    if (this.disposed || this.mutedValue || this.pageHiddenValue) return false;
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
    this.recordedScorePlayer?.dispose();
    this.recordedScorePlayer = null;
    this.stopSources(this.sfxSources);

    const context = this.context;
    if (context) {
      context.removeEventListener("statechange", this.contextStateHandler);
    }
    this.masterGain?.disconnect();
    this.musicGain?.disconnect();
    this.musicFilter?.disconnect();
    this.sfxGain?.disconnect();
    this.masterGain = null;
    this.musicGain = null;
    this.musicFilter = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.context = null;

    if (context && context.state !== "closed") {
      try {
        await context.close();
      } catch {
        // 某些 WebKit 构建在关闭操作与上下文中断竞争时会抛出异常。
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
    let musicFilter: BiquadFilterNode;
    let sfxGain: GainNode;
    let noiseBuffer: AudioBuffer;
    try {
      masterGain = context.createGain();
      musicGain = context.createGain();
      musicFilter = context.createBiquadFilter();
      sfxGain = context.createGain();
      musicGain.gain.value = this.musicGainTarget();
      musicFilter.type = "lowpass";
      musicFilter.Q.value = 0.55;
      musicFilter.frequency.value = this.musicLowPassTarget();
      sfxGain.gain.value = 0.66;
      musicGain.connect(musicFilter);
      musicFilter.connect(masterGain);
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
    this.musicFilter = musicFilter;
    this.sfxGain = sfxGain;
    this.noiseBuffer = noiseBuffer;
    this.recordedScorePlayer = RecordedScorePlayer.canUse(context)
      ? new RecordedScorePlayer(context, musicGain)
      : null;
    context.addEventListener("statechange", this.contextStateHandler);
    this.applyMasterVolume();
    this.applyMusicCharacter(true);

    if (context.state !== "running") {
      try {
        await context.resume();
      } catch {
        return false;
      }
    }

    if (this.disposed || context.state !== "running") return false;
    this.startPreferredMusic();
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

  private musicGainTarget(): number {
    if (this.focusValue === "thinking") return MUSIC_GAIN_LEVEL * 0.58;
    if (this.focusValue === "resolving") return MUSIC_GAIN_LEVEL * 0.78;
    return MUSIC_GAIN_LEVEL;
  }

  private musicLowPassTarget(): number {
    const profile = floorScoreProfile(this.renderedSceneValue.floor);
    const base = runtimeScoreForScene(this.renderedSceneValue)
      ? this.renderedSceneValue.floor === 1 ? 5_200 : 5_600
      : profile.movements[this.renderedSceneValue.mode].lowPassHz;
    if (this.focusValue === "thinking") return base * 0.78;
    if (this.focusValue === "resolving") return base * 0.91;
    return base;
  }

  private applyMusicCharacter(immediate = false): void {
    const context = this.context;
    const musicGain = this.musicGain;
    const musicFilter = this.musicFilter;
    if (!context || context.state === "closed" || !musicGain || !musicFilter) return;

    const now = context.currentTime;
    const duration = immediate ? 0 : 0.12;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(Math.max(SILENCE, musicGain.gain.value), now);
    musicGain.gain.linearRampToValueAtTime(this.musicGainTarget(), now + duration);
    musicFilter.frequency.cancelScheduledValues(now);
    musicFilter.frequency.setValueAtTime(
      Math.max(200, musicFilter.frequency.value),
      now,
    );
    musicFilter.frequency.linearRampToValueAtTime(
      this.musicLowPassTarget(),
      now + duration,
    );
  }

  private startMusicScheduler(): void {
    if (
      this.schedulerTimer !== null ||
      this.disposed ||
      this.pageHiddenValue ||
      this.mutedValue ||
      this.context?.state !== "running" ||
      !this.musicGain
    ) return;

    if (this.nextMusicStepAt < this.context.currentTime - 0.1) {
      this.nextMusicStepAt = this.context.currentTime + 0.035;
    }
    this.scheduleMusicWindow();
  }

  private startPreferredMusic(): void {
    if (
      this.disposed ||
      this.pageHiddenValue ||
      this.mutedValue ||
      this.context?.state !== "running"
    ) return;
    if (runtimeScoreForScene(this.renderedSceneValue) && this.recordedScorePlayer) {
      this.stopMusicScheduler(true);
      void this.recordedScorePlayer.play(this.renderedSceneValue).then((played) => {
        if (
          !played &&
          !this.disposed &&
          !this.pageHiddenValue &&
          !this.mutedValue &&
          this.context?.state === "running"
        ) {
          this.startMusicScheduler();
        }
      });
      return;
    }
    this.recordedScorePlayer?.stop(0.8);
    this.startMusicScheduler();
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
      musicGain.gain.setValueAtTime(this.musicGainTarget(), now);
    }
  }

  private scheduleMusicStep(startAt: number): void {
    if (!this.musicGain) return;
    const pattern = this.currentMusicPattern();
    const step = this.musicStep % pattern.phraseSteps;
    const melodyNote = pattern.melody[step];
    const bassNote = pattern.bass[step];
    let scheduledVoices = 0;
    const claimVoice = (): boolean => {
      if (scheduledVoices >= pattern.voiceLimit) return false;
      scheduledVoices += 1;
      return true;
    };

    if (step === 0 && pattern.mode === "explore") {
      pattern.bed.forEach((note) => {
        if (!claimVoice()) return;
        this.schedulePadTone(
          this.musicGain!,
          this.musicSources,
          startAt,
          midiToFrequency(note),
          pattern.bedDurationSeconds,
          pattern.padWave,
          pattern.padLevel,
        );
      });
    }
    if (bassNote !== null && claimVoice()) {
      this.scheduleTone(
        this.musicGain,
        this.musicSources,
        startAt,
        midiToFrequency(bassNote),
        pattern.stepSeconds * 0.72,
        pattern.bassWave,
        pattern.bassLevel,
      );
    }
    if (melodyNote !== null && claimVoice()) {
      this.scheduleTone(
        this.musicGain,
        this.musicSources,
        startAt,
        midiToFrequency(melodyNote),
        pattern.stepSeconds * 0.82,
        pattern.melodyWave,
        pattern.melodyLevel,
      );
    }
    if (pattern.kicks.includes(step) && claimVoice()) {
      this.scheduleTone(
        this.musicGain,
        this.musicSources,
        startAt,
        82,
        0.075,
        "sine",
        pattern.kickLevel,
        46,
      );
    }
    if (pattern.hats.includes(step) && claimVoice()) {
      this.scheduleNoise(
        this.musicGain,
        this.musicSources,
        startAt,
        0.018,
        pattern.hatLevel,
      );
    }

    this.musicStep = (step + 1) % pattern.phraseSteps;
    if (this.musicStep === 0) {
      this.completedTrackCycles += 1;
      if (this.pendingSceneValue) {
        const nextScene = this.pendingSceneValue;
        this.pendingSceneValue = null;
        this.applyRenderedScene(nextScene);
        this.completedTrackCycles = 0;
      }
      if (
        this.renderedSceneValue.mode === "explore" &&
        this.completedTrackCycles >= pattern.cyclesBeforeChange
      ) {
        this.activeTrackIndex = chooseNextTrackIndex(
          this.activePlaylist.length,
          this.activeTrackIndex,
          Math.random(),
        );
        this.completedTrackCycles = 0;
      }
    }
    this.nextMusicStepAt += pattern.stepSeconds;
  }

  private currentMusicPattern(): MusicPattern {
    return this.activePlaylist[this.activeTrackIndex] ?? this.activePlaylist[0];
  }

  private scheduleEffect(effect: ArcadeSfx, startAt: number): void {
    if (!this.sfxGain) return;
    const output = this.sfxGain;
    const sources = this.sfxSources;

    switch (effect) {
      case "step":
        this.scheduleTone(output, sources, startAt, 168, 0.028, "sine", 0.012, 132);
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

  private schedulePadTone(
    output: GainNode,
    sourceSet: Set<AudioScheduledSourceNode>,
    startAt: number,
    frequency: number,
    duration: number,
    wave: OscillatorType,
    level: number,
  ): void {
    const context = this.context;
    if (!context || context.state === "closed") return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const endAt = startAt + Math.max(0.5, duration);
    const attackEnd = startAt + Math.min(0.28, duration * 0.12);
    const releaseStart = Math.max(attackEnd, endAt - Math.min(0.36, duration * 0.14));
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), startAt);
    envelope.gain.setValueAtTime(SILENCE, startAt);
    envelope.gain.linearRampToValueAtTime(level, attackEnd);
    envelope.gain.setValueAtTime(level, releaseStart);
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
        // 上下文在回调中途关闭时，断开节点只能尽力完成。
      }
      try {
        envelope.disconnect();
      } catch {
        // 正在销毁的上下文可能已经断开包络节点。
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
        // 音源可能在安排过渡和本次调用之间自然结束。
      }
    });
  }

  private stopSources(sourceSet: Set<AudioScheduledSourceNode>): void {
    [...sourceSet].forEach((source) => {
      try {
        source.stop();
      } catch {
        // 音源可能在复制引用与调用停止之间自然结束。
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
