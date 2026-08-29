import { describe, expect, it } from "vitest";
import { GameSession } from "../src/features/game-session/GameSession";
import {
  SnapshotRenderer,
  projectSnapshot,
} from "../src/features/snapshot/SnapshotRenderer";
import type { GameSnapshot } from "../src/contracts/game/snapshots";

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  const base = new GameSession(null, null, "snapshot-renderer").snapshot();
  return { ...base, ...overrides };
}

describe("SnapshotRenderer", () => {
  it("projects room, biome, route and the initial mode transition", () => {
    const current = snapshot();
    const model = new SnapshotRenderer().project(null, current, null, null);

    expect(model.floorChanged).toBe(false);
    expect(model.room?.id).toBe(current.currentRoomId);
    expect(model.roomLabel).toBe("MAZE");
    expect(model.biomeName).toBeTruthy();
    expect(model.biomeIndex).toBeGreaterThanOrEqual(0);
    expect(model.routeTransit.label).toBeTruthy();
    expect(model.enteredCombat).toBe(false);
    expect(model.enteredChallenge).toBe(false);
    expect(model.terminalPlaceholder).toContain("SELECT");
    expect(model.musicMode).toBe("explore");
  });

  it("detects floor, stage and mode changes without mutating snapshots", () => {
    const previous = snapshot({ mode: "explore", floor: 1 });
    const current = snapshot({
      mode: "combat",
      floor: 7,
      lessonStageId: "stage:next" as GameSnapshot["lessonStageId"],
      focusMonsterId: 1,
      monsters: previous.monsters.map((monster, index) => ({
        ...monster,
        isBoss: index === 0,
      })),
    });
    const before = JSON.stringify(current);
    const model = projectSnapshot(previous, current, null, "explore");

    expect(model.floorChanged).toBe(true);
    expect(model.stageChanged).toBe(true);
    expect(model.enteredCombat).toBe(true);
    expect(model.terminalPlaceholder).toContain("EXPLAIN QUERY PLAN");
    expect(model.musicMode).toBe("boss");
    expect(JSON.stringify(current)).toBe(before);
  });

  it("keeps entered flags edge-triggered for repeated renders", () => {
    const current = snapshot({ mode: "challenge" });
    const model = new SnapshotRenderer().project(current, current, null, "challenge");

    expect(model.enteredChallenge).toBe(false);
    expect(model.enteredCampfire).toBe(false);
    expect(model.enteredInventory).toBe(false);
    expect(model.enteredLoot).toBe(false);
    expect(model.enteredDefeat).toBe(false);
    expect(model.enteredDeathReview).toBe(false);
  });
});
