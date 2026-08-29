# 当前游戏架构

本文件记录 `game/` 已验证的当前事实：产品边界、职责、运行流、命令、数据格式、兼容性和安全面。
稳定编辑规则位于 `AGENTS.md`，仓库当前任务位于 `../TASK.md`；本文件是英文权威
`ARCHITECTURE.md` 的同步中文译文。

## 新人总览

先读这一节。产品版本统一为 **1.0**，代码按八个清晰区域组织；内部格式编号是独立的兼容性标识，
不代表产品发布版本。

```text
浏览器
└─ index.html -> src/application/main.ts
   ├─ contracts/       跨层类型与协议
   ├─ application/     启动、配置、生命周期与编排
   ├─ features/        按工作流组织的门面、协调器与运行时
   ├─ content/         课程、楼层、剧情、SQL、背包作者内容
   ├─ domain/          GameSession 与纯游戏规则
   ├─ infrastructure/  存档、SQLite、音频、在线状态与 Agent IO
   ├─ presentation/    DOM 面板与 Phaser 场景
   └─ devtools/        仅开发态的 Dungeon Maintainer 桥
```

| 区域 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| `contracts/` | 跨层类型、存档/结果/Agent/存储协议 | 游戏规则、渲染或外部 IO |
| `features/` | `GameSession`、终端、剧情、快照、DOM 外壳和运行时功能包 | 作者内容、底层适配器的重复实现 |
| `content/` | 课程、楼层/世界/剧情、SQL 与背包静态定义 | 可变运行时状态或持久化 |
| `domain/` | 会话底层服务以及移动、战斗、探索、学习、成长、掉落规则 | DOM、Phaser、网络或浏览器存储 |
| `application/` | 启动、配置、生命周期与事件/Agent 编排 | 具体玩法判定或渲染 |
| `infrastructure/` | 存档、SQLite、音频、在线状态、浏览器与 Agent 适配器 | 游戏决策或 UI 标记 |
| `presentation/` | DOM 面板/渲染器与 Phaser 场景；渲染快照并转发意图 | 存档、SQL 判题、隐藏状态或规则归属 |
| `devtools/` | 仅开发态的维护器桥和玩家可见投影 | 生产入口、玩家存档、隐藏答案或完整地图 |

`GameSession` 是唯一可变游戏状态提交者。其他区域只能提供作者内容、通过它应用规则、执行外部
IO，或渲染它产生的快照。

```text
启动
index.html -> main.ts -> GameRuntime -> DataStore/GameSession -> AppShell + DungeonScene

玩家动作
DOM/Phaser 输入 -> GameSession -> Snapshot/Event -> DOM + Phaser + Persistence

SQL 动作
SQL 终端 -> SqlEngine + lessonEvaluator -> GameSession -> Snapshot/Event
```

功能包按单向端口连接：`game-session` 是唯一规则状态门面；`terminal`、`narrative` 和
`snapshot` 只接收显式服务端口；`app-shell` 负责 DOM 生命周期与事件路由；`game-runtime`
负责构造、页面生命周期和反向销毁。允许的包边由 `scripts/check-architecture.mjs` 校验，
不得让协调器反向依赖运行时或形成环。

当前内部编号继续使用 **Run 12**、**Profile 3** 和 **generator 7**；它们描述存档/世界格式，
不是产品版本。

## 产品与用户

