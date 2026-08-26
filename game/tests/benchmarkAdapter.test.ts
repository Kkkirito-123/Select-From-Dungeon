import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const adapter = join(repositoryRoot, "scripts", "benchmark-adapter.mjs");
const temporaryRoots: string[] = [];

async function runAdapter(args: string[]): Promise<Record<string, unknown>> {
  const result = await executeFile(process.execPath, [adapter, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (path) => {
    await rm(path, { recursive: true, force: true, maxRetries: 3 });
  }));
});

describe("game-owned Benchmark Adapter", () => {
  it("只通过版本化 catalog 暴露 12 个公开案例", async () => {
    const result = await runAdapter(["catalog"]);
    expect(result.schemaVersion).toBe(1);
    expect(result.adapterVersion).toBe(1);
    const cases = result.cases as Array<Record<string, unknown>>;
    expect(cases).toHaveLength(12);
    expect(cases.map((entry) => entry.fixtureId)).toContain("terminal-action-bug");
    expect(JSON.stringify(result)).not.toContain("secretInputs");
    expect(JSON.stringify(result)).not.toContain("beforeOracle");
  });

  it("仅向 runner 返回复现和隐藏判卷数据", async () => {
    const publicResult = await runAdapter([
      "describe", "--fixture", "terminal-action-bug", "--audience", "public",
    ]);
    expect(publicResult).toHaveProperty("case.fixtureId", "terminal-action-bug");
    expect(publicResult).not.toHaveProperty("reproduction");
    expect(publicResult).not.toHaveProperty("expected");

    const runnerResult = await runAdapter([
      "describe", "--fixture", "terminal-action-bug", "--audience", "runner",
    ]);
    expect(runnerResult).toHaveProperty("reproduction.fixtureId", "terminal-action-bug");
    expect(runnerResult).toHaveProperty("expected.fixtureId", "terminal-action-bug");
  });

  it("全部公开案例都能通过 runner manifest 与补丁 Hash 校验", async () => {
    const catalog = await runAdapter(["catalog"]);
    const cases = catalog.cases as Array<{ fixtureId: string }>;
    for (const entry of cases) {
      const result = await runAdapter([
        "describe", "--fixture", entry.fixtureId, "--audience", "runner",
      ]);
      expect(result).toHaveProperty("case.fixtureId", entry.fixtureId);
      expect(result).toHaveProperty("reproduction.fixtureId", entry.fixtureId);
      expect(result).toHaveProperty("expected.fixtureId", entry.fixtureId);
    }
  });

  it("从当前游戏物化单提交 Bug 仓库且不复制隐藏案例", async () => {
    const parent = await mkdtemp(join(tmpdir(), "game-benchmark-adapter-test-"));
    temporaryRoots.push(parent);
    const destination = join(parent, "repository");
    const result = await runAdapter([
      "materialize",
      "--fixture", "accepted-query-without-progress",
      "--destination", destination,
      "--variant", "broken",
    ]);
    expect(result.fixtureId).toBe("accepted-query-without-progress");
    expect(result.dirtyPaths).toEqual(["game/src/domain/session/combat/resolveCombatHit.ts"]);
    await expect(readFile(join(destination, "benchmark", "agent-evals", "accepted-query-without-progress", "expected.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(destination, "scripts", "benchmark-adapter.mjs")))
      .rejects.toMatchObject({ code: "ENOENT" });
    const task = await readFile(join(destination, "TASK.md"), "utf8");
    expect(task).toContain("STATUS: ACTIVE");
    expect(task).toContain("TASK_ID: benchmark-fixture");
    expect(task).not.toContain("beforeOracle");
    expect(task).not.toContain("expected");
    await expect(readFile(join(destination, "TASK.zh-CN.md"), "utf8"))
      .resolves.toContain("STATUS: ACTIVE");
    const source = await readFile(
      join(destination, "game", "src", "domain", "session", "combat", "resolveCombatHit.ts"),
      "utf8",
    );
    expect(source).toContain("return currentSuccessStep;");
    const count = await executeFile("git", ["rev-list", "--count", "HEAD"], {
      cwd: destination,
      encoding: "utf8",
      windowsHide: true,
    });
    expect(count.stdout.trim()).toBe("1");
    const status = await executeFile("git", ["status", "--porcelain"], {
      cwd: destination,
      encoding: "utf8",
      windowsHide: true,
    });
    expect(status.stdout).toBe("");
  }, 60_000);
});
