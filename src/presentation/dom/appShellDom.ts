/**
 * AppShell 的稳定 DOM 选择器契约。
 * 集中绑定一次并快速失败，避免交互代码到处查询元素；本模块不渲染内容
 * 也不处理游戏状态。
 */
function requireElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少 AppShell DOM 节点：${selector}`);
  return element;
}

export const APP_SHELL_DOM_SELECTORS = {
  textarea: "#sql-editor",
  gateTextarea: "#gate-sql-editor",
  queryStatus: "#query-status",
  gateQueryStatus: "#gate-query-status",
  resultRoot: "#query-result",
  planRoot: "#query-plan",
  hintsRoot: "#hint-list",
  terminal: "#combat-terminal",
  gateTerminal: "#gate-terminal",
  inspectionOverlay: "#inspection-overlay",
  campfireMenu: "#campfire-menu",
  inventoryMenu: "#inventory-menu",
  lootMenu: "#loot-menu",
  adminMenu: "#admin-menu",
  executeButton: "#execute-query",
  gateExecuteButton: "#execute-gate-query",
  sqlButton: "#open-sql",
  audioButton: "#audio-toggle",
} as const;

/**
 * Stable nodes owned by the AppShell template and reused throughout one mount.
 * Centralising these selectors keeps runtime orchestration independent from
 * the static markup module and fails fast when the DOM contract drifts.
 */
export interface AppShellDom {
  textarea: HTMLTextAreaElement;
  gateTextarea: HTMLTextAreaElement;
  queryStatus: HTMLElement;
  gateQueryStatus: HTMLElement;
  resultRoot: HTMLElement;
  planRoot: HTMLElement;
  hintsRoot: HTMLElement;
  terminal: HTMLElement;
  gateTerminal: HTMLElement;
  inspectionOverlay: HTMLElement;
  campfireMenu: HTMLElement;
  inventoryMenu: HTMLElement;
  lootMenu: HTMLElement;
  adminMenu: HTMLElement;
  executeButton: HTMLButtonElement;
  gateExecuteButton: HTMLButtonElement;
  sqlButton: HTMLButtonElement;
  audioButton: HTMLButtonElement;
}

export function bindAppShellDom(root: ParentNode): AppShellDom {
  return {
    textarea: requireElement(root, APP_SHELL_DOM_SELECTORS.textarea),
    gateTextarea: requireElement(root, APP_SHELL_DOM_SELECTORS.gateTextarea),
    queryStatus: requireElement(root, APP_SHELL_DOM_SELECTORS.queryStatus),
    gateQueryStatus: requireElement(root, APP_SHELL_DOM_SELECTORS.gateQueryStatus),
    resultRoot: requireElement(root, APP_SHELL_DOM_SELECTORS.resultRoot),
    planRoot: requireElement(root, APP_SHELL_DOM_SELECTORS.planRoot),
    hintsRoot: requireElement(root, APP_SHELL_DOM_SELECTORS.hintsRoot),
    terminal: requireElement(root, APP_SHELL_DOM_SELECTORS.terminal),
    gateTerminal: requireElement(root, APP_SHELL_DOM_SELECTORS.gateTerminal),
    inspectionOverlay: requireElement(root, APP_SHELL_DOM_SELECTORS.inspectionOverlay),
    campfireMenu: requireElement(root, APP_SHELL_DOM_SELECTORS.campfireMenu),
    inventoryMenu: requireElement(root, APP_SHELL_DOM_SELECTORS.inventoryMenu),
    lootMenu: requireElement(root, APP_SHELL_DOM_SELECTORS.lootMenu),
    adminMenu: requireElement(root, APP_SHELL_DOM_SELECTORS.adminMenu),
    executeButton: requireElement(root, APP_SHELL_DOM_SELECTORS.executeButton),
    gateExecuteButton: requireElement(root, APP_SHELL_DOM_SELECTORS.gateExecuteButton),
    sqlButton: requireElement(root, APP_SHELL_DOM_SELECTORS.sqlButton),
    audioButton: requireElement(root, APP_SHELL_DOM_SELECTORS.audioButton),
  };
}
