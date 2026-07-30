# 两层垂直切片技术架构与内容生产管线

> 文档版本：`1.0`
>
> 状态：`F1_F2 IMPLEMENTED / PIPELINE CURRENT`
>
> 技术栈：TypeScript、Phaser 4.2.1、SQLite WASM、Vite

## 1. 技术目标

在不更换引擎、不增加后端、不破坏离线博客试玩和旧永久学习进度的前提下，把当前“通用迷宫 +
程序化色块 + 文字剧情”升级为可以生产第一、二层正式内容的架构。

必须达到：

1. 楼层地点、NPC、故事、课程、环境状态和素材引用有统一内容契约；
2. 水位、潮位、捷径、名字和 Boss 结果由权威进度纯派生，读档不漂移；
3. 正式外部素材与程序化降级渲染共存；
4. BGM 使用可审计录音 / 导出文件，SFX 保持轻量；
5. F1 / F2 可按资源包加载，不把全部原始素材塞进主 Bundle；
6. 管理员预设可以直接验证各世界状态；
7. 当前 330 项测试覆盖新旧契约，不通过删除旧断言掩盖回归。

## 2. 不做什么

- 不迁移到 Unity、Godot 或新 Web 引擎；
- 不引入服务器、账号、云数据库或 AI Agent；
- 不把八层全部重写；F3–8 使用现有兼容表现；
- 不做完整 ECS 框架重构；
- 不把原始 CC0 素材包直接发布；
- 不用现代商业录音、流媒体抓取或来源不明 SoundFont；
- 不在本轮做大型 Shader、动态光照、物理水体或自由船舶模拟；
- 不为了消除 500 KB 警告提前牺牲功能；但新素材不得无上限进入主包。

## 3. 当前架构审计

| 领域 | 当前权威 | 主要缺口 |
|---|---|---|
| Run / 战斗状态 | `src/domain/GameSession.ts` | 超过 3200 行；没有楼层世界状态契约 |
| 地图 | `floorMapBlueprints.ts` + `mazeGenerator.ts` | 48×36 通用矩形房与走廊，地标语义不足 |
| 生态 | `biome.ts` / `guidedMap.ts` | 通用三分区，无法表达水位、潮位与航线 |
| 课程 | `mvpLevel.ts` / `floor2Level.ts` | 题目能运行，但身份揭示与字段文案有冲突 |
| SQLite | `SqlEngine.ts` / `sqlSchema.ts` | 只有四张课程通用表，没有真实剧情记录 |
| 视觉 | `DungeonScene.ts` | 主要由 `Graphics` 绘制，没有资源加载与 Tile / Setpiece 层 |
| 剧情 | `narrativeContent.ts` / `AppShell.ts` | 根据进度显示卡片，不改变世界 |
| 音频 | `ArcadeAudio.ts` / `musicScore.ts` | 振荡器 BGM 易蜂鸣、断续，录音和 SFX 未分层 |
| UI | `AppShell.ts` | 超过 3300 行；任务、Schema、补全、结算交叉耦合 |
| 存档 | Run v11 / Profile v3 | 可保留大部分结构，但需环境派生和故事证据扩展 |

结论：Phaser 不是画面粗糙的根因。根因是缺少正式美术资源、专门的环境渲染层、关卡内容契约和
世界状态。更换引擎会扩大风险但不会自动产生《死亡细胞》级别的美术。

## 4. 目标模块边界

```text
src/content/floorExperience/
  types.ts                    # 楼层内容契约
  floor01.ts                  # F1 地点、地标、NPC、故事、素材键
  floor02.ts                  # F2 同上
  index.ts

src/domain/
  floorWorldState.ts          # 从权威进度纯派生环境状态
  floorWorldState.test.ts

src/game/
  FloorAssetLoader.ts         # 资源清单和加载状态
  FloorEnvironmentRenderer.ts # Tile、地形、岸线、环境状态
  FloorSetpieceFactory.ts     # 水轮、书架、船、灯塔、篝火等
  FloorActorRenderer.ts       # NPC / 怪物 / 玩家表现
  DungeonScene.ts             # 只保留场景生命周期与协调

src/audio/
  AudioDirector.ts            # 音乐状态机与总线
  RecordedMusicPlayer.ts      # BGM 文件、循环与交叉淡化
  ProceduralSfx.ts            # 轻量 UI / 战斗 / 世界音效

src/sql/
  worldStorySchema.ts         # 只读剧情表定义与种子
  storyQueryCatalog.ts        # 环境调查的可审计 SQL

src/ui/
  panels/SqlBattlePanel.ts
  panels/CodexPanel.ts
  panels/CampfirePanel.ts
  panels/AdminWorldPresetPanel.ts
  presenters/TaskContractPresenter.ts
```

