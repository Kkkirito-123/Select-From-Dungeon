# 《SELECT FROM 地牢》SQL 课程与战斗系统规格

> 文档版本：`v0.1`
>
> 状态：`F1–F2 IMPLEMENTED / IMPLEMENTATION CONTRACT`
>
> 适用版本：`MVP 2.1 — The First Two Records`
>
> 详细范围：第一层、第二层完整课程与战斗；第三至八层宏观接口
>
> 最近更新：`2026-07-26`

## 0. 文档职责与优先级

本文负责冻结以下系统契约：

- SQL 课程如何从第一层推进到第八层；
- 第一、第二层每只怪物、每个阶段具体查询什么；
- 任务如何明确表、字段、别名、条件和返回结果；
- 四级提示、真实 SQLite 判定、错误反击、撤退和死亡如何工作；
- 未发现怪物的 `name` 如何避免在击杀前泄露；
- 正确查询如何同时驱动伤害、环境、剧情和身份恢复；
- 需要哪些自动化与试玩验收证据。

权威边界：

| 内容 | 权威来源 |
|---|---|
| 产品范围、用户承诺 | `PRODUCT_SPEC_TWO_FLOOR_VERTICAL_SLICE.md` |
| 第一层地点、剧情与角色 | `FLOOR_01_EMBER_ARCHIVE.md` |
| 第二层地点、剧情与角色 | `FLOOR_02_TIDAL_ARCHIPELAGO.md` |
| SQL 教学、战斗、提示与判定 | **本文** |
| 怪物身份、Boss、掉落与图鉴 | `MONSTER_BOSS_AND_CODEX_SPEC.md` |
| XP、奖励、撤退、死亡与篝火持久化 | `PROGRESSION_ECONOMY_AND_EXPLORATION_SPEC.md` |
| 当前实现事实 | 代码与自动化测试 |

若旧关卡稿中的答案与本文冲突，第一、第二层以本文的当前实现契约为准，并在旧设计决策表中记录
改造原因。

状态词：

| 状态 | 含义 |
|---|---|
| `CURRENT` | 当前代码已运行 |
| `TARGET` | MVP 2.1 必须实现 |
| `COMPAT` | 为旧存档或第三至八层临时保留 |
| `DEPRECATED` | 不再继续扩展，迁移后删除 |

## 1. 目标、用户与边界

### 1.1 设计目标

1. 玩家练习的是可独立执行的完整 SQL，而不是填空或背关键词。
2. 每题在输入前明确数据来源、字段归属、连接关系、输出列和别名。
3. 判定以真实 SQLite 结果为基础，同时要求本题核心语法确实出现。
4. SQL 成功不只显示伤害，必须产生至少一个可见世界结果。
5. 错误必须指出“结构错、结果错还是执行错”，再进入怪物反击。
6. 名字恢复是最终阶段的结算，不被任务标题、提示、结果表或战斗 HUD 提前泄露。
7. 第一层建立单表思维，第二层建立结果顺序、去重与表关系思维。
8. 第三至八层沿稳定接口增加复杂度，不重新发明战斗操作。

### 1.2 用户与干系人

| 用户 / 干系人 | 核心需求 |
|---|---|
| SQL 初学者 | 知道每个词为什么写、写在哪里、结果应该是什么 |
| 面试复习者 | 练习完整语句、常见错误和等价写法 |
| 冒险玩家 | 查询改变水位、桥、航线和 Boss 规则，而非弹出“答对了” |
| 内容策划 | 可以只改内容契约，不改判定器核心 |
| 工程与 QA | 每阶段拥有稳定输入、结果、状态和验收条件 |

### 1.3 MVP 2.1 范围

必须完成：

- 第一、第二层共 22 个怪物的阶段契约；
- 主线、随机复习、小型精英、区域 Boss 和楼层 Boss；
- 四级渐进提示；
- 名字延迟揭示；
- 真实结果、语法特征、只读策略和目标绑定四重判定；
- 错误反击、撤退、死亡复盘、篝火恢复；
- SQL 到环境状态的确定性映射。

本轮不做：

- 不改变第三至八层课程顺序；
- 不引入 AI 自动出题或联网判题；
- 不允许模型自动改写玩家 SQL；
- 不把答案缩短成不可执行的“核心算法”；
- 不新增自由动作战斗、闪避或连招；
- 不要求玩家记忆未展示的怪物名字；
- 不把现代 SQL 方言特性混入 SQLite 课程。

## 2. 标准系统契约

本文所有功能项使用以下六字段验收：

| 字段 | 含义 |
|---|---|
| 触发 `Trigger` | 玩家或系统在什么时刻进入该项 |
| 输入 `Input` | 玩家可见信息和实际提交内容 |
| 状态 `State` | 执行前提、阶段和需要保存的上下文 |
| 输出 `Output` | UI、战斗、环境、剧情和持久进展的结果 |
| 失败兜底 `Fallback` | 错误、退出、死亡或资源失败后的行为 |
| 验收 `Acceptance` | 可自动化或试玩证明的完成条件 |

### 2.1 单阶段运行状态

每个阶段至少拥有：

```text
stage_id
monster_id
round_index
is_final_stage
objective
input_tables[]
table_alias_rules[]
output_columns[]
relations[]
predicates[]
grouping[]
ordering[]
limit
required_features[]
expected_rows[]
world_effects[]
identity_policy
hints[4]
```

`answer_sql` 是验收参考，不是唯一允许写法。

### 2.2 任务卡固定顺序

SQL 面板左侧必须按以下顺序展示：

1. **本回合目标**：一句完整自然语言；
2. **返回结果**：列名、来源表、需要的输出别名；
3. **使用数据**：主表、关联表及各自角色；
4. **连接关系**：仅在 JOIN 题展示；
5. **过滤 / 分组 / 排序**：值和方向完整写明；
6. **世界结果**：成功后会改变什么；
7. **完整字段速查**：只高亮本题相关表，不隐藏其他合法表；
8. **提示进度**：`0/4` 至 `4/4`。

禁止任务文本：

> 查询 id = 12 的 name 与 sector。

目标写法：

> 将怪物主表写为 `monsters AS m`，房间主表写为 `rooms AS r`，按
> `m.room_id = r.id` 连接；返回怪物主表字段 `m.id` 与房间主表字段
> `r.sector`，只保留 `m.id = 12`。这里的 `id` 来自 `monsters`，
> `sector` 来自 `rooms`。

## 3. 数据与字段归属

### 3.1 第一、第二层允许使用的表

MVP 2.1 不为课程新增数据库表，继续使用现有四表：

