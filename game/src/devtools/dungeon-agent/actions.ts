/**
 * Dungeon Agent 浏览器动作与可见覆盖层读取。
 *
 * 本模块只把固定的语义动作 ID 映射到游戏已经存在的按钮，并读取玩家可见的检查/复盘
 * 覆盖层与当前已打开 SQL 终端。它不接受 CSS 选择器、脚本或坐标作为外部输入，不修改
 * GameSession，不执行 SQL，也不安装全局桥；桥接生命周期仍由 `bridge.ts` 负责。
 *
 * 所有等待都使用有限轮询和固定时长，避免维护器因动画或 UI 异常无限挂起。只有当前
 * 已打开 textarea 的值可以作为玩家可见 SQL 进入投影；受控写入只触碰固定 textarea，
 * 隐藏答案字段仍不会被本模块读取。
 */

import type { DungeonAgentQueryStatusKind } from "./protocol";

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

/** 当前已打开终端中允许进入玩家投影的有限状态。 */
export interface VisibleTerminalState {
  kind: "combat" | "challenge";
  title: string;
  inputSql: string;
  status: {
    kind: DungeonAgentQueryStatusKind;
    text: string;
  };
  result: string;
  plan: readonly string[];
}

/** DOM 覆盖层中允许进入玩家投影的有限状态。 */
export interface VisibleOverlayState {
  inspectionOpen: boolean;
  reviewOpen: boolean;
  record: {
    kicker: string;
    title: string;
    body: string;
  } | null;
  terminal: VisibleTerminalState | null;
}

const UI_POLL_INTERVAL_MS = 24;
const ANIMATED_MOVE_SETTLE_MS = 110;
const UI_READY_ATTEMPTS = 500;
const INTERACTION_SETTLE_ATTEMPTS = 30;
export const DUNGEON_AGENT_SQL_MAX_LENGTH = 16 * 1024;

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

function readDungeonAgentResult(root: ParentNode, selector: string): string {
  const result = root.querySelector<HTMLElement>(selector);
  if (!result) return "";
  const rows = Array.from(result.querySelectorAll<HTMLTableRowElement>("tr"))
    .map((row) => Array.from(row.querySelectorAll<HTMLElement>("th, td"))
      .map((cell) => cell.textContent?.trim() ?? "")
      .join(" | "))
    .filter(Boolean);
  return rows.length > 0 ? rows.join("\n") : result.textContent?.trim() ?? "";
}

function readDungeonAgentPlan(root: ParentNode, selector: string): readonly string[] {
  const plan = root.querySelector<HTMLElement>(selector);
  if (!plan) return [];
  const lines = Array.from(plan.querySelectorAll<HTMLElement>(".plan-line"))
    .map((line) => line.textContent?.replace(/\s+/gu, " ").trim() ?? "")
    .filter(Boolean);
  if (lines.length > 0) return lines;
  const fallback = plan.textContent?.trim() ?? "";
  return fallback ? [fallback] : [];
}

function queryStatusKind(value: string | undefined): DungeonAgentQueryStatusKind {
  return value === "success" || value === "warning" || value === "error"
    ? value
    : "neutral";
}

/**
 * 读取一个终端最近显示的玩家查询状态。
 *
 * @param root 当前游戏根节点。
 * @param kind 战斗终端或机关终端。
 * @returns 规范化后的状态类型与可见文案；节点缺失时返回 neutral 空文案。
 */
export function readDungeonAgentQueryStatus(
  root: ParentNode,
  kind: "combat" | "challenge",
): VisibleTerminalState["status"] {
  const element = root.querySelector<HTMLElement>(
    kind === "combat" ? "#query-status" : "#gate-query-status",
  );
  return {
    kind: queryStatusKind(element?.dataset.kind),
    text: element?.textContent?.trim() ?? "",
  };
}

function readDungeonAgentTerminal(root: ParentNode): VisibleTerminalState | null {
  const kind = isDungeonAgentVisible(root, "#gate-terminal")
    ? "challenge"
    : isDungeonAgentVisible(root, "#combat-terminal")
      ? "combat"
      : null;
  if (!kind) return null;
  const combat = kind === "combat";
  return {
    kind,
    title: readDungeonAgentText(
      root,
      combat ? "#terminal-title" : "#gate-terminal-title",
    ),
    inputSql: root.querySelector<HTMLTextAreaElement>(
      combat ? "#sql-editor" : "#gate-sql-editor",
    )?.value ?? "",
    status: readDungeonAgentQueryStatus(root, kind),
    result: readDungeonAgentResult(
      root,
      combat ? "#query-result" : "#gate-query-result",
    ),
    plan: readDungeonAgentPlan(
      root,
      combat ? "#query-plan" : "#gate-query-plan",
    ),
  };
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
    terminal: readDungeonAgentTerminal(root),
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

/**
 * 向当前已打开的固定玩家终端写入文本。
 *
 * @param root 当前游戏根节点。
 * @param kind 当前战斗或机关终端模式。
 * @param sql 由维护器生成的 SQL 文本；不会被本函数记录或持久化。
 * @returns 终端可见且文本已写入并触发 input/change 事件时为 `true`。
 */
export function writeDungeonAgentSql(
  root: ParentNode,
  kind: "combat" | "challenge",
  sql: string,
): boolean {
  if (
    typeof sql !== "string"
    || sql.length > DUNGEON_AGENT_SQL_MAX_LENGTH
    || sql.includes("\u0000")
  ) return false;
  const terminalSelector = kind === "combat" ? "#combat-terminal" : "#gate-terminal";
  if (!isDungeonAgentVisible(root, terminalSelector)) return false;
  const textarea = root.querySelector<HTMLTextAreaElement>(
    kind === "combat" ? "#sql-editor" : "#gate-sql-editor",
  );
  if (!textarea || textarea.disabled || textarea.hidden) return false;
  textarea.value = sql;
  if (typeof textarea.dispatchEvent === "function" && typeof Event === "function") {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

/**
 * 等待一次交互产生真实、可观察的语义变化。
 *
 * @param readFingerprint 读取桥内固定语义指纹；不接受模型输入，也不返回指纹内容。
 * @param beforeFingerprint 点击前指纹。
 * @returns 最多轮询约 720ms；观察到变化返回 `true`，否则返回 `false`。
 */
export async function waitDungeonAgentInteractionApplied(
  readFingerprint: () => string,
  beforeFingerprint: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < INTERACTION_SETTLE_ATTEMPTS; attempt += 1) {
    if (readFingerprint() !== beforeFingerprint) return true;
    await sleepDungeonAgent(UI_POLL_INTERVAL_MS);
  }
  return readFingerprint() !== beforeFingerprint;
}
