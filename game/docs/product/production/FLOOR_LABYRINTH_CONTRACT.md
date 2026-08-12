# 八层迷宫内容契约

> 状态：`IMPLEMENTED / AUTOMATED / TARGETED BROWSER QA PASSED`

## 1. 边界

[`src/content/world/floorLabyrinth.ts`](../../../src/content/world/floorLabyrinth.ts) 是八层导航差异的最小内容真源。
它只记录稳定意图和稳定 ID，不保存坐标、Seed 结果、玩家位置、开门状态或其他 Run 数据。

[`src/domain/exploration/floorLabyrinth.ts`](../../../src/domain/exploration/floorLabyrinth.ts) 是对应的运行时解析层：它把内容
契约与当前已保存的 `MazeFloor`、两座篝火、`GuidedMapPlan` 和 `BiomePlan` 组合为安全范围、
当前视野与实体陷阱。`GameSession` 仍然是移动、承伤、已打开/已触发状态和模式切换的事实权威；
`DungeonScene` 只渲染当前快照，`AppShell` 只负责入场确认界面。

- `floorMapBlueprints` 继续拥有 `48×36` 物理槽位、三区名称和道路宽度；
- `floorContracts` 继续拥有课程与抽象拓扑策略；
- `floorExperience` 继续拥有地标表现、剧情、隐藏区奖励和管理员预设；
- `floorLabyrinth` 为运行时提供上述真源之间不应漂移的导航接口。

第二层体验文件可把湖、村落等拆成更多展示子区，但 `regionCount` 始终表示生成器使用的三个物理导航区。

## 2. 稳定接口

| 字段 | 用途 | 不包含 |
|---|---|---|
| `mazeName` | 玩家与管理员看到的迷宫名 | 历史兼容布局名 |
| `topologySignature` | `拓扑策略:楼层轮廓` 的稳定差异标记 | Seed、坐标、哈希 |
| `regionCount` | 物理导航区数量，八层均为 3 | 展示子区数量 |
| `entry` / `entryPrompt` | 入口房间、入场意图和首次提示 | 已读状态 |
| `exit` | 终段房间与离层意图 | 是否已经通关 |
| `bossGate` | 首领终段房间、门 ID 与解锁意图 | 门当前开关状态 |
| `shortcut` | 每层唯一回返捷径 ID 与空间价值 | 钥匙位置、是否开启 |
| `hiddenArea` | 唯一隐藏区、房间和实体门 | 奖励领取状态 |
| `safeRoomIds` | 固定入口与休息房，供安全区解析 | 生成后的安全格集合 |
| `sightRadius` | 非安全区当前可见半径 | 已探索迷雾 |
| `hazardKind/name/trigger/count/damage` | 本层危险的视觉类型、触发动词、生成预算与伤害 | 危险坐标、已触发状态 |

运行时只能从契约读取预算，再结合当前 `MazeFloor` 和 Seed 生成坐标。不得把生成结果写回内容模块，
也不得因为接入本契约修改 v11 存档结构。

## 3. 八层差异矩阵

| 层 | 拓扑签名 | 入口 → 出口 | 捷径意图 | 隐藏区 | 视野 | 危险 |
|---:|---|---|---|---|---:|---|
| 1 | `looped-keep:dual-bank-continuous` | 余烬书房 → 登记厅升降机 | 登记前哨回接书房 | 封存旧库 | 3 | 2×档案切纸轮，1 伤害 |
| 2 | `aggregate-hub:archipelago-lock-loop` | 潮汐浅滩 → 北岸渡船 | 码头直达灯塔 | 沉船记录舱 | 4 | 2×暗潮回流，1 伤害 |
| 3 | `relational-islands:reverse-grave-loop` | 冻岸石冢 → 葬火井 | 地宫回接冻岸 | 无主遗物室 | 3 | 2×冻土裂隙，1 伤害 |
| 4 | `nested-chambers:vertical-three-forge` | 葬火接收炉 → 垂直升炉 | 雷晶核心回接入口 | 回燃残响 | 4 | 3×三相泄压口，1 伤害 |
| 5 | `partition-rings:double-rampart` | 云上吊桥 → 黑铁上行桥 | 贯通城墙双环 | 静默名册室 | 5 | 3×警戒绊铃，1 伤害 |
| 6 | `rollback-nest:ridge-zigzag` | 龙脊矿车站 → 王室升降台 | 峰顶回接工坊 | 未提交育巢 | 3 | 3×熔岩裂缝，2 伤害 |
| 7 | `btree-branches:scan-index-fork` | 残照晶门 → 金色长阶 | 树心回接扫描长路 | 盲索引花园 | 5 | 3×纠根陷阱，2 伤害 |
| 8 | `throne-ascent:seven-wing-axis` | 黑金王门 → 迁移王座 | 王座回接版本长廊 | 零行礼拜堂 | 4 | 4×迁移裂隙，2 伤害 |

