# GameSession / AppShell 专项交付

> 交付给下一位专门处理核心会话与 DOM 门面的 Agent。本文是当前工作树的事实和执行边界，
> 不是扩大范围的授权书。

| 项目 | 当前值 |
| --- | --- |
| 产品版本 | `1.0` |
| 交付状态 | `COMPLETE` |
| 专项范围 | `src/features/game-session/`、`src/features/app-shell/` 及其窄端口功能包 |
| 当前基线 | 工作树可能包含未提交改动；先读取 `git status`，不得回滚他人改动 |
| 目标 | 降低两个协调器的职责密度，同时保持玩家行为、存档和维护器协议不变 |

## 一句话任务

把 `GameSession` 和 `AppShell` 继续变成“薄门面 + 明确端口”：规则仍由会话提交，界面仍由门面装配，
每次只拆一个有测试覆盖的真实职责，不为减少行数制造抽象层。

## 先读什么

按下面顺序阅读，避免从两个大文件的第一行开始盲读：

1. `ARCHITECTURE.zh-CN.md`：八个代码区域、功能包边界、唯一状态所有者和运行流。
2. `docs/CODE_GUIDE.zh-CN.md`：按问题定位目录、同名模块辨析和已知协调器边界。
3. `AGENTS.md`：当前 1.0 的依赖、存档、安全、测试和停止条件。
4. 本文件的“不可触碰路径”和“验收清单”。
5. 只读检查目标方法及其测试，再决定一个垂直切片。

## 当前架构事实

```text
浏览器输入 / Phaser 输入
        |
        v
features/app-shell/AppShell（DOM 装配、输入转发、快照渲染）
        |
        +--> features/terminal/TerminalCoordinator（SQL 工作流）
        +--> features/narrative/NarrativeCoordinator（剧情动作）
        +--> features/snapshot/SnapshotRenderer（纯投影）
        |
        v
features/game-session/GameSession（唯一可变规则状态提交者）
        |
        +--> snapshot / event --> AppShell + DungeonScene + Persistence
        +--> SqlEngine / lessonEvaluator（由应用流程调用）
```

必须保持的单向边界：

- `GameSession` 不导入 DOM、Phaser、浏览器存储、网络或 Agent HTTP。
- `AppShell` 只能调用 `GameSession` 的公开动作和 `snapshot()`；不能写规则字段、存档或隐藏答案。
- `content/` 只提供作者内容；课程、地图、掉落和剧情判定不能复制到 `AppShell`。
- `BattleScene` 只播放动画或中止遭遇，不负责判题、扣血或推进状态。
- `TerminalPanel` 只负责 DOM 展示；SQL 仍由 `SqlEngine` 执行并由 `GameSession` 提交结果。
- `devtools/` 只在开发态使用，不能成为生产状态来源。

## 当前已完成的拆分

不要重复建立以下模块：

### GameSession 周边

- `sessionSnapshot.ts`：快照和存档转换。
- `sessionState.ts`：可变值的复制、空 Profile 和基础状态工具。
- `lifecycle/sessionWorld.ts`：Run 实例、世界 Actor 和初始地面物品。
- `inventory/`：背包、装备、消耗品和战利品状态转换；`index.ts` 是功能包入口，内部按奖励、查询、动作拆分。
- `sessionCombat.ts`：战斗状态和空回合构造。
- `combat/`：战斗抽题、经验结算、护甲伤害和复盘记录；`index.ts` 是功能包入口，保留
  `resolveCombatHit.ts` 作为命中规则模块。
- `sessionProgression.ts`：XP、等级和生命上限。
- `sessionExploration.ts`、`sessionInteraction.ts`：移动/交互失败和门控辅助。
- `admin/adminPreview.ts`：管理员预览数据和预设解析。
- `combat/resolveCombatHit.ts`、`learning/lessonCompletion.ts`、`progression/floorCompletion.ts`：
  已拆出的领域规则。

### AppShell 周边

- `appShellDom.ts`、`appShellTemplate.ts`：DOM 绑定和静态骨架。
- `renderers/HudRenderer.ts`、`MinimapRenderer.ts`、`CombatRenderer.ts`：显示投影。
- `panels/`：Terminal、Schema、Inventory、Campfire、Narrative、Record、Transition、Admin 等面板。
- `policies/appShellPolicies.ts`：无状态的弹层、叙事、身份脱敏和迁移策略。
- `phaser/snapshotFeedback.ts`：快照差异到拾取反馈的纯函数。

