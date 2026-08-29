/**
 * Schema 图鉴 Panel 的局部渲染边界。
 *
 * Schema 内容来自 `src/content/sql/sqlSchema.ts`，本模块负责当前题目、字段
 * 速查和完整图鉴的局部 DOM 与交互。它不执行查询，也不推进游戏状态。
 */
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import {
  COMPLETE_RELATION_LINES,
  COMPLETE_SCHEMA_LINES,
  SQL_RELATIONS,
  SQL_TABLES,
} from "../../../content/sql/sqlSchema";
import type { SqlTableName } from "../../../content/sql/sqlSchema";
import {
  parseSchemaLines,
  type SqlAutocompleteController,
} from "../sqlAutocomplete";
import {
  schemaRenderSignature,
  schemaTaskTableRoles,
} from "../policies/appShellPolicies";

export class SchemaPanel {
  private selectedSchemaTable: SqlTableName = "monsters";
  private lastSchemaSignature: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly combatAutocomplete: SqlAutocompleteController,
  ) {}

  mount(options: AddEventListenerOptions): void {
    this.renderCompact(this.required("#terminal-schema-reference"));
    this.renderCompact(this.required("#gate-schema-reference"));
    this.renderCodex();

    const tabs = this.required("#schema-table-tabs");
    tabs.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-schema-table]",
      );
      const tableName = button?.dataset.schemaTable as SqlTableName | undefined;
      if (!tableName || !SQL_TABLES.some((table) => table.name === tableName)) return;
      this.selectTable(tableName, true);
    }, options);
    tabs.addEventListener("keydown", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-schema-table]",
      );
      const tableName = button?.dataset.schemaTable as SqlTableName | undefined;
      if (!tableName) return;
      const currentIndex = SQL_TABLES.findIndex((table) => table.name === tableName);
      if (currentIndex < 0) return;
      let nextIndex = currentIndex;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % SQL_TABLES.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + SQL_TABLES.length) % SQL_TABLES.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = SQL_TABLES.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      this.selectTable(SQL_TABLES[nextIndex].name, true);
    }, options);
  }

  render(snapshot: GameSnapshot): void {
    const signature = schemaRenderSignature(snapshot);
    if (signature === this.lastSchemaSignature) return;
    this.lastSchemaSignature = signature;
    const lines = snapshot.schema;
    this.combatAutocomplete.setSchemaLines([
      ...lines,
      ...COMPLETE_SCHEMA_LINES,
      ...COMPLETE_RELATION_LINES,
    ]);
    this.combatAutocomplete.setPreferredKeywords(snapshot.locks);

    const root = this.required("#schema-list");
    root.replaceChildren();
    const tables = parseSchemaLines(lines);
    const roles = schemaTaskTableRoles(snapshot);
    this.required("#terminal-schema-table-count").textContent = `${tables.length} TABLES`;
    this.renderCompact(this.required("#terminal-schema-reference"), lines);

    const primaryNote = document.createElement("p");
    primaryNote.className = "schema-task-note";
    const primaryTable = tables.find((table) => (
      roles.get(table.name.toLocaleLowerCase()) === "primary"
    ));
    const relatedTables = tables.filter((table) => (
      roles.get(table.name.toLocaleLowerCase()) === "related"
    ));
    primaryNote.textContent = tables.some((table) => table.name === "monsters")
      ? "怪物主表按 monsters.id 定位；monster_id 仅属于信号/装备明细表，可用于过滤明细行，也可关联 monsters.id。"
      : primaryTable
        ? `本题先读取 ${primaryTable.name}；${
          relatedTables.length > 0
            ? `需要关联 ${relatedTables.map((table) => table.name).join("、")}。`
            : "其余专用表仅作字段参考。"
        }`
        : "本题使用当前事故表字段；未参与查询的表仅作参考。";
    root.append(primaryNote);
    tables.forEach((table) => {
      const definition = SQL_TABLES.find((entry) => entry.name === table.name);
      const article = document.createElement("article");
      const roleName = roles.get(table.name.toLocaleLowerCase());
      const active = roleName !== undefined;
      article.className = active ? "schema-task-table is-active" : "schema-task-table";
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = table.name;
      const subtitle = document.createElement("span");
      subtitle.textContent = definition?.title ?? "数据表";
      const role = document.createElement("i");
      role.textContent = active
        ? roleName === "primary" ? "本题主表" : "本题关联表"
        : "字段参考";
      heading.append(title, subtitle, role);
      const fields = document.createElement("code");
      fields.textContent = table.columns.join(", ");
      article.append(heading, fields);
      root.append(article);
    });
  }

  private renderCompact(
    root: HTMLElement,
    schemaLines: readonly string[] = COMPLETE_SCHEMA_LINES,
  ): void {
    root.replaceChildren();
    parseSchemaLines(schemaLines).forEach((table) => {
      const article = document.createElement("article");
      const title = document.createElement("strong");
      title.textContent = table.name;
      const fields = document.createElement("code");
      fields.textContent = table.columns.join(", ");
      article.append(title, fields);
      root.append(article);
    });
  }

  private createBadge(
    label: string,
    kind: "primary" | "reference" | "nullability",
  ): HTMLElement {
    const badge = document.createElement("i");
    badge.dataset.kind = kind;
    badge.textContent = label;
    return badge;
  }

  /**
   * 渲染完整 Schema 图鉴。
   * 本模块只展示权威目录，不执行 SQL。
   */
  private renderCodex(): void {
    const targets = {
      tabs: this.required("#schema-table-tabs"),
      panel: this.required("#schema-table-panel"),
      trace: this.required("#schema-relation-trace"),
    };
    const selectedTable = SQL_TABLES.find(
      (table) => table.name === this.selectedSchemaTable,
    );
    if (!selectedTable) throw new Error(`未知 Schema 表：${this.selectedSchemaTable}`);
    targets.tabs.replaceChildren();
    targets.panel.replaceChildren();
    targets.trace.replaceChildren();

    SQL_TABLES.forEach((table) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `schema-tab-${table.name}`;
      button.dataset.schemaTable = table.name;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(table.name === selectedTable.name));
      button.setAttribute("aria-controls", "schema-table-panel");
      button.tabIndex = table.name === selectedTable.name ? 0 : -1;
      button.textContent = table.name;
      targets.tabs.append(button);
    });

    targets.panel.setAttribute("aria-labelledby", `schema-tab-${selectedTable.name}`);
    const heading = document.createElement("div");
    heading.className = "schema-table-heading";
    const title = document.createElement("strong");
    title.textContent = selectedTable.name;
    const subtitle = document.createElement("span");
    subtitle.textContent = selectedTable.title;
    heading.append(title, subtitle);

    const description = document.createElement("p");
    description.textContent = selectedTable.description;
    const columnList = document.createElement("div");
    columnList.className = "schema-column-list";
    selectedTable.columns.forEach((column) => {
      const relation = SQL_RELATIONS.find((entry) => (
        entry.fromTable === selectedTable.name && entry.fromColumn === column.name
      ));
      const row = document.createElement("div");
      row.className = "schema-column-row";
      const name = document.createElement("code");
      name.textContent = column.name;
      const type = document.createElement("span");
      type.className = "schema-column-type";
      type.textContent = column.type;
      const badges = document.createElement("span");
      badges.className = "schema-column-badges";
      if (column.primaryKey) badges.append(this.createBadge("PK", "primary"));
      if (relation) badges.append(this.createBadge("REF", "reference"));
      badges.append(this.createBadge(
        column.nullable ? "NULL" : "NOT NULL",
        "nullability",
      ));
      const detail = document.createElement("small");
      detail.textContent = relation
        ? `${column.description} → ${relation.toTable}.${relation.toColumn}`
        : column.description;
      row.append(name, type, badges, detail);
      columnList.append(row);
    });
    targets.panel.append(heading, description, columnList);

    const relationTitle = document.createElement("strong");
    relationTitle.textContent = "RELATION TRACE / 关系追踪";
    targets.trace.append(relationTitle);
    SQL_RELATIONS
      .filter((relation) => (
        relation.fromTable === selectedTable.name ||
        relation.toTable === selectedTable.name
      ))
      .forEach((relation) => {
        const line = document.createElement("code");
        line.textContent = `${relation.fromTable}.${relation.fromColumn} → ${
          relation.toTable
        }.${relation.toColumn} · ${relation.description}`;
        targets.trace.append(line);
      });
  }

  private selectTable(tableName: SqlTableName, focus: boolean): void {
    this.selectedSchemaTable = tableName;
    this.renderCodex();
    if (!focus) return;
    this.required<HTMLButtonElement>(`#schema-tab-${tableName}`).focus({
      preventScroll: true,
    });
  }

  private required<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`缺少 Schema 界面元素：${selector}`);
    return element;
  }
}
