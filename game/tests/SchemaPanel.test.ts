import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import type { SqlAutocompleteController } from "../src/presentation/dom/sqlAutocomplete";
import { SchemaPanel } from "../src/presentation/dom/panels/SchemaPanel";

class FakeDocument {
  activeElement: FakeElement | null = null;

  createElement(tagName: string): HTMLElement {
    return new FakeElement(this, tagName) as unknown as HTMLElement;
  }
}

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  id = "";
  className = "";
  type = "";
  tabIndex = 0;
  private ownText = "";
  private parent: FakeElement | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, EventListener[]>();

  constructor(
    private readonly document: FakeDocument,
    readonly tagName: string,
  ) {}

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.ownText = value;
    this.children.splice(0);
  }

  append(...nodes: FakeElement[]): void {
    nodes.forEach((node) => {
      node.parent = this;
      this.children.push(node);
    });
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.splice(0);
    this.ownText = "";
    this.append(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector<T extends Element>(selector: string): T | null {
    const id = selector.startsWith("#") ? selector.slice(1) : null;
    const match = id === null ? null : this.find((element) => element.id === id);
    return match as unknown as T | null;
  }

  closest<T extends Element>(selector: string): T | null {
    if (selector === "[data-schema-table]" && this.dataset.schemaTable) {
      return this as unknown as T;
    }
    return this.parent?.closest<T>(selector) ?? null;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (typeof listener !== "function") return;
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, target: FakeElement, key?: string): boolean {
    let prevented = false;
    const event = {
      target,
      key,
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as Event;
    this.listeners.get(type)?.forEach((listener) => listener(event));
    return prevented;
  }

  focus(): void {
    this.document.activeElement = this;
  }

  findAll(predicate: (element: FakeElement) => boolean): FakeElement[] {
    return [
      ...(predicate(this) ? [this] : []),
      ...this.children.flatMap((child) => child.findAll(predicate)),
    ];
  }

  private find(predicate: (element: FakeElement) => boolean): FakeElement | null {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const match = child.find(predicate);
      if (match) return match;
    }
    return null;
  }
}

function element(document: FakeDocument, tagName = "div", id = ""): FakeElement {
  const result = new FakeElement(document, tagName);
  result.id = id;
  return result;
}

function fixture(): {
  document: FakeDocument;
  root: FakeElement;
  autocomplete: SqlAutocompleteController;
} {
  const document = new FakeDocument();
  vi.stubGlobal("document", document);
  const root = element(document);
  [
    "terminal-schema-reference",
    "gate-schema-reference",
    "schema-table-tabs",
    "schema-table-panel",
    "schema-relation-trace",
    "schema-list",
    "terminal-schema-table-count",
  ].forEach((id) => root.append(element(document, "div", id)));
  const autocomplete = {
    setSchemaLines: vi.fn(),
    setPreferredKeywords: vi.fn(),
  } as unknown as SqlAutocompleteController;
  return { document, root, autocomplete };
}

function selectedTab(root: FakeElement): FakeElement {
  const tabs = root.querySelector<HTMLElement>("#schema-table-tabs") as unknown as FakeElement;
  const selected = tabs.children.find((child) => child.getAttribute("aria-selected") === "true");
  if (!selected) throw new Error("缺少选中的 Schema 标签");
  return selected;
}

afterEach(() => vi.unstubAllGlobals());

describe("SchemaPanel", () => {
  it("初始化完整图鉴，并保持点击与全部导航键的选择和焦点顺序", () => {
    const { document, root, autocomplete } = fixture();
    const panel = new SchemaPanel(root as unknown as HTMLElement, autocomplete);
    panel.mount({});

    const terminalReference = root.querySelector<HTMLElement>(
      "#terminal-schema-reference",
    ) as unknown as FakeElement;
    const gateReference = root.querySelector<HTMLElement>(
      "#gate-schema-reference",
    ) as unknown as FakeElement;
    const tabs = root.querySelector<HTMLElement>("#schema-table-tabs") as unknown as FakeElement;
    expect(terminalReference.children).toHaveLength(4);
    expect(gateReference.children).toHaveLength(4);
    expect(selectedTab(root).dataset.schemaTable).toBe("monsters");

    const rooms = tabs.children.find((child) => child.dataset.schemaTable === "rooms")!;
    tabs.dispatch("click", rooms);
    expect(selectedTab(root).dataset.schemaTable).toBe("rooms");
    expect(document.activeElement).toBe(selectedTab(root));

    for (const [key, expected] of [
      ["ArrowRight", "monster_gear"],
      ["ArrowDown", "monsters"],
      ["ArrowLeft", "monster_gear"],
      ["ArrowUp", "rooms"],
      ["Home", "monsters"],
      ["End", "monster_gear"],
    ] as const) {
      expect(tabs.dispatch("keydown", selectedTab(root), key)).toBe(true);
      expect(selectedTab(root).dataset.schemaTable).toBe(expected);
      expect(document.activeElement).toBe(selectedTab(root));
    }
  });

  it("按签名刷新当前题目、紧凑速查和自动补全，未变化时不重复渲染", () => {
    const { root, autocomplete } = fixture();
    const panel = new SchemaPanel(root as unknown as HTMLElement, autocomplete);
    panel.mount({});
    const snapshot = {
      focusMonsterId: null,
      lessonIntro: "读取房间与装备记录",
      lessonStageId: "schema-panel-test",
      locks: ["JOIN", "ON"],
      missionBody: "关联房间与装备",
      schema: [
        "rooms(id, name, sector, floor)",
        "monster_gear(id, monster_id, gear_name, power)",
      ],
      taskBrief: {
        primaryTable: "rooms",
        relatedTables: ["monster_gear"],
      },
    } as unknown as GameSnapshot;

    panel.render(snapshot);
    panel.render(snapshot);

    expect(autocomplete.setSchemaLines).toHaveBeenCalledOnce();
    expect(autocomplete.setPreferredKeywords).toHaveBeenCalledOnce();
    expect(autocomplete.setPreferredKeywords).toHaveBeenCalledWith(["JOIN", "ON"]);
    expect(root.querySelector<HTMLElement>("#terminal-schema-table-count")?.textContent)
      .toBe("2 TABLES");
    const reference = root.querySelector<HTMLElement>(
      "#terminal-schema-reference",
    ) as unknown as FakeElement;
    expect(reference.children).toHaveLength(2);
    const taskRoot = root.querySelector<HTMLElement>("#schema-list") as unknown as FakeElement;
    expect(taskRoot.textContent).toContain("本题先读取 rooms；需要关联 monster_gear");
    expect(taskRoot.findAll((entry) => entry.className.includes("is-active"))).toHaveLength(2);

    panel.render({ ...snapshot, locks: ["JOIN", "ON", "WHERE"] });
    expect(autocomplete.setSchemaLines).toHaveBeenCalledTimes(2);
    expect(autocomplete.setPreferredKeywords).toHaveBeenLastCalledWith([
      "JOIN",
      "ON",
      "WHERE",
    ]);
  });
});
