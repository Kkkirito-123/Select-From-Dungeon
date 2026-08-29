import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_LINE_COUNT = 160;
const HELP = `read-coverage.mjs - 调试游戏代码时复用已读源码范围

用法：
  node read-coverage.mjs plan --session <id> --path <path> --start-line <n> --line-count <n>
  node read-coverage.mjs record --session <id> --path <path> --start-line <n> --line-count <n>

动作：
  plan    输出 requested、alreadyRead、unread 和 fullyRead 的 JSON
  record  记录一次已经展示的范围，并输出合并后的 coverage JSON

参数：
  --repo <path>       仓库根目录，默认当前工作目录
  --session <id>      当前任务 ID；省略时依次读取 DUNGEON_MAINTAINER_TASK_ID、CODEX_THREAD_ID
  --path <path>       仓库相对文件路径
  --start-line <n>    起始行，从 1 开始
  --line-count <n>    本次范围大小，必须为 1..160

记录规则：
  截断或 EOF 不确定时只记录实际展示的连续行；明确到达 EOF 时记录原始请求范围。
  同一 session 的 plan/record 应串行调用。状态位于系统临时目录，文件 SHA-256 改变后自动失效。
`;

function positiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} 必须是 1 至 ${String(maximum)} 的整数`);
  }
  return value;
}

function toInterval(range, label) {
  const start = positiveInteger(range.startLine, `${label}.startLine`);
  const count = positiveInteger(range.lineCount, `${label}.lineCount`);
  return { start, end: start + count };
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(({ start, end }) => start < end)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const current of sorted) {
    const previous = merged.at(-1);
    if (previous && current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function toRanges(intervals) {
  return intervals.map(({ start, end }) => ({ startLine: start, lineCount: end - start }));
}

/** 计算请求范围中已经读取和仍需读取的互斥行区间。 */
export function calculateReadCoverage(requested, recorded) {
  const target = toInterval(requested, "requested");
  const alreadyReadIntervals = mergeIntervals(recorded.map((range, index) => {
    const current = toInterval(range, `recorded[${String(index)}]`);
    return {
      start: Math.max(target.start, current.start),
      end: Math.min(target.end, current.end),
    };
  }));
  const unreadIntervals = [];
  let cursor = target.start;
  for (const current of alreadyReadIntervals) {
    if (cursor < current.start) unreadIntervals.push({ start: cursor, end: current.start });
    cursor = Math.max(cursor, current.end);
  }
  if (cursor < target.end) unreadIntervals.push({ start: cursor, end: target.end });
  return {
    alreadyRead: toRanges(alreadyReadIntervals),
    unread: toRanges(unreadIntervals),
    fullyRead: unreadIntervals.length === 0,
  };
}

function safeSessionId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
    throw new Error("session 必须是 1 至 128 位安全 ID");
  }
  return value;
}

function safeProjectPath(value) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.includes("\0")) {
    throw new Error("path 必须是仓库相对路径");
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("path 包含非法路径片段");
  }
  return normalized;
}

async function identifySource(repositoryRoot, projectPath) {
  const root = await realpath(resolve(repositoryRoot));
  const target = await realpath(resolve(root, safeProjectPath(projectPath)));
  const escaped = relative(root, target);
  if (escaped === ".." || escaped.startsWith("../") || escaped.startsWith("..\\") || isAbsolute(escaped)) {
    throw new Error("path 解析后越过仓库边界");
  }
  const information = await lstat(target);
  if (!information.isFile() || information.size > MAX_FILE_BYTES) {
    throw new Error("path 必须是不超过 2 MiB 的普通文件");
  }
  return {
    root,
    path: escaped.replaceAll("\\", "/"),
    contentHash: createHash("sha256").update(await readFile(target)).digest("hex"),
  };
}

function statePath(stateRoot, repositoryRoot, sessionId) {
  const key = createHash("sha256")
    .update(repositoryRoot)
    .update("\0")
    .update(sessionId)
    .digest("hex");
  return join(stateRoot, `${key}.json`);
}

function emptyState() {
  return { schemaVersion: SCHEMA_VERSION, files: {} };
}

async function loadState(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (
      !parsed
      || typeof parsed !== "object"
      || Array.isArray(parsed)
      || parsed.schemaVersion !== SCHEMA_VERSION
      || !parsed.files
      || typeof parsed.files !== "object"
      || Array.isArray(parsed.files)
    ) return { state: emptyState(), resetReason: "state-invalid" };
    return { state: parsed, resetReason: null };
  } catch (error) {
    if (error instanceof SyntaxError) return { state: emptyState(), resetReason: "state-invalid" };
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return { state: emptyState(), resetReason: null };
    }
    throw error;
  }
}

function storedRanges(entry) {
  if (!entry || typeof entry.contentHash !== "string" || !Array.isArray(entry.intervals)) return [];
  const ranges = [];
  for (const value of entry.intervals) {
    if (
      !Array.isArray(value)
      || value.length !== 2
      || !Number.isSafeInteger(value[0])
      || !Number.isSafeInteger(value[1])
      || value[0] < 1
      || value[1] <= value[0]
    ) return [];
    ranges.push({ startLine: value[0], lineCount: value[1] - value[0] });
  }
  return ranges;
}

function storedIntervals(ranges) {
  return mergeIntervals(ranges.map((range, index) => (
    toInterval(range, `ranges[${String(index)}]`)
  ))).map(({ start, end }) => [start, end]);
}

async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function normalizeOptions(options) {
  return {
    repositoryRoot: options.repositoryRoot,
    stateRoot: options.stateRoot ?? join(tmpdir(), "debug-game-code"),
    sessionId: safeSessionId(options.sessionId),
    path: options.path,
    startLine: positiveInteger(options.startLine, "startLine"),
    lineCount: positiveInteger(options.lineCount, "lineCount", MAX_LINE_COUNT),
  };
}

export async function planReadCoverage(options) {
  const input = normalizeOptions(options);
  const source = await identifySource(input.repositoryRoot, input.path);
  const loaded = await loadState(statePath(input.stateRoot, source.root, input.sessionId));
  const entry = loaded.state.files[source.path];
  const fileChanged = Boolean(entry && entry.contentHash !== source.contentHash);
  const recorded = !fileChanged && entry?.contentHash === source.contentHash
    ? storedRanges(entry)
    : [];
  return {
    schemaVersion: SCHEMA_VERSION,
    action: "plan",
    path: source.path,
    contentHash: source.contentHash,
    requested: { startLine: input.startLine, lineCount: input.lineCount },
    ...calculateReadCoverage(
      { startLine: input.startLine, lineCount: input.lineCount },
      recorded,
    ),
    stateResetReason: fileChanged ? "file-changed" : loaded.resetReason,
  };
}

export async function recordReadCoverage(options) {
  const input = normalizeOptions(options);
  const source = await identifySource(input.repositoryRoot, input.path);
  const path = statePath(input.stateRoot, source.root, input.sessionId);
  const loaded = await loadState(path);
  const current = loaded.state.files[source.path];
  const recorded = current?.contentHash === source.contentHash ? storedRanges(current) : [];
  const next = [...recorded, { startLine: input.startLine, lineCount: input.lineCount }];
  loaded.state.files[source.path] = {
    contentHash: source.contentHash,
    intervals: storedIntervals(next),
  };
  await saveState(path, loaded.state);
  return {
    schemaVersion: SCHEMA_VERSION,
    action: "record",
    path: source.path,
    contentHash: source.contentHash,
    recorded: { startLine: input.startLine, lineCount: input.lineCount },
    coverage: storedRanges(loaded.state.files[source.path]),
    stateResetReason: current && current.contentHash !== source.contentHash
      ? "file-changed"
      : loaded.resetReason,
  };
}

function parseCli(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return null;
  const action = argv[0];
  if (action !== "plan" && action !== "record") {
    throw new Error("动作必须是 plan 或 record；使用 --help 查看完整用法");
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) {
      throw new Error("参数必须是不重复的 --name value 对");
    }
    values.set(key, value);
  }
  const known = new Set(["--repo", "--session", "--path", "--start-line", "--line-count"]);
  for (const key of values.keys()) {
    if (!known.has(key)) throw new Error(`未知参数：${key}`);
  }
  const sessionId = values.get("--session")
    ?? process.env.DUNGEON_MAINTAINER_TASK_ID
    ?? process.env.CODEX_THREAD_ID;
  const path = values.get("--path");
  if (!sessionId || !path) throw new Error("必须提供 session 和 path");
  return {
    action,
    options: {
      repositoryRoot: values.get("--repo") ?? process.cwd(),
      sessionId,
      path,
      startLine: Number(values.get("--start-line")),
      lineCount: Number(values.get("--line-count")),
    },
  };
}

async function main() {
  const parsed = parseCli(process.argv.slice(2));
  if (!parsed) {
    process.stdout.write(HELP);
    return;
  }
  const result = parsed.action === "plan"
    ? await planReadCoverage(parsed.options)
    : await recordReadCoverage(parsed.options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "read coverage 执行失败"}\n`);
    process.exitCode = 1;
  });
}