### 当前功能包入口

- `features/game-session/GameSession.ts`：唯一规则状态门面；`domain/session/*` 提供下层规则服务。
- `features/terminal/TerminalCoordinator.ts`：一次 SQL 提交的校验、执行、同步、动画和 busy 清理。
- `features/narrative/NarrativeCoordinator.ts`：剧情动作分发与证据确认顺序。
- `features/snapshot/SnapshotRenderer.ts`：前后快照到渲染模型的纯投影。
- `features/app-shell/AppShell.ts`：DOM 装配、事件路由和面板生命周期；内部由
  `rendering/AppShellProjectionRenderer.ts` 提供快照投影，由
  `workflows/NarrativeWorkflow.ts`、`workflows/FeedbackTransitionWorkflow.ts` 与
  `workflows/ResetWorkflow.ts` 提供 UI 工作流编排。
- `features/game-runtime/GameRuntime.ts`：启动、页面生命周期、部分失败回收和反向销毁。

## GameSession 现状与方法分区

文件约 3,500 行。行号会随拆分变化，方法名比行号稳定；具体的背包与战斗状态转换已下沉到
`domain/session/inventory/` 和 `domain/session/combat/`，门面只保留 Context 组装、公开动作和提交顺序。

| 分区 | 代表方法 | 当前职责 | 风险 |
| --- | --- | --- | --- |
| 生命周期/序列化 | `constructor`、`snapshot`、`toSavedRun`、`toProfile`、`reset` | 建立、恢复、导出和重置完整 Run | 极高 |
| 玩家移动 | `attemptPlayerMove`、`setPlayerPosition`、`advanceGuidanceEscort` | 墙/门、区域首领、篝火、接触、拾取、陷阱、遭遇顺序 | 极高 |
| 房间/旅行 | `travelToRoom`、`startEncounter`、`selectMonster`、`retreatFromCombat` | 公开交互入口和模式切换 | 高 |
| 篝火/背包/战利品 | `restAtCampfire`、`takeLootItem`、`takeAllLoot`、`equipInventoryItem`、`useConsumable` | 状态变更、容量和反馈 | 中高 |
| SQL/战斗 | `validateCombatQuery`、`resolveQuery`、`registerQueryError` | SQL 结果、阶段、反击、XP、死亡和存档相关状态 | 极高 |
| 密文门/巡逻/提示 | `resolveGateChallenge`、`advanceMonsterPatrols`、`requestHint` | 非主线机关和导航反馈 | 高 |
| 推进 | `advanceFloor`、`completeCampaignVictory`、`recordMigrationStep` | 切层、终局和 MIGRATE 顺序 | 极高 |
| 管理员 | `adminLoadFloor`、`adminNextFloor`、`adminApplyPreset`、`adminTravelToRegion` | 仅开发/评测预览 | 中高 |
| 派生查询 | `currentRoom`、`currentLesson`、`availableRoomIds`、`roomAccessMessage`、`floorHazards`、
  `navigationGuidance`、`interactionPrompt` | 从当前状态计算只读视图 | 最适合先拆 |

### GameSession 推荐拆分顺序

#### 已完成：纯派生查询模块

`src/domain/session/sessionSelectors.ts` 只接收显式只读 Context，不接收 `GameSession`
实例，也不保存引用。已迁移的查询包括：

- `currentRoom`、`currentLesson`、`currentStage`、`currentCombatStages`；
- `monsterForCurrentRoom`、`actorForRoom`、`livingActorAt`；
- `availableRoomIds`、`requiredCompletedRoomIds`、`roomAccessMessage`；
- `navigationGuidanceContext`、`navigationGuidance`；
- `challengeGateId`、`nearbyLockedChallengeGate`、`floorHazards`；
- `interactionPrompt`。

边界：

- Context 只包含计算所需字段，优先使用 `Pick`/专用接口，不把整个会话传进去。
- GameSession 保留公开动作和 `emit()`；只读方法是薄转发器。
- `tests/sessionSelectors.test.ts` 覆盖房间回退、角色/怪物选择和门禁优先级。

#### 已完成：库存与战利品状态转换

`domain/session/inventory/` 由 `index.ts` 编排奖励、查询和动作模块。GameSession 只提供窄 Context，
保留容量、保护物品、一次性奖励、`openedGateIds` 和 `emit` 的原子顺序。已迁移范围：

