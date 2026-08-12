/**
 * HUD 的通用 DOM 渲染工具。
 *
 * Renderer 只接收展示数据并更新节点，不调用 GameSession、不保存数据，
 * 也不处理按钮事件。复杂面板会在后续拆分中继续沿用这个边界。
 */
export class HudRenderer {
  constructor(private readonly root: HTMLElement) {}

  /** 更新一条带 aria 值和宽度的进度条。 */
  renderProgress(
    progressSelector: string,
    barSelector: string,
    rawValue: number,
    rawMax: number,
    valueText: string,
  ): void {
    const max = Math.max(1, rawMax);
    const value = Math.min(max, Math.max(0, rawValue));
    const progress = this.requiredElement<HTMLElement>(progressSelector);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuenow", String(value));
    progress.setAttribute("aria-valuemax", String(max));
    progress.setAttribute("aria-valuetext", valueText);
    this.requiredElement<HTMLElement>(barSelector).style.width = `${(value / max) * 100}%`;
  }

  private requiredElement<T extends HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`缺少 HUD 节点：${selector}`);
    return element;
  }
}
