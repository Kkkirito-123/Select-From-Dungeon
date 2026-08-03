/** 生成课程概念提示音的离线脚本；产物进入静态资源目录供运行时加载。 */
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
    id: "scribe-ember-archive-preview-v1",
    titleZh: "余烬档案",
    titleEn: "Ember Archive",
    bpm: 68,
    bars: 8,
    mode: "A Dorian",
    seed: 0x53435249,
    peakDbfs: -6,
    render: renderScribeTheme,
  },
  {
    id: "floor1-wetwall-circuit-preview-v1",
    titleZh: "湿墙回路",
    titleEn: "Wetwall Circuit",
    bpm: 84,
    bars: 8,
    mode: "D Dorian",
    seed: 0x57455431,
    peakDbfs: -4,
    render: renderFloorTheme,
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
  if (kind === "pulse25") {
    const cycle = ((phase / TAU) % 1 + 1) % 1;
    return cycle < 0.25 ? 1 : -1;
  }
  throw new Error(`Unknown oscillator: ${kind}`);
}

function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function beatToSample(beat, secondsPerBeat) {
  return Math.round(beat * secondsPerBeat * SAMPLE_RATE);
}

function envelope(position, length, attackSamples, releaseSamples) {
  const attack = Math.min(1, position / Math.max(1, attackSamples));
  const remaining = length - position - 1;
  const release = Math.min(1, remaining / Math.max(1, releaseSamples));
  return Math.max(0, Math.min(attack, release));
}

function renderNote(
  mix,
  {
    note,
    startBeat,
    durationBeats,
    secondsPerBeat,
    kind,
    gain,
    attack = 0.01,
    release = 0.12,
    phaseOffset = 0,
  },
) {
  if (note === null || note === undefined) {
    return;
  }

  const start = beatToSample(startBeat, secondsPerBeat);
  const length = Math.max(
    1,
    beatToSample(durationBeats, secondsPerBeat),
  );
  const attackSamples = Math.round(attack * SAMPLE_RATE);
  const releaseSamples = Math.round(release * SAMPLE_RATE);
  const phaseStep = (TAU * midiToHz(note)) / SAMPLE_RATE;

  for (let offset = 0; offset < length && start + offset < mix.length; offset += 1) {
    const env = envelope(offset, length, attackSamples, releaseSamples);
    const phase = phaseOffset + phaseStep * offset;
    mix[start + offset] += oscillator(kind, phase) * gain * env;
  }
}

function renderFilteredNoise(
  mix,
  {
    startBeat,
    durationBeats,
    secondsPerBeat,
    gain,
    random,
    color = 0.86,
  },
) {
  const start = beatToSample(startBeat, secondsPerBeat);
  const length = Math.max(1, beatToSample(durationBeats, secondsPerBeat));
  let filtered = 0;
  const attackSamples = Math.round(0.004 * SAMPLE_RATE);
  const releaseSamples = Math.round(0.08 * SAMPLE_RATE);

  for (let offset = 0; offset < length && start + offset < mix.length; offset += 1) {
    const white = random() * 2 - 1;
    filtered = filtered * color + white * (1 - color);
    const env = envelope(offset, length, attackSamples, releaseSamples);
    mix[start + offset] += filtered * gain * env;
  }
}

function addChord(mix, notes, startBeat, durationBeats, secondsPerBeat, options) {
  notes.forEach((note, index) => {
    renderNote(mix, {
      note,
      startBeat,
      durationBeats,
      secondsPerBeat,
      phaseOffset: index * 0.37,
      ...options,
    });
  });
}