第一轮不强制把整个 `GameSession` / `AppShell` 一次拆完。采用旁路模块：新模块拥有新职责，原类仅
调用；每个 checkpoint 后再移除重复分支。

## 5. 楼层体验内容契约

### 5.1 核心类型

```ts
type FloorExperienceId = "floor-01-ember-archive" | "floor-02-tidal-archipelago";

interface FloorExperienceDefinition {
  id: FloorExperienceId;
  floor: 1 | 2;
  title: string;
  version: number;
  assetPack: FloorAssetPackDefinition;
  regions: readonly FloorRegionDefinition[];
  landmarks: readonly FloorLandmarkDefinition[];
  npcPlacements: readonly FloorNpcPlacement[];
  storyEvents: readonly StoryEventDefinition[];
  environmentRules: readonly EnvironmentRuleDefinition[];
  adminPresets: readonly FloorAdminPreset[];
}
```

`FloorLandmarkDefinition` 至少包含：

- 稳定 `id`；
- 关卡节点锚点，而不是硬编码像素；
- 占地、碰撞和交互面；
- 初始 / 完成 / 受损 / 禁用状态素材键；
- 与课程、怪物、门或世界状态的关系；
- 小地图图标、无障碍名称和几何降级配方。

`StoryEventDefinition` 至少包含：

- `id` 与版本；
- 触发条件表达式；
- 一次性 / 可重复；
- 优先级和互斥组；
- 输入锁定策略；
- 动作序列；
- 写入的权威事件 / 证据；
- 被跳过、死亡、读档和资源失败时的完成语义。

### 5.2 内容真源原则

- 关卡节点的教育目的来自 `runGraph`，空间与演出来自 `floorExperience`；
- 怪物数值仍由楼层课程内容拥有；
- 地标不复制怪物生命或课程完成布尔值；
- 素材键引用 manifest，不能直接写任意 URL；
- 文案使用稳定 key，脚本和 UI 不复制中文字符串；
- F3–8 无定义时回退现有通用 renderer。

## 6. 世界状态纯派生

### 6.1 输入

```ts
interface FloorWorldProgressInput {
  floor: 1 | 2;
  completedLessonIds: ReadonlySet<string>;
  defeatedMonsterIds: ReadonlySet<number>;
  openedGateIds: ReadonlySet<string>;
  discoveredMonsterIds: ReadonlySet<number>;
  collectedKeyItems: ReadonlySet<string>;
  visitedRoomIds: ReadonlySet<string>;
  activeCampfireId: string | null;
}
```

### 6.2 F1 派生输出

| 条件 | 状态 |
|---|---|
| 初始 | `water=high`, `wheel=stalled`, `beds=hidden`, `shortcut=closed` |
| SELECT 完成 | `wheel=turning` |
| WHERE 完成 | `water=middle`, 栈桥放下 |
| IS NULL 完成 | `beds=revealed` |
| 背面闸门开启 | `shortcut=open` |
| GROUP BY 完成 | `archivePages=sorted` |
| 登记官击败 | `registryRule=amended`, `lift=active` |

### 6.3 F2 派生输出

| 条件 | 状态 |
|---|---|
| 初始 | `tide=high`, `beacons=dark`, `lock=closed`, `lighthouse=overwriting` |
| ORDER 完成 | 首条航线稳定 |
| DISTINCT 完成 | 三个浮标显形 |
| INNER 完成 | 根桥接通 |
| LEFT 完成 | 沉水村落证据显形 |
| 湖兽击败 | `tide=low`, 岸线扩大 |
| 船闸开启 | `lock=open`, 直航激活 |
| 灯塔守卫击败 | `lighthouse=preserving`, 七页装订 |

纯函数必须幂等；相同输入严格返回相同输出。动画是否已播放属于短期呈现状态，不混入世界真相。

## 7. 地图与锚点实现

### 7.1 手工宏观、受控微观

新 F1 / F2 使用固定房间图和语义锚点：

```ts
interface SemanticAnchor {
  id: string;
  roomId: string;
  normalizedPosition: { x: number; y: number };
  clearance: { width: number; height: number };
  facing: "north" | "east" | "south" | "west";
}
```

生成器在固定房间轮廓内使用 Seed 选择局部装饰和非关键边缘，但必须通过：

- 可达性；
- 关键锚点净空；
- 课程顺序；
- 篝火安全区；
- 门 / 桥两态碰撞；
- 捷径节省距离；
- 船线路径；
- 最大空走段。

### 7.2 旧存档

