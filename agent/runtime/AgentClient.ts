import {
  parsePreparedAgentOutput,
  type AgentPrepareRequest,
  type PreparedAgentOutput,
} from "./contracts";

export interface AgentPreparationClient {
  readonly enabled: boolean;
  prepare(request: AgentPrepareRequest): Promise<PreparedAgentOutput | null>;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function loopbackAgentEndpoint(value: string | undefined): string | null {
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