| 表 | 角色 | 关键字段 |
|---|---|---|
| `monsters` | 怪物主表，一只怪物一行 | `id, room_id, name, species, hp, armor, status, weakness, master_id, is_boss` |
| `monster_signals` | 信号明细，一只怪物可以多行 | `id, monster_id, channel, charge` |
| `rooms` | 房间主表，一个地点一行 | `id, name, sector, floor` |
| `monster_gear` | 装备明细，一只怪物可以零至多行 | `id, monster_id, gear_name, power` |

### 3.2 主键与外键口径

| 关系 | 正确写法 | 常见错误 |
|---|---|---|
| 怪物主键 | `monsters.id` | 在 `monsters` 中写 `monster_id` |
| 信号所属怪物 | `monster_signals.monster_id = monsters.id` | `monster_signals.id = monsters.id` |
| 装备所属怪物 | `monster_gear.monster_id = monsters.id` | `monster_gear.id = monsters.id` |
| 怪物所在房间 | `monsters.room_id = rooms.id` | `monsters.id = rooms.id` |
| 怪物主人 | `monsters.master_id = monsters.id` | 用 `= NULL` 判断无主人 |

### 3.3 同名字段规则

- 当查询同时出现 `monsters.name` 与 `rooms.name` 时，必须使用表限定名。
- 房间名输出统一为 `room_name`。
- 怪物区域输出统一为 `room_sector`；单独只读 `r.sector` 时可保留 `sector`。
- 聚合计数统一为 `COUNT(*) AS total`。
- 表别名推荐 `m / r / s / g`，判定允许其他合法别名。
- 需要学习“别名”的题必须实际给两张表起别名并限定字段，但不强制玩家只能使用字母 `m/r`。
- 输出别名属于结果契约，要求精确匹配。

### 3.4 第一、第二层内容数据修订

第二层 SQL 与实际地点已统一；当前 `rooms.sector` 契约为：

| 地点范围 | `sector` |
|---|---|
| 白沙浅滩、潮汐码头 | `coast` |
| 月影湖、镜潮湾、深水影潭 | `lake` |
| 古树桥、北林巡道、盘根林地 | `forest` |
| 芦苇沼泽、泥沼石径、毒雾洼地、泥冠宫 | `swamp` |
| 灯塔岛 | `lighthouse` |

旧值 `storm / ambush / forest-bridge / forest-treant / swamp-boss` 不再作为面向玩家的目标结果。

`rooms.name` 是可在非最终阶段安全返回的地点信息，因此所有面向玩家的房间名必须保持中性：不含当前住民、区域 Boss 或可选 Boss 的真名。怪物身份只由最终阶段的原子揭示流程提交。

## 4. 名字揭示与真实结果

### 4.1 身份状态

| 状态 | 世界 HUD | SQL 任务 | SQL 结果 |
|---|---|---|---|
| 未发现 | `ID #xxx` | 不写真名，只写 ID | 越权身份用法在 SQLite 前拒绝；最终许可投影仍暂存 |
| 最终查询已执行、未结算 | 仍显示 ID | 允许最终阶段读取 `monsters.name` | 原始结果暂存，不立即渲染 |
| 最终查询通过 | 播放 `ID → name` | 阶段结束 | 在身份提交后显示真实结果 |
| 已发现 | `名字 · ID #xxx` | 可正常使用名字 | 正常显示 |

### 4.2 原子揭示顺序

任意最终阶段查询通过时：

```text
SQLite 执行
→ 原始结果暂存在本地内存
→ 语法特征与结果判定
→ 最终命中、怪物归零
→ profile.discoveredMonsterIds 原子写入
→ identity-recovered 事件
→ 显示真实结果；若结果未查询 name，则从内部身份配置读取真名
→ 播放 ID → 名字
→ 更新世界标签与图鉴
```

最终题不必都查询 `monsters.name`。题目只应选择当前概念真正需要的字段；例如
`002-B` 查询 `weakness`，身份仍在最终击杀结算中恢复。只有本题确实教学或验证
`name` 字段时，才把 `name` 放进最终 SQL。

在 `identity-recovered` 前，`monsters.name` / `monsters.species` 只能在题目明确要求的最终阶段
作为**直接投影列**出现。它们不得进入 `WHERE`、`JOIN / ON`、`GROUP BY`、`HAVING`、
`ORDER BY`、子查询、函数、聚合或 `CASE`；也不能用来比较、排序或推导布尔结果。
`rooms.name` 是地点字段，不受怪物身份封存影响。除此之外，不得把原始怪物身份放入：

- 结果表；
- 错误文本；
- 战斗标题；
- 怪物意图；
- 答题历史中的 `monsterName`；
- 旁白或掉落卡；
- 自动补全的示例值。

### 4.3 执行前身份防火墙

触发：

- 当前楼层为第一或第二层；
- 当前怪物尚未发现，或正在回答越级知识门；
- 查询在非许可投影位置读取 `monsters.name` / `monsters.species`，或用身份字段构造条件、
  排序、聚合、函数和派生表达式。

处理：

- 在 SQLite 执行前拒绝查询，正确名字和错误名字得到完全相同的封存反馈；
- 不返回行数、结果值、目标 ID 或查询计划，只显示允许暴露的字段结构；
- 该查询不能推进阶段，也不会写入任何身份或世界状态；
- 按一次普通错误查询结算 1 点反击，避免“命中时受伤、未命中时不受伤”形成第二条预言机；
- 官方最终阶段若要求读取身份，只允许与参考答案一致的直接 `name` / `species` 投影，真实值仍在
  最后一击原子结算后显示。

说明：这是学习和演出边界，不是安全边界；本地玩家通过开发者工具读取静态内容不在防护范围内。

## 5. 八层学习曲线

| 层 | 核心知识 | 结果复杂度 | 战斗重点 | 世界行为 | Boss 认知 |
|---:|---|---|---|---|---|
| 1 | SELECT、WHERE、NULL、COUNT、GROUP BY、HAVING | 单表单行 → 明细聚合 | 看懂列、行与空值 | 排水、显形、归档 | 0 行不等于不存在 |
| 2 | ORDER BY、LIMIT、DISTINCT、INNER/LEFT JOIN | 有序多行、两表关系 | 区分值、来源与缺失匹配 | 点灯、架桥、退潮 | 多数不能覆盖差异 |
| 3 | JOIN 深化、自连接、三表、UNION | 关系链与集合合并 | 防止错连和连接放大 | 对照关系、复原谱系 | 同名不等于同一实体 |
| 4 | 标量/IN/EXISTS 子查询、CTE、递归 | 嵌套结果集 | 选择存在性与依赖方向 | 追踪、接线、递归开路 | 局部结果依赖上下文 |
| 5 | OVER、PARTITION、排名、LAG/LEAD、Frame | 保留明细的分析结果 | 分区、顺序、窗口边界 | 观察时序、军阵变化 | 排名不是删除 |
| 6 | INSERT、UPDATE、DELETE、约束、事务、保存点 | 可变沙箱状态 | 预演、回滚、提交 | 修复和恢复现场 | 能修改不等于应提交 |
| 7 | B+Tree、联合/覆盖索引、失效、执行计划 | 结果 + 查询计划 | 正确性与代价并重 | 比较路径、缩短路线 | 最快路径有前提 |
| 8 | MVCC、锁、隔离、建模、复制、分片、安全 | 多系统证据 | 综合诊断与迁移 | 重建王城规则 | 唯一正确动作是 MIGRATE |

