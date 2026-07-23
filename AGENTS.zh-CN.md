# AI 编码 Agent 仓库指南

本文件是根级英文权威 `AGENTS.md` 的同步中文译文。进入仓库后先阅读根指南；以后若增加局部
`AGENTS.md`，还必须读取约束目标文件的最近一份。`CLAUDE.md` 继续作为英文权威的轻量导入。

## 工作契约

- 默认使用中文回复，除非用户要求其他语言。使用 UTF-8；标识符、API 与测试遵循代码库语言。
- 每次只服务一个明确目标。编辑前检查 Git 状态、所属源码、测试、契约与相关文档。
- 保护用户的无关改动。未经明确授权，不得覆盖、回滚、删除、发布、格式化或暴露无关内容。
- 新功能、重构、删除、依赖或 Schema 变化、批量修改、全局配置或其他高影响工作前，提交目标、
  用户或干系人、MVP、非目标、预计文件范围、验收标准、假设、验证方式与风险，等待确认。
- 优先最小完整纵向切片，不增加推测性功能、抽象、兼容路径、依赖或文档。
- 区分实现、环境、验证路径和工具失败；同一种实质失败最多尝试三次。
- 只声明实际执行的检查，并区分单元、类型、构建、浏览器、Provider、设备与端到端证据。
- 本地检查和验证不代表获得 Commit、Push、PR、部署、破坏性操作或其他外部写入权限；这些动作
  必须单独明确授权。

## 产品与用户

`SQL 魔王城 / SELECT * FROM DUNGEON` 是面向 SQL 初学者和面试准备者的中文浏览器肉鸽。
当前 MVP 是双层 Run；每层都是确定性生成的 64×48 连续种子迷宫，以 16×16 作为技术分区，并增加额外环路以
减少死路折返。玩家必须实际行走探索迷宫，让不可点击传送的发现式小地图逐步显形；进入有名字
的必修怪物所在格或通过步数遭遇判定时切换到独立单体战斗，在游戏内写完整只读 SQL。每局以
两颗心开始，怪物反击固定扣一颗心，胜利按怪物等级获得经验，拾取后会解释道具作用；击败第一层
两阶段 `HAVING` 魔王后自动显示短暂传送门，最终在第二层击败综合 `JOIN` 魔王。探索状态下，
地图普通怪约每 1,100 毫秒巡逻一步。每层锁定的 Boss 门还提供一个可选高难 SQL 越级机关：
正确组合查询只打开当前物理门，错误结果或语法错误损失一颗心，且永远不会授予课程掌握、XP
或战利品。

当前明确不包含 AI 生成、账号、排行榜、多人、服务端数据库，也不宣称完整模拟 MySQL 优化器
或 InnoDB 运行时。种子只随机化物理迷宫和非关键奖励，不随机必修 SQL 数据、前置课程和关键
武器。第一层教授从 `SELECT` 到 `HAVING`，难度更高的第二层教授 `ORDER BY / LIMIT`、
`DISTINCT`、`INNER JOIN`、`LEFT JOIN` 与综合 `JOIN`。这十组课程并不代表完整 SQL 或
MySQL 面试八股范围。

## 架构与执行流

```text
index.html -> src/main.ts
  -> AppShell（DOM HUD、发现式小地图、新手引导、SQL 终端与证据）
  -> SqlAutocomplete（可见 Schema 词汇、排序、替换与 Listbox）
  -> GameSession（权威迷宫、演员、迷雾、战斗、掉落和永久档案）
  -> RunGraph（课程依赖与兴趣点图）
  -> MazeGenerator/MazeValidation（确定性 64×48 物理世界）
  -> EncounterDirector（确定性步数计量、安全期与伏击选择）
  -> MonsterRoaming（确定性的缓慢巡逻决策）
  -> SqlEngine（内存 SQLite WASM、初始数据、SELECT 执行和 HP 同步）
  -> lessonEvaluator（查询特征、关卡知识锁与结果语义判定）
  -> DungeonScene（连续迷宫、迷雾、碰撞、巡逻与同格遭遇）
  -> BattleScene（独立对战场景、血条、意图与战斗动画）
  -> FeedbackDirector（语义事件 -> 一条通知与一个音频提示）
  -> ArcadeAudio（随机电子古典探索曲、原创激昂战斗曲与事件音效）
  -> OnboardingController（移动 -> 遭遇 -> 终端 -> 查询 -> 拾取）

玩家移动 -> MazeFloor 碰撞/知识门 -> 迷雾、拾取或步数遭遇判定
玩家 SQL -> 只读策略 -> SQLite 结果 + EXPLAIN QUERY PLAN
  -> 结果语义 + 关卡知识锁校验 -> 正确时自动攻击 / 错误时怪物反击
  -> 同步 GameSession 与 SQLite HP -> 刷新 Phaser/UI
  -> 防抖写入 v5 Run 存档 + 永久 v2 Profile 存档
```

