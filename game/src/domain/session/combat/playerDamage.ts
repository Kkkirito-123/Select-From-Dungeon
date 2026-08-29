/** 护甲优先的玩家受伤状态转换；不负责死亡模式或事件。 */
import type { PlayerState } from "../../shared/types";

export interface PlayerDamageResolution {
  playerDamage: number;
  armorDamage: number;
}

export type PlayerDamageContext = Pick<PlayerState, "hp" | "armorHp">;

/** Apply non-negative integer damage with armor absorbing first. */
export function applyPlayerDamage(
  player: PlayerDamageContext,
  amount: number,
): PlayerDamageResolution {
  const incoming = Math.max(0, Math.floor(amount));
  const armorDamage = Math.min(player.armorHp, incoming);
  player.armorHp -= armorDamage;
  const playerDamage = incoming - armorDamage;
  player.hp = Math.max(0, player.hp - playerDamage);
  return { playerDamage, armorDamage };
}