难度维度只逐步增加，不同时跳变：

1. 表数量；
2. 行数量；
3. 输出列数量；
4. 子句数量；
5. 顺序敏感性；
6. 状态可变性；
7. 计划与系统证据。

## 6. 第一层逐怪逐阶段矩阵

### 6.1 主线怪物 ID 001–005

| ID / 阶段 | 触发与输入 | 目标 SQL | 示例结果 | 状态与输出 | 失败兜底 | 验收 |
|---|---|---|---|---|---|---|
| `001-A` 弱点字段 | 首次触碰 ID #001；已知表 `monsters`、目标 ID | `SELECT weakness FROM monsters WHERE id = 1;` | `weakness=slash` | 暴露核心；不揭名；阶段 0→1 | 缺 SELECT/FROM 或结果不唯一时反击 1 | 只返回 `weakness`，来源为 `monsters`，锁定 `id=1` |
| `001-B` 身份行 | 阶段 1；最终阶段 | `SELECT name FROM monsters WHERE id = 1;` | `name=史莱姆`，结算前暂存 | 击杀、恢复“史莱姆”、图鉴盖章、水轮启动 | 错误时保持 ID；反击 1 | 最终查询通过后才首次显示 name |
| `002-A` 排水目标 | 进入排水渠并触碰 ID #002 | `SELECT id FROM monsters WHERE room_id = 2 AND status = 'escaped';` | `id=2` | 高亮正确水闸目标；不揭名 | 多行、缺 AND、直接只按 id 绕过均反击 1 | 精确一行 `id=2` |
| `002-B` 弱点确认 | 阶段 1；最终阶段 | `SELECT weakness FROM monsters WHERE id = 2 AND status = 'escaped';` | `weakness=focus` | 击杀后由身份结算恢复“水史莱姆”，水位降低一级 | 条件或列不完整时反击 1 | 只输出 `weakness`；使用两个过滤条件；SQL 结果不提前承载名字 |
| `003-A` 无主记录 | 无名宿舍触碰 ID #003 | `SELECT id FROM monsters WHERE room_id = 3 AND master_id IS NULL;` | `id=3` | 床牌由 `???` 变为 `NULL` | `= NULL` 给专项解释并反击 1 | 使用 `IS NULL`，结果唯一 |
| `003-B` 诅咒身份 | 阶段 1；最终阶段 | `SELECT name FROM monsters WHERE master_id IS NULL AND status = 'cursed';` | `name=毒史莱姆`，结算前暂存 | 击杀、揭名、获得空值提灯 | 漏状态导致多行时指出过滤不足 | NULL 与 status 均出现，最终才揭名 |
| `004-A` 回执分组 | 聚合档案室触碰 ID #004；单阶段即最终阶段 | `SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 4 GROUP BY channel;` | `echo,3`；`noise,1` | 回执按来源分组；击杀后恢复“铁史莱姆”；获得聚合战锤 | 别名、分组列或计数错误时反击 1 | 列为 `channel,total`，两组集合精确 |
| `005-A` 有效组 | 进入登记官 Boss；必修前置完成 | `SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 2;` | `echo,3`；`ward,2` | 注销规则护盾裂开；Boss 阶段 0→1 | WHERE/HAVING 混用时解释行与组区别 | 两组精确，必须含 GROUP BY/HAVING |
| `005-B` 恢复轨迹 | Boss 最终阶段 | `SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 3;` | `echo,3` | 停止注销、揭名“登记官”、规则改写、钥匙与证据结算 | 死亡回后篝火，Boss 本场阶段重置 | 只保留 echo；Boss 不以尸体消散收尾 |

### 6.2 生态复习 ID 006–009

| ID / 阶段 | 触发与输入 | 目标 SQL | 示例结果 | 状态与输出 | 失败兜底 | 验收 |
|---|---|---|---|---|---|---|
| `006-A` | 已掌握 SELECT 后在排水区随机遭遇；单阶段即最终阶段 | `SELECT name FROM monsters WHERE id = 6;` | `name=小水怪`，结算前暂存 | 一阶段击杀并揭名 | 错误反击 1；不授予新课程掌握 | 只复习已学 SELECT/FROM |
| `007-A` | 已掌握 WHERE 后在软泥区随机遭遇；单阶段即最终阶段 | `SELECT id FROM monsters WHERE room_id = 12 AND status = 'wet';` | `id=7` | 击杀后揭名“小史莱姆” | 多行或缺 AND 反击 1 | 精确返回 7 |
| `008-A` | 已掌握 IS NULL 后在仓窖随机遭遇；单阶段即最终阶段 | `SELECT name FROM monsters WHERE master_id IS NULL AND status = 'toxic';` | `name=灰史莱姆`，结算前暂存 | 击杀后揭名 | `= NULL` 显示专项解释 | 最终一阶段原子揭名 |
| `009-A` | 小型精英出现；已掌握 GROUP BY | `SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 9 GROUP BY channel;` | `echo,2`；`noise,2` | 铁壳破裂；阶段 0→1 | 分组结果错时反击 1 | 两组集合精确 |
| `009-B` | 精英最终阶段 | `SELECT name FROM monsters WHERE id = 9;` | `name=铁泥怪`，结算前暂存 | 击杀、3 XP、揭名 | 失败保留本场答题证据 | 最终才显示名字 |

## 7. 第二层逐怪逐阶段矩阵

### 7.1 主线怪物 ID 010–014

