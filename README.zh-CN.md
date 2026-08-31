# SELECT * FROM DUNGEON

<div align="center">

<p><a href="https://kkkirito-123.github.io/Select-From-Dungeon/"><strong>在线试玩 / Online Demo</strong></a></p>

<img src="assets/screenshots/exploration.png" alt="SELECT * FROM DUNGEON 探索画面" width="100%" />

### 在地下城里探索、学习并用 SQL 求生

<p>
  <a href="game/"><img src="https://img.shields.io/badge/游玩-浏览器游戏-151a24?style=flat-square" alt="浏览器游戏" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-d7ad55?style=flat-square" alt="MIT License" /></a>
  <a href="game/package.json"><img src="https://img.shields.io/badge/Node.js-%3E%3D20.19-78c9b8?style=flat-square" alt="Node.js 版本" /></a>
</p>

**简体中文** | [English](README.en.md)

</div>

## 项目简介

`SELECT * FROM DUNGEON` 是一款离线优先的中文浏览器 SQL 肉鸽游戏。SQL 就是战斗动作：玩家探索确定性的像素迷宫，遇到只显示编号的怪物，写出完整的 SQLite 查询来击破防御。正确结果会转化为动画攻击；错误结果会触发可读的反击，并给出下一条线索。

游戏可直接在本地浏览器运行，无需账号、数据库服务器或 AI 服务。可选的 Agent 与在线状态服务只增加陪伴文案和标签页计数，不影响核心流程。

## 游戏画面

<div align="center">
  <img src="assets/screenshots/sql-combat.png" alt="SQL 战斗遭遇" width="49%" />
  <img src="assets/screenshots/query-terminal.png" alt="SQL 查询终端" width="49%" />
</div>

## 核心功能

- 探索八层确定性的 `56x42` 迷宫：迷雾、小地图、路线提示、篝火、捷径、门、地标和区域状态共同组成实际路线。
- 使用真实 SQLite WASM 战斗：每场遭遇都展示任务、Schema、关系、渐进提示和命中所需的结果。
- 按课程逐步学习 SQL：从 `SELECT`、`WHERE` 进入 JOIN、子查询、CTE、窗口函数、受控 DML、索引与迁移概念。
- 维护永久怪物图鉴：击败前只看稳定 ID，最后一击才恢复名字并写入图鉴。
- 在篝火休息、设置复活点、查看本地作答复盘、管理装备；撤退不会重置本局进度。
- 支持键盘与触屏。默认情况下，本局、熟练度与复盘记录都只保存在浏览器本地。

## 八层内容

| 层 | 地区 | SQL 重点 |
|---:|---|---|
| 1 | 地下余烬档案 | `SELECT`、`WHERE`、`IS NULL`、`GROUP BY`、`HAVING` |
| 2 | 潮汐群岛 | `ORDER BY`、`LIMIT`、`DISTINCT`、`INNER JOIN`、`LEFT JOIN` |
| 3 | 白霜墓原 | 自连接、三表连接、`UNION`、关系审计 |
| 4 | 元素升炉 | 标量 / `IN` / `EXISTS` / 相关子查询、CTE |
| 5 | 黑铁外城 | 窗口函数、分区、排名、Frame、Top-N |
| 6 | 龙脊工坊 | 受控 `INSERT`、`UPDATE`、`DELETE`、事务、保存点 |
| 7 | 残照索引园 | B-tree、覆盖索引、`EXPLAIN QUERY PLAN` |
| 8 | 黑金高堂 | MVCC、锁、隔离、建模、复制、分片与查询安全 |

八层路线由作者固定。必修题、关键道具、剧情证据和最终路线不会因为随机 Seed 缺失。

## 剧情

这座地下城是一座失去名字的档案库。抄写员从地下余烬档案开始陪玩家上行，每一层都揭开数据谱系的一段断裂：异常、复数、关系、依赖、顺序、责任、判断，最后是迁移。

每次完成课程，都会修复《失名录》的一段内容。篝火记录、实体 SQL 密文门、恢复的怪物身份和不断变化的迷宫把查询练习串成一场调查。抵达黑金高堂后，所有记录汇聚到唯一结局：`MIGRATE`。

## 本地运行

要求 Node.js `>=20.19`、pnpm `11.9.0`。

```bash
cd game
pnpm install --frozen-lockfile
pnpm dev
```

在浏览器打开 Vite 输出地址。需要本地验收生产构建时，执行 `pnpm build` 后再执行 `pnpm preview`。不要用 `file://` 直接打开 `index.html`，SQLite WASM 需要通过 HTTP 加载。

## 操作

| 操作 | 键盘 | 触屏 |
|---|---|---|
| 移动 | `WASD` / 方向键 | 方向按钮 |
| 调查、休息、开门、拾取 | `E` | `E` 按钮 |
| 打开 SQL 终端 | `Q + S` | `SQL 战斗` |
| 执行查询 | `Ctrl/Cmd + Enter` | 执行按钮 |
| 背包 | `B` | 背包按钮 |
| 关闭界面 | `Esc` | 关闭按钮 |

## 仓库结构

| 目录 | 用途 |
|---|---|
| [`game/`](game/) | 独立浏览器游戏与 Vite 构建 |
| [`agent/`](agent/) | 可选的只读 Python 篝火、抄写员和 Main 服务 |
| [`presence/`](presence/) | 可选的 Node.js SSE 在线标签页计数服务 |
| [`assets/screenshots/`](assets/screenshots/) | 本 README 使用的公开游戏截图 |

可选服务不是完整游玩所必需的。游戏包、构建命令和隐私边界见 [`game/README.md`](game/README.md)。

## 许可

原创代码和文字采用 [MIT License](LICENSE)。第三方运行时声明与资源归因见 [ATTRIBUTIONS.md](ATTRIBUTIONS.md)。
