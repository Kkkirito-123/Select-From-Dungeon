/**
 * 浏览器页面与 DeepSeek Worker 之间的闭合消息协议。
 * 未列出的字段会在后续解析阶段拒绝，避免把任意对象当成可信响应。
 */
import type { AgentPrepareRequest, CampfireOutput } from "../../runtime/contracts";

export type DeepSeekErrorCode =
  // 错误码是 UI 能理解的稳定分类，不暴露供应商原始响应。
  | "invalid-key"
  | "insufficient-balance"
  | "rate-limit"
  | "provider-unavailable"
  | "cors-unavailable"
  | "invalid-response"
  | "not-configured";

export type DeepSeekWorkerRequest =
  // configure、prepare、clear 分别覆盖连接、复盘和凭据销毁。
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
  // Worker 响应不包含 Key，只能返回模型、输出或有限错误码。
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
