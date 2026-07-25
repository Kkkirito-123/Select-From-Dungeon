import { INITIAL_MONSTERS, lessonById } from "../content/mvpLevel";
import { monsterIdLabel } from "../domain/monsterIdentity";
import type { FloorNumber } from "../domain/runGraph";
import type { Monster } from "../domain/types";

export interface MonsterCodexRenderState {
  floor: FloorNumber;
  discoveredMonsterIds: readonly number[];
}

export interface MonsterCodexEntryModel {
  id: number;
  idLabel: string;
  floor: FloorNumber;
  discovered: boolean;
  name: string;
  species: string | null;
  rank: string | null;
  concept: string | null;
  lore: string;
}

export interface MonsterCodexModel {
  floor: FloorNumber;
  discoveredCount: number;
  totalCount: number;
  floorDiscoveredCount: number;
  floorTotalCount: number;
  entries: readonly MonsterCodexEntryModel[];
}

const RANK_LABEL: Readonly<Record<Monster["rank"], string>> = {
  normal: "普通记录",
  elite: "精英记录",
  boss: "首领记录",
};

function identityLore(monster: Monster): string {
  if (monster.isBoss) {
    return `它守住了第 ${monster.floor} 层最后一段记录。名字被确认后，这一层的故事才有了结尾。`;
  }
  if (monster.encounterType === "ambush") {
    return `它游荡在第 ${monster.floor} 层的支路中。击败它不会替代课程，却会补全这片区域的生态记录。`;
  }
  return `它把「${lessonById(monster.lessonId).concept}」藏进自己的记录。完成查询，才能确认这是谁。`;
}

export function buildMonsterCodexModel(
  state: MonsterCodexRenderState,
  monsters: readonly Monster[] = INITIAL_MONSTERS,
): MonsterCodexModel {
  const discovered = new Set(state.discoveredMonsterIds);
  const uniqueMonsters = [...new Map(
    monsters.map((monster) => [monster.id, monster] as const),
  ).values()].sort((left, right) => left.id - right.id);
  const floorMonsters = uniqueMonsters.filter(
    (monster) => monster.floor === state.floor,
  );
  return {
    floor: state.floor,
    discoveredCount: uniqueMonsters.filter((monster) => discovered.has(monster.id)).length,
    totalCount: uniqueMonsters.length,
    floorDiscoveredCount: floorMonsters.filter(
      (monster) => discovered.has(monster.id),
    ).length,
    floorTotalCount: floorMonsters.length,
    entries: floorMonsters.map((monster) => {
      const isDiscovered = discovered.has(monster.id);
      return {
        id: monster.id,
        idLabel: monsterIdLabel(monster.id),
        floor: monster.floor,
        discovered: isDiscovered,
        name: isDiscovered ? monster.name : "尚未获得名字",
        species: isDiscovered ? monster.species : null,
        rank: isDiscovered ? RANK_LABEL[monster.rank] : null,
        concept: isDiscovered ? lessonById(monster.lessonId).concept : null,
        lore: isDiscovered
          ? identityLore(monster)
          : "在地牢中找到这条记录，并完成它守护的 SQL 战斗。",
      };
    }),
  };
}

