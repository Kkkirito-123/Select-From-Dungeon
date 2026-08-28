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
  "github-link",
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
  "main-live",
  "online-presence",
  "online-presence-count",
  "online-presence-label",
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
    expect(markup).toContain('href="https://github.com/Kkkirito-123/Select-From-Dungeon"');
    expect(markup).toContain('aria-label="在 GitHub 查看 SELECT FROM DUNGEON 项目"');
    expect(markup).toContain('class="github-link__brand">GitHub</strong>');
    expect(markup).toContain('class="github-link__text">查看项目</span>');
    expect(markup).toContain('class="github-link__prompt">喜欢就点个 <em>Star</em> ⭐~</span>');
    expect(markup).not.toContain("admin-floor-list");
    expect(markup).not.toContain("admin-region-list");
    expect(markup).not.toContain("admin-preset-list");
    expect(markup).toContain('class="online-presence__dot" aria-hidden="true"');
    expect(markup).toContain('aria-label="正在连接在线人数服务"');
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
