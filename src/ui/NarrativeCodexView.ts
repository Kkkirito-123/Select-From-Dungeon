/** 失名录视图：渲染已解锁故事、证据和迁移进度，所有状态来自只读快照。 */
import {
  NARRATIVE_BEAT_KINDS,
  NARRATIVE_ENDINGS,
  NARRATIVE_FLOORS,
  type NarrativeBeatKind,
  type NarrativeEndingStep,
} from "../content/narrativeContent";
import {
  lostNameEvidenceForFloor,
  narrativeFloorFor,
  type LostNameEvidenceState,
} from "../domain/narrative";
import {
  floorStoryMoments,
  type FloorStoryMomentKind,
} from "../domain/floorStory";
import { INITIAL_MONSTERS } from "../content/mvpLevel";
import { redactUndiscoveredMonsterIdentityText } from "../domain/monsterIdentity";
import type { FloorNumber } from "../domain/runGraph";

export interface NarrativeCodexRenderState {
  floor: FloorNumber;
  discoveredMonsterIds?: readonly number[];
  seenBeatIds?: readonly string[];
  seenMomentIds?: readonly string[];
  discoveredEvidenceIds?: readonly string[];
  completedAscentIds?: readonly string[];
  completedMigrationStepIds?: readonly NarrativeEndingStep["id"][];
}

export interface NarrativeCodexBeatModel {
  id: string;
  kind: NarrativeBeatKind;
  label: string;
  title: string;
  lines: readonly string[];
  complete: boolean;
}

export interface NarrativeCodexEvidenceModel {
  id: string;
  title: string;
  fieldLabel: string;
  state: LostNameEvidenceState;
  displayValue: string;
  finding: string | null;
}

export interface NarrativeCodexMomentModel {
  id: string;
  kind: FloorStoryMomentKind;
  kicker: string;
  title: string;
  lines: readonly string[];
  archiveLine: string | null;
  complete: boolean;
  query: {
    title: string;
    sql: string;
    purpose: string;
    resultShape: string;
  } | null;
}

export type NarrativeCodexAscentState = "complete" | "available" | "locked";

export interface NarrativeCodexAscentModel {
  id: string;
  fromFloor: FloorNumber;
  toFloor: FloorNumber;
  name: string;
  arrival: string;
  state: NarrativeCodexAscentState;
}

export interface NarrativeCodexMigrationStepModel {
  id: NarrativeEndingStep["id"];
  title: string;
  description: string;
  complete: boolean;
}

export interface NarrativeCodexModel {
  chapter: {
    floor: FloorNumber;
    label: string;
    regionName: string;
    completedBeats: number;
    totalBeats: number;
  };
  beats: readonly NarrativeCodexBeatModel[];
  moments: readonly NarrativeCodexMomentModel[];
  evidence: readonly NarrativeCodexEvidenceModel[];
  ascents: readonly NarrativeCodexAscentModel[];
  migration: {
    id: "MIGRATE";
    revealed: boolean;
    title: string;
    summary: string;
    completedSteps: number;
    totalSteps: number;
    steps: readonly NarrativeCodexMigrationStepModel[];
    finalLine: string | null;
  };
}

export interface NarrativeCodexViewOptions {
  onClose?: () => void;
}

const BEAT_LABEL: Readonly<Record<NarrativeBeatKind, string>> = {
  "floor-entry": "入层",
  "midpoint-evidence": "中段证据",
  campfire: "篝火复盘",
  boss: "层主",
  "floor-end": "层末",
};

const ASCENT_STATE_COPY: Readonly<Record<NarrativeCodexAscentState, string>> = {
  complete: "已通过",
  available: "当前上升设施",
  locked: "尚未抵达",
};

function setFrom(values: readonly string[] | undefined): ReadonlySet<string> {
  return new Set(values ?? []);
}

