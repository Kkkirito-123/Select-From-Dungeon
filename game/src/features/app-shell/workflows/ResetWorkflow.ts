/**
 * AppShell 的正式 Run 重置工作流。
 *
 * 这里只编排一次重置动作的顺序；Session、SQL、战斗场景、音频和 DOM
 * 生命周期都通过端口注入。焦点恢复仍由 closeTerminal 回调留在 AppShell。
 */
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { FeedbackNotice } from "../../../infrastructure/feedback/FeedbackDirector";
import type { ScoreScene } from "../../../infrastructure/audio/ArcadeAudio";

export interface ResetWorkflowPorts {
  readonly isAdminMode: () => boolean;
  readonly isBusy: () => boolean;
  readonly setBanner: (message: string) => void;
  readonly setQueryStatus: (message: string, kind: "success" | "") => void;
  readonly showNotice: (notice: FeedbackNotice) => void;
  readonly closeTerminal: (returnFocus: boolean) => void;
  readonly hidePickup: () => void;
  readonly hideCombatSettlement: () => void;
  readonly resetNarrative: () => void;
  readonly cancelDefeat: () => void;
  readonly getBattleScene: () => { abortEncounter(): void } | null;
  readonly resetSession: () => void;
  readonly readSnapshot: () => GameSnapshot;
  readonly resetSql: (monsters: GameSnapshot["monsters"]) => void;
  readonly clearQueryArtifacts: () => void;
  readonly setAudioScene: (scene: ScoreScene) => void;
}
const ADMIN_GUARD_MESSAGE = "管理员预览不会覆盖正式 Run。刷新页面后回到正式固定地图。";
const BUSY_GUARD_MESSAGE = "当前回合动画正在结算，结束后再开始新 Run。";
const RESET_SUCCESS_MESSAGE = "固定地图已重置；永久 SQL 图鉴没有被删除。";

export class ResetWorkflow {
  constructor(private readonly ports: ResetWorkflowPorts) {}

  run(): void {
    if (this.ports.isAdminMode()) {
      this.ports.setBanner(ADMIN_GUARD_MESSAGE);
      this.ports.showNotice({ message: ADMIN_GUARD_MESSAGE, tone: "info" });
      return;
    }
    if (this.ports.isBusy()) {
      this.ports.setBanner(BUSY_GUARD_MESSAGE);
      this.ports.showNotice({ message: BUSY_GUARD_MESSAGE, tone: "info" });
      return;
    }

    this.ports.closeTerminal(true);
    this.ports.hidePickup();
    this.ports.hideCombatSettlement();
    this.ports.resetNarrative();
    this.ports.cancelDefeat();
    const battleScene = this.ports.getBattleScene();
    this.ports.resetSession();
    const resetSnapshot = this.ports.readSnapshot();
    this.ports.resetSql(resetSnapshot.monsters);
    battleScene?.abortEncounter();
    this.ports.clearQueryArtifacts();
    this.ports.setQueryStatus(RESET_SUCCESS_MESSAGE, "success");
    this.ports.showNotice({ message: RESET_SUCCESS_MESSAGE, tone: "success" });
    this.ports.setAudioScene({
      floor: resetSnapshot.floor,
      region: 0,
      mode: "explore",
    });
  }
}
