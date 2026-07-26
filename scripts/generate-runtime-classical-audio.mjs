import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const TAU = Math.PI * 2;
const OUTPUT_ROOT = path.resolve(
  process.cwd(),
  process.argv[2] ?? "public/assets/audio",
);
const SOURCE_ROOT = path.resolve(
  process.cwd(),
  "assets/audio/public-domain-arrangements",
);

const COMPOSITION_RIGHTS = {
  f01: {
    title: "12 Variations on “Ah vous dirai-je, Maman”, K.265",
    composer: "Wolfgang Amadeus Mozart",
    composerLife: "1756–1791",
    compositionStatus: "public-domain",
    territoryBasis:
      "Mozart died in 1791. The underlying composition is public domain in China and life-plus-70 territories.",
    transcriptionBasis:
      "The project independently entered the familiar public-domain theme as note data. No score scan, MIDI, recording, sample, or SoundFont was imported.",
  },
  f02: {
    title: "Water Music, HWV 348–350",
    composer: "George Frideric Handel",
    composerLife: "1685–1759",
    compositionStatus: "public-domain",
    territoryBasis:
      "Handel died in 1759. The underlying composition is public domain in China and life-plus-70 territories.",
    transcriptionBasis:
      "The project independently entered a short Water Music-derived contour as note data, then rewrote the harmony, structure, rhythm, and orchestration. No score scan, MIDI, recording, sample, or SoundFont was imported.",
  },
};

const F1_THEME = [
  [0, 69, 0.82],
  [1, 69, 0.82],
  [2, 76, 0.82],
  [3, 76, 0.82],
  [4, 77, 0.82],
  [5, 77, 0.82],
  [6, 76, 1.72],
  [8, 74, 0.82],
  [9, 74, 0.82],
  [10, 72, 0.82],
  [11, 72, 0.82],
  [12, 71, 0.82],
  [13, 71, 0.82],
  [14, 69, 1.72],
];

const F2_THEME = [
  [0, 62, 0.76],
  [0.5, 66, 0.34],
  [1, 69, 0.76],
  [2, 71, 0.34],
  [2.5, 69, 0.34],
  [3, 66, 0.76],
  [4, 64, 0.34],
  [4.5, 66, 0.34],
  [5, 69, 0.76],
  [6, 67, 0.34],
  [6.5, 66, 0.34],
  [7, 62, 0.82],
];

const TRACKS = [
  {
    id: "f01-ember-archive-explore",
    floor: 1,
    folder: "f01",
    filename: "explore",
    mode: "explore",
    titleZh: "余烬里的旧歌",
    sourceKey: "f01",
    bpm: 72,
    beatsPerBar: 4,
    bars: 16,
    targetRmsDbfs: -20.5,
    targetPeakDbfs: -4.5,
    lowpassHz: 5_400,
    highpassHz: 52,
    render: renderF1Explore,
  },
  {
    id: "f01-ember-archive-combat",
    floor: 1,
    folder: "f01",
    filename: "combat",
    mode: "combat",
    titleZh: "纸页疾行",
    sourceKey: "f01",
    bpm: 104,
    beatsPerBar: 4,
    bars: 24,
    targetRmsDbfs: -18.8,
    targetPeakDbfs: -3.8,
    lowpassHz: 5_000,
    highpassHz: 55,
    render: renderF1Combat,
  },
  {
    id: "f01-ember-archive-boss",
    floor: 1,
    folder: "f01",
    filename: "boss",
    mode: "boss",
    titleZh: "铜印之下",
    sourceKey: "f01",
    bpm: 112,
    beatsPerBar: 3,
    bars: 32,
    targetRmsDbfs: -18.2,
    targetPeakDbfs: -3.5,
    lowpassHz: 5_200,
    highpassHz: 54,
    render: renderF1Boss,
  },
  {
    id: "f02-tidal-archipelago-explore",
    floor: 2,
    folder: "f02",
    filename: "explore",
    mode: "explore",
    titleZh: "潮汐水上曲",
    sourceKey: "f02",
    bpm: 76,
    beatsPerBar: 2,
    bars: 32,
    targetRmsDbfs: -20,
    targetPeakDbfs: -4.2,
    lowpassHz: 5_800,
    highpassHz: 50,
    render: renderF2Explore,
  },
  {
    id: "f02-tidal-archipelago-combat",
    floor: 2,
    folder: "f02",
    filename: "combat",
    mode: "combat",
    titleZh: "逆潮",
    sourceKey: "f02",
    bpm: 104,
    beatsPerBar: 2,
    bars: 40,
    targetRmsDbfs: -18.5,
    targetPeakDbfs: -3.6,
    lowpassHz: 5_300,
    highpassHz: 55,
    render: renderF2Combat,
  },
  {
    id: "f02-tidal-archipelago-boss",
    floor: 2,
    folder: "f02",
    filename: "boss",
    mode: "boss",
    titleZh: "七束灯火",
    sourceKey: "f02",
    bpm: 116,
    beatsPerBar: 2,
    bars: 48,
    targetRmsDbfs: -17.9,
    targetPeakDbfs: -3.2,
    lowpassHz: 5_600,
    highpassHz: 55,
    render: renderF2Boss,
  },
];

