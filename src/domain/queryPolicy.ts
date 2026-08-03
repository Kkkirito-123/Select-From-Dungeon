/**
 * SQL 输入策略。
 * 先在文本层拒绝危险语句，再交给 SQLite；第六层写操作只允许进入一次性沙箱。
 */
export type QueryValidation =
  | { ok: true; sql: string }
  | { ok: false; message: string };

export type SandboxValidation =
  | { ok: true; sql: string; statements: string[] }
  | { ok: false; message: string };

const WRITE_KEYWORDS = /\b(?:insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum)\b/i;
const FORBIDDEN_SANDBOX_KEYWORDS =
  /\b(?:drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|analyze)\b/i;
const PERMANENT_TABLES =
  /\b(?:monsters|monster_signals|rooms|monster_gear|sqlite_master)\b/i;

function splitSandboxStatements(input: string): string[] | null {
  // 按引号和括号边界拆分脚本，不能把字符串中的分号误判为新语句。
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
        current += " ";
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
        current += " ";
      }
      continue;
    }
    if (!quote && character === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (!quote && character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    if (character === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      continue;
    }
    current += character;
  }
  if (quote || blockComment) return null;
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function maskQuotedContent(input: string): string {
  // 用占位符屏蔽字符串内容，只分析关键字结构而不改变原始 SQL。
  let masked = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (!quote) {
      if (character === "'" || character === '"') {
        quote = character;
        masked += " ";
      } else {
        masked += character;
      }
      continue;
    }
    masked += " ";
    if (character !== quote) continue;
    if (next === quote) {
      masked += " ";
      index += 1;
    } else {
      quote = null;
    }
  }
  return masked;
}

export function validateReadOnlyQuery(input: string): QueryValidation {
  // 只接受单条 SELECT/WITH，并拒绝 DDL、DML、PRAGMA 和多语句输入。
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: "先写一条 SELECT 查询。" };
  }

  const withoutTrailingSemicolon = trimmed.replace(/;+\s*$/, "").trim();
  if (withoutTrailingSemicolon.includes(";")) {
    return { ok: false, message: "每回合只允许执行一条 SQL。" };
  }

  if (!/^(?:select\b|with(?:\s+recursive)?\b)/i.test(withoutTrailingSemicolon)) {
    return { ok: false, message: "战斗终端只开放只读 SELECT 或 WITH 查询。" };
  }

  if (WRITE_KEYWORDS.test(withoutTrailingSemicolon)) {
    return { ok: false, message: "检测到修改数据库的关键字，本回合已阻止。" };
  }

  return { ok: true, sql: withoutTrailingSemicolon };
}

export function validateSandboxScript(input: string): SandboxValidation {
  // 第六层只允许 repair_queue 上带 WHERE 的有限写操作。
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: "先写出本回合的沙箱 SQL。" };
  }
  const statements = splitSandboxStatements(trimmed);
  if (!statements) {
    return { ok: false, message: "SQL 字符串、标识符或注释没有正确闭合。" };
  }
  if (statements.length === 0 || statements.length > 8) {
    return { ok: false, message: "事务沙箱每回合允许 1 到 8 条受控语句。" };
  }

  for (const statement of statements) {
    const structuralSql = maskQuotedContent(statement);
    if (
      FORBIDDEN_SANDBOX_KEYWORDS.test(structuralSql) ||
      PERMANENT_TABLES.test(structuralSql)
    ) {
      return {
        ok: false,
        message: "沙箱只允许操作一次性 repair_queue，永久表和结构语句已阻止。",
      };
    }
    const allowed = [
      /^begin(?:\s+transaction)?$/i,
      /^(?:commit|end)(?:\s+transaction)?$/i,
      /^rollback(?:\s+transaction)?$/i,
      /^rollback\s+to(?:\s+savepoint)?\s+[a-z_]\w*$/i,
      /^savepoint\s+[a-z_]\w*$/i,
      /^release(?:\s+savepoint)?\s+[a-z_]\w*$/i,
      /^insert(?:\s+or\s+ignore)?\s+into\s+repair_queue\b[\s\S]*$/i,
      /^update\s+repair_queue\s+set\b[\s\S]*\bwhere\b[\s\S]+$/i,
      /^delete\s+from\s+repair_queue\s+where\b[\s\S]+$/i,
      /^select\b[\s\S]*\bfrom\s+repair_queue\b[\s\S]*$/i,
    ].some((pattern) => pattern.test(structuralSql));
    if (!allowed) {
      return {
        ok: false,
        message: "只允许受控 INSERT、带 WHERE 的 UPDATE/DELETE、repair_queue 查询和事务控制语句。",
      };
    }
    if (
      /^(?:update|delete)\b/i.test(structuralSql) &&
      !/\bwhere\b[\s\S]*\b(?:repair_queue\s*\.\s*)?id\s*=\s*\d+\b/i.test(structuralSql)
    ) {
      return {
        ok: false,
        message: "UPDATE / DELETE 必须用 id = 整数精确限定目标行。",
      };
    }
  }

  return {
    ok: true,
    sql: statements.join("; "),
    statements,
  };
}
