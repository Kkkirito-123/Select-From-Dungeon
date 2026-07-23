# 版本记录 / Changelog

本文件记录每个可归档版本的用户可见结果。详细设计与证据边界见
[玩法演进总路线图](docs/GAMEPLAY_EVOLUTION_ROADMAP.md) 和
[发布检查表](docs/RELEASE_CHECKLIST.md)。

## `1.0.0` — 2026-07-24

- 冻结八层、47 组课程与五阶段最终魔王的本地浏览器 MVP。
- 同步产品、仓库指南、课程、地图、设计状态、存档和归因边界。
- 保持 `run:v10`、`profile:v2` 与 `onboarding:v1`，不制造仅因发布版本变化的存档迁移。
- 以完整自动化、生产构建和多视口浏览器检查作为发布门；部署与 GitHub Release 另行决定。

## `0.11.0` — 2026-07-24

- 锁定生命、XP、伏击、精英、掉落、武器和层主伤害平衡。
- 合并非关键移动存档；页面隐藏时暂停渲染与音频；目标帧率设为 30 FPS。
- 将 Phaser 拆为独立可缓存块，消除原先笼统的主包 500 kB 构建警告。
- 完成 Reduced Motion、窄屏、触控、焦点和 10 秒连续移动检查。
- 归档：[PR #19](https://github.com/Kkkirito-123/select-from-dungeon/pull/19)。

## `0.10.0` — 2026-07-24

- 完成第七层索引/真实 SQLite 执行计划和第八层事故分析课程。
- 加入五阶段最终魔王、八层最终生态与 `run:v10` 迁移。
- 物理回归扩展到八层 47 个必修课程组。
- 归档：[PR #18](https://github.com/Kkkirito-123/select-from-dungeon/pull/18)。

## `0.9.0` — 2026-07-24

- 完成第五层窗口函数与第六层一次性 DML/事务沙箱。
- 修复窗口题因怪物 HP 回写导致标准结果漂移的问题。
- 归档：[PR #17](https://github.com/Kkkirito-123/select-from-dungeon/pull/17)。

## `0.8.0` — 2026-07-24

- 完成第三层连接/集合与第四层子查询/CTE，课程扩展至 22 组。
- 加入亡灵墓城、元素熔炉及对应生态、装备与区域首领。
- 归档：[PR #16](https://github.com/Kkkirito-123/select-from-dungeon/pull/16)。

## `0.7.0` — 2026-07-24

- 建立种子化八层生态切片、区域首领、多阶段题和主题掉落框架。
- 归档：[PR #15](https://github.com/Kkkirito-123/select-from-dungeon/pull/15)。

## `0.6.0` — 2026-07-24

- 建立八层课程契约、Campaign 槽位、内容校验与 `run:v9`。
- 归档：[PR #14](https://github.com/Kkkirito-123/select-from-dungeon/pull/14)。

## `0.5.0` — 2026-07-24

- 加入路线信标、死路补给、保证钥匙和双向捷径。
- 归档：[PR #13](https://github.com/Kkkirito-123/select-from-dungeon/pull/13)。

## `0.4.0` — 2026-07-24

- 加入 12 格装备背包、防具、恢复品、独立多掉落与安全丢弃。
- 归档：[PR #12](https://github.com/Kkkirito-123/select-from-dungeon/pull/12)。

## `0.3.0` — 2026-07-24

- 加入每层三个实体篝火、安全区、休息、复活与死亡复盘。
- 归档：[PR #11](https://github.com/Kkkirito-123/select-from-dungeon/pull/11)。

## `0.2.0` — 2026-07-24

- 加入浏览器本地 SQL 答题记录、最近战斗与当前楼层复盘。
- 归档：[PR #10](https://github.com/Kkkirito-123/select-from-dungeon/pull/10)。

