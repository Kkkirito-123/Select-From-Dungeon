/** 新玩家渐进式引导文案和步骤契约；完成状态由存储层管理。 */
export type OnboardingStepId =
  | "move"
  | "find-monster"
  | "open-terminal"
  | "cast-query"
  | "pickup"
  | "complete";

export type OnboardingMilestone =
  | "player-step"
  | "encounter-start"
  | "terminal-open"
  | "query-accepted"
  | "item-pickup";

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  body: string;
  shortcut: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "move",
    title: "先走一步",
    body: "用 WASD、方向键或下方方向按钮移动。迷宫会在你走过后显形。",
    shortcut: "WASD / 方向键",
  },
  {
    id: "find-monster",
    title: "跟随青色信标",
    body: "找到守在 SELECT 排水石碑旁的 ID #001。青色箭头只负责指路，真正碰到未识别记录所在格才会进入战斗。",
    shortcut: "触碰怪物",
  },
  {
    id: "open-terminal",
    title: "打开 SQL 终端",
    body: "遭遇已经锁定。按住 Q + S，或点击 SQL 战斗按钮查看任务和表结构。",
    shortcut: "Q + S",
  },
  {
    id: "cast-query",
    title: "写完整查询",
    body: "先看目标、Schema 和知识锁，再从 SELECT 开始写完整语句。空输入不会消耗回合。",
    shortcut: "Ctrl / Cmd + Enter",
  },
  {
    id: "pickup",
    title: "打开战利品包",
    body: "击败课程怪后，战利品包会出现在怪物位置。靠近后按 E，处理确定奖励和可选掉落。",
    shortcut: "靠近战利品包按 E",
  },
  {
    id: "complete",
    title: "探索闭环完成",
    body: "你已经会移动、遭遇、查询和拾取。接下来按自己的路线探索魔王城。",
    shortcut: "自由探索",
  },
] as const;

export function onboardingStep(id: OnboardingStepId): OnboardingStep {
  return ONBOARDING_STEPS.find((step) => step.id === id) ?? ONBOARDING_STEPS[0];
}
