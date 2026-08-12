import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SAMPLE_RATE = 22_050;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const TAU = Math.PI * 2;

const TRACKS = [
  {
    id: "floor1-underground-hearth-exploration-preview-v3",
    titleZh: "地下余烬",
    titleEn: "Underground Hearth",
    role: "floor-1-exploration",
    bpm: 68,
    beatsPerBar: 3,
    bars: 12,
    mode: "A Dorian / A minor",
    targetPeakDbfs: -8,
    lowpassHz: 3_200,
    roomTaps: [
      [92, 0.065],
      [181, 0.042],
      [287, 0.026],
    ],
    render: renderUndergroundHearth,
  },
  {
    id: "floor1-underground-hearth-battle-preview-v3",
    titleZh: "余烬疾行",
    titleEn: "Ember Pursuit",
    role: "floor-1-battle",
    bpm: 118,
    beatsPerBar: 4,
    bars: 16,
    mode: "A Dorian / A minor",
    targetPeakDbfs: -6,
    lowpassHz: 3_000,
    roomTaps: [
      [68, 0.035],
      [137, 0.022],
    ],
    compressor: {
      threshold: 0.16,
      ratio: 3,
    },
    render: renderEmberPursuit,
  },
  {
    id: "floor8-sunset-high-hall-preview-v2",
    titleZh: "残照高堂",
    titleEn: "High Hall at Sunset",
    role: "floor-8-exploration",
    bpm: 72,
    beatsPerBar: 3,
    bars: 12,
    mode: "A major with borrowed minor iv and flat VI",
    targetPeakDbfs: -7,
    lowpassHz: 3_400,
    roomTaps: [
      [118, 0.105],
      [237, 0.07],
      [409, 0.045],
    ],
    render: renderSunsetHighHall,
  },
];