export function buildNarrativeCodexModel(
  state: NarrativeCodexRenderState,
): NarrativeCodexModel {
  /** 将剧情进度投影为失名录页面模型，不改变故事解锁状态。 */
  const floor = narrativeFloorFor(state.floor);
  const floorMonsters = INITIAL_MONSTERS.filter(
    (monster) => monster.floor === state.floor,
  );
  const redactIdentity = (value: string): string => (
    redactUndiscoveredMonsterIdentityText(
      value,
      floorMonsters,
      state.discoveredMonsterIds ?? [],
    )
  );
  const seenBeatIds = setFrom(state.seenBeatIds);
  const seenMomentIds = setFrom(state.seenMomentIds);
  const completedAscentIds = setFrom(state.completedAscentIds);
  const completedMigrationStepIds = setFrom(state.completedMigrationStepIds);

  const beats = floor.beats.map((entry) => {
    const complete = seenBeatIds.has(entry.id);
    return {
      id: entry.id,
      kind: entry.kind,
      label: BEAT_LABEL[entry.kind],
      title: complete ? redactIdentity(entry.title) : "尚未抵达",
      lines: complete ? entry.lines.map(redactIdentity) : [],
      complete,
    };
  });
  const moments = floorStoryMoments(state.floor).map((entry) => {
    const complete = seenMomentIds.has(entry.id);
    const query = complete && entry.query
      ? {
          title: redactIdentity(entry.query.title),
          sql: redactIdentity(entry.query.sql),
          purpose: redactIdentity(entry.query.purpose),
          resultShape: entry.query.expectedRowCount === 0
            ? "真实结果：0 行"
            : `真实结果：${entry.query.expectedRowCount} 行 · 字段 ${
                entry.query.expectedColumns.join(", ")
              }`,
        }
      : null;
    return {
      id: entry.id,
      kind: entry.kind,
      kicker: complete ? redactIdentity(entry.kicker) : "现场记录",
      title: complete ? redactIdentity(entry.title) : "尚未抵达",
      lines: complete ? entry.lines.map(redactIdentity) : [],
      archiveLine: complete ? redactIdentity(entry.archiveLine) : null,
      complete,
      query,
    };
  });
  const evidence = lostNameEvidenceForFloor(
    state.floor,
    state.discoveredEvidenceIds,
  ).map((entry) => ({
    id: entry.id,
    title: redactIdentity(entry.title),
    fieldLabel: redactIdentity(entry.fieldLabel),
    state: entry.state,
    displayValue: redactIdentity(entry.displayValue),
    finding: entry.finding === null ? null : redactIdentity(entry.finding),
  }));

  const ascents = NARRATIVE_FLOORS.flatMap((entry) => {
    if (!entry.ascent) return [];
    const ascentState: NarrativeCodexAscentState = completedAscentIds.has(entry.ascent.id)
      ? "complete"
      : entry.ascent.fromFloor === state.floor
        ? "available"
        : "locked";
    return [{
      id: entry.ascent.id,
      fromFloor: entry.ascent.fromFloor,
      toFloor: entry.ascent.toFloor,
      name: ascentState === "locked" ? "尚未识别" : entry.ascent.name,
      arrival: ascentState === "locked" ? "未知区域" : entry.ascent.arrival,
      state: ascentState,
    }];
  });

  const ending = NARRATIVE_ENDINGS[0];
  if (!ending) throw new Error("缺少 MIGRATE 结局内容。");
  const resolvedMigrationSteps = ending.steps.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    complete: completedMigrationStepIds.has(step.id),
  }));
  const completedMigrationSteps = resolvedMigrationSteps
    .filter((step) => step.complete)
    .length;
  const migrationRevealed = completedMigrationSteps > 0;

  return {
    chapter: {
      floor: state.floor,
      label: `第 ${state.floor} 章`,
      regionName: floor.regionName,
      completedBeats: beats.filter((entry) => entry.complete).length,
      totalBeats: NARRATIVE_BEAT_KINDS.length,
    },
    beats,
    moments,
    evidence,
    ascents,
    migration: {
      id: ending.id,
      revealed: migrationRevealed,
      title: migrationRevealed ? ending.title : "尚未解锁",
      summary: migrationRevealed
        ? ending.summary
        : "最后一页仍被封存。继续向王城高处前进。",
      completedSteps: completedMigrationSteps,
      totalSteps: ending.steps.length,
      steps: migrationRevealed ? resolvedMigrationSteps : [],
      finalLine: completedMigrationSteps === ending.steps.length
        ? ending.finalLine
        : null,
    },
  };
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  documentRoot: Document,
  tagName: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = documentRoot.createElement(tagName);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function canFocus(value: Element | null): value is HTMLElement {
  return value !== null && "focus" in value && typeof value.focus === "function";
}

export class NarrativeCodexView {
  /** 管理故事、证据、上升和 MIGRATE 页面展示。 */
  readonly element: HTMLElement;
  readonly closeButton: HTMLButtonElement;

