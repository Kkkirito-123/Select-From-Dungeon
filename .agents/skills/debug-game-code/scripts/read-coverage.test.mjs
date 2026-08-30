import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  calculateReadCoverage,
  planReadCoverage,
  recordReadCoverage,
} from "./read-coverage.mjs";

const executeFile = promisify(execFile);
const scriptPath = fileURLToPath(new URL("./read-coverage.mjs", import.meta.url));

describe("read coverage", () => {
  it("合并重叠和相邻范围并返回未读补集", () => {
    assert.deepEqual(calculateReadCoverage(
      { startLine: 10, lineCount: 20 },
      [
        { startLine: 1, lineCount: 11 },
        { startLine: 12, lineCount: 4 },
        { startLine: 20, lineCount: 5 },
        { startLine: 24, lineCount: 20 },
      ],
    ), {
      alreadyRead: [
        { startLine: 10, lineCount: 6 },
        { startLine: 20, lineCount: 10 },
      ],
      unread: [{ startLine: 16, lineCount: 4 }],
      fullyRead: false,
    });
  });

  it("按会话和文件 Hash 隔离持久覆盖", async () => {
    const root = await mkdtemp(join(tmpdir(), "debug-game-code-test-"));
    const stateRoot = join(root, "state");
    const source = join(root, "source.ts");
    try {
      await writeFile(source, "one\ntwo\nthree\nfour\nfive\nsix\n", "utf8");
      const common = {
        repositoryRoot: root,
        stateRoot,
        path: "source.ts",
        startLine: 1,
        lineCount: 6,
      };
      await recordReadCoverage({ ...common, sessionId: "task-a", lineCount: 3 });

      const sameSession = await planReadCoverage({ ...common, sessionId: "task-a" });
      assert.deepEqual(sameSession.alreadyRead, [{ startLine: 1, lineCount: 3 }]);
      assert.deepEqual(sameSession.unread, [{ startLine: 4, lineCount: 3 }]);

      await recordReadCoverage({
        ...common,
        sessionId: "task-a",
        startLine: 4,
        lineCount: 3,
      });
      const fullyRead = await planReadCoverage({ ...common, sessionId: "task-a" });
      assert.equal(fullyRead.fullyRead, true);
      assert.deepEqual(fullyRead.alreadyRead, [{ startLine: 1, lineCount: 6 }]);

      const otherSession = await planReadCoverage({ ...common, sessionId: "task-b" });
      assert.deepEqual(otherSession.unread, [{ startLine: 1, lineCount: 6 }]);

      await writeFile(source, "changed\ntwo\nthree\nfour\nfive\nsix\n", "utf8");
      const changed = await planReadCoverage({ ...common, sessionId: "task-a" });
      assert.equal(changed.stateResetReason, "file-changed");
      assert.deepEqual(changed.unread, [{ startLine: 1, lineCount: 6 }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("拒绝越过仓库的路径", async () => {
    const root = await mkdtemp(join(tmpdir(), "debug-game-code-path-test-"));
    try {
      await assert.rejects(planReadCoverage({
        repositoryRoot: root,
        stateRoot: join(root, "state"),
        sessionId: "task-path",
        path: "../outside.ts",
        startLine: 1,
        lineCount: 1,
      }), /非法路径片段/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("CLI help 说明动作、范围上限和 EOF 记录规则", async () => {
    const result = await executeFile(process.execPath, [scriptPath, "--help"], {
      encoding: "utf8",
    });
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /plan/u);
    assert.match(result.stdout, /record/u);
    assert.match(result.stdout, /1\.\.160/u);
    assert.match(result.stdout, /EOF/u);
  });

  it("plan 和 record 拒绝超出单次读取上限的范围", async () => {
    const root = await mkdtemp(join(tmpdir(), "debug-game-code-limit-test-"));
    try {
      await writeFile(join(root, "source.ts"), "one\n", "utf8");
      const common = {
        repositoryRoot: root,
        stateRoot: join(root, "state"),
        sessionId: "task-limit",
        path: "source.ts",
        startLine: 1,
      };
      await assert.rejects(
        planReadCoverage({ ...common, lineCount: 0 }),
        /1 至 160/u,
      );
      await assert.rejects(
        planReadCoverage({ ...common, lineCount: 161 }),
        /1 至 160/u,
      );
      await assert.rejects(
        recordReadCoverage({ ...common, lineCount: 0 }),
        /1 至 160/u,
      );
      await assert.rejects(
        recordReadCoverage({ ...common, lineCount: 161 }),
        /1 至 160/u,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("明确到达 EOF 后可记录完整请求范围", async () => {
    const root = await mkdtemp(join(tmpdir(), "debug-game-code-eof-test-"));
    try {
      await writeFile(join(root, "source.ts"), "one\ntwo\nthree\n", "utf8");
      const options = {
        repositoryRoot: root,
        stateRoot: join(root, "state"),
        sessionId: "task-eof",
        path: "source.ts",
        startLine: 1,
        lineCount: 160,
      };
      await recordReadCoverage(options);
      const planned = await planReadCoverage(options);
      assert.equal(planned.fullyRead, true);
      assert.deepEqual(planned.unread, []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
