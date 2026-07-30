import { access, readFile } from "node:fs/promises";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FLOOR_EXPERIENCES,
  floorExperience,
  validateFloorExperience,
} from "../src/content/floorExperience";

describe("eight-floor experience contracts", () => {
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
      expect(experience.landmarks.filter((entry) => entry.kind === "sql-seal"))
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
    expect(floorExperience(3).landmarks.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["f3-relation-bridge", "f3-reliquary", "f3-burial-shaft"]),
    );
    expect(floorExperience(4).landmarks.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "f4-forge-lord",
        "f4-echo-gate",
        "f4-echo-registry",
        "f4-echo-ember",
        "f4-echo-null-bed",
        "f4-echo-return",
        "f4-elemental-throne",
      ]),
    );
    expect(floorExperience(5).landmarks.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["f5-muster-board", "f5-sql-seal", "f5-command-clock"]),
    );
    expect(floorExperience(6).landmarks.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["f6-state-bridge", "f6-sql-seal", "f6-dragon-throne"]),
    );
    expect(floorExperience(7).landmarks.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["f7-index-road", "f7-sql-seal", "f7-plan-tree"]),
    );
    expect(floorExperience(8).landmarks.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["f8-version-gallery", "f8-sql-seal", "f8-migration-dais"]),
    );
  });

  it("第四层回燃残响同时要求前三类子查询和中层首领，并给出确定换装", () => {
    expect(floorExperience(4).hiddenAreas[0]).toMatchObject({
      gateId: "gate:floor-4-treasure",
      requiredLessonIds: ["f4-scalar", "f4-in", "f4-exists"],
      requiredMonsterIds: [44],
      rewardArmorId: "ember-echo-robe",
    });
  });

  it("第八层区分前七层历史证据与本层四类事故，并要求完整四课开启礼拜堂", () => {
    const experience = floorExperience(8);
    const incidentWings = experience.landmarks.find(
      (entry) => entry.id === "f8-incident-wings",
    );

    expect(experience.signature).toContain("七扇前层证据窗");
    expect(experience.signature).toContain("四座本层事故侧翼");
    expect(incidentWings).toMatchObject({
      name: "四事故证据台",
      fallback: "four-incident-wings",
    });
    expect(experience.hiddenAreas[0].requiredLessonIds).toEqual([
      "f8-mvcc",
      "f8-lock",
      "f8-isolation",
      "f8-modeling",
    ]);
  });

  it("每层只声明一个有课程前置、实体门与发现剧情的隐藏区域", () => {
    FLOOR_EXPERIENCES.forEach((experience) => {
      expect(experience.hiddenAreas).toHaveLength(1);
      const hidden = experience.hiddenAreas[0]!;
      expect(hidden.gateId).toBe(`gate:${hidden.roomNodeId}`);
      expect(hidden.requiredLessonIds.length).toBeGreaterThan(0);
      expect(experience.landmarks.some((entry) => entry.id === hidden.landmarkId))
        .toBe(true);
      expect(experience.storyEvents.some((entry) => entry.id === hidden.discoveryEventId))
        .toBe(true);
    });
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