function midiToHz(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function beatToSample(beat, secondsPerBeat) {
  return Math.round(beat * secondsPerBeat * SAMPLE_RATE);
}

function oscillator(kind, phase) {
  switch (kind) {
    case "flute":
      return (
        Math.sin(phase)
        + 0.12 * Math.sin(phase * 2)
        + 0.045 * Math.sin(phase * 3)
      ) / 1.165;
    case "felt":
      return (
        Math.sin(phase)
        + 0.22 * Math.sin(phase * 2)
        + 0.065 * Math.sin(phase * 4)
      ) / 1.285;
    case "cello":
      return (
        Math.sin(phase)
        + 0.3 * Math.sin(phase * 2)
        + 0.14 * Math.sin(phase * 3)
        + 0.045 * Math.sin(phase * 4)
      ) / 1.485;
    case "horn":
      return (
        Math.sin(phase)
        + 0.24 * Math.sin(phase * 2)
        + 0.1 * Math.sin(phase * 3)
      ) / 1.34;
    case "pluck":
      return (
        Math.sin(phase)
        + 0.18 * Math.sin(phase * 2)
        + 0.06 * Math.sin(phase * 3)
      ) / 1.24;
    default:
      return Math.sin(phase);
  }
}

function smoothStep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function envelopeAt(offset, length, attackSamples, releaseSamples) {
  const attack = smoothStep(offset / Math.max(1, attackSamples));
  const release = smoothStep((length - offset - 1) / Math.max(1, releaseSamples));
  return Math.min(attack, release);
}

function renderNote(
  mix,
  {
    note,
    startBeat,
    durationBeats,
    secondsPerBeat,
    kind = "flute",
    gain = 0.08,
    attack = 0.018,
    release = 0.2,
    vibratoHz = 0,
    vibratoDepth = 0,
    phaseOffset = 0,
  },
) {
  if (note === null || note === undefined || durationBeats <= 0) return;
  const start = beatToSample(startBeat, secondsPerBeat);
  const length = Math.max(1, beatToSample(durationBeats, secondsPerBeat));
  const attackSamples = Math.max(1, Math.round(attack * SAMPLE_RATE));
  const releaseSamples = Math.max(1, Math.round(release * SAMPLE_RATE));
  const frequency = midiToHz(note);
  let phase = phaseOffset;

  for (let offset = 0; offset < length && start + offset < mix.length; offset += 1) {
    const vibrato = vibratoHz > 0
      ? 1 + vibratoDepth * Math.sin(TAU * vibratoHz * offset / SAMPLE_RATE)
      : 1;
    phase += TAU * frequency * vibrato / SAMPLE_RATE;
    mix[start + offset] += (
      oscillator(kind, phase)
      * gain
      * envelopeAt(offset, length, attackSamples, releaseSamples)
    );
  }
}

function renderChord(mix, notes, startBeat, durationBeats, secondsPerBeat, options) {
  const perVoiceGain = (options.gain ?? 0.06) / Math.max(1, Math.sqrt(notes.length));
  notes.forEach((note, index) => {
    renderNote(mix, {
      ...options,
      note,
      startBeat,
      durationBeats,
      secondsPerBeat,
      gain: perVoiceGain,
      phaseOffset: index * 0.29,
    });
  });
}

function renderSoftDrum(
  mix,
  { startBeat, secondsPerBeat, gain = 0.08, startHz = 88, endHz = 52 },
) {
  const start = beatToSample(startBeat, secondsPerBeat);
  const length = Math.round(0.16 * SAMPLE_RATE);
  let phase = 0;
  for (let offset = 0; offset < length && start + offset < mix.length; offset += 1) {
    const progress = offset / Math.max(1, length - 1);
    const frequency = startHz * (endHz / startHz) ** progress;
    phase += TAU * frequency / SAMPLE_RATE;
    mix[start + offset] += Math.sin(phase) * gain * (1 - progress) ** 2.8;
  }
}

function renderTheme(mix, theme, baseBeat, secondsPerBeat, options) {
  theme.forEach(([offset, note, duration], index) => {
    if (options.omitEvery && index % options.omitEvery === options.omitOffset) return;
    renderNote(mix, {
      note: note + (options.transpose ?? 0),
      startBeat: baseBeat + offset * (options.timeScale ?? 1),
      durationBeats: duration * (options.timeScale ?? 1),
      secondsPerBeat,
      kind: options.kind,
      gain: options.gain,
      attack: options.attack,
      release: options.release,
      vibratoHz: options.vibratoHz,
      vibratoDepth: options.vibratoDepth,
    });
  });
}

function renderF1Explore(mix, secondsPerBeat) {
  const chords = [
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
    [52, 56, 59],
    [57, 60, 64],
    [50, 53, 57],
    [55, 59, 62],
    [52, 57, 59],
  ];
  const roots = [45, 41, 43, 40, 45, 38, 43, 40];

  for (let bar = 0; bar < 16; bar += 1) {
    const startBeat = bar * 4;
    const index = bar % chords.length;
    renderChord(mix, chords[index], startBeat + 0.04, 3.72, secondsPerBeat, {
      kind: "felt",
      gain: bar >= 8 && bar < 12 ? 0.036 : 0.044,
      attack: 0.12,
      release: 0.52,
    });
    [0.08, 2.08].forEach((offset) => {
      renderNote(mix, {
        note: roots[index],
        startBeat: startBeat + offset,
        durationBeats: 0.74,
        secondsPerBeat,
        kind: "cello",
        gain: 0.052,
        attack: 0.035,
        release: 0.24,
      });
    });
    const arpeggio = chords[index];
    [0.5, 1.5, 2.5, 3.5].forEach((offset, noteIndex) => {
      renderNote(mix, {
        note: arpeggio[noteIndex % arpeggio.length],
        startBeat: startBeat + offset,
        durationBeats: 0.42,
        secondsPerBeat,
        kind: "pluck",
        gain: bar >= 4 && bar < 8 ? 0.043 : 0.03,
        attack: 0.012,
        release: 0.14,
      });
    });
  }

  renderTheme(mix, F1_THEME, 0.1, secondsPerBeat, {
    kind: "flute",
    gain: 0.105,
    attack: 0.025,
    release: 0.26,
    vibratoHz: 4.7,
    vibratoDepth: 0.0012,
  });
  renderTheme(mix, F1_THEME, 16.1, secondsPerBeat, {
    kind: "felt",
    gain: 0.084,
    attack: 0.02,
    release: 0.22,
    transpose: -12,
  });
  renderTheme(mix, F1_THEME, 32.1, secondsPerBeat, {
    kind: "flute",
    gain: 0.096,
    attack: 0.025,
    release: 0.28,
    omitEvery: 4,
    omitOffset: 2,
  });
  renderTheme(mix, F1_THEME, 48.1, secondsPerBeat, {
    kind: "felt",
    gain: 0.092,
    attack: 0.02,
    release: 0.24,
    transpose: -12,
  });
}

function renderF1Combat(mix, secondsPerBeat) {
  const roots = [45, 45, 41, 43, 45, 38, 43, 40];
  for (let bar = 0; bar < 24; bar += 1) {
    const start = bar * 4;
    const root = roots[bar % roots.length];
    [0, 1, 2, 3].forEach((beat) => {
      renderNote(mix, {
        note: root,
        startBeat: start + beat,
        durationBeats: 0.36,
        secondsPerBeat,
        kind: "cello",
        gain: beat % 2 === 0 ? 0.09 : 0.064,
        attack: 0.012,
        release: 0.1,
      });
    });
    [0, 2].forEach((beat) => renderSoftDrum(mix, {
      startBeat: start + beat,
      secondsPerBeat,
      gain: beat === 0 ? 0.11 : 0.085,
    }));
    const chord = [root + 12, root + 15, root + 19];
    [0.5, 1.5, 2.5, 3.5].forEach((beat) => {
      renderChord(mix, chord, start + beat, 0.25, secondsPerBeat, {
        kind: "pluck",
        gain: 0.047,
        attack: 0.008,
        release: 0.07,
      });
    });
  }
  for (let phrase = 0; phrase < 6; phrase += 1) {
    renderTheme(mix, F1_THEME.slice(0, 7), phrase * 16, secondsPerBeat, {
      kind: phrase % 2 === 0 ? "felt" : "flute",
      gain: phrase >= 4 ? 0.11 : 0.094,
      attack: 0.014,
      release: 0.13,
      timeScale: 0.5,
      transpose: phrase % 3 === 2 ? -12 : 0,
    });
    renderTheme(mix, F1_THEME.slice(7), phrase * 16 + 8, secondsPerBeat, {
      kind: "felt",
      gain: 0.087,
      attack: 0.012,
      release: 0.12,
      timeScale: 0.5,
      transpose: phrase % 2 === 1 ? -12 : 0,
    });
  }
}

function renderF1Boss(mix, secondsPerBeat) {
  const roots = [45, 44, 41, 40, 45, 43, 38, 40];
  for (let bar = 0; bar < 32; bar += 1) {
    const start = bar * 3;
    const root = roots[bar % roots.length];
    renderChord(mix, [root + 12, root + 15, root + 19], start, 2.76, secondsPerBeat, {
      kind: "horn",
      gain: bar >= 16 ? 0.055 : 0.044,
      attack: 0.09,
      release: 0.38,
    });
    [0, 1.5].forEach((beat, index) => {
      renderNote(mix, {
        note: root,
        startBeat: start + beat,
        durationBeats: 0.62,
        secondsPerBeat,
        kind: "cello",
        gain: index === 0 ? 0.1 : 0.072,
        attack: 0.018,
        release: 0.15,
      });
    });
    renderSoftDrum(mix, {
      startBeat: start,
      secondsPerBeat,
      gain: bar % 4 === 0 ? 0.13 : 0.095,
      startHz: 82,
      endHz: 48,
    });
  }
  for (let section = 0; section < 6; section += 1) {
    renderTheme(mix, F1_THEME, section * 16, secondsPerBeat, {
      kind: section < 3 ? "cello" : "horn",
      gain: section < 3 ? 0.09 : 0.105,
      attack: 0.028,
      release: 0.2,
      timeScale: 0.5,
      transpose: section % 2 === 0 ? -12 : 0,
    });
  }
}

function renderF2Explore(mix, secondsPerBeat) {
  const chords = [
    [62, 66, 69],
    [59, 62, 67],
    [57, 62, 66],
    [60, 64, 67],
    [62, 66, 69],
    [55, 59, 62],
    [57, 61, 64],
    [60, 62, 67],
  ];
  const roots = [50, 47, 45, 48, 50, 43, 45, 48];
  for (let bar = 0; bar < 32; bar += 1) {
    const start = bar * 2;
    const index = bar % chords.length;
    renderChord(mix, chords[index], start + 0.02, 1.78, secondsPerBeat, {
      kind: bar >= 24 ? "horn" : "felt",
      gain: bar >= 24 ? 0.05 : 0.042,
      attack: 0.1,
      release: 0.36,
    });
    [0, 1].forEach((beat) => {
      renderNote(mix, {
        note: roots[index],
        startBeat: start + beat,
        durationBeats: 0.38,
        secondsPerBeat,
        kind: "pluck",
        gain: beat === 0 ? 0.065 : 0.048,
        attack: 0.012,
        release: 0.12,
      });
    });
    [0.33, 0.66, 1.33, 1.66].forEach((beat, noteIndex) => {
      renderNote(mix, {
        note: chords[index][noteIndex % chords[index].length] + 12,
        startBeat: start + beat,
        durationBeats: 0.22,
        secondsPerBeat,
        kind: "pluck",
        gain: bar >= 8 && bar < 24 ? 0.034 : 0.026,
        attack: 0.01,
        release: 0.08,
      });
    });
  }
  for (let phrase = 0; phrase < 8; phrase += 1) {
    renderTheme(mix, F2_THEME, phrase * 8 + 0.08, secondsPerBeat, {
      kind: phrase >= 6 ? "horn" : "flute",
      gain: phrase >= 6 ? 0.105 : 0.096,
      attack: 0.026,
      release: 0.23,
      transpose: phrase === 3 || phrase === 5 ? -12 : 0,
      vibratoHz: 4.4,
      vibratoDepth: 0.001,
    });
  }
}

function renderF2Combat(mix, secondsPerBeat) {
  const roots = [50, 50, 47, 48, 50, 45, 43, 48];
  for (let bar = 0; bar < 40; bar += 1) {
    const start = bar * 2;
    const root = roots[bar % roots.length];
    [0, 0.5, 1, 1.5].forEach((beat, index) => {
      renderNote(mix, {
        note: root,
        startBeat: start + beat,
        durationBeats: 0.24,
        secondsPerBeat,
        kind: "cello",
        gain: index % 2 === 0 ? 0.083 : 0.058,
        attack: 0.01,
        release: 0.075,
      });
    });
    renderSoftDrum(mix, {
      startBeat: start,
      secondsPerBeat,
      gain: 0.105,
      startHz: 88,
      endHz: 50,
    });
    if (bar % 2 === 1) {
      renderSoftDrum(mix, {
        startBeat: start + 1,
        secondsPerBeat,
        gain: 0.068,
        startHz: 72,
        endHz: 46,
      });
    }
  }
  for (let phrase = 0; phrase < 10; phrase += 1) {
    renderTheme(mix, F2_THEME, phrase * 8, secondsPerBeat, {
      kind: phrase % 3 === 2 ? "horn" : "felt",
      gain: phrase >= 7 ? 0.108 : 0.093,
      attack: 0.015,
      release: 0.13,
      transpose: phrase % 4 === 3 ? -12 : 0,
    });
  }
}

function renderF2Boss(mix, secondsPerBeat) {
  const roots = [50, 47, 48, 45, 50, 43, 45, 48];
  for (let bar = 0; bar < 48; bar += 1) {
    const start = bar * 2;
    const root = roots[bar % roots.length];
    renderChord(mix, [root + 12, root + 16, root + 19], start, 1.82, secondsPerBeat, {
      kind: "horn",
      gain: bar >= 24 ? 0.063 : 0.048,
      attack: 0.065,
      release: 0.3,
    });
    [0, 1].forEach((beat, index) => {
      renderNote(mix, {
        note: root,
        startBeat: start + beat,
        durationBeats: 0.48,
        secondsPerBeat,
        kind: "cello",
        gain: index === 0 ? 0.1 : 0.07,
        attack: 0.014,
        release: 0.12,
      });
    });
    renderSoftDrum(mix, {
      startBeat: start,
      secondsPerBeat,
      gain: bar % 8 === 0 ? 0.132 : 0.096,
      startHz: 86,
      endHz: 49,
    });
  }
  for (let phrase = 0; phrase < 12; phrase += 1) {
    renderTheme(mix, F2_THEME, phrase * 8, secondsPerBeat, {
      kind: phrase < 4 ? "cello" : "horn",
      gain: phrase < 4 ? 0.09 : phrase >= 8 ? 0.115 : 0.102,
      attack: 0.022,
      release: 0.18,
      transpose: phrase % 5 === 4 ? -12 : 0,
    });
  }
}

function onePoleLowpass(samples, cutoffHz) {
  const dt = 1 / SAMPLE_RATE;
  const rc = 1 / (TAU * cutoffHz);
  const alpha = dt / (rc + dt);
  for (let pass = 0; pass < 2; pass += 1) {
    let previous = 0;
    for (let index = 0; index < samples.length; index += 1) {
      previous += alpha * (samples[index] - previous);
      samples[index] = previous;
    }
  }
}

function onePoleHighpass(samples, cutoffHz) {
  const dt = 1 / SAMPLE_RATE;
  const rc = 1 / (TAU * cutoffHz);
  const alpha = rc / (rc + dt);
  let previousOutput = 0;
  let previousInput = samples[0] ?? 0;
  for (let index = 0; index < samples.length; index += 1) {
    const currentInput = samples[index];
    previousOutput = alpha * (previousOutput + currentInput - previousInput);
    samples[index] = previousOutput;
    previousInput = currentInput;
  }
}

function removeDc(samples) {
  let sum = 0;
  for (const value of samples) sum += value;
  const mean = sum / Math.max(1, samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] -= mean;
  }
}