function element<K extends keyof HTMLElementTagNameMap>(
  documentRoot: Document,
  tagName: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = documentRoot.createElement(tagName);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function canFocus(value: Element | null): value is HTMLElement {
  return value !== null && "focus" in value && typeof value.focus === "function";
}

export interface MonsterCodexViewOptions {
  onClose?: () => void;
}

export class MonsterCodexView {
  readonly element: HTMLElement;
  readonly closeButton: HTMLButtonElement;

  private readonly documentRoot: Document;
  private readonly count: HTMLElement;
  private readonly floorCount: HTMLElement;
  private readonly floorTabs: HTMLElement;
  private readonly entryList: HTMLElement;
  private readonly onClose?: () => void;
  private destroyed = false;
  private previousFocus: Element | null = null;
  private state: MonsterCodexRenderState = {
    floor: 1,
    discoveredMonsterIds: [],
  };

  private readonly handleClose = (): void => this.close();

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.close();
  };

  constructor(
    root: HTMLElement,
    options: MonsterCodexViewOptions = {},
  ) {
    this.documentRoot = root.ownerDocument;
    this.onClose = options.onClose;
    this.element = element(this.documentRoot, "section", "monster-codex");
    this.element.hidden = true;
    this.element.inert = true;
    this.element.setAttribute("aria-hidden", "true");

    const dialog = element(this.documentRoot, "div", "monster-codex__dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "monster-codex-heading");

    const header = element(this.documentRoot, "header", "monster-codex__header");
    const headingGroup = element(
      this.documentRoot,
      "div",
      "monster-codex__heading-group",
    );
    headingGroup.append(
      element(
        this.documentRoot,
        "span",
        "monster-codex__eyebrow",
        "IDENTITY ARCHIVE / 名字回收记录",
      ),
    );
    const heading = element(
      this.documentRoot,
      "h2",
      "monster-codex__heading",
      "怪物图鉴",
    );
    heading.id = "monster-codex-heading";
    this.count = element(
      this.documentRoot,
      "p",
      "monster-codex__count",
      "0 / 0 已识别",
    );
    headingGroup.append(heading, this.count);
    this.closeButton = element(
      this.documentRoot,
      "button",
      "monster-codex__close",
      "ESC ×",
    );
    this.closeButton.type = "button";
    this.closeButton.setAttribute("aria-label", "关闭怪物图鉴");
    header.append(headingGroup, this.closeButton);

    const navigator = element(
      this.documentRoot,
      "nav",
      "monster-codex__navigator",
    );
    navigator.setAttribute("aria-label", "选择图鉴楼层");
    this.floorTabs = element(
      this.documentRoot,
      "div",
      "monster-codex__floor-tabs",
    );
    for (let floor = 1; floor <= 8; floor += 1) {
      const button = element(
        this.documentRoot,
        "button",
        "monster-codex__floor",
        `F${String(floor).padStart(2, "0")}`,
      );
      button.type = "button";
      button.dataset.floor = String(floor);
      button.addEventListener("click", () => {
        this.state = { ...this.state, floor: floor as FloorNumber };
        this.render(this.state);
      });
      this.floorTabs.append(button);
    }
    this.floorCount = element(
      this.documentRoot,
      "span",
      "monster-codex__floor-count",
    );
    navigator.append(this.floorTabs, this.floorCount);

    this.entryList = element(
      this.documentRoot,
      "div",
      "monster-codex__entries",
    );
    dialog.append(header, navigator, this.entryList);
    this.element.append(dialog);
    root.append(this.element);
    this.closeButton.addEventListener("click", this.handleClose);
  }

  isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    this.assertActive();
    if (this.isOpen()) return;
    this.previousFocus = this.documentRoot.activeElement;
    this.element.hidden = false;
    this.element.inert = false;
    this.element.classList.add("is-open");
    this.element.setAttribute("aria-hidden", "false");
    this.documentRoot.addEventListener("keydown", this.handleKeyDown);
    this.closeButton.focus({ preventScroll: true });
  }

  close(): void {
    this.assertActive();
    if (!this.isOpen()) return;
    this.element.hidden = true;
    this.element.inert = true;
    this.element.classList.remove("is-open");
    this.element.setAttribute("aria-hidden", "true");
    this.documentRoot.removeEventListener("keydown", this.handleKeyDown);
    if (canFocus(this.previousFocus)) {
      this.previousFocus.focus({ preventScroll: true });
    }
    this.previousFocus = null;
    this.onClose?.();
  }

  render(state: MonsterCodexRenderState): void {
    this.assertActive();
    this.state = {
      floor: state.floor,
      discoveredMonsterIds: [...state.discoveredMonsterIds],
    };
    const model = buildMonsterCodexModel(this.state);
    this.element.dataset.floor = String(model.floor);
    this.count.textContent =
      `${model.discoveredCount} / ${model.totalCount} 已识别`;
    this.floorCount.textContent =
      `第 ${model.floor} 层 · ${model.floorDiscoveredCount}/${model.floorTotalCount}`;
    this.floorTabs.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      const selected = Number(button.dataset.floor) === model.floor;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-current", selected ? "page" : "false");
    });
    this.entryList.replaceChildren(...model.entries.map((entry) => {
      const card = element(
        this.documentRoot,
        "article",
        `monster-codex__entry ${entry.discovered ? "is-discovered" : "is-unknown"}`,
      );
      card.dataset.monsterId = String(entry.id);
      const identity = element(
        this.documentRoot,
        "div",
        "monster-codex__identity",
      );
      identity.append(
        element(
          this.documentRoot,
          "code",
          "monster-codex__id",
          entry.idLabel,
        ),
        element(
          this.documentRoot,
          "div",
          "monster-codex__sigil",
          entry.discovered ? "◆" : "?",
        ),
      );
      const copy = element(this.documentRoot, "div", "monster-codex__copy");
      copy.append(
        element(
          this.documentRoot,
          "h3",
          "monster-codex__name",
          entry.name,
        ),
      );
      const meta = element(this.documentRoot, "p", "monster-codex__meta");
      meta.textContent = entry.discovered
        ? `${entry.rank} · ${entry.concept} · ${entry.species}`
        : `第 ${entry.floor} 层 · 身份未确认`;
      copy.append(
        meta,
        element(
          this.documentRoot,
          "p",
          "monster-codex__lore",
          entry.lore,
        ),
      );
      card.append(identity, copy);
      return card;
    }));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.documentRoot.removeEventListener("keydown", this.handleKeyDown);
    this.closeButton.removeEventListener("click", this.handleClose);
    this.element.remove();
    this.destroyed = true;
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("MonsterCodexView 已销毁。");
  }
}