`takeLootItem`、`takeAllLoot`、`equipInventoryItem`、`discardInventoryItem`、`discardConsumable`、
`useConsumable`、`spawnLootBundle`、`openLootBundle`、`collectGroundItem`、`applyReward`、`addRelic`、
`availableWeaponLoot`、`claimableRoomReward`。

这一步必须保留容量、保护物品、一次性奖励、`openedGateIds` 和 `emit` 的原子顺序；如果 Context 变成
几十个字段，就停止并退回更小的纯函数拆分。

#### 已完成：战斗状态转换纯函数

`domain/session/combat/` 由 `index.ts` 编排 `practiceBattle.ts`、`experienceSettlement.ts`、
`playerDamage.ts` 和 `battleReview.ts`，并继续导出 `resolveCombatHit.ts`。已迁移
`preparePracticeBattle`、`awardExperience`、`applyPlayerDamage` 和答题记录的纯部分。
`resolveQuery`、`registerQueryError`、`completeAmbush` 不要在同一轮搬迁，它们连接 SQL、战斗、死亡、XP、
档案和快照，是当前最容易产生行为回归的路径。

#### 最后阶段：管理员入口

`adminPreview.ts` 已有纯逻辑。只有在前面边界稳定后，才考虑把 `adminLoadFloor`、`adminApplyPreset`、
`adminTravelToRegion` 变成显式端口；管理员代码不能进入生产默认路径。

## GameSession 不可触碰路径

第一轮拆分不得改写以下行为顺序：

- `constructor` 的新 Run 初始化和 v12 存档恢复；
- `attemptPlayerMove` 的门/区域首领/篝火/接触/拾取/陷阱/遭遇顺序；
- `resolveQuery` 与 `registerQueryError` 的 SQL、阶段、反击、XP、死亡和记录顺序；
- `advanceFloor`、`completeCampaignVictory`、`recordMigrationStep` 的终局语义；
- `sessionSnapshotContext`、`snapshot` 的脱敏和复制边界；
- `emit()` 的通知时机；
- `run:v12`、`profile:v3`、`generator v7` 和题库版本契约。

禁止为了降低行数而删除当前 1.0 功能、重新引入历史兼容、改变稳定 ID 或修改存档字段。

## AppShell 现状与方法分区

文件约 1,700 行。它对外主要是 `mount()` 和 `destroy()`，内部只保留 DOM 生命周期、事件入口和整体快照编排；
快照投影位于 `rendering/`，剧情与反馈/转场编排位于 `workflows/`。

| 分区 | 代表方法 | 说明 | 风险 |
| --- | --- | --- | --- |
| 装配/生命周期 | `mount`、`destroy` | 模板、面板、订阅、事件、计时器和资源清理 | 极高 |
| 输入/事件 | `inspectionHandler`、`keydownHandler`、`patrolHandler` | 弹层优先级、快捷键、焦点和地图标记 | 高 |
| SQL 工作流 | `executeQuery`、`executeGateChallenge` | 校验、执行、一次会话提交、HP 同步、动画和异常恢复 | 高但最适合做完整垂直切片 |
| 弹层/焦点/音频 | `openReview`、`closeInspection`、`syncAudioFocus`、`trapDialogFocus` | 互斥界面和焦点恢复 | 高 |
| 抄写员/剧情 | `renderScribeState`、`campfireReview`、`renderNarrativeProgress`、`executeStoryMomentActions` | Agent 输出、证据确认、队列和 MIGRATE | 高 |
| 快照渲染 | `render`、`renderGateChallenge`、`renderFloorTransition`、`renderMastery` | 模式进入检测、签名去重、面板渲染 | 高 |
| 反馈/重置 | `showFeedbackNotice`、`presentLootAcquisition`、`reset` | Toast、结算卡和新 Run | 中高 |

### AppShell 推荐拆分顺序

#### 已完成：TerminalCoordinator

先定义窄端口，再移动 SQL 工作流；新协调器不能反向导入 `AppShell`。端口至少覆盖：

- `session.validateCombatQuery` / `resolveQuery` / `registerQueryError`；
- `session.validateGateChallengeQuery` / `resolveGateChallenge` / `registerGateChallengeError`；
- `sql.execute` / `executeSelect` / `reset` / `updateMonsterHp`；
- `BattleScene.animateTurn` / `abortEncounter`；
- TerminalPanel 结果渲染、状态文本、反馈和音频回调。

必须保持：

