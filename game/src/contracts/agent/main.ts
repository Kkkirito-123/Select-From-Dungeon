import type { CampfireAgentContent, CampfireView } from "./campfireReview";
import type { ScribeAgentContent, ScribePrompt } from "./scribe";

/** 浏览器与唯一 Agent 服务共享的编排协议。 */
export type AgentSource = "campfire" | "scribe";
export type AgentEvent =
  | "campfire-review"
  | "scribe-interaction"
  | "death-review"
  | "navigation";
export type AgentRoleStatus = "ready" | "fallback";

export type AgentChange =
  | { source: "campfire"; evidenceHash: string; evidence: CampfireView }
  | { source: "scribe"; evidenceHash: string; evidence: ScribePrompt };

export interface AgentRoleContext<T> {
  floor: number;
  evidenceHash: string;
  content: T;
}

export interface AgentView {
  floor: number;
  event: AgentEvent;
  changedSource: AgentSource;
  changed: AgentChange;
  context: {
    campfire: AgentRoleContext<CampfireAgentContent> | null;
    scribe: AgentRoleContext<ScribeAgentContent> | null;
  };
}

export interface AgentRequest extends AgentView {
  protocolVersion: 1;
  requestId: string;
  composeHash: string;
}

export interface AgentTokens {
  input: number | null;
  output: number | null;
  total: number | null;
}

export interface AgentCallMeta {
  agent: "campfire" | "scribe" | "main";
  mode: "model" | "local";
  status: AgentRoleStatus;
  ms: number;
  tokens: AgentTokens;
}

export interface AgentResponse {
  schemaVersion: 1;
  requestId: string;
  composeHash: string;
  floor: number;
  event: AgentEvent;
  changedSource: AgentSource;
  child: {
    source: AgentSource;
    evidenceHash: string;
    status: AgentRoleStatus;
    content: CampfireAgentContent | ScribeAgentContent;
  };
  main: { status: AgentRoleStatus; guidance: string };
  meta: { traceId: string | null; ms: number; calls: AgentCallMeta[] };
}

export interface AgentGatewayPort {
  evidenceHash(value: unknown): Promise<string>;
  canRequest(): boolean;
  run(view: AgentView, signal?: AbortSignal): Promise<AgentResponse | null>;
}
