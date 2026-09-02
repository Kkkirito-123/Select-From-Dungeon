/**
 * SQL 终端工作流编排器。
 *
 * 该模块只编排一次查询的生命周期，不创建 DOM、不持有规则状态，也不
 * 直接依赖 AppShell。Session、SQLite、战斗场景和界面分别通过窄端口提供服务。
 */
import type { FeedbackEvent } from "../../infrastructure/feedback/FeedbackDirector";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type {
  GateChallengeResolution,
  QueryResultDisclosure,
  SqlQueryResult,
  TurnResolution,
} from "../../contracts/game/results";
import type { FloorNumber } from "../../domain/progression/runGraph";
import type { Monster } from "../../domain/shared/types";

export type QueryValidation =
  | { ok: true }
  | { ok: false; message: string };

export interface TerminalSessionPort {
  snapshot(): GameSnapshot;
  validateCombatQuery(sql: string): QueryValidation;
  resolveQuery(result: SqlQueryResult): TurnResolution;
  registerQueryError(message: string, sql?: string): TurnResolution;
  validateGateChallengeQuery(sql: string): QueryValidation;
  resolveGateChallenge(result: SqlQueryResult): GateChallengeResolution;
  registerGateChallengeError(message: string): GateChallengeResolution;
}

export interface TerminalSqlPort {
  execute(sql: string, floor: FloorNumber, lessonId?: string): SqlQueryResult;
  executeSelect(sql: string): SqlQueryResult;
  updateMonsterHp(updates: readonly { id: number; hp: number }[]): void;
  reset(monsters: readonly Monster[]): void;
}

export interface TerminalBattlePort {
  animateTurn(resolution: TurnResolution): Promise<void>;
  abortEncounter(): void;
}

export interface TerminalNotice {
  message: string;
  tone: "info" | "success" | "danger" | "reward";
}

export interface TerminalCoordinatorPorts {
  session: TerminalSessionPort;
  sql: TerminalSqlPort;
  getBattleScene(): TerminalBattlePort | null;
  getCombatInput(): string;
  getGateInput(): string;
  isGateTerminalOpen(): boolean;
  hideCombatAutocomplete(): void;
  hideGateAutocomplete(): void;
  setResolving(resolving: boolean): void;
  setCombatExecuteDisabled(disabled: boolean): void;
  setGateExecuteDisabled(disabled: boolean): void;
  setCombatStatus(message: string, kind: "" | "warning" | "success" | "error"): void;
  setGateStatus(message: string, kind: "" | "warning" | "success" | "error"): void;
  showNotice(notice: TerminalNotice): void;
  dispatchFeedback(event: FeedbackEvent): void;
  renderCombatResult(
    result: SqlQueryResult,
    disclosure: QueryResultDisclosure,
  ): void;
  renderGateResult(
    result: SqlQueryResult,
    disclosure: QueryResultDisclosure,
  ): void;
  onLessonAccepted(): void;
  closeCombatTerminal(returnFocus: boolean): void;
  openCombatTerminal(): void;
  syncAudioFocus(): void;
  showCombatSettlement(resolution: TurnResolution): void;
}

export class TerminalCoordinator {
  private busy = false;

  constructor(private readonly ports: TerminalCoordinatorPorts) {}

  get isBusy(): boolean {
    return this.busy;
  }

