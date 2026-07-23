# 文档索引

文档按“当前事实、演进路线、候选设计、历史报告”分层。代码和存档事实以
`AGENTS.md`、README 与测试为准；候选设计不能直接当成已经实现的功能。

## 当前课程与地图蓝图

| 文档 | 状态 | 用途 |
|---|---|---|
| [八层课程蓝图](./CURRICULUM.zh-CN.md) / [English](./CURRICULUM.md) | 规划蓝图；当前只实现前两层 | 课程顺序、题型、掌握标准 |
| [楼层地图与美术蓝图](./FLOOR_THEMES.zh-CN.md) / [English](./FLOOR_THEMES.md) | 规划蓝图；当前只实现前两层 | 八层主题、地标与视觉边界 |
| [玩法演进总路线图](./GAMEPLAY_EVOLUTION_ROADMAP.md) | 活跃路线图；`v0.2.0`、`v0.3.0` 已实现 | 版本顺序、MVP、非目标和验收标准 |
| [篝火、复活点与安全区](./design/CAMPFIRE_CHECKPOINT_DESIGN.md) | `v0.3.0` 已实现；仍保留未完成的专项视觉验收记录 | 三篝火、安全区、休息、死亡回归与复盘 |

## 后续候选设计

这些文档位于 [`design/`](./design/)，必须在对应版本开始前再次确认：

- [怪物阶级与八层生物演化](./design/MONSTER_PROGRESSION_DESIGN.md)
- [地图生态、探索密度与防具](./design/MAP_BIOME_AND_ARMOR_DESIGN.md)
- [生态怪物与掉落](./design/BIOME_MONSTERS_AND_LOOT_DESIGN.md)
- [装备背包、换装与独立多掉落](./design/INVENTORY_AND_MULTI_DROP_DESIGN.md)

当前边界：12 格背包、防具/护甲生命、通用随机装备掉落系统以及第三至八层均未实现。
候选文档中的非关键装备概率已经减半，但课程关键宝箱、必需武器和钥匙仍保持 `100%` 确定获得。

## 历史报告

- [连续迷宫升级报告](./MAZE_UPGRADE_REPORT.md)：记录 64×48 迷宫改造时的背景与验证证据，
  不作为后续版本的唯一需求来源。
