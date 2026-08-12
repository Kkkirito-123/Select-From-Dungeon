import { createActor, fromPromise, setup } from "xstate";
import type { CampfireAgentContent, CampfireView } from "../../contracts/agent/campfireReview";
import type {
  AgentEvent, AgentGatewayPort, AgentResponse, AgentRoleContext,
  AgentSource, AgentTokens, AgentView,
} from "../../contracts/agent/main";
import type { ScribeAgentContent, ScribePrompt } from "../../contracts/agent/scribe";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import { buildCampfireReview, campfireReviewInput } from "../../domain/learning/campfireReview";
import { agentCacheKey, agentComposePayload, guidanceFor } from "../../infrastructure/agent/AgentGateway";
import { stableJson } from "../../infrastructure/agent/protocol";
import { inCampfireRange } from "../triggers/policy";
import type { Trigger } from "../triggers/events";
import { AgentCache } from "./AgentCache";
import { campfireView } from "./campfireView";
import {
  deathPrompt, interactionPrompt, localScribeContent, navigationPrompt,
} from "./scribeView";

export type AgentPhase = "idle" | "dirty" | "running" | "ready" | "local";
type UsageMode = "MODEL" | "CACHE" | "LOCAL";

export interface AgentUsageState extends AgentTokens {
  mode: UsageMode;
  pageInput: number;
  pageOutput: number;
  pageTotal: number;
}
export interface AgentRuntimeState {
  phases: { campfire: AgentPhase; scribe: AgentPhase; main: AgentPhase };
  floor: number | null;
  event: AgentEvent | null;
  source: AgentSource | null;
  requestKey: string | null;
  guidance: string;
  streamKey: string | null;
  campfire: { requestKey: string | null; content: CampfireAgentContent | null };
  scribe: { requestKey: string | null; scene: ScribePrompt["scene"] | null; content: ScribeAgentContent | null };
  usage: AgentUsageState;
  logs: readonly string[];
}
type RoleContent = CampfireAgentContent | ScribeAgentContent;
interface ActiveRole { key: string; floor: number; evidenceHash: string }
interface JobBase {
  source: AgentSource; event: AgentEvent; floor: number; requestKey: string;
  local: RoleContent; serial: number; owner: boolean;
}
interface CampfireJob extends JobBase { source: "campfire"; evidence: CampfireView; local: CampfireAgentContent }
interface ScribeJob extends JobBase { source: "scribe"; evidence: ScribePrompt; local: ScribeAgentContent }
type Job = CampfireJob | ScribeJob;
interface Outcome { job: Job; response: AgentResponse; roleKey: string; mainKey: string; mode: "remote" | "cache" | "local" }
type MachineEvent =
  | { type: "RUN_CAMPFIRE"; job: CampfireJob }
  | { type: "RUN_SCRIBE"; job: ScribeJob }
  | { type: "ANSWER" }
  | { type: "FLOOR" }
  | { type: "MAIN_DONE"; status: "ready" | "fallback" }
  | { type: "MAIN_CANCEL"; hasContent: boolean };
const CAMPFIRE_EVENTS = {
  RUN_CAMPFIRE: "#campfire.running",
  ANSWER: "#campfire.dirty",
  FLOOR: "#campfire.idle",
} as const;
const SCRIBE_EVENTS = { RUN_SCRIBE: "#scribe.running", FLOOR: "#scribe.idle" } as const;
const MAIN_EVENTS = {
  RUN_CAMPFIRE: { guard: "ownsPanel", target: "#main.running" },
  RUN_SCRIBE: { guard: "ownsPanel", target: "#main.running" },
  FLOOR: "#main.idle",
} as const;
const campfireRest = { on: CAMPFIRE_EVENTS } as const;
const scribeRest = { on: SCRIBE_EVENTS } as const;
const mainRest = { on: MAIN_EVENTS } as const;