function measure(samples) {
  let peak = 0;
  let squareSum = 0;
  for (const value of samples) {
    peak = Math.max(peak, Math.abs(value));
    squareSum += value * value;
  }
  const rms = Math.sqrt(squareSum / Math.max(1, samples.length));
  return {
    peak,
    peakDbfs: 20 * Math.log10(Math.max(1e-9, peak)),
    rms,
    rmsDbfs: 20 * Math.log10(Math.max(1e-9, rms)),
  };
}

function normalize(samples, targetRmsDbfs, targetPeakDbfs) {
  const before = measure(samples);
  const rmsScale = 10 ** ((targetRmsDbfs - before.rmsDbfs) / 20);
  const peakScale = 10 ** (targetPeakDbfs / 20) / Math.max(1e-9, before.peak);
  const scale = Math.min(rmsScale, peakScale);
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] * scale;
    samples[index] = Math.tanh(value * 1.035) / Math.tanh(1.035);
  }
}

function encodePcm16Wav(samples) {
  const bytesPerSample = BIT_DEPTH / 8;
  const dataLength = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28);
  buffer.writeUInt16LE(CHANNELS * bytesPerSample, 32);
  buffer.writeUInt16LE(BIT_DEPTH, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    const pcm = value < 0
      ? Math.round(value * 32_768)
      : Math.round(value * 32_767);
    buffer.writeInt16LE(pcm, 44 + index * bytesPerSample);
  }
  return buffer;
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function oggCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let remainder = index << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      remainder = remainder & 0x80000000
        ? ((remainder << 1) ^ 0x04c11db7) >>> 0
        : (remainder << 1) >>> 0;
    }
    table[index] = remainder;
  }
  return table;
}

