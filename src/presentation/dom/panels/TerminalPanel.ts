/**
 * SQL 终端 Panel 的事件边界。
 *
 * 终端只把按钮动作转发给 AppShell；SQL 执行、判题和 GameSession 状态变化
 * 仍由已有协调器负责。这里不持有 SQL 文本副本，也不直接创建 SqlEngine。
 */
import { APP_SHELL_DOM_SELECTORS } from "../appShellDom";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type {
  QueryResultDisclosure,
  SqlQueryResult,
} from "../../../contracts/game/results";
import { redactUndiscoveredQueryIdentities } from "../../../domain/learning/queryDisclosure";

export interface TerminalPanelActions {
  executeQuery(): void | Promise<void>;
  executeGateChallenge(): void | Promise<void>;
  closeTerminal(): void;
  closeGateTerminal(): void;
  requestHint(): void;
}

/** 失败查询只展示结构证据，避免把未揭示身份值直接暴露给玩家。 */
export function shapeOnlyQueryResultCopy(result: SqlQueryResult): {
  title: string;
  detail: string;
} {
  return {
    title: `查询已执行 · 结果值与行数已封存 · ${result.columns.length} 个字段`,
    detail: result.columns.length > 0
      ? `字段：${result.columns.join(", ")}。本次答案未通过，结果值与行数已封存。`
      : "本次答案未通过，结果值与行数已封存。",
  };
}

export class TerminalPanel {
  constructor(
    private readonly root: HTMLElement,
    private readonly actions: TerminalPanelActions,
  ) {}

  bind(options: AddEventListenerOptions): void {
    this.required<HTMLButtonElement>(APP_SHELL_DOM_SELECTORS.executeButton).addEventListener(
      "click",
      () => void this.actions.executeQuery(),
      options,
    );
    this.required<HTMLButtonElement>(APP_SHELL_DOM_SELECTORS.gateExecuteButton).addEventListener(
      "click",
      () => void this.actions.executeGateChallenge(),
      options,
    );
    this.required<HTMLElement>("#close-terminal").addEventListener(
      "click",
      () => this.actions.closeTerminal(),
      options,
    );
    this.required<HTMLElement>("#close-gate-terminal").addEventListener(
      "click",
      () => this.actions.closeGateTerminal(),
      options,
    );
    this.required<HTMLElement>("#cancel-gate-query").addEventListener(
      "click",
      () => this.actions.closeGateTerminal(),
      options,
    );
    this.required<HTMLElement>("#request-hint").addEventListener(
      "click",
      () => this.actions.requestHint(),
      options,
    );
  }

  /** 将查询结果和 SQLite 计划绘制到指定结果区，不执行查询或推进状态。 */
  renderResult(
    result: SqlQueryResult,
    snapshot: GameSnapshot,
    disclosure: QueryResultDisclosure,
    resultRoot = this.required<HTMLElement>(APP_SHELL_DOM_SELECTORS.resultRoot),
    planRoot = this.required<HTMLElement>(APP_SHELL_DOM_SELECTORS.planRoot),
  ): void {
    const visibleResult = disclosure === "shape-only"
      ? result
      : redactUndiscoveredQueryIdentities(
          result,
          snapshot.monsters,
          snapshot.profile.discoveredMonsterIds,
        );
    resultRoot.replaceChildren();
    resultRoot.className = "table-wrap";
    if (disclosure === "shape-only") {
      resultRoot.classList.add("result-shape");
      const copy = shapeOnlyQueryResultCopy(result);
      const title = document.createElement("strong");
      title.textContent = copy.title;
      const detail = document.createElement("p");
      detail.textContent = copy.detail;
      resultRoot.append(title, detail);
    } else if (visibleResult.rows.length === 0) {
      resultRoot.classList.add("empty-state");
      resultRoot.textContent = "查询返回 0 行。";
    } else {
      const table = document.createElement("table");
      const headRow = document.createElement("tr");
      visibleResult.columns.forEach((column) => {
        const cell = document.createElement("th");
        cell.textContent = column;
        headRow.append(cell);
      });
      const head = document.createElement("thead");
      head.append(headRow);
      table.append(head);
      const body = document.createElement("tbody");
      visibleResult.rows.forEach((row) => {
        const rowElement = document.createElement("tr");
        visibleResult.columns.forEach((column) => {
          const cell = document.createElement("td");
          const value = row[column];
          cell.textContent = value === null ? "NULL" : String(value ?? "");
          rowElement.append(cell);
        });
        body.append(rowElement);
      });
      table.append(body);
      resultRoot.append(table);
    }

    planRoot.replaceChildren();
    planRoot.className = "plan-list";
    visibleResult.plan.forEach((detail, index) => {
      const line = document.createElement("div");
      line.className = "plan-line";
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const text = document.createElement("code");
      text.textContent = detail;
      line.append(number, text);
      planRoot.append(line);
    });
    if (visibleResult.plan.length === 0) {
      planRoot.classList.add("empty-state");
      planRoot.textContent = "SQLite 未返回查询计划。";
    }
  }

  clearQueryArtifacts(): void {
    const resultRoot = this.required<HTMLElement>(APP_SHELL_DOM_SELECTORS.resultRoot);
    const planRoot = this.required<HTMLElement>(APP_SHELL_DOM_SELECTORS.planRoot);
    resultRoot.className = "table-wrap empty-state";
    resultRoot.textContent = "尚未执行本回合查询。";
    planRoot.className = "plan-list empty-state";
    planRoot.textContent = "等待 EXPLAIN QUERY PLAN。";
  }

  private required<T extends HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`缺少终端界面元素：${selector}`);
    return element;
  }
}