const PRIORITY: Record<AgentEvent, number> = {
  "scribe-interaction": 80,
  "death-review": 70,
  "campfire-review": 60,
  navigation: 50,
};
function eventFor(prompt: ScribePrompt): AgentEvent {
  return prompt.scene === "interaction" ? "scribe-interaction" : prompt.scene;
}

function localResponse(view: AgentView, content: RoleContent, composeHash: string): AgentResponse {
  const fallbackCall = (agent: AgentSource | "main") => ({
    agent, mode: "local" as const, status: "fallback" as const, ms: 0,
    tokens: { input: 0, output: 0, total: 0 },
  });
  return {
    schemaVersion: 1,
    requestId: "local",
    composeHash,
    floor: view.floor,
    event: view.event,
    changedSource: view.changedSource,
    child: { source: view.changedSource, evidenceHash: view.changed.evidenceHash, status: "fallback", content },
    main: { status: "fallback", guidance: guidanceFor(content) },
    meta: { traceId: null, ms: 0, calls: [fallbackCall(view.changedSource), fallbackCall("main")] },
  };
}

export class AgentRuntime {
  private readonly cache: AgentCache;
  private readonly listeners = new Set<(state: AgentRuntimeState) => void>();
  private readonly dirtyFloors = new Set<number>();
  private activeCampfire: ActiveRole | null = null;
  private activeScribe: ActiveRole | null = null;
  private serial = 0;
  private panel: { serial: number; priority: number; source: AgentSource; pending: boolean } | null = null;
  private logId = 0;
  private destroyed = false;
  private campfireJob: CampfireJob | null = null;
  private scribeJob: ScribeJob | null = null;
  private view: Omit<AgentRuntimeState, "phases"> = {
    floor: null,
    event: null,
    source: null,
    requestKey: null,
    guidance: "完成一次调查或进入篝火后，这里会整理当前记录。",
    streamKey: null,
    campfire: { requestKey: null, content: null },
    scribe: { requestKey: null, scene: null, content: null },
    usage: { mode: "LOCAL", input: 0, output: 0, total: 0, pageInput: 0, pageOutput: 0, pageTotal: 0 },
    logs: [],
  };

  private readonly machine = setup({
    types: {} as { context: Record<string, never>; events: MachineEvent },
    actors: {
      campfire: fromPromise<Outcome, CampfireJob>(({ input, signal }) => this.execute(input, signal)),
      scribe: fromPromise<Outcome, ScribeJob>(({ input, signal }) => this.execute(input, signal)),
    },
    actions: {
      accept: ({ event, self }) => {
        const output = (event as unknown as { output: Outcome }).output;
        if (this.accept(output)) {
          self.send({ type: "MAIN_DONE", status: output.response.main.status });
        }
      },
    },
    guards: {
      ownsPanel: ({ event }) => "job" in event && event.job.owner,
    },
  }).createMachine({
    type: "parallel",
    context: {},
    states: {
      campfire: {
        id: "campfire",
        initial: "idle",
        states: {
          idle: campfireRest,
          dirty: campfireRest,
          ready: campfireRest,
          local: campfireRest,
          running: {
            on: {
              RUN_CAMPFIRE: { target: "#campfire.running", reenter: true },
              ANSWER: "#campfire.dirty",
              FLOOR: "#campfire.idle",
            },
            invoke: {
              id: "campfire",
              src: "campfire",
              input: () => this.campfireJob!,
              onDone: [
                { guard: ({ event }) => event.output.response.child.status === "ready", target: "#campfire.ready", actions: "accept" },
                { target: "#campfire.local", actions: "accept" },
              ],
            },
          },
        },
      },
      scribe: {
        id: "scribe",
        initial: "idle",
        states: {
          idle: scribeRest,
          ready: scribeRest,
          local: scribeRest,
          running: {
            on: {
              RUN_SCRIBE: { target: "#scribe.running", reenter: true },
              FLOOR: "#scribe.idle",
            },
            invoke: {
              id: "scribe",
              src: "scribe",
              input: () => this.scribeJob!,
              onDone: [
                { guard: ({ event }) => event.output.response.child.status === "ready", target: "#scribe.ready", actions: "accept" },
                { target: "#scribe.local", actions: "accept" },
              ],
            },
          },
        },
      },
      main: {
        id: "main",
        initial: "idle",
        states: {
          idle: mainRest,
          running: {
            on: {
              RUN_CAMPFIRE: { guard: "ownsPanel", target: "#main.running", reenter: true },
              RUN_SCRIBE: { guard: "ownsPanel", target: "#main.running", reenter: true },
              MAIN_DONE: [
                { guard: ({ event }) => event.status === "ready", target: "#main.ready" },
                { target: "#main.local" },
              ],
              MAIN_CANCEL: [
                { guard: ({ event }) => event.hasContent, target: "#main.ready" },
                { target: "#main.idle" },
              ],
              FLOOR: "#main.idle",
            },
          },
          ready: mainRest,
          local: mainRest,
        },
      },
    },
  });