const OGG_CRC_TABLE = oggCrcTable();

async function normalizeOggContainer(filePath, trackId) {
  const bytes = Buffer.from(await readFile(filePath));
  const serial = Number.parseInt(
    createHash("sha256").update(trackId).digest("hex").slice(0, 8),
    16,
  ) >>> 0;
  let offset = 0;
  while (offset < bytes.length) {
    if (bytes.toString("ascii", offset, offset + 4) !== "OggS") {
      throw new Error(`Invalid OGG page at byte ${offset}.`);
    }
    const segmentCount = bytes[offset + 26];
    let bodyLength = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      bodyLength += bytes[offset + 27 + index];
    }
    const pageLength = 27 + segmentCount + bodyLength;
    const pageEnd = offset + pageLength;
    if (pageEnd > bytes.length) {
      throw new Error(`Truncated OGG page at byte ${offset}.`);
    }

    bytes.writeUInt32LE(serial, offset + 14);
    bytes.writeUInt32LE(0, offset + 22);
    let checksum = 0;
    for (let index = offset; index < pageEnd; index += 1) {
      const slot = ((checksum >>> 24) & 0xff) ^ bytes[index];
      checksum = ((checksum << 8) ^ OGG_CRC_TABLE[slot]) >>> 0;
    }
    bytes.writeUInt32LE(checksum, offset + 22);
    offset = pageEnd;
  }
  await writeFile(filePath, bytes);
}

