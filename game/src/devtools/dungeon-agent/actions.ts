/**
 * Dungeon Agent 浏览器动作与可见覆盖层读取。
 *
 * 本模块只把固定的语义动作 ID 映射到游戏已经存在的按钮，并读取玩家可见的检查/复盘
 * 覆盖层。它不接受 CSS 选择器、脚本或坐标作为外部输入，不修改 GameSession，不执行 SQL，
 * 也不安装全局桥；桥接生命周期仍由 `bridge.ts` 负责。
 *
 * 所有等待都使用有限轮询和固定时长，避免维护器因动画或 UI 异常无限挂起。正文读取会
 * 脱敏 SQL 关键字，防止玩家可见的复盘提示意外进入 Agent 视图或 Trace。
 */

/** 语义动作到游戏内稳定按钮的固定映射。 */
export const DUNGEON_AGENT_ACTION_SELECTORS: Readonly<Record<string, string>> = {
  continue: "#close-inspection",
  "close-review": "#close-review",
  interact: "#interact",
  terminal: "#open-sql",
  rest: "#rest-at-campfire",
  leave: "#leave-campfire",
  "take-all": "#take-all-loot",
  "leave-loot": "#close-loot",
  "close-inventory": "#close-inventory",
  query: "#open-sql",
  "leave-challenge": "#close-gate-terminal",
};

/** DOM 覆盖层中允许进入玩家投影的有限状态。 */
export interface VisibleOverlayState {
  inspectionOpen: boolean;
  reviewOpen: boolean;
  record: {
    kicker: string;
    title: string;
    body: string;
  } | null;
}

const UI_POLL_INTERVAL_MS = 24;
const ANIMATED_MOVE_SETTLE_MS = 110;
const UI_READY_ATTEMPTS = 500;

/**
 * 等待固定毫秒数。
 *
 * @param delayMs 等待时长；只由本模块内部传入固定常量。
 * @returns 计时器完成后 resolve。
 */
export function sleepDungeonAgent(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

/**
 * 根据当前 reduced-motion 偏好选择动作稳定等待时长。
 *
 * @returns 非动画或动画页面下都足够让 Phaser 解锁下一步的固定时长。
 */
export function dungeonAgentMovementSettleDelay(): number {
  // 维护器 Context 默认 reduced-motion，手工打开试玩页时仍需等待 92ms Phaser 位移动画
  // 解锁；否则下一格会被表现层拒绝，复现 Trace 会出现与游戏规则无关的 blocked。
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? UI_POLL_INTERVAL_MS
    : ANIMATED_MOVE_SETTLE_MS;
}

/**
 * 判断固定 DOM 节点是否可见。
 *
 * @param root 当前游戏根节点或其父节点。
 * @param selector 维护器代码内的固定选择器，不能来自模型。
 * @returns 元素存在且未被 hidden/aria-hidden 隐藏时为 `true`。
 */
export function isDungeonAgentVisible(root: ParentNode, selector: string): boolean {
  const element = root.querySelector<HTMLElement>(selector);
  return Boolean(
    element
    && !element.hidden
    && element.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * 读取固定 DOM 节点的玩家可见文本。
 *
 * @param root 当前游戏根节点或其父节点。
 * @param selector 维护器代码内的固定选择器。
 * @returns 去除首尾空白的文本；节点缺失时返回空串。
 */
export function readDungeonAgentText(root: ParentNode, selector: string): string {
  return root.querySelector<HTMLElement>(selector)?.textContent?.trim() ?? "";
}

function redactVisibleRecordBody(value: string): string {
  return value
    .split("\n")
    .map((line) => /\b(?:SELECT|WITH|INSERT|UPDATE|DELETE)\b/iu.test(line)
      ? "[查询正文未传给维护模型]"
      : line)
    .join("\n");
}

/**
 * 读取并裁剪玩家可见检查/复盘覆盖层。
 *
 * @param root 当前游戏根节点。
 * @returns 不含 SQL 正文的覆盖层状态。
 */
export function readDungeonAgentOverlay(root: ParentNode): VisibleOverlayState {
  const inspectionOpen = isDungeonAgentVisible(root, "#inspection-overlay");
  return {
    inspectionOpen,
    reviewOpen: root.querySelector("#answer-review")?.classList.contains("is-open") ?? false,
    record: inspectionOpen
      ? {
          kicker: readDungeonAgentText(root, "#inspection-kicker"),
          title: readDungeonAgentText(root, "#inspection-title"),
          body: redactVisibleRecordBody(readDungeonAgentText(root, "#inspection-message")),
        }
      : null,
  };
}

/**
 * 点击一个固定且当前可用的游戏按钮。
 *
 * @param root 当前游戏根节点。
 * @param selector 维护器内置的稳定选择器。
 * @returns 点击成功返回 `true`，按钮缺失/禁用时返回 `false`。
 */
export function clickDungeonAgentAction(root: ParentNode, selector: string): boolean {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button || button.disabled || button.hidden) return false;
  button.click();
  return true;
}

/**
 * 等待 UI 不再处于 resolving 动画。
 *
 * @param root 当前游戏根节点。
 * @returns UI 在有限次数内就绪返回 `true`，超时返回 `false`。
 */
export async function waitDungeonAgentUiReady(root: ParentNode): Promise<boolean> {
  for (let attempt = 0; attempt < UI_READY_ATTEMPTS; attempt += 1) {
    const stage = root.querySelector<HTMLElement>(".game-stage");
    if (!stage?.classList.contains("is-resolving")) return true;
    await sleepDungeonAgent(UI_POLL_INTERVAL_MS);
  }
  return false;
}