`SQL 魔王城 / SELECT * FROM DUNGEON` 是面向 SQL 初学者和面试准备者的中文浏览器肉鸽。
产品版本 1.0 包含当前八层 Run；新 Run 使用唯一一套确定性 `56×42 / generator v7` 紧凑迷宫，玩家不能
输入 Seed 或重抽地图。每层将手工房间分散到整张地图，并生成 DFS 迷宫、约 15% 回环、三个区域
和实体交通地标。
当前 Run 校验器只接受 generator v7 地图，历史地图格式会被忽略。玩家必须实际行走探索地图，让不可
点击传送的发现式小地图逐步显形；必修怪物被击败前只显示稳定的 `ID #NNN`，最后一击才回收
直白名字并写入永久怪物图鉴。进入存活必修怪物所在格或通过步数遭遇判定时切换到独立单体战斗，在游戏内写完整只读 SQL。每局以
两颗心开始，怪物反击按楼层与角色矩阵确定伤害并由护甲优先承受，胜利按怪物等级获得经验并显示明确的
战后 XP 结算；课程确定奖励预先位于对应房间宝箱，完成课程后才可靠近按 `E` 打开。步数触发
的随机遭遇会结算 XP，并且只可能产生低概率可选物品。安全区外每次符合条件的成功移动具有 2%
基础突发遭遇概率，连续 30 个符合条件的安静步数后必定触发；刷新不会重抽。每层在中、后阶段
各生成一个稳定的实体篝火；出生点作为前段安全与兜底复活锚点。
同一 Seed 还会确定性派生主课程路线信标、所有剩余死路的一次性补给，以及服务前、中、后三段的
三条保证钥匙双向捷径。路线兴趣点最大间隔为 18 格；钥匙不占背包且不依赖随机掉落。玩家必须先
走到钥匙处，再在捷径门旁按 `E` 开启并往返，且不能绕过必修 SQL 或存活的区域首领。若连续
40 步仍未到达下一个固定目标，显示方向与距离；60 步高亮最多 24 格路线；100 步保持强化路线
高亮。玩家始终手动移动，指路不传送，也不触发伏击。
篝火可见安全区和出生安全区都不会触发突发遭遇，巡逻怪也不能进入。靠近篝火按 `E` 可选择
`在此休息` 或 `答案复盘`；休息会恢复满生命并把该篝火设为复活点。死亡会保留局内进度和敌人
剩余生命，显示 `YOU DIED`，返回最近休息的篝火（尚未休息则回出生点）、恢复满生命并自动打开
本场复盘。击败前七层魔王后都会自动显示短暂传送门，最终在第八层击败五阶段数据库事故魔王，
然后完成唯一的七页 `MIGRATE` 流程。探索状态下，
地图普通怪约每 1,100 毫秒巡逻一步。每层锁定的 Boss 门还提供一个可选实体 SQL 密文机关：
正确组合查询只打开当前物理路线并永久改变密文状态，错误结果或语法错误造成 1 点护甲优先伤害，且永远不会授予课程
掌握、XP 或战利品。
本轮还包含 12 格装备背包、一个武器位、一个防具位与三种恢复品堆叠，每种最多 5 个。只有探索
或篝火状态可按 `B` 管理背包，打开时暂停移动和巡逻。护甲生命优先承受反击，并在篝火休息或
复活时恢复。产品版本 1.0 的可选随机池只保留自动使用的恢复品：普通怪 2%、小型精英 5%、
区域首领 10%、层主 0%；不再为精英或 Boss 补足随机掉落。课程奖励、明确宝箱与钥匙保持确定。
满背包必须显式替换，普通物品丢弃后在当前层可重新拾取，基础/课程/钥匙类保护物品不能丢弃。
篝火与抄写员是两个独立的游戏对象。实体篝火始终负责休息和复活点，但本层精英被击败前不会解锁学习复盘，
复盘按钮保持禁用。达到该条件后，篝火根据当前层本地记录显示确定性复盘。每层另有一名实体抄写员，
作者内容是她的本地回退文案。当前游戏没有玩家提示词；配置 `VITE_AGENT_URL` 后，可选的无状态
Python 服务通过 `POST /v1/agent/run` 只运行变化的篝火或抄写员角色，再生成 Main 指引。本地结果仍然立即可用。抄写员在调查、死亡复盘和导航指引等级提升时响应，不能修改游戏状态、路线或存档。
每层五个短叙事拍和两条固定《失名录》证据仍由现有 Run 进度
解锁；证据明确区分未知、已查为 `NULL` 和实际值。第八层完成 1.0 唯一结局 `MIGRATE`，
不使用账号、服务端游戏数据库或远程游戏日志。
第一至第八层各有且仅有一个可选实体隐藏房：第一层“封存旧库”在完成 `WHERE / IS NULL` 后
开放，第二层“沉船记录舱”在完成 `ORDER BY / LIMIT / DISTINCT` 后开放，第三层在前三项关系
课程后开放“无主遗物室”。第四层需要先完成前三项子查询课程并击败中层区域首领 `ID #044`，
才会显出压缩的第一层“回燃残响”；其中确定提供“回燃衣”，装备后会改变角色的兜帽、肩甲、胸前
印记与色板。第五至第八层依次隐藏“静默名册室”“未提交育龙室”“盲索引花园”和“零行礼拜堂”，
确定提供黑铁甲、龙鳞甲、水晶甲和王者甲，并在装备后显示不同轮廓。隐藏门状态复用
`openedGateIds`，篝火不会生成在隐藏房内，可选证据和装备都不能阻塞主线或必修课程。
顶栏 `答题复盘` 读取浏览器本地答案记录，分别展示最近一场战斗和当前楼层。每条记录包含玩家
SQL、明确参考 SQL、结果分类、提示等级和战斗结果；最多保留 200 个 SQL 回合，不记录移动
或按键。完整日志和复盘结果只保存在浏览器，由确定性的游戏规则计算。明确配置篝火 Agent 后，
最多八条当前层玩家 SQL 投影和聚合统计才会发送到唯一 Agent 入口；抄写员只接收
当前场景作者文案以及受限的学习、死亡或导航证据。参考 SQL、移动、地图、背包、身份和完整存档不会离开浏览器。
怪物显示名必须直白且容易输入：统一使用“史莱姆”“水胶怪”“幼龙”这类二到三个汉字，
不得添加间隔点称号或 SQL 概念后缀。新增内容也遵守同一规则；SQL 含义放在字段、任务与
遭遇机制中，不塞进显示名。
Campaign 框架已经定义并校验全部八层可玩内容的有序课程先修、三种题阶、五类遭遇角色、
主题/拓扑、怪物/装备/掉落池、确定结业奖励与执行证据边界。当前八层共包含 47 个必修课程组
和一个五阶段最终魔王。
运行时会从已保存地图确定性派生每层三个区域，不重复保存几何副本。八层手工宏观主题依次为
地下余烬档案、潮汐群岛、白霜墓原、元素升炉、黑铁外城、龙脊上城、残照王苑和黑金高堂。
突发遭遇只从当前生态怪物池抽取；八层小型精英权重分别为
5%、7%、9%、11%、13%、15%、17% 与 19%。已编写的可选区域首领使用符合本层的多阶段练习，
奖励 3 XP，但随机物品不保证掉落。第二至八层的三个生态区由两组实体区域门连接；中段区域首领
胜利后自动进入末段主线区。第一层是明确例外：保留一张连续手工路线，用水位变化与保证可得的
实体捷径组织回环，不再显示或启用通用区域门。区域首领不会进入出生/篝火安全区，也不阻塞必修课程。
每层另有一份通过校验的独立迷宫契约，把唯一迷宫名与拓扑签名绑定到稳定的入口、出口、Boss 门、
回返捷径、隐藏房、安全房、视野半径和实体陷阱意图。玩家可从手工安全房直接踏入危险迷宫；任何
视觉上可通行的格子都不得被不可见边界或确认墙阻挡。手工入口/休息房与确定性篝火圈会完整显示各自安全范围，并
排除突发遭遇、巡逻、课程怪物、区域首领与陷阱；安全区外的当前角色只在本层局部视野半径内显示。
每层 Seed 会把独有的一次性实体陷阱稳定放在房间、锚点、门、交通、引导兴趣点与安全格之外；
触发时不进入 SQL 战斗，只按该层配置造成护甲优先伤害，随后把稳定陷阱 ID 写入
`openedGateIds` 并显示为失效。第二至八层的相邻迷宫步行不再受抽象区域边界碰撞；存活的中段区域
首领改为封锁可见的中后段交通和跨区捷径，课程房前置门仍防止越课。
第一至第八层都有手工运行时体验定义，拥有稳定地标、实体隐藏入口、每层一个 SQL 密文门、
派生世界状态、故事触发、抄写员位置与管理员预设。第三层用骨桥、双名墓碑、遗物链和并存证词
让 JOIN 关系可见；第四层
使用火、冰、雷三区，中层首领 `ID #044` 守住可见后区交通并在胜利后显出第一层余烬残响。该残响是
第四层内的记忆空间，不切换楼层，也不复制或修改第一层真实进度。

