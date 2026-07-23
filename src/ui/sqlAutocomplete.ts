export type SqlSuggestionKind = "keyword" | "function" | "table" | "column";

export interface SqlSuggestion {
  label: string;
  insertText: string;
  kind: SqlSuggestionKind;
  detail: string;
  caretOffset?: number;
}

export interface SqlCompletionResult {
  suggestions: SqlSuggestion[];
  replaceStart: number;
  replaceEnd: number;
}

interface SchemaTable {
  name: string;
  columns: string[];
}

const KEYWORD_SUGGESTIONS: SqlSuggestion[] = [
  keyword("SELECT", "选择返回字段"),
  keyword("FROM", "指定数据表"),
  keyword("WHERE", "过滤记录"),
  keyword("AND", "组合过滤条件"),
  keyword("IS NULL", "判断空值"),
  keyword("DISTINCT", "去除重复记录"),
  keyword("JOIN", "连接相关数据表"),
  keyword("LEFT JOIN", "保留左表全部记录"),
  keyword("ON", "声明表连接关系"),
  keyword("GROUP BY", "按字段聚合分组"),
  keyword("HAVING", "过滤聚合结果"),
  keyword("ORDER BY", "指定结果排序"),
  keyword("LIMIT", "限制返回行数"),
  keyword("AS", "设置字段或表别名"),
  keyword("ASC", "按升序排列"),
  keyword("DESC", "按降序排列"),
];

const FUNCTION_SUGGESTIONS: SqlSuggestion[] = [
  sqlFunction("COUNT()", "统计记录数量"),
  sqlFunction("SUM()", "汇总数值字段"),
  sqlFunction("COALESCE()", "为空值提供备用值"),
];

const RESERVED_WORDS = new Set([
  ...KEYWORD_SUGGESTIONS.flatMap((suggestion) => suggestion.label.split(/\s+/)),
  "INNER",
  "OUTER",
]);

function keyword(label: string, detail: string): SqlSuggestion {
  return {
    label,
    insertText: `${label} `,
    kind: "keyword",
    detail,
  };
}

function sqlFunction(label: string, detail: string): SqlSuggestion {
  return {
    label,
    insertText: label,
    kind: "function",
    detail,
    caretOffset: label.length - 1,
  };
}

export function parseSchemaLines(lines: readonly string[]): SchemaTable[] {
  const tables = new Map<string, Set<string>>();
  lines.forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][\w]*)\s*\(([^)]+)\)/);
    if (!match) return;
    const [, tableName, columnList] = match;
    const columns = columnList
      .split(",")
      .map((column) => column.trim().match(/^[A-Za-z_][\w]*/)?.[0] ?? "")
      .filter(Boolean);
    if (columns.length === 0) return;
    const knownColumns = tables.get(tableName) ?? new Set<string>();
    columns.forEach((column) => knownColumns.add(column));
    tables.set(tableName, knownColumns);
  });
  return [...tables].map(([name, columns]) => ({ name, columns: [...columns] }));
}

function isInsideSqlLiteralOrComment(sql: string, cursor: number): boolean {
  const beforeCursor = sql.slice(0, cursor);
  const currentLine = beforeCursor.slice(beforeCursor.lastIndexOf("\n") + 1);
  if (currentLine.includes("--")) return true;

  let quoted = false;
  for (let index = 0; index < beforeCursor.length; index += 1) {
    if (beforeCursor[index] !== "'") continue;
    if (quoted && beforeCursor[index + 1] === "'") {
      index += 1;
      continue;
    }
    quoted = !quoted;
  }
  return quoted;
}

function aliasMap(sql: string, tables: readonly SchemaTable[]): Map<string, SchemaTable> {
  const byName = new Map(tables.map((table) => [table.name.toLocaleLowerCase(), table]));
  const aliases = new Map<string, SchemaTable>();
  const relationPattern = /\b(?:FROM|JOIN)\s+([A-Za-z_][\w]*)(?:\s+(?:AS\s+)?([A-Za-z_][\w]*))?/gi;
  for (const match of sql.matchAll(relationPattern)) {
    const table = byName.get(match[1].toLocaleLowerCase());
    if (!table) continue;
    aliases.set(table.name.toLocaleLowerCase(), table);
    const alias = match[2];
    if (alias && !RESERVED_WORDS.has(alias.toLocaleUpperCase())) {
      aliases.set(alias.toLocaleLowerCase(), table);
    }
  }
  return aliases;
}

function currentToken(sql: string, cursor: number): { value: string; start: number } {
  const beforeCursor = sql.slice(0, cursor);
  const match = beforeCursor.match(/[A-Za-z_][\w]*(?:\.[A-Za-z_0-9]*)?$/);
  return match
    ? { value: match[0], start: cursor - match[0].length }
    : { value: "", start: cursor };
}

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

