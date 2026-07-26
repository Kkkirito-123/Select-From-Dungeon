import { access, readFile } from "node:fs/promises";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FLOOR_EXPERIENCES,
  floorExperience,
  validateFloorExperience,
} from "../src/content/floorExperience";

describe("two-floor experience contracts", () => {
  it("keeps every content contract internally valid", () => {
    FLOOR_EXPERIENCES.forEach((experience) => {
      expect(validateFloorExperience(experience)).toEqual([]);
    });
  });

  it("keeps one named scribe and two physical campfires per floor", () => {
    FLOOR_EXPERIENCES.forEach((experience) => {
      expect(experience.npcPlacements).toHaveLength(1);
      expect(experience.npcPlacements[0]).toMatchObject({
        name: "抄写员",
        alwaysShowName: true,
      });
      expect(experience.landmarks.filter((entry) => entry.kind === "campfire"))
        .toHaveLength(2);
      expect(experience.landmarks.filter((entry) => entry.kind === "spawn-anchor"))
        .toHaveLength(1);
    });
  });

  it("places the only floor-one scribe in the opening safe room, away from the ember", () => {
    const experience = floorExperience(1);
    const scribe = experience.npcPlacements[0];
    const ember = experience.landmarks.find((entry) => entry.id === "f1-spawn-ember");
    expect(scribe.anchor.roomNodeId).toBe("floor-1-entry");
    expect(ember?.anchor.roomNodeId).toBe("floor-1-entry");
    expect(scribe.anchor.position).not.toEqual(ember?.anchor.position);
  });

  it("exposes the intended world signatures", () => {
    expect(floorExperience(1).landmarks.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["f1-water-wheel", "f1-back-shortcut", "f1-registry-arena"]),
    );
    expect(floorExperience(2).landmarks.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["f2-drowned-village", "f2-ship-lock", "f2-lighthouse-arena"]),
    );
  });

  it("keeps every declared pack path and texture key aligned with public manifests", async () => {
    for (const experience of FLOOR_EXPERIENCES) {
      const manifestFile = new URL(
        `../public${experience.assetPack.manifestPath}`,
        import.meta.url,
      );
      await expect(access(manifestFile)).resolves.toBeUndefined();
      const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as {
        textures: Array<{ key: string; runtimePath: string }>;
      };
      const manifestDirectory = posix.dirname(experience.assetPack.manifestPath);
      const expectedAssets = manifest.textures.map((texture) => ({
        key: texture.key,
        path: posix.join(manifestDirectory, texture.runtimePath),
      }));
      expect(
        experience.assetPack.assets.map(({ key, path }) => ({ key, path })),
      ).toEqual(expectedAssets);
      for (const asset of experience.assetPack.assets) {
        await expect(
          access(new URL(`../public${asset.path}`, import.meta.url)),
        ).resolves.toBeUndefined();
      }
    }
  });
});