当前明确不包含自由对话式 AI、由 AI 编写课程或修改游戏状态、账号、排行榜、多人、服务端游戏
数据库，也不宣称完整模拟 MySQL 优化器或 InnoDB 运行时。可选的纯输出抄写员适配器只读，且
不会阻塞游玩。固定内部世界键负责重建唯一物理迷宫；稳定 Hash 仍可变化非关键房间奖励
和可选掉落，但不随机必修 SQL 数据、前置课程和关键武器。第一层教授从 `SELECT` 到 `HAVING`，
难度更高的第二层教授
`ORDER BY / LIMIT`、`DISTINCT`、`INNER JOIN`、`LEFT JOIN` 与综合 `JOIN`；第三层加入内连接、
左连接、自连接、三表链路与 `UNION`；第四层加入标量、`IN`、`EXISTS`、相关子查询、CTE 与
递归 CTE；第五层教授窗口函数，第六层使用一次性 DML/事务沙箱，第七层教授索引和真实 SQLite
执行计划，第八层使用可重复事故夹具教授 MVCC、锁、隔离、建模、复制、分片和查询安全。
这 47 组课程并不代表完整 SQL 或 MySQL 面试八股范围。

## 架构与执行流

```text
index.html -> src/application/main.ts
  -> features/game-runtime/GameRuntime（服务装配、生命周期、反向销毁）
  -> features/game-session/GameSession（唯一规则状态门面）
  -> features/app-shell/AppShell（DOM HUD、小地图、背包/战利品、SQL 终端与本地复盘）
     -> features/terminal/TerminalCoordinator（SQL 一次提交）
     -> features/narrative/NarrativeCoordinator（剧情动作与证据确认）
     -> features/snapshot/SnapshotRenderer（纯快照投影）
  -> 仅开发态 DungeonAgentBridge（localhost + ?playtest=agent，纯内存存储）
  -> PresenceClient -> 同源 SSE -> ../presence/server.mjs -> PresencePanel
  -> CampfireReview（当前楼层确定性 SQL 复盘）
  -> TriggerBus -> AgentRuntime/XState（并行篝火、抄写员、Main 生命周期与内存缓存）
  -> AgentGateway -> 可选 ../agent/src/dungeon_agents -> 变化的 PydanticAI 角色 -> Main 引导 -> AgentPanel
  -> OpenTelemetry（不含正文的请求、子 Agent、Main 与模型 Span）
  -> QuestionBankLoader/LearningLedger（经校验 SQLite 题库与 IndexedDB 证据）
  -> SqlAutocomplete（完整 Schema 词汇、排序、替换与 Listbox）
  -> SqlSchemaCatalog（权威字段、类型、生成 DDL 与教学关系）
  -> FloorContracts（八层课程、遭遇、主题与掉落 Schema）
  -> GameSession（权威迷宫、战斗、掉落、答题记录和永久档案）
  -> CampaignDomain（有序八层槽位与换层不变量）
  -> RunGraph（课程依赖与兴趣点图）
  -> FloorMapBlueprints（八层手工宏观轮廓与交通身份）
  -> FloorLabyrinthContent（稳定的 F1–F8 导航、安全房、视野与陷阱契约）
  -> FloorExperience（F1–F8 手工地标、隐藏房、SQL 密文、剧情与世界状态）
  -> MazeGenerator/MazeValidation（唯一确定性 56×42 / generator v7 世界）
  -> CampfireDomain（每层两个稳定复活点、出生锚点与共享安全格掩码）
  -> GuidedMap（路线信标、死路补给、保证钥匙与双向捷径）
  -> BiomeDomain（派生区域、静态地貌与安全的区域首领锚点）
  -> FloorLabyrinthDomain（局部视野、安全范围解析与确定性陷阱）
  -> EncounterDirector（确定性步数计量、安全期与伏击选择）
  -> MonsterRoaming（确定性的缓慢巡逻决策）
  -> LootDirector（种子化独立恢复品候选与同场去重）
  -> SqlEngine（内存 SQLite 运行时：优先 WASM，失败回退 asm.js、初始数据、SELECT/WITH 执行和 HP 同步）
  -> lessonEvaluator（查询特征、关卡知识锁与结果语义判定）
  -> NarrativeContent/NarrativeDomain（叙事拍、证据、上升路线与 MIGRATE）
  -> ActorVisuals/PixelActorFactory（地图/战斗同源角色配方）
  -> DungeonScene（连续地图、迷雾、碰撞、巡逻、抄写员与遭遇）
  -> BattleScene（使用同源角色动画的独立对战）
  -> FeedbackDirector（语义事件 -> 一条通知与一个音频提示）
  -> MusicScore/ArcadeAudio（公版古典主题的程序化电子合成）
  -> NarrativeCodexView/MonsterCodexView（本地剧情档案与名字回收记录）
  -> OnboardingController（移动 -> 遭遇 -> 终端 -> 查询 -> 拾取）

玩家移动 -> MazeFloor 碰撞/知识门 -> 迷雾、拾取或步数遭遇判定
玩家 SQL -> 只读策略 -> SQLite 结果 + EXPLAIN QUERY PLAN
  -> 结果语义 + 关卡知识锁校验 -> 正确时自动攻击 / 错误时怪物反击
  -> 同步 GameSession 与 SQLite HP -> 刷新 Phaser/UI
  -> 合并写入 v12 Run 存档 + 永久 v3 Profile + IndexedDB 学习账本
有意义的快照 -> 当前层本地证据 -> 确定性篝火复盘与作者剧情展示
```

`GameSession` 是物理移动、篝火/复活点、安全区、遭遇计量、课程、演员、迷雾、战斗、生命、
护甲、背包、种子化掉落、答题记录与档案的事实权威。
`RunGraph` 是课程依赖图，不是物理导航模型；`MazeFloor` 才是保存的物理世界，包括地块、区域、
知识门、锚点和装饰。`DungeonScene` 负责渲染世界、收集输入和调度约 1,100 毫秒的巡逻 Tick，
`BattleScene` 只呈现战斗事件，两者都不能计算战斗规则。AppShell 的小地图只呈现探索证据，绝不
允许传送玩家。`FeedbackDirector` 把语义事件映射为运行时 Web Audio 提示和可选通知；
`EncounterDirector` 根据成功移动做可复现的伏击判定，刷新页面不会重抽；`OnboardingController`
管理独立持久化的逐步教学。

