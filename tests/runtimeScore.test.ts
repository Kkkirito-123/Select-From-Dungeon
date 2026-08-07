import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RecordedScorePlayer } from "../src/infrastructure/audio/RecordedScorePlayer";
import {
  RUNTIME_SCORE_ASSETS,
  resolveRuntimeScoreUrl,
  runtimeScoreForScene,
} from "../src/infrastructure/audio/runtimeScoreCatalog";

class FakeAudioParam {
  value = 1;
  cancelScheduledValues(): void {}
  setValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }
}

class FakeAudioNode {
  connect(): this {
    return this;
  }
  disconnect(): void {}
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  private ended: (() => void) | null = null;

  addEventListener(_name: string, listener: () => void): void {
    this.ended = listener;
  }
  start(when?: number): void {
    this.startedAt = when ?? 0;
  }
  stop(when?: number): void {
    this.stoppedAt = when ?? 0;
    this.ended?.();
    this.ended = null;
  }
}

class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 10;
  readonly sources: FakeBufferSourceNode[] = [];

  createBufferSource(): FakeBufferSourceNode {
    const source = new FakeBufferSourceNode();
    this.sources.push(source);
    return source;
  }
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  async decodeAudioData(): Promise<AudioBuffer> {
    return { duration: 60 } as AudioBuffer;
  }
}

describe("F1/F2 runtime score", () => {
  it("为前两层每种模式提供长循环，区域变化不重开同一文件", () => {
    expect(RUNTIME_SCORE_ASSETS).toHaveLength(6);
    RUNTIME_SCORE_ASSETS.forEach((asset) => {
      expect(asset.durationSeconds).toBeGreaterThanOrEqual(40);
      expect(asset.loopStartSeconds).toBe(0);
      expect(asset.loopEndSeconds).toBe(asset.durationSeconds);
      expect(asset.sources.map((source) => source.type)).toEqual([
        "audio/ogg",
        "audio/mpeg",
      ]);
    });

    const coast = runtimeScoreForScene({ floor: 2, region: 0, mode: "explore" });
    const lighthouseApproach = runtimeScoreForScene({
      floor: 2,
      region: 2,
      mode: "explore",
    });
    expect(lighthouseApproach).toBe(coast);
    expect(runtimeScoreForScene({ floor: 3, region: 0, mode: "explore" })).toBeNull();
    expect(resolveRuntimeScoreUrl(coast!.sources[0], "./")).toBe(
      "./assets/audio/f02/explore.ogg",
    );
  });

  it("按 OGG→MP3 解码并在模式切换时交叉淡化，不依赖短定时乐句", async () => {
    const context = new FakeAudioContext();
    const requested: string[] = [];
    const player = new RecordedScorePlayer(
      context as unknown as AudioContext,
      new FakeAudioNode() as unknown as AudioNode,
      {
        baseUrl: "./",
        fetchAudioBytes: async (url) => {
          requested.push(url);
          return new ArrayBuffer(8);
        },
      },
    );

    expect(await player.play({ floor: 1, region: 0, mode: "explore" })).toBe(true);
    expect(player.playingAssetId).toBe("f1-ember-archive-explore");
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].loop).toBe(true);
    expect(context.sources[0].loopEnd).toBeCloseTo(53.333333);

    expect(await player.play({ floor: 1, region: 2, mode: "explore" })).toBe(true);
    expect(context.sources).toHaveLength(1);

    expect(await player.play({ floor: 1, region: 2, mode: "combat" })).toBe(true);
    expect(player.playingAssetId).toBe("f1-ember-archive-combat");
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0].stoppedAt).toBeGreaterThan(context.currentTime + 1);
    expect(requested).toEqual([
      "./assets/audio/f01/explore.ogg",
      "./assets/audio/f01/combat.ogg",
    ]);
    player.dispose();
    expect(player.playingAssetId).toBeNull();
  });

  it("嵌入环境无法解码 OGG 时只回退到项目自制 MP3", async () => {
    const context = new FakeAudioContext();
    const requested: string[] = [];
    const player = new RecordedScorePlayer(
      context as unknown as AudioContext,
      new FakeAudioNode() as unknown as AudioNode,
      {
        baseUrl: "/blog/game/",
        fetchAudioBytes: async (url) => {
          requested.push(url);
          if (url.endsWith(".ogg")) throw new Error("unsupported format");
          return new ArrayBuffer(8);
        },
      },
    );

    expect(await player.play({ floor: 2, region: 0, mode: "boss" })).toBe(true);
    expect(requested).toEqual([
      "/blog/game/assets/audio/f02/boss.ogg",
      "/blog/game/assets/audio/f02/boss.mp3",
    ]);
    player.dispose();
  });

  it("运行时文件哈希、来源和无第三方录音声明与清单一致", async () => {
    const manifestPath = path.resolve(
      process.cwd(),
      "public/assets/audio/audio-source.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      records: Array<{
        floor: number;
        mode: string;
        sourceWork: { compositionStatus: string };
        thirdPartyInputs: Record<string, unknown[]>;
        runtimeFiles: Array<{ path: string; bytes: number; sha256: string }>;
      }>;
    };
    expect(manifest.records).toHaveLength(6);

    for (const record of manifest.records) {
      expect(record.sourceWork.compositionStatus).toBe("public-domain");
      Object.values(record.thirdPartyInputs).forEach((inputs) => {
        expect(inputs).toEqual([]);
      });
      for (const runtimeFile of record.runtimeFiles) {
        const bytes = await readFile(
          path.resolve(process.cwd(), "public", runtimeFile.path.slice(1)),
        );
        expect(bytes.byteLength).toBe(runtimeFile.bytes);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(
          runtimeFile.sha256,
        );
      }
    }

    for (const floor of [1, 2]) {
      const bytes = manifest.records
        .filter((record) => record.floor === floor)
        .flatMap((record) => record.runtimeFiles)
        .reduce((sum, file) => sum + file.bytes, 0);
      expect(bytes).toBeLessThan(2_500_000);
    }
  });
});
