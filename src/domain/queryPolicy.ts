export type QueryValidation =
  | { ok: true; sql: string }
  | { ok: false; message: string };

const WRITE_KEYWORDS = /\b(?:insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum)\b/i;

export function validateReadOnlyQuery(input: string): QueryValidation {
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
