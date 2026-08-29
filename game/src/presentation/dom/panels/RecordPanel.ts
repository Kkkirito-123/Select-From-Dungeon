/** 剧情、调查和抄写员共用的主记录框。 */
export type RecordPanelKind = "inspection" | "story" | "migration" | "scribe";

export interface RecordPanelCopy {
  kicker: string;
  title: string;
  body: string;
  closeLabel: string;
  kind: RecordPanelKind;
}

function requiredElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少记录框元素：${selector}`);
  return element;
}

/** 只管理记录框 DOM 和焦点；剧情进度与确认动作仍由 AppShell 协调。 */
export class RecordPanel {
  private focusBeforeOpen: HTMLElement | null = null;

  constructor(
    private readonly appRoot: HTMLElement,
    readonly element: HTMLElement,
  ) {}

  get kind(): RecordPanelKind | undefined {
    return this.element.dataset.recordKind as RecordPanelKind | undefined;
  }

  get requestKey(): string | undefined {
    return this.element.dataset.scribeRequestKey;
  }

  set requestKey(value: string | undefined) {
    if (value) {
      this.element.dataset.scribeRequestKey = value;
    } else {
      delete this.element.dataset.scribeRequestKey;
    }
  }

  isOpen(): boolean {
    return !this.element.hidden;
  }

  open(copy: RecordPanelCopy): void {
    if (!this.isOpen()) {
      this.focusBeforeOpen = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    this.render(copy);
    this.element.dataset.recordKind = copy.kind;
    if (copy.kind !== "scribe") this.requestKey = undefined;
    this.element.hidden = false;
    this.element.inert = false;
    this.element.setAttribute("aria-hidden", "false");
    this.appRoot.classList.add("inspection-active");
    requiredElement<HTMLButtonElement>(this.element, "#close-inspection").focus({
      preventScroll: true,
    });
  }

  render(
    copy: Pick<RecordPanelCopy, "kicker" | "title" | "body"> &
      Partial<Pick<RecordPanelCopy, "closeLabel">>,
  ): void {
    requiredElement(this.element, "#inspection-kicker").textContent = copy.kicker;
    requiredElement(this.element, "#inspection-title").textContent = copy.title;
    requiredElement(this.element, "#inspection-message").textContent = copy.body;
    if (copy.closeLabel !== undefined) {
      requiredElement<HTMLButtonElement>(
        this.element,
        "#close-inspection",
      ).textContent = copy.closeLabel;
    }
  }

  close(returnFocus = true): void {
    this.element.hidden = true;
    this.element.inert = true;
    this.element.setAttribute("aria-hidden", "true");
    delete this.element.dataset.recordKind;
    this.requestKey = undefined;
    this.appRoot.classList.remove("inspection-active");
    if (!returnFocus) {
      this.focusBeforeOpen = null;
      return;
    }
    const focusTarget = this.focusBeforeOpen;
    this.focusBeforeOpen = null;
    if (
      focusTarget?.isConnected &&
      !focusTarget.matches(":disabled") &&
      !this.element.contains(focusTarget)
    ) {
      focusTarget.focus({ preventScroll: true });
      return;
    }
    requiredElement<HTMLElement>(this.appRoot, "#game-root").focus({
      preventScroll: true,
    });
  }

  destroy(): void {
    this.focusBeforeOpen = null;
  }
}
