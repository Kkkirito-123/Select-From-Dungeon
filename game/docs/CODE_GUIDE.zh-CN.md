# 代码与数据结构说明

这份说明把浏览器游戏从入口到规则、存储和界面的调用关系串起来，并给出常见 JSON
文件的字段示例。JSON 标准本身不允许 `//` 或 `/* ... */` 注释，因此示例保持合法
JSON，字段解释写在代码块外。

## 一次启动如何组装游戏

入口是 `src/application/main.ts`，它只做依赖组装，不应该在这里增加战斗规则：

```text
index.html
  -> application/main.ts
     -> 读取 localStorage / 试玩内存存储
     -> 加载并校验 question-bank-manifest.json
     -> 创建 GameSession（规则状态）
     -> 创建 SqlEngine（内存 SQLite）
     -> 创建 AppShell（DOM）和 Phaser Game（画面）
     -> 启动持久化、页面可见性和事件总线
```

可以把各层理解为四个方向：

- `contracts/`：跨模块共享的类型和版本契约，只描述数据形状。
- `domain/`：规则的事实来源，例如移动、战斗、课程判定和升级。
- `application/`：启动、配置、事件编排和可选 Agent 运行时。
- `presentation/`：DOM/Phaser 渲染与用户输入，不应复制一份规则。

一次 SQL 战斗的核心路径是：

```text
textarea
  -> queryPolicy 校验只读边界
  -> SqlEngine 执行 SQLite + EXPLAIN QUERY PLAN
  -> lessonEvaluator 检查特征、知识锁和结果语义
  -> GameSession 提交命中/反击、XP、课程和答题记录
  -> snapshot 通知 AppShell、DungeonScene 和存档协调器
```

## 题库 manifest

文件：`public/data/question-bank-manifest.json`

```json
{
  "bankVersion": "question-bank-v1",
  "schemaVersion": 2,
  "url": "data/question-bank-v1.sqlite",
  "byteLength": 1048576,
  "sha256": "51b5a5e9c4bbff5d65b442fc18eaec0273f313763c35c2e7aeb39209feac5106",
  "questionCount": 960
}
```

- `bankVersion`：题库内容版本。旧 Run 会保存这个值，保证刷新后仍使用同一套题。
- `schemaVersion`：SQLite 题库表结构版本，字段改变时必须递增并更新配置。
- `url`：相对于 Vite `BASE_URL` 的资源路径，不写主机名。
- `byteLength` 与 `sha256`：下载后分别检查长度和摘要，防止截断或内容替换。
- `questionCount`：启用题目的数量。加载器会拒绝行数不匹配的数据库。

生成器按 `monstersForFloor(floor)` 为每层建立独立 SQL fixture，并校验
`monster_signals.monster_id`、`monster_gear.monster_id` 和 `master_id` 的引用闭包；
绑定旧 v2 的 v12 Run 在加载时迁移到 v1，清空活动练习绑定并重置牌组游标，同时保留世界状态和答题历史。

加载顺序在 `questionBankLoader.ts` 中固定为：

1. 下载 manifest 并比对版本、路径、结构版本和题目数量。
2. 检查 IndexedDB 缓存的长度和 SHA-256。
3. 缓存失效时下载 SQLite，验证通过后写入缓存。
4. 用 sql.js 打开内存数据库，只读取 `enabled = 1` 的题目。
5. 把 `hints_json`、`expected_rows_json` 等 TEXT 字段解析成领域对象。

## 楼层资源 manifest

文件：`public/assets/floors/01-ember-archive/manifest.json`

```json
{
  "schemaVersion": 1,
  "floor": 1,
  "id": "01-ember-archive",
  "theme": "地下余烬档案",
  "sources": [
    {
      "id": "0x72-dungeontileset-ii",
      "title": "16x16 DungeonTileset II",
      "license": "CC0-1.0",
      "sourceRecord": "../../../../assets/vendor/0x72-dungeontileset-ii/source.json",
      "attributionRequired": false
    }
  ],
  "textures": [
    {
      "key": "f01-cc0-floor",
      "runtimePath": "sources/0x72-dungeontileset-ii/atlas-floor-16x16.png",
      "bytes": 3023,
      "sha256": "0f12a514fa61cd82db9cd9f61371c22f715cd3d34de28fb488cfe1f76a49fbe1",
      "dimensions": "112x112",
      "frame": "16x16"
    }
  ]
}
```

