import {
  resolveRuntimeScoreUrl,
  runtimeScoreForScene,
  type RuntimeScoreAsset,
} from "./runtimeScoreCatalog";
import type { ScoreScene } from "./musicScore";

export interface RecordedScorePlayerOptions {
  readonly baseUrl?: string;
  readonly fetchAudioBytes?: (url: string) => Promise<ArrayBuffer>;
}

interface ActivePlayback {
  readonly asset: RuntimeScoreAsset;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

const SILENCE = 0.0001;
const DEFAULT_CROSSFADE_SECONDS = 1.2;
const INITIAL_FADE_SECONDS = 0.65;

async function defaultFetchAudioBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`Audio request failed with ${response.status}.`);
  }
  return response.arrayBuffer();
}

/**
 * Plays the F1/F2 project-rendered mixes. Each source is a single long looping
 * buffer, so browser timer jitter cannot insert gaps between musical notes.
 */
export class RecordedScorePlayer {
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly fetchAudioBytes: (url: string) => Promise<ArrayBuffer>;
  private active: ActivePlayback | null = null;
  private requestVersion = 0;
  private disposed = false;

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
    private readonly options: RecordedScorePlayerOptions = {},
  ) {
    this.fetchAudioBytes = options.fetchAudioBytes ?? defaultFetchAudioBytes;
  }

  static canUse(context: AudioContext): boolean {
    return (
      typeof context.decodeAudioData === "function" &&
      typeof context.createBufferSource === "function" &&
      typeof context.createGain === "function" &&
      typeof fetch === "function"
    );
  }

  get playingAssetId(): string | null {
    return this.active?.asset.id ?? null;
  }

  async play(scene: ScoreScene): Promise<boolean> {
    if (this.disposed || this.context.state !== "running") return false;
    const asset = runtimeScoreForScene(scene);
    if (!asset) return false;
    if (this.active?.asset.id === asset.id) return true;

    const version = ++this.requestVersion;
    this.releaseOtherFloorBuffers(asset.floor);
    const buffer = await this.load(asset);
    if (
      !buffer ||
      this.disposed ||
      version !== this.requestVersion ||
      this.context.state !== "running"
    ) return false;

    const now = this.context.currentTime;
    const startAt = now + 0.025;
    const oldPlayback = this.active;
    const fadeSeconds = oldPlayback
      ? DEFAULT_CROSSFADE_SECONDS
      : INITIAL_FADE_SECONDS;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const loopEnd = Math.min(
      asset.loopEndSeconds,
      Math.max(asset.loopStartSeconds + 0.1, buffer.duration),
    );
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = Math.min(asset.loopStartSeconds, loopEnd - 0.1);
    source.loopEnd = loopEnd;
    gain.gain.setValueAtTime(SILENCE, startAt);
    gain.gain.linearRampToValueAtTime(1, startAt + fadeSeconds);
    source.connect(gain);
    gain.connect(this.output);

    const playback: ActivePlayback = { asset, source, gain };
    source.addEventListener("ended", () => this.cleanup(playback), { once: true });
    this.active = playback;
    source.start(startAt, source.loopStart);

    if (oldPlayback) {
      oldPlayback.gain.gain.cancelScheduledValues(now);
      oldPlayback.gain.gain.setValueAtTime(
        Math.max(SILENCE, oldPlayback.gain.gain.value),
        now,
      );
      oldPlayback.gain.gain.linearRampToValueAtTime(
        SILENCE,
        startAt + fadeSeconds,
      );
      this.safeStop(oldPlayback.source, startAt + fadeSeconds + 0.02);
    }
    return true;
  }

  stop(fadeSeconds = 0): void {
    this.requestVersion += 1;
    const playback = this.active;
    this.active = null;
    if (!playback) return;
    const now = this.context.currentTime;
    if (fadeSeconds > 0 && this.context.state !== "closed") {
      playback.gain.gain.cancelScheduledValues(now);
      playback.gain.gain.setValueAtTime(
        Math.max(SILENCE, playback.gain.gain.value),
        now,
      );
      playback.gain.gain.linearRampToValueAtTime(SILENCE, now + fadeSeconds);
      this.safeStop(playback.source, now + fadeSeconds + 0.02);
      return;
    }
    this.safeStop(playback.source);
    this.cleanup(playback);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.buffers.clear();
  }

  private load(asset: RuntimeScoreAsset): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(asset.id);
    if (cached) return cached;
    const pending = this.loadFirstSupportedSource(asset);
    this.buffers.set(asset.id, pending);
    return pending;
  }

  private async loadFirstSupportedSource(
    asset: RuntimeScoreAsset,
  ): Promise<AudioBuffer | null> {
    for (const source of asset.sources) {
      try {
        const url = resolveRuntimeScoreUrl(source, this.options.baseUrl);
        const encoded = await this.fetchAudioBytes(url);
        const decoded = await this.context.decodeAudioData(encoded.slice(0));
        if (decoded.duration >= 30) return decoded;
      } catch {
        // OGG is intentionally first; Safari and restrictive embeds can fall
        // back to the project-generated MP3 without interrupting the game.
      }
    }
    return null;
  }

  private releaseOtherFloorBuffers(floor: 1 | 2): void {
    for (const assetId of this.buffers.keys()) {
      if (!assetId.startsWith(`f${String(floor).padStart(2, "0")}-`)) {
        this.buffers.delete(assetId);
      }
    }
  }

  private cleanup(playback: ActivePlayback): void {
    if (this.active === playback) this.active = null;
    try {
      playback.source.disconnect();
    } catch {
      // The source may already have been detached during context shutdown.
    }
    try {
      playback.gain.disconnect();
    } catch {
      // The transition can finish while the entire graph is being disposed.
    }
  }

  private safeStop(source: AudioBufferSourceNode, when?: number): void {
    try {
      if (when === undefined) source.stop();
      else source.stop(when);
    } catch {
      // A source can finish while a page-hide or mode transition is handled.
    }
  }
}
