import { describe, expect, it } from "vitest";
import { DeepSeekWorkerClient, type WorkerLike } from "../agent/browser/deepseek/DeepSeekWorkerClient";
import type {
  DeepSeekWorkerRequest,
  DeepSeekWorkerResponse,
} from "../agent/browser/deepseek/protocol";
import { buildAgentPrepareRequest } from "../agent/runtime/context";
import { buildLocalPreparedOutput } from "../agent/runtime/localFallback";
import { GameSession } from "../src/domain/GameSession";
import { DEEPSEEK_RUNTIME_CONFIG } from "../src/config/runtimeConfig";

class FakeWorker implements WorkerLike {
  readonly messages: DeepSeekWorkerRequest[] = [];
  private listener: ((event: MessageEvent<DeepSeekWorkerResponse>) => void) | null = null;

  postMessage(message: DeepSeekWorkerRequest): void {
    this.messages.push(message);
    queueMicrotask(() => {
      if (message.type === "configure") {
        this.listener?.({ data: {
          type: "configured",
          requestId: message.requestId,
          models: [DEEPSEEK_RUNTIME_CONFIG.preferredModel, "deepseek-v4-pro"],
        } } as MessageEvent<DeepSeekWorkerResponse>);
      } else if (message.type === "prepare") {
        const local = buildLocalPreparedOutput(message.request);
        this.listener?.({ data: {
          type: "prepared",
          requestId: message.requestId,
          output: { ...local, source: "deepseek" },
        } } as MessageEvent<DeepSeekWorkerResponse>);
      }
    });
  }

  addEventListener(_type: "message", listener: (event: MessageEvent<DeepSeekWorkerResponse>) => void): void {
    this.listener = listener;
  }

  removeEventListener(): void { this.listener = null; }
  terminate(): void { this.listener = null; }
}

describe("DeepSeek browser BYOK client", () => {
  it("sends the key only in the one-way configure message and validates outputs", async () => {
    const worker = new FakeWorker();
    const client = new DeepSeekWorkerClient(() => worker, 1_000);
    const secret = "test-browser-credential";
    const connected = await client.connect(secret);
    expect(connected.ok).toBe(true);
    expect(client.model).toBe(DEEPSEEK_RUNTIME_CONFIG.preferredModel);
    const request = buildAgentPrepareRequest(new GameSession(null, null, "deepseek-test").snapshot());
    const prepared = await client.prepare(request);
    expect(prepared?.source).toBe("deepseek");
    expect(worker.messages[0]).toEqual(expect.objectContaining({ type: "configure", key: secret }));
    expect(JSON.stringify(worker.messages.slice(1))).not.toContain(secret);
    client.disconnect();
  });
});
