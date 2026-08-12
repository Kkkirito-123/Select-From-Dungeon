/**
 * 剧情图鉴 Panel 的生命周期门面。
 *
 * 固定剧情模型和证据脱敏仍由 `NarrativeCodexView` 负责，本模块只收敛 DOM
 * 面板的打开、关闭、渲染和销毁动作，避免 AppShell 了解内部节点结构。
 */
import {
  NarrativeCodexView,
  type NarrativeCodexRenderState,
  type NarrativeCodexViewOptions,
} from "../NarrativeCodexView";

export class NarrativePanel {
  private readonly view: NarrativeCodexView;

  constructor(root: HTMLElement, options: NarrativeCodexViewOptions) {
    this.view = new NarrativeCodexView(root, options);
  }

  get element(): HTMLElement {
    return this.view.element;
  }

  isOpen(): boolean {
    return this.view.isOpen();
  }

  open(): void {
    this.view.open();
  }

  close(): void {
    this.view.close();
  }

  render(state: NarrativeCodexRenderState): void {
    this.view.render(state);
  }

  destroy(): void {
    this.view.destroy();
  }
}