Run v11 可能保存旧完整地图：

- 若 `generatorVersion < target`，保留旧几何并使用兼容地标锚点；
- 不强制将旧坐标迁移到新地图；
- 新 Run 使用新 generator / experience version；
- Profile 的课程和图鉴不受影响；
- 管理员可创建新两层测试 Run，不覆盖正式旧 Run。

## 8. 真实剧情数据库

### 8.1 原则

剧情证据不能只是一张预写卡。第一、二层新增只读世界记录表，由 SQLite WASM 真实创建和查询。
它们是世界数据，不取代四张课程通用表。

### 8.2 表结构

```sql
CREATE TABLE residents (
  id INTEGER PRIMARY KEY,
  name TEXT,
  restore_trace TEXT NOT NULL,
  status TEXT NOT NULL,
  room_id INTEGER,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE identity_sources (
  id INTEGER PRIMARY KEY,
  resident_id INTEGER,
  alias_name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  sector TEXT NOT NULL,
  restore_trace TEXT NOT NULL,
  record_status TEXT NOT NULL,
  FOREIGN KEY (resident_id) REFERENCES residents(id)
);
```

第一层开场执行：

```sql
SELECT id FROM residents WHERE restore_trace = 'CURRENT';
-- 0 rows
```

同时系统权限记录显示恢复有效。这一矛盾是剧情证据，不是数据库错误。

第二层七份身份来源拥有相同 `restore_trace`、不同 `alias_name / source_kind / sector`；玩家通过环境
调查看到系统预写查询和真实结果。主课程仍围绕 `monsters / rooms / monster_gear`，避免一次引入
过多 Schema。通关后可选复盘题允许对 `identity_sources` 使用 DISTINCT / JOIN。

### 8.3 访问策略

- 表为只读课程数据；当前两层禁止 DML；
- 开场 / 环境演出运行 catalog 中审核过的 SQL；
- 玩家可以展开查看 SQL 与真实结果；
- 可选复盘在已学知识范围内允许编辑；
- 自动补全只在相关故事调查中展示剧情表，普通怪战不铺开全部表；
- 查询策略阻止多语句、PRAGMA、ATTACH 和写操作；
- 结果进入故事事件，不直接信任任意字符串触发世界状态。

### 8.4 身份原子结算

怪物真名仍保存在课程数据中，但 UI 和图鉴遵循状态机：

```text
UNKNOWN
→ final name query passes
→ battle kill transaction
→ DISCOVERED
```

最终 `name` 查询本身与击杀同一结算。若过程被中断，读档根据怪物是否击败重建为 UNKNOWN 或
DISCOVERED，不保留半状态。自由 SQL 返回值不能单独写 Profile。

## 9. SQL 任务合同

当前 UI 不应从答案字符串反向猜主表和字段。每个阶段新增结构化合同：

```ts
interface SqlTaskContract {
  objective: string;
  primaryTable: TableRef;
  relatedTables: readonly TableRef[];
  requiredColumns: readonly QualifiedColumnRef[];
  requiredAliases: readonly AliasRequirement[];
  relationHints: readonly RelationRef[];
  filterFacts: readonly FilterFact[];
  allowedConcepts: readonly string[];
  identityReveal: "none" | "final-on-kill";
  hintTiers: readonly [Hint, Hint, Hint, Hint];
}
```

判定仍以 SQLite 真实结果和必要结构为准；合同负责 UI、补全、提示、可访问性和内容静态检查。

内容检查必须拒绝：

- 未限定的歧义字段；
- 任务提到不存在的列；
- 最终阶段前要求 `name`；
- 提示长度逆序；
- 答案使用 `monsters.monster_id`；
- 两表题没有连接关系；
- 任务要求别名但合同未声明。

## 10. 视觉资源架构

### 10.1 目录

```text
assets/vendor/<source-id>/
  source.json
  LICENSE.*
  original/<original archive and extracted files>

assets/production/floor-01/
  source-map.json
  scripts/
  working/

public/assets/floors/floor-01/
  manifest.json
  tiles/
  actors/
  setpieces/
  ui/
```

每个来源独立目录。原始包不复制到 `public`。`manifest.json` 只列运行时需要的派生文件、尺寸、
像素密度、哈希、来源和降级键。

### 10.2 加载

- 启动只加载共用 UI / 玩家 / 篝火；
- 进入 F1 / F2 前加载对应包；
- 同楼层切区域不重新下载；
- 使用浏览器缓存和版本化文件名；
- 加载失败显示几何降级并记录错误，不阻塞课程；
- F3–8 继续当前程序化渲染直到正式生产。

