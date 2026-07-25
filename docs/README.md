# 文档索引

文档按“当前事实、MVP 2.0 真源、历史设计与报告”分层。当前运行事实以 `AGENTS.md`、
README、代码和测试共同为准；历史正文中的旧尺寸、旧音乐或原型状态不再覆盖 MVP 2.0。

## 当前事实与发布

| 文档 | 状态 | 用途 |
|---|---|---|
| [游玩指南](../GUIDE.md) | `MVP 2.0 CURRENT` | 运行、操作、八层课程、成长、篝火、叙事与发布边界 |
| [English README](../README.md) / [中文](../README.zh-CN.md) | `2.0.0 RC` | 当前用户可见功能、架构与存档 |
| [产品契约](../PRODUCT.md) | `2.0.0 RC` | 用户、定位、设计原则、运行规则与性能边界 |
| [版本记录](../CHANGELOG.md) | `2.0.0 RC` | 各版本用户可见结果与 PR 归档 |
| [MVP 2.0 发布检查表](./RELEASE_CHECKLIST.md) | `PR_OPEN / VALIDATED` | 自动化、浏览器、兼容、版权与最终 PR 证据 |
| [八层课程蓝图](./CURRICULUM.zh-CN.md) / [English](./CURRICULUM.md) | `CURRENT` | 当前 47 组课程顺序、题型与掌握标准 |
| [MVP 2.0 设计与实施基线](./design/MVP_2_0_MASTER_PLAN.md) | `IMPLEMENTED / RELEASE_CANDIDATE` | 八层主线、48×36 地图、角色、叙事、音乐与交付边界 |
| [音乐与地图上升设计圣经](./design/MUSIC_MAP_ASCENT_BIBLE.md) | `HISTORICAL DIRECTION / CURRENT SCORE UPDATED` | 八层地理上升与抗疲劳方向；运行时已改为公版古典主题的程序化电子合成 |
| [叙事圣经](./design/NARRATIVE_BIBLE.md) | `CORE_IMPLEMENTED` | 世界真相、抄写员、《失名录》与唯一 `MIGRATE` 结局；正文的 `v1.1 CURRENT / 尚未实现` 标记是实现前快照 |
| [篝火、复活点与安全区](./design/CAMPFIRE_CHECKPOINT_DESIGN.md) | `HISTORICAL / CURRENT OVERRIDE BELOW` | 原三篝火设计；当前为中后两处实体篝火 + 出生安全锚点 |

当前关键事实：

- 新 Run：`48×36 / generator v5`；八层各有手工宏观轮廓、三个区域与实体交通；
- 兼容 Run：`64×48 / generator v4` 只用于读取旧存档，不代表当前新图；
- 课程：保留现有八层 47 组顺序，不在 MVP 2.0 暗中重排；
- 音乐：八层采用标明出处的公版古典主题 + Web Audio 程序化电子合成，不打包外部录音；
- 叙事：每层五拍、两条固定证据、抄写员、本地《失名录》和唯一 `MIGRATE` 结局已进入运行时；
- 身份：必修怪物击败前只显示 ID，最后一击回收名字，永久怪物图鉴跨 Run 保存；
- 角色：玩家四阶段显形、抄写员和怪物模型由地图 / 战斗同源程序化配方绘制；
- 篝火：每层中段与后段各一处实体篝火，出生区作为前段安全与兜底复活锚点；
- 存档：使用 `run:v11`、`profile:v3`、`onboarding:v1`；旧 v10/v2 记录在内存迁移。

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

- 功能已由 261 项自动化测试、生产构建、八层管理员视图、终局、320 px、触屏、
  Reduced Motion 和 iframe 浏览器矩阵覆盖；
- 真实耳机 / 扬声器上的主观连续性、疲劳与音量检查；
- 真人从新 Run 到 `MIGRATE` 的完整游玩记录；
- 统一 PR 创建与 PR CI 归档。