  private readonly documentRoot: Document;
  private readonly chapterEyebrow: HTMLElement;
  private readonly chapterTitle: HTMLElement;
  private readonly chapterProgress: HTMLElement;
  private readonly beatList: HTMLOListElement;
  private readonly momentSection: HTMLElement;
  private readonly momentProgress: HTMLElement;
  private readonly momentList: HTMLOListElement;
  private readonly evidenceList: HTMLElement;
  private readonly ascentList: HTMLOListElement;
  private readonly migrationTitle: HTMLElement;
  private readonly migrationSummary: HTMLElement;
  private readonly migrationProgress: HTMLElement;
  private readonly migrationList: HTMLOListElement;
  private readonly migrationFinalLine: HTMLElement;
  private readonly onClose: (() => void) | undefined;
  private previousFocus: Element | null = null;
  private destroyed = false;

  private readonly handleCloseClick = (): void => {
    this.close();
  };

  private readonly handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.isOpen()) return;
    event.preventDefault();
    this.close();
  };

  constructor(
    root: HTMLElement,
    options: NarrativeCodexViewOptions = {},
  ) {
    this.documentRoot = root.ownerDocument;
    this.onClose = options.onClose;

    this.element = createElement(this.documentRoot, "section", "narrative-codex");
    this.element.hidden = true;
    this.element.inert = true;
    this.element.setAttribute("aria-hidden", "true");

    const dialog = createElement(
      this.documentRoot,
      "div",
      "narrative-codex__dialog",
    );
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "narrative-codex-heading");

    const header = createElement(
      this.documentRoot,
      "header",
      "narrative-codex__header",
    );
    const headingGroup = createElement(
      this.documentRoot,
      "div",
      "narrative-codex__heading-group",
    );
    const heading = createElement(
      this.documentRoot,
      "h2",
      "narrative-codex__heading",
      "失名录",
    );
    heading.id = "narrative-codex-heading";
    this.chapterEyebrow = createElement(
      this.documentRoot,
      "p",
      "narrative-codex__chapter-eyebrow",
      "第 1 章",
    );
    headingGroup.append(this.chapterEyebrow, heading);
    this.closeButton = createElement(
      this.documentRoot,
      "button",
      "narrative-codex__close",
      "ESC ×",
    );
    this.closeButton.type = "button";
    this.closeButton.setAttribute("aria-label", "关闭失名录");
    header.append(headingGroup, this.closeButton);

    const chapter = createElement(
      this.documentRoot,
      "section",
      "narrative-codex__chapter",
    );
    this.chapterTitle = createElement(
      this.documentRoot,
      "h3",
      "narrative-codex__chapter-title",
      "当前章节",
    );
    this.chapterProgress = createElement(
      this.documentRoot,
      "p",
      "narrative-codex__chapter-progress",
      "0 / 5 叙事拍",
    );
    this.beatList = createElement(
      this.documentRoot,
      "ol",
      "narrative-codex__beat-list",
    );
    chapter.append(this.chapterTitle, this.chapterProgress, this.beatList);

    this.momentSection = createElement(
      this.documentRoot,
      "section",
      "narrative-codex__moment-section",
    );
    const momentHeading = createElement(
      this.documentRoot,
      "div",
      "narrative-codex__moment-heading",
    );
    momentHeading.append(createElement(
      this.documentRoot,
      "h3",
      "narrative-codex__section-title",
      "现场记录 · 查询改变世界",
    ));
    this.momentProgress = createElement(
      this.documentRoot,
      "p",
      "narrative-codex__moment-progress",
      "0 / 0 已记录",
    );
    momentHeading.append(this.momentProgress);
    this.momentList = createElement(
      this.documentRoot,
      "ol",
      "narrative-codex__moment-list",
    );
    this.momentSection.append(momentHeading, this.momentList);

    const evidenceSection = createElement(
      this.documentRoot,
      "section",
      "narrative-codex__evidence-section",
    );
    evidenceSection.append(createElement(
      this.documentRoot,
      "h3",
      "narrative-codex__section-title",
      "本章证据",
    ));
    this.evidenceList = createElement(
      this.documentRoot,
      "div",
      "narrative-codex__evidence-list",
    );
    evidenceSection.append(this.evidenceList);

    const ascentSection = createElement(
      this.documentRoot,
      "section",
      "narrative-codex__ascent-section",
    );
    ascentSection.append(createElement(
      this.documentRoot,
      "h3",
      "narrative-codex__section-title",
      "王城上升路线",
    ));
    this.ascentList = createElement(
      this.documentRoot,
      "ol",
      "narrative-codex__ascent-list",
    );
    ascentSection.append(this.ascentList);

    const migrationSection = createElement(
      this.documentRoot,
      "section",
      "narrative-codex__migration",
    );
    this.migrationTitle = createElement(
      this.documentRoot,
      "h3",
      "narrative-codex__migration-title",
      "MIGRATE",
    );
    this.migrationSummary = createElement(
      this.documentRoot,
      "p",
      "narrative-codex__migration-summary",
    );
    this.migrationProgress = createElement(
      this.documentRoot,
      "p",
      "narrative-codex__migration-progress",
    );
    this.migrationList = createElement(
      this.documentRoot,
      "ol",
      "narrative-codex__migration-list",
    );
    this.migrationFinalLine = createElement(
      this.documentRoot,
      "p",
      "narrative-codex__migration-final",
    );
    this.migrationFinalLine.hidden = true;
    migrationSection.append(
      this.migrationTitle,
      this.migrationSummary,
      this.migrationProgress,
      this.migrationList,
      this.migrationFinalLine,
    );

    const body = createElement(
      this.documentRoot,
      "div",
      "narrative-codex__body",
    );
    body.append(
      chapter,
      this.momentSection,
      evidenceSection,
      ascentSection,
      migrationSection,
    );
    dialog.append(header, body);
    this.element.append(dialog);
    root.append(this.element);

    this.closeButton.addEventListener("click", this.handleCloseClick);
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
    this.documentRoot.addEventListener("keydown", this.handleDocumentKeyDown);
    this.closeButton.focus({ preventScroll: true });
  }

  close(): void {
    this.assertActive();
    if (!this.isOpen()) return;
    this.element.hidden = true;
    this.element.inert = true;
    this.element.classList.remove("is-open");
    this.element.setAttribute("aria-hidden", "true");
    this.documentRoot.removeEventListener("keydown", this.handleDocumentKeyDown);
    if (canFocus(this.previousFocus)) {
      this.previousFocus.focus({ preventScroll: true });
    }
    this.previousFocus = null;
    this.onClose?.();
  }

  render(state: NarrativeCodexRenderState): void {
    this.assertActive();
    const model = buildNarrativeCodexModel(state);
    this.element.dataset.floor = String(model.chapter.floor);
    this.chapterEyebrow.textContent = model.chapter.label;
    this.chapterTitle.textContent = model.chapter.regionName;
    this.chapterProgress.textContent =
      `${model.chapter.completedBeats} / ${model.chapter.totalBeats} 叙事拍`;

    this.beatList.replaceChildren(...model.beats.map((entry) => {
      const item = createElement(
        this.documentRoot,
        "li",
        `narrative-codex__beat ${entry.complete ? "is-complete" : "is-locked"}`,
      );
      item.dataset.kind = entry.kind;
      item.dataset.state = entry.complete ? "complete" : "locked";
      const label = createElement(
        this.documentRoot,
        "span",
        "narrative-codex__beat-label",
        entry.label,
      );
      const title = createElement(
        this.documentRoot,
        "strong",
        "narrative-codex__beat-title",
        entry.title,
      );
      item.append(label, title);
      entry.lines.forEach((line) => {
        item.append(createElement(
          this.documentRoot,
          "p",
          "narrative-codex__beat-line",
          line,
        ));
      });
      return item;
    }));

    this.momentSection.hidden = model.moments.length === 0;
    this.momentProgress.textContent =
      `${model.moments.filter((entry) => entry.complete).length} / ${
        model.moments.length
      } 已记录`;
    this.momentList.replaceChildren(...model.moments.map((entry) => {
      const item = createElement(
        this.documentRoot,
        "li",
        `narrative-codex__moment ${
          entry.complete ? "is-complete" : "is-locked"
        }`,
      );
      item.dataset.momentId = entry.id;
      item.dataset.kind = entry.kind;
      item.dataset.state = entry.complete ? "complete" : "locked";
      item.append(
        createElement(
          this.documentRoot,
          "span",
          "narrative-codex__moment-kicker",
          entry.kicker,
        ),
        createElement(
          this.documentRoot,
          "strong",
          "narrative-codex__moment-title",
          entry.title,
        ),
      );
      entry.lines.forEach((line) => {
        item.append(createElement(
          this.documentRoot,
          "p",
          "narrative-codex__moment-line",
          line,
        ));
      });
      if (entry.archiveLine) {
        item.append(createElement(
          this.documentRoot,
          "p",
          "narrative-codex__moment-finding",
          `本页结论：${entry.archiveLine}`,
        ));
      }
      if (entry.query) {
        const query = createElement(
          this.documentRoot,
          "article",
          "narrative-codex__story-query",
        );
        query.append(
          createElement(
            this.documentRoot,
            "span",
            "narrative-codex__story-query-title",
            `调查查询 / ${entry.query.title}`,
          ),
          createElement(
            this.documentRoot,
            "code",
            "narrative-codex__story-query-sql",
            entry.query.sql,
          ),
          createElement(
            this.documentRoot,
            "small",
            "narrative-codex__story-query-shape",
            entry.query.resultShape,
          ),
          createElement(
            this.documentRoot,
            "p",
            "narrative-codex__story-query-purpose",
            `结果含义：${entry.query.purpose}`,
          ),
        );
        item.append(query);
      }
      return item;
    }));

    this.evidenceList.replaceChildren(...model.evidence.map((entry) => {
      const item = createElement(
        this.documentRoot,
        "article",
        `narrative-codex__evidence is-${entry.state}`,
      );
      item.dataset.evidenceId = entry.id;
      item.dataset.state = entry.state;
      const heading = createElement(
        this.documentRoot,
        "h4",
        "narrative-codex__evidence-title",
        entry.title,
      );
      const field = createElement(
        this.documentRoot,
        "span",
        "narrative-codex__evidence-field",
        entry.fieldLabel,
      );
      const value = createElement(
        this.documentRoot,
        "code",
        "narrative-codex__evidence-value",
        entry.displayValue,
      );
      const finding = createElement(
        this.documentRoot,
        "p",
        "narrative-codex__evidence-finding",
        entry.finding ?? "尚未查询。",
      );
      item.append(heading, field, value, finding);
      return item;
    }));

    this.ascentList.replaceChildren(...model.ascents.map((entry) => {
      const item = createElement(
        this.documentRoot,
        "li",
        `narrative-codex__ascent is-${entry.state}`,
      );
      item.dataset.ascentId = entry.id;
      item.dataset.state = entry.state;
      const route = createElement(
        this.documentRoot,
        "span",
        "narrative-codex__ascent-route",
        `${entry.fromFloor} → ${entry.toFloor}`,
      );
      const name = createElement(
        this.documentRoot,
        "strong",
        "narrative-codex__ascent-name",
        entry.name,
      );
      const arrival = createElement(
        this.documentRoot,
        "span",
        "narrative-codex__ascent-arrival",
        `抵达：${entry.arrival}`,
      );
      const status = createElement(
        this.documentRoot,
        "small",
        "narrative-codex__ascent-status",
        ASCENT_STATE_COPY[entry.state],
      );
      item.append(route, name, arrival, status);
      return item;
    }));

    this.migrationTitle.textContent = model.migration.revealed
      ? `${model.migration.id} / ${model.migration.title}`
      : "??? / 尚未解锁";
    this.migrationSummary.textContent = model.migration.summary;
    this.migrationProgress.textContent = model.migration.revealed
      ? `${model.migration.completedSteps} / ${model.migration.totalSteps} 迁移步骤`
      : "结局记录尚未抵达";
    this.migrationList.replaceChildren(...model.migration.steps.map((entry) => {
      const item = createElement(
        this.documentRoot,
        "li",
        `narrative-codex__migration-step ${
          entry.complete ? "is-complete" : "is-locked"
        }`,
      );
      item.dataset.stepId = entry.id;
      item.dataset.state = entry.complete ? "complete" : "locked";
      item.append(
        createElement(
          this.documentRoot,
          "strong",
          "narrative-codex__migration-step-title",
          entry.title,
        ),
        createElement(
          this.documentRoot,
          "p",
          "narrative-codex__migration-step-description",
          entry.description,
        ),
      );
      return item;
    }));
    this.migrationFinalLine.hidden = model.migration.finalLine === null;
    this.migrationFinalLine.textContent = model.migration.finalLine ?? "";
  }

  destroy(): void {
    if (this.destroyed) return;
    this.documentRoot.removeEventListener("keydown", this.handleDocumentKeyDown);
    this.closeButton.removeEventListener("click", this.handleCloseClick);
    if (this.isOpen() && canFocus(this.previousFocus)) {
      this.previousFocus.focus({ preventScroll: true });
    }
    this.element.remove();
    this.previousFocus = null;
    this.destroyed = true;
  }

  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("NarrativeCodexView 已销毁。");
    }
  }
}