`src/domain/learning/campfireReview.ts` 负责把当前楼层答案记录转换为篝火面板使用的确定性事实。
它只读取快照，不访问存储或外部服务，也不能改变游戏状态。`src/application/agent/scribeView.ts` 将当前场景
投影为受限的学习、死亡或导航证据；作者内容始终是本地回退，展示前仍执行现有的怪物身份脱敏。

`src/application/triggers/` 负责把快照变化转换为语义事件，`src/application/agent/AgentRuntime.ts` 用一个 XState
actor 管理篝火、抄写员和 Main 三个并行状态区，并负责脏状态、同源取消、跨源并发、面板优先级和三份独立
页面内存缓存。`src/infrastructure/agent/AgentGateway.ts` 是唯一端点、稳定 Hash、5 秒中止和严格回复校验的
唯一网络边界。导航使用确定性抄写员子结果，不调用抄写员模型。`agent/` 负责 Python 3.11+ 严格 Pydantic
契约、PydanticAI 模型入口、子 Agent/Main 流程、不含正文的 OpenTelemetry Span 与一个 HTTP 路由；服务没有
Agent 数据库或输出 Store。

`src/application/config/` 统一维护带中文注释的运行时调节参数，例如地图尺寸、遭遇概率、导航阈值、
存储上限和同源在线状态端点。`PresenceClient` 校验 SSE 人数并维护浏览器重连状态；
`PresencePanel` 只渲染传入状态。内容 ID、文案、SQL 契约与存档版本仍由原有
权威模块负责。

`src/devtools/dungeon-agent/` 只负责唯一的外部维护器协议 v3，维护器拒绝其它桥协议，并且始终只在开发态使用：`protocol.ts` 负责
协议类型与临时存储，`actions.ts` 负责固定 DOM 动作和可见覆盖层，`projection.ts` 负责玩家可见投影，
`navigation.ts` 负责页面内部目标/frontier BFS 与停止原因，`query.ts` 负责浏览器内部固定查询执行，
`trace.ts` 负责有限语义环形 Trace，`bridge.ts` 只负责协议生命周期装配。`src/application/main.ts` 只能
在 `import.meta.env.DEV`、本机 URL 和 `?playtest=agent` 同时满足时加载该目录。试玩模式使用内存
DataStore、关闭可选远程 Agent endpoint，不打开玩家 IndexedDB 或正式 Run/Profile。它只能投影
当前已打开终端中玩家 textarea 已经可见的 SQL；不得读取 `snapshot.adminAnswerSql`、隐藏答案、
未揭示提示、完整地图、存档、背包、身份或隐藏裁判数据。

`src/content/sql/sqlSchema.ts` 负责 `monsters`、`monster_signals`、`rooms`、
`monster_gear` 的权威字段、类型、可空性元数据、生成 DDL 与教学关系；`SqlEngine` 执行该 DDL
并负责内存查询，UI 不得重复维护表定义或绕开只读边界。目录中的关系是 JOIN 教学提示，不是
SQLite 已声明的 `FOREIGN KEY` 约束。`lessonEvaluator` 允许等价 SQL，但必须同时满足查询结果
和本关概念锁。第一层课程刻意
限定为单层 `SELECT`，不允许 `OR`、子查询或集合运算，避免把必修条件藏在无效分支里。第二层
排序与连接题也遵循单语句边界，并把真实关系条件纳入概念锁。共享课程数据与固定房间宝箱奖励位于
`src/content/curriculum/mvpLevel.ts`，后续可玩层内容位于 `src/content/curriculum/floor2Level.ts` 至
`src/content/curriculum/floor8Level.ts`；房间氛围与局内奖励位于
`src/content/world/runContent.ts`；可选 Boss 门题目与语义结果约束位于
`src/content/curriculum/gateChallenges.ts`；新手引导文案位于 `src/content/curriculum/onboarding.ts`。每个 SQL
阶段都从空编辑器开始。`src/content/curriculum/lessonTaskBrief.ts` 是面向玩家的 SQL 任务展示边界：
它根据关卡阶段与 `sqlSchema` 统一生成当前局面、精确返回列、权威字段含义、JOIN 关系、查询
条件、世界效果、难度标签和四级提示；`AppShell` 只负责渲染，不得重新猜测 SQL 语义。普通
遭遇第一击只包含当前章节和基础投影/过滤；小型精英只能从第二击起增加至多一个已掌握章节；
楼层 Boss 从单章确认逐步升级到最终二至三章审计。完整 SQL 只能出现在第四级提示。
`src/presentation/dom/appShellTemplate.ts` 独占 AppShell 静态页面骨架，`src/presentation/dom/appShellDom.ts` 统一绑定会被
运行时重复使用的稳定节点；状态渲染和事件处理不得复制整份模板，也不得为同一个持久节点维护
第二套静默选择器。
`src/presentation/dom/panels/` 负责终端、背包、篝火、复盘、剧情、Schema 和在线状态展示。
`RecordPanel` 统一负责剧情、调查、迁移和抄写员记录面板；`TransitionPanel` 负责楼层、区域和
死亡转场及其短时计时器；`TransientFeedbackPanel` 负责拾取与战斗结算卡；`AdminPanel`
负责管理员菜单 DOM、焦点和文案，跨运行时的管理员动作仍由 `AppShell` 协调。
`src/presentation/dom/renderers/` 负责 HUD、小地图和战斗展示。Panel 只能接收快照与显式回调，
不得直接访问存档、外部服务或 Phaser。
`src/presentation/phaser/world/` 负责地形、迷雾、世界对象可见性和拓扑重建判断。
`WorldRuntimeLayer` 组合区域标签、门、捷径、篝火和陷阱；`FloorSetpieceLayer` 是
`world/setpieces/` 各楼层模块的唯一 registry/门面，共同生命周期与通用地标位于
`world/shared/FloorSetpieceModule.ts`。`DungeonScene` 仍是 Phaser 生命周期与事件转发门面。
`src/domain/learning/queryFeatureDetector.ts` 负责 SQL 特征标签，
`queryIdentityRules.ts` 负责身份字段防火墙，`lessonLocks.ts` 负责课程阶段选择和基础 SQL
外形限制，`lessonResultEvaluator.ts` 负责固定课程结果语义；`lessonEvaluator.ts` 负责聚合判题规则。
`src/presentation/dom/sqlAutocomplete.ts` 负责从完整权威 Schema、当前任务语境与
MVP SQL 词汇中确定性生成提示；只有玩家通过键盘或指针明确接受时才能替换当前 Token，不得
生成完整答案、提交查询或绕过课程判定。
`src/content/inventory/inventoryCatalog.ts` 负责背包容量、当前武器/防具/恢复品目录和生态可选候选概率；
`src/domain/inventory/lootDirector.ts` 负责确定性独立判定、阶级最低掉落、同场去重、唯一装备转换与
三件上限。
`src/content/world/biomeContent.ts` 负责当前可玩八层的生态怪物池与可选多阶段练习；
`src/domain/exploration/biome.ts` 从迷宫、篝火、引导地图和 Seed 派生区域归属、静态地貌与区域首领位置。
生态计划在加载时重建，不进入存档。
`src/content/world/floorLabyrinth.ts` 负责稳定的八层导航契约；`src/domain/exploration/floorLabyrinth.ts` 再把这些
意图解析到当前已保存的 `MazeFloor`、篝火、引导方案与生态方案。不得把派生安全格、视野、
陷阱坐标重复写入存档。
`src/content/curriculum/floorContracts.ts` 负责 Campaign 课程元数据及其可序列化 Schema；在已登记的
`AUTH-003` 已由跨真源测试关闭，但它仍不是楼层显示名称、生态或精确怪物名单的玩家文案权威。可执行怪物事实
属于各层 Level 文件与 `biomeContent.ts`，玩家地点和事件属于 Floor Experience，导航边界属于
Floor Labyrinth 与 Floor Map Blueprints。`src/domain/progression/campaign.ts` 负责可序列化的有序楼层槽位，
必须拒绝跳层、重复激活与 Seed 重抽，且不得把一层静默套用到另一层。权威登记表位于
`docs/product/production/CONTENT_AUTHORITY_AND_TRACEABILITY.md`。

