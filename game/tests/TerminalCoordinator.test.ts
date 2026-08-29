import { describe, expect, it } from "vitest";
import {
  TerminalCoordinator,
  type TerminalCoordinatorPorts,
} from "../src/features/terminal/TerminalCoordinator";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import type { SqlQueryResult, TurnResolution } from "../src/contracts/game/results";

function snapshot(mode: GameSnapshot["mode"] = "combat"): GameSnapshot {
  return { floor: 1, lessonId: "select", mode, monsters: [] } as unknown as GameSnapshot;
}

function result(): SqlQueryResult {
  return {
    sql: "SELECT id FROM monsters",
    columns: ["id"],
    rows: [{ id: 1 }],
    targetIds: [1],
    plan: [],
    baseHeat: 1,
    features: ["select", "from"],
  };
}

function resolution(overrides: Partial<TurnResolution> = {}): TurnResolution {
  return {
    accepted: true,
    resultDisclosure: "safe-values",
    message: "命中",
    queryTargetIds: [1],
    attackTargetIds: [1],
    hpUpdates: [{ id: 1, hp: 0 }],
    killedIds: [1],
    playerDamage: 0,
    armorDamage: 0,
    heatAdded: 0,
    locksBroken: [],
    locksRemaining: [],
    events: [],
    mode: "victory",
    stageAdvanced: true,
    lessonCompleted: "select",
    experience: null,
    ...overrides,
  };
}

function createPorts(overrides: Partial<TerminalCoordinatorPorts> = {}) {
  const calls = {
    validate: 0,
    execute: 0,
    resolve: 0,
    registerError: 0,
    reset: 0,
    animate: 0,
    busy: [] as boolean[],
    resolving: [] as boolean[],
    close: 0,
    open: 0,
    notices: [] as string[],
  };
  const currentSnapshot = snapshot();
  const ports: TerminalCoordinatorPorts = {
    session: {
      snapshot: () => currentSnapshot,
      validateCombatQuery: () => {
        calls.validate += 1;
        return { ok: true };
      },
      resolveQuery: () => {
        calls.resolve += 1;
        return resolution();
      },
      registerQueryError: () => {
        calls.registerError += 1;
        return resolution({ accepted: false, mode: "combat", hpUpdates: [] });
      },
      validateGateChallengeQuery: () => ({ ok: true }),
      resolveGateChallenge: () => ({
        accepted: true,
        resultDisclosure: "safe-values",
        opened: true,
        gateId: "gate:boss",
        message: "已开门",
        playerDamage: 0,
        armorDamage: 0,
        mode: "explore",
      }),
      registerGateChallengeError: () => ({
        accepted: false,
        resultDisclosure: "shape-only",
        opened: false,
        gateId: "gate:boss",
        message: "失败",
        playerDamage: 1,
        armorDamage: 0,
        mode: "challenge",
      }),
    },
    sql: {
      execute: () => {
        calls.execute += 1;
        return result();
      },
      executeSelect: () => result(),
      updateMonsterHp: () => undefined,
      reset: () => {
        calls.reset += 1;
      },
    },
    getBattleScene: () => ({
      animateTurn: async () => {
        calls.animate += 1;
      },
      abortEncounter: () => undefined,
    }),
    getCombatInput: () => "SELECT id FROM monsters",
    getGateInput: () => "SELECT id FROM monsters",
    isGateTerminalOpen: () => true,
    hideCombatAutocomplete: () => undefined,
    hideGateAutocomplete: () => undefined,
    setResolving: (value) => calls.resolving.push(value),
    setCombatExecuteDisabled: () => undefined,
    setGateExecuteDisabled: () => undefined,
    setCombatStatus: () => undefined,
    setGateStatus: () => undefined,
    showNotice: (notice) => calls.notices.push(notice.message),
    dispatchFeedback: () => undefined,
    renderCombatResult: () => undefined,
    renderGateResult: () => undefined,
    onLessonAccepted: () => undefined,
    closeCombatTerminal: () => {
      calls.close += 1;
    },
    openCombatTerminal: () => {
      calls.open += 1;
    },
    syncAudioFocus: () => undefined,
    showCombatSettlement: () => undefined,
    ...overrides,
  };
  return { ports, calls };
}

describe("TerminalCoordinator", () => {
  it("空输入不调用 SQL 或 Session，也不进入 busy", async () => {
    const { ports, calls } = createPorts({ getCombatInput: () => "   " });
    const coordinator = new TerminalCoordinator(ports);

    await coordinator.executeCombat();

    expect(calls.validate).toBe(0);
    expect(calls.execute).toBe(0);
    expect(calls.resolve).toBe(0);
    expect(calls.busy).toEqual([]);
    expect(coordinator.isBusy).toBe(false);
  });

  it("一次提交只解析一次并在 finally 释放忙碌状态", async () => {
    const { ports, calls } = createPorts({
      setResolving: (value) => calls.resolving.push(value),
    });
    const coordinator = new TerminalCoordinator(ports);

    await coordinator.executeCombat();

    expect(calls.validate).toBe(1);
    expect(calls.execute).toBe(1);
    expect(calls.resolve).toBe(1);
    expect(calls.close).toBe(1);
    expect(calls.animate).toBe(1);
    expect(calls.resolving).toEqual([true, false]);
    expect(coordinator.isBusy).toBe(false);
  });

  it("动画失败不回滚已提交回合，仍清理 resolving 状态", async () => {
    const { ports, calls } = createPorts({
      getBattleScene: () => ({
        animateTurn: async () => { throw new Error("animation failed"); },
        abortEncounter: () => undefined,
      }),
    });
    const coordinator = new TerminalCoordinator(ports);

    await coordinator.executeCombat();

    expect(calls.resolve).toBe(1);
    expect(calls.reset).toBe(0);
    expect(calls.resolving).toEqual([true, false]);
    expect(coordinator.isBusy).toBe(false);
    expect(calls.notices.at(-1)).toContain("动画未播放");
  });

  it("外层异常会重置 SQL 并释放所有终端状态", async () => {
    const { ports, calls } = createPorts({
      session: {
        ...createPorts().ports.session,
        resolveQuery: () => { throw new Error("resolve failed"); },
      },
    });
    const coordinator = new TerminalCoordinator(ports);

    await coordinator.executeCombat();

    expect(calls.reset).toBe(1);
    expect(calls.close).toBe(1);
    expect(coordinator.isBusy).toBe(false);
  });
});