function contextBefore(sql: string, tokenStart: number): "table" | "value" | "start" | "any" {
  const before = sql.slice(0, tokenStart).trimEnd();
  if (!before) return "start";
  if (/\b(?:FROM|JOIN)\s*$/i.test(before)) return "table";
  if (
    /\b(?:SELECT|WHERE|AND|ON|BY|HAVING|ORDER BY|GROUP BY)\s*$/i.test(before) ||
    /,\s*$/.test(before)
  ) return "value";
  return "any";
}

function candidateScore(
  suggestion: SqlSuggestion,
  prefix: string,
  context: ReturnType<typeof contextBefore>,
): number | null {
  const query = normalized(prefix);
  const label = normalized(suggestion.label);
  const insertText = normalized(suggestion.insertText);
  const words = suggestion.label.toLocaleLowerCase().split(/\s+/);
  let score = 0;

  if (context === "table" && suggestion.kind !== "table") return null;
  if (
    context === "value" &&
    !query &&
    suggestion.kind !== "column" &&
    suggestion.kind !== "function"
  ) return null;

  if (query) {
    if (label.startsWith(query) || insertText.startsWith(query)) score += 0;
    else if (words.some((word) => word.startsWith(query))) score += 12;
    else if (label.includes(query)) score += 24;
    else return null;
  }

  if (context === "start" && !query) {
    score += suggestion.label === "SELECT" ? -80 : suggestion.kind === "keyword" ? 20 : 50;
  } else if (context === "table") {
    score += suggestion.kind === "table" ? -60 : 35;
  } else if (context === "value") {
    score += suggestion.kind === "column" ? -45 : suggestion.kind === "function" ? -30 : 20;
  }
  if (suggestion.kind === "keyword") score += 1;
  if (suggestion.kind === "function") score += 2;
  if (suggestion.kind === "table") score += 3;
  if (suggestion.kind === "column") score += 4;
  return score;
}

function schemaSuggestions(
  tables: readonly SchemaTable[],
  sql: string,
  token: string,
): SqlSuggestion[] {
  const dotIndex = token.indexOf(".");
  if (dotIndex >= 0) {
    const qualifier = token.slice(0, dotIndex);
    const table = aliasMap(sql, tables).get(qualifier.toLocaleLowerCase());
    if (!table) return [];
    return table.columns.map((column) => ({
      label: `${qualifier}.${column}`,
      insertText: `${qualifier}.${column}`,
      kind: "column",
      detail: `${table.name} · 字段`,
    }));
  }

  return [
    ...tables.map((table) => ({
      label: table.name,
      insertText: table.name,
      kind: "table" as const,
      detail: `数据表 · ${table.columns.join(", ")}`,
    })),
    ...tables.flatMap((table) => table.columns.map((column) => ({
      label: column,
      insertText: column,
      kind: "column" as const,
      detail: `${table.name} · 字段`,
    }))),
  ];
}

export function getSqlCompletions(
  sql: string,
  selectionStart: number,
  selectionEnd: number,
  schemaLines: readonly string[],
  force = false,
): SqlCompletionResult {
  const cursor = Math.max(0, Math.min(selectionStart, sql.length));
  const replaceEnd = Math.max(cursor, Math.min(selectionEnd, sql.length));
  const token = currentToken(sql, cursor);
  if (isInsideSqlLiteralOrComment(sql, cursor) || (!force && token.value.length === 0)) {
    return { suggestions: [], replaceStart: cursor, replaceEnd };
  }

  const tables = parseSchemaLines(schemaLines);
  const prefix = token.value.includes(".")
    ? token.value.slice(token.value.indexOf(".") + 1)
    : token.value;
  const context = contextBefore(sql, token.start);
  const schemaCandidates = schemaSuggestions(tables, sql, token.value);
  const candidates = token.value.includes(".")
    ? schemaCandidates
    : [
        ...KEYWORD_SUGGESTIONS,
        ...FUNCTION_SUGGESTIONS,
        ...schemaCandidates,
      ];
  const deduplicated = new Map<string, SqlSuggestion>();
  candidates.forEach((suggestion) => {
    const key = `${suggestion.kind}:${suggestion.insertText}:${suggestion.detail}`;
    if (!deduplicated.has(key)) deduplicated.set(key, suggestion);
  });

  const suggestions = [...deduplicated.values()]
    .map((suggestion) => ({
      suggestion,
      score: candidateScore(suggestion, prefix, context),
    }))
    .filter((entry): entry is { suggestion: SqlSuggestion; score: number } => (
      entry.score !== null
    ))
    .sort((left, right) => (
      left.score - right.score ||
      left.suggestion.label.localeCompare(right.suggestion.label)
    ))
    .slice(0, 8)
    .map((entry) => entry.suggestion);

  return {
    suggestions,
    replaceStart: token.start,
    replaceEnd,
  };
}

export function applySqlSuggestion(
  sql: string,
  completion: Pick<SqlCompletionResult, "replaceStart" | "replaceEnd">,
  suggestion: SqlSuggestion,
): { value: string; cursor: number } {
  const value = `${sql.slice(0, completion.replaceStart)}${suggestion.insertText}${
    sql.slice(completion.replaceEnd)
  }`;
  return {
    value,
    cursor: completion.replaceStart +
      (suggestion.caretOffset ?? suggestion.insertText.length),
  };
}

