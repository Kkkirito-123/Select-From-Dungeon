# Claude 交接文档

本文用于把当前工作区交给 Claude 继续进行代码审查、重构和验证。本文是工作区快照，不代表已经提交的最终版本，也不授权删除、回滚、提交或推送代码。

## 1. 当前目标

当前项目是 `SQL 魔王城 / SELECT * FROM DUNGEON`。近期工作分为两条线：

1. 保持游戏玩法不变，继续整理游戏代码的内部职责。
2. 在独立的 `agent/` 目录中实现篝火 Agent v1，只分析当前楼层 SQL 作答，不修改游戏状态。

管理员模式也已调整：战斗中自动填入当前题目的正确 SQL，结算、奖励、存档和复盘仍然走正式流程；管理员界面只保留“进入下一层初始位置”。

## 2. 工作区与分支状态

当前工作区：

```text
C:\Users\14405\.codex\worktrees\dbc5\New project
```

当前 Git 状态：

```text
HEAD: cbcda11 refactor: split game responsibilities
状态: detached HEAD
对应分支: codex/game-code-split
远程对应: origin/codex/game-code-split
```

另有一个独立工作区：

```text
C:\Users\14405\.codex\worktrees\agent-design\New project
分支: codex/agent-design
```

当前工作区存在大量未提交改动，包括删除旧 Agent、增加新篝火 Agent、管理员模式、游戏代码和文档修改。所有这些改动都视为用户已有工作：

- 不执行 `git reset`、`git checkout --`、`git clean`。
- 不删除 `.idea/`、`agent/.env` 或任何未跟踪文件。
- 不把删除旧文件误判为需要恢复。
- 不在未确认前切换分支、提交、推送或创建 PR。
- 修改前后都使用 `git diff` 和 `git status` 检查文件范围。

## 3. 已有提交与当前改动

### 已有提交

`cbcda11` 是游戏代码职责拆分的基础提交，已经包含按领域、存储、运行时、DOM 和 Phaser 方向整理后的主要结构。

### 当前未提交改动

当前 Diff 主要包含以下内容：

```text
旧 Agent 架构:
  agent/browser/
  agent/runtime/旧协调器、缓存、协议
  agent/src/sql_dungeon_agent/
  旧 Agent 专项测试

新篝火 Agent:
  agent/contracts/
  agent/flows/
  agent/campfire/
  agent/http/
  agent/providers/
  agent/runtime/
  agent/storage/
  agent/tests/

游戏端触发:
  src/application/hooks/
  src/application/triggers/
  src/infrastructure/agent/CampfireAgentClient.ts
  src/domain/learning/campfireReview.ts
  src/contracts/agent/campfireReview.ts
  tests/campfire*.test.ts

管理员模式:
  src/presentation/dom/adminAnswer.ts
  AppShell、GameSession、模板和对应测试
```

当前文件状态必须以实际 `git status` 和 `git diff` 为准，不要只依据本文。

## 4. 游戏端边界

游戏本体的权威状态仍然是 `GameSession`。它负责：

- 移动、地图、篝火、复活点和楼层状态。
- 战斗、SQL 执行结果、伤害、死亡、奖励和经验。
- 背包、装备、掉落、剧情、存档和玩家进度。
- `GameSnapshot` 的生成和对外通知。

Agent 只能读取受限证据，不能：

- 修改 `GameSession`、Run、Profile 或题库。
- 执行 SQL 或生成游戏指令。
- 负责路线、剧情、抄写员、安慰或死亡复盘。
- 接收完整存档、地图、背包、移动轨迹或玩家身份。

游戏端保留本地确定性篝火复盘。远程 Agent 只能替换复盘文案，不能决定复盘是否解锁。

## 5. 当前 Agent 数据流

```text
GameSession 快照
    ↓
TriggerBus
    ├─ answer      新增 SQL 作答记录
    ├─ campfire    首次进入篝火两格范围
    ├─ floor       楼层变化
    └─ death       进入死亡或死亡复盘状态，当前不触发篝火 Agent
    ↓
HookRegistry
    ├─ AnswerHook    标记当前楼层 evidence dirty
    └─ CampfireHook  生成本地复盘、判断缓存并发起请求
    ↓
CampfireAgentClient
    ↓ HTTP POST /v1/campfire/review
    ↓
agent/http
    ↓
agent/flows/review.py
    ├─ 请求契约校验
    ├─ 缓存/可选状态存储
    ├─ DeepSeek 生成或确定性生成
    └─ 输出契约校验
    ↓
CampfireHook
    ↓
CampfirePanel 只显示结果
```

触发规则：

- 战斗产生新作答时，只标记当前楼层为 dirty，不立即调用模型。
- 玩家进入任一篝火半径 2 的圆形范围后，才允许为当前证据发起请求。
- 相同 evidence key 在当前页面只请求一次。
- 新 SQL 作答会产生新的 evidence key。
- 请求失败、超时、响应非法或哈希不匹配时，继续显示本地确定性复盘。
- 当前实现使用内存缓存；Python 服务还提供可选的触发记录存储实现。

## 6. 篝火 Agent 当前契约

### 游戏端请求

入口：

```text
POST /v1/campfire/review
```

请求包含：

```text
protocolVersion
requestId
evidenceHash
floor
aggregate
attempts
```

当前游戏端最多发送当前楼层最近 8 条作答。每条作答包括：

```text
attemptId
lessonId
stageId
stageObjective
submittedSql
result
outcome
hintLevel
```