- 空 SQL 不调用 Session、不消耗回合；
- `busy` 防止重复提交；
- SQL 结果提交成功后按 `hpUpdates` 同步 SQLite；
- 动画失败不回滚已经提交的回合，并按当前模式恢复；
- 失败路径仍清理终端和 `.game-stage.is-resolving`；
- gate challenge 的伤害、结果展示和提示语不与普通战斗混用。

先写 fake-port 单测，证明“空输入零调用、一次输入一次 resolve、动画失败仍保留状态、异常后 reset”。

#### 已完成：NarrativeCoordinator

在 SQL 工作流稳定后，再处理 `narrativeMomentQueue`、`activeNarrativeMoment`、抄写员输出、证据确认和
MIGRATE。新协调器可以拥有自己的队列，但只能通过显式端口调用 `RecordPanel`、`NarrativePanel` 和
`GameSession.recordStoryEvidence/recordMigrationStep`。

必须保持：

- 打开故事不会提前写入证据；只有确认动作才记录；
- MIGRATE marker 必须按固定顺序；
- `closeInspection` 对 story/migration/scribe 的焦点和确认语义不变；
- session subscribe、结算卡关闭和楼层切换的重入行为不变。

#### 已完成：SnapshotRenderer 与 AppShell 内部工作流

`features/snapshot/SnapshotRenderer.ts` 接收 `snapshot`、`previousSnapshot` 和前一阶段标识，
只返回房间、模式进入、拾取差异、路线和音频模式等派生值；`AppShell.render()` 继续负责 DOM 写入。

`features/app-shell/rendering/AppShellProjectionRenderer.ts` 负责 HUD、战斗目标、锁、任务简报、提示、
小地图、掌握度、遗物和怪物图鉴投影；`features/app-shell/workflows/NarrativeWorkflow.ts` 负责剧情队列、
抄写员和 MIGRATE；`features/app-shell/workflows/FeedbackTransitionWorkflow.ts` 负责战利品获取、战斗结算卡、
临时卡片消失和楼层转场阻塞判定；`features/app-shell/workflows/ResetWorkflow.ts` 负责管理员/忙碌守卫、
Run 重置清理顺序和成功反馈。四个模块都通过显式 Port/回调工作，不创建第二份规则状态。

保留 `render()` 作为门面，尤其不能丢失：

- `enteredCombat/Challenge/Campfire/Inventory/Loot/Defeat/DeathReview` 计算；
- stage/mode 变化时清空 SQL；
- locks/hints/mastery/relics 的签名去重；
- transition、gate terminal、自动 death review 和音频场景切换。

#### 已完成：GameRuntime

`features/game-runtime/GameRuntime.ts` 负责存储、题库、SQLite、Agent、Phaser 和 AppShell 的构造，
并统一处理页面可见性、beforeunload、部分初始化失败和幂等 `destroy()`。`application/main.ts` 仅保留
样式、DEV loader、启动调用和错误显示。外部 Audio、Presence、持久化和维护器桥的最终释放只在
`GameRuntime`，`AppShell.destroy()` 只解绑自己的 DOM 订阅、面板和用户手势；异步释放或页面可见性
失败会被收口记录，不产生未处理 Promise 拒绝。注入测试用 Phaser 工厂时不会额外加载正式 Phaser 装配模块。

本轮完整验证已通过：TypeScript、95 个测试文件/556 项测试、生产构建、架构与仓库规则检查、
`git diff --check`；生产构建产物未包含维护器桥符号。固定 7 个 Benchmark 的浏览器 Oracle 已在
故障版本和修复后版本各命中 7/7，浏览器错误数为 0。

维护器最新分支的真实 Agent 回合已执行到 Provider 边界，但 Provider 返回 HTTP 402（余额不足），
因此没有完成模型回合；维护器现在将其记录为 `status=infra_error`、`failureClass=infrastructure`、
`agentFailureCode=model-billing-unavailable`，不是游戏正确性失败。真实设备、真人八层完整通关和受限
iframe 仍需人工验收。

#### 暂不拆的部分

不要为了缩短文件而同时拆 `mount`、`destroy`、`keydownHandler` 或静态 `appShellTemplate`。这些代码共享
AbortController、焦点恢复、弹层优先级和 DOM ID，拆错后通常表现为间歇性 UI 回归。

## 共同不变量

以下不变量跨两个文件，任何拆分都必须在 PR/交付说明中逐条确认：

