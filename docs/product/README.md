# 《SELECT FROM 地牢》产品文档总索引

> 文档集版本：`2.2-dev`
>
> 最后更新：`2026-07-29`
>
> 当前制作范围：第一至第八层运行时叙事、地标状态、隐藏区与 SQL 地图密文 V1
>
> 文档状态：`F1–F8 IMPLEMENTED DEV / BROWSER VISUAL QA 进行中`

## 1. 文档集目标

本目录不是灵感备忘录，而是制作、开发、测试和验收共同使用的产品真源。它采用商业游戏团队
常见的分层方式，把“为什么做、做成什么、每一条内容如何触发、怎样证明完成”拆开管理。

文档集服务以下干系人：

| 干系人 | 读取入口 | 需要获得的答案 |
|---|---|---|
| 产品 / Creative Director | 主产品规格 | 玩家承诺、范围、支柱、停止条件 |
| 关卡策划 | 两层关卡圣经 | 拓扑、节奏、地标、状态、回访 |
| 叙事策划 | 叙事圣经与逐事件脚本 | 主题、人物弧、台词、证据、触发 |
| 系统 / 数值策划 | 课程战斗、怪物图鉴、成长经济 | 规则、数值、掉落、失败兜底 |
| UI / UX | 交互与可访问性规格 | 信息层级、状态、输入、错误反馈 |
| 美术 / 技术美术 | 美术方向与素材管线 | 像素网格、图层、动画、导出、预算 |
| 音频 | 音频方向与实现规格 | 音乐状态、循环、混音、版权、验收 |
| 客户端 / 数据 | 技术实施规格 | 数据契约、模块边界、迁移、降级 |
| QA / 制作人 | QA、遥测与里程碑 | 用例、门禁、风险、交付 Checkpoint |

## 2. 真源优先级

发生冲突时按以下顺序处理：

1. `AGENTS.md`、当前代码、自动化测试与发布检查表记录的运行事实；
2. 本目录中状态为 `IMPLEMENTED_F1_F2`、`IMPLEMENTED_F3_F4`、`IMPLEMENTED_F5_F8`
   或 `CONTENT_LOCKED` 的文档；
3. 第一、二层关卡圣经和系统专项规格；
4. `docs/design/` 中标记为保留依据的历史设计；
5. 更早的课程、主题和路线图。

任何文档不得仅凭“曾经写过”宣称功能已实现。每个条目使用统一状态：

| 状态 | 含义 |
|---|---|
| `CURRENT` | 当前运行时代码已存在且有验证证据 |
| `IMPLEMENTED_F1_F2` | 第一、二层垂直切片已进入运行时并通过自动化与浏览器 RC 门；人工边界另列 |
| `IMPLEMENTED_F3_F4` | 第三、四层叙事、地标、世界状态和第四层回燃支线已进入运行时；浏览器主观 QA 另列 |
| `IMPLEMENTED_F5_F8` | 第五至八层叙事、地标状态、隐藏换装、SQL 密文门和管理员预设已进入运行时；视觉精修另列 |
| `NEXT_V1_1_DESIGN_LOCKED` | 第一层下一迭代规则已确认，但宝箱、传送与视野改动尚未进入运行时 |
| `NEXT_BALANCE_LOCKED` | 八层经验、生命与攻击目标已完成数值设计，尚未替换当前运行时基线 |
| `TARGET_F1_F2` | 历史实施目标；当前文档集不应再以此声称 F1/F2 尚未落地 |
| `CONTENT_LOCKED` | 事实和系统含义冻结，只允许文字润色 |
| `DEFERRED` | 明确后置，不阻塞第一、二层 |
| `RETIRED` | 被新方案替代，不再进入运行时 |

## 3. 核心文档

### 3.1 产品与范围

- [两层垂直切片产品规格](./PRODUCT_SPEC_TWO_FLOOR_VERTICAL_SLICE.md)：产品愿景、受众、核心循环、
  全局系统、范围、八层宏观框架与总验收。
- [旧设计继承与迁移矩阵](./LEGACY_DESIGN_MIGRATION_MATRIX.md)：逐项说明旧稿保留、改造或废弃。
- [素材来源与生产清单](./ASSET_SOURCE_AND_PRODUCTION_MANIFEST.md)：每个原始素材、派生素材、许可证、
  目录和运行时预算。

### 3.2 关卡

- [第一层：地下余烬档案](./floors/FLOOR_01_EMBER_ARCHIVE.md)
- [第一层三区灰盒：双岸与失名迷宫](./floors/FLOOR_01_THREE_ZONE_GRAYBOX.md)：左、右安全区、
  中央 Seed 迷宫、进入确认、有限视野与直接伤害陷阱的实施契约，以及 V1.1 宝箱怪、稳定传送、
  3 格视野和陷阱信息收束方案。
