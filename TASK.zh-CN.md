# 当前任务

本文件是当前 L1/L2 任务控制面。没有活跃的已批准仓库改动时保持 `IDLE`，不要把它当作日志，
只保留最新契约和恢复检查点。

```text
TASK_ID: game-session-app-shell-partition
STATUS: IDLE
CONTRACT_REF: TASK.md
CONTRACT_REVISION: 0
APPROVED_REVISION: 0
APPROVAL: not-required
ARCHITECTURE_REF: game/ARCHITECTURE.md
EXTERNAL_REF: none
```

## 契约

### 目标

将过大的 `GameSession` 与 `AppShell` 协调器拆成职责明确的功能包，采用 pi 风格的依赖方向：下层服务
暴露窄端口，功能编排器组合服务，顶层运行时负责构造与销毁。同时保持当前玩法、存档格式、维护器边界
和玩家可见行为不变。

### 用户与相关方

- 维护者和客户端工程师：只看目录和文件名即可定位职责，不必先阅读巨型文件。
- 玩家：继续使用相同的 Run v12/Profile v3 游戏行为。
- Dungeon Maintainer：开发态桥接和投影契约保持不变。

### MVP

1. 新增清晰的 `game/src/features/` 布局，包含六个功能包：`game-session`、`terminal`、`narrative`、
   `snapshot`、`app-shell`、`game-runtime`。
2. 将 GameSession 的纯派生查询移到显式只读上下文；`GameSession` 仍是唯一规则状态提交者，已有公开
   API 保留为薄转发器。
3. 将 Terminal、Narrative、Snapshot 工作流置于窄端口之后。协调器只返回决策或渲染投影，不持有玩法
   状态、存档、隐藏答案，也不越过声明的适配器边界构造 DOM。
4. `AppShell` 继续负责 DOM 生命周期和事件路由，`main.ts` 变成薄入口；`GameRuntime` 负责依赖构造、
   订阅和销毁，包括部分初始化失败后的清理。
5. 增加边界测试，并更新架构/维护文档，使新人能从入口和测试追踪每个功能包。

### 非目标

- 不改变 Run v12/Profile v3 schema、generator-v7 地图、题库身份、稳定 ID、玩法规则、SQL 判定或推进顺序。
- 不引入第二份可变游戏状态、不改成 reducer/event sourcing、不引入 operation log 或 pi 专属 lane/队列语义。
- 不增加运行时依赖、公共 HTTP 协议或存储迁移，不让开发态维护器桥进入生产路径。
- 不进行大范围格式化，不改动工作树中与本任务无关的既有修改。

### 预计范围

- `game/src/features/**`，以及为接线所需的 `game/src/domain/session`、`game/src/presentation/dom`、
  `game/src/application` 现有模块。
- 选择器、协调器端口、生命周期清理和既有 GameSession/AppShell 行为的定向测试。
- 仅在确认所有权/路由改变时更新 `game/ARCHITECTURE.md`、`game/ARCHITECTURE.zh-CN.md`、
  `game/docs/CODE_GUIDE.zh-CN.md` 和维护器架构图。

### 验收标准

- AC-1：所有当前游戏测试通过，公开 session、snapshot、存储、维护器和玩家行为契约不变。
- AC-2：`GameSession` 不导入 DOM、Phaser、存储、网络或 Agent，且仍是唯一规则状态写入者；`AppShell`
  不直接修改规则或存档，继续作为 DOM 生命周期门面。
- AC-3：每个新功能包都有显式入口和窄端口；依赖方向为“下层服务 → 功能编排 → 运行时入口”，无循环依赖，
  并由架构检查器约束。
- AC-4：终端空输入不调用 SQL/Session；一次提交最多一次状态提交；动画、异常和 abort 路径始终释放 busy
  并清理。剧情证据与 MIGRATE 保持确认顺序。
- AC-5：快照复制与脱敏和现状完全一致；模式进入、过渡、音频、小地图和战斗反馈不回归。
- AC-6：`main.ts` 为薄 bootstrap，`GameRuntime.destroy()` 可重复调用，并能清理部分初始化后的订阅/资源。
- AC-7：TypeScript、定向测试、完整游戏测试、生产构建、架构/规则检查和 `git diff --check` 全部通过；不产生
  生成物或无关改动。

### 兼容性、恢复与风险

- 这是保持行为的源码重排；现有 v12/v3 数据和当前开发/可选服务边界都保留。
- 如果某方法移动会改变状态提交顺序、快照脱敏、存储形状或协议行为，就保留为已说明的门面，不强行抽象，
  并在交付中报告。
- 工作树已有其他未提交清理改动；所有新改动必须叠加其上，不能 reset 或覆盖。

### 假设与验证

- 用户已确认的设计是意图来源：英文职责命名、一个显式功能入口、下层通过端口隐藏构造细节。
- 现有源码和测试定义行为；每个切片前先做基线，定向检查通过后再做完整质量门。
- 未授权 commit、push、merge、部署或其他外部发布。

## 恢复检查点

- 当前有界切片：功能分区已集成，并加固运行时资源所有权与部分初始化清理。
- 证据：直接 Node 入口已通过 TypeScript、协调器与生命周期定向测试（6 个文件、47 项）、完整
  Vitest（88 个文件、537 项）、Vite 生产构建、架构与仓库规则检查及 `git diff --check`；生产产物
  不含维护器桥符号。固定 7 个 Benchmark 的浏览器 Oracle 已同时命中故障态与修复后干净态（7/7），
  浏览器错误数为 0。
- 维护器最新分支的真实 Agent 回合已到达 Provider 边界，但 Provider 返回 HTTP 402（余额不足），没有
  完成模型回合；结果已正确归类为 `infra_error` / infrastructure，代码为 `model-billing-unavailable`，
  不作为游戏正确性失败。
- 仍待人工验收：真实设备、真人八层完整通关和受限 iframe。本 Windows shell 的 `pnpm test`/`pnpm build`
  无法解析本地 `.bin` 命令，但等价的直接 Node 入口已通过。
- 阻塞：无。
- 下一动作：维护者可在单独获得明确 Git 操作授权后审查并发布；本轮未执行 commit、push、merge 或部署。
