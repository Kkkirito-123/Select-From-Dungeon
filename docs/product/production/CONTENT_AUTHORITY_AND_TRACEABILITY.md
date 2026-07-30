# 八层内容权威与追踪矩阵

> 文档版本：`0.4`
>
> 日期：`2026-07-31`
>
> 状态：`CURRENT AUTHORITY REGISTER / AUTOMATED BASELINE`
>
> 适用范围：MVP 2.0 第一至第八层剧情、怪物、区域、课程与掉落设计

## 1. 目的

本文件解决“同一个概念在运行时代码、产品稿和历史设计里有不同说法”的问题。它不新增玩法，
也不把目标稿冒充成已实现功能；它只回答三个制作问题：

1. 发生冲突时应读取哪个真源；
2. 新剧情与怪物设计可以改什么、不能改什么；
3. 从设计条目到内容文件、运行时和验收证据如何追踪。

## 2. 使用者与职责

| 使用者 | 责任 |
|---|---|
| Creative / 产品 | 冻结主题、结局、体验支柱与非目标 |
| 叙事策划 | 在稳定触发器与身份协议内编写事件，不自行改课程或怪物 ID |
| 关卡策划 | 把展示子区映射到三个物理导航区，不把文案区域数写进生成器 |
| 战斗 / 数值策划 | 只从当前运行时读取经验、掉落、遭遇率和阶级规则 |
| 客户端 / 数据 | 保持稳定 ID、存档与事件幂等；拒绝从历史稿反向生成运行数据 |
| QA / 制作 | 逐条核对“设计目标、实现状态、证据状态”，不得用文档篇幅替代验证 |

## 3. 真源优先级

### 3.1 运行事实

| 内容 | 第一真源 | 第二真源 | 说明 |
|---|---|---|---|
| 怪物 ID、姓名、课程、房间、HP | `src/content/mvpLevel.ts`、`floor2Level.ts` 至 `floor8Level.ts`、`biomeContent.ts` | 对应自动化测试 | 新稿必须映射，不得重编号 |
| SQL 题目、答案与判定 | 各层 Level 内容 + `src/domain/lessonEvaluator.ts` | 真实 SQLite 测试 | 叙事可换说法，不能偷偷改变结果语义 |
| 楼层标题、展示子区、地标、隐藏区、故事触发 | `src/content/floorExperience/floor01.ts` 至 `floor08.ts` | Floor Experience 测试 | 这是玩家看见的地点与事件真源 |
| 三个物理导航区、宏观轮廓 | `src/content/floorMapBlueprints.ts` | 迷宫生成 / 可达性测试 | 展示子区可多于三个，必须显式映射 |
| 入口、出口、Boss 门、捷径、隐藏门、安全房、视野、陷阱 | `src/content/floorLabyrinth.ts` | `src/domain/floorLabyrinth.ts` 与测试 | 保存稳定意图，不保存 Seed 坐标 |
| 课程顺序与跨层先修 | 当前课程 Level 内容 + `src/domain/runGraph.ts` | Campaign / RunGraph 测试 | `floorContracts.ts` 仅作运行元数据，不是命名文案权威 |
| 叙事永久事实与唯一结局 | `docs/product/narrative/NARRATIVE_BIBLE.md` | `narrativeContent.ts`、`floorStory.ts`、Floor Experience | 结局固定为 `MIGRATE` |
| 遭遇率、小型精英权重 | `src/domain/encounterDirector.ts`、`src/content/biomeContent.ts` | 遭遇测试 | 当前为 2% / 30 步保底；权重 5% 至 19% |
| 经验、随机掉落、背包 | `AGENTS.md` 对应运行规则 + 领域代码 | progression / loot / inventory 测试 | 当前区域首领 3 XP；随机池仅即时恢复品 |
| 存档版本与兼容 | storage / types / GameSession 代码 | migration tests | 设计稿不得自行增加永久字段 |

### 3.2 设计目标

本轮新增的两份目标稿分别拥有“下一版要做成什么”：

- [`EIGHT_FLOOR_NARRATIVE_DESIGN_V2.md`](../narrative/EIGHT_FLOOR_NARRATIVE_DESIGN_V2.md)：
  八层因果、事件节拍、人物弧、线索铺垫与回收；