- [第二层：潮汐群岛](./floors/FLOOR_02_TIDAL_ARCHIPELAGO.md)
- 第三层“白霜墓原”至第八层“黑金迁移高堂”当前由逐事件脚本、八层总精排和运行时体验定义
  共同拥有；完整关卡圣经将在视觉 QA 后按层补齐。

关卡圣经负责“玩家在什么时候、什么地点、做什么、世界如何改变”。逐字对白与镜头细节放入
叙事脚本，避免同一事实在三处互相漂移。

### 3.3 叙事

- [叙事圣经](./narrative/NARRATIVE_BIBLE.md)：世界规则、主题、角色弧与八层宏观真相。
- [第一层逐事件演出脚本](./narrative/FLOOR_01_SCRIPT.md)
- [第二层逐事件演出脚本](./narrative/FLOOR_02_SCRIPT.md)
- [第三层逐事件演出脚本](./narrative/FLOOR_03_SCRIPT.md)
- [第四层逐事件演出脚本](./narrative/FLOOR_04_SCRIPT.md)
- [第五层逐事件演出脚本](./narrative/FLOOR_05_SCRIPT.md)
- [第六层逐事件演出脚本](./narrative/FLOOR_06_SCRIPT.md)
- [第七层逐事件演出脚本](./narrative/FLOOR_07_SCRIPT.md)
- [第八层逐事件演出脚本](./narrative/FLOOR_08_SCRIPT.md)
- [八层主线精排与 SQL 地图解密](./narrative/EIGHT_FLOOR_STORY_ORDER.md)

### 3.4 系统

- [SQL 课程与战斗规格](./systems/SQL_CURRICULUM_AND_COMBAT_SPEC.md)：SQL 学习曲线、逐阶段题目、
  判定与战斗。
- [怪物、Boss 与图鉴规格](./systems/MONSTER_BOSS_AND_CODEX_SPEC.md)：怪物分类、Boss 机制、
  身份揭示和图鉴。
- [成长、经济、篝火与探索系统](./systems/PROGRESSION_ECONOMY_AND_EXPLORATION_SPEC.md)：经验、装备、
  掉落、复活、捷径、Seed 与疲劳预算；同时记录当前运行时基线和待实现的八层经验、生命、攻击
  重平衡表。
- [UI、UX 与可访问性规格](./systems/UX_UI_AND_ACCESSIBILITY_SPEC.md)：完整界面状态、输入、反馈与
  响应式边界。

### 3.5 视听

- [美术方向与素材管线](./presentation/ART_DIRECTION_AND_ASSET_PIPELINE.md)：F1 / F2 视觉支柱、
  Tile、Sprite、动画与导出。
- [音频方向与实现规格](./presentation/AUDIO_DIRECTION_AND_IMPLEMENTATION_SPEC.md)：音乐状态、
  曲目许可、循环、混音与 SFX。

### 3.6 制作与工程

- [技术架构与内容管线](./production/TECHNICAL_IMPLEMENTATION_AND_CONTENT_PIPELINE.md)：代码边界、
  数据契约、存档、素材加载、降级和实施顺序。
- [QA、体验遥测与发布计划](./production/QA_TELEMETRY_AND_RELEASE_PLAN.md)：功能、内容、学习、视觉、
  音频、性能和发布门禁。

## 4. 本轮定义完成

文档完成不等于篇幅足够，而是每个系统满足以下条件：

1. 有目标体验和反目标；
2. 有玩家输入、触发条件、状态、输出和失败兜底；
3. 有数据所有者和代码落点；
4. 有第一至第八层的实际内容，不只写抽象原则；
5. 有可自动或人工执行的验收；
6. 有性能、可访问性、版权和旧存档风险；
7. 明确区分运行时 V1、文字精修、正式美术与最终音频，不把 V1 线框机关宣称成最终资产。

## 5. 变更控制

涉及以下内容时必须同时更新对应文档和自动化测试：

- SQL 答案、字段、别名或表结构；
- 怪物 ID、身份揭示、经验、掉落或 Boss 阶段；
- 地图关键节点、捷径、篝火、航线或环境状态；
- 存档字段或版本；
- 素材来源、许可证、哈希或派生脚本；
- 音频曲目、录音来源、循环点或默认响度；
- 可访问性、触屏和 320 px 行为。

PR 描述必须列出改变的契约、验证证据和剩余风险；不能只写“优化体验”。