这里的 `sources` 是授权与归属记录，`textures` 是运行时文件索引。`runtimePath`
指向 `public/` 内最终发布的位置，`sourcePath`（完整文件中还包含）指向仓库里的
作者源。资源校验脚本会比较 `bytes` 和 `sha256`，不能手工修改已生成文件来绕过它。

## Profile 与 Run 的 JSON 边界

`profileCodec.ts` 负责永久 Profile 的编码，`runCodec.ts` 负责 Run 的编码，真正的
结构验证和旧版本迁移由 `localProgress.ts` 完成。一个 Profile 的字段关系如下：

```json
{
  "version": 3,
  "masteredLessons": ["select", "where"],
  "attempts": {
    "select": 4,
    "where": 2,
    "is-null": 0
  },
  "discoveredMonsterIds": [1, 2],
  "victories": 3,
  "bestRunQueries": 18
}
```

- `masteredLessons` 是永久掌握的课程 ID；它不是当前 Run 的临时课程进度。
- `attempts` 为每个课程累计尝试次数，值必须是非负整数。
- `discoveredMonsterIds` 是已回收名字的怪物编号，不能重复。
- `bestRunQueries` 可以是 `null`，表示尚未产生有效记录。

Run 的顶层通常包含 `version`、`graph`、`mazeFloor`、`player`、`monsters`、
`answerHistory` 等字段。不要直接编辑浏览器中的 Run：读取时会先经过 JSON 解码、
版本验证和迁移，再交给 `GameSession` 恢复。

## SQL Schema 与 JOIN 关系

`content/sql/sqlSchema.ts` 是唯一 Schema 来源。当前四张教学表及关键关系为：

```text
monsters(id, room_id, name, species, hp, armor, status, weakness, master_id, is_boss)
monster_signals(id, monster_id, channel, charge)
rooms(id, name, sector, floor)
monster_gear(id, monster_id, gear_name, power)
```

常用连接条件：

```sql
-- 怪物所在房间
SELECT m.id, r.name
FROM monsters AS m
INNER JOIN rooms AS r ON r.id = m.room_id;

-- 保留没有装备记录的怪物
SELECT m.id
FROM monsters AS m
LEFT JOIN monster_gear AS g ON g.monster_id = m.id
WHERE g.monster_id IS NULL;
```

`SQL_RELATIONS` 中的关系是课程提示和自动补全依据；它们描述教学上的关联，不等同于
SQLite 已声明的 `FOREIGN KEY` 约束。`monster_id` 只在明细表中作为关联字段，怪物主表
的主键始终是 `monsters.id`。

## 持久化为什么区分立即保存和延迟保存

`progressPersistence.ts` 为每个快照生成轻量指纹：

```json
{
  "mode": "explore",
  "queryCount": 6,
  "itemIds": "loot-2|sword-1",
  "inventoryState": "{\"weapon\":\"filter-bow\",\"armor\":null,\"armorHp\":0,\"equipment\":[\"filter-bow\"],\"consumables\":[[\"minor-potion\",2]]}",
  "topologyHash": 18392041
}
```

查询回合、模式、物品、背包或地图拓扑变化会立即 `flush()`；连续普通移动只启动
短 debounce 定时器，定时器到期时保存最后一个快照。进入管理员预览时会冻结正式存档，
退出预览后再恢复正常写入。

## 注释约定

- 类型和接口注释说明“数据代表什么、谁拥有它、是否持久化”。
- 函数注释说明输入、输出以及副作用边界；纯函数要明确“不访问 DOM/存储”。
- JSON 字段保持标准格式，不在 `.json` 文件中加入注释；示例的字段解释放在 Markdown。
- 复杂分支旁解释决策原因，例如为什么使用缓存回退、为什么创建 SQLite 临时副本，
  而不是逐行复述 `if` 的语法。