`GameSession` 是物理移动、遭遇计量、课程、演员、迷雾、战斗、生命、经验、掉落与档案的事实
权威。
`RunGraph` 是课程依赖图，不是物理导航模型；`MazeFloor` 才是保存的物理世界，包括地块、区域、
知识门、锚点和装饰。`DungeonScene` 负责渲染世界、收集输入和调度约 1,100 毫秒的巡逻 Tick，
`BattleScene` 只呈现战斗事件，两者都不能计算战斗规则。AppShell 的小地图只呈现探索证据，绝不
允许传送玩家。`FeedbackDirector` 把语义事件映射为运行时 Web Audio 提示和可选通知；
`EncounterDirector` 根据成功移动做可复现的伏击判定，刷新页面不会重抽；`OnboardingController`
管理独立持久化的逐步教学。

`SqlEngine` 负责 `monsters`、`monster_signals`、`rooms`、`monster_gear` 内存 Schema 与查询执行；UI 不得绕开它的只读
边界。`lessonEvaluator` 允许等价 SQL，但必须同时满足查询结果和本关概念锁。第一层课程刻意
限定为单层 `SELECT`，不允许 `OR`、子查询或集合运算，避免把必修条件藏在无效分支里。第二层
排序与连接题也遵循单语句边界，并把真实关系条件纳入概念锁。共享课程数据与固定掉落位于
`src/content/mvpLevel.ts`，第二层内容位于 `src/content/floor2Level.ts`；房间氛围与局内奖励位于
`src/content/runContent.ts`；可选 Boss 门题目与语义结果约束位于
`src/content/gateChallenges.ts`；新手引导文案位于 `src/content/onboarding.ts`。每个 SQL
阶段都从空编辑器开始。`src/ui/sqlAutocomplete.ts` 负责从当前可见 Schema 与 MVP SQL 词汇中
确定性生成提示；只有玩家通过键盘或指针明确接受时才能替换当前 Token，不得生成完整答案、
提交查询或绕过课程判定。

## 仓库地图

```text
src/audio/          原创程序化 Web Audio 音乐循环与事件音效
src/content/        课程、实体、固定武器、奖励与新手引导文案
src/domain/         纯状态、战斗规则、课程图、物理迷宫、校验、巡逻、语义与查询策略
src/feedback/       把语义游戏事件路由到通知和音频提示
src/game/           连续迷宫探索、战斗场景与游戏启动
src/sql/            SQLite WASM 初始化、Schema、执行和 HP 同步
src/storage/        带版本的迷宫 Run/Profile 本地存储校验与恢复
src/ui/             DOM 界面、新手引导状态及 SQL/游戏编排
tests/              规则、迷宫、巡逻、反馈、存储、引导与查询策略的 Vitest 测试
.agents/skills/     需求、初始化、交付、实现、指南同步和显式发布工作流
scripts/            可移植规则验证器及其回归测试
.github/workflows/  对规则、测试、类型和生产构建执行只读 CI
dist/               生成的静态构建；被忽略且不得手工修改
```

仓库仍然很小，所有模块使用同一套安装和质量门，因此暂不增加模块级指南。

## 标准命令

要求 Node.js `>=20.19` 与 pnpm `11.9.0`。

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
```

`pnpm build` 先运行 TypeScript 检查，再执行 Vite 生产构建。静态产物位于 `dist/`；WASM 资源需要
正常 HTTP 请求，因此应通过 HTTP 托管，不要直接使用 `file://` 打开。

## 运行与安全边界

- SQL 通过 `sql.js`/SQLite WASM 完全在浏览器执行，查询与游戏数据不会发送到后端。
- 战斗终端只接受一条 `SELECT`；执行前拒绝 DML、DDL、`PRAGMA`、`ATTACH` 和多语句输入；界面
  最多显示 50 行结果。
- 两个 SQL 输入框都提供 IDE 式 `PLAN ASSIST` Listbox。输入前缀会显示排序后的关键词、函数、
  表名与字段名；`Ctrl/Command + Space` 打开语境提示，方向键移动选择，`Enter`/`Tab` 或指针
  接受，`Escape` 先关闭建议再关闭终端。输入 `m.` 等限定别名时，只显示解析到的可见表字段；
  接受建议不会提交查询，也不会增加查询次数。
- 第一层判定进一步限定为一条平坦 `SELECT`，不允许 `OR`、子查询、`UNION`、`INTERSECT` 或
  `EXCEPT`；支持表别名限定列，也支持在 `HAVING` 中使用题目要求的 `total` 别名。
- 当前 I/O 热量使用 SQLite `EXPLAIN QUERY PLAN`。这是 SQLite 证据，不是 MySQL 执行计划。
  后续 MySQL/InnoDB 概念必须明确标记为模拟，或使用另行隔离的真实后端。
- 存档只保存在浏览器，并拆为 `select-from-dungeon:run:v5`（当前楼层、迷宫、演员、地面物品、
  迷雾、遭遇计量、等级/经验、已打开的挑战门、当前机关题与可丢弃的当前 Run 状态）、
  `select-from-dungeon:profile:v2`
  （十项已掌握课程、练习次数、通关数、
  最佳查询数）和 `select-from-dungeon:onboarding:v1`（引导完成/跳过状态）。有效的
  `select-from-dungeon:run:v4` 会在内存中迁移为 v5，且默认没有已开启的挑战门；更旧 Run Key
  不读取也不删除。有效的 `profile:v1` 会迁移为 v2。`src/main.ts` 对快照驱动的持久化进行
  防抖；改变结构时必须处理版本或恢复。
