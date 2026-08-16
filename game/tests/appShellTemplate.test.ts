import { describe, expect, it } from "vitest";
import { APP_SHELL_DOM_SELECTORS } from "../src/presentation/dom/appShellDom";
import { appShellTemplate } from "../src/presentation/dom/appShellTemplate";

const CRITICAL_DOM_IDS = [
  "game-root",
  "combat-terminal",
  "gate-terminal",
  "inspection-overlay",
  "campfire-menu",
  "inventory-menu",
  "loot-menu",
  "floor-portal",
  "answer-review",
  "admin-menu",
  "sql-editor",
  "gate-sql-editor",
  "execute-query",
  "execute-gate-query",
  "interact",
  "open-inventory",
  "open-sql",
  "open-review",
  "open-narrative",
  "open-monster-codex",
  "open-admin",
  "audio-toggle",
  "audio-volume",
  "reset-game",
  "agent-panel",
  "main-status",
  "main-guidance",
  "agent-work-mode",
  "agent-work-campfire",
  "agent-work-scribe",
  "agent-work-main",
  "agent-work-action",
  "agent-work-current",
  "agent-work-page",
  "agent-work-log",
  "playtest-agent-console",
  "playtest-agent-status",
  "playtest-agent-turn",
  "playtest-agent-phase",
  "playtest-agent-tool",
  "playtest-dashboard-controls",
  "playtest-quick-check",
  "playtest-quick-fix",
  "playtest-apply-fix",
  "playtest-diagnosis",
  "playtest-diagnosis-result",
  "playtest-diagnosis-issue",
  "playtest-diagnosis-cause",
  "playtest-diagnosis-evidence",
  "playtest-diagnosis-fix",
  "playtest-diagnosis-paths",
  "playtest-diagnosis-risk",
  "playtest-agent-log",
  "playtest-agent-usage",
  "main-live",
] as const;

describe("AppShell 静态 DOM 契约", () => {
  it("保留运行时绑定依赖的关键节点且所有 id 唯一", () => {
    const markup = appShellTemplate({
      schemaTableCount: 4,
      schemaFieldCount: 37,
    });
    const ids = Array.from(markup.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);

    CRITICAL_DOM_IDS.forEach((id) => {
      expect(ids, id).toContain(id);
    });
    Object.values(APP_SHELL_DOM_SELECTORS).forEach((selector) => {
      expect(ids, selector).toContain(selector.slice(1));
    });
    expect(new Set(ids).size).toBe(ids.length);
    expect((markup.match(/class="agent-card agent-card--plan"/g) ?? []).length).toBe(1);
    expect((markup.match(/class="agent-card agent-card--work"/g) ?? []).length).toBe(1);
    expect(markup).not.toContain("main-situation");
    expect(markup).not.toContain("agent-scribe-title");
    expect(markup).toContain('id="admin-next-floor"');
    expect(markup).not.toContain("admin-floor-list");
    expect(markup).not.toContain("admin-region-list");
    expect(markup).not.toContain("admin-preset-list");
  });

  it("只通过模板参数写入 Schema 统计，不依赖运行时全局状态", () => {
    const markup = appShellTemplate({
      schemaTableCount: 7,
      schemaFieldCount: 91,
    });

    expect(markup).toContain("7 TABLES");
    expect(markup).toContain("7 TABLES · 91 FIELDS");
  });
});
