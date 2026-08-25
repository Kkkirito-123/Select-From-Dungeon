/**
 * Dungeon Agent 的玩家终端查询执行边界。
 *
 * 本模块只点击当前已打开终端的真实执行按钮，并等待 AppShell 完成既有 SQL 策略、
 * SQLite、判题、战斗表现和 DOM 反馈链路。它不接收 SQL 参数，不读取 GameSnapshot 中的
 * 管理员答案或参考答案，也不直接调用底层 SQL 引擎或会话判题接口；当前 textarea 是唯一输入，
 * 文本写入由 actions.ts 的固定 inputSql 边界负责。
 * 查询失败会转换为稳定事件，SQL 正文不会进入 Trace 或日志。
 */

import {
  clickDungeonAgentAction,
  DUNGEON_AGENT_ACTION_SELECTORS,
  isDungeonAgentVisible,
  readDungeonAgentOverlay,
  readDungeonAgentQueryStatus,
  sleepDungeonAgent,
  waitDungeonAgentInteractionApplied,
  waitDungeonAgentUiReady,
} from "./actions";

/** 查询结果的稳定事件标签。 */
export type DungeonAgentQueryEvent =
  | "query-accepted"
  | "query-rejected"
  | "answer-not-ready"
  | "query-not-available"
  | "terminal-not-open"
  | "ui-not-ready"
  | "query-not-applied";

/** 查询执行后只向桥层返回低敏结果。 */
export interface DungeonAgentQueryResult {
  accepted: boolean;
  event: DungeonAgentQueryEvent;
}

/** 当前页面查询执行所需的可见 UI 依赖。 */
export interface DungeonAgentQueryContext {
  root: HTMLElement;
  mode: "combat" | "challenge";
  readFingerprint(): string;
}

const UI_POLL_INTERVAL_MS = 24;
const COMBAT_TERMINAL_SELECTOR = "#combat-terminal";
const CHALLENGE_TERMINAL_SELECTOR = "#gate-terminal";
const COMBAT_EXECUTE_SELECTOR = "#execute-query";
const CHALLENGE_EXECUTE_SELECTOR = "#execute-gate-query";

/**
 * 提交当前玩家终端中的 SQL。
 *
 * @param context 当前游戏根节点、终端模式和页面内语义指纹读取器。
 * @returns AppShell 最终可见状态对应的 accepted/event；不会返回或记录 SQL 正文。
 */
export async function executeDungeonAgentQuery(
  context: DungeonAgentQueryContext,
): Promise<DungeonAgentQueryResult> {
  const terminalSelector = context.mode === "combat"
    ? COMBAT_TERMINAL_SELECTOR
    : CHALLENGE_TERMINAL_SELECTOR;
  if (
    context.mode === "combat"
    && !isDungeonAgentVisible(context.root, terminalSelector)
  ) {
    if (!clickDungeonAgentAction(
      context.root,
      DUNGEON_AGENT_ACTION_SELECTORS.terminal,
    )) {
      return { accepted: false, event: "query-not-available" };
    }
    await sleepDungeonAgent(UI_POLL_INTERVAL_MS);
  }

  const terminal = readDungeonAgentOverlay(context.root).terminal;
  if (!terminal || terminal.kind !== context.mode) {
    return { accepted: false, event: "terminal-not-open" };
  }
  const beforeFingerprint = context.readFingerprint();
  const executeSelector = context.mode === "combat"
    ? COMBAT_EXECUTE_SELECTOR
    : CHALLENGE_EXECUTE_SELECTOR;
  if (!clickDungeonAgentAction(context.root, executeSelector)) {
    return { accepted: false, event: "query-not-available" };
  }
  await sleepDungeonAgent(UI_POLL_INTERVAL_MS);
  if (!await waitDungeonAgentUiReady(context.root)) {
    return { accepted: false, event: "ui-not-ready" };
  }
  await sleepDungeonAgent(UI_POLL_INTERVAL_MS);
  if (!await waitDungeonAgentInteractionApplied(
    context.readFingerprint,
    beforeFingerprint,
  )) {
    return { accepted: false, event: "query-not-applied" };
  }

  const status = readDungeonAgentQueryStatus(context.root, context.mode);
  const accepted = status.kind === "success";
  return {
    accepted,
    event: terminal.inputSql.trim()
      ? accepted ? "query-accepted" : "query-rejected"
      : "answer-not-ready",
  };
}
