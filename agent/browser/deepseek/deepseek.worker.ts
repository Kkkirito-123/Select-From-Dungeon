/// <reference lib="webworker" />

import {
  AGENT_OUTPUT_VERSION,
  type ScribeOutput,
} from "../../runtime/contracts";
import { buildScribeUserPrompt, SCRIBE_SYSTEM_PROMPT } from "../scribe/prompt";
import type {
  DeepSeekErrorCode,
  DeepSeekWorkerRequest,
  DeepSeekWorkerResponse,
} from "./protocol";

const DEEPSEEK_ORIGIN = "https://api.deepseek.com";
const FETCH_TIMEOUT_MS = 12_000;
const worker = self as DedicatedWorkerGlobalScope;
let credential: string | null = null;
let configuredOnce = false;
let allowedModels = new Set<string>();

function response(value: DeepSeekWorkerResponse): void {
  worker.postMessage(value);
}

function errorCode(status: number): DeepSeekErrorCode {
  if (status === 401) return "invalid-key";
  if (status === 402) return "insufficient-balance";
  if (status === 429) return "rate-limit";
  return "provider-unavailable";
}

async function safeFetch(input: string, init: RequestInit): Promise<Response> {
  const url = new URL(input);
  if (url.origin !== DEEPSEEK_ORIGIN) {
    throw new Error("forbidden-origin");
  }
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function configure(message: Extract<DeepSeekWorkerRequest, { type: "configure" }>) {
  if (configuredOnce) {
    response({ type: "error", requestId: message.requestId, code: "not-configured" });
    return;
  }
  configuredOnce = true;
  const nextCredential = message.key.trim();
  if (nextCredential.length < 8 || nextCredential.length > 512) {
    credential = null;
    response({ type: "error", requestId: message.requestId, code: "invalid-key" });
    return;
  }
  credential = nextCredential;
  try {
    const result = await safeFetch(`${DEEPSEEK_ORIGIN}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${credential}` },
    });
    if (!result.ok) {
      credential = null;
      response({ type: "error", requestId: message.requestId, code: errorCode(result.status) });
      return;
    }
    const value: unknown = await result.json();
    const models = typeof value === "object" && value !== null && "data" in value &&
      Array.isArray(value.data)
      ? value.data
          .map((entry) => (
            typeof entry === "object" && entry !== null && "id" in entry
              ? entry.id
              : null
          ))
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .sort()
      : [];
    if (models.length === 0) {
      credential = null;
      response({ type: "error", requestId: message.requestId, code: "invalid-response" });
      return;
    }
    allowedModels = new Set(models);
    response({ type: "configured", requestId: message.requestId, models });
  } catch {
    credential = null;
    response({ type: "error", requestId: message.requestId, code: "cors-unavailable" });
  }
}

async function prepare(message: Extract<DeepSeekWorkerRequest, { type: "prepare" }>) {
  if (!credential) {
    response({ type: "error", requestId: message.requestId, code: "not-configured" });
    return;
  }
  const activeCredential = credential;
  if (!allowedModels.has(message.model)) {
    response({ type: "error", requestId: message.requestId, code: "invalid-response" });
    return;
  }
  try {
    const result = await safeFetch(`${DEEPSEEK_ORIGIN}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${activeCredential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: message.model,
        messages: [
          { role: "system", content: SCRIBE_SYSTEM_PROMPT },
          { role: "user", content: buildScribeUserPrompt(message.request, message.campfire) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 360,
        stream: false,
      }),
    });
    if (!result.ok) {
      response({ type: "error", requestId: message.requestId, code: errorCode(result.status) });
      return;
    }
    const value: unknown = await result.json();
    const content = typeof value === "object" && value !== null && "choices" in value &&
      Array.isArray(value.choices)
      ? (value.choices[0] as { message?: { content?: unknown } } | undefined)
          ?.message?.content
      : null;
    if (typeof content !== "string" || content.length === 0 || content.length > 8_000) {
      response({ type: "error", requestId: message.requestId, code: "invalid-response" });
      return;
    }
    let scribe: ScribeOutput;
    try {
      scribe = JSON.parse(content) as ScribeOutput;
    } catch {
      response({ type: "error", requestId: message.requestId, code: "invalid-response" });
      return;
    }
    if (JSON.stringify(scribe).includes(activeCredential)) {
      response({ type: "error", requestId: message.requestId, code: "invalid-response" });
      return;
    }
    response({
      type: "prepared",
      requestId: message.requestId,
      output: {
        version: AGENT_OUTPUT_VERSION,
        runId: message.request.runId,
        floor: message.request.floor,
        evidenceHash: message.request.evidenceHash,
        source: "deepseek",
        campfire: message.campfire,
        scribe,
      },
    });
  } catch {
    response({ type: "error", requestId: message.requestId, code: "provider-unavailable" });
  }
}

worker.addEventListener("message", (event: MessageEvent<DeepSeekWorkerRequest>) => {
  const message = event.data;
  if (message.type === "configure") {
    void configure(message);
    return;
  }
  if (message.type === "prepare") {
    void prepare(message);
    return;
  }
  credential = null;
  allowedModels.clear();
  response({ type: "cleared", requestId: message.requestId });
});

export {};
