import {
  biomeEncounterFor,
  type BiomeKind,
} from "../content/biomeContent";
import { floorExperience } from "../content/floorExperience";
import { INITIAL_MONSTERS, lessonById } from "../content/mvpLevel";
import {
  monsterIdLabel,
  monsterKindLabel,
} from "../domain/monsterIdentity";
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
  habitat: string | null;
  worldEffect: string | null;
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

const BIOME_LABEL: Readonly<Record<BiomeKind, string>> = {
  drainage: "青石排水渠",
  "slime-pool": "软泥池",
  "ember-cellar": "余烬地窖",
  lake: "月影湖",
  swamp: "芦苇沼泽",
  forest: "古树林",
  "bone-yard": "白骨荒地",
  "grave-mire": "墓地泥沼",
  "spirit-crypt": "游魂墓室",
  "fire-forge": "熔火锻炉",
  "frost-vault": "白霜冰库",
  "storm-core": "雷暴核心",
  "iron-yard": "铸铁庭院",
  barracks: "王城兵营",
  "black-citadel": "黑色城塞",
  "magma-nest": "熔岩龙巢",
  "crystal-cavern": "水晶洞窟",
  "dragon-throne": "古龙王座",
  "crystal-grove": "水晶索引林",
  "root-maze": "盘根迷径",
  "index-heart": "索引树心",
  "obsidian-hall": "黑曜大厅",
  "void-court": "空值王庭",
  "data-throne": "数据王座",
};

function habitatFor(monster: Monster): string {
  const biome = biomeEncounterFor(monster.id)?.biome;
  if (biome) return BIOME_LABEL[biome];
  if (monster.floor === 1 || monster.floor === 2) {
    const region = floorExperience(monster.floor).regions.find(
      (entry) => entry.lessonIds.includes(monster.lessonId),
    );
    if (region) return region.name;
  }
  return lessonById(monster.lessonId).title.split("·")[0]?.trim()
    ?? `第 ${monster.floor} 层`;
}

function worldEffectFor(monster: Monster): string {
  if (monster.floor === 1 || monster.floor === 2) {
    const rules = floorExperience(monster.floor).environmentRules;
    const rule = rules.find(
      (entry) => entry.when === `monster:${monster.id}:defeated`,
    ) ?? rules.find(
      (entry) => entry.when === `${monster.lessonId}:completed`,
    );
    if (rule) return rule.visibleResult;
  }
  if (monster.isBoss) {
    return `名字归档后，第 ${monster.floor} 层的上升路线获得继续通行的证据。`;
  }
  if (monster.encounterType === "ambush") {
    return "这条支路生态记录已经补全；主线课程进度不会被替代。";
  }
  return `「${lessonById(monster.lessonId).concept}」对应记录已写入永久图鉴。`;
}

function identityLore(monster: Monster): string {
  if (monster.isBoss) {
    return `它守住了第 ${monster.floor} 层最后一段规则。致命查询先清空生命，再把编号恢复成名字并盖入图鉴。`;
  }
  if (monster.encounterType === "ambush") {
    return `它游荡在第 ${monster.floor} 层的支路中。名字恢复后，这片区域不再只剩一个无意义的编号。`;
  }
  return `它把「${lessonById(monster.lessonId).concept}」藏进自己的记录。击败前只能读取编号；最后一击才把名字写回档案。`;
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
        species: isDiscovered ? monsterKindLabel(monster) : null,
        rank: isDiscovered ? RANK_LABEL[monster.rank] : null,
        concept: isDiscovered ? lessonById(monster.lessonId).concept : null,
        habitat: isDiscovered ? habitatFor(monster) : null,
        worldEffect: isDiscovered ? worldEffectFor(monster) : null,
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
        ...(entry.discovered ? [
          element(
            this.documentRoot,
            "p",
            "monster-codex__habitat",
            `栖息地：${entry.habitat}`,
          ),
          element(
            this.documentRoot,
            "p",
            "monster-codex__world-effect",
            `世界变化：${entry.worldEffect}`,
          ),
        ] : []),
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
