/**
 * 可选的 Python/OpenZLAgent 回环客户端。
 * 浏览器 BYOK 不经过这里；此客户端只允许连接本机服务。
 */
import {
  parsePreparedAgentOutput,
  type AgentPrepareRequest,
  type PreparedAgentOutput,
} from "./contracts";

export interface AgentPreparationClient {
  /** 模型是否可用；关闭时协调器仍使用本地确定性输出。 */
  readonly enabled: boolean;
  prepare(request: AgentPrepareRequest): Promise<PreparedAgentOutput | null>;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function loopbackAgentEndpoint(value: string | undefined): string | null {
  // 拒绝公网地址，避免把游戏证据误发到未授权的第三方服务。
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export class AgentClient implements AgentPreparationClient {
  /** 通过受限回环 HTTP 服务获取可选的抄写员措辞。 */
  private readonly endpoint: string | null;

  constructor(
    endpoint: string | undefined,
    private readonly fetcher: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = 4_000,
  ) {
    this.endpoint = loopbackAgentEndpoint(endpoint);
  }

  get enabled(): boolean {
    return this.endpoint !== null;
  }

  async prepare(request: AgentPrepareRequest): Promise<PreparedAgentOutput | null> {
    // 请求超时或解析失败统一降级为 null，由协调器保留本地输出。
    if (!this.endpoint) return null;
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return parsePreparedAgentOutput(await response.json(), request);
    } catch {
      return null;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}
