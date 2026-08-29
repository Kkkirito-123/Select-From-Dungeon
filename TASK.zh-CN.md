# 当前任务

本文件是当前 L1/L2 任务控制面。没有活跃的已批准仓库改动时保持 `IDLE`；不要把它当作日志，
只保留最新已批准契约和最新恢复检查点。

```text
TASK_ID: gui-agent-tool-convergence
STATUS: COMPLETE
CONTRACT_REF: TASK.md
CONTRACT_REVISION: 1
APPROVED_REVISION: 1
APPROVAL: confirmed
ARCHITECTURE_REF: game/ARCHITECTURE.md
EXTERNAL_REF: game/ARCHITECTURE.md
```

## 契约

### 目标

用有界的文本 GUI Agent 契约替代面向模型的 VLM 式导航循环，并将 Dungeon Maintainer 从 12 个
模型可见工具收敛为 8 个。新契约必须能在不暴露坐标的前提下取得前置道具，在真实交互边界停止，
识别重复无进展动作，同时让所有源码写入继续受 detached worktree 安全边界约束。

### 用户与相关方

- 维护器用户：需要 Coding Agent 在复现和修复玩法故障时不会陷入导航死循环。
- 维护器与游戏工程师：负责工具、重放、浏览器桥和写入安全契约。
- 玩家：游戏规则、存档、答案、背包和可见交互行为不得被开发态桥暴露或改变。

### MVP

1. 模型只暴露 8 个工具：`inspect`、`edit`、`check`、`finish`、`workspace`、`look`、
   `act`、`query`。`/play`、`/diff`、`/verify`、`/apply`、`/discard` 保持不变。
2. 将证据 list/get 合入 `inspect`；将精确 patch、建文件和整文件写入合入维护器自有 `edit`；
   将 worktree 操作合入 `workspace`；将移动和可见交互合入 `act`；`query` 一次调用先写可见
   textarea，再点击真实提交控件。不再加载 Pi 原生 `write`。
3. 每个 `look`/动作结果携带修订号、当前目标、前置依赖说明和可执行 action ID。`act` 只接受
   最新匹配修订中的动作，最多执行 64 个真实移动步，出现 `E` 交互时必须停止。
4. 在下游目标受阻前，优先解析未领取房间奖励、必需的聚合战锤房和未取得的保证捷径钥匙。
   同一修订和动作连续两次无进展时返回 `stalled`，不得继续模型循环。
5. 模型工具虽已合并，语义重放仍保留内部移动、交互、SQL 输入和提交原语。

### 非目标

- 不加入截图/VLM 输入、任意鼠标坐标、选择器、JavaScript、Shell 工具、多 Agent 运行时或第二套
  自主模型循环。
- 不改变玩法、课程、地图生成、背包、存档 schema、SQL 判定、隐藏裁判或生产桥。
- 不改变 5 个用户命令，不自动 apply/commit/push，不发布正式仓库。
- 不削弱路径、审批、隐私、重放或补丁预算边界。

### 预计范围

- `dungeon-maintainer/src/pi/**`、`src/game/**`，以及为 8 工具统一写入所需的现有 workspace 实现。
- 维护器定向测试：工具注册、编辑安全、重放、旧修订、停滞动作和合并 query。
- `game/src/devtools/dungeon-agent/**` 及其定向桥测试：协议 1.0 文本 GUI Agent 契约和前置导航。
- 只在公开工具、协议、所有权或用户事实确实改变时更新维护器和游戏的 Architecture/README。

### 验收标准

- AC-1：模型只获得上述 8 个工具，不含 Pi 原生 `write`；5 个用户命令保持注册和原行为。
- AC-2：`inspect` 支持源码检查和证据 list/get；`edit` 支持唯一替换、创建新文件和整文件文本写入，
  始终强制当前 `baseHash`、精确批准路径、realpath、隔离 worktree、写入预算、刷新重放和写后证据。
- AC-3：协议 1.0 视图包含修订号、目标、前置依赖和稳定 action ID，不含坐标、完整地图、背包、
  存档、隐藏答案或裁判数据；过期或不可用动作不会执行。