1. 一个用户动作最多产生一次 GameSession 状态提交。
2. GameSession 不接受 DOM 选择器、坐标脚本、隐藏 SQL 或管理员答案作为参数。
3. AppShell 不保存第二份规则状态；`lastSnapshot` 只用于显示差异和模式进入检测。
4. 所有异步 UI 工作流都有 busy/abort/cleanup 边界，`destroy()` 可重复调用且清理订阅、计时器和面板。
5. 快照是复制后的只读投影；不得通过修改快照反写会话。
6. 任何新模块只能依赖更低层或中立端口，不能形成 `GameSession <-> AppShell` 循环依赖。
7. 变更不泄露隐藏答案、完整地图、正式存档、身份、SQL 以外的私有内容或 Agent 内部输出。

## 测试与验收

### 修改前基线

先执行并记录结果：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests --no-file-parallelism
```

当前参考基线：93 个测试文件、551 项测试通过。测试数量可能随新增测试增加，不要硬编码数量判断成功。

### 定向测试

根据改动选择至少一组：

```powershell
node node_modules/vitest/vitest.mjs run `
  tests/GameSession.test.ts `
  tests/sessionBoundaries.test.ts `
  tests/inventory.test.ts `
  tests/inventoryActions.test.ts `
  tests/combatSessionActions.test.ts `
  tests/AppShell.test.ts `
  tests/appShellTemplate.test.ts `
  tests/snapshotFeedback.test.ts `
  tests/SnapshotRenderer.test.ts `
  tests/AppShellProjectionRenderer.test.ts `
  tests/FeedbackTransitionWorkflow.test.ts `
  tests/NarrativeWorkflow.test.ts `
  tests/GameRuntime.test.ts `
  --no-file-parallelism
```

涉及对应领域时追加：

- `tests/dungeonAgentBridge.test.ts`、`tests/dungeonAgentProtocol.test.ts`
- `tests/floorOneLabyrinth.test.ts`、`tests/eightFloorLabyrinth.test.ts`
- `tests/navigationGuidance.test.ts`、`tests/guidedMapSession.test.ts`
- `tests/AdminPanel.test.ts`、`tests/SchemaPanel.test.ts`
- `tests/storageBoundaries.test.ts`、`tests/browserDataStore.test.ts`

### 完整验收

```powershell
pnpm test
pnpm build
node scripts/check-architecture.mjs
python ../scripts/validate-rules.py
git diff --check
```

若从仓库根目录执行规则检查，命令为：

```powershell
python scripts/validate-rules.py
```

### 交付必须回答的问题

- 移动了哪些具体函数？每个函数的新所有者是谁？
- 新模块接收的 Context/Port 有哪些字段？是否能再缩小？
- 哪些公开 API、存档字段和稳定 ID 保持不变？
- 哪些测试先失败、后来通过？是否覆盖失败路径和异步竞态？
- 是否检查了循环依赖、隐藏状态泄露和 `destroy()` 清理？
- 是否同步更新 `ARCHITECTURE.md`、中文译文或 `CODE_GUIDE`？
- 工作树中是否只留下源码、测试和必要文档，没有生成物？

## 下一位 Agent 的执行模板

```text
1. 读取 git status 和本文件，确认没有回滚他人改动。
2. 选择一个阶段、一个新模块、一个最小职责；先写边界测试。
3. 用显式 Context/Port 移动实现，保留原公开方法作为薄转发器。
4. 运行定向测试、TypeScript、架构检查和 git diff --check。
5. 再运行完整 `pnpm test` / `pnpm build`；若 Windows shell 无法解析本地 `.bin`，使用等价的直接 Node 入口并记录环境差异。
6. 更新架构文档和本交付文档的状态、文件清单与剩余风险。
7. 不提交、不推送、不部署；把最终 diff 和验证结果交给下一个维护者。
```

## 完成定义

本专项只有在以下条件同时满足时才算完成：

- `GameSession` 和 `AppShell` 的新增职责不再继续膨胀；
- 至少一个真实垂直切片被移到独立模块，且 Context/Port 可读；
- 公开行为、存档、维护器桥和 1.0 规则没有变化；
- 定向测试和完整质量门全部通过；
- 新人能从架构文档直接找到新模块、调用者和对应测试；
- 没有为了行数而引入第二份状态、泛化 `Manager/Helper/Utils` 或历史兼容层。

如果拆分需要修改核心状态顺序、存档 schema、维护器协议或大量 DOM 选择器，应停止该轮并先提交设计说明，
不要在代码中隐式扩大范围。
