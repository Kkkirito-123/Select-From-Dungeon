import type { AgentPrepareRequest, CampfireOutput } from "../../runtime/contracts";

export type DeepSeekErrorCode =
  | "invalid-key"
  | "insufficient-balance"
  | "rate-limit"
  | "provider-unavailable"
  | "cors-unavailable"
  | "invalid-response"
  | "not-configured";

export type DeepSeekWorkerRequest =
  | {
      type: "configure";
      requestId: number;
      key: string;
    }
  | {
      type: "prepare";
      requestId: number;
      model: string;
      request: AgentPrepareRequest;
      campfire: CampfireOutput;
    }
  | {
      type: "clear";
      requestId: number;
    };

export type DeepSeekWorkerResponse =
  | {
      type: "configured";
      requestId: number;
      models: string[];
    }
  | {
      type: "prepared";
      requestId: number;
      output: unknown;
    }
  | {
      type: "cleared";
      requestId: number;
    }
  | {
      type: "error";
      requestId: number;
      code: DeepSeekErrorCode;
    };
