# 当前任务

本文件是当前 L1/L2 任务控制面。没有活跃的已批准仓库改动时保持 `IDLE`；不要把它当作日志，
只保留最新已批准契约和最新恢复检查点。

```text
TASK_ID: client-flow-guide
STATUS: COMPLETE
CONTRACT_REF: TASK.md
CONTRACT_REVISION: 1
APPROVED_REVISION: 1
APPROVAL: confirmed
ARCHITECTURE_REF: game/ARCHITECTURE.md
EXTERNAL_REF: none
```

## 契约

### 目标

在 `client-flow-guide/` 下创建一套独立、不可执行的 Markdown 说明包，介绍选定游戏代码流程，
并模拟用户、Dungeon Maintainer、Coding Agent、本地游戏桥和评审者如何协同完成一次有界变更。

### 用户与相关方

- 介绍人员和甲方评审：无需操作真实维护器或游戏运行时，也能理解完整流程。
- 仓库维护者：模拟内容必须符合真实架构、隐私、隔离、验证和发布边界。

### MVP

1. 提供入口 README，说明阅读顺序、角色、范围，并醒目标注所有交互与输出均为模拟。
2. 使用简洁 Mermaid 时序图和源码链接说明 SQL 判定/战斗、移动/遭遇、快照/渲染/持久化。
3. 说明维护器协同链：仓库识别、有界案例描述、隔离物化、架构路由、本地桥交互、源码修改、验证、
   Diff 审查和人工明确授权。
4. 提供一份虚构会话，展示输入、决策、有界证据、模拟工具结果、停止条件和最终交接，且不暴露隐藏
   Benchmark 或玩家数据。

### 非目标

- 不提供可执行示例、脚本或应用代码，不调用真实维护器/游戏，也不声称模拟输出来自真实运行。
- 不修改生产源码、测试、README、Architecture、协议、Benchmark fixture、依赖或配置。
- 不包含隐藏复现、Oracle、答案 SQL、完整地图、存档、背包、身份、凭据或私有端点。
- 不执行 commit、push、merge、apply、release 或部署。

### 预计范围

- `client-flow-guide/README.md`
- `client-flow-guide/01-game-code-flow.md`
- `client-flow-guide/02-maintainer-collaboration.md`
- `client-flow-guide/03-simulated-session.md`
- `TASK.md` 与 `TASK.zh-CN.md` 仅用于必需的任务契约和检查点。

`docs/client-code-flow-comments` 上已有的未提交源码注释必须保持不变。

### 验收标准

- AC-1：新目录恰好包含上述四个 Markdown 文件，不包含可执行产物。
- AC-2：每个文件均明确区分已验证仓库事实与模拟请求、结果和决策。
- AC-3：三条游戏流程使用准确职责边界和可点击的仓库相对源码引用。
- AC-4：维护器流程准确覆盖 marker 识别、Adapter 发现/物化、隔离工作、架构引导检查、开发态桥边界、
  验证、Diff 审查以及独立的 apply/发布授权。
- AC-5：虚构会话不含隐藏或敏感数据，也不暗示模型能获得坐标、完整快照、隐藏答案或任意 Shell。
- AC-6：已有源码变更保持不变；静态检查 Markdown 结构和本地链接；完整 Diff 通过 `git diff --check`。

### 风险与权衡

- 模拟内容可能被误认为真实运行记录，因此每个文档都必须在使用处标记说明性内容。
- 工具细节过多会掩盖协同模型，因此说明以职责和授权门为主，不展开内部传输实现。
- Mermaid 是否渲染取决于 Markdown 查看器，因此每张图旁边都保留等价文字说明。

### 假设与验证

- 交付格式为 Markdown；不需要浏览器应用、幻灯片或可执行样例。
- 目录名为 `client-flow-guide/`，工作继续保留在当前 `docs/client-code-flow-comments` 分支。
- 仅做静态验证：审查全部新增内容、校验本地链接目标、确认无受保护数据、保留原有源码 Diff，并运行
  `git diff --check`。
- 未授权任何发布动作。

## 恢复检查点

- 当前有界切片：AC-1 至 AC-6 已在 `docs/client-code-flow-comments` 完成；未调用真实维护器或游戏，
  未执行 commit、push、merge、apply、release 或部署。
- AC-1/AC-2 证据：`client-flow-guide/` 恰好包含四个已批准 Markdown 文件且无可执行产物；每个文件
  都在使用位置附近将说明性请求、结果或图标记为模拟。
- AC-3 证据：三张 Mermaid 时序图和等价文字说明 SQL/战斗、移动/遭遇、快照/渲染/持久化，
  并通过本地链接指向职责源码。
- AC-4 证据：维护器流程覆盖固定 marker、Adapter 的 `catalog`/public `describe`/`materialize`、
  隔离工作、schema-v4 路由、DEV 本地桥边界、验证、Diff 审查以及独立的人工 apply/发布授权。
- AC-5 证据：虚构会话使用占位内容，将诊断与检查输出标为模拟，不含可执行 SQL、凭据模式、隐藏答案、
  Oracle、完整地图、存档、背包或身份数据。
- AC-6 证据：四文件结构、标题、声明、代码围栏和本地链接通过静态 Node 检查；未发现尾随空白或敏感
  模式；已跟踪变更通过 `git diff --check`。
- 保留工作：现有七文件源码注释 Diff 和当前分支保持不变。
- GUIDE_NO_UPDATE：稳定 Agent 权限、路由和停止条件没有变化。
- ARCHITECTURE_NO_UPDATE：补充说明包不改变运行拓扑、职责、协议、数据、命令或兼容事实。
- README_NO_UPDATE：安装方式和玩家可见行为没有变化；新目录是有界的甲方说明材料，不是产品入口。
- 仍待验证：特定外部查看器中的 Mermaid 渲染；该产物刻意不可执行，因此未运行真实流程、测试或构建。
- 阻塞：无。
- 下一动作：等待用户审查；任何 commit、push、merge、apply、release 或部署均需另行授权。