## 4. 已实现的运行时规则

### 4.1 入场边界与安全范围

- F1–F8 第一次从手工安全房跨入危险迷宫时，都会用本层 `mazeName` 与 `entryPrompt` 打开主框
  确认；按 `E` 后执行原移动，`Escape` 保持在安全区，确认不会封住原路返回。
- 每层 `safeRoomIds` 固定为入口房和休息房。玩家身处其中时会看见整间房；两座种子篝火仍各自
  提供可见安全圈。两类安全范围共同排除突发遭遇、巡逻进入、课程怪物、区域首领与实体陷阱。
- 安全区外只显示当前玩家周围的本层 `sightRadius`；已经走过的格子仍可留在发现式小地图上，
  但不会据此泄露远处角色或陷阱。

### 4.2 实体陷阱

- `hazard*` 预算按“Run Seed + 楼层 + 坐标”稳定选点，优先选择宽走廊，并避开房间、课程锚点、
  门、篝火、路线信标、捷径/钥匙、死路补给、生态地标、区域门、区域首领和全部安全格。
- 陷阱必须同时满足“格子已探索”和“处于当前视野”才显示。触碰后不进入 SQL 战斗，直接按
  `hazardDamage` 造成护甲优先伤害；若生命归零，继续使用现有死亡/篝火复活流程。
- 触发后的稳定 ID（`hazard:fN:K`）复用 `openedGateIds`，因此该陷阱在当前 Run 内显示为“已失效”
  并且不会再次扣血。

### 4.3 区域首领、捷径与隐藏区

- F2–F8 的中段区域首领不仅绑定中后区域门；只要对应首领仍存活，任何从前/中区跨入后区的普通
  步行都会被同一纯规则拒绝。胜利后后区恢复可达。F1 继续作为无通用区域门的连续地图例外。
- 每层仍只有一条稳定 ID 的双向回返捷径和一把保证可达的钥匙。它只减少已经走过路线的折返，
  不跳过课程、区域首领或楼层 Boss 前置。
- 每层仍只有一个实体隐藏区。隐藏门复用现有 `openedGateIds`，奖励领取状态沿用既有物品/唯一
  物品记录；隐藏区不进入安全房，也不阻塞主线和必修课程。

## 5. 存档与兼容决策

本轮不新增存档字段，也不升级 `select-from-dungeon:run:v11`：

- 内容契约、陷阱坐标、安全格掩码与当前视野均由现有楼层数据确定性重建；
- 已触发陷阱复用 `openedGateIds`；
- 入场确认不单独保存，读档时由玩家当前位置、`discoveredCells` 与 `visitedRoomIds` 推导；
- 首领门、捷径和隐藏区继续解析既有稳定 ID，不复制开关状态；
- `MazeFloor`、Campaign、Profile 与 Onboarding 的结构和版本均未改变。

## 6. 自动化证据与未验证边界

- [`tests/floorLabyrinth.test.ts`](../../../tests/floorLabyrinth.test.ts) 验证八层内容约束，以及迷宫名、
  拓扑、蓝图房间、课程 Boss 门、体验地标和隐藏区 ID 的交叉一致性。
- [`tests/eightFloorLabyrinth.test.ts`](../../../tests/eightFloorLabyrinth.test.ts) 以 F1–F8 × 6 个 Seed
  验证课程必经锚点和首领门不可绕过、F2–F8 中段首领的后区硬边界、每层捷径/钥匙/隐藏入口可达、
  安全区不含课程怪/区域首领/陷阱，以及八层拓扑互异且保留 Seed 非关键变化。
- 领域与 Session 回归负责入场确认、一次性陷阱承伤/失效、局部视野和 v11 读档恢复；自动化通过
  只证明规则与数据一致，不替代浏览器操作和视觉质量验收。

本轮浏览器已抽查 F2 群岛、F4 熔炉与 F8 王座的管理员切层、剧情卡关闭、楼层差异、独立陷阱
轮廓和控制台错误（0 条 warning/error）。完整八层 Run、八层全部入场主框、巡逻怪离开当前视野的
动态消失，以及 320–1920px、iframe 与 Reduced Motion 的完整视觉矩阵仍需后续真人长流程验收。
