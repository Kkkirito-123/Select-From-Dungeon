import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "../src/features/game-session/GameSession";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import {
  AppShellProjectionRenderer,
  type AppShellProjectionRendererPort,
} from "../src/features/app-shell/rendering/AppShellProjectionRenderer";
import type { CombatRenderer } from "../src/presentation/dom/renderers/CombatRenderer";
import type { HudRenderer } from "../src/presentation/dom/renderers/HudRenderer";
import type { MinimapRenderer } from "../src/presentation/dom/renderers/MinimapRenderer";
import type { MonsterCodexView } from "../src/presentation/dom/MonsterCodexView";

interface FakeElementState {
  element: HTMLElement;
  children: HTMLElement[];
}

function fakeElement(): FakeElementState {
  const children: HTMLElement[] = [];
  const element = {
    textContent: "",
    className: "",
    title: "",
    replaceChildren: (...nodes: HTMLElement[]) => {
      children.splice(0, children.length, ...nodes);
    },
    append: (...nodes: HTMLElement[]) => {
      children.push(...nodes);
    },
  } as unknown as HTMLElement;
  return { element, children };
}

function fakeRoot(nodes: Map<string, HTMLElement>): HTMLElement {
  return {
    querySelector: <T extends Element>(selector: string): T | null =>
      (nodes.get(selector) as T | undefined) ?? null,
  } as unknown as HTMLElement;
}

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    ...new GameSession(null, null, "app-shell-projection-renderer").snapshot(),
    ...overrides,
  };
}

describe("AppShellProjectionRenderer", () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => fakeElement().element,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  });

  function setup(): {
    renderer: AppShellProjectionRenderer;
    nodes: Map<string, FakeElementState>;
    ports: {
      hud: { renderProgress: ReturnType<typeof vi.fn> };
      combat: {
        renderTarget: ReturnType<typeof vi.fn>;
        renderLocks: ReturnType<typeof vi.fn>;
        renderTaskBrief: ReturnType<typeof vi.fn>;
      };
      minimap: {
        render: ReturnType<typeof vi.fn>;
        currentSight: ReturnType<typeof vi.fn>;
      };
      codex: { render: ReturnType<typeof vi.fn> };
    };
  } {
    const nodes = new Map<string, FakeElementState>([
      ["#open-monster-codex", fakeElement()],
      ["#mastery-list", fakeElement()],
      ["#relic-list", fakeElement()],
    ]);
    const hints = fakeElement();
    const ports = {
      hud: { renderProgress: vi.fn() },
      combat: {
        renderTarget: vi.fn(),
        renderLocks: vi.fn(),
        renderTaskBrief: vi.fn(),
      },
      minimap: {
        render: vi.fn(),
        currentSight: vi.fn(() => new Set<string>()),
      },
      codex: { render: vi.fn() },
    };
    const port: AppShellProjectionRendererPort = {
      root: fakeRoot(new Map(
        [...nodes].map(([selector, state]) => [selector, state.element]),
      )),
      hintsRoot: hints.element,
      hudRenderer: ports.hud as unknown as HudRenderer,
      minimapRenderer: ports.minimap as unknown as MinimapRenderer,
      combatRenderer: ports.combat as unknown as CombatRenderer,
      monsterCodex: ports.codex as unknown as MonsterCodexView,
    };
    return {
      renderer: new AppShellProjectionRenderer(port),
      nodes: new Map([...nodes, ["#hint-list", hints]]),
      ports,
    };
  }

  it("通过显式 ports 转发 HUD、战斗目标、锁、任务和地图投影", () => {
    const { renderer, ports } = setup();
    const current = snapshot();

    renderer.renderProgress("#hp-progress", "#hp-meter", 1, 2, "1 / 2");
    renderer.renderTarget(undefined, current);
    renderer.renderLocks(current);
    renderer.renderTaskBrief(current);
    renderer.renderMazeMap(current);
    expect(ports.hud.renderProgress).toHaveBeenCalledWith(
      "#hp-progress",
      "#hp-meter",
      1,
      2,
      "1 / 2",
    );
    expect(ports.combat.renderTarget).toHaveBeenCalledWith(undefined, current);
    expect(ports.combat.renderLocks).toHaveBeenCalledWith(current);
    expect(ports.combat.renderTaskBrief).toHaveBeenCalledWith(current);
    expect(ports.minimap.render).toHaveBeenCalledWith(current);
  });

  it("保持提示、掌握度、遗物和图鉴的玩家可见投影文案", () => {
    const { renderer, nodes, ports } = setup();
    const current = snapshot({
      hints: ["先筛选可见记录。"],
      relics: [{
        id: "cache-chip",
        name: "回燃衣",
        description: "护住余烬。",
        heatReduction: 1,
      }],
      profile: {
        ...snapshot().profile,
        masteredLessons: ["select"],
        discoveredMonsterIds: [1],
      },
    });

    renderer.renderHints(current.hints);
    renderer.renderMastery(current);
    renderer.renderRelics(current);
    renderer.renderMonsterCodex(current);

    expect(nodes.get("#hint-list")?.children[0]?.textContent)
      .toBe("提示 1 · 先筛选可见记录。");
    expect(nodes.get("#mastery-list")?.children.length).toBeGreaterThan(0);
    expect(nodes.get("#mastery-list")?.children
      .some((entry) => entry.textContent?.includes("✓") ?? false)).toBe(true);
    expect(nodes.get("#relic-list")?.children[0]?.textContent).toBe("回燃衣");
    expect(nodes.get("#open-monster-codex")?.element.textContent)
      .toContain("怪物图鉴 1/");
    expect(ports.codex.render).toHaveBeenCalledWith({
      floor: current.floor,
      discoveredMonsterIds: [1],
    });
  });
});
