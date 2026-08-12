/**
 * 篝火 Agent 的跨 HTTP 数据契约。
 *
 * 这里描述的是经过游戏端投影的只读证据，不是 GameSnapshot 的替代品。
 * Agent 只能返回文案结果，不能决定复盘是否解锁，也不能写回游戏状态。
 */
export type CampfireAgentResult =
  | "correct"
  | "missing-concept"
  | "wrong-result"
  | "syntax-error";

export type CampfireAgentOutcome = "hit" | "countered" | "victory" | "defeat";

export interface CampfireAgentAttempt {
  attemptId: number;
  lessonId: string;
  stageId: string;
  stageObjective: string;
  submittedSql: string;
  result: CampfireAgentResult;
  outcome: CampfireAgentOutcome;
  hintLevel: number;
}

export interface CampfireAgentAggregate {
  totalAttempts: number;
  correctCount: number;
  accuracy: number;
  errorCounts: {
    "missing-concept": number;
    "wrong-result": number;
    "syntax-error": number;
  };
  hintedAttempts: number;
  highestHintLevel: number;
}

export interface CampfireAgentRequest {
  protocolVersion: 1;
  requestId: string;
  evidenceHash: string;
  floor: number;
  aggregate: CampfireAgentAggregate;
  attempts: CampfireAgentAttempt[];
}

export type CampfireView = Omit<
  CampfireAgentRequest,
  "protocolVersion" | "requestId" | "evidenceHash"
>;

export interface CampfireAgentOutput {
  schemaVersion: 1;
  requestId: string;
  evidenceHash: string;
  headline: string;
  facts: string[];
  focusConcept: string | null;
  nextAction: string;
  message: string;
}

export interface CampfireAgentContent {
  headline: string;
  facts: string[];
  focusConcept: string | null;
  nextAction: string;
  message: string;
}
