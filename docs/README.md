# 文档索引

文档按“前两层垂直切片、八层剧情运行时、历史设计与报告”分层。当前运行事实以 `AGENTS.md`、
README、代码和测试共同为准；`docs/product/` 是内容与制作契约的第一真源。第一、二层仍是资产
与音频精修标杆，第三至八层已经接入正式剧情顺序、地点状态、隐藏换装和实体 SQL 密文机关。

## 两层垂直切片产品真源

本轮目标不是在旧八层原型上继续换色，而是先把第一、二层做到正式垂直切片质量：细腻剧情、
地点化地图、真实世界状态、正式像素素材、连续音频和可验证教学。

| 文档 | 状态 | 用途 |
|---|---|---|
| [产品文档总索引](./product/README.md) | `IMPLEMENTED RC` | 大厂规格文档集入口、真源、角色和变更控制 |
| [两层产品规格](./product/PRODUCT_SPEC_TWO_FLOOR_VERTICAL_SLICE.md) | `IMPLEMENTED RC` | 产品愿景、核心循环、系统边界、八层宏观框架与总验收 |
| [第一层关卡圣经](./product/floors/FLOOR_01_EMBER_ARCHIVE.md) | `VERTICAL SLICE CURRENT` | 地下余烬档案的地图、故事、SQL、怪物、Boss 与状态 |
| [第二层关卡圣经](./product/floors/FLOOR_02_TIDAL_ARCHIPELAGO.md) | `VERTICAL SLICE CURRENT` | 潮汐群岛的航线、故事、JOIN、生态、Boss 与状态 |
| [旧设计迁移矩阵](./product/LEGACY_DESIGN_MIGRATION_MATRIX.md) | `CURRENT DECISIONS` | 旧稿逐项保留、改造、替代、后置或废弃 |
| [素材来源与生产清单](./product/ASSET_SOURCE_AND_PRODUCTION_MANIFEST.md) | `SOURCE VERIFIED` | 每个来源独立目录、许可证、哈希、派生与运行时预算 |

系统、叙事、视听、技术、QA 专项文档全部由[产品文档总索引](./product/README.md)导航。文档中
`CURRENT` 表示第一、二层达到垂直切片精修标准；`IMPLEMENTED_F3_F4` 与
`IMPLEMENTED_F5_F8` 表示第三至八层已进入可验证运行时，但最终像素资产、连续配乐和逐句对白
仍可在不改变系统契约的前提下继续打磨。

## 当前运行基线

| 文档 | 状态 | 用途 |
|---|---|---|
| [游玩指南](../GUIDE.md) | `MVP 2.0 CURRENT` | 运行、操作、八层课程、成长、篝火、叙事与发布边界 |
| [English README](../README.md) / [中文](../README.zh-CN.md) | `2.0.0 RC` | 当前用户可见功能、架构与存档 |
| [产品契约](../PRODUCT.md) | `2.0.0 RC` | 用户、定位、设计原则、运行规则与性能边界 |
| [版本记录](../CHANGELOG.md) | `2.0.0 RC` | 各版本用户可见结果与 PR 归档 |
| [MVP 2.1 发布检查表](./RELEASE_CHECKLIST.md) | `LOCAL_VALIDATED / PR_PENDING` | 自动化、浏览器、兼容、版权与最终 PR 证据 |
| [八层课程蓝图](./CURRICULUM.zh-CN.md) / [English](./CURRICULUM.md) | `CURRENT` | 当前 47 组课程顺序、题型与掌握标准 |
| [MVP 2.0 设计与实施基线](./design/MVP_2_0_MASTER_PLAN.md) | `LEGACY CURRENT CLAIM / SUPERSEDED FOR TARGET` | 八层旧运行基线；第一、二层目标已由 `docs/product/` 替代 |
| [音乐与地图上升设计圣经](./design/MUSIC_MAP_ASCENT_BIBLE.md) | `HISTORICAL DIRECTION / CURRENT SCORE UPDATED` | 八层地理上升与抗疲劳方向；F1/F2 已改为项目基于公版主题生成并导出的连续曲目 |
| [叙事圣经](./design/NARRATIVE_BIBLE.md) | `CORE_IMPLEMENTED` | 世界真相、抄写员、《失名录》与唯一 `MIGRATE` 结局；正文的 `v1.1 CURRENT / 尚未实现` 标记是实现前快照 |
| [篝火、复活点与安全区](./design/CAMPFIRE_CHECKPOINT_DESIGN.md) | `HISTORICAL / CURRENT OVERRIDE BELOW` | 原三篝火设计；当前为中后两处实体篝火 + 出生安全锚点 |

当前代码关键事实：

- 新 Run：`48×36 / generator v5`；八层均有独立地点化布景、可见环境状态、现场剧情节点、
  隐藏换装、实体 SQL 密文门和管理员状态预设；第一、二层额外拥有审计过的 CC0 地形资源；
