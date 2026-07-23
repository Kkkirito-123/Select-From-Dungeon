import { describe, expect, it, vi } from "vitest";
import type { ArcadeSfx } from "../src/audio/ArcadeAudio";
import { FeedbackDirector } from "../src/feedback/FeedbackDirector";

describe("FeedbackDirector", () => {
  it("一次语义事件只映射一个对应音效与一个通知", () => {
    const playSfx = vi.fn(async (_effect: ArcadeSfx) => true);
    const director = new FeedbackDirector({ playSfx });
    const notices: string[] = [];
    director.subscribe((_event, notice) => {
      if (notice) notices.push(notice.message);
    });

    director.dispatch({
      type: "item-pickup",
      itemName: "聚合战锤",
      kind: "weapon",
      message: "获得 聚合战锤 · 伤害 8 → 12",
    }, 1_000);

    expect(playSfx).toHaveBeenCalledExactlyOnceWith("pickup-weapon");
    expect(notices).toEqual(["获得 聚合战锤 · 伤害 8 → 12"]);
  });

  it("碰墙音在 150ms 内节流，脚步不受影响", () => {
    const playSfx = vi.fn(async (_effect: ArcadeSfx) => true);
    const director = new FeedbackDirector({ playSfx });
    director.dispatch({ type: "wall-bump" }, 1_000);
    director.dispatch({ type: "wall-bump" }, 1_100);
    director.dispatch({ type: "player-step" }, 1_110);
    director.dispatch({ type: "wall-bump" }, 1_151);

    expect(playSfx.mock.calls.map(([effect]) => effect)).toEqual([
      "bump",
      "step",
      "bump",
    ]);
  });
});
