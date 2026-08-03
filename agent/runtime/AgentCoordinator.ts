import type { GameSnapshot } from "../../src/domain/types";
import { AgentCache } from "./AgentCache";
import type { AgentPreparationClient } from "./AgentClient";
import {
  agentRequestKey,
  buildAgentPrepareRequest,
  hasMeaningfulAgentEvidence,
} from "./context";
import type { AgentPrepareRequest, PreparedAgentOutput } from "./contracts";
import { buildLocalPreparedOutput } from "./localFallback";

export interface AgentSnapshotSource {
  subscribe(listener: (snapshot: GameSnapshot) => void): () => void;
}

export interface AgentContentSource {
  preparedFor(snapshot: GameSnapshot): PreparedAgentOutput;
  subscribe(listener: () => void): () => void;
}

interface AgentCoordinatorClock {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timerId: number): void;
}

const DEFAULT_CLOCK: AgentCoordinatorClock = {
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (timerId) => window.clearTimeout(timerId),
};

export class AgentCoordinator implements AgentContentSource {
  private readonly listeners = new Set<() => void>();
  private readonly settledKeys = new Set<string>();
  private unsubscribeSnapshot: (() => void) | null = null;
  private currentKey: string | null = null;
  private currentOutput: PreparedAgentOutput | null = null;
  private pendingRequest: AgentPrepareRequest | null = null;
  private timerId: number | null = null;
  private destroyed = false;

  constructor(
    private readonly snapshots: AgentSnapshotSource,
    private readonly cache: AgentCache,
    private readonly client: AgentPreparationClient,
    private readonly debounceMs = 600,
    private readonly clock: AgentCoordinatorClock = DEFAULT_CLOCK,
  ) {}

  start(): void {
    if (this.unsubscribeSnapshot || this.destroyed) return;
    this.unsubscribeSnapshot = this.snapshots.subscribe(
      (snapshot) => this.ingest(snapshot),
    );
  }

  preparedFor(snapshot: GameSnapshot): PreparedAgentOutput {
    const request = buildAgentPrepareRequest(snapshot);
    const key = agentRequestKey(request);
    if (this.currentKey === key && this.currentOutput) return this.currentOutput;
    return this.cache.get(request) ?? buildLocalPreparedOutput(request);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribeSnapshot?.();
    this.unsubscribeSnapshot = null;
    if (this.timerId !== null) this.clock.clearTimeout(this.timerId);
    this.timerId = null;
    this.pendingRequest = null;
    this.listeners.clear();
  }

  private ingest(snapshot: GameSnapshot): void {
    if (this.destroyed) return;
    const request = buildAgentPrepareRequest(snapshot);
    const key = agentRequestKey(request);
    if (key !== this.currentKey) {
      if (this.timerId !== null) this.clock.clearTimeout(this.timerId);
      this.timerId = null;
      this.pendingRequest = null;
      const cached = this.cache.get(request);
      this.currentKey = key;
      this.currentOutput = cached ?? buildLocalPreparedOutput(request);
      if (cached && (cached.source === "openzl" || cached.source === "deepseek")) {
        this.settledKeys.add(key);
      }
      if (!cached) this.cache.put(this.currentOutput);
      this.notify();
    }
    if (!hasMeaningfulAgentEvidence(request) || this.settledKeys.has(key)) return;
    if (snapshot.mode === "combat" || snapshot.mode === "challenge") {
      this.pendingRequest = request;
      return;
    }
    if (this.timerId !== null) return;
    this.pendingRequest = request;
    this.timerId = this.clock.setTimeout(() => {
      this.timerId = null;
      const pending = this.pendingRequest;
      this.pendingRequest = null;
      if (pending) void this.prepare(pending);
    }, this.debounceMs);
  }

  private async prepare(request: AgentPrepareRequest): Promise<void> {
    const key = agentRequestKey(request);
    if (this.settledKeys.has(key) || this.destroyed) return;
    if (!this.client.enabled) return;
    this.settledKeys.add(key);
    const output = await this.client.prepare(request);
    if (!output || this.destroyed || this.currentKey !== key) return;
    this.cache.put(output);
    this.currentOutput = output;
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  refresh(snapshot: GameSnapshot): void {
    const request = buildAgentPrepareRequest(snapshot);
    const key = agentRequestKey(request);
    this.settledKeys.delete(key);
    this.ingest(snapshot);
  }
}