async function encodeRuntimeFormats(wavPath, targetBasePath, trackId) {
  const oggPath = `${targetBasePath}.ogg`;
  const mp3Path = `${targetBasePath}.mp3`;
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-fflags",
    "+bitexact",
    "-i",
    wavPath,
    "-map_metadata",
    "-1",
    "-c:a",
    "vorbis",
    "-flags:a",
    "+bitexact",
    "-strict",
    "-2",
    "-ac",
    "2",
    "-b:a",
    "56k",
    oggPath,
  ]);
  await normalizeOggContainer(oggPath, trackId);
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-fflags",
    "+bitexact",
    "-i",
    wavPath,
    "-map_metadata",
    "-1",
    "-c:a",
    "libmp3lame",
    "-flags:a",
    "+bitexact",
    "-b:a",
    "64k",
    mp3Path,
  ]);
  return { oggPath, mp3Path };
}

async function renderTrack(track, temporaryDirectory) {
  const secondsPerBeat = 60 / track.bpm;
  const totalBeats = track.beatsPerBar * track.bars;
  const durationSeconds = totalBeats * secondsPerBeat;
  const sampleCount = Math.round(durationSeconds * SAMPLE_RATE);
  const mix = new Float64Array(sampleCount);
  track.render(mix, secondsPerBeat);
  removeDc(mix);
  onePoleHighpass(mix, track.highpassHz);
  onePoleLowpass(mix, track.lowpassHz);
  normalize(mix, track.targetRmsDbfs, track.targetPeakDbfs);
  const finalMeasurement = measure(mix);

  const wavPath = path.join(temporaryDirectory, `${track.id}.wav`);
  await writeFile(wavPath, encodePcm16Wav(mix));
  const outputDirectory = path.join(OUTPUT_ROOT, track.folder);
  await mkdir(outputDirectory, { recursive: true });
  const { oggPath, mp3Path } = await encodeRuntimeFormats(
    wavPath,
    path.join(outputDirectory, track.filename),
    track.id,
  );

  return {
    schemaVersion: 1,
    id: track.id,
    floor: track.floor,
    mode: track.mode,
    titleZh: track.titleZh,
    sourceWork: COMPOSITION_RIGHTS[track.sourceKey],
    transcription: {
      author: "SELECT FROM DUNGEON project",
      sourcePath: "scripts/generate-runtime-classical-audio.mjs",
      method: "independently entered declarative note data",
    },
    arrangement: {
      author: "SELECT FROM DUNGEON project",
      ownership: "project-owned",
      notes:
        "New harmony, form, rhythm, dynamics, synthesis, filtering, and game-state arrangement.",
    },
    performance: {
      ownership: "project-generated",
      engine: "deterministic additive synthesis in Node.js",
    },
    thirdPartyInputs: {
      recordings: [],
      midi: [],
      samples: [],
      soundfonts: [],
      impulseResponses: [],
    },
    audio: {
      bpm: track.bpm,
      beatsPerBar: track.beatsPerBar,
      bars: track.bars,
      durationSeconds: Number(durationSeconds.toFixed(6)),
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      lowpassHz: track.lowpassHz,
      highpassHz: track.highpassHz,
      measuredRmsDbfs: Number(finalMeasurement.rmsDbfs.toFixed(3)),
      measuredPeakDbfs: Number(finalMeasurement.peakDbfs.toFixed(3)),
      loopStartSeconds: 0,
      loopEndSeconds: Number(durationSeconds.toFixed(6)),
    },
    runtimeFiles: [
      {
        format: "audio/ogg",
        channels: 2,
        path: `/${path.relative(path.resolve(process.cwd(), "public"), oggPath)}`,
        bytes: (await readFile(oggPath)).byteLength,
        sha256: await sha256(oggPath),
      },
      {
        format: "audio/mpeg",
        channels: 1,
        path: `/${path.relative(path.resolve(process.cwd(), "public"), mp3Path)}`,
        bytes: (await readFile(mp3Path)).byteLength,
        sha256: await sha256(mp3Path),
      },
    ],
  };
}