  /**
   * 完成一次 SQL 战斗提交的完整协调。
   *
   * 本方法依次连接输入、查询保护、SQLite 执行、规则结算和画面反馈；
   * 它不实现判题规则，也不直接修改游戏状态。
   */
  async executeCombat(): Promise<void> {
    // 第一步：读取当前输入与快照，空查询不会进入执行和结算阶段。
    if (this.busy) return;
    const input = this.ports.getCombatInput();
    const snapshot = this.ports.session.snapshot();
    if (!input.trim()) {
      const message = emptyCombatMessage(snapshot.floor);
      this.ports.setCombatStatus(message, "warning");
      this.ports.showNotice({ message, tone: "info" });
      return;
    }

    // 第二步：锁定本次提交，避免动画结束前发生重复查询。
    this.ports.hideCombatAutocomplete();
    this.beginResolution("combat");
    let reopenAfterResolution = false;
    try {
      let result: SqlQueryResult | null = null;
      let queryError: unknown = null;
      try {
        // 第三步：先由 Session 执行游戏语义保护，再交给 SqlEngine 运行真实查询。
        const policy = this.ports.session.validateCombatQuery(input);
        if (!policy.ok) throw new Error(policy.message);
        result = this.ports.sql.execute(
          input,
          snapshot.floor,
          snapshot.lessonId,
        );
      } catch (error) {
        queryError = error;
      }

      // 第四步：Session 把查询结果转换为命中、反击、阶段推进和奖励等规则结果。
      let resolution: TurnResolution;
      if (result) {
        resolution = this.ports.session.resolveQuery(result);
        if (resolution.hpUpdates.length > 0) {
          this.ports.sql.updateMonsterHp(resolution.hpUpdates);
        }
        this.ports.renderCombatResult(result, resolution.resultDisclosure);
        this.ports.setCombatStatus(
          resolution.message,
          resolution.accepted ? "success" : "warning",
        );
        this.ports.showNotice({
          message: resolution.message,
          tone: resolution.accepted ? "success" : "danger",
        });
      } else {
        const message = queryError instanceof Error ? queryError.message : "查询执行失败。";
        resolution = this.ports.session.registerQueryError(message, input);
        this.ports.setCombatStatus(resolution.message, "error");
        this.ports.showNotice({ message: resolution.message, tone: "danger" });
      }

      // 第五步：规则已经提交完成，表现层只消费 resolution 播放反馈和动画。
      if (resolution.accepted && resolution.lessonCompleted) {
        this.ports.onLessonAccepted();
      }
      this.ports.closeCombatTerminal(true);
      this.ports.syncAudioFocus();
      try {
        await this.ports.getBattleScene()?.animateTurn(resolution);
      } catch (error) {
        console.error("战斗动画播放失败", error);
        const message = `${resolution.message}（动画未播放，但回合状态已结算。）`;
        this.ports.setCombatStatus(message, "error");
        this.ports.showNotice({ message, tone: "danger" });
        if (resolution.mode !== "combat") this.ports.getBattleScene()?.abortEncounter();
      }
      if (resolution.experience) {
        if (resolution.events.some((event) => event.type === "identity-recovered")) {
          this.ports.dispatchFeedback({
            type: "identity-recovered",
            monsterName: resolution.experience.monsterName,
            monsterId: resolution.experience.monsterId,
            xp: resolution.experience.gained,
          });
        }
        this.ports.showCombatSettlement(resolution);
      }
      reopenAfterResolution = resolution.mode === "combat";
    } catch (error) {
      console.error("战斗回合结算失败", error);
      const message = "回合结算遇到内部错误，没有追加怪物反击。请重新打开终端再试。";
      this.ports.setCombatStatus(message, "error");
      this.ports.showNotice({ message, tone: "danger" });
      try {
        this.ports.sql.reset(this.ports.session.snapshot().monsters);
      } catch (recoveryError) {
        console.error("教学数据库恢复失败", recoveryError);
      }
      if (this.ports.session.snapshot().mode !== "combat") {
        this.ports.getBattleScene()?.abortEncounter();
      }
      this.ports.closeCombatTerminal(true);
    } finally {
      // 无论查询、结算或动画是否失败，都必须释放忙碌状态并恢复正确焦点。
      this.endResolution("combat");
      if (reopenAfterResolution) this.ports.openCombatTerminal();
      else this.ports.syncAudioFocus();
    }
  }

  async executeGateChallenge(): Promise<void> {
    if (this.busy || !this.ports.isGateTerminalOpen()) return;
    const input = this.ports.getGateInput();
    if (!input.trim()) {
      const message = "先写一条完整的只读 SELECT / WITH 查询；空输入不会触发机关反噬。";
      this.ports.setGateStatus(message, "warning");
      this.ports.showNotice({ message, tone: "info" });
      return;
    }

    this.ports.hideGateAutocomplete();
    this.beginResolution("gate");
    try {
      this.ports.dispatchFeedback({ type: "query-cast" });
      let result: SqlQueryResult | null = null;
      let queryError: unknown = null;
      try {
        const policy = this.ports.session.validateGateChallengeQuery(input);
        if (!policy.ok) throw new Error(policy.message);
        result = this.ports.sql.executeSelect(input);
      } catch (error) {
        queryError = error;
      }

      const resolution = result
        ? this.ports.session.resolveGateChallenge(result)
        : this.ports.session.registerGateChallengeError(
            queryError instanceof Error ? queryError.message : "查询执行失败。",
          );
      if (result) this.ports.renderGateResult(result, resolution.resultDisclosure);
      this.ports.setGateStatus(
        resolution.message,
        resolution.accepted ? "success" : "error",
      );
      const receivedDamage = resolution.playerDamage + resolution.armorDamage;
      if (receivedDamage > 0) {
        this.ports.dispatchFeedback({ type: "player-hurt", amount: receivedDamage });
      }
      if (!resolution.accepted && receivedDamage === 0) {
        this.ports.showNotice({ message: resolution.message, tone: "info" });
      }
    } catch (error) {
      console.error("机关查询结算失败", error);
      const message = "机关终端发生内部错误，本次没有扣除生命。请关闭后重新接入。";
      this.ports.setGateStatus(message, "error");
      this.ports.showNotice({ message, tone: "danger" });
    } finally {
      this.endResolution("gate");
      this.ports.syncAudioFocus();
    }
  }

  private beginResolution(kind: "combat" | "gate"): void {
    this.busy = true;
    this.ports.setResolving(true);
    if (kind === "combat") this.ports.setCombatExecuteDisabled(true);
    else this.ports.setGateExecuteDisabled(true);
    this.ports.syncAudioFocus();
  }

  private endResolution(kind: "combat" | "gate"): void {
    this.busy = false;
    this.ports.setResolving(false);
    if (kind === "combat") {
      this.ports.setCombatExecuteDisabled(false);
    } else {
      this.ports.setGateExecuteDisabled(false);
    }
  }
}

function emptyCombatMessage(floor: FloorNumber): string {
  if (floor === 6) return "先写出本回合完整的沙箱 SQL；空输入不会消耗回合。";
  if (floor === 7) return "先写一条查询；系统会同时验证结果与真实 SQLite 执行计划。";
  if (floor === 8) return "先查询本回合给出的教学事故记录；空输入不会消耗回合。";
  return "先写一条完整的只读 SELECT / WITH 查询；空输入不会消耗回合。";
}
