import { ArcadeAudio } from "../audio/ArcadeAudio";
import type { OnboardingMilestone } from "../content/onboarding";
import { LESSONS } from "../content/mvpLevel";
import { GameSession, LEVEL_XP_THRESHOLDS } from "../domain/GameSession";
import type {
  GameSnapshot,
  GroundItem,
  Monster,
  PatrolMove,
  SqlQueryResult,
  TurnResolution,
} from "../domain/types";
import type { FeedbackDirector, FeedbackNotice } from "../feedback/FeedbackDirector";
import type { BattleScene } from "../game/BattleScene";
import { pickedItemsBetween } from "../game/snapshotFeedback";
import { createRunSeed } from "../storage/localProgress";
import { SqlEngine } from "../sql/SqlEngine";
import type { OnboardingController, OnboardingSnapshot } from "./OnboardingController";
import { SqlChordTracker } from "./SqlChordTracker";

const SVG_NS = "http://www.w3.org/2000/svg";

function requiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少界面元素：${selector}`);
  return element;
}

function dispatchMove(dx: number, dy: number): void {
  window.dispatchEvent(new CustomEvent("dungeon:move", { detail: { dx, dy } }));
}

function dispatchInteract(): void {
  window.dispatchEvent(new CustomEvent("dungeon:interact"));
}

export function canOpenCombatTerminal(
  mode: GameSnapshot["mode"] | null | undefined,
  busy: boolean,
): boolean {
  return mode === "combat" && !busy;
}

export class AppShell {
  private textarea!: HTMLTextAreaElement;
  private queryStatus!: HTMLElement;
  private resultRoot!: HTMLElement;
  private planRoot!: HTMLElement;
  private hintsRoot!: HTMLElement;
  private terminal!: HTMLElement;
  private executeButton!: HTMLButtonElement;
  private sqlButton!: HTMLButtonElement;
  private audioButton!: HTMLButtonElement;
  private lastStageId: GameSnapshot["lessonStageId"] | null = null;
  private lastMode: GameSnapshot["mode"] | null = null;
  private lastSnapshot!: GameSnapshot;
  private busy = false;
  private readonly sqlChord = new SqlChordTracker();
  private readonly listenerController = new AbortController();
  private unsubscribeSession: (() => void) | null = null;
  private unsubscribeFeedback: (() => void) | null = null;
  private unsubscribeOnboarding: (() => void) | null = null;
  private releaseAudioGesture: (() => void) | null = null;
  private focusBeforeTerminal: HTMLElement | null = null;
  private toastTimer: number | null = null;
  private terminalFocusTimer: number | null = null;
  private pickupTimer: number | null = null;
  private floorTransitionTimer: number | null = null;
  private activeNotice: FeedbackNotice | null = null;
  private readonly noticeQueue: FeedbackNotice[] = [];

  private readonly openTerminalHandler = (): void => this.openTerminal();
  private readonly keydownHandler = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.isTerminalOpen()) {
      event.preventDefault();
      this.closeTerminal();
      return;
    }
    if (event.key === "Tab" && this.isTerminalOpen()) {
      this.trapTerminalFocus(event);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && this.isTerminalOpen()) {
      event.preventDefault();
      void this.executeQuery();
      return;
    }
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (
      this.lastSnapshot?.mode === "combat" &&
      activeTag !== "textarea" &&
      activeTag !== "input" &&
      (event.code === "KeyQ" || event.code === "KeyS")
    ) {
      event.preventDefault();
      if (!canOpenCombatTerminal(this.lastSnapshot.mode, this.busy)) {
        this.sqlChord.reset();
        return;
      }
      if (this.sqlChord.keyDown(event.code)) this.openTerminal();
      return;
    }
    if (event.code === "KeyH" && activeTag !== "textarea" && activeTag !== "input") {
      event.preventDefault();
      this.requestHint();
    }
  };
  private readonly keyupHandler = (event: KeyboardEvent): void => {
    this.sqlChord.keyUp(event.code);
  };
  private readonly blurHandler = (): void => {
    this.sqlChord.reset();
  };
  private readonly milestoneHandler = (event: Event): void => {
    const milestone = (event as CustomEvent<{ type?: OnboardingMilestone }>).detail?.type;
    if (
      milestone === "player-step" ||
      milestone === "encounter-start" ||
      milestone === "item-pickup"
    ) {
      this.onboarding.advance(milestone);
    }
  };
  private readonly patrolHandler = (event: Event): void => {
    const moves = (event as CustomEvent<{ moves?: PatrolMove[] }>).detail?.moves;
    if (!Array.isArray(moves)) return;
    const markers = this.root.querySelectorAll<SVGRectElement>(
      "#castle-map .minimap-monster[data-monster-id]",
    );
    moves.forEach((move) => {
      const marker = Array.from(markers).find(
        (entry) => entry.dataset.monsterId === String(move.monsterId),
      );
      if (!marker) return;
      marker.setAttribute("x", String(move.to.x + 0.12));
      marker.setAttribute("y", String(move.to.y + 0.12));
      marker.setAttribute(
        "visibility",
        this.lastSnapshot.discoveredCells.includes(`${move.to.x}:${move.to.y}`)
          ? "visible"
          : "hidden",
      );
    });
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly session: GameSession,
    private readonly sql: SqlEngine,
    private readonly audio: ArcadeAudio,
    private readonly feedback: FeedbackDirector,
    private readonly onboarding: OnboardingController,
    private readonly getBattleScene: () => BattleScene | null,
  ) {}

  mount(): void {
    this.root.innerHTML = `
      <div class="page-frame">
        <header class="masthead">
          <div class="title-lockup">
            <p class="eyebrow">CASTLE RUN / SQL ROGUELITE</p>
            <h1><span>SQL</span> 魔王城</h1>
            <p class="title-sub">SELECT * FROM DUNGEON</p>
          </div>
          <div class="run-console">
            <div><span>FLOOR</span><strong id="floor-value">01</strong></div>
            <div><span>SEED</span><strong id="seed-value">—</strong></div>
            <button id="audio-toggle" type="button" class="audio-toggle" aria-pressed="false">♪ 声音开启</button>
            <label class="volume-control"><span>音量</span><input id="audio-volume" type="range" min="0" max="1" step="0.05" value="0.55"></label>
          </div>
        </header>

        <main class="game-layout">
          <section class="dungeon-panel" aria-label="SQL 魔王城房间">
            <div class="hud-strip">
              <div><span class="hud-label">生命</span><strong id="hp-value">2 / 2</strong></div>
              <div id="player-hp-progress" class="meter" role="progressbar" aria-label="玩家生命值" aria-valuemin="0" aria-valuenow="2" aria-valuemax="2"><span id="hp-meter"></span></div>
              <div class="level-chip"><span class="hud-label">等级</span><strong id="level-value">LV.1 · 0 / 2 XP</strong></div>
              <div><span class="hud-label">I/O 热量</span><strong id="heat-value">0</strong></div>
              <div id="heat-progress" class="meter heat" role="progressbar" aria-label="I/O 热量" aria-valuemin="0" aria-valuenow="0" aria-valuemax="100"><span id="heat-meter"></span></div>
              <div class="weapon-chip"><span class="hud-label">武器</span><strong id="weapon-name">数据之刃</strong></div>
              <div class="relic-chip"><span class="hud-label">遗物</span><strong id="relic-count">0</strong></div>
            </div>

            <div class="game-stage">
              <div id="game-root" class="game-root" tabindex="-1"></div>

              <article class="target-card" aria-label="当前怪物">
                <div class="target-card__kicker">ENCOUNTER / 当前记录</div>
                <strong id="target-name">等待进入课程房</strong>
                <div class="target-card__meta">
                  <span id="target-id">ID —</span>
                  <span id="target-species">species —</span>
                </div>
                <div class="target-card__hp-row">
                  <div id="target-hp-progress" class="target-card__hp" role="progressbar" aria-label="怪物生命值" aria-valuemin="0" aria-valuenow="0" aria-valuemax="1"><span id="target-hp-bar"></span></div>
                  <span id="target-hp-value">— / —</span>
                </div>
                <div class="target-card__intent">
                  <span>错误反击</span>
                  <b id="target-intent">等待遭遇</b>
                </div>
              </article>

              <aside id="pickup-card" class="pickup-card" role="status" aria-live="polite" aria-atomic="true" hidden>
                <span id="pickup-kind">LOOT / 自动生效</span>
                <strong id="pickup-name">获得道具</strong>
                <p id="pickup-description"></p>
                <small id="pickup-effect"></small>
              </aside>

              <section id="floor-portal" class="floor-portal" aria-live="assertive" hidden>
                <div class="floor-portal__ring floor-portal__ring--outer"></div>
                <div class="floor-portal__ring floor-portal__ring--inner"></div>
                <div class="floor-portal__tables" aria-hidden="true">
                  <span>MONSTERS</span><i>JOIN</i><span>ROOMS</span>
                </div>
                <strong>FLOOR 02 / 雷鸣奏鸣塔</strong>
                <p>关系已连接，正在自动传送…</p>
              </section>

              <div id="interaction-prompt" class="interaction-prompt">用 WASD 探索迷宫</div>

              <section id="combat-terminal" class="combat-terminal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="terminal-title" inert>
                <div class="terminal-topline">
                  <div>
                    <span class="terminal-prompt">QUERY CAST / 完整语句</span>
                    <strong id="terminal-title">SQL 攻击终端</strong>
                  </div>
                  <button id="close-terminal" type="button" class="icon-action" aria-label="关闭终端">ESC ×</button>
                </div>

                <div class="terminal-grid">
                  <section class="terminal-brief">
                    <div class="card-heading"><span>本回合任务</span><span id="query-counter">查询 0 次</span></div>
                    <p id="terminal-objective"></p>
                    <div id="lock-list" class="lock-list"></div>
                    <div id="schema-list" class="schema-list"></div>
                  </section>

                  <section class="terminal-editor">
                    <label class="sr-only" for="sql-editor">输入完整 SQL</label>
                    <textarea id="sql-editor" spellcheck="false" autocomplete="off" placeholder="在这里完整写出 SELECT ... FROM ...;"></textarea>
                    <div class="action-row">
                      <button id="execute-query" type="button" class="primary-action">执行 SQL 攻击 <kbd>Ctrl ↵</kbd></button>
                      <button id="request-hint" type="button" class="quiet-action">下一条提示 <kbd>H</kbd></button>
                    </div>
                    <p id="query-status" class="query-status">空输入不消耗回合；错误查询才会触发反击。</p>
                    <div id="hint-list" class="hint-list"></div>
                  </section>
                </div>

                <details class="terminal-evidence">
                  <summary>查看真实结果与 SQLite 查询路径</summary>
                  <div class="evidence-grid">
                    <div id="query-result" class="table-wrap empty-state">尚未执行本回合查询。</div>
                    <div id="query-plan" class="plan-list empty-state">等待 EXPLAIN QUERY PLAN。</div>
                  </div>
                </details>
              </section>
            </div>

            <div class="touch-controls" aria-label="游戏控制">
              <div class="dpad">
                <button type="button" data-move="up" aria-label="向上">▲</button>
                <button type="button" data-move="left" aria-label="向左">◀</button>
                <button type="button" data-move="down" aria-label="向下">▼</button>
                <button type="button" data-move="right" aria-label="向右">▶</button>
              </div>
              <button id="interact" type="button" class="touch-action interact-action">E<br><span>调查交互物</span></button>
              <button id="open-sql" type="button" class="touch-action sql-action">Q+S<br><span>SQL 战斗</span></button>
            </div>
          </section>

          <aside class="castle-rail" aria-label="魔王城迷宫、引导与任务">
            <section id="onboarding-card" class="onboarding-card" hidden>
              <div class="onboarding-card__topline">
                <span id="onboarding-step">GUIDE</span>
                <kbd id="onboarding-shortcut">WASD</kbd>
              </div>
              <h2 id="onboarding-title">先走一步</h2>
              <p id="onboarding-body"></p>
              <div class="onboarding-card__actions">
                <button id="skip-onboarding" type="button">跳过引导</button>
                <button id="replay-onboarding" type="button">重新教学</button>
              </div>
            </section>

            <section class="mission-card">
              <div class="mission-kicker" id="lesson-concept">当前房间</div>
              <h2 id="mission-title">载入魔王城…</h2>
              <p id="mission-body"></p>
              <p id="lesson-intro" class="lesson-intro"></p>
              <p id="banner" class="banner"></p>
            </section>

            <section class="castle-map-card" aria-label="魔王城发现式迷宫地图">
              <div class="card-heading"><span>迷宫勘测</span><span id="map-explored">探索后显形</span></div>
              <div id="castle-map" class="castle-map"></div>
              <div class="map-legend"><span class="legend-player">◆ 玩家</span><span class="legend-gate">▮ 门</span><span class="legend-monster">■ 怪物</span><span class="legend-item">◆ 道具</span></div>
            </section>

            <section class="mastery-card">
              <div class="card-heading"><span>永久 SQL 图鉴</span><span id="victory-count">通关 0</span></div>
              <div id="mastery-list" class="mastery-list"></div>
              <div id="relic-list" class="relic-list">本轮尚无遗物</div>
            </section>

            <section class="control-card">
              <div class="card-heading"><span>行动规则</span><span>无倒计时</span></div>
              <p><kbd>WASD</kbd> 探索迷宫　触碰怪物所在格进入对战　走到松散掉落上自动拾取</p>
              <p><kbd>E</kbd> 只调查祭坛、篝火和宝箱，不会用于拾取怪物掉落。</p>
              <p><kbd>Q + S</kbd> 打开终端　<kbd>Ctrl + Enter</kbd> 执行完整 SQL</p>
              <p>死亡只重置当前 Run；知识图鉴与练习次数永久保留。</p>
              <button id="replay-onboarding-control" type="button" class="guide-replay">↺ 重新教学</button>
            </section>

            <button id="reset-game" type="button" class="reset-action">生成新迷宫 / 开始新 Run</button>
          </aside>
        </main>

        <footer class="page-footer">
          <span>真实执行：SQLite WASM</span>
          <span>地图：64×48 Seeded 迷宫</span>
          <span>音乐：公版古典语汇电子编曲 + 原创战斗曲</span>
          <span>关键装备：固定掉落</span>
        </footer>

        <div id="feedback-toast" class="feedback-toast" role="status" aria-live="polite" aria-atomic="true"></div>
      </div>
    `;

    this.textarea = requiredElement(this.root, "#sql-editor");
    this.queryStatus = requiredElement(this.root, "#query-status");
    this.resultRoot = requiredElement(this.root, "#query-result");
    this.planRoot = requiredElement(this.root, "#query-plan");
    this.hintsRoot = requiredElement(this.root, "#hint-list");
    this.terminal = requiredElement(this.root, "#combat-terminal");
    this.executeButton = requiredElement(this.root, "#execute-query");
    this.sqlButton = requiredElement(this.root, "#open-sql");
    this.audioButton = requiredElement(this.root, "#audio-toggle");

    const listenerOptions = { signal: this.listenerController.signal };
    this.executeButton.addEventListener("click", () => void this.executeQuery(), listenerOptions);
    requiredElement(this.root, "#close-terminal").addEventListener("click", () => this.closeTerminal(), listenerOptions);
    requiredElement(this.root, "#request-hint").addEventListener("click", () => this.requestHint(), listenerOptions);
    requiredElement(this.root, "#interact").addEventListener("click", dispatchInteract, listenerOptions);
    this.sqlButton.addEventListener("click", () => this.openTerminal(), listenerOptions);
    requiredElement(this.root, "#reset-game").addEventListener("click", () => this.reset(), listenerOptions);
    requiredElement(this.root, "#skip-onboarding").addEventListener("click", () => this.onboarding.skip(), listenerOptions);
    requiredElement(this.root, "#replay-onboarding").addEventListener("click", () => this.onboarding.replay(), listenerOptions);
    requiredElement(this.root, "#replay-onboarding-control").addEventListener("click", () => this.onboarding.replay(), listenerOptions);
    this.audioButton.addEventListener("click", () => void this.toggleAudio(), listenerOptions);
    requiredElement<HTMLInputElement>(this.root, "#audio-volume").addEventListener("input", (event) => {
      this.audio.setVolume(Number((event.currentTarget as HTMLInputElement).value));
    }, listenerOptions);

    this.root.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => {
      button.addEventListener("click", () => {
        const directions: Record<string, [number, number]> = {
          up: [0, -1],
          down: [0, 1],
          left: [-1, 0],
          right: [1, 0],
        };
        const direction = directions[button.dataset.move ?? ""];
        if (direction) dispatchMove(direction[0], direction[1]);
      }, listenerOptions);
    });

    this.releaseAudioGesture = this.audio.armFirstGesture(window);
    window.addEventListener("dungeon:open-terminal", this.openTerminalHandler, listenerOptions);
    window.addEventListener("dungeon:milestone", this.milestoneHandler, listenerOptions);
    window.addEventListener("dungeon:patrol", this.patrolHandler, listenerOptions);
    window.addEventListener("keydown", this.keydownHandler, listenerOptions);
    window.addEventListener("keyup", this.keyupHandler, listenerOptions);
    window.addEventListener("blur", this.blurHandler, listenerOptions);
    this.unsubscribeFeedback = this.feedback.subscribe((_event, notice) => {
      if (notice) this.showFeedbackNotice(notice);
    });
    this.unsubscribeOnboarding = this.onboarding.subscribe((snapshot) => {
      this.renderOnboarding(snapshot);
    });
    this.unsubscribeSession = this.session.subscribe((snapshot) => this.render(snapshot));
  }

  destroy(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.unsubscribeFeedback?.();
    this.unsubscribeFeedback = null;
    this.unsubscribeOnboarding?.();
    this.unsubscribeOnboarding = null;
    this.releaseAudioGesture?.();
    this.releaseAudioGesture = null;
    this.listenerController.abort();
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.activeNotice = null;
    this.noticeQueue.length = 0;
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = null;
    if (this.pickupTimer !== null) window.clearTimeout(this.pickupTimer);
    this.pickupTimer = null;
    if (this.floorTransitionTimer !== null) window.clearTimeout(this.floorTransitionTimer);
    this.floorTransitionTimer = null;
    this.root.classList.remove("terminal-active");
    void this.audio.dispose();
  }

  private async executeQuery(): Promise<void> {
    if (this.busy) return;
    if (!this.textarea.value.trim()) {
      const message = "先写一条完整 SELECT；空输入不会消耗回合。";
      this.queryStatus.textContent = message;
      this.queryStatus.dataset.kind = "warning";
      this.showFeedbackNotice({ message, tone: "info" });
      return;
    }

    let reopenAfterResolution = false;
    this.busy = true;
    requiredElement(this.root, ".game-stage").classList.add("is-resolving");
    this.executeButton.disabled = true;
    this.sqlButton.disabled = true;
    try {
      let result: SqlQueryResult | null = null;
      let queryError: unknown = null;
      try {
        result = this.sql.executeSelect(this.textarea.value);
      } catch (error) {
        queryError = error;
      }

      let resolution: TurnResolution;
      if (result) {
        resolution = this.session.resolveQuery(result);
        if (resolution.hpUpdates.length > 0) this.sql.updateMonsterHp(resolution.hpUpdates);
        this.renderResult(result);
        this.queryStatus.textContent = resolution.message;
        this.queryStatus.dataset.kind = resolution.accepted ? "success" : "warning";
        this.showFeedbackNotice({
          message: resolution.message,
          tone: resolution.accepted ? "success" : "danger",
        });
      } else {
        const message = queryError instanceof Error ? queryError.message : "查询执行失败。";
        resolution = this.session.registerQueryError(message);
        this.queryStatus.textContent = resolution.message;
        this.queryStatus.dataset.kind = "error";
        this.showFeedbackNotice({ message: resolution.message, tone: "danger" });
      }

      if (resolution.accepted && resolution.lessonCompleted) {
        this.onboarding.advance("query-accepted");
      }
      this.closeTerminal(true);
      try {
        await this.getBattleScene()?.animateTurn(resolution);
      } catch (error) {
        console.error("战斗动画播放失败", error);
        const message = `${resolution.message}（动画未播放，但回合状态已结算。）`;
        this.queryStatus.textContent = message;
        this.queryStatus.dataset.kind = "error";
        this.showFeedbackNotice({ message, tone: "danger" });
        if (resolution.mode !== "combat") this.getBattleScene()?.abortEncounter();
      }
      reopenAfterResolution = resolution.mode === "combat";
    } catch (error) {
      console.error("战斗回合结算失败", error);
      const message = "回合结算遇到内部错误，没有追加怪物反击。请重新打开终端再试。";
      this.queryStatus.textContent = message;
      this.queryStatus.dataset.kind = "error";
      this.showFeedbackNotice({ message, tone: "danger" });
      try {
        this.sql.reset(this.session.snapshot().monsters);
      } catch (recoveryError) {
        console.error("教学数据库恢复失败", recoveryError);
      }
      if (this.session.snapshot().mode !== "combat") {
        this.getBattleScene()?.abortEncounter();
      }
      this.closeTerminal(true);
    } finally {
      this.busy = false;
      requiredElement(this.root, ".game-stage").classList.remove("is-resolving");
      this.executeButton.disabled = false;
      this.sqlButton.disabled = this.lastSnapshot?.mode !== "combat";
      if (reopenAfterResolution) this.openTerminal();
    }
  }

  private openTerminal(): void {
    if (this.busy) return;
    if (!canOpenCombatTerminal(this.lastSnapshot?.mode, this.busy)) {
      if (this.lastSnapshot) {
        const message = "在迷宫中触碰怪物所在格后，SQL 终端才会解锁。";
        requiredElement(this.root, "#banner").textContent = message;
        this.showFeedbackNotice({ message, tone: "info" });
      }
      return;
    }
    if (!this.isTerminalOpen()) {
      this.focusBeforeTerminal = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    void this.audio.resume();
    this.terminal.classList.add("is-open");
    this.root.classList.add("terminal-active");
    this.terminal.inert = false;
    this.terminal.setAttribute("aria-hidden", "false");
    this.onboarding.advance("terminal-open");
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = window.setTimeout(() => {
      this.terminalFocusTimer = null;
      if (!this.busy && this.isTerminalOpen()) this.textarea.focus();
    }, 60);
  }

  private closeTerminal(returnFocus = true): void {
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = null;
    this.terminal.classList.remove("is-open");
    this.root.classList.remove("terminal-active");
    this.terminal.inert = true;
    this.terminal.setAttribute("aria-hidden", "true");
    if (returnFocus) {
      this.textarea.blur();
      const focusTarget = this.focusBeforeTerminal;
      this.focusBeforeTerminal = null;
      if (
        focusTarget?.isConnected &&
        !focusTarget.matches(":disabled") &&
        !this.terminal.contains(focusTarget)
      ) {
        focusTarget.focus();
      } else {
        requiredElement<HTMLElement>(this.root, "#game-root").focus();
      }
    }
  }

  private isTerminalOpen(): boolean {
    return this.terminal.classList.contains("is-open");
  }

  private trapTerminalFocus(event: KeyboardEvent): void {
    const focusable = Array.from(this.terminal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.closest("[inert]") && !element.hasAttribute("hidden"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      this.terminal.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !this.terminal.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !this.terminal.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  private showFeedbackNotice(notice: FeedbackNotice): void {
    if (this.activeNotice) {
      if (
        this.activeNotice.message === notice.message ||
        this.noticeQueue.some((entry) => entry.message === notice.message)
      ) return;
      this.noticeQueue.push(notice);
      if (this.noticeQueue.length > 4) this.noticeQueue.shift();
      return;
    }
    const toast = requiredElement(this.root, "#feedback-toast");
    this.activeNotice = notice;
    toast.replaceChildren(document.createTextNode(notice.message));
    toast.dataset.tone = notice.tone;
    toast.classList.add("is-visible");
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      this.toastTimer = null;
      this.activeNotice = null;
      const next = this.noticeQueue.shift();
      if (next) this.showFeedbackNotice(next);
    }, 2_400);
  }

  private showPickupCard(item: GroundItem, effect: string): void {
    const card = requiredElement<HTMLElement>(this.root, "#pickup-card");
    const kindLabel: Record<GroundItem["kind"], string> = {
      weapon: "WEAPON / 已自动装备",
      relic: "RELIC / 本轮自动生效",
      heal: "RECOVERY / 已立即生效",
      event: "EVENT / 已立即结算",
      key: "KEY ITEM / 已记录",
    };
    requiredElement(card, "#pickup-kind").textContent = kindLabel[item.kind];
    requiredElement(card, "#pickup-name").textContent = item.name;
    requiredElement(card, "#pickup-description").textContent = item.description;
    requiredElement(card, "#pickup-effect").textContent = effect;
    if (this.pickupTimer !== null) window.clearTimeout(this.pickupTimer);
    card.hidden = false;
    card.classList.add("is-visible");
    this.pickupTimer = window.setTimeout(() => {
      card.classList.remove("is-visible");
      card.hidden = true;
      this.pickupTimer = null;
    }, 6_000);
  }

  private requestHint(): void {
    if (this.busy) {
      this.showFeedbackNotice({ message: "当前回合正在结算，结束后再查看提示。", tone: "info" });
      return;
    }
    const message = this.session.requestHint();
    this.showFeedbackNotice({ message, tone: "info" });
  }

  private renderOnboarding(snapshot: OnboardingSnapshot): void {
    const card = requiredElement<HTMLElement>(this.root, "#onboarding-card");
    card.hidden = !snapshot.visible;
    if (!snapshot.visible) return;
    requiredElement(card, "#onboarding-step").textContent = `GUIDE / ${snapshot.step.id.toUpperCase()}`;
    requiredElement(card, "#onboarding-title").textContent = snapshot.step.title;
    requiredElement(card, "#onboarding-body").textContent = snapshot.step.body;
    requiredElement(card, "#onboarding-shortcut").textContent = snapshot.step.shortcut;
  }

  private renderProgress(
    progressSelector: string,
    barSelector: string,
    rawValue: number,
    rawMax: number,
    valueText: string,
  ): void {
    const max = Math.max(1, rawMax);
    const value = Math.min(max, Math.max(0, rawValue));
    const progress = requiredElement<HTMLElement>(this.root, progressSelector);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuenow", String(value));
    progress.setAttribute("aria-valuemax", String(max));
    progress.setAttribute("aria-valuetext", valueText);
    requiredElement<HTMLElement>(this.root, barSelector).style.width = `${(value / max) * 100}%`;
  }

  private reset(): void {
    if (this.busy) {
      const message = "当前回合动画正在结算，结束后再开始新 Run。";
      requiredElement(this.root, "#banner").textContent = message;
      this.showFeedbackNotice({ message, tone: "info" });
      return;
    }
    this.closeTerminal(true);
    const battleScene = this.getBattleScene();
    this.session.reset(createRunSeed());
    this.sql.reset(this.session.snapshot().monsters);
    battleScene?.abortEncounter();
    this.clearQueryArtifacts();
    const message = "新迷宫已生成；永久 SQL 图鉴没有被删除。";
    this.queryStatus.textContent = message;
    this.queryStatus.dataset.kind = "success";
    this.showFeedbackNotice({ message, tone: "success" });
    this.audio.setMode("explore");
  }

  private async toggleAudio(): Promise<void> {
    await this.audio.initialize();
    const muted = this.audio.toggleMuted();
    this.audioButton.textContent = muted ? "♪ 声音关闭" : "♪ 声音开启";
    this.audioButton.setAttribute("aria-pressed", String(muted));
  }

  private render(snapshot: GameSnapshot): void {
    const pickedItems = this.lastSnapshot
      ? pickedItemsBetween(this.lastSnapshot, snapshot)
      : [];
    const room = snapshot.roomGraph.nodes.find((node) => node.id === snapshot.currentRoomId);
    const roomLesson = room?.lessonId
      ? LESSONS.find((lesson) => lesson.id === room.lessonId)
      : undefined;
    const combatLesson = snapshot.mode === "combat"
      ? LESSONS.find((lesson) => lesson.id === snapshot.lessonId)
      : undefined;
    const roomLabel = combatLesson?.concept ?? roomLesson?.concept
      ?? (snapshot.mode === "reward" ? "REWARD" : room?.type === "entry" ? "MAZE" : "EXPLORE");
    const target = snapshot.focusMonsterId === null
      ? undefined
      : snapshot.monsters.find((monster) => monster.id === snapshot.focusMonsterId);
    const stageChanged = snapshot.lessonStageId !== this.lastStageId;
    const enteredCombat = snapshot.mode === "combat" && this.lastMode !== "combat";
    this.lastSnapshot = snapshot;

    requiredElement(this.root, "#seed-value").textContent = snapshot.runSeed;
    requiredElement(this.root, "#floor-value").textContent = String(snapshot.floor).padStart(2, "0");
    this.root.dataset.floor = String(snapshot.floor);
    requiredElement(this.root, "#hp-value").textContent = `${snapshot.player.hp} / ${snapshot.player.maxHp}`;
    this.renderProgress(
      "#player-hp-progress",
      "#hp-meter",
      snapshot.player.hp,
      snapshot.player.maxHp,
      `${snapshot.player.hp} / ${snapshot.player.maxHp}`,
    );
    requiredElement(this.root, "#heat-value").textContent = String(snapshot.player.heat);
    this.renderProgress(
      "#heat-progress",
      "#heat-meter",
      snapshot.player.heat,
      100,
      `${snapshot.player.heat} / 100`,
    );
    requiredElement(this.root, "#weapon-name").textContent = snapshot.player.weapon.name;
    const nextXp = LEVEL_XP_THRESHOLDS[snapshot.player.level];
    requiredElement(this.root, "#level-value").textContent = nextXp === undefined
      ? `LV.${snapshot.player.level} · ${snapshot.player.xp} XP · MAX`
      : `LV.${snapshot.player.level} · ${snapshot.player.xp} / ${nextXp} XP`;
    requiredElement(this.root, "#relic-count").textContent = String(snapshot.relics.length);
    requiredElement(this.root, "#lesson-concept").textContent = `${snapshot.currentRoomType.toUpperCase()} / ${roomLabel}`;
    requiredElement(this.root, "#mission-title").textContent = snapshot.missionTitle;
    requiredElement(this.root, "#mission-body").textContent = snapshot.missionBody;
    requiredElement(this.root, "#lesson-intro").textContent = snapshot.lessonIntro;
    requiredElement(this.root, "#banner").textContent = snapshot.banner;
    requiredElement(this.root, "#interaction-prompt").textContent = snapshot.interactionPrompt;
    requiredElement(this.root, "#query-counter").textContent = `查询 ${snapshot.queryCount} 次`;
    requiredElement(this.root, "#terminal-title").textContent = `${snapshot.lessonId.toUpperCase()} · 阶段 ${snapshot.lessonStageIndex + 1} · 回合 ${snapshot.combat?.round ?? 1}`;
    requiredElement(this.root, "#terminal-objective").textContent = snapshot.missionBody;
    requiredElement(this.root, "#victory-count").textContent = `通关 ${snapshot.profile.victories}`;
    requiredElement(this.root, ".game-stage").classList.toggle("is-combat", snapshot.mode === "combat");
    this.sqlButton.disabled = snapshot.mode !== "combat" || this.busy;
    requiredElement<HTMLButtonElement>(this.root, "#reset-game").disabled =
      snapshot.mode === "transition";
    this.renderFloorTransition(snapshot);

    this.renderTarget(target, snapshot);
    this.renderLocks(snapshot);
    this.renderSchema(snapshot.schema);
    this.renderHints(snapshot.hints);
    this.renderMazeMap(snapshot);
    this.renderMastery(snapshot);
    this.renderRelics(snapshot);
    const latestPickup = pickedItems.at(-1);
    if (latestPickup) this.showPickupCard(latestPickup, snapshot.banner);

    if (stageChanged || enteredCombat) {
      this.textarea.value = "";
      this.clearQueryArtifacts();
      this.queryStatus.textContent = enteredCombat
        ? "怪物行动已预告。请从 SELECT 开始完整写出本回合 SQL。"
        : "目标已经变化，请重新写一条完整 SQL。";
      this.queryStatus.dataset.kind = "";
    }
    if (snapshot.mode !== "combat" && this.isTerminalOpen()) this.closeTerminal(true);

    const musicMode = snapshot.mode === "combat"
      ? target?.isBoss ? "boss" : "combat"
      : "explore";
    this.audio.setFloor(snapshot.floor);
    this.audio.setMode(musicMode);

    this.lastStageId = snapshot.lessonStageId;
    this.lastMode = snapshot.mode;
  }

  private renderFloorTransition(snapshot: GameSnapshot): void {
    const portal = requiredElement<HTMLElement>(this.root, "#floor-portal");
    const transitioning = snapshot.mode === "transition" && snapshot.floor === 1;
    portal.hidden = !transitioning;
    if (!transitioning || this.floorTransitionTimer !== null) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 350 : 1_200;
    this.floorTransitionTimer = window.setTimeout(() => {
      this.floorTransitionTimer = null;
      if (!this.session.advanceFloor()) return;
      const nextSnapshot = this.session.snapshot();
      this.sql.reset(nextSnapshot.monsters);
      this.clearQueryArtifacts();
      this.audio.setFloor(nextSnapshot.floor);
      this.audio.setMode("explore");
    }, delay);
  }

  private renderTarget(target: Monster | undefined, snapshot: GameSnapshot): void {
    requiredElement(this.root, "#target-name").textContent = target?.name ?? "当前房间没有怪物";
    requiredElement(this.root, "#target-id").textContent = target ? `ID #${target.id}` : "ID —";
    requiredElement(this.root, "#target-species").textContent = target
      ? `species = '${target.species}'`
      : snapshot.currentRoomTitle;
    this.renderProgress(
      "#target-hp-progress",
      "#target-hp-bar",
      target?.hp ?? 0,
      target?.maxHp ?? 1,
      target ? `${target.hp} / ${target.maxHp}` : "当前没有怪物",
    );
    requiredElement(this.root, "#target-hp-value").textContent = target
      ? `${target.hp} / ${target.maxHp}`
      : "— / —";
    requiredElement(this.root, "#target-intent").textContent = snapshot.combat
      ? `${snapshot.combat.intent.name} · 最高 ${snapshot.combat.intent.damage} 伤害`
      : target?.hp === 0
        ? "记录已清除"
        : target
          ? `${target.attackName} · 最高 ${target.damage} 伤害`
          : snapshot.claimableReward?.name ?? "探索 / 领取";
  }

  private renderLocks(snapshot: GameSnapshot): void {
    const root = requiredElement(this.root, "#lock-list");
    root.replaceChildren();
    snapshot.locks.forEach((lock) => {
      const chip = document.createElement("span");
      chip.textContent = lock;
      root.append(chip);
    });
  }

  private renderSchema(lines: string[]): void {
    const root = requiredElement(this.root, "#schema-list");
    root.replaceChildren();
    lines.forEach((line) => {
      const code = document.createElement("code");
      code.textContent = line;
      root.append(code);
    });
  }

  private renderHints(hints: string[]): void {
    this.hintsRoot.replaceChildren();
    hints.forEach((hint, index) => {
      const item = document.createElement("p");
      item.textContent = `提示 ${index + 1} · ${hint}`;
      this.hintsRoot.append(item);
    });
  }

  private renderMazeMap(snapshot: GameSnapshot): void {
    const root = requiredElement(this.root, "#castle-map");
    root.replaceChildren();
    const floor = snapshot.mazeFloor;
    const discovered = new Set(snapshot.discoveredCells);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${floor.width} ${floor.height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-label", `64 × 48 迷宫小地图，已探索 ${discovered.size} 格；未知区域隐藏。`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = "发现式迷宫小地图：移动探索后才会显示地面、门、怪物和道具。";
    svg.append(title);

    const floorCommands: string[] = [];
    discovered.forEach((cell) => {
      const [x, y] = cell.split(":").map(Number);
      if (
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        floor.tiles[y]?.[x] === "."
      ) {
        floorCommands.push(`M${x} ${y}h1v1h-1z`);
      }
    });
    if (floorCommands.length > 0) {
      const paths = document.createElementNS(SVG_NS, "path");
      paths.classList.add("minimap-floor");
      paths.setAttribute("d", floorCommands.join(""));
      svg.append(paths);
    }
    requiredElement(this.root, "#map-explored").textContent = `${floorCommands.length} 格已显形`;

    floor.gates.forEach((gate) => {
      if (!discovered.has(`${gate.x}:${gate.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-gate");
      const locked = !snapshot.availableRoomIds.includes(gate.roomNodeId);
      marker.classList.add(locked ? "is-locked" : "is-open");
      marker.setAttribute("x", String(gate.x + 0.15));
      marker.setAttribute("y", String(gate.y + 0.05));
      marker.setAttribute("width", "0.7");
      marker.setAttribute("height", "0.9");
      svg.append(marker);
    });

    snapshot.worldActors.forEach((actor) => {
      const monster = snapshot.monsters.find((entry) => entry.id === actor.monsterId);
      if (!monster || monster.hp <= 0) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-monster");
      if (monster.isBoss) marker.classList.add("is-boss");
      marker.dataset.monsterId = String(monster.id);
      marker.setAttribute("x", String(actor.x + 0.12));
      marker.setAttribute("y", String(actor.y + 0.12));
      marker.setAttribute("width", "0.76");
      marker.setAttribute("height", "0.76");
      marker.setAttribute(
        "visibility",
        discovered.has(`${actor.x}:${actor.y}`) ? "visible" : "hidden",
      );
      svg.append(marker);
    });

    snapshot.groundItems.forEach((item) => {
      if (!discovered.has(`${item.x}:${item.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-item", `is-${item.kind}`);
      marker.setAttribute("x", String(item.x + 0.22));
      marker.setAttribute("y", String(item.y + 0.22));
      marker.setAttribute("width", "0.56");
      marker.setAttribute("height", "0.56");
      marker.setAttribute("transform", `rotate(45 ${item.x + 0.5} ${item.y + 0.5})`);
      svg.append(marker);
    });

    const player = document.createElementNS(SVG_NS, "circle");
    player.classList.add("minimap-player");
    player.setAttribute("cx", String(snapshot.player.x + 0.5));
    player.setAttribute("cy", String(snapshot.player.y + 0.5));
    player.setAttribute("r", "0.62");
    svg.append(player);
    root.append(svg);
  }

  private renderMastery(snapshot: GameSnapshot): void {
    const root = requiredElement(this.root, "#mastery-list");
    root.replaceChildren();
    LESSONS.forEach((lesson) => {
      const chip = document.createElement("span");
      const mastered = snapshot.profile.masteredLessons.includes(lesson.id);
      chip.className = mastered ? "is-mastered" : "";
      chip.textContent = `${mastered ? "✓" : "○"} ${lesson.concept}`;
      root.append(chip);
    });
  }

  private renderRelics(snapshot: GameSnapshot): void {
    const root = requiredElement(this.root, "#relic-list");
    root.replaceChildren();
    if (snapshot.relics.length === 0) {
      root.textContent = "本轮尚无遗物";
      return;
    }
    snapshot.relics.forEach((relic) => {
      const item = document.createElement("span");
      item.title = relic.description;
      item.textContent = relic.name;
      root.append(item);
    });
  }

  private renderResult(result: SqlQueryResult): void {
    this.resultRoot.replaceChildren();
    this.resultRoot.className = "table-wrap";
    if (result.rows.length === 0) {
      this.resultRoot.classList.add("empty-state");
      this.resultRoot.textContent = "查询返回 0 行。";
    } else {
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      result.columns.forEach((column) => {
        const cell = document.createElement("th");
        cell.textContent = column;
        headRow.append(cell);
      });
      head.append(headRow);
      table.append(head);
      const body = document.createElement("tbody");
      result.rows.forEach((row) => {
        const rowElement = document.createElement("tr");
        result.columns.forEach((column) => {
          const cell = document.createElement("td");
          const value = row[column];
          cell.textContent = value === null ? "NULL" : String(value ?? "");
          rowElement.append(cell);
        });
        body.append(rowElement);
      });
      table.append(body);
      this.resultRoot.append(table);
    }

    this.planRoot.replaceChildren();
    this.planRoot.className = "plan-list";
    result.plan.forEach((detail, index) => {
      const line = document.createElement("div");
      line.className = "plan-line";
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const text = document.createElement("code");
      text.textContent = detail;
      line.append(number, text);
      this.planRoot.append(line);
    });
    if (result.plan.length === 0) {
      this.planRoot.classList.add("empty-state");
      this.planRoot.textContent = "SQLite 未返回查询计划。";
    }
  }

  private clearQueryArtifacts(): void {
    this.resultRoot.className = "table-wrap empty-state";
    this.resultRoot.textContent = "尚未执行本回合查询。";
    this.planRoot.className = "plan-list empty-state";
    this.planRoot.textContent = "等待 EXPLAIN QUERY PLAN。";
  }
}
