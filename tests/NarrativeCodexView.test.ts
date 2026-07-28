import { describe, expect, it } from "vitest";
import {
  NARRATIVE_ENDINGS,
  NARRATIVE_FLOORS,
} from "../src/content/narrativeContent";
import { floorStoryMoments } from "../src/domain/floorStory";
import {
  NarrativeCodexView,
  buildNarrativeCodexModel,
} from "../src/ui/NarrativeCodexView";

class FakeClassList {
  constructor(private readonly owner: FakeElement) {}

  add(...tokens: string[]): void {
    const classes = this.tokens();
    tokens.forEach((token) => classes.add(token));
    this.owner.className = [...classes].join(" ");
  }

  remove(...tokens: string[]): void {
    const classes = this.tokens();
    tokens.forEach((token) => classes.delete(token));
    this.owner.className = [...classes].join(" ");
  }

  contains(token: string): boolean {
    return this.tokens().has(token);
  }

  private tokens(): Set<string> {
    return new Set(this.owner.className.split(/\s+/).filter(Boolean));
  }
}

class FakeDocument {
  activeElement: Element | null = null;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  createElement(tagName: string): HTMLElement {
    return new FakeElement(this, tagName) as unknown as HTMLElement;
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  dispatchKey(key: string): { prevented: boolean } {
    let prevented = false;
    const event = {
      key,
      preventDefault: () => {
        prevented = true;
      },
    } as KeyboardEvent;
    this.listeners.get("keydown")?.forEach((listener) => {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    });
    return { prevented };
  }
}

class FakeElement {
  readonly ownerDocument: Document;
  readonly classList: FakeClassList;
  readonly dataset: Record<string, string> = {};
  className = "";
  id = "";
  hidden = false;
  inert = false;
  type = "";
  parent: FakeElement | null = null;
  children: FakeElement[] = [];
  private ownText = "";
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(
    private readonly fakeDocument: FakeDocument,
    readonly tagName: string,
  ) {
    this.ownerDocument = fakeDocument as unknown as Document;
    this.classList = new FakeClassList(this);
  }

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.ownText = value;
    this.children = [];
  }

