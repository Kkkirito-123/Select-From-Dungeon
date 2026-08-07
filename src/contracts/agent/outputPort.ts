/**
 * 游戏侧 Agent 输出端口。
 *
 * UI 只依赖这个只读端口，不直接创建 Agent、访问 Worker 或理解模型协议。
 * 输出可以来自本地确定性回退，也可以来自已经校验过的远端结果；两者
 * 对游戏表现层保持相同的数据形状。
 */
import type { GameSnapshot } from "../game/snapshots";

export interface CampfireOutput {
  available: boolean;
  headline: string;
  facts: readonly string[];
  focusConcept: string | null;
  nextAction: string;
}

export interface ScribeOutput {
  greeting: string;
  observation: string;
  guidance: string;
  relationshipLine: string | null;
  sourceBeatId: string | null;
  evidenceRefs: readonly string[];
}

/**
 * 游戏可以消费的 Agent 输出。Agent 不能通过这个结果写入游戏状态。
 */
export interface PreparedAgentOutput {
  version: 2;
  runId: string;
  floor: GameSnapshot["floor"];
  evidenceHash: string;
  source: "local" | "deepseek" | "openzl";
  campfire: CampfireOutput;
  scribe: ScribeOutput;
}

/**
 * DOM 层使用的 Agent 只读端口。
 */
export interface AgentOutputPort {
  preparedFor(snapshot: GameSnapshot): PreparedAgentOutput;
  subscribe(listener: () => void): () => void;
}

/** Agent 尚未注入时的安全展示值，不会影响游戏规则或存档。 */
export function emptyPreparedAgentOutput(snapshot: GameSnapshot): PreparedAgentOutput {
  return {
    version: 2,
    runId: snapshot.runInstanceId,
    floor: snapshot.floor,
    evidenceHash: "unavailable",
    source: "local",
    campfire: {
      available: false,
      headline: "篝火复盘暂不可用",
      facts: [],
      focusConcept: null,
      nextAction: "继续探索",
    },
    scribe: {
      greeting: "抄写员暂未连接",
      observation: "",
      guidance: "继续探索当前楼层。",
      relationshipLine: null,
      sourceBeatId: null,
      evidenceRefs: [],
    },
  };
}

/** 将已校验的抄写员字段转换为检查窗口使用的纯文本。 */
export function scribeOutputText(output: ScribeOutput): string {
  return [
    `抄写员：${output.greeting}`,
    output.observation,
    output.guidance,
    output.relationshipLine,
  ].filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n\n");
}

/** 旧名称保留为类型别名，避免一次契约迁移破坏已有内部调用。 */
export type AgentContentSource = AgentOutputPort;
