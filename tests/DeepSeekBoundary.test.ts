/** 验证 DeepSeek BYOK Worker 的官方域名、内存密钥和浏览器安全边界。 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEEPSEEK_RUNTIME_CONFIG } from "../src/config/runtimeConfig";

describe("DeepSeek browser security boundary", () => {
  it("Worker 固定官方域名与无凭据 fetch，且不访问浏览器持久存储", async () => {
    const worker = await readFile(
      resolve("agent/browser/deepseek/deepseek.worker.ts"),
      "utf8",
    );
    expect(DEEPSEEK_RUNTIME_CONFIG.origin).toBe("https://api.deepseek.com");
    expect(DEEPSEEK_RUNTIME_CONFIG.preferredModel).toBe("deepseek-v4-flash");
    expect(worker).toContain("const DEEPSEEK_ORIGIN = DEEPSEEK_RUNTIME_CONFIG.origin");
    expect(worker).toContain('credentials: "omit"');
    expect(worker).toContain('redirect: "error"');
    expect(worker).toContain('cache: "no-store"');
    expect(worker).toContain('referrerPolicy: "no-referrer"');
    expect(worker).toContain("AbortController");
    expect(worker).toContain("JSON.stringify(scribe).includes(activeCredential)");
    expect(worker).not.toMatch(/localStorage|sessionStorage|indexedDB|console\./u);
  });

  it("部署 CSP 只允许 self 与 DeepSeek 网络目标，并禁止第三方脚本", async () => {
    const headers = await readFile(resolve("public/_headers"), "utf8");
    expect(headers).toContain("connect-src 'self' https://api.deepseek.com");
    expect(headers).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(headers).toContain("worker-src 'self'");
    expect(headers).not.toContain("unsafe-inline");
  });
});