const KIND_LABELS: Record<SqlSuggestionKind, string> = {
  keyword: "KWD",
  function: "FN",
  table: "TABLE",
  column: "FIELD",
};

export class SqlAutocompleteController {
  private schemaLines: string[] = [];
  private completion: SqlCompletionResult = {
    suggestions: [],
    replaceStart: 0,
    replaceEnd: 0,
  };
  private selectedIndex = 0;
  private readonly countLabel: HTMLElement | null;

  constructor(
    private readonly textarea: HTMLTextAreaElement,
    private readonly listbox: HTMLElement,
    signal: AbortSignal,
  ) {
    this.countLabel = listbox.parentElement?.querySelector<HTMLElement>("[data-assist-count]")
      ?? null;
    textarea.setAttribute("aria-autocomplete", "list");
    textarea.setAttribute("aria-controls", listbox.id);
    textarea.setAttribute("aria-expanded", "false");
    textarea.addEventListener("input", () => this.refresh(false), { signal });
    textarea.addEventListener("click", () => this.refresh(false), { signal });
    textarea.addEventListener("keydown", (event) => this.handleKeydown(event), { signal });
    textarea.addEventListener("blur", () => {
      window.setTimeout(() => this.hide(), 80);
    }, { signal });
  }

  setSchemaLines(lines: readonly string[]): void {
    this.schemaLines = [...lines];
    if (document.activeElement === this.textarea) this.refresh(false);
  }

  hide(): void {
    this.completion = { suggestions: [], replaceStart: 0, replaceEnd: 0 };
    this.selectedIndex = 0;
    this.listbox.replaceChildren();
    this.listbox.hidden = true;
    this.textarea.setAttribute("aria-expanded", "false");
    this.textarea.removeAttribute("aria-activedescendant");
    if (this.countLabel) this.countLabel.textContent = "CTRL SPACE";
  }

  private handleKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
      event.preventDefault();
      event.stopPropagation();
      this.refresh(true);
      return;
    }
    if (this.completion.suggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      this.selectedIndex = (
        this.selectedIndex + direction + this.completion.suggestions.length
      ) % this.completion.suggestions.length;
      this.render();
      return;
    }
    if (
      (event.key === "Enter" || event.key === "Tab") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.accept(this.selectedIndex);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
    }
  }

  private refresh(force: boolean): void {
    this.completion = getSqlCompletions(
      this.textarea.value,
      this.textarea.selectionStart,
      this.textarea.selectionEnd,
      this.schemaLines,
      force,
    );
    this.selectedIndex = 0;
    this.render();
  }

  private render(): void {
    this.listbox.replaceChildren();
    if (this.completion.suggestions.length === 0) {
      this.hide();
      return;
    }
    this.listbox.hidden = false;
    this.textarea.setAttribute("aria-expanded", "true");
    if (this.countLabel) {
      this.countLabel.textContent = `${this.completion.suggestions.length} MATCHES`;
    }
    this.completion.suggestions.forEach((suggestion, index) => {
      const option = document.createElement("div");
      const id = `${this.listbox.id}-option-${index}`;
      option.id = id;
      option.className = "sql-suggestion";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === this.selectedIndex));

      const kind = document.createElement("span");
      kind.className = `sql-suggestion__kind sql-suggestion__kind--${suggestion.kind}`;
      kind.textContent = KIND_LABELS[suggestion.kind];
      const label = document.createElement("code");
      label.textContent = suggestion.label;
      const detail = document.createElement("small");
      detail.textContent = suggestion.detail;
      option.append(kind, label, detail);
      option.addEventListener("pointerdown", (event) => {
        event.preventDefault();
      });
      option.addEventListener("click", (event) => {
        event.preventDefault();
        this.accept(index);
      });
      this.listbox.append(option);
    });
    const activeId = `${this.listbox.id}-option-${this.selectedIndex}`;
    this.textarea.setAttribute("aria-activedescendant", activeId);
    const activeOption = this.listbox.querySelector<HTMLElement>(`#${activeId}`);
    if (!activeOption) return;
    if (activeOption.offsetTop < this.listbox.scrollTop) {
      this.listbox.scrollTop = activeOption.offsetTop;
    } else if (
      activeOption.offsetTop + activeOption.offsetHeight >
      this.listbox.scrollTop + this.listbox.clientHeight
    ) {
      this.listbox.scrollTop = (
        activeOption.offsetTop + activeOption.offsetHeight - this.listbox.clientHeight
      );
    }
  }

  private accept(index: number): void {
    const suggestion = this.completion.suggestions[index];
    if (!suggestion) return;
    const applied = applySqlSuggestion(this.textarea.value, this.completion, suggestion);
    this.textarea.value = applied.value;
    this.textarea.setSelectionRange(applied.cursor, applied.cursor);
    this.hide();
    this.textarea.focus({ preventScroll: true });
  }
}
