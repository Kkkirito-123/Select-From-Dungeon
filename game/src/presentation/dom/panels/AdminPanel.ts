import type { GameSnapshot } from "../../../contracts/game/snapshots";

function requiredElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少管理员面板元素：${selector}`);
  return element;
}

export interface AdminPanelActions {
  open(): void;
  close(): void;
  nextFloor(): void;
}

type AdminPanelSnapshot = Pick<GameSnapshot, "floor" | "mazeFloor" | "monsters">;

/** 只管理管理员面板的命令绑定、DOM 状态和焦点。 */
export class AdminPanel {
  constructor(
    private readonly root: HTMLElement,
    readonly element: HTMLElement,
    private readonly actions: AdminPanelActions,
  ) {}

  bind(options: AddEventListenerOptions): void {
    requiredElement<HTMLButtonElement>(this.root, "#open-admin").addEventListener(
      "click",
      this.actions.open,
      options,
    );
    requiredElement<HTMLButtonElement>(this.element, "#close-admin").addEventListener(
      "click",
      this.actions.close,
      options,
    );
    requiredElement<HTMLButtonElement>(this.element, "#admin-next-floor").addEventListener(
      "click",
      this.actions.nextFloor,
      options,
    );
  }

  open(snapshot: AdminPanelSnapshot): void {
    this.render(snapshot);
    this.element.hidden = false;
    this.element.inert = false;
    this.element.setAttribute("aria-hidden", "false");
    this.element.classList.add("is-open");
    this.root.classList.add("admin-active");
    requiredElement<HTMLButtonElement>(this.element, "#close-admin").focus({
      preventScroll: true,
    });
  }

  close(): void {
    this.element.classList.remove("is-open");
    this.element.hidden = true;
    this.element.inert = true;
    this.element.setAttribute("aria-hidden", "true");
    this.root.classList.remove("admin-active");
    requiredElement<HTMLButtonElement>(this.root, "#open-admin").focus({
      preventScroll: true,
    });
  }

  isOpen(): boolean {
    return this.element.classList.contains("is-open");
  }

  renderToggle(adminMode: boolean): void {
    const button = requiredElement<HTMLButtonElement>(this.root, "#open-admin");
    button.textContent = adminMode ? "⌘ 管理员 · ON" : "⌘ 管理员";
    button.classList.toggle("is-active", adminMode);
  }

  render(snapshot: AdminPanelSnapshot): void {
    const living = snapshot.monsters.filter((monster) => monster.hp > 0);
    const bosses = living.filter((monster) => monster.isBoss);
    requiredElement(this.element, "#admin-summary").textContent =
      `FLOOR ${snapshot.floor} · ${snapshot.mazeFloor.width}×${snapshot.mazeFloor.height} · 存活怪物 ${living.length} · 首领 ${bosses.length}`;
    const nextButton = requiredElement<HTMLButtonElement>(
      this.element,
      "#admin-next-floor",
    );
    nextButton.disabled = snapshot.floor >= 8;
    nextButton.textContent = snapshot.floor >= 8
      ? "已在第八层"
      : `进入第 ${snapshot.floor + 1} 层初始位置`;
  }
}
