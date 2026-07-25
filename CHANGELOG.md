# 版本记录 / Changelog

本文件记录每个可归档版本的用户可见结果。详细设计与证据边界见
[玩法演进总路线图](docs/GAMEPLAY_EVOLUTION_ROADMAP.md) 和
[发布检查表](docs/RELEASE_CHECKLIST.md)。

## `2.0.0` — 2026-07-24（候选发布）

- 新 Run 升级为 generator v5 的八张 `48×36` 紧凑复合地图；每层拥有固定宏观轮廓、三个区域、
  宽路、实体交通和回程结构。旧 generator v4 的 `64×48` Run 继续兼容读取。
- 八层主线统一为从地下余烬档案到黑金高堂的上升旅程；每层五个叙事拍、两条固定证据、
  抄写员篝火复盘和本地《失名录》共同揭示玩家身份，最终完成唯一 `MIGRATE` 结局。
- 玩家按照 1–2、3–4、5–6、7–8 层分成四阶段显形；地图和战斗共用同一份程序化角色配方，
  抄写员及全部怪物族群也使用可校验的明确像素轮廓。
- 重写八层原创程序化 Web Audio：每层有独立调性、区域变奏与探索 / 战斗 / Boss 乐章，
  持续底床跨乐句连接，状态切换短淡化，不再运行公版作品改编。
- 八层 89 只怪物的 `monsters.id` 统一连续为 `1–89`；旧稀疏编号 Run 在加载时同步迁移怪物、
  Actor、战斗、复盘和掉落引用，关系表继续用 `monster_id` 指向 `monsters.id`。
- 保持 47 组课程、真实 SQLite、`run:v10` / `profile:v2`、低概率即时恢复品、三篝火、
  撤退、背包、管理员模式和旧永久掌握进度。
- 自动化、生产构建与浏览器证据见 [MVP 2.0 发布检查表](docs/RELEASE_CHECKLIST.md)；
  归档候选：[PR #23](https://github.com/Kkkirito-123/select-from-dungeon/pull/23)。

## `1.1.0` — 2026-07-24

- 怪物目标统一使用 `monsters.id`；终端按主表/明细表显示字段角色，并补齐 `INNER JOIN`、`ON`
  与真实表关系的上下文补全。
- 审计八层 39 种怪物类型的像素渲染；青蛙、树妖、水怪与丛林王按物种覆盖复用战斗类型，
  第七、八层怪物不再退化成墙块兜底。
- 普通怪仅有 2% 恢复品候选，小型精英 5%、区域首领 10%；随机恢复品直接使用，随机战利品
  不再保证最低数量，课程武器和钥匙仍保持固定获得。
- 战斗新增撤退到当前复活点；每层三个生态区新增两组区域门，中段区域首领击败后会自动进入
  末段主线区，跨区同时切换电子古典探索曲。
- 新增不写入正式 Run 的管理员全局视图，可预览八层全图、怪物、首领、区域门并定位三个生态区。
- 归档：[PR #22](https://github.com/Kkkirito-123/select-from-dungeon/pull/22)。

## `1.0.0` — 2026-07-24

- 冻结八层、47 组课程与五阶段最终魔王的本地浏览器 MVP。
- 同步产品、仓库指南、课程、地图、设计状态、存档和归因边界。
- 保持 `run:v10`、`profile:v2` 与 `onboarding:v1`，不制造仅因发布版本变化的存档迁移。
- 以完整自动化、生产构建和多视口浏览器检查作为发布门；部署与 GitHub Release 另行决定。
- 归档：[PR #20](https://github.com/Kkkirito-123/select-from-dungeon/pull/20)。

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