八层剧情与怪物分布 V2 契约已有运行时与自动化基线；完整真人 Run、文字/音频主观 QA 和最终美术仍是独立证据。
长期稳定契约为：展示子区必须显式映射到 `front` / `middle` / `rear`；怪物 `1–89`、课程/装备/剧情/证据/
`MIGRATE` ID 与 Run v12/Profile v3 不得改名；击杀前所有可见怪物文字经身份展示函数，管理员揭示不写 Profile；
剧情只用 `blocking` / `ambient` / `inspect`，其中环境卡在 3 次成功移动后消失，恢复的 Run 不重播已看事件；
`counterDamageForEncounter` 是战斗反击唯一真源：F1–2 全为 1，F3–4 普通/精英为 1、Boss 为 2，F5–6 普通为 1、其余为 2，
F7–8 层主为 3、其余为 2，SQL 错误共用该规则且护甲先承伤；剧情工作不改四表 DDL 或稳定存档版本。

## 游戏工程地图

机器可读路由权威是游戏拥有的 `../.maintainer/architecture-map.json`。schema v4 在稳定
layer/area/partition 与八个 `floorScopes` 之上增加跨层 `features`、有限运行契约和稳定边界签名。
feature/floor root 只登记稳定目录，不登记文件或 Glob。普通文件和内部子目录变化无需更新地图；
稳定 root、职责或 route 变化才递增边界 revision 并更新签名。

正常 Inspect 先按功能路由，并把楼层作为可选上下文；依次扩展 feature 的 primary、adjacent、shared、
fallback root，最后才失败开放到 area/仓库。维护器只接受完整的当前 schema v4；其它或非法地图直接
回退普通安全搜索。每个楼层 scope 可包含同编号的内容目录，但楼层子单元不得引用兄弟楼层。共同算法和
服务必须上提到父级服务 partition，由唯一 registry 装配后单向提供给子单元。`neighbors` 不表示运行时
依赖。`GameSession` 继续是唯一可变会话状态提交者；导航指引位于
`domain/session/exploration/navigationGuidance.ts`，背包转换由
`domain/session/inventory/` 功能包编排，战斗抽题、经验、伤害与复盘由
`domain/session/combat/` 功能包编排。这些模块只接收窄 Context，不持有第二份会话状态。

会话专属的只读模型由 `domain/session/sessionSelectors.ts` 提供，功能门面只把显式 Context
适配成公开查询。AppShell 的重置路径独立位于 `features/app-shell/workflows/ResetWorkflow.ts`：
它通过端口编排界面清理、会话重置、SQLite 重置、战斗中止和音频恢复，DOM 所有权仍留在 AppShell。

功能包目录是维护者的第一入口：

| 功能包 | 入口 | 定位问题 |
| --- | --- | --- |
| `features/game-session/` | `GameSession.ts` | 游戏状态、公开动作、快照与规则门面 |
| `features/terminal/` | `TerminalCoordinator.ts` | SQL 提交、SQLite 同步、战斗动画和 busy 清理 |
| `features/narrative/` | `NarrativeCoordinator.ts` | 剧情动作、音频/世界效果和证据确认 |
| `features/snapshot/` | `SnapshotRenderer.ts` | 前后快照差异、模式进入和渲染投影 |
| `features/app-shell/` | `AppShell.ts` | DOM 装配、输入路由和面板生命周期；`rendering/` 负责快照投影，`workflows/` 负责剧情、反馈/转场与重置编排 |
| `features/game-runtime/` | `GameRuntime.ts` | 启动装配、页面隐藏、失败回收和销毁 |

端口方向固定为“底层服务 -> 功能协调器 -> GameRuntime”；架构检查器会拒绝未经声明的
功能包边和循环依赖。
`GameRuntime` 是 Audio、Presence、持久化和维护器桥等外部资源的最终释放者；`AppShell.destroy()`
只解绑自身的 DOM 订阅、面板和用户手势，避免重复释放异步资源。

### 游戏拥有的 Benchmark 合同

