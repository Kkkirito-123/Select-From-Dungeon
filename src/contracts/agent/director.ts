import type {
  CampfireAgentContent,
  CampfireView,
} from "./campfireReview";
import type {
  ScribeAgentContent,
  ScribePrompt,
  ScribeScene,
} from "./scribe";

export type DirectorSource = "campfire" | "scribe";
export type DirectorEvent =
  | "campfire-review"
  | "scribe-interaction"
  | "death-review"
  | "navigation";
export type DirectorRoleStatus = "ready" | "fallback";

export type DirectorChange =
  | { source: "campfire"; evidenceHash: string; evidence: CampfireView }
  | { source: "scribe"; evidenceHash: string; evidence: ScribePrompt };

export interface DirectorRoleContext<T> {
  floor: number;
  evidenceHash: string;
  content: T;
  scene?: ScribeScene;
}

export interface DirectorView {
  floor: number;
  event: DirectorEvent;
  changedSource: DirectorSource;
  changed: DirectorChange;
  context: {
    campfire: DirectorRoleContext<CampfireAgentContent> | null;
    scribe: DirectorRoleContext<ScribeAgentContent> | null;
  };
}

export interface DirectorAgentRequest extends DirectorView {
  protocolVersion: 1;
  requestId: string;
  composeHash: string;
}

export interface DirectorAgentResponse {
  schemaVersion: 2;
  requestId: string;
  composeHash: string;
  floor: number;
  event: DirectorEvent;
  changedSource: DirectorSource;
  child: {
    source: DirectorSource;
    evidenceHash: string;
    status: DirectorRoleStatus;
    content: CampfireAgentContent | ScribeAgentContent;
  };
  director: {
    status: DirectorRoleStatus;
    situation: string;
    guidance: string;
  };
  meta: DirectorMeta;
}

export interface AgentTokens {
  input: number | null;
  output: number | null;
  total: number | null;
}

export interface DirectorCallMeta {
  agent: "campfire" | "scribe" | "director";
  mode: "model" | "local";
  status: DirectorRoleStatus;
  ms: number;
  tokens: AgentTokens;
}

export interface DirectorMeta {
  traceId: string | null;
  ms: number;
  calls: DirectorCallMeta[];
}

export interface AgentGatewayPort {
  evidenceHash(value: unknown): Promise<string>;
  canRequest(source: DirectorSource, event: DirectorEvent): boolean;
  run(view: DirectorView, signal?: AbortSignal): Promise<DirectorAgentResponse | null>;
}