function midiToHz(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function oscillator(kind, phase) {
  if (kind === "sine") {
    return Math.sin(phase);
  }

  if (kind === "triangle") {
    return (2 / Math.PI) * Math.asin(Math.sin(phase));
  }

  if (kind === "warm") {
    return (
      Math.sin(phase)
      + 0.22 * Math.sin(phase * 2)
      + 0.08 * Math.sin(phase * 3)
    ) / 1.3;
  }

  if (kind === "cello") {
    return (
      Math.sin(phase)
      + 0.34 * Math.sin(phase * 2)
      + 0.16 * Math.sin(phase * 3)
      + 0.07 * Math.sin(phase * 4)
    ) / 1.57;
  }

  if (kind === "horn") {
    return (
      Math.sin(phase)
      + 0.28 * Math.sin(phase * 2)
      + 0.13 * Math.sin(phase * 3)
      + 0.04 * Math.sin(phase * 4)
    ) / 1.45;
  }

  throw new Error(`Unknown oscillator: ${kind}`);
}

function beatToSample(beat, secondsPerBeat) {
  return Math.round(beat * secondsPerBeat * SAMPLE_RATE);
}

function smoothEnvelope(position, length, attackSamples, releaseSamples) {
  const attack = Math.min(1, position / Math.max(1, attackSamples));
  const remaining = length - position - 1;
  const release = Math.min(1, remaining / Math.max(1, releaseSamples));
  const edge = Math.max(0, Math.min(attack, release));
  return edge * edge * (3 - 2 * edge);
}

function renderNote(
  mix,
  {
    note,
    startBeat,
    durationBeats,
    secondsPerBeat,
    kind = "sine",
    gain = 0.1,
    attack = 0.012,
    release = 0.14,
    phaseOffset = 0,
    vibratoHz = 0,
    vibratoDepth = 0,
  },
) {
  if (note === null || note === undefined || durationBeats <= 0) {
    return;
  }

  const start = beatToSample(startBeat, secondsPerBeat);
  const length = Math.max(1, beatToSample(durationBeats, secondsPerBeat));
  const attackSamples = Math.round(attack * SAMPLE_RATE);
  const releaseSamples = Math.round(release * SAMPLE_RATE);
  const baseFrequency = midiToHz(note);
  let phase = phaseOffset;

  for (let offset = 0; offset < length && start + offset < mix.length; offset += 1) {
    const envelope = smoothEnvelope(
      offset,
      length,
      attackSamples,
      releaseSamples,
    );
    const vibrato = vibratoHz > 0
      ? 1 + vibratoDepth * Math.sin(TAU * vibratoHz * offset / SAMPLE_RATE)
      : 1;
    phase += (TAU * baseFrequency * vibrato) / SAMPLE_RATE;
    mix[start + offset] += (
      oscillator(kind, phase)
      * gain
      * envelope
    );
  }
}

function renderChord(
  mix,
  notes,
  startBeat,
  durationBeats,
  secondsPerBeat,
  options,
) {
  notes.forEach((note, index) => {
    renderNote(mix, {
      note,
      startBeat,
      durationBeats,
      secondsPerBeat,
      phaseOffset: index * 0.31,
      ...options,
    });
  });
}

function renderKick(
  mix,
  {
    startBeat,
    secondsPerBeat,
    gain = 0.12,
    startHz = 92,
    endHz = 52,
    durationSeconds = 0.16,
  },
) {
  const start = beatToSample(startBeat, secondsPerBeat);
  const length = Math.round(durationSeconds * SAMPLE_RATE);
  let phase = 0;

  for (let offset = 0; offset < length && start + offset < mix.length; offset += 1) {
    const progress = offset / Math.max(1, length - 1);
    const frequency = startHz * (endHz / startHz) ** progress;
    phase += (TAU * frequency) / SAMPLE_RATE;
    const envelope = (1 - progress) ** 2.6;
    mix[start + offset] += Math.sin(phase) * gain * envelope;
  }
}

function renderTom(
  mix,
  {
    note,
    startBeat,
    secondsPerBeat,
    gain = 0.07,
    durationBeats = 0.28,
  },
) {
  renderNote(mix, {
    note,
    startBeat,
    durationBeats,
    secondsPerBeat,
    kind: "sine",
    gain,
    attack: 0.008,
    release: 0.12,
  });
}

function renderUndergroundHearth(mix, secondsPerBeat) {
  const chords = [
    [57, 59, 60, 64],
    [53, 57, 60, 64],
    [52, 55, 60, 64],
    [55, 59, 62],
    [57, 60, 64],
    [54, 57, 59, 62],
    [53, 57, 60, 64],
    [52, 57, 59, 64],
    [57, 59, 60, 64],
    [55, 60, 64],
    [50, 54, 57, 62],
    [52, 56, 59, 64],
  ];

  const bassRoots = [45, 41, 40, 43, 45, 42, 41, 40, 45, 48, 38, 40];

  chords.forEach((notes, bar) => {
    const startBeat = bar * 3;
    const middleLift = bar >= 4 && bar <= 8 ? 1.08 : 0.88;
    renderChord(mix, notes, startBeat, 3.28, secondsPerBeat, {
      kind: "triangle",
      gain: 0.024 * middleLift,
      attack: 0.2,
      release: 0.62,
    });
    renderNote(mix, {
      note: bassRoots[bar],
      startBeat,
      durationBeats: 3.22,
      secondsPerBeat,
      kind: "sine",
      gain: 0.06 * middleLift,
      attack: 0.08,
      release: 0.52,
    });

    const arpeggio = [notes[0], notes[1], notes.at(-1)];
    arpeggio.forEach((note, beatInBar) => {
      renderNote(mix, {
        note,
        startBeat: startBeat + beatInBar + 0.06,
        durationBeats: 0.5,
        secondsPerBeat,
        kind: "triangle",
        gain: 0.026,
        attack: 0.018,
        release: 0.18,
      });
    });
  });

  const melody = [
    [0.35, 57, 0.82],
    [1.35, 60, 0.82],
    [2.35, 64, 0.5],
    [3.35, 59, 0.85],
    [4.6, 57, 1.05],
    [6.35, 62, 0.72],
    [7.35, 60, 0.72],
    [8.35, 59, 0.55],
    [9.35, 57, 1.1],
    [12.25, 57, 0.7],
    [13.1, 60, 0.7],
    [13.95, 64, 0.72],
    [15.0, 66, 0.62],
    [16.0, 64, 0.7],
    [17.0, 59, 0.65],
    [18.2, 62, 0.72],
    [19.1, 60, 0.72],
    [20.0, 57, 1.2],
    [24.2, 64, 0.72],
    [25.1, 62, 0.72],
    [26.0, 60, 0.65],
    [27.05, 59, 0.72],
    [28.0, 57, 0.72],
    [29.0, 60, 0.72],
    [30.1, 59, 0.72],
    [31.1, 57, 1.0],
    [33.1, 56, 0.62],
    [34.0, 59, 0.62],
    [34.9, 57, 0.85],
  ];

  melody.forEach(([startBeat, note, durationBeats], index) => {
    renderNote(mix, {
      note,
      startBeat,
      durationBeats: durationBeats + 0.18,
      secondsPerBeat,
      kind: "sine",
      gain: index >= 9 && index <= 18 ? 0.115 : 0.092,
      attack: 0.018,
      release: 0.34,
    });
    renderNote(mix, {
      note: note - 12,
      startBeat,
      durationBeats: durationBeats + 0.22,
      secondsPerBeat,
      kind: "triangle",
      gain: 0.018,
      attack: 0.025,
      release: 0.38,
    });
  });

  const sustainedLine = [
    [0, 45, 5.82],
    [6, 41, 5.82],
    [12, 45, 5.82],
    [18, 41, 5.82],
    [24, 45, 5.82],
    [30, 40, 5.74],
  ];
  sustainedLine.forEach(([startBeat, note, durationBeats]) => {
    renderNote(mix, {
      note,
      startBeat,
      durationBeats,
      secondsPerBeat,
      kind: "cello",
      gain: 0.028,
      attack: 0.14,
      release: 0.7,
      vibratoHz: 4.6,
      vibratoDepth: 0.0018,
    });
  });
}

function renderEmberPursuit(mix, secondsPerBeat) {
  const chordRoots = [45, 41, 48, 43, 45, 42, 41, 40];
  const chordTones = [
    [57, 60, 64],
    [53, 57, 60],
    [60, 64, 67],
    [55, 59, 62],
    [57, 60, 64],
    [54, 57, 62],
    [53, 57, 60],
    [52, 56, 59],
  ];

  for (let bar = 0; bar < 16; bar += 1) {
    const patternIndex = bar % chordRoots.length;
    const startBeat = bar * 4;
    const thinkingSection = bar >= 8 && bar < 12;
    const density = thinkingSection ? 0.58 : bar >= 4 ? 1 : 0.82;

    renderChord(
      mix,
      chordTones[patternIndex],
      startBeat,
      4.22,
      secondsPerBeat,
      {
        kind: "triangle",
        gain: thinkingSection ? 0.013 : 0.018,
        attack: 0.09,
        release: 0.3,
      },
    );

    for (let beatInBar = 0; beatInBar < 4; beatInBar += 0.5) {
      if (thinkingSection && beatInBar % 1 !== 0) {
        continue;
      }
      renderNote(mix, {
        note: chordRoots[patternIndex],
        startBeat: startBeat + beatInBar,
        durationBeats: thinkingSection ? 0.46 : 0.3,
        secondsPerBeat,
        kind: "triangle",
        gain: 0.07 * density,
        attack: 0.01,
        release: 0.08,
      });
    }

    [0.25, 1.25, 2.25, 3.25].forEach((beatInBar, index) => {
      if (thinkingSection && index % 2 === 1) {
        return;
      }
      renderChord(
        mix,
        chordTones[patternIndex],
        startBeat + beatInBar,
        thinkingSection ? 0.42 : 0.28,
        secondsPerBeat,
        {
          kind: "warm",
          gain: 0.024 * density,
          attack: 0.012,
          release: 0.08,
        },
      );
    });

    renderKick(mix, {
      startBeat,
      secondsPerBeat,
      gain: thinkingSection ? 0.07 : 0.125,
    });
    if (!thinkingSection) {
      renderKick(mix, {
        startBeat: startBeat + 2,
        secondsPerBeat,
        gain: 0.105,
        startHz: 84,
        endHz: 48,
      });
      renderTom(mix, {
        note: 40,
        startBeat: startBeat + 3.25,
        secondsPerBeat,
        gain: 0.055,
      });
    } else {
      renderTom(mix, {
        note: 40,
        startBeat: startBeat + 2.5,
        secondsPerBeat,
        gain: 0.038,
      });
    }
  }

  const phrase = [
    [0, 57, 0.42],
    [0.5, 60, 0.42],
    [1, 64, 0.78],
    [2, 59, 0.42],
    [2.5, 57, 0.42],
    [3, 60, 0.78],
    [4, 62, 0.42],
    [4.5, 60, 0.42],
    [5, 59, 0.78],
    [6, 57, 0.42],
    [6.5, 59, 0.42],
    [7, 64, 0.72],
  ];

  for (let section = 0; section < 8; section += 1) {
    const baseBeat = section * 8;
    const thinkingSection = baseBeat >= 32 && baseBeat < 48;
    phrase.forEach(([offset, note, durationBeats], index) => {
      if (thinkingSection && index % 3 === 1) {
        return;
      }
      const variation = section >= 6 && index === 2 ? 2 : 0;
      renderNote(mix, {
        note: note + variation,
        startBeat: baseBeat + offset,
        durationBeats: durationBeats + 0.08,
        secondsPerBeat,
        kind: "warm",
        gain: thinkingSection ? 0.052 : 0.078,
        attack: 0.012,
        release: 0.16,
      });
    });
  }
}

function renderSunsetHighHall(mix, secondsPerBeat) {
  const chords = [
    [57, 61, 64],
    [56, 59, 64],
    [54, 57, 61],
    [50, 54, 57],
    [49, 57, 61],
    [47, 50, 54],
    [52, 57, 59],
    [50, 53, 57],
    [52, 57, 61],
    [53, 57, 60],
    [50, 53, 57],
    [57, 61, 64],
  ];
  const bassRoots = [33, 32, 30, 38, 37, 35, 40, 38, 40, 41, 38, 33];

  chords.forEach((notes, bar) => {
    const startBeat = bar * 3;
    const arc = bar < 3 ? 0.72 : bar < 8 ? 1 : bar < 11 ? 0.88 : 0.64;

    renderNote(mix, {
      note: bassRoots[bar],
      startBeat,
      durationBeats: 3.42,
      secondsPerBeat,
      kind: "cello",
      gain: 0.085 * arc,
      attack: 0.16,
      release: 0.72,
      vibratoHz: 4.4,
      vibratoDepth: 0.0016,
    });
    renderChord(mix, notes, startBeat, 3.46, secondsPerBeat, {
      kind: "warm",
      gain: 0.038 * arc,
      attack: 0.24,
      release: 0.76,
    });
    renderNote(mix, {
      note: notes.at(-1) + 12,
      startBeat: startBeat + 0.08,
      durationBeats: 3.24,
      secondsPerBeat,
      kind: "sine",
      gain: 0.019 * arc,
      attack: 0.24,
      release: 0.72,
    });

    if ([0, 4, 8, 11].includes(bar)) {
      renderKick(mix, {
        startBeat,
        secondsPerBeat,
        gain: bar === 8 ? 0.085 : 0.065,
        startHz: 72,
        endHz: 42,
        durationSeconds: 0.24,
      });
    }
  });

  const mainTheme = [
    [0.35, 57, 0.85],
    [1.35, 61, 0.85],
    [2.35, 64, 0.52],
    [3.4, 59, 0.8],
    [4.55, 57, 1.0],
    [6.3, 62, 0.72],
    [7.25, 61, 0.72],
    [8.2, 59, 0.68],
    [9.3, 57, 1.15],
    [12.25, 57, 0.72],
    [13.1, 61, 0.72],
    [13.95, 64, 0.78],
    [15.05, 66, 0.72],
    [16.0, 64, 0.68],
    [17.0, 61, 0.68],
    [18.2, 62, 0.72],
    [19.1, 61, 0.72],
    [20.0, 59, 0.72],
    [21.1, 57, 1.1],
    [24.2, 64, 0.72],
    [25.1, 61, 0.72],
    [26.0, 59, 0.72],
    [27.05, 57, 0.72],
    [28.0, 60, 0.48],
    [28.55, 61, 0.62],
    [29.4, 64, 0.72],
    [30.4, 62, 0.68],
    [31.3, 60, 0.68],
    [32.2, 57, 0.92],
    [33.25, 61, 0.68],
    [34.15, 59, 0.62],
    [35.0, 57, 0.78],
  ];

  mainTheme.forEach(([startBeat, note, durationBeats], index) => {
    const climax = index >= 9 && index <= 22;
    renderNote(mix, {
      note,
      startBeat,
      durationBeats: durationBeats + 0.3,
      secondsPerBeat,
      kind: "horn",
      gain: climax ? 0.11 : 0.086,
      attack: 0.065,
      release: 0.48,
      vibratoHz: 4.8,
      vibratoDepth: 0.0012,
    });
    renderNote(mix, {
      note: note - 12,
      startBeat,
      durationBeats: durationBeats + 0.36,
      secondsPerBeat,
      kind: "triangle",
      gain: climax ? 0.028 : 0.02,
      attack: 0.025,
      release: 0.5,
    });
  });

  const counterline = [
    [9.5, 69, 1.2],
    [11.2, 68, 0.8],
    [12.5, 69, 1.0],
    [15.5, 71, 1.0],
    [18.5, 69, 1.0],
    [21.5, 68, 0.9],
    [24.5, 69, 1.1],
    [27.5, 65, 1.0],
    [30.5, 64, 1.0],
    [33.5, 61, 1.0],
  ];

  counterline.forEach(([startBeat, note, durationBeats]) => {
    renderNote(mix, {
      note,
      startBeat,
      durationBeats,
      secondsPerBeat,
      kind: "sine",
      gain: 0.043,
      attack: 0.08,
      release: 0.28,
    });
  });

  const celloNarrative = [
    [0, 45, 5.7],
    [5.75, 42, 5.7],
    [11.5, 49, 5.7],
    [17.25, 47, 5.7],
    [23, 45, 5.7],
    [28.75, 40, 3.25],
    [32, 45, 3.75],
  ];

  celloNarrative.forEach(([startBeat, note, durationBeats], index) => {
    renderNote(mix, {
      note,
      startBeat,
      durationBeats,
      secondsPerBeat,
      kind: "cello",
      gain: index >= 2 && index <= 4 ? 0.062 : 0.048,
      attack: 0.18,
      release: 0.9,
      vibratoHz: 4.5,
      vibratoDepth: 0.0022,
    });
  });
}

function applyCircularRoom(samples, taps) {
  const dry = Float64Array.from(samples);
  for (const [delayMs, gain] of taps) {
    const delaySamples = Math.round(delayMs * SAMPLE_RATE / 1_000);
    for (let index = 0; index < samples.length; index += 1) {
      const sourceIndex = (
        index - delaySamples + samples.length
      ) % samples.length;
      samples[index] += dry[sourceIndex] * gain;
    }
  }
}

function lowpass(samples, cutoffHz) {
  const timeStep = 1 / SAMPLE_RATE;
  const resistance = 1 / (TAU * cutoffHz);
  const alpha = timeStep / (resistance + timeStep);

  for (let pass = 0; pass < 2; pass += 1) {
    let filtered = 0;
    for (let index = 0; index < samples.length; index += 1) {
      filtered += alpha * (samples[index] - filtered);
      samples[index] = filtered;
    }
  }
}

function fadeLoopEdge(samples, durationMs = 8) {
  const length = Math.min(
    Math.round(durationMs * SAMPLE_RATE / 1_000),
    Math.floor(samples.length / 2),
  );
  for (let index = 0; index < length; index += 1) {
    const gain = index / Math.max(1, length - 1);
    samples[index] *= gain;
    samples[samples.length - 1 - index] *= gain;
  }
}

function compress(samples, { threshold, ratio }) {
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index];
    const magnitude = Math.abs(value);
    if (magnitude <= threshold) {
      continue;
    }
    samples[index] = Math.sign(value) * (
      threshold + (magnitude - threshold) / ratio
    );
  }
}