- 兼容 Run：`64×48 / generator v4` 只用于读取旧存档，不代表当前新图；
- 课程：保留现有八层 47 组顺序，不在 MVP 2.0 暗中重排；
- 音乐：第一、二层使用项目自行生成并导出的连续 OGG/MP3 曲目，主题取自公版作品，探索 / 战斗 /
  Boss 以短交叉淡化切换；第三至八层暂用 Web Audio 兼容配方，事件 SFX 仍为轻量实时生成；
- 叙事：八层按照“异常—复数—关系—依赖—顺序—责任—判断—迁移”精排；课程、真实 SQLite
  证据、抄写员、《失名录》、地图状态与物理密文门共同推进；
- 身份：必修怪物击败前只显示 ID，最后一击回收名字，永久怪物图鉴跨 Run 保存；
- 角色：玩家、怪物和唯一抄写员保持低开销像素 Actor；前两层地形与关键机关使用审计过的 CC0
  Tile / Prop，第三至八层使用项目自制轻量动态布景；
- 篝火：每层中段与后段各一处实体篝火，出生区作为前段安全与兜底复活锚点；
- 存档：使用 `run:v11`、`profile:v3`、`onboarding:v1`；旧 v10/v2 记录在内存迁移。

## 后续体验质量迭代

以下文档记录用户实测 MVP 2.0 后提出的体验改造方向，不是当前运行事实，也不授权直接修改代码、
课程、存档、依赖或第三方素材：

| 文档 | 状态 | 用途 |
|---|---|---|
| [八层差异化体验迭代](./design/EIGHT_FLOOR_EXPERIENCE_VARIETY_PLAN.md) | `APPROVED_FOR_DESIGN / NOT_IMPLEMENTED` | 定义八层独有动词、SQL 世界行为、非战斗玩法、回访、Boss、抄写员人物弧与疲劳预算 |

该迭代保留当前八层 47 组课程、`48×36 / generator-v5`、Phaser、离线 SQLite、确定 Seed 和
唯一 `MIGRATE` 结局。运行时实施必须从第一、二层垂直切片建立新的批准范围和验收证据。

## 历史设计与兼容参考

以下文档保留当时的需求、取舍和演进证据。正文出现 `v1.1.0`、两层样板、`64×48`、旧音乐、
多掉落或“尚未实现”时，应按历史时点理解：

- [玩法演进总路线图](./GAMEPLAY_EVOLUTION_ROADMAP.md)：`v0.2.0–v1.1.0` 的实现档案；
- [楼层地图与美术蓝图](./FLOOR_THEMES.zh-CN.md) /
  [English](./FLOOR_THEMES.md)：`v1.x` 主题 / 64×48 迷宫基线，已被 MVP 2.0 地图蓝图替代；
- [叙事与区域探索改造计划书](./design/NARRATIVE_EXPLORATION_REDESIGN_PLAN.md)：
  第一层原型研究，交付与 PR 划分已由 MVP 2.0 主计划替代；
- [抄写员、第一层区域与音乐素材 Brief](./design/SCRIBE_REGION_ASSET_BRIEF.md)：
  概念素材和已淘汰试听；运行时只采用其视觉 / 情绪方向；
- [怪物阶级与八层生物演化](./design/MONSTER_PROGRESSION_DESIGN.md)；
- [地图生态、探索密度与防具](./design/MAP_BIOME_AND_ARMOR_DESIGN.md)；
- [生态怪物与掉落](./design/BIOME_MONSTERS_AND_LOOT_DESIGN.md)；
- [装备背包、换装与独立多掉落](./design/INVENTORY_AND_MULTI_DROP_DESIGN.md)。

这些历史设计中的随机装备、多件保底掉落、隐藏地区和课程重排均不是 MVP 2.0 当前行为。
当前随机池只保留低概率即时恢复；课程奖励、钥匙与主线证据仍为确定性内容。

## 历史验收报告

- [连续迷宫升级报告](./MAZE_UPGRADE_REPORT.md)：记录 generator v4 的 `64×48` 连续迷宫改造与
  当时验证证据；它是历史报告，不是 generator v5 新图说明。

## 作者回归与发布归档

- 功能已由 330 项自动化测试、生产构建、素材哈希校验、第一/二层管理员状态预设、桌面视觉、
  精确 320 px 回流、声音开关和浏览器 0 警告 / 0 错误覆盖；
- 本轮尚未重复执行触屏、Reduced Motion、受限 iframe 与跨浏览器完整矩阵；这些路径保留旧基线
  与单元测试证据，但不能冒充本轮人工浏览器证据；
- 真实耳机 / 扬声器上的主观连续性、疲劳与音量检查；
- 真人从新 Run 到 `MIGRATE` 的完整游玩记录；
- 统一 PR 创建与 PR CI 归档。
