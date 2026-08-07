/**
 * Schema 图鉴 Panel 的局部渲染边界。
 *
 * Schema 内容来自 `src/content/sql/sqlSchema.ts`，本模块只负责把已经解析的
 * 字段目录绘制成 compact reference，并提供统一的字段徽章节点工厂。它不
 * 执行查询，也不决定当前课程需要哪些字段。
 */
import type {
  SqlRelationDefinition,
  SqlTableDefinition,
  SqlTableName,
} from "../../../content/sql/sqlSchema";

interface SchemaTableSummary {
  name: string;
  columns: readonly string[];
}

export interface SchemaCodexTargets {
  tabs: HTMLElement;
  panel: HTMLElement;
  trace: HTMLElement;
}

export class SchemaPanel {
  renderCompact(root: HTMLElement, tables: readonly SchemaTableSummary[]): void {
    root.replaceChildren();
    tables.forEach((table) => {
      const article = document.createElement("article");
      const title = document.createElement("strong");
      title.textContent = table.name;
      const fields = document.createElement("code");
      fields.textContent = table.columns.join(", ");
      article.append(title, fields);
      root.append(article);
    });
  }

  createBadge(
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
   * DOM 节点由 AppShell 绑定后传入；本模块只展示权威目录，不执行 SQL。
   */
  renderCodex(
    targets: SchemaCodexTargets,
    tables: readonly SqlTableDefinition[],
    relations: readonly SqlRelationDefinition[],
    selectedTableName: SqlTableName,
  ): void {
    const selectedTable = tables.find((table) => table.name === selectedTableName);
    if (!selectedTable) throw new Error(`未知 Schema 表：${selectedTableName}`);
    targets.tabs.replaceChildren();
    targets.panel.replaceChildren();
    targets.trace.replaceChildren();

    tables.forEach((table) => {
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
      const relation = relations.find((entry) => (
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
    relations
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
}