| ID / 阶段 | 触发与输入 | 目标 SQL | 示例结果 | 状态与输出 | 失败兜底 | 验收 |
|---|---|---|---|---|---|---|
| `010-A` 最强信号 | 白沙浅滩触碰 ID #010 | `SELECT channel FROM monster_signals WHERE monster_id = 10 ORDER BY charge DESC LIMIT 1;` | `channel=surge` | 第一盏浮标亮起；阶段 0→1 | ASC、漏 LIMIT 或多行时反击 1 | 最高 charge 对应 surge |
| `010-B` 前两航线 | 阶段 1；最终阶段 | `SELECT channel, charge FROM monster_signals WHERE monster_id = 10 ORDER BY charge DESC LIMIT 2;` | `surge,13`；`arc,11` | 两段航线出现；击杀后揭名“猎犬” | 顺序错误明确显示期望方向，不直接给答案 | 行顺序和 LIMIT 均正确 |
| `011-A` 不同水纹 | 月影湖触碰 ID #011；最终阶段 | `SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 11 ORDER BY channel;` | `echo`；`mirror` | 岛屿方向显形；击杀后揭名“水蛇” | 没 DISTINCT 或顺序错误时反击 1 | 两个不同值且有序 |
| `012-A` ID 与区域 | 古树桥触碰 ID #012 | `SELECT m.id, r.sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 12;` | `id=12, sector=forest` | 未知 ID 与区域之间出现唯一正确根系；不揭名 | 错键、缺表别名或字段来源不清时反击 1 | 两表有别名、连接键正确；输出列精确为 `id,sector`，不改名为 `monster_id` |
| `012-B` 身份与房间 | 阶段 1；最终阶段 | `SELECT m.name, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 12;` | `name=树妖, room_name=古树桥`，结算前暂存 | 桥完成、击杀、揭名“树妖” | 未限定两个 `name` 来源时给歧义错误 | 最终阶段才显示 `m.name`；房间 `name` 明确别名为 `room_name` |
| `013-A` 缺失右表 | 芦苇沼泽触碰 ID #013；最终阶段 | `SELECT m.id FROM monsters AS m LEFT JOIN monster_gear AS g ON m.id = g.monster_id WHERE m.room_id = 24 AND g.monster_id IS NULL;` | `id=13` | 无守卫门打开；击杀后揭名“毒蛙” | INNER JOIN、检查左表 NULL 或漏房间均反击 2 | LEFT JOIN 保留目标，右表 NULL |
| `014-A` 多区域证据 | 灯塔守卫 Boss；前置与湖兽完成 | `SELECT r.sector, COUNT(*) AS total FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE r.floor = 2 GROUP BY r.sector HAVING COUNT(*) >= 3 ORDER BY total DESC, r.sector ASC;` | `lake,4`；`swamp,4`；`forest,3` | 灯塔从单束改为三束；多数护盾失效 | 旧 `ambush/storm` 结果不再通过 | 内容数据与三地区结果一致，平局顺序稳定 |
| `014-B` 主透镜 | Boss 最终阶段 | `SELECT m.name, g.power FROM monsters AS m INNER JOIN monster_gear AS g ON m.id = g.monster_id WHERE m.id = 14 ORDER BY g.power DESC LIMIT 1;` | `name=灯塔守卫, power=21`，结算前暂存 | 关闭覆盖规则、七束光、揭名、钥匙与七页记录 | 死亡回后篝火，本场阶段重置 | 真名只在最终结算出现；最强 power 为 21 |

### 7.2 生态、精英与区域 Boss ID 015–022

第二层湖兽目标信号数据：

| `monster_id` | `channel` | `charge` |
|---:|---|---:|
| 21 | `deep` | 7 |
| 21 | `wake` | 11 |
| 21 | `wake` | 9 |
| 21 | `surge` | 14 |
| 21 | `surge` | 13 |

| ID / 阶段 | 触发与输入 | 目标 SQL | 示例结果 | 状态与输出 | 失败兜底 | 验收 |
|---|---|---|---|---|---|---|
| `015-A` | 湖区随机遭遇；单阶段即最终阶段 | `SELECT channel FROM monster_signals WHERE monster_id = 15 ORDER BY charge DESC LIMIT 1;` | `surge` | 击杀后揭名“水怪” | 错误反击 1 | 只复习 ORDER/LIMIT |
| `016-A` | 湖区随机遭遇；单阶段即最终阶段 | `SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 16 ORDER BY channel;` | `echo`；`mirror` | 击杀后揭名“水蛇” | 错误反击 1 | 只复习 DISTINCT |
| `017-A` | 泥沼随机遭遇；最终阶段 | `SELECT m.name, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 17;` | `name=青蛙, room_name=泥沼石径`，结算前暂存 | 击杀、揭名 | 错键或缺输出别名反击 1 | 一阶段最终查询原子揭名 |
| `018-A` | 泥沼小型精英 | `SELECT m.id FROM monsters AS m LEFT JOIN monster_gear AS g ON m.id = g.monster_id WHERE m.room_id = 34 AND g.monster_id IS NULL;` | `id=18` | 阶段 0→1 | 错误反击 2 | 找到右表缺失记录 |
| `018-B` | 精英最终阶段 | `SELECT name FROM monsters WHERE id = 18 AND status = 'toxic';` | `name=毒蛙`，结算前暂存 | 击杀、3 XP、揭名 | 死亡重置本场 | 最终才显示名字 |
| `019-A` | 林区随机遭遇；最终阶段 | `SELECT name, hp FROM monsters WHERE id = 19 ORDER BY hp DESC LIMIT 1;` | `name=猎犬, hp=13`，结算前暂存 | 击杀、揭名 | 错误反击 1 | WHERE、DESC、LIMIT 均正确 |
| `020-A` | 林区小型精英 | `SELECT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 20;` | `id=20, room_name=盘根林地` | 根系定位；阶段 0→1 | 错误反击 2 | `name` 只来自房间表；不在非最终阶段泄露怪物名，也不把主键改名为 `monster_id` |
| `020-B` | 精英最终阶段 | `SELECT m.name, r.sector AS room_sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 20 ORDER BY r.sector LIMIT 1;` | `name=树妖, room_sector=forest`，结算前暂存 | 击杀、3 XP、揭名 | 错误保留答题记录 | 最终原子揭名 |
| `021-A` 湖兽浮出 | 玩家选择挑战湖兽 | `SELECT channel, charge FROM monster_signals WHERE monster_id = 21 ORDER BY charge DESC LIMIT 2;` | `surge,14`；`surge,13` | 定位两次浮出时机；阶段 0→1 | 错误反击 2；可撤退 | 顺序与前两行精确 |
| `021-B` 真实波纹 | 区域 Boss 最终阶段 | `SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 21 ORDER BY channel;` | `deep`；`surge`；`wake` | 击败、5 XP、揭名“湖兽”、潮位降低 | 死亡恢复战前潮位和 Boss 阶段 | 退潮只在最终成功后提交 |
| `022-A` 无装备王 | 可选蛙王支线 | `SELECT m.id FROM monsters AS m LEFT JOIN monster_gear AS g ON m.id = g.monster_id WHERE m.id = 22 AND g.monster_id IS NULL;` | `id=22` | 阶段 0→1 | 错误反击 2；不阻塞主线 | LEFT JOIN 和右表 NULL 正确 |
| `022-B` 房间来源 | 可选 Boss 最终阶段 | `SELECT DISTINCT m.name, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE r.floor = 2 AND m.id = 22 ORDER BY m.id;` | `name=蛙王, room_name=泥冠宫`，结算前暂存 | 击杀、5 XP、揭名、藤甲确定奖励 | 死亡回最近篝火；支线仍可重试 | 最终才显示名字；排序使用已知 ID，避免用封存身份构造旁路 |

