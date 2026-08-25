import { AudioVoiceBank } from "./AudioVoiceBank";

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
  | "room"
  | "attack"
  | "hit"
  | "reward";

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Converts semantic game effects into voices supplied by the shared voice bank. */
export class ArcadeSfxPlayer {
  constructor(
    private readonly voices: AudioVoiceBank,
    private readonly output: GainNode,
    private readonly sources: Set<AudioScheduledSourceNode>,
  ) {}

  schedule(effect: ArcadeSfx, startAt: number): void {
    const tone = (...args: Parameters<AudioVoiceBank["scheduleTone"]>): void => {
      this.voices.scheduleTone(...args);
    };
    const noise = (...args: Parameters<AudioVoiceBank["scheduleNoise"]>): void => {
      this.voices.scheduleNoise(...args);
    };

    switch (effect) {
      case "step":
        tone(this.output, this.sources, startAt, 168, 0.028, "sine", 0.012, 132);
        break;
      case "bump":
        tone(this.output, this.sources, startAt, 92, 0.075, "triangle", 0.075, 52);
        noise(this.output, this.sources, startAt, 0.032, 0.04);
        break;
      case "encounter":
        [48, 55, 60, 67].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.052, midiToFrequency(note), 0.13, "square", 0.1);
        });
        tone(this.output, this.sources, startAt, 128, 0.25, "sawtooth", 0.09, 54);
        break;
      case "attack":
      case "query-cast":
        [72, 76, 79].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.038, midiToFrequency(note), 0.1, "square", 0.085);
        });
        tone(this.output, this.sources, startAt + 0.09, 820, 0.14, "sawtooth", 0.14, 170);
        noise(this.output, this.sources, startAt + 0.12, 0.055, 0.055);
        break;
      case "enemy-hurt":
        noise(this.output, this.sources, startAt, 0.085, 0.13);
        tone(this.output, this.sources, startAt, 310, 0.13, "square", 0.16, 72);
        tone(this.output, this.sources, startAt + 0.025, 860, 0.065, "sine", 0.08, 240);
        break;
      case "hit":
      case "player-hurt":
        noise(this.output, this.sources, startAt, 0.15, 0.17);
        tone(this.output, this.sources, startAt, 132, 0.18, "sawtooth", 0.16, 46);
        tone(this.output, this.sources, startAt + 0.055, 66, 0.14, "square", 0.07, 41);
        break;
      case "stage-clear":
        [60, 64, 67, 72].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.07, midiToFrequency(note), 0.2, "square", 0.1);
        });
        break;
      case "drop":
        [84, 79, 76].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.045, midiToFrequency(note), 0.12, "square", 0.075);
        });
        tone(this.output, this.sources, startAt + 0.12, 112, 0.1, "triangle", 0.08, 64);
        break;
      case "pickup-weapon":
        noise(this.output, this.sources, startAt, 0.055, 0.055);
        [55, 67, 74, 79].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.055, midiToFrequency(note), 0.19, "square", 0.11);
        });
        tone(this.output, this.sources, startAt + 0.19, 1_080, 0.1, "sine", 0.075, 430);
        break;
      case "reward":
      case "pickup-relic":
        [67, 71, 74, 79].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.085, midiToFrequency(note), 0.22, "square", 0.11);
        });
        tone(this.output, this.sources, startAt + 0.26, midiToFrequency(55), 0.34, "triangle", 0.08);
        tone(this.output, this.sources, startAt + 0.285, midiToFrequency(91), 0.28, "sine", 0.055);
        break;
      case "heal":
        [60, 64, 67, 72, 76].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.052, midiToFrequency(note), 0.22, "sine", 0.09);
        });
        break;
      case "room":
      case "gate":
        noise(this.output, this.sources, startAt, 0.12, 0.055);
        tone(this.output, this.sources, startAt, 78, 0.18, "triangle", 0.08, 48);
        [60, 67, 74].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.065, midiToFrequency(note), 0.13, "square", 0.12);
        });
        break;
      case "victory":
        [60, 64, 67, 72, 67, 76, 79].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.09, midiToFrequency(note), 0.27, "square", 0.12);
        });
        [36, 43, 48].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.18, midiToFrequency(note), 0.34, "triangle", 0.09);
        });
        break;
      case "defeat":
        [64, 60, 57, 52].forEach((note, index) => {
          tone(this.output, this.sources, startAt + index * 0.14, midiToFrequency(note), 0.24, "sawtooth", 0.115);
        });
        noise(this.output, this.sources, startAt + 0.44, 0.24, 0.08);
        break;
    }
  }
}
