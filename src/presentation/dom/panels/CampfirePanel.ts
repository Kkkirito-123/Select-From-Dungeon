/**
 * 篝火菜单 Panel。
 *
 * 篝火是游戏内的休息和当前楼层复盘入口。Panel 只展示快照与已经准备好的
 * Agent 输出，并把休息、离开动作交给 AppShell 注入的回调；它不会自行
 * 计算复活点，也不会把 Agent 输出写回游戏状态。
 */
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { CampfireOutput } from "../../../contracts/agent/outputPort";
import type { CampfirePanelActions } from "./panelContracts";

function requiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少篝火界面元素：${selector}`);
  return element;
}

export class CampfirePanel {
  private readonly menu: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: CampfirePanelActions,
    private readonly preparedOutput: (snapshot: GameSnapshot) => CampfireOutput,
  ) {
    this.menu = requiredElement(root, "#campfire-menu");
  }

  isOpen(): boolean {
    return this.menu.classList.contains("is-open");
  }

  /** 绑定篝火区域的按钮事件；具体动作仍由 AppShell 注入。 */
  bind(options: AddEventListenerOptions): void {
    requiredElement<HTMLButtonElement>(this.root, "#rest-at-campfire")
      .addEventListener("click", () => this.rest(), options);
    requiredElement<HTMLButtonElement>(this.root, "#review-at-campfire")
      .addEventListener("click", () => this.actions.openReview(), options);
    requiredElement<HTMLButtonElement>(this.root, "#leave-campfire")
      .addEventListener("click", () => this.leave(), options);
    requiredElement<HTMLButtonElement>(this.root, "#open-campfire-inventory")
      .addEventListener("click", () => this.actions.openInventory(), options);
  }

  rest(): void {
    const resolution = this.actions.restAtCampfire();
    const notice = {
      message: resolution.message,
      tone: resolution.ok ? "success" as const : "info" as const,
    };
    this.actions.showNotice(notice);
    if (resolution.ok) this.actions.focusGame();
  }

  leave(): void {
    if (this.actions.leaveCampfire()) this.actions.focusGame();
  }

  render(snapshot: GameSnapshot, entered: boolean): void {
    const open = snapshot.mode === "campfire" && snapshot.activeCampfireId !== null;
    this.menu.hidden = !open;
    this.menu.inert = !open;
    this.menu.setAttribute("aria-hidden", String(!open));
    this.menu.classList.toggle("is-open", open);
    this.root.classList.toggle("campfire-active", open);
    if (!open) return;

    const campfire = snapshot.campfires.find(
      (entry) => entry.id === snapshot.activeCampfireId,
    );
    const phaseName = campfire?.phase === "front"
      ? "前段篝火"
      : campfire?.phase === "middle"
        ? "中段篝火"
        : "后段篝火";
    requiredElement(this.menu, "#campfire-menu-title").textContent = phaseName;
    const reviewButton = requiredElement<HTMLButtonElement>(this.menu, "#review-at-campfire");
    const recap = this.preparedOutput(snapshot);
    requiredElement(this.menu, "#campfire-menu-status").textContent =
      `生命 ${snapshot.player.hp}/${snapshot.player.maxHp} · 护甲 ${snapshot.player.armorHp}/${snapshot.player.armor?.maxArmor ?? 0}。休息会全部恢复，并把这里设为复活点；${recap.available ? "本层精英记录已解锁复盘。" : "击败本层精英后才会解锁复盘。"}`;
    reviewButton.disabled = !recap.available;
    requiredElement(this.menu, "#campfire-recap-headline").textContent = recap.headline;
    const facts = requiredElement(this.menu, "#campfire-recap-facts");
    facts.replaceChildren(...recap.facts.map((fact) => {
      const item = document.createElement("li");
      item.textContent = fact;
      item.classList.toggle("is-hint-fact", fact.includes("提示"));
      return item;
    }));
    const focus = requiredElement(this.menu, "#campfire-recap-focus");
    focus.hidden = recap.focusConcept === null;
    focus.textContent = recap.focusConcept === null ? "" : `当前关注 · ${recap.focusConcept}`;
    requiredElement(this.menu, "#campfire-recap-next").textContent = `下一步 · ${recap.nextAction}`;
    if (entered) {
      requiredElement<HTMLButtonElement>(this.menu, "#rest-at-campfire")
        .focus({ preventScroll: true });
    }
  }
}