async function main() {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "sql-dungeon-audio-"));
  try {
    const records = [];
    for (const track of TRACKS) {
      records.push(await renderTrack(track, temporaryDirectory));
    }

    const scriptSha256 = await sha256(
      path.resolve(process.cwd(), "scripts/generate-runtime-classical-audio.mjs"),
    );
    const sourceManifest = {
      schemaVersion: 1,
      status: "runtime",
      generatedAt: "2026-07-26",
      generator: {
        path: "scripts/generate-runtime-classical-audio.mjs",
        sha256: scriptSha256,
        deterministic: true,
        requiredTool: "ffmpeg (only for OGG/MP3 encoding)",
        containerNormalization:
          "OGG stream serials and page CRCs are normalized from the stable track id.",
      },
      license:
        "The underlying compositions are public domain. The new transcription data, arrangements, synthesis, and recordings are project-owned and distributed under the repository MIT license.",
      records,
    };

    await mkdir(OUTPUT_ROOT, { recursive: true });
    await mkdir(SOURCE_ROOT, { recursive: true });
    await writeFile(
      path.join(OUTPUT_ROOT, "audio-source.json"),
      `${JSON.stringify(sourceManifest, null, 2)}\n`,
    );
    await writeFile(
      path.join(SOURCE_ROOT, "audio-source.json"),
      `${JSON.stringify(sourceManifest, null, 2)}\n`,
    );

    for (const folder of ["f01", "f02"]) {
      const floorRecords = records.filter((record) => (
        `f${String(record.floor).padStart(2, "0")}` === folder
      ));
      await writeFile(
        path.join(OUTPUT_ROOT, folder, "manifest.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          floor: floorRecords[0]?.floor,
          tracks: floorRecords,
        }, null, 2)}\n`,
      );
    }

    for (const record of records) {
      const files = record.runtimeFiles
        .map((file) => `${file.format} ${file.bytes}B`)
        .join(", ");
      process.stdout.write(
        `${record.id} ${record.audio.durationSeconds}s ${files}\n`,
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