  private readonly actor = createActor(this.machine);
  private readonly actorSubscription;

  constructor(
    private readonly gateway: AgentGatewayPort,
    now: () => number = () => Date.now(),
  ) {
    this.cache = new AgentCache(now);
    this.actorSubscription = this.actor.subscribe(() => {
      const state = this.getState();
      this.listeners.forEach((listener) => listener(state));
    });
    this.actor.start();
  }

  handle(event: Trigger): void {
    if (this.destroyed) return;
    if (event.type === "answer") {
      this.dirtyFloors.add(event.snapshot.floor);
      this.activeCampfire = null;
      if (this.panel?.pending && this.panel.source === "campfire") {
        this.panel.pending = false;
        this.actor.send({ type: "MAIN_CANCEL", hasContent: this.view.requestKey !== null });
      }
      this.actor.send({ type: "ANSWER" });
      if (event.snapshot.campfires.some((item) => inCampfireRange(event.snapshot, item.id))) {
        this.runCampfire(event.snapshot);
      }
      return;
    }
    if (event.type === "floor") {
      this.floor(event.snapshot.floor);
      return;
    }
    if (event.type === "campfire") {
      this.runCampfire(event.snapshot);
      return;
    }
    if (event.type === "death") {
      this.runScribe(deathPrompt(event.snapshot, event.previous));
      return;
    }
    if (event.type === "navigation") {
      const prompt = navigationPrompt(event.snapshot);
      if (prompt) this.runScribe(prompt);
    }
  }

  interactScribe(snapshot: GameSnapshot, scribeId: string, authoredText: string): ScribeAgentContent {
    const prompt = interactionPrompt(snapshot, scribeId, authoredText);
    const local = localScribeContent(prompt);
    if (this.destroyed) return local;
    this.runScribe(prompt, local);
    return local;
  }

  campfireFor(snapshot: GameSnapshot): CampfireAgentContent | null {
    const key = stableJson(campfireView(snapshot));
    return this.view.campfire.requestKey === key ? this.view.campfire.content : null;
  }