- [`EIGHT_FLOOR_MONSTER_DISTRIBUTION_V2.md`](../systems/EIGHT_FLOOR_MONSTER_DISTRIBUTION_V2.md)：
  八层怪物生态、区域职责、遭遇节奏、身份揭示和掉落边界。

其中的区域映射、怪物身份/数值、三种剧情呈现、主线区域首领和七步 `MIGRATE` 已有运行时与
自动化基线。这不代表整份目标稿已通过文字、音频、视觉或真人八层 Run QA；状态仍必须按条目和证据类型独立推进。

### 3.3 历史参考

`docs/design/` 中的旧怪物、掉落、三篝火、64×48 迷宫和随机装备文档只解释决策来路。除非本表
明确保留，否则不得作为实现输入。历史百分比、保底装备和旧楼层名称不能覆盖当前运行事实。

## 4. 已知漂移登记

漂移状态与第 6 节的设计实现状态分开管理：`OPEN` 表示冲突仍会影响实现，`MITIGATED` 表示玩家或
执行者已被保护但根因尚未关闭，`CLOSED` 表示触发文档或代码已经修正且不再存在歧义。

| 编号 | 状态 | 漂移 | 当前决策 | 后续关闭条件 |
|---|---|---|---|---|
| `AUTH-001` | `CLOSED` | F2 Experience 有海岸、湖区、林沼、灯塔 4 个展示区，生成器只有 3 个物理区 | `FloorRegionDefinition.navigationRegion` 已把海岸/湖区映射到 `front`、林沼映射到 `middle`、灯塔映射到 `rear`，`regionCount` 保持 3 | 已由 Floor Experience 映射测试覆盖 |
| `AUTH-002` | `CLOSED` | F5–F8 Blueprint 区名与 Experience 区名不完全一致 | Experience 继续拥有玩家文案，Blueprint 继续拥有几何槽位；所有展示区均通过 `navigationRegion` 显式落到三物理区 | 已由八层映射完整性测试覆盖 |
| `AUTH-003` | `CLOSED` | `floorContracts.ts` 的部分楼层名、主题与 F7 怪物池仍是旧方向 | 合同已对齐真实课程 ID、Experience 标题、Labyrinth 拓扑和当前怪物集合；测试阻止它再次覆盖运行真源 | 已由跨真源合同测试覆盖 |
| `AUTH-004` | `CLOSED` | 旧怪物规格写区域 Boss 5 XP、F1 ID #009 为旧怪物 | 当前运行时为区域 Boss 3 XP，ID #009 是宝箱怪；旧规格已标记为历史参考并指向本登记表 | 已完成：旧规格的运行时声明已撤销 |
| `AUTH-005` | `CLOSED` | 历史生态稿含 20% F8 精英与随机装备/保底掉落 | 当前小型精英 19%；随机掉落仅 2%/5%/10% 即时恢复，层主 0% | 历史生态/阶级稿已有当前规则覆盖标记；Loot 测试锁定无保底、无随机装备 |
| `AUTH-006` | `MITIGATED` | F1–F2 脚本远比 F5–F8 细，后期仅有短事件卡 | 八层现场事件已统一呈现合同，F5/F7 关键供述已进主线 | 各层逐事件脚本字段密度与文字仍需专项 QA，不以自动化冒充关闭 |
| `AUTH-007` | `CLOSED` | 多个区域首领的 SQLite `room_id/sector` 与实际物理生态区不同 | 保持四表 DDL 不变，仅修正 rooms 初始化记录与怪物 `roomId/biome`，使地图生态和 SQLite 查询证据一致 | 已由怪物—房间—生态对照测试覆盖 |
| `AUTH-008` | `CLOSED` | 怪物 `hp/damage` 展示值与实际战斗轮数/扣血不一致 | Stage 数与 `counterDamageForEncounter` 分别成为轮数/反击真源，结果错误与语法错误共用伤害规则 | `combatBalance` 与 GameSession 测试覆盖 89 只怪、四角色矩阵、Stage 与护甲先承伤 |
| `AUTH-009` | `CLOSED` | 完成矩阵写“每层隐藏护甲”，实际只有 F4–F8 隐藏区配置 `rewardArmorId` | F1–F3 保持证据 / 探索奖励；F4–F8 只提供各层确定性换装 | 正反向奖励合同测试同时锁定 F1–F3 无隐藏护甲和 F4–F8 的稳定护甲 ID |

