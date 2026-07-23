import type { AnswerAttemptRecord, GameSnapshot } from "../domain/types";

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

  render(snapshot: GameSnapshot): void {
    const battleSummary = answerReviewSummary(snapshot.battleReview);
    const floorSummary = answerReviewSummary(snapshot.floorReview);
    requiredElement(this.element, "#battle-review-summary").textContent =
      reviewSummaryCopy(battleSummary);
    requiredElement(this.element, "#floor-review-title").textContent =
      `第 ${snapshot.floor} 层全部作答`;
    requiredElement(this.element, "#floor-review-summary").textContent =
      reviewSummaryCopy(floorSummary);
    this.renderRecords(
      requiredElement(this.element, "#battle-review-list"),
      snapshot.battleReview,
      "还没有可复盘的战斗。触碰怪物并提交 SQL 后，这里会显示本场记录。",
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
