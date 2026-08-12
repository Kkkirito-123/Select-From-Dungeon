/**
 * 答题复盘 Panel 的生命周期门面。
 *
 * 具体记录排版继续由 `AnswerReviewView` 负责；本层把它纳入 Panel 目录，
 * 让 AppShell 只协调打开、关闭和焦点，不直接依赖复盘 DOM 的实现细节。
 */
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import {
  AnswerReviewView,
  type AnswerReviewScope,
} from "../AnswerReviewView";

export class ReviewPanel {
  private readonly view: AnswerReviewView;

  constructor(root: HTMLElement) {
    this.view = new AnswerReviewView(root);
  }

  get element(): HTMLElement {
    return this.view.element;
  }

  get closeButton(): HTMLButtonElement {
    return this.view.closeButton;
  }

  isOpen(): boolean {
    return this.view.isOpen();
  }

  setOpen(open: boolean): void {
    this.view.setOpen(open);
  }

  render(snapshot: GameSnapshot, scope: AnswerReviewScope): void {
    this.view.render(snapshot, scope);
  }
}