- 核心学习装备必须确定性掉落，随机性不得阻塞课程进度；战斗伤害保持确定，便于检查 SQL 锁定。
- 新 Run 以两颗心开始。普通、精英、魔王胜利分别获得 1、3、5 经验；累计经验达到 2、4、6、8，
  后续每 4 XP 一档直到 24 时升级。每升一级增加一颗生命上限，并恢复一颗心。
- 一次 SQL 提交等于一个战斗回合；思考和输入没有倒计时。正确结果只触发玩家攻击，结果错误或
  语法错误才触发预告的怪物反击。空输入不得消耗回合。
- 站在锁定 Boss 门旁按 `E` 会打开可选的 `QUERY BREACH` 机关终端。第一层固定考察
  `JOIN + WHERE + COUNT + GROUP BY + HAVING + ORDER BY`，第二层增加 `LEFT JOIN`、
  `COUNT(DISTINCT ...)` 与 `LIMIT`；判定同时检查查询特征和精确结果语义。成功只打开当前物理门，
  不增加课程掌握、练习次数、XP 或战利品；结果错误和语法错误损失一颗心，空输入与 `Escape`
  不产生代价。
- 64×48 `MazeFloor` 记录 16×16 技术分区，完成基础雕刻后确定性增加环路以减少死路。玩家必须
  实际走过连续世界；发现式小地图不是导航控件。移动进入存活必修怪物所在格，或成功移动触发
  遭遇计量时，会自动进入独立战斗场景；战后安全步数避免连续伏击。地图普通怪缓慢巡逻，魔王
  固定不动。
- 拾取第一层钥匙后进入 `transition` 状态；AppShell 显示传送门，并在约 1.2 秒后自动调用
  `GameSession.advanceFloor()`，无需移动或按 `E`。等级、XP、武器、遗物与查询数跨层保留，
  每层迷宫和课程状态重新生成。
- 松散怪物掉落使用触碰收集，玩家走上去就会自动拾取；非阻塞说明卡会显示道具名称、描述与
  效果。祭坛、宝箱与篝火使用 `E` 调查。课程关键装备仍然确定可得且可达。
- Web Audio 音乐和事件提示均由项目代码生成。第一层探索在四首抒情电子古典风格曲式中随机
  轮换；第二层探索在三首基于公版贝多芬作品、由代码重新编排与合成的芯片曲中轮换。战斗切换为
  原创激昂复古科幻曲式，不复制其他游戏的录音或旋律。移动、撞墙、遭遇、查询施法、命中、受伤、阶段
  完成、掉落、拾取、开门、胜利与失败都有区分反馈；减少动态效果偏好可以抑制动作效果，但不
  改变游戏状态。
- 像素角色、地砖、房间装饰、音乐与音效均由项目代码生成。增加第三方图片、字体、音频或复制
  关卡文字前，必须完成许可审查并更新归属。
- 运行依赖固定在 `package.json` 与 `pnpm-lock.yaml`。依赖变化仍需审批，并按风险检查许可证、
  包体、构建与浏览器行为。
- 不得在代码、Fixture、日志、截图、清单或报告中暴露凭证、个人数据、私有地址或敏感本地内容。

## 仓库 Skill 与交付

可复用工作流位于 `.agents/skills/`：

```text
未批准或有歧义的修改 -> $define-requirement -> 用户确认
首次获批初始化         -> $bootstrap-repository
获批的实质交付         -> $deliver-change
  -> $implement-change -> 验证/审查 -> $sync-project-guide
局部低风险切片         -> $implement-change -> 同步决策
只改指南或 README      -> $sync-project-guide
已审查本地结果 + 单独发布授权 -> $publish-change
```

不能原生发现 Skill 的客户端必须读取路由到的 `.agents/skills/<skill-name>/SKILL.md`。Skill 缺失时
如实报告，不得声称执行。`$publish-change` 禁止隐式触发。

## 架构同步与证据

代码改变长期目录、归属、流程、命令、配置、存储、Schema、安全、兼容、工作流、质量门、生成
代码归属、许可证或分发事实时，更新最近的指南；仓库级事实同步根指南与中文译文。用户可见的
安装或行为变化还要单独决定是否更新 README。

最终交付报告说明修改文件、检查及最新结果、发现、未验证区域、剩余风险，并给出
`GUIDE_UPDATED`/`GUIDE_NO_UPDATE` 与 `README_UPDATED`/`README_NO_UPDATE`。结束前审查完整 Diff。

仓库原创代码和文字采用根 MIT `LICENSE`。保留的模板材料继续保留原版权声明，第三方运行时
声明和参考来源继续记录在 `ATTRIBUTIONS.md`。