### 10.3 渲染层

从下到上：

1. 背景与远景；
2. 地面 Tile；
3. 岸线 / 水 / 阴影；
4. 地形墙体；
5. 低装饰；
6. 角色与可交互对象；
7. 前景遮挡；
8. 局部光与天气；
9. 世界标签 / HUD。

碰撞不从贴图颜色推断，继续使用明确网格 / 多边形掩码。装饰不可改变可达性。

## 11. 音频架构

保留 `ArcadeAudio` 兼容门面，内部路由：

```text
AudioDirector
├ RecordedMusicPlayer (explore / campfire / battle / boss)
├ AmbientLoopPlayer   (water / archive / wind)
└ ProceduralSfx       (UI / hit / fire / gate / boat)
```

要求：

- Web Audio 首次手势解锁；
- 音乐状态交叉淡化，不先完全熄火再重启；
- 页面隐藏暂停或渐静；
- 恢复不产生两个并行 loop；
- 作品版权和录音版权均记录；
- 主音乐默认综合响度目标由音频规格定义；
- 浏览器不支持精准 loop 时使用双 AudioBuffer 预排程；
- 资源失败回退静音，不回退持续蜂鸣底床。

## 12. 存档与版本

### 12.1 最小迁移

优先从已有权威状态派生环境，避免立即升级 Run：

- 水位 / 潮位：课程和 Boss；
- 身份：怪物击败 + Profile 发现；
- 捷径：`openedGateIds`；
- 证据：关键物 / 完成故事事件。

若逐事件脚本需要记录一次性消费，新增：

```ts
consumedStoryEventIds: string[];
```

此时 Run 从 v11 升 v12，迁移默认空数组。旧 Run 不重播会改变奖励的事件；可重复环境对白由状态
实时生成。

### 12.2 保存时机

- 战斗胜利整笔结算后；
- 休息 / 更新复活点后；
- 门、船闸、捷径完成后；
- 证据和确定奖励写入后；
- 层间切换前后；
- 不在动画中间保存半状态。

写入失败显示非阻塞但明显错误，并保留内存 Run；不得假装保存成功。

## 13. 管理员与调试边界

管理员预览创建隔离 Session：

- 可指定 Seed、楼层、故事阶段、环境状态、身份、掉落结果；
- 可跳转地标、篝火、课程、Boss、捷径两侧；
- 可显示碰撞、锚点、安全区、主路和素材降级；
- 可强制音频状态和 Reduced Motion；
- 常亮 `ADMIN PREVIEW — DOES NOT SAVE`；
- 退出恢复最后正式快照。

管理员不能修改 Profile、发布远程数据或绕过浏览器许可自动播放音频。

## 14. 性能预算

功能优先，但新实现设置硬边界：

| 指标 | 目标 | 失败处理 |
|---|---:|---|
| 主线程稳定帧率 | 30 FPS 最低，常见桌面 60 FPS | 降粒子、光照和动画帧 |
| 首层运行时图像 | gzip / brotli 后 ≤1.5 MB 目标 | 删未用帧、压 atlas、延迟加载 |
| 单楼层音频 | ≤4 MB 目标 | 单声道环境、压缩、缩短无损重复 |
| 屏幕活跃粒子 | 普通 ≤80，Boss ≤200 | 对象池、Reduced Motion 降级 |
| 每帧新增对象 | 稳态 0 | 池化 label / particle / sprite |
| SQLite 查询 | 普通题 <50 ms | 限制数据量和结果行数 |
| 存档写入 | <100 ms 目标 | 批量结算后写，不每步写 |

当前生产构建为：入口 `22.46 kB / gzip 7.89 kB`、界面
`199.56 kB / gzip 56.05 kB`、世界规则 `463.75 kB / gzip 136.49 kB`、游戏逻辑
`111.73 kB / gzip 35.02 kB`、SQLite JS 运行时 `39.69 kB / gzip 14.09 kB`、可缓存 Phaser
分块 `1,375.72 kB / gzip 357.84 kB`，以及独立 SQLite WASM
`659.73 kB / gzip 326.10 kB`。首方 JS 已全部低于 500 kB；Phaser 与 WASM 是单独缓存的上游
运行时，并未重复进入业务分块。后续优化应以真实首屏时序、解码内存和低端设备帧时间为证据，
不再通过单纯提高告警阈值冒充性能改善。

## 15. 实施 Checkpoint 记录

CP0–CP5 的代码与内容范围已完成；CP6 已进入发布候选，完整触屏 / iframe / 跨浏览器矩阵和真人
试听仍按发布检查表保留为人工边界。

### CP0：文档冻结（完成）