`../scripts/benchmark-adapter.mjs` 是 Adapter v2，也是生产 Benchmark 案例唯一的外部来源。
`catalog` 返回 schema/Adapter v2、固定顺序的 7 题 `full` 套件公开信息，以及 SHA-256
`sourceFingerprint`。该指纹覆盖当前 Git 提交和工作树状态，并显式覆盖 Adapter 与架构地图；它只用于
失效旧结果，不是源码或隐藏数据投影。公开 `describe` 只返回公开案例；runner `describe` 才额外返回
隐藏复现和 expected 合同。`materialize` 创建只有一个提交的隔离修复仓库，且不复制 `benchmark/`、
Adapter 或来源任务文件。

每个隐藏的 `../benchmark/agent-evals/*/expected.json` 使用 schema v3，并声明至少一个
`expectedRouteFeatures`。架构检查要求公开题干对每个声明 feature 都取得正的最高匹配分，使案例路由随
游戏拥有的地图一起演进，而不是依赖维护器文件索引。隐藏浏览器 Judge 只返回受限验证字段。

```text
src/contracts/          跨层只读游戏、存档、结果、Agent 与存储契约
src/application/        启动、运行时配置与页面生命周期
src/content/            课程、世界、剧情、背包与 SQL 静态内容；楼层作者数据位于 */floors/floorNN
src/domain/             Session 支撑服务、战斗、探索、学习、成长、背包与共享规则
src/features/           GameSession、终端、剧情、快照、AppShell 与 GameRuntime 功能包
src/infrastructure/     音频、反馈、SQLite、存档编解码/校验、在线状态与浏览器适配器
src/presentation/       Phaser 场景、DOM 应用视图与职责明确的渲染器
src/devtools/           仅开发态外部维护器桥；生产入口不得导入
tests/              规则、迷宫、巡逻、反馈、存储、引导与查询策略的 Vitest 测试
docs/               双语蓝图、活跃路线图、docs/design/ 后续候选设计与历史报告
scripts/            游戏资源、题库和架构脚本
dist/               生成的静态构建；被忽略且不得手工修改
```

仓库治理、可选 Python 服务、可选 Node.js 在线状态服务和跨工程 CI 位于本工程的上一级目录；
在线状态服务不会进入 `game/dist`。

## 标准命令

在 `game/` 内执行以下命令。要求 Node.js `>=20.19`、pnpm `11.9.0`。

```bash
pnpm install --frozen-lockfile
pnpm question-bank:build
pnpm dev
pnpm test
pnpm build
```

`pnpm build` 先运行 TypeScript 检查，再执行 Vite 生产构建。静态产物位于 `dist/`；WASM 资源需要
正常 HTTP 请求，因此应通过 HTTP 托管，不要直接使用 `file://` 打开。

在线状态客户端默认使用相对地址 `api/presence`，所以部署到 `/game/` 后会请求
`/game/api/presence`。Vite 将 `/api/presence` 代理到本地服务；生产 Nginx 必须代理部署路径并关闭
缓冲。服务缺失时只把指示器切换为不可用，不得阻塞游戏启动。

## 运行与安全边界

- Dungeon Maintainer 桥只有在 `import.meta.env.DEV`、本机主机名和 `?playtest=agent` 同时匹配时安装。
  它使用页面内存 DataStore 和临时 Chromium `sessionStorage` 检查点，恢复后立即删除。桥只暴露
  `checkpoint/look/go/use/inputSql/query/judge/events`；`inputSql` 只写当前固定玩家 textarea，
  `query` 不接收 SQL 参数；面向模型的投影不得包含隐藏答案、未揭示提示、完整地图、存档、背包、
  身份或隐藏 Judge 详情。只有固定 Benchmark runner 可以读取上文所述的受限 `judge` 摘要，该摘要不会
  进入 `look`、动作结果或模型上下文。SQL 的唯一例外是当前玩家可见终端保持打开时，其 textarea 的当前值；
  已关闭终端与 `snapshot.adminAnswerSql` 始终在投影之外。生产构建不得暴露
  `window.__DUNGEON_PLAYTEST__`。
- SQL 仍完全通过浏览器内的 `sql.js` 执行。运行时优先使用 SQLite WASM；当宿主禁止 WebAssembly
  代码生成时，回退到随包提供的 asm.js 构建，因此静态托管和受限嵌入式浏览器使用同一条游戏路径。
  篝火复盘只读取当前层本地快照，抄写员使用作者内容
  和受限场景投影。明确配置后，唯一 `POST /v1/agent/run` 接收变化方投影和同层子结果。游戏没有 Agent 存档，未配置服务时完全使用本地文案。
- 左下角在线人数统计活跃浏览器标签页的 SSE 连接数，不代表独立自然人；它不发送玩家标识或游戏
  数据。Node.js 服务只保留内存连接集合，默认监听本机地址；扩展为多副本前必须引入共享状态。
- Agent 请求包含请求 ID、证据 Hash、当前层和场景所需的受限证据。主 Agent 只看到已经校验的子 Agent 展示文本；
  子请求仍遵守篝火最多八条 SQL 投影和抄写员受限场景证据边界。请求不包含参考 SQL、完整
  `GameSnapshot`、身份、移动、地图、背包或游戏指令。响应必须匹配请求 Hash 并通过文本限制，才能替换本地
  文案。统一路由返回 schema v1 调用元数据，包括耗时、模式、状态、Token 和可选 Trace ID。Agent 缓存、
  输出、页面 Token 累计和实时日志都只存在页面内存；Python 服务不持久化请求或输出。
- OpenTelemetry 创建 `agent.request`、`agent.child`、`agent.main` 与 PydanticAI 模型 Span。只有配置
  `OTEL_EXPORTER_OTLP_ENDPOINT` 才向外导出；Span 可以记录请求 ID、楼层、事件、来源、状态、fallback、耗时
  和 Token 数字，但不得记录 prompt、completion、SQL、展示正文、快照、API Key 或身份。
- 战斗终端只接受一条只读 `SELECT` 或 `WITH`；执行前拒绝 DML、DDL、`PRAGMA`、`ATTACH` 和多语句输入；界面
  最多显示 50 行结果。
