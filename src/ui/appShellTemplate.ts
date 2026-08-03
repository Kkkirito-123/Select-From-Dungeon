export interface AppShellTemplateMetrics {
  schemaTableCount: number;
  schemaFieldCount: number;
}
/**
 * Static DOM contract for AppShell.
 *
 * Keep markup, stable IDs and accessibility attributes here. Runtime state,
 * event handlers and rendering remain outside this pure template boundary.
 */
export function appShellTemplate({
  schemaTableCount,
  schemaFieldCount,
}: AppShellTemplateMetrics): string {
  return `
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
            <button id="open-admin" type="button" class="admin-toggle">⌘ 管理员</button>
            <button id="open-monster-codex" type="button" class="monster-codex-toggle">◆ 怪物图鉴 0/0</button>
            <button id="open-narrative" type="button" class="narrative-toggle">▧ 剧情档案 1/5</button>
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
              <div id="heat-chip" hidden><span class="hud-label">查询负载</span><strong id="heat-value">0</strong></div>
              <div id="heat-progress" class="meter heat" role="progressbar" aria-label="SQLite 教学查询负载" aria-valuemin="0" aria-valuenow="0" aria-valuemax="100" hidden><span id="heat-meter"></span></div>
              <div class="weapon-chip"><span class="hud-label">武器</span><strong id="weapon-name">数据之刃</strong></div>
              <div class="armor-chip"><span class="hud-label">防具</span><strong id="armor-name">无防具</strong></div>
              <div class="relic-chip"><span class="hud-label">遗物</span><strong id="relic-count">0</strong></div>
            </div>

            <div class="game-stage">
              <div id="game-root" class="game-root" tabindex="-1"></div>

              <section id="inspection-overlay" class="inspection-overlay" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="inspection-title" inert hidden>
                <article class="inspection-overlay__frame">
                  <span id="inspection-kicker">FIELD NOTE / 现场记录</span>
                  <h2 id="inspection-title">现场调查</h2>
                  <p id="inspection-message"></p>
                  <div class="inspection-overlay__actions">
                    <button id="confirm-labyrinth-entry" type="button" hidden>E · 进入迷宫</button>
                    <button id="close-inspection" type="button">E · 关闭记录</button>
                  </div>
                </article>
              </section>

              <aside id="narrative-beat-card" class="narrative-beat-card" role="status" aria-live="polite" aria-atomic="true" hidden>
                <span id="narrative-beat-kind">LOST NAME / 入层</span>
                <strong id="narrative-beat-title">没有名字的人</strong>
                <div id="narrative-beat-lines"></div>
                <small>移动 3 步后收起 · 可在失名录重读</small>
              </aside>

              <article class="target-card" aria-label="当前怪物">
                <div class="target-card__kicker">ENCOUNTER / 当前记录</div>
                <strong id="target-name">等待进入课程房</strong>
                <div class="target-card__meta">
                  <span id="target-id">ID —</span>
                  <span id="target-species">类型 —</span>
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
              <button id="retreat-combat" type="button" class="retreat-action" hidden>
                ESCAPE / 撤退到复活点
              </button>

              <aside id="pickup-card" class="pickup-card" role="status" aria-live="polite" aria-atomic="true" hidden>
                <span id="pickup-kind">LOOT / 自动生效</span>
                <strong id="pickup-name">获得道具</strong>
                <p id="pickup-description"></p>
                <small id="pickup-effect"></small>
              </aside>

              <aside id="combat-result-card" class="combat-result-card" role="status" aria-live="assertive" aria-atomic="true" hidden>
                <span id="combat-result-kicker">VICTORY / 战斗结算</span>
                <div class="combat-result-card__identity">
                  <code id="combat-result-id">ID #---</code>
                  <i aria-hidden="true">→</i>
                  <b id="combat-result-name">名字未确认</b>
                </div>
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
                <blockquote class="scribe-recap">
                  <strong>复盘页 · 抄写员留存</strong>
                  <p id="scribe-recap">这里保存抄写员此前整理的本层事实，不代表她就在篝火旁。</p>
                </blockquote>
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

              <section id="floor-portal" class="floor-portal" aria-live="assertive" aria-hidden="true" hidden>
                <div class="floor-portal__ring floor-portal__ring--outer"></div>
                <div class="floor-portal__ring floor-portal__ring--inner"></div>
                <div class="floor-portal__tables" aria-hidden="true">
                  <span id="floor-ascent-facility">上升设施</span>
                  <i>↑</i>
                  <span id="floor-ascent-destination">下一层</span>
                </div>
                <strong id="floor-clear-title">FLOOR 01 CLEARED</strong>
                <p id="floor-clear-copy">CONGRATULATIONS!!</p>
                <div id="floor-victory-actions" class="floor-portal__actions" hidden>
                  <button id="open-ending-codex" type="button">查看 MIGRATE 终章</button>
                  <button id="restart-after-victory" type="button">开始新 Run</button>
                </div>
              </section>

              <section id="run-state-overlay" class="run-state-overlay" aria-live="assertive" hidden>
                <span>DEFEAT / CHECKPOINT</span>
                <strong>YOU DIED</strong>
                <p>正在返回最近休息的篝火…</p>
              </section>

              <section id="region-transition" class="region-transition" aria-live="polite" hidden>
                <span id="region-transition-kind">REGION TRANSIT</span>
                <strong id="region-transition-route">区域切换</strong>
                <p id="region-transition-copy">生态音乐与地图色调正在切换…</p>
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
                    <p id="terminal-objective" class="sr-only"></p>
                    <div id="terminal-task-brief" class="terminal-task-brief"></div>
                    <blockquote id="final-migration-argument" class="scribe-recap" hidden>
                      <strong id="final-migration-argument-title">ID #084 的论点</strong>
                      <p id="final-migration-argument-evidence"></p>
                      <p id="final-migration-argument-conclusion"></p>
                    </blockquote>
                    <div id="lock-list" class="lock-list"></div>
                    <div id="schema-list" class="schema-list"></div>
                    <details class="terminal-schema-reference">
                      <summary>完整字段速查 <span id="terminal-schema-table-count">${schemaTableCount} TABLES</span></summary>
                      <div id="terminal-schema-reference" class="schema-reference-grid"></div>
                    </details>
                  </section>

                  <section class="terminal-editor">
                    <label class="sr-only" for="sql-editor">输入完整 SQL</label>
                    <div class="sql-editor-shell">
                      <textarea id="sql-editor" spellcheck="false" autocomplete="off" placeholder="在这里完整写出 SELECT ...；高级层可使用 WITH ...;"></textarea>
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
                  <button id="close-gate-terminal" type="button" class="icon-action" aria-label="退出 SQL 密文解读">ESC 安全退出</button>
                </div>

                <div class="terminal-grid gate-terminal__grid">
                  <section class="terminal-brief gate-terminal__brief">
                    <div class="breach-risk"><span>RISK</span><strong>错误查询造成 1 点伤害 · 护甲优先</strong></div>
                    <p id="gate-terminal-objective"></p>
                    <div id="gate-challenge-schema" class="schema-list"></div>
                    <details class="terminal-schema-reference terminal-schema-reference--gate">
                      <summary>完整字段速查 <span>${schemaTableCount} TABLES</span></summary>
                      <div id="gate-schema-reference" class="schema-reference-grid"></div>
                    </details>
                    <details class="breach-hints">
                      <summary>分级破解提示 / 不直接给答案</summary>
                      <div id="gate-challenge-hints" class="hint-list"></div>
                    </details>
                    <p class="breach-note">成功只打开这一扇物理门；不会获得课程掌握、XP 或战利品。</p>
                  </section>

                  <section class="terminal-editor gate-terminal__editor">
                    <label class="sr-only" for="gate-sql-editor">输入 SQL 密文查询</label>
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
              <div class="story-thread" aria-label="当前剧情线索">
                <span>STORY / 当前线索</span>
                <strong id="story-thread-title">没有名字的人</strong>
                <p id="story-thread-line">先活下来，再从查询结果里找回自己。</p>
              </div>
              <p id="mission-body"></p>
              <p id="lesson-intro" class="lesson-intro"></p>
              <p id="banner" class="banner"></p>
            </section>

            <section class="castle-map-card" aria-label="魔王城发现式迷宫地图">
              <div class="card-heading"><span>迷宫勘测</span><span id="map-explored">探索后显形</span></div>
              <div id="castle-map" class="castle-map"></div>
              <div class="map-legend"><span class="legend-player">◆ 玩家</span><span class="legend-route">◇ 路标</span><span class="legend-campfire">♨ 篝火</span><span id="map-region-transit" class="legend-portal">◉ 区域交通</span><span class="legend-shortcut">▣ 捷径</span><span class="legend-gate">▮ 门</span><span class="legend-monster">■ 怪物</span><span class="legend-item">◆ 道具</span></div>
            </section>

            <section class="mastery-card">
              <div class="card-heading"><span>永久 SQL 图鉴</span><span id="victory-count">通关 0</span></div>
              <div id="mastery-list" class="mastery-list"></div>
              <div id="relic-list" class="relic-list">本轮尚无遗物</div>
            </section>

            <section class="schema-codex-card" aria-labelledby="schema-codex-title">
              <div class="card-heading">
                <span id="schema-codex-title">SCHEMA CODEX / 字段图鉴</span>
                <span>${schemaTableCount} TABLES · ${schemaFieldCount} FIELDS</span>
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

        <section id="admin-menu" class="admin-menu" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="admin-menu-title" inert hidden>
          <div class="admin-menu__panel">
            <header class="admin-menu__header">
              <div>
                <span>DEBUG OVERVIEW / 只读存档边界</span>
                <h2 id="admin-menu-title">管理员全局视图</h2>
                <p>可预览 1–8 层全图、怪物与三个生态区。预览状态不写入正式 Run；刷新页面恢复最后存档。</p>
              </div>
              <button id="close-admin" type="button" class="icon-action">ESC ×</button>
            </header>
            <div id="admin-summary" class="admin-summary"></div>
            <div id="admin-floor-list" class="admin-floor-list" aria-label="选择预览楼层"></div>
            <section class="admin-preset-section" aria-labelledby="admin-preset-title">
              <div class="card-heading">
                <span id="admin-preset-title">世界状态预设</span>
                <span>F1–F8 剧情切片</span>
              </div>
              <p>直接检查入层、隐藏区、SQL 密文门与通关后的地图变化；只影响本次管理员预览。</p>
              <div id="admin-preset-list" class="admin-preset-list"></div>
            </section>
            <div id="admin-region-list" class="admin-region-list"></div>
            <p class="admin-menu__warning">管理员模式只用于 Debug，包含未击败怪物真名、Boss 与剧情状态剧透。关闭面板仍保持全图可见；刷新页面才退出预览并恢复正式进度。</p>
          </div>
        </section>

        <footer class="page-footer">
          <span>真实执行：SQLite WASM</span>
          <span>地图：48×36 八层手工轮廓 + Seeded 支路</span>
          <span>音乐：公共领域古典主题电子改编 · 无外部录音</span>
          <span>奖励：课程宝箱固定 · 随机恢复品低概率</span>
        </footer>

        <div id="feedback-toast" class="feedback-toast" role="status" aria-live="polite" aria-atomic="true"></div>
      </div>
  `;
}
