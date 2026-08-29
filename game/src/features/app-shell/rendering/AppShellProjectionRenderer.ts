/**
 * AppShell 快照投影渲染器。
 *
 * 这里只接收快照或已经计算好的展示值，并把它们交给 DOM renderer 或
 * 无状态容器。它不读取 GameSession、不保存规则状态，也不决定 render()
 * 的调用顺序；AppShell 仍然是快照编排和生命周期的唯一所有者。
 */
import { INITIAL_MONSTERS, LESSONS } from "../../../content/curriculum/mvpLevel";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { Monster } from "../../../domain/shared/types";
import type { MonsterCodexView } from "../../../presentation/dom/MonsterCodexView";
import type { CombatRenderer } from "../../../presentation/dom/renderers/CombatRenderer";
import type { HudRenderer } from "../../../presentation/dom/renderers/HudRenderer";
import type { MinimapRenderer } from "../../../presentation/dom/renderers/MinimapRenderer";

export interface AppShellProjectionRendererPort {
  readonly root: HTMLElement;
  readonly hintsRoot: HTMLElement;
  readonly hudRenderer: HudRenderer;
  readonly minimapRenderer: MinimapRenderer;
  readonly combatRenderer: CombatRenderer;
  readonly monsterCodex: MonsterCodexView;
}
function requiredElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少 AppShell 投影节点：${selector}`);
  return element;
}

export class AppShellProjectionRenderer {
  constructor(private readonly port: AppShellProjectionRendererPort) {}

  renderProgress(
    progressSelector: string,
    barSelector: string,
    rawValue: number,
    rawMax: number,
    valueText: string,
  ): void {
    this.port.hudRenderer.renderProgress(
      progressSelector,
      barSelector,
      rawValue,
      rawMax,
      valueText,
    );
  }

  renderTarget(target: Monster | undefined, snapshot: GameSnapshot): void {
    this.port.combatRenderer.renderTarget(target, snapshot);
  }

  renderMonsterCodex(snapshot: GameSnapshot): void {
    this.port.monsterCodex.render({
      floor: snapshot.floor,
      discoveredMonsterIds: snapshot.profile.discoveredMonsterIds,
    });
    const total = new Set(INITIAL_MONSTERS.map((monster) => monster.id)).size;
    requiredElement<HTMLButtonElement>(
      this.port.root,
      "#open-monster-codex",
    ).textContent =
      `◆ 怪物图鉴 ${snapshot.profile.discoveredMonsterIds.length}/${total}`;
  }

  renderLocks(snapshot: GameSnapshot): void {
    this.port.combatRenderer.renderLocks(snapshot);
  }

  renderTaskBrief(snapshot: GameSnapshot): void {
    this.port.combatRenderer.renderTaskBrief(snapshot);
  }

  renderHints(hints: readonly string[]): void {
    this.port.hintsRoot.replaceChildren();
    hints.forEach((hint, index) => {
      const item = document.createElement("p");
      item.textContent = `提示 ${index + 1} · ${hint}`;
      this.port.hintsRoot.append(item);
    });
  }

  renderMazeMap(snapshot: GameSnapshot): void {
    this.port.minimapRenderer.render(snapshot);
  }

  currentSight(snapshot: GameSnapshot): Set<string> {
    return this.port.minimapRenderer.currentSight(snapshot);
  }

  renderMastery(snapshot: GameSnapshot): void {
    const root = requiredElement(this.port.root, "#mastery-list");
    root.replaceChildren();
    LESSONS.forEach((lesson) => {
      const chip = document.createElement("span");
      const mastered = snapshot.profile.masteredLessons.includes(lesson.id);
      chip.className = mastered ? "is-mastered" : "";
      chip.textContent = `${mastered ? "✓" : "○"} ${lesson.concept}`;
      root.append(chip);
    });
  }

  renderRelics(snapshot: GameSnapshot): void {
    const root = requiredElement(this.port.root, "#relic-list");
    root.replaceChildren();
    if (snapshot.relics.length === 0) {
      root.textContent = "本轮尚无遗物";
      return;
    }
    snapshot.relics.forEach((relic) => {
      const item = document.createElement("span");
      item.title = relic.description;
      item.textContent = relic.name;
      root.append(item);
    });
  }
}