function renderScribeTheme(mix, secondsPerBeat, random) {
  const chords = [
    [45, 52, 59],
    [40, 55, 59],
    [43, 50, 59],
    [42, 50, 57],
    [45, 52, 59],
    [40, 47, 55],
    [45, 50, 54],
    [45, 52, 57],
  ];

  chords.forEach((notes, bar) => {
    const startBeat = bar * 4;
    const contour = bar < 2 ? 0.75 : bar < 6 ? 1 : 0.72;
    addChord(mix, notes, startBeat, 3.86, secondsPerBeat, {
      kind: "triangle",
      gain: 0.035 * contour,
      attack: 0.18,
      release: 0.42,
    });

    renderNote(mix, {
      note: notes[0] - 12,
      startBeat,
      durationBeats: 3.75,
      secondsPerBeat,
      kind: "sine",
      gain: 0.055 * contour,
      attack: 0.12,
      release: 0.35,
    });
  });

  const bellMotif = [
    [0.75, 69, 0.72],
    [2.25, 72, 0.65],
    [4.75, 76, 0.9],
    [7.0, 71, 0.78],
    [9.0, 69, 0.62],
    [11.5, 72, 0.75],
    [13.5, 76, 0.7],
    [15.25, 71, 0.5],
    [17.0, 69, 0.82],
    [18.75, 72, 0.55],
    [20.5, 76, 0.95],
    [23.0, 78, 0.7],
    [25.25, 76, 0.62],
    [27.0, 72, 0.62],
    [29.0, 71, 0.55],
    [30.75, 69, 0.7],
  ];

  bellMotif.forEach(([startBeat, note, durationBeats], index) => {
    renderNote(mix, {
      note,
      startBeat,
      durationBeats,
      secondsPerBeat,
      kind: "sine",
      gain: index >= 8 && index < 13 ? 0.13 : 0.105,
      attack: 0.005,
      release: 0.24,
    });
    renderNote(mix, {
      note: note + 12,
      startBeat,
      durationBeats: durationBeats * 0.62,
      secondsPerBeat,
      kind: "sine",
      gain: 0.022,
      attack: 0.003,
      release: 0.18,
      phaseOffset: 0.7,
    });
  });

  const pulseNotes = [57, 64, 59, 64, 55, 62, 57, 62];
  for (let beat = 0; beat < 32; beat += 2) {
    renderNote(mix, {
      note: pulseNotes[(beat / 4) % pulseNotes.length | 0],
      startBeat: beat + 0.02,
      durationBeats: 0.34,
      secondsPerBeat,
      kind: "pulse25",
      gain: 0.011,
      attack: 0.003,
      release: 0.1,
    });
  }

  for (let beat = 3.75; beat < 32; beat += 8) {
    renderFilteredNoise(mix, {
      startBeat: beat,
      durationBeats: 0.16,
      secondsPerBeat,
      gain: 0.075,
      random,
      color: 0.9,
    });
  }
}

function renderFloorTheme(mix, secondsPerBeat, random) {
  const chords = [
    [50, 57, 64, 65],
    [48, 55, 57, 64],
    [47, 55, 62],
    [45, 52, 55, 60],
    [41, 45, 50, 52],
    [40, 43, 48, 52],
    [43, 50, 52, 59],
    [45, 52, 57, 62],
  ];

  chords.forEach((notes, bar) => {
    const startBeat = bar * 4;
    renderNote(mix, {
      note: notes[0] - 12,
      startBeat,
      durationBeats: 1.74,
      secondsPerBeat,
      kind: "triangle",
      gain: bar >= 4 && bar <= 6 ? 0.11 : 0.085,
      attack: 0.018,
      release: 0.18,
    });
    renderNote(mix, {
      note: notes[0] - 12,
      startBeat: startBeat + 2,
      durationBeats: 1.65,
      secondsPerBeat,
      kind: "triangle",
      gain: bar >= 4 && bar <= 6 ? 0.095 : 0.072,
      attack: 0.012,
      release: 0.16,
    });

    const arpeggio = [
      notes[0],
      notes[1],
      notes[2],
      notes.at(-1),
      notes[1],
      notes[2],
      notes.at(-1),
      notes[2],
    ];
    arpeggio.forEach((note, step) => {
      if (bar === 7 && step >= 5) {
        return;
      }
      renderNote(mix, {
        note,
        startBeat: startBeat + step * 0.5,
        durationBeats: 0.36,
        secondsPerBeat,
        kind: "triangle",
        gain: bar >= 4 && bar <= 6 ? 0.052 : 0.04,
        attack: 0.004,
        release: 0.1,
      });
    });
  });

  const melody = [
    [0.5, 62, 0.75],
    [2.0, 69, 0.48],
    [3.0, 65, 0.65],
    [4.5, 64, 0.75],
    [6.0, 60, 0.5],
    [7.0, 64, 0.55],
    [8.5, 62, 0.7],
    [10.0, 67, 0.55],
    [11.0, 59, 0.7],
    [12.5, 60, 0.7],
    [14.0, 64, 0.45],
    [15.0, 67, 0.55],
    [16.25, 65, 0.55],
    [17.25, 69, 0.55],
    [18.25, 72, 0.72],
    [20.25, 64, 0.5],
    [21.0, 67, 0.5],
    [22.0, 72, 0.65],
    [23.0, 76, 0.5],
    [24.25, 67, 0.55],
    [25.25, 71, 0.55],
    [26.25, 74, 0.68],
    [28.25, 69, 0.62],
    [29.25, 64, 0.52],
    [30.25, 62, 0.7],
  ];

  melody.forEach(([startBeat, note, durationBeats]) => {
    renderNote(mix, {
      note,
      startBeat,
      durationBeats,
      secondsPerBeat,
      kind: "pulse25",
      gain: startBeat >= 16 && startBeat < 28 ? 0.072 : 0.058,
      attack: 0.004,
      release: 0.1,
    });
    renderNote(mix, {
      note: note - 12,
      startBeat,
      durationBeats,
      secondsPerBeat,
      kind: "sine",
      gain: 0.018,
      attack: 0.008,
      release: 0.12,
    });
  });

  for (let beat = 1.5; beat < 30; beat += 2) {
    renderFilteredNoise(mix, {
      startBeat: beat,
      durationBeats: 0.1,
      secondsPerBeat,
      gain: 0.045,
      random,
      color: 0.78,
    });
  }

  [7.72, 15.72, 23.72].forEach((startBeat) => {
    renderFilteredNoise(mix, {
      startBeat,
      durationBeats: 0.18,
      secondsPerBeat,
      gain: 0.065,
      random,
      color: 0.94,
    });
  });
}