- AC-4：导航在阻塞下一目标时能选择待领取奖励、必需聚合战锤房或未取得的保证捷径钥匙；移动在
  `E` 交互处停止，绝不自动跨越。
- AC-5：`act` 最多执行 64 个真实步；同一状态/动作第二次连续无进展时返回带最新视图的 `stalled`。
- AC-6：`query` 先把 SQL 写入当前可见的固定玩家 textarea，再点击真实提交控件；SQL 只为重放
  留在进程内存，不进入持久化事件或 Trace。
- AC-7：刷新重放保留合并后的 act/query 行为，并明确报告过期、拒绝、不可用或停滞，不以仅 banner
  变化冒充成功。
- AC-8：两个仓库适用的定向测试、完整测试、TypeScript、lint、架构检查、生产构建、
  `git diff --check` 与生产桥符号检查通过，且保留无关用户改动。

### 公开接口、兼容、发布与恢复

- 开发态浏览器桥统一使用协议 1.0，并原子提供 `look/act/query`；维护器客户端与游戏桥一起交付。
  版本不匹配本就会启动失败，因此不保留兼容适配层。
- 内部重放记录继续使用原有低层语义动作名，不需要迁移持久化任务或玩家存档。
- 仅在本地功能分支交付。恢复方式是停止本地维护器并回退该分支；在另行授权 `/apply` 或 Git 操作前，
  正式仓库和玩家存档不受影响。

### 风险与权衡

- 修订指纹若遗漏动作相关可见状态，可能接受过期意图；测试必须覆盖状态和动作变化。
- 前置选择不得暴露坐标或绕过课程/区域首领门；导航仍只穿过已发现且当前可走的格子。
- 整文件写入扩大影响面，因此现有 3 文件/120 行任务预算、Hash 绑定、精确范围、隐私检查和重放顺序
  继续强制执行。
- SQL 输入和提交合并减少一次工具往返，但重放只能在进程内保留 SQL，重启后必须明确失败。

### 假设与验证

- 用户的“开始实现”确认此前给出的 8 工具、自有 `edit`、一次调用 `query` 和用户命令不变方案。
- 现有源码与可执行测试定义玩法行为；先跑定向测试，再跑完整质量门，并区分浏览器/Vite、静态和 mock 证据。
- 未授权 commit、push、merge、release、部署或其他发布行为。

## 恢复检查点

- 当前有界切片：AC-1 至 AC-8 已在两个仓库的 `feature/gui-agent-tool-convergence`
  分支实现并验证；未执行 commit、push、merge、apply、release 或部署。
- AC-1/AC-2 证据：维护器 Extension 测试确认只注册
  `inspect/edit/check/finish/workspace/look/act/query`，不加载 Pi 原生工具和 Bash；edit 测试覆盖
  当前 Hash、精确范围、realpath、detached worktree 隔离、3 文件/120 行预算、授权、刷新重放和证据失效。
- AC-3/AC-4/AC-5 证据：协议 1.0 类型和游戏桥测试覆盖 revision 绑定稳定动作、旧修订拒绝、
  前置奖励/聚合战锤/捷径钥匙选择、交互停点、64 步上限，以及第二次无进展返回 `stalled`；
  不暴露坐标或隐藏玩家数据。
- AC-6/AC-7 证据：维护器重放与游戏桥测试覆盖合并 SQL 写入和提交、进程内 SQL 重放、重启后明确失败、
  过期/不可用/拒绝/停滞结果，以及刷新后的重放断言。
- AC-8 证据：维护器 lint、TypeScript、build 和 129/129 测试通过；游戏架构检查、生产构建和
  558/558 测试通过；两仓库 `git diff --check` 通过，`game/dist` 不含 `__DUNGEON_PLAYTEST__`。
- 保留工作：维护器原有 Eval 改动保持不变；仅将一个与现有生产谓词不一致的计划 Oracle 测试夹具
  对齐。全测写入冻结 Eval Dataset 的副作用已清除。
- 仍待验证：已批准契约范围内无。
- 阻塞：无。
- 下一动作：等待用户审查；任何 commit、push、merge 或发布均需另行授权。
