# SQL 魔王城 · SELECT * FROM DUNGEON

**简体中文** | [English](README.en.md)

`game/` 是可独立运行的浏览器游戏，使用 TypeScript、Vite、Phaser 和 SQLite WASM 构建。它离线优先，不依赖可选的 Python Agent 或 Node.js 在线状态服务。

## 本地运行

要求 Node.js `>=20.19`、pnpm `11.9.0`。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

在浏览器打开 Vite 输出地址。需要本地验收生产构建时：

```bash
pnpm build
pnpm preview
```

不要用 `file://` 直接打开 `index.html`，SQLite WASM 必须通过 HTTP 加载。

## 游戏流程

1. 探索确定性的 `56x42` 楼层并揭开迷雾。
2. 触碰带编号的怪物，进入单体 SQL 战斗。
3. 阅读任务和可见 Schema，写出完整的 SQLite 语句。
4. 正确结果造成伤害；错误结果触发已经预告的反击。
5. 在篝火休息、领取课程奖励、恢复怪物身份并解锁上行路线。

## 内容

八层课程从基础筛选逐步进入查询安全：

| 层 | 地区 | 重点 |
|---:|---|---|
| 1 | 地下余烬档案 | `SELECT`、`WHERE`、`IS NULL`、聚合 |
| 2 | 潮汐群岛 | 排序、去重、连接 |
| 3 | 白霜墓原 | 关系查询与集合查询 |
| 4 | 元素升炉 | 子查询与 CTE |
| 5 | 黑铁外城 | 窗口函数与排名 |
| 6 | 龙脊工坊 | 受控 DML 与事务 |
| 7 | 残照索引园 | 索引与查询计划 |
| 8 | 黑金高堂 | 并发、迁移与查询安全 |

抄写员与《失名录》把课程串成一条上行剧情，最终记录是 `MIGRATE`。

## 操作

| 操作 | 键盘 | 触屏 |
|---|---|---|
| 移动 | `WASD` / 方向键 | 方向按钮 |
| 调查、休息、开门、拾取 | `E` | `E` 按钮 |
| 打开 SQL 终端 | `Q + S` | `SQL 战斗` |
| 执行查询 | `Ctrl/Cmd + Enter` | 执行按钮 |
| 背包 | `B` | 背包按钮 |
| 关闭界面 | `Esc` | 关闭按钮 |

## 数据与隐私

本局状态、熟练度、恢复的怪物名字和最多 200 条 SQL 作答记录保存在浏览器本地，无需账号或服务器。只有在明确配置 `VITE_AGENT_URL` 时，可选 Agent 才会收到受限的当前层证据；它不会收到隐藏答案或完整游戏状态。

## 验证

```bash
pnpm test
pnpm architecture:check
pnpm build
```

公开下载包只保留本工程和运行时资源；详细设计稿、制作记录和预览录音不随游戏发布。文档边界见 [`docs/README.md`](docs/README.md)。

## 许可

见仓库根目录的 [LICENSE](../LICENSE) 与 [ATTRIBUTIONS.md](../ATTRIBUTIONS.md)。