- 两个 SQL 输入框都提供 IDE 式 `PLAN ASSIST` Listbox。输入前缀会显示排序后的关键词、函数、
  权威表名、完整字段名与真实 JOIN 关系；`monsters.id` 用于怪物目标，`monster_id` 只属于
  信号/装备明细表。`Ctrl/Command + Space` 打开语境提示，方向键移动选择，
  `Enter`/`Tab` 或指针接受，`Escape` 先关闭建议再关闭终端。输入 `m.` 等限定别名时，只显示
  解析到的表字段；接受建议不会提交查询，也不会增加查询次数。
- 永久 Schema 图鉴列出四张表、22 个字段及类型、可空性、主键和逻辑关系；表标签支持点击、
  方向键、`Home` 与 `End`，两个终端也提供默认折叠的完整字段速查，且不会改变当前题目目标。
- 第一层判定进一步限定为一条平坦 `SELECT`，不允许 `OR`、子查询、`UNION`、`INTERSECT` 或
  `EXCEPT`；支持表别名限定列，也支持在 `HAVING` 中使用题目要求的 `total` 别名。
- 第七、八层的查询负载使用 SQLite `EXPLAIN QUERY PLAN`。这是 SQLite 证据，不是 MySQL
  执行计划。MySQL/InnoDB 概念必须明确标记为模拟，或使用另行隔离的真实后端。
- `public/data/question-bank-v1.sqlite` 由 TypeScript 课程阶段生成，不得手工修改。Manifest 固定
  版本、字节数、SHA-256 和 960 题总数；每层包含 L1 64 道、L2 40 道、L3 16 道。第二至八层
  L1 包含 40 道本层题与 24 道只读复习题，L2/L3 均为本层题。每层由 15 个确定性题族组成，每族 8 道
  使用真实数据参数且可执行的变体；生成时记录精确结果行、顺序及第七层计划证据作为逐题判定契约，
  空结果题必须在题面明确说明。固定课程怪与层主继续使用作者题；普通怪、小精英、区域首领分别
  抽取 1 道 L1、2 道 L2、3 道 L3。新 Run 固定题库版本并使用确定性不重复牌组。IndexedDB 最多保留 5000 条完整作答，
  题目/课程聚合永久保留；导出与清除内容绝不包含 API Key。
  生成器按 `monstersForFloor(floor)` 为每层建立独立 SQL fixture，并拒绝超出该层关系闭包的怪物引用。
  Run v12 必须绑定当前题库版本和完整抽题状态；历史题库绑定直接拒绝。
- `src/infrastructure/storage/localProgress.ts` 是 Run/Profile 的 load/save/clear 门面；
  只读写当前 `run:v12` 与 `profile:v3` Key。`runCodec.ts` 负责 Run JSON 编码，
  `profileCodec.ts` 负责 Profile 创建、校验与编码。Run 校验按单向责任链组织：
  `runDataValidators.ts` 校验玩家/战斗/背包值，`runWorldValidator.ts` 校验图、地图和世界结构，
  `runValidator.ts` 组合 SavedRun 跨字段不变量并暴露版本入口。
- 浏览器数据统一保存在 IndexedDB `select-from-dungeon-data`：`run_nodes` 与 `floor_nodes` 分开保存
  Run 全局数据和当前楼层；`profile_nodes` 保存 v3 永久档案；`guide_nodes` 保存引导；`attempts`、
  `question_stats`、`lesson_stats` 保存学习记录；`question_banks` 保存经校验的题库字节。只加载
  有效的 `select-from-dungeon:run:v12` 与 `select-from-dungeon:profile:v3`。当前 localStorage
  值可以导入统一 IndexedDB，也可在 IndexedDB 不可用时作为 fallback。历史 Run/Profile Key 与
  旧 learning/content IndexedDB 不读取也不删除；不支持数据的恢复路径是开始新 Run。
  `progressPersistence` 会合并非关键移动/巡逻快照，但查询、战利品、背包、模式与拓扑变化
  仍立即落盘；改变结构时必须处理版本或恢复。
- 迷宫契约不新增独立存档字段。陷阱坐标、安全格掩码与
  当前视野都从现有楼层数据重建；已触发陷阱复用 `openedGateIds`。视觉上开放的房间边界直接
  通行，不需要保存入场确认状态。
- 核心学习装备与钥匙必须确定性掉落。可选随机物品只保留按来源概率判定并立即使用的恢复品，
  不按怪物阶级补足最低件数；随机性不得阻塞课程。战斗伤害保持确定，
  便于检查 SQL 锁定。
- 普通与小型精英随机怪分别抽取 1 题和 2 题；可以重复挑战，但当前 Run 只有第一次胜利结算 XP
  与可选掉落。
- 新 Run 以两颗心开始。普通怪、精英/区域首领、层主分别获得 1、3、5 XP；累计阈值为
  `0, 2, 4, 6, 8, 14, 22, 32, 44, 58, 74, 92, 112`，基础生命上限为 `2 + floor((level - 1) / 2)`。
- 一次 SQL 提交等于一个战斗回合；思考和输入没有倒计时。正确结果只触发玩家攻击，结果错误或
  语法错误才触发预告的怪物反击。空输入不得消耗回合。
- 站在锁定 Boss 路线旁按 `E` 会打开该层可选的实体 SQL 密文终端。第一层固定考察
  `JOIN + WHERE + COUNT + GROUP BY + HAVING + ORDER BY`，第二层增加 `LEFT JOIN`、
  `COUNT(DISTINCT ...)` 与 `LIMIT`，第三层使用三表装备审计，第四层使用 CTE 和分组最大力量，
  第五至八层继续使用窗口、事务、计划和事故综合题；
  判定同时检查查询特征和精确结果语义。成功只打开当前物理路线并永久改变密文外观，
  不增加课程掌握、练习次数、XP 或战利品；结果错误和语法错误造成 1 点护甲优先伤害，空输入
  与 `Escape` 不产生代价。
