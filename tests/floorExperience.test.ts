/** 验证八层固定地标、隐藏房、故事触发和世界变化内容可追溯。 */
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

  it("显式绑定展示区域与前中后三段导航区域", () => {
    expect(FLOOR_EXPERIENCES.map((experience) => ({
      floor: experience.floor,
      regions: experience.regions.map(({ id, navigationRegion }) => ({
        id,
        navigationRegion,
      })),
    }))).toEqual([
      {
        floor: 1,
        regions: [
          { id: "f1-drainage", navigationRegion: "front" },
          { id: "f1-dormitory", navigationRegion: "middle" },
          { id: "f1-registry", navigationRegion: "rear" },
        ],
      },
      {
        floor: 2,
        regions: [
          { id: "f2-coast", navigationRegion: "front" },
          { id: "f2-lake", navigationRegion: "front" },
          { id: "f2-forest-swamp", navigationRegion: "middle" },
          { id: "f2-lighthouse", navigationRegion: "rear" },
        ],
      },
      {
        floor: 3,
        regions: [
          { id: "f3-bone-yard", navigationRegion: "front" },
          { id: "f3-grave-mire", navigationRegion: "middle" },
          { id: "f3-spirit-crypt", navigationRegion: "rear" },
        ],
      },
      {
        floor: 4,
        regions: [
          { id: "f4-fire-forge", navigationRegion: "front" },
          { id: "f4-frost-vault", navigationRegion: "middle" },
          { id: "f4-storm-core", navigationRegion: "rear" },
        ],
      },
      {
        floor: 5,
        regions: [
          { id: "f5-outer-watch", navigationRegion: "front" },
          { id: "f5-barracks-ring", navigationRegion: "middle" },
          { id: "f5-inner-clock", navigationRegion: "rear" },
        ],
      },
      {
        floor: 6,
        regions: [
          { id: "f6-magma-workshop", navigationRegion: "front" },
          { id: "f6-crystal-repair", navigationRegion: "middle" },
          { id: "f6-rollback-summit", navigationRegion: "rear" },
        ],
      },
      {
        floor: 7,
        regions: [
          { id: "f7-crystal-grove", navigationRegion: "front" },
          { id: "f7-root-cloister", navigationRegion: "middle" },
          { id: "f7-index-heart", navigationRegion: "rear" },
        ],
      },
      {
        floor: 8,
        regions: [
          { id: "f8-obsidian-history", navigationRegion: "front" },
          { id: "f8-void-court", navigationRegion: "middle" },
          { id: "f8-data-throne", navigationRegion: "rear" },
        ],
      },
    ]);
  });

  it("第二层区分前区可选湖兽与中区主线蛙王", () => {
    const experience = floorExperience(2);
    expect(experience.regions.find((region) => region.id === "f2-lake")).toMatchObject({
      navigationRegion: "front",
      purpose: expect.stringContaining("湖兽是前区可选挑战"),
    });
    expect(experience.regions.find(
      (region) => region.id === "f2-forest-swamp",
    )).toMatchObject({
      navigationRegion: "middle",
      purpose: expect.stringContaining("蛙王是通往后区灯塔的主线硬门"),
    });
    expect(experience.landmarks.find(
      (landmark) => landmark.id === "f2-lake-beast",
    )?.interaction).toBe("前区可选挑战 ID #021");
    expect(experience.landmarks.find(
      (landmark) => landmark.id === "f2-frog-court",
    )?.interaction).toBe("主线硬门 ID #022 · 击败后开放灯塔道路");
  });

  it("第二至八层的区域首领均有唯一剧情事件、可直达管理员预设与完整通关记录", () => {
    const contracts = [
      { floor: 2, monsterId: 22, eventId: "f2-story-frog-court", presetId: "f2-admin-frog-court" },
      { floor: 3, monsterId: 33, eventId: "f3-story-grave-lord", presetId: "f3-admin-grave-lord" },
      { floor: 4, monsterId: 44, eventId: "f4-story-forge-lord", presetId: "f4-admin-echo" },
      { floor: 5, monsterId: 55, eventId: "f5-story-barracks-open", presetId: "f5-admin-barracks" },
      { floor: 6, monsterId: 66, eventId: "f6-story-crystal-cavern-open", presetId: "f6-admin-crystal-cavern" },
      { floor: 7, monsterId: 77, eventId: "f7-story-root-cloister-open", presetId: "f7-admin-root-cloister" },
      { floor: 8, monsterId: 89, eventId: "f8-story-void-court-open", presetId: "f8-admin-void-court" },
    ] as const;

    contracts.forEach(({ floor, monsterId, eventId, presetId }) => {
      const experience = floorExperience(floor);
      expect(experience.storyEvents.filter(
        (event) => event.trigger === `monster:${monsterId}:defeated`,
      )).toEqual([
        expect.objectContaining({
          id: eventId,
          repeat: "once",
          completionFact: expect.stringContaining("story:"),
        }),
      ]);
      expect(experience.adminPresets.find((preset) => preset.id === presetId))
        .toMatchObject({
          defeatedMonsterIds: expect.arrayContaining([monsterId]),
        });
      expect(experience.adminPresets.find(
        (preset) => preset.id.endsWith("-admin-complete"),
      )).toMatchObject({
        defeatedMonsterIds: expect.arrayContaining([monsterId]),
      });
    });

    expect(floorExperience(2).adminPresets.find(
      (preset) => preset.id === "f2-admin-low-tide",
    )?.defeatedMonsterIds).toContain(21);
    expect(floorExperience(2).adminPresets.find(
      (preset) => preset.id === "f2-admin-low-tide",
    )?.defeatedMonsterIds).not.toContain(22);
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

  it("F1-F3 隐藏区不强塞护甲，F4-F8 只提供各层确定性换装", () => {
    expect(FLOOR_EXPERIENCES.slice(0, 3).map(
      (experience) => experience.hiddenAreas[0]?.rewardArmorId,
    )).toEqual([undefined, undefined, undefined]);
    expect(FLOOR_EXPERIENCES.slice(3).map(
      (experience) => experience.hiddenAreas[0]?.rewardArmorId,
    )).toEqual([
      "ember-echo-robe",
      "iron-armor",
      "dragon-armor",
      "crystal-armor",
      "royal-armor",
    ]);
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
