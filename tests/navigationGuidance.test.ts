/** 验证迷路计数的方向、路线高亮和护送等级阈值。 */
import { describe, expect, it } from "vitest";
import { NAVIGATION_RUNTIME_CONFIG } from "../src/config/runtimeConfig";
import { GameSession } from "../src/domain/GameSession";
import { isMazeWalkable } from "../src/domain/mazeGenerator";
import type { SavedRun } from "../src/domain/types";

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

function runAtGuidanceStep(step: number): SavedRun {
  const session = new GameSession(null, null, `guidance-${step}`);
  const run = session.toSavedRun();
  const objective = run.graph.nodes.find((node) => node.lessonId === "select");
  if (!objective) throw new Error("测试图缺少 SELECT 固定目标");
  run.guidanceObjectiveId = objective.id;
  run.guidanceSteps = step;
  run.guidanceLevel = step >= NAVIGATION_RUNTIME_CONFIG.escortAt
    ? 3
    : step >= NAVIGATION_RUNTIME_CONFIG.routeHighlightAt
      ? 2
      : step >= NAVIGATION_RUNTIME_CONFIG.directionHintAt ? 1 : 0;
  return run;
}

function takeOneStep(session: GameSession): void {
  const snapshot = session.snapshot();
  const direction = DIRECTIONS.find(({ x, y }) => isMazeWalkable(
    snapshot.mazeFloor,
    snapshot.player.x + x,
    snapshot.player.y + y,
    new Set(snapshot.completedLessons),
    new Set(snapshot.openedGateIds),
  ));
  if (!direction) throw new Error("出生房没有可用测试步");
  expect(session.attemptPlayerMove(direction.x, direction.y).moved).toBe(true);
}

describe("navigation guidance", () => {
  it.each([
    [NAVIGATION_RUNTIME_CONFIG.directionHintAt - 1, 1],
    [NAVIGATION_RUNTIME_CONFIG.routeHighlightAt - 1, 2],
    [NAVIGATION_RUNTIME_CONFIG.escortAt - 1, 3],
  ] as const)("在第 %i 步后提升到 L%i", (before, expectedLevel) => {
    const session = new GameSession(runAtGuidanceStep(before));
    takeOneStep(session);
    const guidance = session.snapshot().navigationGuidance;
    expect(guidance.level).toBe(expectedLevel);
    expect(guidance.steps).toBe(before + 1);
    expect(guidance.objectiveRoomId).toContain("tutorial");
    if (expectedLevel >= 2) {
      expect(guidance.route.length).toBeGreaterThan(0);
      expect(guidance.route.length).toBeLessThanOrEqual(
        NAVIGATION_RUNTIME_CONFIG.maxHighlightedCells,
      );
    }
  });

  it("L3 护送逐格移动、不推进伏击计数，并允许 Escape 对应的取消动作", () => {
    const session = new GameSession(runAtGuidanceStep(NAVIGATION_RUNTIME_CONFIG.escortAt));
    const before = session.snapshot();
    expect(session.advanceGuidanceEscort()).toBe(true);
    const after = session.snapshot();
    expect(after.player).not.toMatchObject({ x: before.player.x, y: before.player.y });
    expect(after.totalMoves).toBe(before.totalMoves);
    expect(after.mode).toBe("explore");
    expect(session.cancelGuidanceEscort()).toBe(true);
    expect(session.snapshot().navigationGuidance.level).toBe(2);
  });
});