function removeDcAndNormalize(samples, peakDbfs) {
  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] -= mean;
    peak = Math.max(peak, Math.abs(samples[index]));
  }

  const targetPeak = 10 ** (peakDbfs / 20);
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
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28);
  buffer.writeUInt16LE(CHANNELS * bytesPerSample, 32);
  buffer.writeUInt16LE(BIT_DEPTH, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    const pcm = value < 0 ? Math.round(value * 32_768) : Math.round(value * 32_767);
    buffer.writeInt16LE(pcm, 44 + index * bytesPerSample);
  }
  return buffer;
}

async function renderTrack(track, outputDirectory) {
  const secondsPerBeat = 60 / track.bpm;
  const beats = track.bars * 4;
  const durationSeconds = beats * secondsPerBeat;
  const sampleCount = Math.round(durationSeconds * SAMPLE_RATE);
  const mix = new Float64Array(sampleCount);
  const random = createPrng(track.seed);

  track.render(mix, secondsPerBeat, random);
  removeDcAndNormalize(mix, track.peakDbfs);

  const wav = encodePcm16Wav(mix);
  const filename = `${track.id}.wav`;
  await writeFile(path.join(outputDirectory, filename), wav);

  return {
    id: track.id,
    title_zh: track.titleZh,
    title_en: track.titleEn,
    filename,
    bpm: track.bpm,
    bars: track.bars,
    mode: track.mode,
    duration_seconds: Number(durationSeconds.toFixed(6)),
    sample_rate_hz: SAMPLE_RATE,
    channels: CHANNELS,
    bit_depth: BIT_DEPTH,
    seed: `0x${track.seed.toString(16).toUpperCase()}`,
    target_peak_dbfs: track.peakDbfs,
    sha256: createHash("sha256").update(wav).digest("hex"),
    source: "scripts/generate-concept-audio.mjs",
    license_note: "Project-original procedural audio; no samples or third-party recordings.",
  };
}

async function main() {
  const outputDirectory = path.resolve(
    process.cwd(),
    process.argv[2] ?? "docs/design/assets/region-01",
  );
  await mkdir(outputDirectory, { recursive: true });

  const tracks = [];
  for (const track of TRACKS) {
    tracks.push(await renderTrack(track, outputDirectory));
  }

  const manifest = {
    schema_version: 1,
    deterministic: true,
    runtime_asset: false,
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
