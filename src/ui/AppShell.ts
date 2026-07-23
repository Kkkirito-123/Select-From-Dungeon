import { ArcadeAudio } from "../audio/ArcadeAudio";
import type { OnboardingMilestone } from "../content/onboarding";
import { LESSONS } from "../content/mvpLevel";
import {
  COMPLETE_SCHEMA_LINES,
  SQL_RELATIONS,
  SQL_TABLES,
  sqlTable,
  type SqlTableName,
} from "../content/sqlSchema";
import { GameSession, LEVEL_XP_THRESHOLDS } from "../domain/GameSession";
import type {
  ExperienceSettlement,
  GameSnapshot,
  GroundItem,
  LootItem,
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
import {
  AnswerReviewView,
  type AnswerReviewScope,
} from "./AnswerReviewView";
import { SqlAutocompleteController } from "./sqlAutocomplete";
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

export function shouldDismissTransientCard(
  shownAtMove: number | null,
  currentTotalMoves: number,
): boolean {
  return shownAtMove !== null && currentTotalMoves - shownAtMove >= 3;
}

export interface CombatSettlementCopy {
  title: string;
  xp: string;
  progress: string;
  levelUp: string;
  reward: string;
}

export function combatSettlementCopy(
  experience: ExperienceSettlement,
  lootDropped: boolean,
): CombatSettlementCopy {
  const nextXp = LEVEL_XP_THRESHOLDS[experience.currentLevel];
  const progress = nextXp === undefined
    ? `LV.${experience.currentLevel} · ${experience.previousXp} → ${experience.currentXp} XP · MAX`
    : `LV.${experience.currentLevel} · ${experience.previousXp} → ${experience.currentXp} / ${nextXp} XP`;
  const levelUp = experience.currentLevel > experience.previousLevel
    ? `LEVEL UP · LV.${experience.previousLevel} → LV.${experience.currentLevel} · 生命上限 ${experience.previousMaxHp} → ${experience.currentMaxHp}`
    : "距离下一等级又近了一步";
  return {
    title: `击败 ${experience.monsterName}`,
    xp: `+${experience.gained} XP`,
    progress,
    levelUp,
    reward: lootDropped
      ? "战利品包已出现在怪物位置 · 靠近后按 E 打开"
      : "本次没有物品掉落 · 经验已正常结算",
  };
}

export class AppShell {
  private textarea!: HTMLTextAreaElement;
  private gateTextarea!: HTMLTextAreaElement;
  private queryStatus!: HTMLElement;
  private gateQueryStatus!: HTMLElement;
  private resultRoot!: HTMLElement;
  private planRoot!: HTMLElement;
  private hintsRoot!: HTMLElement;
  private terminal!: HTMLElement;
  private gateTerminal!: HTMLElement;
  private campfireMenu!: HTMLElement;
  private inventoryMenu!: HTMLElement;
  private lootMenu!: HTMLElement;
  private answerReview!: AnswerReviewView;
  private executeButton!: HTMLButtonElement;
  private gateExecuteButton!: HTMLButtonElement;
  private sqlButton!: HTMLButtonElement;
  private audioButton!: HTMLButtonElement;
  private combatAutocomplete!: SqlAutocompleteController;
  private gateAutocomplete!: SqlAutocompleteController;
  private lastStageId: GameSnapshot["lessonStageId"] | null = null;
  private lastMode: GameSnapshot["mode"] | null = null;
  private lastSnapshot!: GameSnapshot;
  private selectedSchemaTable: SqlTableName = "monsters";
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
  private pickupShownAtMove: number | null = null;
  private settlementShownAtMove: number | null = null;
  private floorTransitionTimer: number | null = null;
  private defeatRespawnTimer: number | null = null;
  private reviewContext: "manual" | "campfire" | "death" = "manual";
  private reviewScope: AnswerReviewScope = "all";
  private activeNotice: FeedbackNotice | null = null;
  private readonly noticeQueue: FeedbackNotice[] = [];

  private readonly openTerminalHandler = (): void => this.openTerminal();
  private readonly keydownHandler = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.isReviewOpen()) {
      event.preventDefault();
      this.closeReview();
      return;
    }
    if (event.key === "Escape" && this.isLootMenuOpen()) {
      event.preventDefault();
      this.closeLootMenu();
      return;
    }
    if (event.key === "Escape" && this.isInventoryMenuOpen()) {
      event.preventDefault();
      this.closeInventoryMenu();
      return;
    }
    if (event.key === "Escape" && this.isCampfireMenuOpen()) {
      event.preventDefault();
      this.leaveCampfire();
      return;
    }
    if (event.key === "Escape" && this.isGateTerminalOpen()) {
      event.preventDefault();
      this.closeGateTerminal();
      return;
    }
    if (event.key === "Escape" && this.isTerminalOpen()) {
      event.preventDefault();
      this.closeTerminal();
      return;
    }
    if (
      event.key === "Tab" &&
      (
        this.isReviewOpen() ||
        this.isLootMenuOpen() ||
        this.isInventoryMenuOpen() ||
        this.isCampfireMenuOpen() ||
        this.isTerminalOpen() ||
        this.isGateTerminalOpen()
      )
    ) {
      this.trapDialogFocus(
        event,
        this.isReviewOpen()
          ? this.answerReview.element
          : this.isLootMenuOpen()
            ? this.lootMenu
          : this.isInventoryMenuOpen()
            ? this.inventoryMenu
          : this.isCampfireMenuOpen()
            ? this.campfireMenu
          : this.isGateTerminalOpen() ? this.gateTerminal : this.terminal,
      );
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "Enter" &&
      this.isGateTerminalOpen()
    ) {
      event.preventDefault();
      void this.executeGateChallenge();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && this.isTerminalOpen()) {
      event.preventDefault();
      void this.executeQuery();
      return;
    }
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (
      event.code === "KeyB" &&
      activeTag !== "textarea" &&
      activeTag !== "input" &&
      activeTag !== "select" &&
      (this.lastSnapshot?.mode === "explore" || this.lastSnapshot?.mode === "campfire")
    ) {
      event.preventDefault();
      this.session.openInventory();
      return;
    }
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
    const schemaFieldCount = SQL_TABLES.reduce(
      (total, table) => total + table.columns.length,
      0,
    );
    this.root.innerHTML = `
      <div class="page-frame">
        <header class="masthead">
          <div class="title-lockup">
            <p class="eyebrow">CASTLE RUN / SQL ROGUELITE</p>
            <h1><span>SQL</span> 魔王城</h1>
            <p class="title-sub">SELECT * FROM DUNGEON</p>
          </div>
          <div class="run-console">
            <div><span>FLOOR</span><strong id="floor-value">01 / 08</strong></div>
            <div><span>SEED</span><strong id="seed-value">—</strong></div>
            <button id="open-review" type="button" class="review-toggle">▤ 答题复盘</button>
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
              <div class="armor-chip"><span class="hud-label">防具</span><strong id="armor-name">无防具</strong></div>
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

              <aside id="combat-result-card" class="combat-result-card" role="status" aria-live="assertive" aria-atomic="true" hidden>
                <span>VICTORY / 战斗结算</span>
                <strong id="combat-result-title">击败怪物</strong>
                <div class="combat-result-card__xp">
                  <b id="combat-result-xp">+0 XP</b>
                  <code id="combat-result-progress">LV.1 · 0 / 2 XP</code>
                </div>
                <p id="combat-result-level"></p>
                <small id="combat-result-reward"></small>
              </aside>

              <section id="campfire-menu" class="campfire-menu" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="campfire-menu-title" inert hidden>
                <div class="campfire-menu__pixel-fire" aria-hidden="true">
                  <i></i><i></i><i></i>
                </div>
                <span>CAMPFIRE / SAFE ZONE</span>
                <h2 id="campfire-menu-title">篝火</h2>
                <p id="campfire-menu-status">选择接下来的行动。</p>
                <div class="campfire-menu__actions">
                  <button id="rest-at-campfire" type="button" class="primary-action">在此休息</button>
                  <button id="review-at-campfire" type="button" class="quiet-action">答案复盘</button>
                  <button id="open-campfire-inventory" type="button" class="quiet-action">打开背包</button>
                </div>
                <button id="leave-campfire" type="button" class="campfire-menu__leave">ESC · 返回探索</button>
              </section>

              <section id="inventory-menu" class="loadout-menu" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="inventory-menu-title" inert hidden>
                <header class="loadout-menu__header">
                  <div><span>LOADOUT / 本轮构筑</span><h2 id="inventory-menu-title">装备背包</h2></div>
                  <button id="close-inventory" type="button" class="icon-action">ESC ×</button>
                </header>
                <div id="equipped-summary" class="equipped-summary"></div>
                <div class="loadout-menu__section">
                  <div class="card-heading"><span>装备背包</span><span id="equipment-capacity">0 / 12</span></div>
                  <div id="equipment-inventory" class="inventory-grid"></div>
                </div>
                <div class="loadout-menu__section">
                  <div class="card-heading"><span>恢复品</span><span id="consumable-capacity">0 / 3</span></div>
                  <div id="consumable-inventory" class="inventory-grid inventory-grid--consumables"></div>
                </div>
                <div class="loadout-menu__section">
                  <div class="card-heading"><span>关键物品</span><span>不占背包</span></div>
                  <div id="key-inventory" class="key-inventory"></div>
                </div>
                <p class="loadout-menu__note">战斗中不能换装。丢弃的普通物品会留在脚下，本层结束后消失。</p>
              </section>

              <section id="loot-menu" class="loadout-menu loot-menu" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="loot-menu-title" inert hidden>
                <header class="loadout-menu__header">
                  <div><span>LOOT BUNDLE / 独立掉落判定</span><h2 id="loot-menu-title">战利品包</h2></div>
                  <button id="close-loot" type="button" class="icon-action">ESC ×</button>
                </header>
                <p id="loot-menu-status" class="loadout-menu__note">选择收入背包或立即装备；未处理物品会保留在地图。</p>
                <div id="loot-items" class="loot-grid"></div>
                <button id="take-all-loot" type="button" class="primary-action loot-menu__take-all">尽量全部收入背包</button>
              </section>

              <section id="floor-portal" class="floor-portal" aria-live="assertive" hidden>
                <div class="floor-portal__ring floor-portal__ring--outer"></div>
                <div class="floor-portal__ring floor-portal__ring--inner"></div>
                <div class="floor-portal__tables" aria-hidden="true">
                  <span>MONSTERS</span><i>JOIN</i><span>ROOMS</span>
                </div>
                <strong id="floor-clear-title">FLOOR 01 CLEARED</strong>
                <p id="floor-clear-copy">CONGRATULATIONS!!</p>
              </section>

              <section id="run-state-overlay" class="run-state-overlay" aria-live="assertive" hidden>
                <span>DEFEAT / CHECKPOINT</span>
                <strong>YOU DIED</strong>
                <p>正在返回最近休息的篝火…</p>
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
                    <details class="terminal-schema-reference">
                      <summary>完整字段速查 <span>${SQL_TABLES.length} TABLES</span></summary>
                      <div id="terminal-schema-reference" class="schema-reference-grid"></div>
                    </details>
                  </section>

                  <section class="terminal-editor">
                    <label class="sr-only" for="sql-editor">输入完整 SQL</label>
                    <div class="sql-editor-shell">
                      <textarea id="sql-editor" spellcheck="false" autocomplete="off" placeholder="在这里完整写出 SELECT ... FROM ...;"></textarea>
                      <div class="sql-assist-rail" aria-hidden="true">
                        <span>PLAN ASSIST / 查询提示</span>
                        <span data-assist-count>CTRL SPACE</span>
                      </div>
                      <div id="sql-suggestions" class="sql-suggestions" role="listbox" aria-label="SQL 输入建议" hidden></div>
                    </div>
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

              <section id="gate-terminal" class="combat-terminal gate-terminal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="gate-terminal-title" inert>
                <div class="terminal-topline gate-terminal__topline">
                  <div>
                    <span class="terminal-prompt">OPTIONAL BREACH / 越级机关</span>
                    <strong id="gate-terminal-title">高难 SQL 机关</strong>
                  </div>
                  <button id="close-gate-terminal" type="button" class="icon-action" aria-label="退出机关破解">ESC 安全退出</button>
                </div>

                <div class="terminal-grid gate-terminal__grid">
                  <section class="terminal-brief gate-terminal__brief">
                    <div class="breach-risk"><span>RISK</span><strong>错误查询造成 1 点伤害 · 护甲优先</strong></div>
                    <p id="gate-terminal-objective"></p>
                    <div id="gate-challenge-schema" class="schema-list"></div>
                    <details class="terminal-schema-reference terminal-schema-reference--gate">
                      <summary>完整字段速查 <span>${SQL_TABLES.length} TABLES</span></summary>
                      <div id="gate-schema-reference" class="schema-reference-grid"></div>
                    </details>
                    <details class="breach-hints">
                      <summary>分级破解提示 / 不直接给答案</summary>
                      <div id="gate-challenge-hints" class="hint-list"></div>
                    </details>
                    <p class="breach-note">成功只打开这一扇物理门；不会获得课程掌握、XP 或战利品。</p>
                  </section>

                  <section class="terminal-editor gate-terminal__editor">
                    <label class="sr-only" for="gate-sql-editor">输入机关破解 SQL</label>
                    <div class="sql-editor-shell sql-editor-shell--gate">
                      <textarea id="gate-sql-editor" spellcheck="false" autocomplete="off" placeholder="写出完整查询计划，破解结果集校验…"></textarea>
                      <div class="sql-assist-rail" aria-hidden="true">
                        <span>BREACH ASSIST / 机关提示</span>
                        <span data-assist-count>CTRL SPACE</span>
                      </div>
                      <div id="gate-sql-suggestions" class="sql-suggestions" role="listbox" aria-label="机关 SQL 输入建议" hidden></div>
                    </div>
                    <div class="action-row">
                      <button id="execute-gate-query" type="button" class="primary-action breach-action">执行越级校验 <kbd>Ctrl ↵</kbd></button>
                      <button id="cancel-gate-query" type="button" class="quiet-action">断开连接，不扣血</button>
                    </div>
                    <p id="gate-query-status" class="query-status">空输入不触发反噬；语法或结果错误才扣除 1 点生命。</p>
                  </section>
                </div>

                <details class="terminal-evidence">
                  <summary>查看机关返回值与 SQLite 查询路径</summary>
                  <div class="evidence-grid">
                    <div id="gate-query-result" class="table-wrap empty-state">尚未执行机关查询。</div>
                    <div id="gate-query-plan" class="plan-list empty-state">等待 EXPLAIN QUERY PLAN。</div>
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
              <button id="open-inventory" type="button" class="touch-action inventory-action">B<br><span>背包 / 换装</span></button>
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
              <div class="map-legend"><span class="legend-player">◆ 玩家</span><span class="legend-route">◇ 路标</span><span class="legend-campfire">♨ 篝火</span><span class="legend-shortcut">▣ 捷径</span><span class="legend-gate">▮ 门</span><span class="legend-monster">■ 怪物</span><span class="legend-item">◆ 道具</span></div>
            </section>

            <section class="mastery-card">
              <div class="card-heading"><span>永久 SQL 图鉴</span><span id="victory-count">通关 0</span></div>
              <div id="mastery-list" class="mastery-list"></div>
              <div id="relic-list" class="relic-list">本轮尚无遗物</div>
            </section>

            <section class="schema-codex-card" aria-labelledby="schema-codex-title">
              <div class="card-heading">
                <span id="schema-codex-title">SCHEMA CODEX / 字段图鉴</span>
                <span>${SQL_TABLES.length} TABLES · ${schemaFieldCount} FIELDS</span>
              </div>
              <p class="schema-codex-intro">完整字段、类型、空值与关系。切换表查看，不会改变当前任务。</p>
              <div id="schema-table-tabs" class="schema-table-tabs" role="tablist" aria-label="选择数据表"></div>
              <div id="schema-table-panel" class="schema-table-panel" role="tabpanel"></div>
              <div id="schema-relation-trace" class="schema-relation-trace"></div>
              <p class="schema-codex-note">REF 表示教学 JOIN 关系；SQLite 当前未声明 FOREIGN KEY 约束。</p>
            </section>

            <section class="control-card">
              <div class="card-heading"><span>行动规则</span><span>无倒计时</span></div>
              <p><kbd>WASD</kbd> 探索迷宫　触碰怪物所在格进入对战　随机遭遇可能掉落低概率物品</p>
              <p><kbd>E</kbd> 打开补给与战利品、使用钥匙捷径，或调查祭坛、篝火和高难 SQL 机关。</p>
              <p><kbd>B</kbd> 在探索或篝火处打开背包；战斗中不能换装。</p>
              <p><kbd>Q + S</kbd> 打开终端　<kbd>Ctrl + Enter</kbd> 执行完整 SQL</p>
              <p>死亡后返回最近休息的篝火；未记录篝火时返回本层出生安全区，局内进度保留。</p>
              <button id="replay-onboarding-control" type="button" class="guide-replay">↺ 重新教学</button>
            </section>

            <button id="reset-game" type="button" class="reset-action">生成新迷宫 / 开始新 Run</button>
          </aside>
        </main>

        <section id="answer-review" class="answer-review" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="answer-review-title" inert>
          <div class="answer-review__panel">
            <header class="answer-review__header">
              <div>
                <span>LOCAL REVIEW / 本地记录</span>
                <h2 id="answer-review-title">答题复盘</h2>
                <p id="answer-review-description">只保存在本地：记录提交的 SQL 回合，不记录移动或按键，也不会上传。</p>
              </div>
              <button id="close-review" type="button" class="icon-action" aria-label="关闭答题复盘">ESC ×</button>
            </header>
            <div class="answer-review__columns">
              <section class="answer-review__section" data-review-section="battle" aria-labelledby="battle-review-title">
                <div class="card-heading">
                  <span id="battle-review-title">最近一场战斗</span>
                  <span id="battle-review-summary">0 次作答</span>
                </div>
                <div id="battle-review-list" class="answer-review__list"></div>
              </section>
              <section class="answer-review__section" data-review-section="floor" aria-labelledby="floor-review-title">
                <div class="card-heading">
                  <span id="floor-review-title">当前楼层</span>
                  <span id="floor-review-summary">0 次作答</span>
                </div>
                <div id="floor-review-list" class="answer-review__list"></div>
              </section>
            </div>
          </div>
        </section>

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
    this.gateTextarea = requiredElement(this.root, "#gate-sql-editor");
    this.queryStatus = requiredElement(this.root, "#query-status");
    this.gateQueryStatus = requiredElement(this.root, "#gate-query-status");
    this.resultRoot = requiredElement(this.root, "#query-result");
    this.planRoot = requiredElement(this.root, "#query-plan");
    this.hintsRoot = requiredElement(this.root, "#hint-list");
    this.terminal = requiredElement(this.root, "#combat-terminal");
    this.gateTerminal = requiredElement(this.root, "#gate-terminal");
    this.campfireMenu = requiredElement(this.root, "#campfire-menu");
    this.inventoryMenu = requiredElement(this.root, "#inventory-menu");
    this.lootMenu = requiredElement(this.root, "#loot-menu");
    this.answerReview = new AnswerReviewView(this.root);
    this.executeButton = requiredElement(this.root, "#execute-query");
    this.gateExecuteButton = requiredElement(this.root, "#execute-gate-query");
    this.sqlButton = requiredElement(this.root, "#open-sql");
    this.audioButton = requiredElement(this.root, "#audio-toggle");
    this.combatAutocomplete = new SqlAutocompleteController(
      this.textarea,
      requiredElement(this.root, "#sql-suggestions"),
      this.listenerController.signal,
    );
    this.gateAutocomplete = new SqlAutocompleteController(
      this.gateTextarea,
      requiredElement(this.root, "#gate-sql-suggestions"),
      this.listenerController.signal,
    );
    this.renderCompactSchema(requiredElement(this.root, "#terminal-schema-reference"));
    this.renderCompactSchema(requiredElement(this.root, "#gate-schema-reference"));
    this.renderSchemaCodex();

    const listenerOptions = { signal: this.listenerController.signal };
    this.executeButton.addEventListener("click", () => void this.executeQuery(), listenerOptions);
    this.gateExecuteButton.addEventListener(
      "click",
      () => void this.executeGateChallenge(),
      listenerOptions,
    );
    requiredElement(this.root, "#close-terminal").addEventListener("click", () => this.closeTerminal(), listenerOptions);
    requiredElement(this.root, "#close-gate-terminal").addEventListener(
      "click",
      () => this.closeGateTerminal(),
      listenerOptions,
    );
    requiredElement(this.root, "#cancel-gate-query").addEventListener(
      "click",
      () => this.closeGateTerminal(),
      listenerOptions,
    );
    requiredElement(this.root, "#request-hint").addEventListener("click", () => this.requestHint(), listenerOptions);
    requiredElement(this.root, "#open-review").addEventListener("click", () => this.openReview(), listenerOptions);
    requiredElement(this.root, "#close-review").addEventListener("click", () => this.closeReview(), listenerOptions);
    requiredElement(this.root, "#rest-at-campfire").addEventListener(
      "click",
      () => this.restAtCampfire(),
      listenerOptions,
    );
    requiredElement(this.root, "#review-at-campfire").addEventListener(
      "click",
      () => this.openReview("floor", "campfire"),
      listenerOptions,
    );
    requiredElement(this.root, "#leave-campfire").addEventListener(
      "click",
      () => this.leaveCampfire(),
      listenerOptions,
    );
    requiredElement(this.root, "#open-campfire-inventory").addEventListener(
      "click",
      () => this.session.openInventory(),
      listenerOptions,
    );
    requiredElement(this.root, "#open-inventory").addEventListener(
      "click",
      () => this.session.openInventory(),
      listenerOptions,
    );
    requiredElement(this.root, "#close-inventory").addEventListener(
      "click",
      () => this.closeInventoryMenu(),
      listenerOptions,
    );
    requiredElement(this.root, "#close-loot").addEventListener(
      "click",
      () => this.closeLootMenu(),
      listenerOptions,
    );
    requiredElement(this.root, "#take-all-loot").addEventListener(
      "click",
      () => {
        const bundleId = this.lastSnapshot.activeLootBundleId;
        if (!bundleId) return;
        const before = this.lastSnapshot.lootBundles
          .find((bundle) => bundle.id === bundleId)
          ?.items ?? [];
        const resolution = this.session.takeAllLoot(bundleId);
        const remaining = new Set(resolution.remainingItemIds);
        const acquired = before.filter((item) => !remaining.has(item.dropId));
        if (resolution.ok) {
          this.presentLootAcquisition(acquired, resolution.message);
        } else {
          this.showFeedbackNotice({
            message: resolution.message,
            tone: "info",
          });
        }
      },
      listenerOptions,
    );
    requiredElement(this.root, "#equipment-inventory").addEventListener(
      "click",
      (event) => this.handleInventoryAction(event),
      listenerOptions,
    );
    requiredElement(this.root, "#consumable-inventory").addEventListener(
      "click",
      (event) => this.handleInventoryAction(event),
      listenerOptions,
    );
    requiredElement(this.root, "#loot-items").addEventListener(
      "click",
      (event) => this.handleLootAction(event),
      listenerOptions,
    );
    requiredElement(this.root, "#interact").addEventListener("click", dispatchInteract, listenerOptions);
    this.sqlButton.addEventListener("click", () => this.openTerminal(), listenerOptions);
    requiredElement(this.root, "#reset-game").addEventListener("click", () => this.reset(), listenerOptions);
    requiredElement(this.root, "#skip-onboarding").addEventListener("click", () => this.onboarding.skip(), listenerOptions);
    requiredElement(this.root, "#replay-onboarding").addEventListener("click", () => this.onboarding.replay(), listenerOptions);
    requiredElement(this.root, "#replay-onboarding-control").addEventListener("click", () => this.onboarding.replay(), listenerOptions);
    requiredElement(this.root, "#schema-table-tabs").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-schema-table]");
      const tableName = button?.dataset.schemaTable as SqlTableName | undefined;
      if (!tableName || !SQL_TABLES.some((table) => table.name === tableName)) return;
      this.selectSchemaTable(tableName, true);
    }, listenerOptions);
    requiredElement(this.root, "#schema-table-tabs").addEventListener("keydown", (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-schema-table]");
      const tableName = button?.dataset.schemaTable as SqlTableName | undefined;
      if (!tableName) return;
      const currentIndex = SQL_TABLES.findIndex((table) => table.name === tableName);
      if (currentIndex < 0) return;
      let nextIndex = currentIndex;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % SQL_TABLES.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + SQL_TABLES.length) % SQL_TABLES.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = SQL_TABLES.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      this.selectSchemaTable(SQL_TABLES[nextIndex].name, true);
    }, listenerOptions);
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
    this.pickupShownAtMove = null;
    this.settlementShownAtMove = null;
    if (this.floorTransitionTimer !== null) window.clearTimeout(this.floorTransitionTimer);
    this.floorTransitionTimer = null;
    if (this.defeatRespawnTimer !== null) window.clearTimeout(this.defeatRespawnTimer);
    this.defeatRespawnTimer = null;
    this.root.classList.remove(
      "terminal-active",
      "gate-terminal-active",
      "campfire-active",
      "inventory-active",
      "loot-active",
      "review-active",
    );
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
    this.combatAutocomplete.hide();
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
        resolution = this.session.registerQueryError(message, this.textarea.value);
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
      if (resolution.experience) this.showCombatSettlement(resolution);
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

  private async executeGateChallenge(): Promise<void> {
    if (this.busy || !this.isGateTerminalOpen()) return;
    if (!this.gateTextarea.value.trim()) {
      const message = "先写一条完整 SELECT；空输入不会触发机关反噬。";
      this.gateQueryStatus.textContent = message;
      this.gateQueryStatus.dataset.kind = "warning";
      this.showFeedbackNotice({ message, tone: "info" });
      return;
    }

    this.gateAutocomplete.hide();
    this.busy = true;
    this.gateExecuteButton.disabled = true;
    requiredElement(this.root, ".game-stage").classList.add("is-resolving");
    try {
      this.feedback.dispatch({ type: "query-cast" });
      let result: SqlQueryResult | null = null;
      let queryError: unknown = null;
      try {
        result = this.sql.executeSelect(this.gateTextarea.value);
      } catch (error) {
        queryError = error;
      }

      const resolution = result
        ? this.session.resolveGateChallenge(result)
        : this.session.registerGateChallengeError(
            queryError instanceof Error ? queryError.message : "查询执行失败。",
          );
      if (result) {
        this.renderResultInto(
          result,
          requiredElement(this.root, "#gate-query-result"),
          requiredElement(this.root, "#gate-query-plan"),
        );
      }
      this.gateQueryStatus.textContent = resolution.message;
      this.gateQueryStatus.dataset.kind = resolution.accepted ? "success" : "error";
      const receivedDamage = resolution.playerDamage + resolution.armorDamage;
      if (receivedDamage > 0) {
        this.feedback.dispatch({ type: "player-hurt", amount: receivedDamage });
      }
      if (!resolution.accepted && receivedDamage === 0) {
        this.showFeedbackNotice({ message: resolution.message, tone: "info" });
      }
    } catch (error) {
      console.error("机关查询结算失败", error);
      const message = "机关终端发生内部错误，本次没有扣除生命。请关闭后重新接入。";
      this.gateQueryStatus.textContent = message;
      this.gateQueryStatus.dataset.kind = "error";
      this.showFeedbackNotice({ message, tone: "danger" });
    } finally {
      this.busy = false;
      this.gateExecuteButton.disabled = false;
      requiredElement(this.root, ".game-stage").classList.remove("is-resolving");
    }
  }

  private openReview(
    scope: AnswerReviewScope = "all",
    context: "manual" | "campfire" | "death" = "manual",
  ): void {
    if ((this.busy && context !== "death") || this.isGateTerminalOpen()) return;
    if (this.isTerminalOpen()) this.closeTerminal(false);
    if (!this.isReviewOpen()) {
      this.focusBeforeTerminal = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    this.reviewScope = scope;
    this.reviewContext = context;
    this.answerReview.render(this.lastSnapshot, scope);
    this.answerReview.setOpen(true);
    this.root.classList.add("review-active");
    this.answerReview.closeButton.focus({
      preventScroll: true,
    });
  }

  private closeReview(): void {
    if (!this.isReviewOpen()) return;
    const context = this.reviewContext;
    this.reviewContext = "manual";
    this.reviewScope = "all";
    this.answerReview.setOpen(false);
    this.root.classList.remove("review-active");
    const focusTarget = this.focusBeforeTerminal;
    this.focusBeforeTerminal = null;
    if (context === "death") {
      this.session.continueAfterDeathReview();
      requiredElement<HTMLElement>(this.root, "#game-root").focus();
      return;
    }
    if (context === "campfire" && this.lastSnapshot.mode === "campfire") {
      requiredElement<HTMLButtonElement>(this.root, "#review-at-campfire").focus();
      return;
    }
    if (focusTarget?.isConnected && !focusTarget.matches(":disabled")) {
      focusTarget.focus();
    } else {
      requiredElement<HTMLButtonElement>(this.root, "#open-review").focus();
    }
  }

  private isReviewOpen(): boolean {
    return this.answerReview?.isOpen() ?? false;
  }

  private restAtCampfire(): void {
    const resolution = this.session.restAtCampfire();
    this.showFeedbackNotice({
      message: resolution.message,
      tone: resolution.ok ? "success" : "info",
    });
    if (resolution.ok) {
      requiredElement<HTMLElement>(this.root, "#game-root").focus({
        preventScroll: true,
      });
    }
  }

  private leaveCampfire(): void {
    if (!this.session.leaveCampfire()) return;
    requiredElement<HTMLElement>(this.root, "#game-root").focus({
      preventScroll: true,
    });
  }

  private closeInventoryMenu(): void {
    if (!this.session.closeInventory()) return;
    if (this.session.snapshot().mode === "explore") {
      requiredElement<HTMLElement>(this.root, "#game-root").focus({ preventScroll: true });
    }
  }

  private closeLootMenu(): void {
    if (!this.session.closeLootBundle()) return;
    requiredElement<HTMLElement>(this.root, "#game-root").focus({ preventScroll: true });
  }

  private isInventoryMenuOpen(): boolean {
    return this.inventoryMenu?.classList.contains("is-open") ?? false;
  }

  private isLootMenuOpen(): boolean {
    return this.lootMenu?.classList.contains("is-open") ?? false;
  }

  private handleInventoryAction(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-inventory-action]",
    );
    if (!button) return;
    const action = button.dataset.inventoryAction;
    const itemId = button.dataset.itemId;
    if (!itemId) return;
    const equipment = this.lastSnapshot.equipmentInventory.find(
      (item) => item.instanceId === itemId,
    );
    const consumable = this.lastSnapshot.consumables.find(
      (stack) => stack.item.id === itemId,
    );
    const resolution = action === "equip" && equipment
      ? this.session.equipInventoryItem(equipment.instanceId)
      : action === "discard-equipment" && equipment
        ? this.session.discardInventoryItem(equipment.instanceId)
        : action === "use" && consumable
          ? this.session.useConsumable(consumable.item.id)
          : action === "discard-consumable" && consumable
            ? this.session.discardConsumable(consumable.item.id)
            : null;
    if (!resolution) return;
    this.showFeedbackNotice({
      message: resolution.message,
      tone: resolution.ok ? "success" : "info",
    });
  }

  private handleLootAction(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-loot-action]");
    if (!button) return;
    const bundleId = this.lastSnapshot.activeLootBundleId;
    const dropId = button.dataset.dropId;
    const action = button.dataset.lootAction;
    if (
      !bundleId ||
      !dropId ||
      (action !== "store" && action !== "equip" && action !== "claim")
    ) return;
    const card = button.closest<HTMLElement>("[data-loot-card]");
    const replaceInstanceId = card
      ?.querySelector<HTMLSelectElement>("[data-loot-replacement]")
      ?.value || undefined;
    const item = this.lastSnapshot.lootBundles
      .find((bundle) => bundle.id === bundleId)
      ?.items.find((entry) => entry.dropId === dropId);
    const resolution = this.session.takeLootItem(
      bundleId,
      dropId,
      action,
      replaceInstanceId,
    );
    if (resolution.ok && item) {
      this.presentLootAcquisition([item], resolution.message);
    } else {
      this.showFeedbackNotice({
        message: resolution.message,
        tone: "info",
      });
    }
  }

  private renderInventoryMenu(snapshot: GameSnapshot, entered: boolean): void {
    const open = snapshot.mode === "inventory";
    this.inventoryMenu.hidden = !open;
    this.inventoryMenu.inert = !open;
    this.inventoryMenu.setAttribute("aria-hidden", String(!open));
    this.inventoryMenu.classList.toggle("is-open", open);
    this.root.classList.toggle("inventory-active", open);
    if (!open) return;

    requiredElement(this.inventoryMenu, "#equipment-capacity").textContent =
      `${snapshot.equipmentInventory.length} / 12`;
    requiredElement(this.inventoryMenu, "#consumable-capacity").textContent =
      `${snapshot.consumables.length} / 3`;

    const equippedRoot = requiredElement(this.inventoryMenu, "#equipped-summary");
    equippedRoot.replaceChildren();
    const equippedEntries = [
      {
        slot: "武器",
        name: snapshot.player.weapon.name,
        detail: `伤害 ${snapshot.player.weapon.damage}`,
      },
      {
        slot: "防具",
        name: snapshot.player.armor?.name ?? "未装备",
        detail: snapshot.player.armor
          ? `护甲 ${snapshot.player.armorHp}/${snapshot.player.armor.maxArmor}`
          : "先获得防具，再用护甲承受错误反击",
      },
    ];
    equippedEntries.forEach((entry) => {
      const article = document.createElement("article");
      const slot = document.createElement("span");
      slot.textContent = entry.slot;
      const name = document.createElement("strong");
      name.textContent = entry.name;
      const detail = document.createElement("small");
      detail.textContent = entry.detail;
      article.append(slot, name, detail);
      equippedRoot.append(article);
    });

    const equipmentRoot = requiredElement(this.inventoryMenu, "#equipment-inventory");
    equipmentRoot.replaceChildren();
    if (snapshot.equipmentInventory.length === 0) {
      const empty = document.createElement("p");
      empty.className = "inventory-empty";
      empty.textContent = "装备背包为空。怪物掉落会以一个战利品包出现在地图上。";
      equipmentRoot.append(empty);
    }
    snapshot.equipmentInventory.forEach((item) => {
      const article = document.createElement("article");
      article.className = "inventory-item";
      const title = document.createElement("strong");
      title.textContent = item.weapon?.name ?? item.armor?.name ?? "未知装备";
      const description = document.createElement("p");
      description.textContent = item.weapon?.description ?? item.armor?.description ?? "";
      const stats = document.createElement("code");
      stats.textContent = item.weapon
        ? `武器 · 伤害 ${item.weapon.damage}`
        : `防具 · 护甲 ${item.armorHp ?? 0}/${item.armor?.maxArmor ?? 0}`;
      const actions = document.createElement("div");
      actions.className = "inventory-item__actions";
      const equip = document.createElement("button");
      equip.type = "button";
      equip.dataset.inventoryAction = "equip";
      equip.dataset.itemId = item.instanceId;
      equip.textContent = "装备";
      const discard = document.createElement("button");
      discard.type = "button";
      discard.dataset.inventoryAction = "discard-equipment";
      discard.dataset.itemId = item.instanceId;
      discard.textContent = item.protected ? "课程装备 · 受保护" : "丢到脚下";
      discard.disabled = item.protected;
      actions.append(equip, discard);
      article.append(title, description, stats, actions);
      equipmentRoot.append(article);
    });

    const consumableRoot = requiredElement(this.inventoryMenu, "#consumable-inventory");
    consumableRoot.replaceChildren();
    if (snapshot.consumables.length === 0) {
      const empty = document.createElement("p");
      empty.className = "inventory-empty";
      empty.textContent = "恢复品栏为空（3 格，每格最多堆叠 5 个）。";
      consumableRoot.append(empty);
    }
    snapshot.consumables.forEach((stack) => {
      const article = document.createElement("article");
      article.className = "inventory-item";
      const title = document.createElement("strong");
      title.textContent = `${stack.item.name} × ${stack.quantity}`;
      const description = document.createElement("p");
      description.textContent = stack.item.description;
      const actions = document.createElement("div");
      actions.className = "inventory-item__actions";
      const use = document.createElement("button");
      use.type = "button";
      use.dataset.inventoryAction = "use";
      use.dataset.itemId = stack.item.id;
      use.textContent = "使用";
      const discard = document.createElement("button");
      discard.type = "button";
      discard.dataset.inventoryAction = "discard-consumable";
      discard.dataset.itemId = stack.item.id;
      discard.textContent = "丢 1 个";
      actions.append(use, discard);
      article.append(title, description, actions);
      consumableRoot.append(article);
    });

    const keyRoot = requiredElement(this.inventoryMenu, "#key-inventory");
    keyRoot.replaceChildren();
    if (snapshot.keyItems.length === 0) {
      keyRoot.textContent = "尚未获得本层钥匙。捷径钥匙位于中后段，楼层钥匙由层主掉落。";
    } else {
      snapshot.keyItems.forEach((keyId) => {
        const chip = document.createElement("span");
        chip.textContent = keyId.startsWith("shortcut-key:")
          ? `捷径钥匙 · 第 ${snapshot.floor} 层`
          : keyId.startsWith("floor-")
            ? `楼层钥匙 · ${keyId.match(/\d+/)?.[0] ?? snapshot.floor}`
            : keyId;
        keyRoot.append(chip);
      });
    }

    if (entered) {
      requiredElement<HTMLButtonElement>(this.inventoryMenu, "#close-inventory")
        .focus({ preventScroll: true });
    }
  }

  private renderLootMenu(snapshot: GameSnapshot, entered: boolean): void {
    const bundle = snapshot.activeLootBundleId
      ? snapshot.lootBundles.find((entry) => entry.id === snapshot.activeLootBundleId)
      : null;
    const open = snapshot.mode === "loot" && Boolean(bundle);
    this.lootMenu.hidden = !open;
    this.lootMenu.inert = !open;
    this.lootMenu.setAttribute("aria-hidden", String(!open));
    this.lootMenu.classList.toggle("is-open", open);
    this.root.classList.toggle("loot-active", open);
    if (!open || !bundle) return;

    requiredElement(this.lootMenu, "#loot-menu-title").textContent =
      `战利品包 · ${bundle.items.length} 件`;
    requiredElement(this.lootMenu, "#loot-menu-status").textContent =
      `装备 ${snapshot.equipmentInventory.length}/12 · 恢复品 ${snapshot.consumables.length}/3。每件掉落独立判定，同一战斗不重复。`;
    const root = requiredElement(this.lootMenu, "#loot-items");
    root.replaceChildren();
    const replaceable = snapshot.equipmentInventory.filter((item) => !item.protected);
    bundle.items.forEach((item) => {
      const article = document.createElement("article");
      article.className = `loot-item loot-item--${item.kind}`;
      article.dataset.lootCard = item.dropId;
      const header = document.createElement("div");
      const kind = document.createElement("span");
      kind.textContent = item.guaranteed
        ? "固定奖励"
        : `${Math.round(item.probability * 10_000) / 100}% 独立掉落`;
      const title = document.createElement("strong");
      title.textContent = item.name;
      header.append(kind, title);
      const description = document.createElement("p");
      description.textContent = item.description;
      article.append(header, description);

      if (
        (item.kind === "weapon" || item.kind === "armor") &&
        snapshot.equipmentInventory.length >= 12
      ) {
        const label = document.createElement("label");
        label.textContent = "背包已满，选择留在战利品包中的装备：";
        const select = document.createElement("select");
        select.dataset.lootReplacement = item.dropId;
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = replaceable.length > 0 ? "请选择普通装备" : "没有可替换的普通装备";
        select.append(placeholder);
        replaceable.forEach((entry) => {
          const option = document.createElement("option");
          option.value = entry.instanceId;
          option.textContent = entry.weapon?.name ?? entry.armor?.name ?? entry.instanceId;
          select.append(option);
        });
        label.append(select);
        article.append(label);
      }

      const actions = document.createElement("div");
      actions.className = "inventory-item__actions";
      if (item.kind === "weapon" || item.kind === "armor") {
        const store = document.createElement("button");
        store.type = "button";
        store.dataset.lootAction = "store";
        store.dataset.dropId = item.dropId;
        store.textContent = "收入背包";
        const equip = document.createElement("button");
        equip.type = "button";
        equip.dataset.lootAction = "equip";
        equip.dataset.dropId = item.dropId;
        equip.textContent = "立即装备";
        actions.append(store, equip);
      } else {
        const claim = document.createElement("button");
        claim.type = "button";
        claim.dataset.lootAction = "claim";
        claim.dataset.dropId = item.dropId;
        claim.textContent = item.rewardId === "floor-key" ? "领取钥匙" : "领取";
        actions.append(claim);
      }
      article.append(actions);
      root.append(article);
    });
    if (entered) {
      root.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    }
  }

  private renderCampfireMenu(snapshot: GameSnapshot, entered: boolean): void {
    const open = snapshot.mode === "campfire" && snapshot.activeCampfireId !== null;
    this.campfireMenu.hidden = !open;
    this.campfireMenu.inert = !open;
    this.campfireMenu.setAttribute("aria-hidden", String(!open));
    this.campfireMenu.classList.toggle("is-open", open);
    this.root.classList.toggle("campfire-active", open);
    if (!open) return;

    const campfire = snapshot.campfires.find(
      (entry) => entry.id === snapshot.activeCampfireId,
    );
    const phaseName = campfire?.phase === "front"
      ? "前段篝火"
      : campfire?.phase === "middle"
        ? "中段篝火"
        : "后段篝火";
    requiredElement(this.campfireMenu, "#campfire-menu-title").textContent = phaseName;
    requiredElement(this.campfireMenu, "#campfire-menu-status").textContent =
      `生命 ${snapshot.player.hp}/${snapshot.player.maxHp} · 护甲 ${snapshot.player.armorHp}/${snapshot.player.armor?.maxArmor ?? 0}。休息会全部恢复，并把这里设为复活点。`;
    if (entered && !this.isReviewOpen()) {
      requiredElement<HTMLButtonElement>(
        this.campfireMenu,
        "#rest-at-campfire",
      ).focus({ preventScroll: true });
    }
  }

  private isCampfireMenuOpen(): boolean {
    return this.campfireMenu?.classList.contains("is-open") ?? false;
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
      if (!this.busy && this.isTerminalOpen()) {
        this.textarea.focus({ preventScroll: true });
      }
    }, 60);
  }

  private closeTerminal(returnFocus = true): void {
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = null;
    this.combatAutocomplete.hide();
    this.terminal.classList.remove("is-open");
    if (!this.isGateTerminalOpen()) this.root.classList.remove("terminal-active");
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

  private closeGateTerminal(): void {
    if (this.busy) return;
    this.session.cancelGateChallenge();
  }

  private openGateTerminal(): void {
    if (this.busy || !this.lastSnapshot?.activeGateChallenge) return;
    if (!this.isGateTerminalOpen()) {
      this.focusBeforeTerminal = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    void this.audio.resume();
    this.gateTerminal.classList.add("is-open");
    this.root.classList.add("terminal-active", "gate-terminal-active");
    this.gateTerminal.inert = false;
    this.gateTerminal.setAttribute("aria-hidden", "false");
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = window.setTimeout(() => {
      this.terminalFocusTimer = null;
      if (!this.busy && this.isGateTerminalOpen()) {
        this.gateTextarea.focus({ preventScroll: true });
      }
    }, 60);
  }

  private hideGateTerminal(returnFocus = true): void {
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = null;
    this.gateAutocomplete.hide();
    this.gateTerminal.classList.remove("is-open");
    this.root.classList.remove("gate-terminal-active");
    if (!this.isTerminalOpen()) this.root.classList.remove("terminal-active");
    this.gateTerminal.inert = true;
    this.gateTerminal.setAttribute("aria-hidden", "true");
    if (!returnFocus) return;
    this.gateTextarea.blur();
    const focusTarget = this.focusBeforeTerminal;
    this.focusBeforeTerminal = null;
    if (
      focusTarget?.isConnected &&
      !focusTarget.matches(":disabled") &&
      !this.gateTerminal.contains(focusTarget)
    ) {
      focusTarget.focus();
    } else {
      requiredElement<HTMLElement>(this.root, "#game-root").focus();
    }
  }

  private isGateTerminalOpen(): boolean {
    return this.gateTerminal.classList.contains("is-open");
  }

  private trapDialogFocus(event: KeyboardEvent, dialog: HTMLElement): void {
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.closest("[inert]") && !element.hasAttribute("hidden"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
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

  private showPickupCard(item: GroundItem, effect: string, totalMoves: number): void {
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
    this.pickupShownAtMove = totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
  }

  private presentLootAcquisition(items: readonly LootItem[], effect: string): void {
    if (items.length === 0) return;
    this.onboarding.advance("item-pickup");
    const single = items.length === 1 ? items[0] : null;
    const feedbackKind = single?.kind === "weapon"
      ? "weapon"
      : single?.kind === "consumable"
        ? "heal"
        : single?.rewardId === "floor-key"
          ? "key"
          : single?.kind === "armor"
            ? "relic"
            : "event";
    this.feedback.dispatch({
      type: "item-pickup",
      itemName: items.map((item) => item.name).join("、"),
      kind: feedbackKind,
      message: effect,
    });
    const card = requiredElement<HTMLElement>(this.root, "#pickup-card");
    const kindLabel = single
      ? single.kind === "weapon"
        ? "WEAPON / 已处理"
        : single.kind === "armor"
          ? "ARMOR / 已处理"
          : single.kind === "consumable"
            ? "RECOVERY / 已入栏"
            : single.rewardId === "floor-key"
              ? "KEY ITEM / 已记录"
              : "REWARD / 已领取"
      : `LOOT ×${items.length} / 已处理`;
    requiredElement(card, "#pickup-kind").textContent = kindLabel;
    requiredElement(card, "#pickup-name").textContent =
      items.map((item) => item.name).join("、");
    requiredElement(card, "#pickup-description").textContent =
      items.map((item) => `${item.name}：${item.description}`).join("；");
    requiredElement(card, "#pickup-effect").textContent = effect;
    this.pickupShownAtMove = this.lastSnapshot.totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
  }

  private showCombatSettlement(resolution: TurnResolution): void {
    if (!resolution.experience) return;
    const card = requiredElement<HTMLElement>(this.root, "#combat-result-card");
    const copy = combatSettlementCopy(
      resolution.experience,
      resolution.events.some((event) => event.type === "loot-drop"),
    );
    requiredElement(card, "#combat-result-title").textContent = copy.title;
    requiredElement(card, "#combat-result-xp").textContent = copy.xp;
    requiredElement(card, "#combat-result-progress").textContent = copy.progress;
    requiredElement(card, "#combat-result-level").textContent = copy.levelUp;
    requiredElement(card, "#combat-result-reward").textContent = copy.reward;
    this.settlementShownAtMove = this.lastSnapshot.totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
  }

  private hidePickupCard(): void {
    const card = this.root.querySelector<HTMLElement>("#pickup-card");
    if (!card) return;
    this.pickupShownAtMove = null;
    card.classList.remove("is-visible");
    card.hidden = true;
  }

  private hideCombatSettlement(): void {
    const card = this.root.querySelector<HTMLElement>("#combat-result-card");
    if (!card) return;
    this.settlementShownAtMove = null;
    card.classList.remove("is-visible");
    card.hidden = true;
  }

  private dismissTransientCards(snapshot: GameSnapshot): void {
    if (shouldDismissTransientCard(this.pickupShownAtMove, snapshot.totalMoves)) {
      this.hidePickupCard();
    }
    if (shouldDismissTransientCard(this.settlementShownAtMove, snapshot.totalMoves)) {
      this.hideCombatSettlement();
    }
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
    this.hidePickupCard();
    this.hideCombatSettlement();
    if (this.defeatRespawnTimer !== null) {
      window.clearTimeout(this.defeatRespawnTimer);
      this.defeatRespawnTimer = null;
    }
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
    const guidedPickup = this.lastSnapshot
      ? this.guidedPickupBetween(this.lastSnapshot, snapshot)
      : null;
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
    const enteredChallenge = snapshot.mode === "challenge" && this.lastMode !== "challenge";
    const enteredCampfire = snapshot.mode === "campfire" && this.lastMode !== "campfire";
    const enteredInventory = snapshot.mode === "inventory" && this.lastMode !== "inventory";
    const enteredLoot = snapshot.mode === "loot" && this.lastMode !== "loot";
    const enteredDefeat = snapshot.mode === "defeat" && this.lastMode !== "defeat";
    const enteredDeathReview =
      snapshot.mode === "death-review" && this.lastMode !== "death-review";
    this.lastSnapshot = snapshot;
    if (enteredCombat) {
      this.hidePickupCard();
      this.hideCombatSettlement();
    } else {
      this.dismissTransientCards(snapshot);
    }

    requiredElement(this.root, "#seed-value").textContent = snapshot.runSeed;
    requiredElement(this.root, "#floor-value").textContent =
      `${String(snapshot.campaign.currentFloor).padStart(2, "0")} / 08`;
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
    requiredElement(this.root, "#armor-name").textContent = snapshot.player.armor
      ? `${snapshot.player.armor.name} ${snapshot.player.armorHp}/${snapshot.player.armor.maxArmor}`
      : "无防具";
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
    requiredElement<HTMLButtonElement>(this.root, "#open-inventory").disabled =
      snapshot.mode !== "explore" && snapshot.mode !== "campfire";
    requiredElement<HTMLButtonElement>(this.root, "#reset-game").disabled =
      snapshot.mode === "transition" ||
      snapshot.mode === "defeat" ||
      snapshot.mode === "death-review";
    this.renderFloorTransition(snapshot);
    this.renderDefeatTransition(snapshot, enteredDefeat);
    this.renderCampfireMenu(snapshot, enteredCampfire);
    this.renderInventoryMenu(snapshot, enteredInventory);
    this.renderLootMenu(snapshot, enteredLoot);

    this.renderTarget(target, snapshot);
    this.renderLocks(snapshot);
    this.renderSchema(snapshot.schema);
    this.renderHints(snapshot.hints);
    this.renderMazeMap(snapshot);
    this.renderMastery(snapshot);
    this.renderRelics(snapshot);
    this.renderGateChallenge(snapshot, enteredChallenge);
    const latestPickup = pickedItems.at(-1) ?? guidedPickup;
    if (latestPickup) {
      this.showPickupCard(latestPickup, snapshot.banner, snapshot.totalMoves);
    }

    if (stageChanged || enteredCombat) {
      this.textarea.value = "";
      this.clearQueryArtifacts();
      this.queryStatus.textContent = enteredCombat
        ? "怪物行动已预告。请从 SELECT 开始完整写出本回合 SQL。"
        : "目标已经变化，请重新写一条完整 SQL。";
      this.queryStatus.dataset.kind = "";
    }
    if (snapshot.mode !== "combat" && this.isTerminalOpen()) this.closeTerminal(true);
    if (snapshot.mode !== "challenge" && this.isGateTerminalOpen()) {
      this.hideGateTerminal(true);
    }

    const musicMode = snapshot.mode === "combat"
      ? target?.isBoss ? "boss" : "combat"
      : "explore";
    this.audio.setFloor(snapshot.floor);
    this.audio.setMode(musicMode);
    if (this.isReviewOpen()) this.answerReview.render(snapshot, this.reviewScope);
    if (enteredDeathReview || (snapshot.mode === "death-review" && !this.isReviewOpen())) {
      this.openReview("battle", "death");
    }

    this.lastStageId = snapshot.lessonStageId;
    this.lastMode = snapshot.mode;
  }

  private guidedPickupBetween(
    previous: GameSnapshot,
    next: GameSnapshot,
  ): GroundItem | null {
    if (previous.runSeed !== next.runSeed || previous.floor !== next.floor) return null;
    const shortcut = next.guidedMap.shortcuts.find((entry) => (
      !previous.keyItems.includes(entry.keyId) &&
      next.keyItems.includes(entry.keyId)
    ));
    if (shortcut) {
      return {
        id: shortcut.keyId,
        sourceRoomId: shortcut.keyRoomNodeId,
        ...shortcut.keyPosition,
        name: "捷径钥匙",
        description: `保证开启${shortcut.name}；不会占用背包，也不依赖随机掉落。`,
        kind: "key",
        collection: "interact",
        rewardId: null,
      };
    }
    const cache = next.guidedMap.deadEndCaches.find((entry) => (
      !previous.openedGateIds.includes(entry.id) &&
      next.openedGateIds.includes(entry.id)
    ));
    if (!cache) return null;
    return {
      id: cache.id,
      sourceRoomId: cache.sourceRoomId,
      x: cache.x,
      y: cache.y,
      name: "死路补给",
      description: "空死路已替换为可选收益；打开后本 Run 不会重复刷新。",
      kind: "event",
      collection: "interact",
      rewardId: cache.rewardId,
    };
  }

  private renderGateChallenge(snapshot: GameSnapshot, entered: boolean): void {
    const challenge = snapshot.activeGateChallenge;
    if (!challenge) return;
    this.gateAutocomplete.setSchemaLines([
      ...challenge.schema,
      ...COMPLETE_SCHEMA_LINES,
    ]);
    requiredElement(this.root, "#gate-terminal-title").textContent = challenge.title;
    requiredElement(this.root, "#gate-terminal-objective").textContent = challenge.objective;

    const schemaRoot = requiredElement(this.root, "#gate-challenge-schema");
    schemaRoot.replaceChildren();
    challenge.schema.forEach((line) => {
      const code = document.createElement("code");
      code.textContent = line;
      schemaRoot.append(code);
    });

    const hintRoot = requiredElement(this.root, "#gate-challenge-hints");
    hintRoot.replaceChildren();
    challenge.hints.forEach((hint, index) => {
      const item = document.createElement("p");
      item.textContent = `提示 ${index + 1} · ${hint}`;
      hintRoot.append(item);
    });

    if (entered) {
      this.gateTextarea.value = "";
      this.gateQueryStatus.textContent = "空输入不触发反噬；语法或结果错误才扣除 1 点生命。";
      this.gateQueryStatus.dataset.kind = "";
      const resultRoot = requiredElement(this.root, "#gate-query-result");
      const planRoot = requiredElement(this.root, "#gate-query-plan");
      resultRoot.className = "table-wrap empty-state";
      resultRoot.textContent = "尚未执行机关查询。";
      planRoot.className = "plan-list empty-state";
      planRoot.textContent = "等待 EXPLAIN QUERY PLAN。";
    }
    this.openGateTerminal();
  }

  private renderFloorTransition(snapshot: GameSnapshot): void {
    const portal = requiredElement<HTMLElement>(this.root, "#floor-portal");
    const transitioning = snapshot.mode === "transition" && snapshot.floor === 1;
    const dungeonCleared = snapshot.mode === "victory";
    portal.hidden = !transitioning && !dungeonCleared;
    if (transitioning) {
      requiredElement(portal, "#floor-clear-title").textContent = "FLOOR 01 CLEARED";
      requiredElement(portal, "#floor-clear-copy").textContent =
        "CONGRATULATIONS!! · 正在传送至第二层";
      this.hidePickupCard();
      this.hideCombatSettlement();
    } else if (dungeonCleared) {
      requiredElement(portal, "#floor-clear-title").textContent = "DUNGEON CLEARED";
      requiredElement(portal, "#floor-clear-copy").textContent = "CONGRATULATIONS!!";
      this.hidePickupCard();
      this.hideCombatSettlement();
    }
    if (!transitioning) {
      if (this.floorTransitionTimer !== null) {
        window.clearTimeout(this.floorTransitionTimer);
        this.floorTransitionTimer = null;
      }
      return;
    }
    if (this.floorTransitionTimer !== null) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 650
      : 1_500;
    this.floorTransitionTimer = window.setTimeout(() => {
      this.floorTransitionTimer = null;
      const current = this.session.snapshot();
      if (current.mode !== "transition" || current.floor !== 1) return;
      if (!this.session.advanceFloor()) return;
      const nextSnapshot = this.session.snapshot();
      this.sql.reset(nextSnapshot.monsters);
      this.clearQueryArtifacts();
      this.audio.setFloor(nextSnapshot.floor);
      this.audio.setMode("explore");
    }, delay);
  }

  private renderDefeatTransition(snapshot: GameSnapshot, entered: boolean): void {
    const overlay = requiredElement<HTMLElement>(this.root, "#run-state-overlay");
    const defeated = snapshot.mode === "defeat";
    overlay.hidden = !defeated;
    if (!defeated) {
      if (this.defeatRespawnTimer !== null) {
        window.clearTimeout(this.defeatRespawnTimer);
        this.defeatRespawnTimer = null;
      }
      return;
    }

    this.hidePickupCard();
    this.hideCombatSettlement();
    requiredElement(overlay, "p").textContent = snapshot.respawnCampfireId
      ? "正在返回最近休息的篝火…"
      : "尚未记录篝火，正在返回本层出生安全区…";
    if (entered && this.defeatRespawnTimer !== null) {
      window.clearTimeout(this.defeatRespawnTimer);
      this.defeatRespawnTimer = null;
    }
    if (this.defeatRespawnTimer !== null) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 500
      : 1_200;
    this.defeatRespawnTimer = window.setTimeout(() => {
      this.defeatRespawnTimer = null;
      if (this.session.snapshot().mode !== "defeat") return;
      this.getBattleScene()?.abortEncounter();
      this.session.respawnAfterDefeat();
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
    this.combatAutocomplete.setSchemaLines([
      ...lines,
      ...COMPLETE_SCHEMA_LINES,
    ]);
    const root = requiredElement(this.root, "#schema-list");
    root.replaceChildren();
    lines.forEach((line) => {
      const code = document.createElement("code");
      code.textContent = line;
      root.append(code);
    });
  }

  private renderCompactSchema(root: HTMLElement): void {
    root.replaceChildren();
    SQL_TABLES.forEach((table) => {
      const article = document.createElement("article");
      const title = document.createElement("strong");
      title.textContent = table.name;
      const fields = document.createElement("code");
      fields.textContent = table.columns.map((column) => column.name).join(", ");
      article.append(title, fields);
      root.append(article);
    });
  }

  private renderSchemaCodex(): void {
    const selectedTable = sqlTable(this.selectedSchemaTable);
    const tabs = requiredElement(this.root, "#schema-table-tabs");
    const panel = requiredElement(this.root, "#schema-table-panel");
    const trace = requiredElement(this.root, "#schema-relation-trace");
    tabs.replaceChildren();
    panel.replaceChildren();
    trace.replaceChildren();

    SQL_TABLES.forEach((table) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `schema-tab-${table.name}`;
      button.dataset.schemaTable = table.name;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(table.name === selectedTable.name));
      button.setAttribute("aria-controls", "schema-table-panel");
      button.tabIndex = table.name === selectedTable.name ? 0 : -1;
      button.textContent = table.name;
      tabs.append(button);
    });

    panel.setAttribute("aria-labelledby", `schema-tab-${selectedTable.name}`);
    const heading = document.createElement("div");
    heading.className = "schema-table-heading";
    const title = document.createElement("strong");
    title.textContent = selectedTable.name;
    const subtitle = document.createElement("span");
    subtitle.textContent = selectedTable.title;
    heading.append(title, subtitle);
    const description = document.createElement("p");
    description.textContent = selectedTable.description;
    const columnList = document.createElement("div");
    columnList.className = "schema-column-list";

    selectedTable.columns.forEach((column) => {
      const relation = SQL_RELATIONS.find((entry) => (
        entry.fromTable === selectedTable.name && entry.fromColumn === column.name
      ));
      const row = document.createElement("div");
      row.className = "schema-column-row";
      const name = document.createElement("code");
      name.textContent = column.name;
      const type = document.createElement("span");
      type.className = "schema-column-type";
      type.textContent = column.type;
      const badges = document.createElement("span");
      badges.className = "schema-column-badges";
      if (column.primaryKey) badges.append(this.schemaBadge("PK", "primary"));
      if (relation) badges.append(this.schemaBadge("REF", "reference"));
      badges.append(this.schemaBadge(column.nullable ? "NULL" : "NOT NULL", "nullability"));
      const detail = document.createElement("small");
      detail.textContent = relation
        ? `${column.description} → ${relation.toTable}.${relation.toColumn}`
        : column.description;
      row.append(name, type, badges, detail);
      columnList.append(row);
    });

    panel.append(heading, description, columnList);

    const relationTitle = document.createElement("strong");
    relationTitle.textContent = "RELATION TRACE / 关系追踪";
    trace.append(relationTitle);
    const relations = SQL_RELATIONS.filter((relation) => (
      relation.fromTable === selectedTable.name || relation.toTable === selectedTable.name
    ));
    relations.forEach((relation) => {
      const line = document.createElement("code");
      line.textContent = `${relation.fromTable}.${relation.fromColumn} → ${
        relation.toTable
      }.${relation.toColumn} · ${relation.description}`;
      trace.append(line);
    });
  }

  private selectSchemaTable(tableName: SqlTableName, focus: boolean): void {
    this.selectedSchemaTable = tableName;
    this.renderSchemaCodex();
    if (!focus) return;
    requiredElement<HTMLButtonElement>(
      this.root,
      `#schema-tab-${tableName}`,
    ).focus({ preventScroll: true });
  }

  private schemaBadge(
    label: string,
    kind: "primary" | "reference" | "nullability",
  ): HTMLElement {
    const badge = document.createElement("i");
    badge.dataset.kind = kind;
    badge.textContent = label;
    return badge;
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
    const revealedMarkers = snapshot.guidedMap.routeMarkers.filter(
      (marker) => discovered.has(`${marker.x}:${marker.y}`),
    ).length;
    requiredElement(this.root, "#map-explored").textContent =
      `${floorCommands.length} 格 · ${revealedMarkers} 信标`;

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

    snapshot.guidedMap.routeMarkers.forEach((routeMarker) => {
      if (!discovered.has(`${routeMarker.x}:${routeMarker.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "circle");
      marker.classList.add("minimap-route", `is-${routeMarker.phase}`);
      marker.setAttribute("cx", String(routeMarker.x + 0.5));
      marker.setAttribute("cy", String(routeMarker.y + 0.5));
      marker.setAttribute("r", "0.26");
      svg.append(marker);
    });
    snapshot.guidedMap.shortcuts.forEach((shortcut) => {
      const open = snapshot.openedGateIds.includes(shortcut.id);
      [shortcut.entry, shortcut.exit].forEach((position) => {
        if (!discovered.has(`${position.x}:${position.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "rect");
        marker.classList.add("minimap-shortcut", open ? "is-open" : "is-locked");
        marker.setAttribute("x", String(position.x + 0.14));
        marker.setAttribute("y", String(position.y + 0.14));
        marker.setAttribute("width", "0.72");
        marker.setAttribute("height", "0.72");
        svg.append(marker);
      });
    });

    snapshot.campfires.forEach((campfire) => {
      if (!discovered.has(`${campfire.x}:${campfire.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "circle");
      marker.classList.add("minimap-campfire");
      if (snapshot.respawnCampfireId === campfire.id) {
        marker.classList.add("is-checkpoint");
      }
      marker.setAttribute("cx", String(campfire.x + 0.5));
      marker.setAttribute("cy", String(campfire.y + 0.5));
      marker.setAttribute("r", "0.48");
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
    snapshot.guidedMap.shortcuts
      .filter((shortcut) => !snapshot.keyItems.includes(shortcut.keyId))
      .forEach((shortcut) => {
        if (!discovered.has(`${shortcut.keyPosition.x}:${shortcut.keyPosition.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "rect");
        marker.classList.add("minimap-item", "is-key");
        marker.setAttribute("x", String(shortcut.keyPosition.x + 0.22));
        marker.setAttribute("y", String(shortcut.keyPosition.y + 0.22));
        marker.setAttribute("width", "0.56");
        marker.setAttribute("height", "0.56");
        marker.setAttribute(
          "transform",
          `rotate(45 ${shortcut.keyPosition.x + 0.5} ${shortcut.keyPosition.y + 0.5})`,
        );
        svg.append(marker);
      });
    snapshot.guidedMap.deadEndCaches
      .filter((cache) => !snapshot.openedGateIds.includes(cache.id))
      .forEach((cache) => {
        if (!discovered.has(`${cache.x}:${cache.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "rect");
        marker.classList.add("minimap-item", "is-guided-cache");
        marker.setAttribute("x", String(cache.x + 0.18));
        marker.setAttribute("y", String(cache.y + 0.22));
        marker.setAttribute("width", "0.64");
        marker.setAttribute("height", "0.56");
        svg.append(marker);
      });
    snapshot.lootBundles.forEach((bundle) => {
      if (!discovered.has(`${bundle.x}:${bundle.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-item", "is-loot-bundle");
      marker.setAttribute("x", String(bundle.x + 0.15));
      marker.setAttribute("y", String(bundle.y + 0.2));
      marker.setAttribute("width", "0.7");
      marker.setAttribute("height", "0.6");
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
    this.renderResultInto(result, this.resultRoot, this.planRoot);
  }

  private renderResultInto(
    result: SqlQueryResult,
    resultRoot: HTMLElement,
    planRoot: HTMLElement,
  ): void {
    resultRoot.replaceChildren();
    resultRoot.className = "table-wrap";
    if (result.rows.length === 0) {
      resultRoot.classList.add("empty-state");
      resultRoot.textContent = "查询返回 0 行。";
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
      resultRoot.append(table);
    }

    planRoot.replaceChildren();
    planRoot.className = "plan-list";
    result.plan.forEach((detail, index) => {
      const line = document.createElement("div");
      line.className = "plan-line";
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const text = document.createElement("code");
      text.textContent = detail;
      line.append(number, text);
      planRoot.append(line);
    });
    if (result.plan.length === 0) {
      planRoot.classList.add("empty-state");
      planRoot.textContent = "SQLite 未返回查询计划。";
    }
  }

  private clearQueryArtifacts(): void {
    this.resultRoot.className = "table-wrap empty-state";
    this.resultRoot.textContent = "尚未执行本回合查询。";
    this.planRoot.className = "plan-list empty-state";
    this.planRoot.textContent = "等待 EXPLAIN QUERY PLAN。";
  }
}
