/** 验证探索、精英结算、篝火和楼层事件到 Agent Hook 的映射。 */
import { describe, expect, it } from "vitest";
import { buildAgentPrepareRequest } from "../agent/runtime/context";
import { detectAgentHook } from "../agent/runtime/hooks";
import { buildLocalCampfireOutput } from "../agent/runtime/localFallback";
import { GameSession } from "../src/domain/GameSession";

function snapshot(overrides: Partial<ReturnType<GameSession["snapshot"]>> = {}) {
  return {
    ...new GameSession(null, null, "agent-hooks-test").snapshot(),
    ...overrides,
  };
}

describe("Agent semantic hooks", () => {
  it("入层只产生开场 Hook", () => {
    const current = snapshot();
    expect(detectAgentHook(null, current)).toMatchObject({
      type: "floor-start",
      phase: "opening",
    });
  });

  it("寻路等级升级才触发抄写员路线 Hook", () => {
    const previous = snapshot();
    const current = snapshot({
      navigationGuidance: {
        ...previous.navigationGuidance,
        level: 1,
        objectiveRoomId: "floor-1-lesson-1",
        objectiveTitle: "筛选门",
        direction: "east",
        distance: 12,
      },
    });
    expect(detectAgentHook(previous, current)).toMatchObject({
      type: "route-guidance",
      phase: "route",
      direction: "east",
    });
    expect(detectAgentHook(current, snapshot({
      ...current,
      totalMoves: current.totalMoves + 1,
      player: { ...current.player, x: current.player.x + 1 },
    }))).toBeNull();
  });

  it("精英从存活变为零生命时触发篝火解锁 Hook", () => {
    const previous = snapshot();
    const current = snapshot({
      monsters: previous.monsters.map((monster) => (
        monster.id === 4 ? { ...monster, hp: 0 } : monster
      )),
    });
    expect(detectAgentHook(previous, current)).toMatchObject({
      type: "elite-defeated",
      monsterId: 4,
    });
    expect(buildAgentPrepareRequest(current).trigger).toMatchObject({
      type: "elite-defeated",
      monsterId: 4,
    });
    expect(buildLocalCampfireOutput(buildAgentPrepareRequest(current, {
      type: "elite-defeated",
      phase: "route",
      floor: 1,
      monsterId: 4,
    }))).toMatchObject({ available: true });
  });

  it("层末只在 transition 或 victory 首次进入时触发", () => {
    const previous = snapshot();
    const current = snapshot({ mode: "transition" });
    expect(detectAgentHook(previous, current)).toMatchObject({
      type: "floor-end",
      phase: "ending",
    });
    expect(detectAgentHook(current, snapshot({ ...current, totalMoves: current.totalMoves + 1 }))).toBeNull();
  });
});
