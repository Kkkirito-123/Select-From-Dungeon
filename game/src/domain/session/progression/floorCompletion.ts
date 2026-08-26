/**
 * GameSession 的楼层完成与终局提交规则。
 *
 * 本模块只计算管理员预览边界和 Campaign/Profile 的下一稳定值；GameSession
 * 仍是唯一状态提交者，开发桥不能直接写入正式进度。
 */
import {
  advanceCampaignProgress,
  type CampaignProgress,
} from "../../progression/campaign";

/** 普通管理员预览不推进正式 Run；Agent 试玩仍走真实楼层流程。 */
export function isReadOnlyAdminPreview(
  adminMode: boolean,
  agentPlaytestMode: boolean,
): boolean {
  return adminMode && !agentPlaytestMode;
}

export interface CampaignVictoryInput {
  campaign: CampaignProgress;
  victories: number;
  bestRunQueries: number | null;
  queryCount: number;
}

export interface CampaignVictoryResolution {
  campaign: CampaignProgress;
  victories: number;
  bestRunQueries: number;
}

/** 校验第八层终局并返回一次且仅一次的档案提交值。 */
export function resolveCampaignVictory(
  input: CampaignVictoryInput,
): CampaignVictoryResolution {
  const completion = advanceCampaignProgress(input.campaign);
  if (
    !completion.ok
    || !completion.completed
    || completion.from !== 8
    || completion.to !== 8
  ) {
    throw new Error("第八层终局无法提交：Campaign 状态与当前楼层不一致。");
  }
  return {
    campaign: completion.progress,
    victories: input.victories + 1,
    bestRunQueries: input.bestRunQueries === null
      ? input.queryCount
      : Math.min(input.bestRunQueries, input.queryCount),
  };
}