function removeDcAndNormalize(samples, targetPeakDbfs) {
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  let peak = 0;

  for (let index = 0; index < samples.length; index += 1) {
    samples[index] -= mean;
    peak = Math.max(peak, Math.abs(samples[index]));
  }

  const targetPeak = 10 ** (targetPeakDbfs / 20);
  const scale = peak > 0 ? targetPeak / peak : 1;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] *= scale;
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
  buffer.writeUInt32LE(
    SAMPLE_RATE * CHANNELS * bytesPerSample,
    28,
  );
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

async function renderTrack(track, outputDirectory) {
  const secondsPerBeat = 60 / track.bpm;
  const totalBeats = track.beatsPerBar * track.bars;
  const durationSeconds = totalBeats * secondsPerBeat;
  const sampleCount = Math.round(durationSeconds * SAMPLE_RATE);
  const mix = new Float64Array(sampleCount);

  track.render(mix, secondsPerBeat);
  applyCircularRoom(mix, track.roomTaps);
  lowpass(mix, track.lowpassHz);
  if (track.compressor) {
    compress(mix, track.compressor);
  }
  fadeLoopEdge(mix);
  removeDcAndNormalize(mix, track.targetPeakDbfs);

  const wav = encodePcm16Wav(mix);
  const filename = `${track.id}.wav`;
  await writeFile(path.join(outputDirectory, filename), wav);

  return {
    id: track.id,
    title_zh: track.titleZh,
    title_en: track.titleEn,
    role: track.role,
    filename,
    bpm: track.bpm,
    time_signature: `${track.beatsPerBar}/4`,
    bars: track.bars,
    mode: track.mode,
    duration_seconds: Number(durationSeconds.toFixed(6)),
    sample_rate_hz: SAMPLE_RATE,
    channels: CHANNELS,
    bit_depth: BIT_DEPTH,
    lowpass_hz: track.lowpassHz,
    room_taps_ms: track.roomTaps.map(([delayMs]) => delayMs),
    compressor: track.compressor ?? null,
    target_peak_dbfs: track.targetPeakDbfs,
    sha256: createHash("sha256").update(wav).digest("hex"),
    source: "scripts/generate-music-ascent-previews.mjs",
    theme: "A-C-E-B becomes A-C#-E-B at the high hall.",
    license_note: "Project-original procedural audio; no samples, MIDI imports, or third-party recordings.",
  };
}

async function main() {
  const outputDirectory = path.resolve(
    process.cwd(),
    process.argv[2] ?? "docs/design/assets/music-ascent-v1",
  );
  await mkdir(outputDirectory, { recursive: true });

  const tracks = [];
  for (const track of TRACKS) {
    tracks.push(await renderTrack(track, outputDirectory));
  }

  const manifest = {
    schema_version: 1,
    design_status: "candidate-v3",
    deterministic: true,
    runtime_asset: false,
    supersedes: [
      "docs/design/assets/region-01/scribe-ember-archive-preview-v1.wav",
      "docs/design/assets/region-01/floor1-wetwall-circuit-preview-v1.wav",
      "docs/design/assets/music-ascent-v1/floor1-underground-hearth-exploration-preview-v2.wav",
      "docs/design/assets/music-ascent-v1/floor1-underground-hearth-battle-preview-v2.wav",
      "docs/design/assets/music-ascent-v1/floor8-sunset-high-hall-preview-v1.wav",
    ],
    tracks,
  };
  await writeFile(
    path.join(outputDirectory, "audio-preview-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  for (const track of tracks) {
    process.stdout.write(
      `${track.filename} ${track.duration_seconds}s ${track.sha256}\n`,
    );
  }
}

await main();
