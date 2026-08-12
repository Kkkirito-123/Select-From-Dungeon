/**
 * 抄写员 Agent 的浏览器侧 HTTP 契约。
 *
 * 请求只携带当前场景的最小证据投影。抄写员可以润色陪伴文案，但不能
 * 生成完整答案、修改游戏状态或替换本地路线计算。
 */
export type ScribeScene = "interaction" | "death-review" | "navigation";
export type ScribeResultCategory =
  | "correct"
  | "missing-concept"
  | "wrong-result"
  | "syntax-error";
export type ScribeBattleOutcome = "hit" | "countered" | "victory" | "defeat";
export type ScribeDeathCause = "combat" | "hazard" | "cipher" | "unknown";
export type ScribeDirection = "north" | "east" | "south" | "west";

export interface ScribeLearningEvidence {
  lessonId: string;
  stageId: string;
  objective: string;
  requiredColumns: string[];
  submittedColumns: string[];
  missingColumns: string[];
  unexpectedColumns: string[];
  brokenConcepts: string[];
  remainingConcepts: string[];
  resultCategory: ScribeResultCategory;
  hintLevel: number;
  safeHintId: string | null;
}

export interface ScribeNavigationEvidence {
  targetId: string;
  targetLabel: string;
  direction: ScribeDirection;
  distance: number;
  guidanceLevel: 1 | 2 | 3;
}

export interface ScribeDeathEvidence {
  cause: ScribeDeathCause;
  battleAttempts: number;
  lastOutcome: ScribeBattleOutcome;
}

export interface ScribePrompt {
  floor: number;
  scene: ScribeScene;
  scribeId: string;
  topic: string;
  authoredMessage: string;
  learning: ScribeLearningEvidence | null;
  navigation: ScribeNavigationEvidence | null;
  death: ScribeDeathEvidence | null;
}

export interface ScribeAgentRequest {
  protocolVersion: 1;
  requestId: string;
  evidenceHash: string;
  floor: number;
  scene: ScribeScene;
  scribeId: string;
  topic: string;
  authoredMessage: string;
  learning: ScribeLearningEvidence | null;
  navigation: ScribeNavigationEvidence | null;
  death: ScribeDeathEvidence | null;
}

export interface ScribeAgentOutput {
  schemaVersion: 1;
  requestId: string;
  evidenceHash: string;
  headline: string;
  facts: string[];
  nextAction: string;
  safeHintId: string | null;
  message: string;
}

export interface ScribeAgentContent {
  headline: string;
  facts: string[];
  nextAction: string;
  safeHintId: string | null;
  message: string;
}
