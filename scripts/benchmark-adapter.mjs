/**
 * 当前真实游戏的 Benchmark Adapter。
 *
 * 本脚本只在本地测试进程中运行：它列出游戏拥有的固定案例，或从当前 Git 工作树
 * 物化一个不含隐藏案例数据的隔离仓库。它不启动模型、不修改来源工作树，也不进入
 * `game/dist`。任何写入都限制在调用方明确给出的、尚不存在的 destination。
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const executeFile = promisify(execFile);
const ADAPTER_VERSION = 1;
const SCHEMA_VERSION = 1;
const FIXED_GIT_NAME = "Dungeon Benchmark";
const FIXED_GIT_EMAIL = "benchmark@localhost.invalid";
const FIXED_GIT_DATE = "2000-01-01T00:00:00Z";
const ADAPTER_PATH = "scripts/benchmark-adapter.mjs";
const CASE_ROOT_PATH = "benchmark/agent-evals";
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const caseRoot = join(sourceRoot, CASE_ROOT_PATH);

function fail(message) {
  throw new Error(message);
}

function normalizePath(value, label = "path") {
  const normalized = String(value).replaceAll("\\", "/").replace(/^\.\//u, "");
  if (
    normalized.length === 0
    || normalized.startsWith("/")
    || /^[A-Za-z]:\//u.test(normalized)
    || normalized.split("/").includes("..")
  ) fail(`${label} 不是安全的项目相对路径`);
  return normalized;
}

function fixtureId(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value ?? "")) {
    fail("fixture 必须是安全 ID");
  }
  return value;
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function git(args, cwd = sourceRoot, environment = {}) {
  const result = await executeFile("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout;
}

function excludedFromTarget(path) {
  const lower = path.toLowerCase();
  return path === ADAPTER_PATH
    || path === "TASK.md"
    || path === "TASK.zh-CN.md"
    || path.startsWith("benchmark/")
    || lower === ".env"
    || lower.startsWith(".env.")
    || lower.includes("/.env")
    || lower.startsWith("game/dist/")
    || lower.includes("/node_modules/");
}

async function currentSourceFiles() {
  const output = await git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  return [...new Set(output.split("\0").filter(Boolean).map((path) => normalizePath(path)))]
    .filter((path) => !excludedFromTarget(path))
    .sort();
}

async function copyCurrentSource(destination) {
  const realSourceRoot = await realpath(sourceRoot);
  for (const projectPath of await currentSourceFiles()) {
    const source = resolve(realSourceRoot, projectPath);
    const relativeSource = relative(realSourceRoot, source);
    if (relativeSource.startsWith("..") || isAbsolute(relativeSource)) {
      fail("来源文件逃逸真实游戏仓库");
    }
    const information = await lstat(source);
    if (information.isSymbolicLink() || !information.isFile()) {
      fail(`当前游戏包含不可复制的链接或特殊文件：${projectPath}`);
    }
    const target = resolve(destination, projectPath);
    const relativeTarget = relative(destination, target);
    if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
      fail("目标文件逃逸 destination");
    }
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

function benchmarkTaskContract(publicCase) {
  const prompt = String(publicCase.prompt ?? "修复公开游戏行为并保持现有安全边界。");
  const evidence = String(publicCase.evidenceSummary ?? "");
  return `# Current Task

This fixture is an isolated coding-agent target generated from the current game.
The task contract is intentionally limited to the public repair request below;
hidden reproduction and Oracle data remain outside this repository.

\`\`\`text
TASK_ID: benchmark-fixture
STATUS: ACTIVE
CONTRACT_REF: TASK.md
CONTRACT_REVISION: 1
APPROVED_REVISION: 1
APPROVAL: confirmed
ARCHITECTURE_REF: ARCHITECTURE.md
\`\`\`

## Public request

${prompt}

${evidence ? "Observed symptom: " + evidence + "\n" : ""}

## Contract

Goal: repair the public game behavior described in the user request while
preserving the existing architecture, player-visible behavior, and security
boundaries.

Scope: inspect only the smallest relevant stable area and its declared parent
services. Keep changes inside the approved game source and test paths.

Acceptance: reproduce the reported behavior, make the smallest coherent fix,
run the relevant focused tests, and leave the isolated worktree ready for the
caller to run its independent verification.

Non-goals: do not access hidden benchmark data, do not change benchmark files,
do not add credentials or dependencies, and do not rewrite unrelated areas.
`;
}

function benchmarkTaskContractZh(publicCase) {
  const prompt = String(publicCase.prompt ?? "修复公开游戏行为并保持现有安全边界。");
  const evidence = String(publicCase.evidenceSummary ?? "");
  return `# 当前任务

这是从当前真实游戏生成的隔离 Coding Agent 目标仓库。本任务只包含公开的
修复请求；隐藏复现和 Oracle 数据不会复制到此仓库。

\`\`\`text
TASK_ID: benchmark-fixture
STATUS: ACTIVE
CONTRACT_REF: TASK.md
CONTRACT_REVISION: 1
APPROVED_REVISION: 1
APPROVAL: confirmed
ARCHITECTURE_REF: ARCHITECTURE.md
\`\`\`

## 公开请求

${prompt}

${evidence ? "观察到的现象：" + evidence + "\n" : ""}

## 合同

目标：修复用户请求中描述的公开游戏行为，同时保持现有架构、玩家可见行为
和安全边界不变。

范围：只检查最小相关稳定区域及其声明的上层服务；修改限制在批准的游戏源码
和测试路径内。

验收：复现问题，完成最小一致修复，运行相关聚焦测试，并将隔离工作树交给
调用方执行独立验证。

非目标：不得访问隐藏 Benchmark 数据，不得修改 benchmark 文件，不得加入凭据
或依赖，不得重写无关区域。
`;
}

async function writeBenchmarkTaskContract(destination, publicCase) {
  await writeFile(join(destination, "TASK.md"), benchmarkTaskContract(publicCase), "utf8");
  await writeFile(join(destination, "TASK.zh-CN.md"), benchmarkTaskContractZh(publicCase), "utf8");
}

async function initializeRepository(destination) {
  await git(["init", "--quiet"], destination);
  await git(["config", "core.autocrlf", "false"], destination);
  await git(["config", "user.name", FIXED_GIT_NAME], destination);
  await git(["config", "user.email", FIXED_GIT_EMAIL], destination);
  await git(["config", "commit.gpgSign", "false"], destination);
  await git(["config", "core.hooksPath", ".git/no-hooks"], destination);
}

async function commitBugRoot(destination) {
  await git(["add", "--all", "--force", "--"], destination);
  await git([
    "commit", "--quiet", "--no-gpg-sign", "--no-verify",
    "--message", "game benchmark buggy root",
  ], destination, {
    GIT_AUTHOR_NAME: FIXED_GIT_NAME,
    GIT_AUTHOR_EMAIL: FIXED_GIT_EMAIL,
    GIT_AUTHOR_DATE: FIXED_GIT_DATE,
    GIT_COMMITTER_NAME: FIXED_GIT_NAME,
    GIT_COMMITTER_EMAIL: FIXED_GIT_EMAIL,
    GIT_COMMITTER_DATE: FIXED_GIT_DATE,
    TZ: "UTC",
  });
  return (await git(["rev-parse", "HEAD"], destination)).trim();
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} 不是有效 JSON`, { cause: error });
  }
}

async function readCase(id) {
  const safeId = fixtureId(id);
  const directory = resolve(caseRoot, safeId);
  const relativeCase = relative(caseRoot, directory);
  if (relativeCase !== safeId || isAbsolute(relativeCase)) fail("fixture 逃逸案例目录");
  const [publicCase, reproduction, expected, manifest] = await Promise.all([
    readJson(join(directory, "case.json"), "case.json"),
    readJson(join(directory, "reproduction.json"), "reproduction.json"),
    readJson(join(directory, "expected.json"), "expected.json"),
    readJson(join(directory, "fixture.json"), "fixture.json"),
  ]);
  if (
    publicCase.fixtureId !== safeId
    || reproduction.fixtureId !== safeId
    || expected.fixtureId !== safeId
    || manifest.id !== safeId
  ) fail("fixture 文件 ID 不一致");
  return { id: safeId, directory, publicCase, reproduction, expected, manifest };
}

async function catalog() {
  const ids = (await readdir(caseRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const cases = [];
  for (const id of ids) {
    const value = await readCase(id);
    cases.push(value.publicCase);
  }
  return { schemaVersion: SCHEMA_VERSION, adapterVersion: ADAPTER_VERSION, cases };
}

async function describe(id, audience) {
  const value = await readCase(id);
  if (audience === "public") {
    return {
      schemaVersion: SCHEMA_VERSION,
      adapterVersion: ADAPTER_VERSION,
      case: value.publicCase,
    };
  }
  if (audience !== "runner") fail("audience 只允许 public 或 runner");
  return {
    schemaVersion: SCHEMA_VERSION,
    adapterVersion: ADAPTER_VERSION,
    case: value.publicCase,
    reproduction: value.reproduction,
    expected: value.expected,
  };
}

async function materialize(id, destinationValue, variant) {
  const value = await readCase(id);
  if (variant !== "broken" && variant !== "clean") fail("variant 只允许 broken 或 clean");
  const destination = resolve(destinationValue ?? "");
  if (!destinationValue || dirname(destination) === destination) fail("destination 非法");
  if (await pathExists(destination)) fail("destination 必须不存在");

  const patchPath = join(value.directory, "source.patch");
  const canonicalPatch = (await readFile(patchPath, "utf8")).replace(/\r\n/gu, "\n");
  const patchSha256 = createHash("sha256").update(canonicalPatch).digest("hex");
  if (value.manifest.patchSha256 !== patchSha256) fail("source.patch Hash 与 manifest 不一致");
  const expectedDirtyPaths = [...value.manifest.dirtyPaths].map((path) => normalizePath(path)).sort();

  let created = false;
  try {
    await mkdir(destination);
    created = true;
    await copyCurrentSource(destination);
    await writeBenchmarkTaskContract(destination, value.publicCase);
    await initializeRepository(destination);
    await git(["add", "--all", "--force", "--"], destination);
    if (variant === "broken") {
      await git([
        "apply", "--ignore-space-change", "--whitespace=nowarn", "--", patchPath,
      ], destination);
      const dirtyPaths = (await git(["diff", "--name-only", "-z", "--no-renames", "--"], destination))
        .split("\0").filter(Boolean).map((path) => normalizePath(path)).sort();
      if (dirtyPaths.join("\n") !== expectedDirtyPaths.join("\n")) {
        fail("故障注入后的 dirtyPaths 与 manifest 不一致");
      }
    }
    await rm(join(destination, ".git"), { recursive: true, force: true, maxRetries: 3 });
    await initializeRepository(destination);
    const baseCommit = await commitBugRoot(destination);
    if ((await git(["status", "--porcelain"], destination)).trim()) fail("物化仓库不干净");
    if ((await git(["rev-list", "--count", "HEAD"], destination)).trim() !== "1") {
      fail("物化仓库必须只有一个 root commit");
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      adapterVersion: ADAPTER_VERSION,
      fixtureId: value.id,
      variant,
      destination,
      baseCommit,
      dirtyPaths: variant === "broken" ? expectedDirtyPaths : [],
    };
  } catch (error) {
    if (created) await rm(destination, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
    throw error;
  }
}

function parseArgs(argv) {
  const command = argv[0];
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) fail("参数必须成对提供");
    values.set(name.slice(2), value);
  }
  return { command, values };
}

async function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  let result;
  if (command === "catalog") result = await catalog();
  else if (command === "describe") {
    result = await describe(values.get("fixture"), values.get("audience") ?? "public");
  } else if (command === "materialize") {
    result = await materialize(
      values.get("fixture"),
      values.get("destination"),
      values.get("variant") ?? "broken",
    );
  } else fail("命令只允许 catalog、describe 或 materialize");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "benchmark adapter error"}\n`);
  process.exitCode = 1;
});
