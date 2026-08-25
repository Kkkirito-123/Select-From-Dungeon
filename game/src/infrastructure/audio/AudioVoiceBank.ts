const SILENCE = 0.0001;

/**
 * Owns the low-level Web Audio nodes created by the arcade score and SFX layers.
 * Higher-level audio policies only describe what to play; this unit supplies the
 * oscillator/noise service and guarantees that every source is tracked and stopped.
 */
export class AudioVoiceBank {
  private readonly noiseBuffer: AudioBuffer;
  private readonly sourceCleanups = new Map<AudioScheduledSourceNode, () => void>();

  constructor(private readonly context: AudioContext) {
    this.noiseBuffer = this.createNoiseBuffer();
  }

  scheduleTone(
    output: GainNode,
    sourceSet: Set<AudioScheduledSourceNode>,
    startAt: number,
    frequency: number,
    duration: number,
    wave: OscillatorType,
    level: number,
    slideTo?: number,
  ): void {
    if (this.context.state === "closed") return;

    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
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

  schedulePadTone(
    output: GainNode,
    sourceSet: Set<AudioScheduledSourceNode>,
    startAt: number,
    frequency: number,
    duration: number,
    wave: OscillatorType,
    level: number,
  ): void {
    if (this.context.state === "closed") return;

    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
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

  scheduleNoise(
    output: GainNode,
    sourceSet: Set<AudioScheduledSourceNode>,
    startAt: number,
    duration: number,
    level: number,
  ): void {
    if (this.context.state === "closed") return;

    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
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

  stopSourcesAt(
    sourceSet: Set<AudioScheduledSourceNode>,
    stopAt: number,
  ): void {
    [...sourceSet].forEach((source) => {
      try {
        source.stop(stopAt);
      } catch {
        // The source may finish between scheduling a transition and stopping it.
      }
    });
  }

  stopSources(sourceSet: Set<AudioScheduledSourceNode>): void {
    [...sourceSet].forEach((source) => {
      try {
        source.stop();
      } catch {
        // The source may finish between copying the set and stopping it.
      }
      const cleanup = this.sourceCleanups.get(source);
      if (cleanup) cleanup();
      else sourceSet.delete(source);
    });
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
        // A context being destroyed may have disconnected the source already.
      }
      try {
        envelope.disconnect();
      } catch {
        // A context being destroyed may have disconnected the envelope already.
      }
    };
    sourceSet.add(source);
    this.sourceCleanups.set(source, cleanup);
    source.addEventListener("ended", cleanup, { once: true });
  }

  private createNoiseBuffer(): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * 0.28));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
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
