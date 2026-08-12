/**
 * DOM 对话框的键盘焦点边界。
 *
 * 这里只处理 Tab 循环和无可聚焦元素时的回退，不决定哪个面板打开，也
 * 不保存游戏状态。AppShell 负责把当前对话框交给它。
 */
export class DialogFocusManager {
  /** 将 Tab 焦点限制在当前可见对话框内。 */
  trap(event: KeyboardEvent, dialog: HTMLElement): void {
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.closest("[inert]") && !element.hasAttribute("hidden"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
}