## 8. 四级渐进提示

### 8.1 通用规则

| 级别 | 目的 | 可以提供 | 不可以提供 |
|---:|---|---|---|
| H1 意图 | 帮玩家理解“要查什么” | 目标实体、结果含义 | SQL 片段、隐藏名字 |
| H2 结构 | 建立子句顺序 | `SELECT → FROM → WHERE` 等骨架 | 完整字段和值 |
| H3 字段 | 消除记忆负担 | 表、别名、字段、连接键、条件值 | 完整可复制 SQL |
| H4 完整语句 | 最后兜底 | 一条可直接执行的参考 SQL | 自动替玩家执行 |

规则：

- 每阶段固定四条，不再混用四条或五条。
- H1 最短，H4 最长。
- 请求提示不消耗生命、不推进敌方回合。
- 提示等级写入本场复盘。
- 下一阶段重置为 H0；装备提供的自动提示最多预开 H1。
- H4 使用后仍可正常通关，但复盘标记“参考完成”。

### 8.2 第一层提示脚本

| 阶段 | H1 | H2 | H3 | H4 |
|---|---|---|---|---|
| 001-A | 读取 ID #001 的弱点。 | 使用 `SELECT … FROM … WHERE …`。 | 表 `monsters`；列 `weakness`；条件 `id=1`。 | `SELECT weakness FROM monsters WHERE id = 1;` |
| 001-B | 读取最终身份字段。 | 仍使用单表 SELECT。 | 表 `monsters`；列 `name`；条件 `id=1`。 | `SELECT name FROM monsters WHERE id = 1;` |
| 002-A | 从房间和状态定位唯一 ID。 | `WHERE 条件1 AND 条件2`。 | 返回 `id`；`room_id=2`；`status='escaped'`。 | `SELECT id FROM monsters WHERE room_id = 2 AND status = 'escaped';` |
| 002-B | 确认目标记录的弱点。 | SELECT 一列，WHERE 两条件。 | `monsters.weakness`；`id=2`；`status='escaped'`。 | `SELECT weakness FROM monsters WHERE id = 2 AND status = 'escaped';` |
| 003-A | 找出房间里没有主人的 ID。 | 使用 `IS NULL`，不用等号。 | 返回 `id`；`room_id=3`；`master_id IS NULL`。 | `SELECT id FROM monsters WHERE room_id = 3 AND master_id IS NULL;` |
| 003-B | 从无主人且被诅咒的记录读取身份。 | `IS NULL` 与 `AND` 同时出现。 | 返回 `name`；`master_id IS NULL`；`status='cursed'`。 | `SELECT name FROM monsters WHERE master_id IS NULL AND status = 'cursed';` |
| 004-A | 按频道统计信号行数。 | WHERE 后 GROUP BY。 | `channel, COUNT(*) AS total`；`monster_id=4`。 | `SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 4 GROUP BY channel;` |
| 005-A | 保留数量不少于 2 的组。 | GROUP BY 后用 HAVING。 | `monster_id=5`；按 `channel`；`COUNT(*)>=2`。 | `SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 2;` |
| 005-B | 只保留更可靠的组。 | 保持原结构，提高 HAVING 阈值。 | 从 `monster_signals` 返回 `channel, COUNT(*) AS total`；过滤 `monster_id=5`；HAVING 阈值为 3。 | `SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 3;` |
| 006-A | 读取 #006 的身份。 | 使用单表 SELECT，并按 ID 过滤。 | 从 `monsters` 读取 `name`，过滤 `id=6`，结果只保留一行。 | `SELECT name FROM monsters WHERE id = 6;` |
| 007-A | 定位 #007。 | 使用 WHERE 连接两个条件。 | 从 `monsters` 返回 `id`；过滤 `room_id=12` 与 `status='wet'`。 | `SELECT id FROM monsters WHERE room_id = 12 AND status = 'wet';` |
| 008-A | 找出无主且有毒的身份。 | IS NULL + AND。 | 返回 `name`；`master_id IS NULL`；`status='toxic'`。 | `SELECT name FROM monsters WHERE master_id IS NULL AND status = 'toxic';` |
| 009-A | 统计 #009 的频道。 | 先按 ID 过滤，再用 GROUP BY 分组。 | 从 `monster_signals` 返回 `channel, COUNT(*) AS total`；过滤 `monster_id=9`。 | `SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 9 GROUP BY channel;` |
| 009-B | 读取最终身份字段。 | 单表 SELECT。 | `monsters.name`；`id=9`。 | `SELECT name FROM monsters WHERE id = 9;` |

### 8.3 第二层提示脚本

