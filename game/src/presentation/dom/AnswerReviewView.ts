/**
 * SQL 答案复盘视图。
 * 根据当前快照渲染战斗或楼层记录，不判定答案、不修改记录；死亡复盘的
 * 当前战斗范围由 GameSession 的 battleReview 提供。
 */
import type { AnswerAttemptRecord } from "../../contracts/game/results";
import type { GameSnapshot } from "../../contracts/game/snapshots";

export type AnswerReviewScope = "all" | "battle" | "floor";

export interface AnswerReviewSummary {
  total: number;
  correct: number;
  errors: number;
  hintUses: number;
  accuracy: number;
}

export function answerReviewSummary(
  records: readonly AnswerAttemptRecord[],
): AnswerReviewSummary {
  const correct = records.filter((record) => record.result === "correct").length;
  const hintUses = records.filter((record) => record.hintLevel > 0).length;
  return {
    total: records.length,
    correct,
    errors: records.length - correct,
    hintUses,
    accuracy: records.length === 0 ? 0 : Math.round((correct / records.length) * 100),
  };
}

function requiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少复盘界面元素：${selector}`);
  return element;
}

function reviewSummaryCopy(summary: AnswerReviewSummary): string {
  return summary.total === 0
    ? "0 次作答"
    : `${summary.correct}/${summary.total} 正确 · ${summary.accuracy}% · 提示 ${summary.hintUses} 次`;
}

export class AnswerReviewView {
  readonly element: HTMLElement;
  readonly closeButton: HTMLButtonElement;
  private scope: AnswerReviewScope = "all";

  constructor(root: HTMLElement) {
    this.element = requiredElement(root, "#answer-review");
    this.closeButton = requiredElement(this.element, "#close-review");
  }

  isOpen(): boolean {
    return this.element.classList.contains("is-open");
  }

  setOpen(open: boolean): void {
    this.element.classList.toggle("is-open", open);
    this.element.inert = !open;
    this.element.setAttribute("aria-hidden", String(!open));
  }

  render(snapshot: GameSnapshot, scope: AnswerReviewScope = this.scope): void {
    this.scope = scope;
    const battleSummary = answerReviewSummary(snapshot.battleReview);
    const floorSummary = answerReviewSummary(snapshot.floorReview);
    const battleSection = requiredElement<HTMLElement>(
      this.element,
      '[data-review-section="battle"]',
    );
    const floorSection = requiredElement<HTMLElement>(
      this.element,
      '[data-review-section="floor"]',
    );
    const columns = requiredElement<HTMLElement>(this.element, ".answer-review__columns");
    battleSection.hidden = scope === "floor";
    floorSection.hidden = scope === "battle";
    columns.dataset.scope = scope;

    const title = requiredElement(this.element, "#answer-review-title");
    const description = requiredElement(this.element, "#answer-review-description");
    if (scope === "battle") {
      title.textContent = battleSummary.total === 0
        ? "机关失败复盘"
        : "本场死亡复盘";
      description.textContent = battleSummary.total === 0
        ? "本次死亡来自可选机关破解；机关查询不混入怪物战斗记录，请根据终端反馈调整后再尝试。"
        : "先看清本场 SQL 的命中与反击，再从最近的篝火重新出发。";
      this.closeButton.textContent = "复盘完成";
      this.closeButton.setAttribute("aria-label", "完成本场死亡复盘");
    } else if (scope === "floor") {
      title.textContent = `第 ${snapshot.floor} 层答案复盘`;
      description.textContent = "只查看本层已经提交的 SQL；关闭后返回篝火菜单。";
      this.closeButton.textContent = "返回篝火";
      this.closeButton.setAttribute("aria-label", "返回篝火菜单");
    } else {
      title.textContent = "答题复盘";
      description.textContent = "只保存在本地：记录提交的 SQL 回合，不记录移动或按键，也不会上传。";
      this.closeButton.textContent = "ESC ×";
      this.closeButton.setAttribute("aria-label", "关闭答题复盘");
    }
    requiredElement(this.element, "#battle-review-summary").textContent =
      reviewSummaryCopy(battleSummary);
    requiredElement(this.element, "#floor-review-title").textContent =
      `第 ${snapshot.floor} 层全部作答`;
    requiredElement(this.element, "#floor-review-summary").textContent =
      reviewSummaryCopy(floorSummary);
    this.renderRecords(
      requiredElement(this.element, "#battle-review-list"),
      snapshot.battleReview,
      scope === "battle"
        ? "本次没有怪物战斗记录。关闭复盘后可重新挑战机关。"
        : "还没有可复盘的战斗。触碰怪物并提交 SQL 后，这里会显示本场记录。",
    );
    this.renderRecords(
      requiredElement(this.element, "#floor-review-list"),
      snapshot.floorReview,
      `第 ${snapshot.floor} 层尚未提交 SQL。上一层记录不会混入这里。`,
    );
  }

  private renderRecords(
    root: HTMLElement,
    records: readonly AnswerAttemptRecord[],
    emptyMessage: string,
  ): void {
    root.replaceChildren();
    if (records.length === 0) {
      const empty = document.createElement("p");
      empty.className = "answer-review__empty";
      empty.textContent = emptyMessage;
      root.append(empty);
      return;
    }
    const resultCopy: Record<AnswerAttemptRecord["result"], string> = {
      correct: "正确",
      "missing-concept": "缺少核心语句",
      "wrong-result": "结果不匹配",
      "syntax-error": "SQL 无法执行",
    };
    const outcomeCopy: Record<AnswerAttemptRecord["outcome"], string> = {
      hit: "命中",
      countered: "受到反击",
      victory: "击败怪物",
      defeat: "本场失败",
    };
    [...records].reverse().forEach((record) => {
      const entry = document.createElement("article");
      entry.className = "answer-review-entry";
      entry.dataset.result = record.result;

      const heading = document.createElement("div");
      heading.className = "answer-review-entry__heading";
      const identity = document.createElement("span");
      identity.textContent =
        `#${record.id} · ${record.monsterName} · ${record.lessonId.toUpperCase()}`;
      const result = document.createElement("strong");
      result.textContent = `${resultCopy[record.result]} / ${outcomeCopy[record.outcome]}`;
      heading.append(identity, result);

      const objective = document.createElement("p");
      objective.className = "answer-review-entry__objective";
      objective.textContent = record.stageObjective;

      const meta = document.createElement("small");
      meta.classList.toggle("is-hint-used", record.hintLevel > 0);
      meta.textContent =
        `第 ${record.round} 回合 · 提示 ${record.hintLevel} 级 · ${record.stageId}`;

      const submittedLabel = document.createElement("span");
      submittedLabel.className = "answer-review-entry__label";
      submittedLabel.textContent = "你的 SQL";
      const submitted = document.createElement("code");
      submitted.textContent = record.sql || "（未保存到 SQL 文本）";

      const answerLabel = document.createElement("span");
      answerLabel.className = "answer-review-entry__label";
      answerLabel.textContent = "参考 SQL";
      const answer = document.createElement("code");
      answer.textContent = record.answerSql;

      const feedback = document.createElement("p");
      feedback.className = "answer-review-entry__feedback";
      feedback.textContent = record.feedback;

      entry.append(
        heading,
        objective,
        meta,
        submittedLabel,
        submitted,
        answerLabel,
        answer,
        feedback,
      );
      root.append(entry);
    });
  }
}
