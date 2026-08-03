/** 验证八层战役只能按顺序推进，且不会跳层、重复或重掷楼层。 */
import { describe, expect, it } from "vitest";
import {
  advanceCampaignProgress,
  createCampaignProgress,
  isCampaignProgress,
} from "../src/domain/campaign";

describe("eight-floor campaign shell", () => {
  it("同一 Seed 生成八个稳定楼层槽位", () => {
    const first = createCampaignProgress("campaign-seed");
    const second = createCampaignProgress("campaign-seed");

    expect(first).toEqual(second);
    expect(first.floors).toHaveLength(8);
    expect(first.floors.map((slot) => slot.seed)).toEqual([
      "campaign-seed",
      "campaign-seed:floor-2",
      "campaign-seed:floor-3",
      "campaign-seed:floor-4",
      "campaign-seed:floor-5",
      "campaign-seed:floor-6",
      "campaign-seed:floor-7",
      "campaign-seed:floor-8",
    ]);
  });

  it("空壳严格按 1 到 8 顺序推进，最后进入 completed", () => {
    let progress = createCampaignProgress("campaign-advance");
    for (let floor = 1; floor <= 7; floor += 1) {
      const transition = advanceCampaignProgress(progress);
      expect(transition).toMatchObject({
        ok: true,
        from: floor,
        to: floor + 1,
        completed: false,
      });
      progress = transition.progress;
    }

    const completed = advanceCampaignProgress(progress);
    expect(completed).toMatchObject({
      ok: true,
      from: 8,
      to: 8,
      completed: true,
    });
    expect(completed.progress.floors.every((slot) => slot.status === "cleared")).toBe(true);
    expect(advanceCampaignProgress(completed.progress).ok).toBe(false);
  });

  it("JSON 往返可恢复，乱序、重复激活或错误 Seed 会被拒绝", () => {
    const progress = createCampaignProgress("campaign-restore", 5);
    const restored: unknown = JSON.parse(JSON.stringify(progress));
    expect(isCampaignProgress(restored)).toBe(true);

    const wrongStatus = structuredClone(progress);
    wrongStatus.floors[7].status = "active";
    expect(isCampaignProgress(wrongStatus)).toBe(false);

    const wrongSeed = structuredClone(progress);
    wrongSeed.floors[5].seed = "rerolled";
    expect(isCampaignProgress(wrongSeed)).toBe(false);
  });
});