| 阶段 | H1 | H2 | H3 | H4 |
|---|---|---|---|---|
| 010-A | 取最高信号。 | ORDER BY DESC + LIMIT 1。 | 表 `monster_signals`；`monster_id=10`；按 `charge`。 | `SELECT channel FROM monster_signals WHERE monster_id = 10 ORDER BY charge DESC LIMIT 1;` |
| 010-B | 取前两条信号及强度。 | 读取两列，DESC，LIMIT 2。 | `channel,charge`；`monster_id=10`。 | `SELECT channel, charge FROM monster_signals WHERE monster_id = 10 ORDER BY charge DESC LIMIT 2;` |
| 011-A | 保留不同频道。 | 使用 SELECT DISTINCT，并对结果排序。 | 从 `monster_signals` 返回不同的 `channel`；过滤 `monster_id=11`；按 `channel` 升序。 | `SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 11 ORDER BY channel;` |
| 012-A | 把怪物 ID 接到房间区域。 | 两表别名 + INNER JOIN + ON。 | `m.room_id=r.id`；输出 `m.id,r.sector`；`m.id=12`。 | `SELECT m.id, r.sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 12;` |
| 012-B | 返回最终身份和具体房间。 | 保持连接，用输出别名区分两个 `name`。 | `m.name`；`r.name AS room_name`；`m.id=12`。 | `SELECT m.name, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 12;` |
| 013-A | 找出右表没有装备的怪物。 | LEFT JOIN 后检查右表 IS NULL。 | `m.id=g.monster_id`；`m.room_id=24`；`g.monster_id IS NULL`。 | `SELECT m.id FROM monsters AS m LEFT JOIN monster_gear AS g ON m.id = g.monster_id WHERE m.room_id = 24 AND g.monster_id IS NULL;` |
| 014-A | 统计可靠区域。 | 依次使用 JOIN、GROUP BY、HAVING、ORDER BY。 | 连接 `m.room_id=r.id`；过滤 `r.floor=2`；按 `r.sector` 分组；至少 3 条；`total` 降序、区域升序。 | `SELECT r.sector, COUNT(*) AS total FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE r.floor = 2 GROUP BY r.sector HAVING COUNT(*) >= 3 ORDER BY total DESC, r.sector ASC;` |
| 014-B | 定位 ID #014 的最强核心。 | JOIN 装备，DESC，LIMIT 1。 | 返回 `m.name,g.power`；`m.id=14`。 | `SELECT m.name, g.power FROM monsters AS m INNER JOIN monster_gear AS g ON m.id = g.monster_id WHERE m.id = 14 ORDER BY g.power DESC LIMIT 1;` |
| 015-A | 取最高湖面信号。 | DESC + LIMIT 1。 | `monster_id=15`；返回 `channel`。 | `SELECT channel FROM monster_signals WHERE monster_id = 15 ORDER BY charge DESC LIMIT 1;` |
| 016-A | 保留不同水纹频道。 | DISTINCT + ORDER BY。 | `monster_id=16`；返回 `channel`。 | `SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 16 ORDER BY channel;` |
| 017-A | 连接 #017 与房间。 | 使用 INNER JOIN，并在 ON 中写连接关系。 | 连接 `m.room_id=r.id`；过滤 `m.id=17`；输出 `m.name, r.name AS room_name`。 | `SELECT m.name, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 17;` |
| 018-A | 找到无装备的泥沼记录。 | LEFT JOIN + IS NULL。 | `m.room_id=34`；`g.monster_id IS NULL`。 | `SELECT m.id FROM monsters AS m LEFT JOIN monster_gear AS g ON m.id = g.monster_id WHERE m.room_id = 34 AND g.monster_id IS NULL;` |
| 018-B | 读取 #018 身份。 | 使用 WHERE 同时限制 ID 与状态。 | 从 `monsters` 返回 `name`；过滤 `id=18` 与 `status='toxic'`。 | `SELECT name FROM monsters WHERE id = 18 AND status = 'toxic';` |
| 019-A | 取 #019 的生命记录。 | 使用 WHERE、ORDER BY DESC 和 LIMIT 1。 | 从 `monsters` 返回 `name,hp`；过滤 `id=19`；按 `hp` 降序，只取一行。 | `SELECT name, hp FROM monsters WHERE id = 19 ORDER BY hp DESC LIMIT 1;` |
| 020-A | 连接 #020 与房间。 | 使用 INNER JOIN，并在 ON 中写连接关系。 | 连接 `m.room_id=r.id`；过滤 `m.id=20`；输出 `m.id, r.name AS room_name`。 | `SELECT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 20;` |
| 020-B | 返回最终身份和林地区域。 | 保持 JOIN，加排序与 LIMIT。 | `m.name`；`r.sector AS room_sector`；`m.id=20`。 | `SELECT m.name, r.sector AS room_sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 20 ORDER BY r.sector LIMIT 1;` |
| 021-A | 取湖兽最高的两条信号。 | DESC + LIMIT 2。 | `monster_id=21`；返回 `channel,charge`。 | `SELECT channel, charge FROM monster_signals WHERE monster_id = 21 ORDER BY charge DESC LIMIT 2;` |
| 021-B | 区分真实波纹频道。 | DISTINCT + ORDER BY。 | `monster_id=21`；返回不同 `channel`。 | `SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 21 ORDER BY channel;` |
| 022-A | 证明 ID #022 没有装备记录。 | LEFT JOIN + IS NULL。 | `m.id=22`；`g.monster_id IS NULL`。 | `SELECT m.id FROM monsters AS m LEFT JOIN monster_gear AS g ON m.id = g.monster_id WHERE m.id = 22 AND g.monster_id IS NULL;` |
| 022-B | 连接二层房间并读取最终身份。 | DISTINCT + INNER JOIN + ORDER BY。 | 输出 `m.name,r.name AS room_name`；`r.floor=2,m.id=22`；按 `m.id` 排序。 | `SELECT DISTINCT m.name, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE r.floor = 2 AND m.id = 22 ORDER BY m.id;` |

## 9. 判定管线

### 9.1 五道判定门

```text
G0 输入与策略
→ G1 SQLite 可执行
→ G2 必修语法特征
→ G3 结果契约
→ G4 战斗目标与世界提交
```

| 门 | 触发 / 输入 | 状态 | 输出 | 失败兜底 | 验收 |
|---|---|---|---|---|---|
| G0 策略 | 玩家执行 SQL | 只读层或第六层沙箱 | 规范化安全 SQL | 拒绝多语句、写操作、危险 pragma；不静默改写 | 只读题无法改变数据库 |
| G1 执行 | 规范化 SQL | SQLite WASM 可用 | columns、rows、plan、heat | 返回 SQLite 原始错误和中文定位 | 语法错误不伪装为结果错误 |
| G2 特征 | 可执行结果 | 本阶段 requiredFeatures | broken / remaining locks | 缺核心语法判为 `missing-concept` | 硬编码相同结果不能绕过 |
| G3 结果 | 已满足特征 | expected columns/rows/order | `exact` 或 `wrong-result` | 指出列、行、顺序或条件问题 | 等价写法通过，额外列/行不通过 |
| G4 提交 | exact | 当前目标、阶段、身份状态 | 命中、环境事件、结算 | 事件失败不重复扣血；可安全重放 | 状态提交幂等 |

### 9.2 等价 SQL

允许：

- 关键词大小写不同；
- 合理空格和换行；
- `AS` 关键字省略；
- 表别名使用其他合法名称；
- `COUNT(1)` 与 `COUNT(*)` 在语义等价且题目不专门训练写法时；
- `>= 2` 与 `> 1`；
- 不要求顺序的集合结果使用不同自然顺序。

不允许：

- `SELECT` 硬编码目标常量；
- `SELECT *` 返回多余列；
- 绕过要求的 JOIN、GROUP BY、DISTINCT 等核心；
- 结果相同但从错误表读取；
- 通过直接 `id` 过滤绕过 WHERE 双条件训练；
- 需要排序时返回无保证顺序；
- 输出别名不符合任务契约；
- 额外行、重复行或错误 NULL 侧。

### 9.3 错误分类

| 类型 | 玩家反馈 | 敌方行动 |
|---|---|---|
| 空输入 / 仅空白 | “还没有输入 SQL” | 不消耗回合，不反击 |
| 身份字段越权用于条件 / 排序 / 派生 | 固定“身份字段仍被封存” | 固定反击 1 次；不暴露行数或命中差异 |
| 只读策略错误 | 指出禁止的语句 | 反击 1 次 |
| SQLite 语法/字段错误 | 原始错误 + 表字段建议 | 反击 1 次 |
| 缺少核心语法 | 显示剩余锁 | 按怪物伤害反击 |
| 结果错误 | 指出期望列/行含义，不直接给 SQL | 按怪物伤害反击 |
| 世界事件提交失败 | “查询已记录，场景正在恢复” | 不二次反击；重试事件 |

## 10. 战斗循环

