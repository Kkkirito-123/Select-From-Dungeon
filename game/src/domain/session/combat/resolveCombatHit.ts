/**
 * GameSession 战斗命中的纯生命结算规则。
 *
 * 本模块只根据当前生命、武器、护甲和阶段位置计算本次伤害；它不读取 Session、
 * 不推进课程、不发送事件。GameSession 仍是唯一状态提交者。
 */

/** 一次已接受战斗命中的有限输入。 */
export interface CombatHitInput {
  currentHp: number;
  weaponDamage: number;
  armor: number;
  nextSuccessStep: number;
  totalStages: number;
}

/** 一次战斗命中的确定性生命结果。 */
export interface CombatHitResolution {
  minimumHp: number;
  damage: number;
  remainingHp: number;
}

/** 接受一次正确阶段后返回唯一合法的下一成功阶段。 */
export function advanceCombatSuccessStep(currentSuccessStep: number): number {
  return currentSuccessStep + 1;
}

/**
 * 计算一次命中；非最终阶段至少保留 1 HP，最终阶段允许并保证归零。
 *
 * @param input 已由 GameSession 校验的正数生命和阶段数据。
 * @returns 不修改输入的生命结算结果。
 */
export function resolveCombatHit(input: CombatHitInput): CombatHitResolution {
  const minimumHp = input.nextSuccessStep < input.totalStages ? 1 : 0;
  const rawDamage = Math.max(1, input.weaponDamage - input.armor);
  const damage = input.nextSuccessStep >= input.totalStages
    ? input.currentHp
    : Math.min(rawDamage, Math.max(1, input.currentHp - minimumHp));
  return {
    minimumHp,
    damage,
    remainingHp: Math.max(minimumHp, input.currentHp - damage),
  };
}
