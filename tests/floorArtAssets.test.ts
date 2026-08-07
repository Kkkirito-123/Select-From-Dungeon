import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  FLOOR_ART_ASSETS,
  FLOOR_ART_KEYS,
  supportsFloorArt,
} from "../src/presentation/phaser/floorArtAssets";

async function readJson(relativePath: string) {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  ) as Record<string, unknown>;
}

describe("floor art runtime contract", () => {
  it("loads only the requested authored floor and keeps all texture keys unique", () => {
    expect(supportsFloorArt(1)).toBe(true);
    expect(supportsFloorArt(2)).toBe(true);
    expect(supportsFloorArt(3)).toBe(false);

    const floorOne = FLOOR_ART_ASSETS[1];
    const floorTwo = FLOOR_ART_ASSETS[2];
    expect(floorOne).toHaveLength(6);
    expect(floorTwo).toHaveLength(2);
    expect(floorOne.every((asset) => asset.path.includes("01-ember-archive"))).toBe(true);
    expect(floorTwo.every((asset) => asset.path.includes("02-tidal-archipelago"))).toBe(true);

    const keys = [...floorOne, ...floorTwo].map((asset) => asset.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(FLOOR_ART_KEYS.floorOne.floor);
    expect(keys).toContain(FLOOR_ART_KEYS.floorTwo.waterAndIslands);
  });

  it("publishes two small, source-separated floor packs with all three CC0 sources", async () => {
    const index = await readJson("../public/assets/manifest.json");
    const floorOne = await readJson(
      "../public/assets/floors/01-ember-archive/manifest.json",
    ) as {
      compressedBytes: number;
      sources: Array<{ id: string; license: string }>;
      textures: Array<{ key: string; runtimePath: string }>;
    };
    const floorTwo = await readJson(
      "../public/assets/floors/02-tidal-archipelago/manifest.json",
    ) as {
      compressedBytes: number;
      sources: Array<{ id: string; license: string }>;
      textures: Array<{ key: string; runtimePath: string }>;
    };
    expect(index.loading).toBe("current-floor-only");
    expect(index.floorPacks).toHaveLength(2);
    expect(floorOne.compressedBytes).toBeLessThan(256 * 1024);
    expect(floorTwo.compressedBytes).toBeLessThan(384 * 1024);
    expect(floorOne.sources).toEqual([
      expect.objectContaining({ id: "0x72-dungeontileset-ii", license: "CC0-1.0" }),
    ]);
    expect(floorTwo.sources).toEqual([
      expect.objectContaining({ id: "shade-puny-world", license: "CC0-1.0" }),
      expect.objectContaining({
        id: "foozle-scallywag-water-islands",
        license: "CC0-1.0",
      }),
    ]);
    expect(
      FLOOR_ART_ASSETS[1].map(({ key, path }) => ({ key, path })),
    ).toEqual(
      floorOne.textures.map(({ key, runtimePath }) => ({
        key,
        path: `assets/floors/01-ember-archive/${runtimePath}`,
      })),
    );
    expect(
      FLOOR_ART_ASSETS[2].map(({ key, path }) => ({ key, path })),
    ).toEqual(
      floorTwo.textures.map(({ key, runtimePath }) => ({
        key,
        path: `assets/floors/02-tidal-archipelago/${runtimePath}`,
      })),
    );
  });
});