### 10.1 进入

| 项 | 触发 | 输入 | 状态 | 输出 | 失败兜底 | 验收 |
|---|---|---|---|---|---|---|
| 可见课程怪 | 玩家碰撞怪物 | 怪物 ID、当前位置 | 探索模式、非安全区 | 锁定单一目标并进入战斗 | 碰撞重复只创建一次战斗 | 不需要旁边按钮选怪 |
| 随机复习 | 合法移动后命中 2% | 已掌握课程池 | 安全步结束、非安全区 | 生成已学题怪物 | 30 步保底；不会出未学语法 | 统计概率和保底测试通过 |
| 区域/Boss | 玩家进入触发区或确认挑战 | 前置进度 | 世界状态满足 | 专用开场和阶段 | 可退出或撤退 | 不被普通随机遭遇替代 |

### 10.2 回合

```text
敌人预告意图
→ 玩家查看任务 / 字段 / 提示
→ 输入完整 SQL
→ 执行与判定
→ 成功：命中 + 阶段/世界变化
→ 失败：解释 + 反击
→ 最终成功：名字、XP、掉落、图鉴、环境结算
```

阶段锁优先于普通 HP：

- 非最终正确查询至少保留怪物 1 HP；
- 最终阶段正确查询必定结束该战斗；
- 高伤武器不能跳过题目阶段；
- Boss HP 是压力和演出表达，不决定所需正确查询次数；
- 同一阶段不会因重复提交同一正确查询而重复结算。

### 10.3 伤害与经验

| 类别 | 错误反击 | XP |
|---|---:|---:|
| 普通怪 | 1 | 1 |
| 小型精英 | 1–2，第一层不超过 1 | 3 |
| 区域 Boss | 2 | 5 |
| 楼层 Boss | 1–2 | 5 |

初始生命为 2。升级阈值继续使用 `2、4、6、8、12、16、20、24`。

查询热量：

- 保留为装备与查询计划反馈；
- 不作为第一、第二层通关硬门槛；
- 达到上限不会锁死输入；
- 武器和遗物可减少增长；
- UI 必须解释本次增加量来源；
- 热量系统不能掩盖 SQL 错误反馈。

## 11. 撤退、死亡与篝火

### 11.1 撤退

目标契约：

| 字段 | 规则 |
|---|---|
| 触发 | 战斗面板点击“撤退到复活点” |
| 输入 | 当前战斗快照、当前复活点 |
| 状态 | 任意普通、精英、区域 Boss 或楼层 Boss 战斗 |
| 输出 | 返回最近休息篝火；未休息则返回出生安全区 |
| 战斗处理 | 放弃本场未结算阶段，怪物 HP 和阶段恢复至入战快照 |
| 玩家处理 | 保留当前 HP、护甲、装备、XP 和永久课程 |
| 失败兜底 | 复活点不可达时使用出生安全区 |
| 验收 | 不获得经验、名字、掉落、环境变化或课程完成 |

当前“撤退后保留怪物剩余 HP”行为标为 `DEPRECATED`。

### 11.2 死亡

```text
生命归零
→ YOU DIED
→ 回到最近休息篝火 / 出生安全区
→ 玩家恢复满生命与护甲
→ 怪物保留死亡瞬间的剩余 HP
→ 本场阶段、阶段性演出和未提交世界状态恢复至入战快照
→ 打开本场死亡复盘
→ 玩家确认后重新探索
```

保留：

- 已完成课程；
- 已获得装备、钥匙和证据；
- XP、等级和永久图鉴；
- 本场错误 SQL、错误类别、提示使用；
- 战斗前已完成的世界变化。
- 怪物死亡瞬间的剩余 HP。

不保留：

- 本场未完成阶段；
- 本场阶段性护盾、部位和视觉 HP；
- 尚未提交的退潮、开门、揭名或掉落。

说明：

- 怪物剩余 HP 与课程阶段是两类状态；死亡可以保留前者，但不能让玩家跳过后者。
- 非最终阶段正确查询仍执行“至少保留 1 HP”的阶段锁；即使复活后怪物只剩 1 HP，也必须重新完成
  本场尚未提交的阶段。
- 撤退仍按 11.1 回滚至入战 HP，不与死亡规则混用。

### 11.3 篝火

| 触发 | 输入 | 状态 | 输出 | 失败兜底 | 验收 |
|---|---|---|---|---|---|
| 靠近实体篝火按 E | 当前生命、护甲、位置 | 非战斗 | 打开“在此休息 / 答案复盘” | 离开不改变复活点 | 菜单可键盘与触屏操作 |
| 在此休息 | 当前篝火 ID | 篝火菜单 | 满血满甲并更新复活点 | ID 失效则不写状态 | 死亡和撤退回到该点 |
| 答案复盘 | 本层 answerHistory | 篝火菜单 | 按概念、阶段、错误分类展示 | 无记录时给学习路线 | 不泄露未打怪物答案 |

## 12. SQL 到世界的输出协议

每次正确阶段必须发出至少一个语义事件：

```text
query-accepted
stage-advanced
combat-hit
environment-changed
story-evidence-added
identity-recovered
lesson-completed
boss-rule-changed
```

第一层映射：

| 课程 | 世界输出 |
|---|---|
| SELECT | 水轮启动、栈桥出现 |
| WHERE | 水位降低 |
| IS NULL | 床牌显形 |
| GROUP BY | 回执按来源归档 |
| HAVING | 登记规则改写 |

第二层映射：

| 课程 | 世界输出 |
|---|---|
| ORDER BY / LIMIT | 浮标按优先级点亮、小船靠岸 |
| DISTINCT | 重复水纹合并、不同方向保留 |
| INNER JOIN | 树根形成正确桥 |
| LEFT JOIN / IS NULL | 无守卫门打开 |
| 湖兽 | 潮位下降、船闸可用 |
| 综合 JOIN | 灯塔由单束改为多束 |

事件必须幂等：读档、重新订阅 UI 或切回页面不会重复发奖励。

## 13. Boss 课程机制

### 13.1 登记官

| 字段 | 契约 |
|---|---|
| 触发 | WHERE、IS NULL、GROUP BY 完成并进入登记大厅 |
| 输入 | ID #005 的 `monster_signals` |
| 状态 | `registry=awake`，Boss 阶段 0 |
| 输出 | 阶段 1 破除“无当前记录即注销”；阶段 2 接受恢复轨迹 |
| 失败兜底 | 反击“注销印”；死亡回后篝火并重置本场 |
| 验收 | 玩家通过 GROUP/HAVING 改规则，Boss 不以单纯死亡表现 |

### 13.2 湖兽

