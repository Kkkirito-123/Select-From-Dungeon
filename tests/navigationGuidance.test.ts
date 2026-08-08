import { describe, expect, it } from "vitest";
import { NAVIGATION_RUNTIME_CONFIG } from "../src/application/config/runtimeConfig";
import { GameSession } from "../src/domain/session/GameSession";
import { isMazeWalkable } from "../src/domain/exploration/mazeGenerator";
import { advancePatrolTick } from "../src/presentation/phaser/interaction/PatrolController";
import type { PatrolBatchResolution } from "../src/contracts/game/results";
import type { SavedRun } from "../src/domain/shared/types";

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

  it("L3 只保留高亮，不自动移动玩家", () => {
    const session = new GameSession(runAtGuidanceStep(NAVIGATION_RUNTIME_CONFIG.escortAt));
    const before = session.snapshot();
    expect(session.advanceGuidanceEscort()).toBe(false);
    const after = session.snapshot();
    expect(after.player).toEqual(before.player);
    expect(after.totalMoves).toBe(before.totalMoves);
    expect(after.mode).toBe("explore");
    expect(session.cancelGuidanceEscort()).toBe(true);
    expect(session.snapshot().navigationGuidance.level).toBe(2);
  });

  it("高亮路线不会暂停怪物巡逻", () => {
    let patrolCalls = 0;
    const resolution: PatrolBatchResolution = { moves: [], encounterId: null };
    const result = advancePatrolTick(
      {
        advanceMonsterPatrols: () => {
          patrolCalls += 1;
          return resolution;
        },
      },
      {
        locked: false,
        pagePaused: false,
        sceneActive: true,
        guidanceLevel: 3,
        blockingOverlay: false,
      },
      "explore",
    );

    expect(result).toEqual(resolution);
    expect(patrolCalls).toBe(1);
  });
});