- 新 Run 使用唯一一套八张手工宏观蓝图生成 `56×42 / generator v7` `MazeFloor`，课程房覆盖地图宽高至少
  70%，采用 DFS 雕刻与约 15% 回环；超出内容连接骨架范围的远端 DFS 分支会重新封墙，不再形成
  无用途的外围迷宫。其他 generator 版本直接拒绝。玩家界面不再提供 Seed 输入或地图重抽。
  玩家必须实际走过连续世界；发现式小地图不是导航控件。移动进入存活必修怪物所在格，或成功移动触发
  遭遇计量时，会自动进入独立战斗场景；安全期结束后，每个符合条件的成功移动以 2% 基础概率
  判定，连续 30 个符合条件的安静步数后保底遭遇。出生和篝火安全区不累计遭遇风险、不生成
  怪物，巡逻怪也不能进入。地图普通怪缓慢巡逻，魔王固定不动。
- 八层都会在运行时解析各自独立的迷宫契约。视觉上开放的安全房边界可直接通行，不得存在不可见
  的入场确认墙；安全房和篝火圈会显示完整安全范围，危险迷宫只显示本层局部视野半径。确定性实体陷阱只有
  在“已探索且处于当前视野”时显示，触发后不进入战斗，而是造成配置的一次性护甲优先伤害并
  失效。第二至八层的抽象区域归属不再阻挡相邻普通步行；绑定的中段区域首领只封锁可见区域交通
  与跨区捷径，课程前置门继续防止越课。第一层仍是无通用区域门的连续地图例外。
- `GuidedMap` 只能从课程图、已保存 `MazeFloor` 和两个篝火确定性派生，不重复写入存档。主路线
  每 14 格左右放置信标且最大空档不超过 18 格；走廊剩余死路必须放置一次性补给。当前每层固定
  三条双向捷径与三把保证钥匙；钥匙不占背包。开门前必须持有钥匙并满足对应课程前置；
  开门、休息和死亡均不得重抽或重新锁门。
- 拾取第一至七层钥匙后进入 `transition` 状态；AppShell 显示金色
  `FLOOR NN CLEARED / CONGRATULATIONS!!` 通关反馈，并在约 1.5 秒后自动调用
  `GameSession.advanceFloor()`，无需移动或按 `E`。等级、XP、装备、背包、恢复品、关键物品、
  遗物与查询数跨层保留，每层迷宫和课程状态重新生成。
- 每次胜利都会显示明确的 XP 结算；课程胜利解锁对应房间的确定宝箱，不再凭空制造必掉怪物包。
  伏击只结算可选的种子化即时恢复品，且大多数为空。物品文案展示名称与准确效果；
  结算卡和获取说明卡在之后完成 3 次成功移动后消失。丢在地面的物品仍可走上去拾取；祭坛、
  秘藏宝箱与篝火同样使用 `E`。课程关键装备仍然确定可得且可达。
- 背包包含 12 个装备格、一个武器位、一个防具位与三种恢复品堆叠，每种最多 5 个；已装备物品
  不占格。只有探索和篝火可打开背包，打开后暂停移动和巡逻，战斗中不可换装。护甲先于基础生命
  承伤，篝火休息与复活恢复当前防具护甲。装备背包满时必须显式选择替换目标，被替换物留在当前
  战利品包。普通装备/恢复品可丢在脚下并在换层前重新拾取；基础/课程保护物品和钥匙不能丢弃。
- 实体篝火占据中心格，玩家站在相邻格按 `E` 打开双选菜单。`在此休息` 恢复满生命并更新复活点，
  `答案复盘` 展示当前楼层。死亡是短暂状态切换而不是重置 Run：约 1.2 秒后，玩家在最近休息
  的篝火或出生点满血复活；课程、XP、装备、门、已击败怪物和存活敌人的当前生命都保持，随后
  自动打开导致死亡的本场复盘。
- 八层入层、Boss 结算、离层、世界变化、抄写员、地标和隐藏证据都经三种剧情呈现。
  `blocking` 暂停移动/巡逻且不允许 `Escape` 代替确认；`inspect` 可用 `E`、`Escape` 或关闭按钮结束。
  姓名、XP 和掉落结算必须在队列剧情与世界变化前完成。
- Web Audio 音乐和事件提示均由项目代码生成。八层使用标明出处的公版古典主题进行程序化电子
  合成，每层拥有区域变奏和探索 / 战斗 / Boss 乐章；短而柔和的声部与乐句重叠替代持续嗡鸣，
  区域切换在下一乐句重定向，换层和模式使用短淡化。项目不打包录音、MIDI、采样库或其他游戏
  原声。移动、撞墙、遭遇、
  查询施法、命中、受伤、阶段
  完成、掉落、拾取、开门、胜利与失败都有区分反馈；减少动态效果偏好可以抑制动作效果，但不
  改变游戏状态。
- 渲染目标为 30 FPS。页面隐藏时先刷新存档，再暂停 Phaser 循环与音频调度；页面恢复后安全
  唤醒。未变化的重型 HUD 列表会复用，不在每个快照上重复创建 DOM。
- 生产构建将 Phaser、`sql.js` 与 SQLite 运行时保持为独立可缓存资源；`sqlite-runtime` 不得重新
  合入应用入口，WASM 继续作为外部文件获取，不允许内联。只有当宿主拒绝初始化 WASM 时，才使用
  随包提供的 asm.js 回退。
- 仓库根 `.github/workflows/deploy-pages.yml` 只在 `PAGES_ENABLED=true` 时验证两个工程并部署 `game/dist`。
  如果私有仓库套餐拒绝 Pages，保持仓库私有和变量 false/未设置，记录 `provider-blocked`；无新授权不购买、公开或换托管商。
  当前拆包保持为 1.0 基线，包体/运行时优化属于 1.0 之后的独立优化项。
- 像素角色、地砖、房间装饰、音乐与音效均由项目代码生成。增加第三方图片、字体、音频或复制
  关卡文字前，必须完成许可审查并更新归属。
- 浏览器运行依赖固定在 `package.json` 与 `pnpm-lock.yaml`。依赖变化仍需审批，并按风险检查许可证、
  包体、构建与浏览器行为。
- 不得在代码、Fixture、日志、截图、清单或报告中暴露凭证、个人数据、私有地址或敏感本地内容。

仓库原创代码和文字采用上一级目录的 MIT `LICENSE`。保留的模板材料继续保留原版权声明，第三方
运行时声明和参考来源继续记录在上一级目录的 `ATTRIBUTIONS.md`。