  subscribe(listener: (state: AgentRuntimeState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): AgentRuntimeState {
    const value = this.actor.getSnapshot().value as Record<string, AgentPhase>;
    return { ...this.view, phases: {
      campfire: value.campfire, scribe: value.scribe, main: value.main,
    } };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.actorSubscription.unsubscribe();
    this.actor.stop();
    this.cache.clear();
    this.listeners.clear();
  }

  private runCampfire(snapshot: GameSnapshot): void {
    if (this.destroyed) return;
    if (!this.dirtyFloors.has(snapshot.floor)) return;
    const review = buildCampfireReview(campfireReviewInput(snapshot));
    if (!review.available || snapshot.floorReview.every((item) => item.floor !== snapshot.floor)) return;
    const evidence = campfireView(snapshot);
    const requestKey = stableJson(evidence);
    if (this.getState().phases.campfire === "running" && this.view.campfire.requestKey === requestKey) return;
    const local: CampfireAgentContent = {
      headline: review.headline,
      facts: [...review.facts],
      focusConcept: review.focusConcept,
      nextAction: review.nextAction,
      message: review.facts[0] ?? review.nextAction,
    };
    this.view.campfire = { requestKey, content: local };
    const token = this.claim("campfire-review", "campfire");
    this.log("CAMPFIRE RUN");
    this.campfireJob = {
      source: "campfire", event: "campfire-review", floor: snapshot.floor,
      requestKey, evidence, local, ...token,
    };
    this.actor.send({ type: "RUN_CAMPFIRE", job: this.campfireJob });
  }

  private runScribe(prompt: ScribePrompt, local = localScribeContent(prompt)): void {
    if (this.destroyed) return;
    const requestKey = stableJson(prompt);
    const event = eventFor(prompt);
    if (this.getState().phases.scribe === "running") {
      if (this.scribeJob?.requestKey === requestKey) return;
      if (this.scribeJob && PRIORITY[event] < PRIORITY[this.scribeJob.event]) {
        this.log(`${event.toUpperCase()} SKIP / PRIORITY`);
        return;
      }
    }
    if (prompt.scene !== "navigation") {
      this.view.scribe = { requestKey, scene: prompt.scene, content: local };
    }
    const token = this.claim(event, "scribe");
    this.log(`${event.toUpperCase()} RUN`);
    this.scribeJob = {
      source: "scribe", event, floor: prompt.floor, requestKey,
      evidence: prompt, local, ...token,
    };
    this.actor.send({ type: "RUN_SCRIBE", job: this.scribeJob });
  }

  private async execute(job: Job, signal: AbortSignal): Promise<Outcome> {
    const evidenceHash = await this.gateway.evidenceHash(job.evidence);
    const roleKey = job.source === "campfire"
      ? `${job.floor}:${evidenceHash}`
      : `${job.floor}:${job.evidence.scene}:${evidenceHash}`;
    const view: AgentView = {
      floor: job.floor,
      event: job.event,
      changedSource: job.source,
      changed: { source: job.source, evidenceHash, evidence: job.evidence } as AgentView["changed"],
      context: {
        campfire: job.source === "campfire" ? null : this.roleContext("campfire", this.activeCampfire),
        scribe: job.source === "scribe" ? null : this.roleContext("scribe", this.activeScribe),
      },
    };
    const mainKey = agentCacheKey(view);
    const cached = this.cache.get("main", mainKey);
    if (cached) return { job, response: cached, roleKey, mainKey, mode: "cache" };
    if (this.gateway.canRequest()) {
      const remote = await this.gateway.run(view, signal);
      if (remote) return { job, response: remote, roleKey, mainKey, mode: "remote" };
    }
    const composeHash = await this.gateway.evidenceHash(agentComposePayload(view));
    return { job, response: localResponse(view, job.local, composeHash), roleKey, mainKey, mode: "local" };
  }

  private accept(outcome: Outcome): boolean {
    const { job, response, roleKey, mainKey, mode } = outcome;
    const content = response.child.content;
    if (mode !== "cache") {
      this.cache.set(job.source, roleKey, content as never, response.child.status);
      this.cache.set("main", mainKey, response, response.main.status);
    }
    if (job.source === "campfire") {
      if (response.main.status === "ready") this.dirtyFloors.delete(job.floor);
      this.activeCampfire = { key: roleKey, floor: job.floor, evidenceHash: response.child.evidenceHash };
      this.view.campfire = { requestKey: job.requestKey, content: content as CampfireAgentContent };
    } else if (job.evidence.scene !== "navigation") {
      this.activeScribe = { key: roleKey, floor: job.floor, evidenceHash: response.child.evidenceHash };
      this.view.scribe = { requestKey: job.requestKey, scene: job.evidence.scene, content: content as ScribeAgentContent };
    }
    this.updateUsage(response, mode);
    if (mode === "cache") {
      this.log("CACHE HIT / 0 TOKENS");
    } else {
      response.meta.calls.forEach((call) => {
        const tokens = call.tokens.total === null ? "N/A" : String(call.tokens.total);
        this.log(`${call.agent.toUpperCase()} ${call.status.toUpperCase()} · ${call.ms}MS · ${tokens} TOKENS`);
      });
    }
    if (!job.owner || this.panel?.serial !== job.serial) return false;
    this.panel.pending = false;
    this.view = {
      ...this.view,
      floor: response.floor,
      event: response.event,
      source: response.changedSource,
      requestKey: mainKey,
      guidance: response.main.guidance,
      streamKey: mode === "remote" && response.main.status === "ready" ? mainKey : null,
    };
    return true;
  }

  private roleContext<T extends RoleContent>(
    source: "campfire" | "scribe",
    active: ActiveRole | null,
  ): AgentRoleContext<T> | null {
    if (!active) return null;
    const content = this.cache.get(source, active.key) as T | null;
    if (!content) {
      if (source === "campfire") this.activeCampfire = null;
      else this.activeScribe = null;
      return null;
    }
    return { floor: active.floor, evidenceHash: active.evidenceHash, content };
  }

  private updateUsage(response: AgentResponse, mode: Outcome["mode"]): void {
    if (mode !== "remote") {
      this.view.usage = { ...this.view.usage, mode: mode === "cache" ? "CACHE" : "LOCAL", input: 0, output: 0, total: 0 };
      return;
    }
    const modelCalls = response.meta.calls.filter((call) => call.mode === "model");
    if (modelCalls.length === 0) {
      this.view.usage = { ...this.view.usage, mode: "LOCAL", input: 0, output: 0, total: 0 };
      return;
    }
    const sum = (key: keyof AgentTokens): number | null => modelCalls.some((call) => call.tokens[key] === null)
      ? null
      : modelCalls.reduce((total, call) => total + (call.tokens[key] ?? 0), 0);
    const input = sum("input");
    const output = sum("output");
    const total = sum("total");
    this.view.usage = {
      mode: "MODEL", input, output, total,
      pageInput: this.view.usage.pageInput + (input ?? 0),
      pageOutput: this.view.usage.pageOutput + (output ?? 0),
      pageTotal: this.view.usage.pageTotal + (total ?? 0),
    };
  }

  private claim(event: AgentEvent, source: AgentSource): { serial: number; owner: boolean } {
    const serial = ++this.serial;
    if (this.panel?.pending && PRIORITY[event] < this.panel.priority) return { serial, owner: false };
    this.panel = { serial, priority: PRIORITY[event], source, pending: true };
    this.view = { ...this.view, floor: this.view.floor, event, source, streamKey: null };
    return { serial, owner: true };
  }

  private floor(floor: number): void {
    this.activeCampfire = this.activeScribe = null;
    this.campfireJob = this.scribeJob = null;
    this.panel = null;
    this.dirtyFloors.clear();
    this.view = {
      ...this.view,
      floor,
      event: null,
      source: null,
      requestKey: null,
      guidance: `已进入第 ${floor} 层。靠近篝火或调查抄写员后，这里会整理下一步计划。`,
      streamKey: null,
      campfire: { requestKey: null, content: null },
      scribe: { requestKey: null, scene: null, content: null },
    };
    this.log(`FLOOR ${floor} RESET`);
    this.actor.send({ type: "FLOOR" });
  }

  private log(message: string): void {
    const logs = [...this.view.logs, `${String(++this.logId).padStart(3, "0")} ${message}`];
    this.view.logs = logs.slice(-40);
  }
}
