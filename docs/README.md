# 文档索引

文档按“当前事实、演进路线、候选设计、历史报告”分层。代码和存档事实以
`AGENTS.md`、README 与测试为准；候选设计不能直接当成已经实现的功能。

## 当前课程与地图蓝图

| 文档 | 状态 | 用途 |
|---|---|---|
| [版本记录](../CHANGELOG.md) | `v1.1.0` | 各版本用户可见结果与 PR 归档 |
| [v1.1 发布检查表](./RELEASE_CHECKLIST.md) | 当前发布证据 | 发布范围、自动化、浏览器、兼容与剩余人工边界 |
| [八层课程蓝图](./CURRICULUM.zh-CN.md) / [English](./CURRICULUM.md) | 规划蓝图；当前实现全部八层 | 课程顺序、题型、掌握标准 |
| [楼层地图与美术蓝图](./FLOOR_THEMES.zh-CN.md) / [English](./FLOOR_THEMES.md) | 规划蓝图；当前实现全部八层 | 八层主题、地标与视觉边界 |
| [玩法演进总路线图](./GAMEPLAY_EVOLUTION_ROADMAP.md) | `v1.1.0` 已实现 | 版本顺序、MVP、非目标和验收标准 |
| [篝火、复活点与安全区](./design/CAMPFIRE_CHECKPOINT_DESIGN.md) | `v0.3.0` 篝火已实现，`v0.5.0` 引导地图与捷径已实现 | 三篝火、安全区、休息、死亡回归、复盘与捷径 |

## 设计与后续候选

这些文档位于 [`design/`](./design/)；八层核心契约已经进入 `v1.0` 运行时，仍标为候选的细分
规则必须按新版本确认：

- [怪物阶级与八层生物演化](./design/MONSTER_PROGRESSION_DESIGN.md)
- [地图生态、探索密度与防具](./design/MAP_BIOME_AND_ARMOR_DESIGN.md)
- [生态怪物与掉落](./design/BIOME_MONSTERS_AND_LOOT_DESIGN.md)
- [装备背包、换装与独立多掉落](./design/INVENTORY_AND_MULTI_DROP_DESIGN.md)（`v0.4.0` 已实现）

当前边界：12 格背包、防具/护甲生命、路线信标、死路补给、保证钥匙捷径、两组生态区域门、
八层内容契约、Campaign 存档、生态课程、47 个必修课程组、最终魔王与非持久化管理员全图均
已实现。随机池仅保留低概率自动恢复品；课程关键奖励、必需武器和钥匙保持 `100%` 确定获得。

## 历史报告

- [连续迷宫升级报告](./MAZE_UPGRADE_REPORT.md)：记录 64×48 迷宫改造时的背景与验证证据，
  不作为后续版本的唯一需求来源。