  append(...nodes: FakeElement[]): void {
    nodes.forEach((node) => {
      node.parent?.detach(node);
      node.parent = this;
      this.children.push(node);
    });
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.forEach((child) => {
      child.parent = null;
    });
    this.children = [];
    this.ownText = "";
    this.append(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
  }

  focus(): void {
    this.fakeDocument.activeElement = this as unknown as Element;
  }

  remove(): void {
    this.parent?.detach(this);
  }

  findAll(predicate: (element: FakeElement) => boolean): FakeElement[] {
    return [
      ...(predicate(this) ? [this] : []),
      ...this.children.flatMap((child) => child.findAll(predicate)),
    ];
  }

  private detach(child: FakeElement): void {
    this.children = this.children.filter((entry) => entry !== child);
    child.parent = null;
  }
}

function fakeElement(element: HTMLElement): FakeElement {
  return element as unknown as FakeElement;
}

describe("buildNarrativeCodexModel", () => {
  it("组装当前章节、五拍、三态证据、七段上升路线和 MIGRATE 进度", () => {
    const thirdFloor = NARRATIVE_FLOORS[2];
    const nullEvidence = thirdFloor.lostNameEvidence.find(
      (entry) => entry.resolvedValue === null,
    );
    expect(nullEvidence).toBeDefined();

    const model = buildNarrativeCodexModel({
      floor: 3,
      seenBeatIds: thirdFloor.beats.slice(0, 2).map((entry) => entry.id),
      discoveredEvidenceIds: [nullEvidence!.id],
      completedAscentIds: [
        NARRATIVE_FLOORS[0].ascent!.id,
        NARRATIVE_FLOORS[1].ascent!.id,
      ],
      completedMigrationStepIds: ["snapshot", "audit"],
    });

    expect(model.chapter).toEqual({
      floor: 3,
      label: "第 3 章",
      regionName: "白霜墓原",
      completedBeats: 2,
      totalBeats: 5,
    });
    expect(model.beats).toHaveLength(5);
    expect(model.beats.slice(0, 2).every((entry) => entry.complete)).toBe(true);
    expect(model.beats.slice(2).every((entry) => (
      !entry.complete &&
      entry.title === "尚未抵达" &&
      entry.lines.length === 0
    ))).toBe(true);

    expect(model.evidence).toContainEqual(expect.objectContaining({
      id: nullEvidence!.id,
      state: "null",
      displayValue: "NULL",
    }));
    expect(model.evidence).toContainEqual(expect.objectContaining({
      state: "unknown",
      displayValue: "???",
      finding: null,
    }));

    expect(model.ascents).toHaveLength(7);
    expect(model.ascents.filter((entry) => entry.state === "complete")).toHaveLength(2);
    expect(model.ascents.filter((entry) => entry.state === "available")).toEqual([
      expect.objectContaining({
        fromFloor: 3,
        toFloor: 4,
        name: "葬火井",
      }),
    ]);
    expect(model.ascents.filter((entry) => entry.state === "locked")).toHaveLength(4);
    expect(
      model.ascents
        .filter((entry) => entry.state === "locked")
        .every((entry) => (
        entry.name === "尚未识别" &&
        entry.arrival === "未知区域"
        )),
    ).toBe(true);

    expect(model.migration).toMatchObject({
      id: "MIGRATE",
      revealed: true,
      completedSteps: 2,
      totalSteps: 7,
      finalLine: null,
    });
  });

  it("七步全部完成后才显示唯一结局收束语", () => {
    const model = buildNarrativeCodexModel({
      floor: 8,
      completedMigrationStepIds: NARRATIVE_ENDINGS[0].steps.map((step) => step.id),
    });

    expect(model.migration.completedSteps).toBe(7);
    expect(model.migration.steps.every((step) => step.complete)).toBe(true);
    expect(model.migration.finalLine).toBe(NARRATIVE_ENDINGS[0].finalLine);
    expect(model.ascents.every((entry) => entry.state !== "available")).toBe(true);
  });

  it("F1/F2 把已发现现场与真实调查 SQL 收入档案，未抵达节点不泄露内容", () => {
    const firstFloorMoments = floorStoryMoments(1);
    const model = buildNarrativeCodexModel({
      floor: 1,
      seenMomentIds: [
        firstFloorMoments[0]!.id,
        firstFloorMoments[6]!.id,
      ],
    });

    expect(model.moments).toHaveLength(9);
    expect(model.moments[0]).toMatchObject({
      complete: true,
      query: {
        title: "当前居民查询",
        resultShape: "真实结果：0 行",
      },
    });
    expect(model.moments[0]?.query?.sql).toContain("FROM residents");
    expect(model.moments[6]?.query).toMatchObject({
      title: "旧恢复轨迹计数",
    });
    expect(model.moments[1]).toMatchObject({
      complete: false,
      title: "尚未抵达",
      lines: [],
      archiveLine: null,
      query: null,
    });
    expect(model.moments[1]?.title).not.toContain("水轮");
  });

  it("最终记录未解锁时不泄露 MIGRATE 名称、步骤或未来上升区域", () => {
    const model = buildNarrativeCodexModel({
      floor: 1,
      seenBeatIds: [NARRATIVE_FLOORS[0].beats[0].id],
    });

    expect(model.migration).toMatchObject({
      revealed: false,
      title: "尚未解锁",
      completedSteps: 0,
      totalSteps: 7,
      steps: [],
      finalLine: null,
    });
    expect(model.ascents[0]).toMatchObject({
      state: "available",
      name: "档案升降机",
      arrival: "潮汐码头",
    });
    expect(model.ascents.slice(1).every((entry) => (
      entry.name === "尚未识别" &&
      entry.arrival === "未知区域"
    ))).toBe(true);
  });
});

describe("NarrativeCodexView", () => {
  it("支持 render/open/close/destroy 并清理 DOM 与监听", () => {
    const documentRoot = new FakeDocument();
    const root = new FakeElement(documentRoot, "div");
    const previousFocus = new FakeElement(documentRoot, "button");
    documentRoot.activeElement = previousFocus as unknown as Element;
    let closeCount = 0;
    const view = new NarrativeCodexView(
      root as unknown as HTMLElement,
      {
        onClose: () => {
          closeCount += 1;
        },
      },
    );

    expect(root.children).toContain(fakeElement(view.element));
    expect(view.element.hidden).toBe(true);
    expect(view.element.getAttribute("aria-hidden")).toBe("true");

    const thirdFloor = NARRATIVE_FLOORS[2];
    const nullEvidence = thirdFloor.lostNameEvidence.find(
      (entry) => entry.resolvedValue === null,
    )!;
    view.render({
      floor: 3,
      seenBeatIds: [thirdFloor.beats[0].id],
      discoveredEvidenceIds: [nullEvidence.id],
      completedAscentIds: [NARRATIVE_FLOORS[0].ascent!.id],
      completedMigrationStepIds: ["snapshot"],
    });

    const element = fakeElement(view.element);
    expect(element.dataset.floor).toBe("3");
    expect(element.textContent).toContain("白霜墓原");
    expect(element.textContent).toContain("1 / 5 叙事拍");
    expect(element.textContent).toContain("NULL");
    expect(element.textContent).toContain("???");
    expect(element.textContent).toContain("王城上升路线");
    expect(element.textContent).toContain("1 / 7 迁移步骤");
    expect(element.findAll((entry) => (
      entry.classList.contains("narrative-codex__ascent")
    ))).toHaveLength(7);

    view.open();
    expect(view.isOpen()).toBe(true);
    expect(view.element.hidden).toBe(false);
    expect(view.element.classList.contains("is-open")).toBe(true);
    expect(view.element.getAttribute("aria-hidden")).toBe("false");
    expect(documentRoot.listenerCount("keydown")).toBe(1);
    expect(documentRoot.activeElement).toBe(view.closeButton);

    const escape = documentRoot.dispatchKey("Escape");
    expect(escape.prevented).toBe(true);
    expect(view.isOpen()).toBe(false);
    expect(view.element.getAttribute("aria-hidden")).toBe("true");
    expect(documentRoot.listenerCount("keydown")).toBe(0);
    expect(documentRoot.activeElement).toBe(previousFocus);
    expect(closeCount).toBe(1);

    view.destroy();
    view.destroy();
    expect(root.children).not.toContain(element);
    expect(documentRoot.listenerCount("keydown")).toBe(0);
    expect(() => view.open()).toThrow("NarrativeCodexView 已销毁。");
  });
});
