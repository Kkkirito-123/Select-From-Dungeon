import {
  parsePreparedAgentOutput,
  type AgentPrepareRequest,
  type PreparedAgentOutput,
} from "../../runtime/contracts";
import type { AgentPreparationClient } from "../../runtime/AgentClient";
import { buildLocalCampfireOutput } from "../../runtime/localFallback";
import { DEEPSEEK_RUNTIME_CONFIG } from "../../../src/application/config/runtimeConfig";
import type {
  DeepSeekErrorCode,
  DeepSeekWorkerRequest,
  DeepSeekWorkerResponse,
} from "./protocol";

export interface WorkerLike {
  postMessage(message: DeepSeekWorkerRequest): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<DeepSeekWorkerResponse>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<DeepSeekWorkerResponse>) => void,
  ): void;
  terminate(): void;
}

export interface DeepSeekConnectionResult {
  ok: boolean;
  models: readonly string[];
  error: DeepSeekErrorCode | null;
}

interface PendingRequest {
  resolve: (message: DeepSeekWorkerResponse | null) => void;
  timer: ReturnType<typeof globalThis.setTimeout>;
}

type DeepSeekWorkerCommand = DeepSeekWorkerRequest extends infer Request
  ? Request extends { requestId: number }
    ? Omit<Request, "requestId">
    : never
  : never;

function defaultWorker(): WorkerLike {
  return new Worker(new URL("./deepseek.worker.ts", import.meta.url), {
    type: "module",
    name: "sql-dungeon-deepseek",
  });
}

export class DeepSeekWorkerClient implements AgentPreparationClient {
  private worker: WorkerLike | null = null;
  private sequence = 0;
  private configured = false;
  private selectedModel: string | null = null;
  private models: string[] = [];
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listener = (event: MessageEvent<DeepSeekWorkerResponse>): void => {
    const request = this.pending.get(event.data.requestId);
    if (!request) return;
    this.pending.delete(event.data.requestId);
    globalThis.clearTimeout(request.timer);
    request.resolve(event.data);
  };

  constructor(
    private readonly workerFactory: () => WorkerLike = defaultWorker,
    private readonly timeoutMs: number = DEEPSEEK_RUNTIME_CONFIG.requestTimeoutMs,
  ) {}

  get enabled(): boolean {
    return this.configured && this.selectedModel !== null;
  }

  get availableModels(): readonly string[] {
    return this.models;
  }

  get model(): string | null {
    return this.selectedModel;
  }

  async connect(key: string, preferredModel?: string | null): Promise<DeepSeekConnectionResult> {
    this.disconnect();
    const message = await this.send({ type: "configure", key });
    if (!message || message.type === "error") {
      this.disconnect();
      return {
        ok: false,
        models: [],
        error: message?.type === "error" ? message.code : "provider-unavailable",
      };
    }
    if (message.type !== "configured") {
      this.disconnect();
      return { ok: false, models: [], error: "invalid-response" };
    }
    this.models = [...message.models];
    this.selectedModel = preferredModel && this.models.includes(preferredModel)
      ? preferredModel
      : this.models.includes(DEEPSEEK_RUNTIME_CONFIG.preferredModel)
        ? DEEPSEEK_RUNTIME_CONFIG.preferredModel
        : this.models.find((model) => model.includes("flash")) ?? this.models[0] ?? null;
    this.configured = this.selectedModel !== null;
    return { ok: this.configured, models: this.models, error: null };
  }

  selectModel(model: string): boolean {
    if (!this.configured || !this.models.includes(model)) return false;
    this.selectedModel = model;
    return true;
  }

  async prepare(request: AgentPrepareRequest): Promise<PreparedAgentOutput | null> {
    if (!this.enabled || !this.selectedModel) return null;
    const message = await this.send({
      type: "prepare",
      model: this.selectedModel,
      request,
      campfire: buildLocalCampfireOutput(request),
    });
    if (!message || message.type !== "prepared") return null;
    return parsePreparedAgentOutput(message.output, request);
  }

  disconnect(): void {
    this.configured = false;
    this.selectedModel = null;
    this.models = [];
    if (!this.worker) return;
    const worker = this.worker;
    worker.postMessage({ type: "clear", requestId: ++this.sequence });
    worker.removeEventListener("message", this.listener);
    worker.terminate();
    this.worker = null;
    this.pending.forEach((request) => {
      globalThis.clearTimeout(request.timer);
      request.resolve(null);
    });
    this.pending.clear();
  }

  destroy(): void {
    this.disconnect();
  }

  private ensureWorker(): WorkerLike {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.worker.addEventListener("message", this.listener);
    }
    return this.worker;
  }

  private send(
    value: DeepSeekWorkerCommand,
  ): Promise<DeepSeekWorkerResponse | null> {
    const requestId = ++this.sequence;
    return new Promise((resolve) => {
      const timer = globalThis.setTimeout(() => {
        this.pending.delete(requestId);
        resolve(null);
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, timer });
      this.ensureWorker().postMessage({ ...value, requestId } as DeepSeekWorkerRequest);
    });
  }
}