> 证据边界：上表的 `CLOSED` 只表示当前代码与能失败的自动化已对齐。真人从新 Run 到 `MIGRATE`、文字/音频主观 QA 和 Pages 上线均未由此表宣告完成；私有仓库无法启用 Pages 时记为 `provider-blocked`。

## 5. 八层稳定追踪键

| 层 | Experience 标题 | 入口房 | Boss 门 / 出口房 | 捷径 | 隐藏门 | 主要区域首领 | 层主 |
|---:|---|---|---|---|---|---:|---:|
| 1 | 地下余烬档案 | `floor-1-entry` | `gate:floor-1-boss` / `floor-1-boss` | `shortcut:1:return` | `gate:floor-1-treasure` | 无；ID #009 为可选宝箱怪 | #005 |
| 2 | 月潮群岛 | `floor-2-entry` | `gate:floor-2-boss` / `floor-2-boss` | `shortcut:2:return` | `gate:floor-2-treasure` | #022 中区硬门；#021 前区可选 | #014 |
| 3 | 白霜墓原 | `floor-3-entry` | `gate:floor-3-lesson-6` / `floor-3-lesson-6` | `shortcut:3:return` | `gate:floor-3-treasure` | #033 | #028 |
| 4 | 三相升炉 | `floor-4-entry` | `gate:floor-4-lesson-6` / `floor-4-lesson-6` | `shortcut:4:return` | `gate:floor-4-treasure` | #044 | #039 |
| 5 | 黑铁轮值城 | `floor-5-entry` | `gate:floor-5-lesson-6` / `floor-5-lesson-6` | `shortcut:5:return` | `gate:floor-5-treasure` | #055 | #050 |
| 6 | 龙脊回滚工坊 | `floor-6-entry` | `gate:floor-6-lesson-6` / `floor-6-lesson-6` | `shortcut:6:return` | `gate:floor-6-treasure` | #066 | #061 |
| 7 | 残照索引王苑 | `floor-7-entry` | `gate:floor-7-lesson-6` / `floor-7-lesson-6` | `shortcut:7:return` | `gate:floor-7-treasure` | #077 | #072 |
| 8 | 黑金迁移高堂 | `floor-8-entry` | `gate:floor-8-lesson-7` / `floor-8-lesson-7` | `shortcut:8:return` | `gate:floor-8-treasure` | #089 | #084 |

## 6. 状态与证据模型

每条设计项必须带以下状态之一：

| 状态 | 判定 |
|---|---|
| `DESIGN LOCK` | 意图、稳定 ID、前置、输出和验收已经确认 |
| `IMPLEMENTATION PENDING` | 未进入代码，或仅有相似占位 |
| `IMPLEMENTED` | 正常路线可触发，重入幂等，存档恢复正确 |
| `AUTOMATED` | 有能失败的自动化证据 |
| `HUMAN-QA` | 已在目标设备实际确认节奏、画面、听感或可理解性 |
| `DEFERRED` | 明确后置且不阻塞本里程碑 |

状态必须逐项推进，禁止把整份设计稿一次性标成 `IMPLEMENTED`。

## 7. 变更流程

1. 在目标稿中修改玩家体验、触发器、稳定 ID 与验收；
2. 检查本登记表是否存在冲突，必要时先新增 `AUTH-*`；
3. 由内容负责人定位实际代码所有者，不直接从 Markdown 生成运行数据；
4. 先做一个楼层纵向切片，再按 `F1–2 / F3–4 / F5–6 / F7–8` 批次实现；
5. 自动化验证可达性、身份、课程、存档和幂等；
6. 人工验证信息清晰、节奏、情绪和疲劳；
7. 只有证据齐全时更新状态和版本记录。

## 8. 总体验验收

- 玩家不看外部文档，也能说出每层发生了什么、为何必须继续上行；
- 八层的主问题按“存在 → 来源 → 关系 → 依赖 → 顺序 → 责任 → 访问 → 迁移”连续递进；
- 任何剧情文本都不会在击杀前泄露怪物姓名；
- Seed 不改变主线、必修课程、关键证据、区域首领、层主或结局；
- 展示子区、物理区、房间和生态区之间有显式映射；
- 所有随机物、经验与掉落描述和当前运行时一致；
- 文档、实现、自动化和人工 QA 的状态不会互相冒充。