当前客户端会限制 SQL 和文本长度，并且不会发送 `answerSql`、完整 Run、地图、背包或存档。`evidenceHash` 来自规范化证据。

### Agent 响应

响应必须包含：

```text
schemaVersion
requestId
evidenceHash
headline
facts
focusConcept
nextAction
message
```

客户端和服务端都会验证字段、长度、请求 ID、证据哈希和普通文本边界。非法结果必须回退确定性复盘。

## 7. Python Agent 目录职责

```text
agent/
├─ contracts/       请求、响应、哈希和校验
├─ flows/           一次篝火复盘流程
├─ campfire/        兼容导入门面和篝火分析
├─ http/            路由、响应和 HTTP 服务生命周期
├─ providers/       可选模型供应商适配，目前包含 DeepSeek
├─ runtime/         服务端配置
├─ storage/         触发状态和已校验输出的 Store 接口/实现
└─ tests/            契约、流程、HTTP、DeepSeek 和存储测试
```

`contracts/` 和 `http/` 不是同一个职责：

- `contracts/` 定义并校验数据结构。
- `http/` 只负责 HTTP 路径、请求体读取、状态码和响应输出。
- `flows/` 负责业务流程编排。
- `providers/` 只负责调用外部模型并把输出交给契约校验。
- `storage/` 只保存触发元数据和已经验证的输出，不能保存原始 SQL、完整存档或模型密钥。

模型 Key 只允许出现在 Python 服务端环境或本地被 Git 忽略的 `agent/.env` 中，不得进入 `VITE_` 变量、浏览器、存档、请求响应和日志。

## 8. 管理员模式当前行为

当前正式 UI 行为：

- 管理员战斗进入或切换题目时，输入框自动填入正确 SQL。
- 普通模式的输入框不会得到正确 SQL。
- 管理员填写后仍然通过正式 SQL 执行、判题、伤害、奖励、XP、掉落和复盘流程。
- 管理员界面只显示进入下一层初始位置。
- 刷新页面可以退出管理员预览并恢复正式 Run。

注意：`GameSession` 内部仍保留部分旧的 `adminLoadFloor`、`adminApplyPreset`、`adminTravelToRegion` 等方法，历史领域测试仍然使用它们。界面已经不再暴露这些功能。删除这些方法前必须先审查测试和公开调用边界，不能只因为 UI 已隐藏就直接删除。

## 9. Claude 的执行顺序

请按以下顺序工作：

1. 先读根目录 `AGENTS.md`、`AGENTS.zh-CN.md`、`CLAUDE.md`，再读本文和 `agent/README.md`。
2. 执行 `git status --short --branch`、`git diff --stat`、`git diff --name-status`，确认没有误把用户改动当作基线。
3. 先做只读代码审查，确认新 Agent 的契约、触发、缓存、存储和 DeepSeek 回退路径。
4. 分别运行 TypeScript 测试/构建和 Python Agent 测试，记录真实结果。
5. 若发现问题，只按一个小职责修复，并为该职责增加定向测试。
6. 最后检查游戏端不依赖旧 Agent 路径、Agent 不修改游戏状态、管理员 UI 不恢复旧跳转入口。

推荐的优先审查点：

- `src/application/triggers/` 与 `src/application/hooks/` 的事件顺序和重复触发。
- `CampfireHook` 在新作答、进入范围、切换楼层和异步返回之间的状态一致性。
- `CampfireAgentClient.ts` 的证据投影、哈希、超时、缓存和响应校验。
- Python `contracts`、`flows/review.py`、`http` 和 `providers/deepseek.py` 的边界。
- 可选 Agent SQLite 是否只保存触发元数据与已校验输出。
- 当前楼层过滤是否严格，其他楼层、死亡复盘和空记录是否不会调用篝火 Agent。
- 文档与实际代码是否一致，尤其是旧 Agent、DeepSeek、原始 SQL 和管理员功能描述。

## 10. 验收命令

前端项目：

```powershell
pnpm test
pnpm build
pnpm architecture:check
git diff --check
```

Python Agent：

```powershell
python -m unittest discover -s agent/tests
```

如需启动服务：

```powershell
python -m agent --host 127.0.0.1 --port 8787
```

前端只有在配置以下变量后才请求 Agent：

```text
VITE_CAMPFIRE_AGENT_URL=http://127.0.0.1:8787/v1/campfire/review
```

服务端 DeepSeek 配置使用 `agent/.env` 或环境变量：

```text
DEEPSEEK_API_KEY=不要写入仓库或前端
DEEPSEEK_MODEL=deepseek-chat
```

不要在交接、日志、截图或提交信息中暴露真实 Key。

浏览器验收至少覆盖：

- 1280×720 桌面和 390×844 移动端。
- 战斗后进入篝火范围，确认先出现本地复盘，再异步替换文案。
- 同一证据不重复请求，新作答后允许新请求。
- Agent 不可用时仍能复盘和继续游戏。
- 管理员模式自动填题但仍走正式结算。
- 页面无横向溢出，控制台无新增 warning/error。

## 11. 交接结论

目前不是一个干净的、可直接覆盖的分支，而是“基础重构提交 + 大量用户未提交改动”的工作区。最重要的原则是先识别并保留当前 Diff，再进行小范围审查和修复。

本轮文档新增本文件，不代表已经完成 Agent 的最终设计或全量验证。任何“全部通过”“已删除”“已兼容”的结论都必须以实际命令输出为证据。