- 产品、两层、叙事、课程、系统、视听、素材、QA 文档齐全；
- 解决名字揭示、Boss 身份、剧情表、掉落和篝火冲突；
- 文档索引和旧稿迁移矩阵完成。

验收：所有 `TARGET_F1_F2` 条目有明确所有者和测试方式。

### CP1：内容契约与纯状态（完成）

- `floorExperience` 类型与 F1 / F2 数据；
- `floorWorldState` 纯函数；
- SQL task contract；
- 故事表和环境查询；
- 单元 / 内容静态测试。

验收：不改视觉也能在测试中遍历两层完整状态。

### CP2：第一层灰盒（完成）

- 固定宏观拓扑和锚点；
- 角色、篝火、水轮、水位、宿舍、捷径、登记官；
- 管理员初始 / 中段 / Boss / 通关预设；
- 完整通关测试。

验收：程序化占位也能证明地图回环、环境变化和剧情事件。

### CP3：第一层正式视听（完成）

- CC0 F1 资源、派生脚本、归因；
- Sprite / Tile / Setpiece；
- BGM、环境和 SFX；
- 视觉、音频、性能 QA。

### CP4：第二层灰盒（完成）

- 群岛拓扑、岸线、船、根桥、村落、湖兽、船闸、灯塔；
- 潮位与航线状态；
- JOIN 任务合同；
- 完整通关测试。

### CP5：第二层正式视听（完成）

- F2 CC0 资源与派生；
- 水 / 岸 / 船 / 灯塔动画；
- 音乐连续转场；
- 两层连贯通关。

### CP6：整合与发布候选（代码完成 / PR 与人工矩阵待归档）

- 旧存档、触屏、320 px、iframe、Reduced Motion；
- 音频解锁和页面隐藏；
- 性能与资源归因；
- 文档事实同步；
- 单一 PR 留痕（用户既有授权范围内执行）。

## 16. 测试策略

| 层级 | 内容 |
|---|---|
| 纯函数 | 世界状态、XP、掉落、Seed、锚点、身份状态 |
| 内容静态检查 | ID 唯一、字段存在、提示递增、最终 name、资源键存在 |
| SQL 集成 | 每阶段答案、错误、别名、真实结果、故事查询 |
| Session | 胜利原子结算、死亡、撤退、复活、存档迁移 |
| Scene | 资源成功 / 失败、碰撞、地标状态、管理员预设 |
| UI | 焦点、补全、提示、结果、320 px、触屏、Reduced Motion |
| E2E | F1、F2、跨层、读档、捷径回访、Boss、无音频、离线 |

不能以更新快照替代人工检查；视觉快照必须与关卡圣经的状态矩阵对应。

## 17. 风险与取舍

| 风险 | 影响 | 方案 |
|---|---|---|
| 新内容契约与旧分散数据双真源 | 漂移 | 新契约只拥有地点 / 演出，课程数值保持原所有者，并加交叉静态检查 |
| 新剧情表增加 Schema 认知负担 | 初学者困惑 | 只在故事调查展示；普通课程仍只显示参与表 |
| 外部素材风格不统一 | 拼贴感 | 统一调色、轮廓、像素网格和派生脚本；必要地标原创组合 |
| 手工宏观地图降低 Seed 变化 | 肉鸽感降低 | Seed 控制非关键空间和遭遇，质量优先 |
| 旧存档坐标不兼容 | 玩家卡住 | 旧地图保留并使用兼容渲染，不强迁移坐标 |
| BGM 文件增大博客加载 | 首屏慢 | 首次交互后按层加载，音频独立缓存和降级静音 |
| 巨型类拆分引发回归 | 开发风险 | 旁路模块 + checkpoint，不做一次性大爆炸重构 |

## 18. 技术验收

- [x] F1 / F2 内容均由 `floorExperience` 可枚举；
- [x] 世界状态函数相同输入输出稳定，无保存副本漂移；
- [x] 故事表在真实 SQLite 中创建、只读查询并有策略测试；
- [x] 课程合同静态拒绝歧义字段和提前 `name`；
- [x] 正式素材全部有 manifest、来源、许可证和哈希；
- [x] 资源失败时仍能用几何降级进入核心流程；
- [x] 音乐失败时游戏继续且不出现蜂鸣回退；
- [x] 新 Run 使用新两层拓扑，旧 Run 不被删除；
- [x] 胜利、身份、XP、奖励、故事和保存不产生半状态；
- [x] 管理员预设不写正式存档；
- [ ] 自动测试、构建、规则和定向浏览器主路径已有证据；完整设备矩阵与真人性能 / 音频感受待验收。
