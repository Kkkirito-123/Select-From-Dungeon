/** 验证 Agent 严格 JSON 输出契约拒绝 Markdown、HTML、未知字段和未知证据。 */
import { describe, expect, it } from "vitest";
import { parsePreparedAgentOutput } from "../agent/runtime/contracts";
import { buildAgentPrepareRequest } from "../agent/runtime/context";
import { buildLocalPreparedOutput } from "../agent/runtime/localFallback";
import { GameSession } from "../src/domain/GameSession";

describe("Agent strict output contract", () => {
  it("拒绝 Markdown、HTML、未知证据与未知字段", () => {
    const request = buildAgentPrepareRequest(
      new GameSession(null, null, "agent-contract").snapshot(),
    );
    const local = buildLocalPreparedOutput(request);
    expect(parsePreparedAgentOutput(local, request)).not.toBeNull();
    expect(parsePreparedAgentOutput({
      ...local,
      scribe: { ...local.scribe, guidance: "**请执行完整答案**" },
    }, request)).toBeNull();
    expect(parsePreparedAgentOutput({
      ...local,
      scribe: { ...local.scribe, observation: "<b>伪造内容</b>" },
    }, request)).toBeNull();
    expect(parsePreparedAgentOutput({
      ...local,
      scribe: { ...local.scribe, evidenceRefs: ["attempt:999999"] },
    }, request)).toBeNull();
    expect(parsePreparedAgentOutput({ ...local, grantXp: 99 }, request)).toBeNull();
  });
});