| 字段 | 契约 |
|---|---|
| 触发 | 看见深潭后主动挑战 |
| 输入 | ID #021 的多条波纹信号 |
| 状态 | `tide=high` |
| 输出 | 排序定位浮出时机，去重确认真实波纹，最终 `tide=low` |
| 失败兜底 | 可撤退；死亡恢复战前潮位 |
| 验收 | DISTINCT 不再对单一 status 做无意义去重 |

### 13.3 蛙王

| 字段 | 契约 |
|---|---|
| 触发 | 沉水村落支线 |
| 输入 | 怪物、装备、房间三类证据 |
| 状态 | 可选，不阻塞主线 |
| 输出 | 找到无装备记录并连接来源；藤甲确定奖励 |
| 失败兜底 | 返回篝火后可重试 |
| 验收 | 不授予主线课程替代，不随机掉装备 |

### 13.4 灯塔守卫

| 字段 | 契约 |
|---|---|
| 触发 | 必修完成、湖兽击败、船闸开启 |
| 输入 | 第二层地区统计与 ID #014 装备核心 |
| 状态 | `lighthouse=majority-only` |
| 输出 | 证明多个地区均有可靠记录，关闭覆盖规则，恢复名字 |
| 失败兜底 | 死亡回后篝火，七页记录不提前授予 |
| 验收 | 旧“丛林王”名字、结果和攻击文本不再出现 |

## 14. 旧设计决策

| 旧设计 | 决策 | 原因 / 目标改造 |
|---|---|---|
| 浏览器内真实 SQLite | 保留 | 核心产品价值 |
| 完整 SQL 而非填空 | 保留 | 支持学习迁移 |
| 语法锁 + 结果判定 | 保留 | 防止硬编码和绕过知识点 |
| 逐阶段伤害、最终阶段击杀 | 保留 | 控制学习节奏 |
| 初始 2 HP、XP 阈值 | 保留 | 已有平衡契约 |
| 2% 随机遭遇、30 步保底 | 保留 | 低打扰复习 |
| 题目自动从 `answerSql` 反推表角色 | 改造 | 改为显式 Task Contract |
| 四条或五条提示混用 | 废弃 | 统一四级、由短到长 |
| `查询 id=12 的 name 与 sector` | 废弃 | 字段归属和别名不清 |
| SELECT 第一击直接显示史莱姆 name | 废弃 | 名字提前泄露 |
| WHERE 使用未发现的名字作为过滤值 | 废弃 | 要求玩家记忆未知信息 |
| INNER JOIN 第一阶段返回 `m.name` | 改造 | 非最终阶段改为 `m.id`；如需地点信息，只查询 `r.sector` 或 `r.name AS room_name` |
| 最终 name 查询立即渲染结果 | 改造 | 原始结果延迟到身份结算 |
| 湖兽对单一 status 使用 DISTINCT | 废弃 | 改为多条波纹信号 |
| 灯塔 Boss 返回 `ambush/storm` | 废弃 | 改为 `lake/swamp/forest` |
| 丛林王 Boss | 废弃 | 同一 ID/课程槽重构为灯塔守卫 |
| 撤退保留怪物部分 HP | 废弃 | 按产品契约放弃本场未结算进度 |
| 死亡保留怪物部分 HP | 保留并规范 | 保留剩余 HP；重置未提交阶段、演出和世界变化，且阶段锁仍生效 |
| 把怪物主键输出改名为 `monster_id` | 废弃 | 主表定位一律展示 `monsters.id` / `m.id`；`monster_id` 只用于信号与装备明细外键 |
| 错误统一一句反击 | 改造 | 区分策略、语法、缺概念、错结果 |

## 15. 数据、遥测与复盘

每次提交记录：

- floor、monster_id、stage_id、round；
- 玩家 SQL；
- SQLite 是否执行；
- 错误分类；
- 使用到的 features；
- expected / actual 列和行摘要；
- hint_level；
- 战斗结果；
- 造成和受到的伤害；
- 是否撤退或死亡；
- 是否发生世界事件和身份恢复。

隐私与体积：

- 只保存在本地；
- 单 Run 保留最近 200 条；
- 图鉴跨 Run 只保留身份 ID，不复制完整答案；
- 管理员预览不写正式答题记录。

篝火复盘至少回答：

1. 哪个概念错误最多；
2. 是语法错、缺核心还是结果错；
3. 哪张表和哪个字段最容易混淆；
4. 哪一题使用了 H4；
5. 下一次应先复习什么。

## 16. 验收与测试

### 16.1 内容静态检查

- F1/F2 每个阶段有唯一 ID；
- 每阶段恰好四条提示；
- H4 是可执行完整 SQL；
- 任务中的表、字段、别名均存在；
- expected columns 与示例结果一致；
- 所有最终身份阶段显式标记 `revealOnSuccess`；
- 非最终阶段没有未发现目标的 `monsters.name`；
- 每个世界效果有唯一事件 ID。

### 16.2 判定自动化

- 参考 SQL 全部通过；
- 大小写、空格、等价别名通过；
- 硬编码、错误来源表、额外列、额外行不通过；
- `= NULL`、错误 JOIN 键、LEFT/INNER 混淆有专项反馈；
- 排序题验证行顺序；
- 聚合题验证列别名与集合；
- 越权身份条件、排序与派生在 SQLite 前统一拒绝，错误结果隐藏值与行数；
- 最终 name 只在 identity-recovered 后渲染；
- 重复事件不会重复 XP、掉落或揭名。

### 16.3 流程集成

第一层：

- 001 至 005 完整通过；
- 水轮、水位、床牌、回执和登记规则依次改变；
- 捷径回访后 Boss 可进入；
- 死亡、撤退、读档不会破坏阶段。

第二层：

- 010 至 014 完整通过；
- 012 第一阶段明确 `m.id` 与 `r.sector` 的来源，不把主键改名为 `monster_id`；
- 012 最终阶段明确两个 `name` 来源，并把房间名输出为 `room_name`；
- 湖兽排序/去重后退潮；
- 船闸回访后进入灯塔；
- 灯塔返回 `lake/swamp/forest`，不返回旧技术区域名。

### 16.4 UI 与可访问性

- 320 px 宽度能看到目标、表、字段、输入和执行按钮；
- 全键盘可请求提示、执行、撤退和关闭；
- 触屏不依赖 Q+S；
- Reduced Motion 下仍能理解阶段、伤害、名字和环境变化；
- 色盲模式不只靠颜色表示正确和错误；
- 页面隐藏恢复后不会重复执行查询或世界事件。

### 16.5 停止条件

出现以下任一情况，不继续铺第三层内容：

- 任一 F1/F2 题仍用不明确的 `name / sector / id`；
- 名字在最终结算前出现在可见结果；
- SQL 成功仍只有伤害，没有世界输出；
- Boss 只通过增加 HP 延长；
- 死亡或读档造成奖励重复；
- H1 已经接近完整答案；
- 参考 SQL 与真实 SQLite 数据不一致。
