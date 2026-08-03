/**
 * 浏览器端 DeepSeek 客户端：只负责和专用 Worker 通信，不接触游戏规则。
 * API Key 由 Worker 持有，页面层只能看到连接状态、模型列表和经过校验的输出。
 */
import {
  parsePreparedAgentOutput,
  type AgentPrepareRequest,
  type PreparedAgentOutput,
} from "../../runtime/contracts";
import type { AgentPreparationClient } from "../../runtime/AgentClient";
import { buildLocalCampfireOutput } from "../../runtime/localFallback";
import { DEEPSEEK_RUNTIME_CONFIG } from "../../../src/config/runtimeConfig";
import type {
  DeepSeekErrorCode,
  DeepSeekWorkerRequest,
  DeepSeekWorkerResponse,
} from "./protocol";

export interface WorkerLike {
  /** 向 Worker 发送一条不含返回通道的命令。 */
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
  /** 连接结果只暴露非敏感状态，绝不回传 Key。 */
  ok: boolean;
  models: readonly string[];
  error: DeepSeekErrorCode | null;
}

interface PendingRequest {
  /** 页面请求与 Worker 响应之间的临时等待槽位。 */
  resolve: (message: DeepSeekWorkerResponse | null) => void;
  timer: ReturnType<typeof globalThis.setTimeout>;
}

type DeepSeekWorkerCommand = DeepSeekWorkerRequest extends infer Request
  ? Request extends { requestId: number }
    ? Omit<Request, "requestId">
    : never
  : never;

function defaultWorker(): WorkerLike {
  // Worker 隔离 Key 和网络请求，页面主线程只处理结构化响应。
  return new Worker(new URL("./deepseek.worker.ts", import.meta.url), {
    type: "module",
    name: "sql-dungeon-deepseek",
  });
}

export class DeepSeekWorkerClient implements AgentPreparationClient {
  /**
   * 管理 Worker 生命周期、模型选择和超时；业务内容仍由 runtime 层准备。
   */
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
    // 每次连接先销毁旧 Worker，避免旧凭据和新凭据同时存在。
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
    // 篝火事实由本地确定性逻辑生成，模型只尝试替换抄写员措辞。
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
    // clear 命令和 terminate 双重执行，确保 Worker 内存中的凭据尽快失效。
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
    // 所有 Worker 请求都有有限等待时间，网络异常不能阻塞游戏主循环。
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
