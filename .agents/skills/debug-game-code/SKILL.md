---
name: "debug-game-code"
description: "调试游戏代码时，先用 .maintainer/architecture-map.json 定位故障职责，再复用已读行范围取得最小源码证据；适用于游戏故障诊断与修复，不用于架构地图生成或 Benchmark 评估。"
---

# 调试游戏代码

先用游戏自有的机器架构地图缩小范围，再读取最少的源码来确认故障归属。地图负责选择职责范围；本 Skill 的覆盖脚本只负责跳过已经读取的行。源码、调用流和测试才决定修改位置。

## 权威与入口

1. 先读仓库根和最近的 `AGENTS.md`；需要实施修改时，继续遵守当前 Task、Architecture 和批准边界。
2. 优先用 `inspect(action=read)` 读取 `.maintainer/architecture-map.json`；没有 `inspect` 时使用当前环境已有的有界文件读取工具。不要在读地图前全仓搜索。
3. 只接受 `schemaVersion=4`、`contractId=dungeon.game.architecture`、`projectRoot=game` 的核心地图。地图缺失或核心字段非法时执行“安全回退”。

## 按职责定位

1. 从用户目标、稳定复现和玩家可见现象提取症状，不用临时搜索 query 改写任务目标。
2. 在 `features` 中比较 `responsibility` 和 `signals`，并用 `negativeSignals` 排除误匹配。只有一个明显匹配项时才选择该 feature；并列或无匹配时执行安全回退。
3. 按 `primary -> adjacent -> shared -> fallback` 一层一层扩大。将 route 中的稳定 ID 解析到 `areas` 或 `partitions` 的 `root`，只在当前层目录内使用 `inspect(action=bundle)` 或当前环境已有的有界搜索工具。
4. 当前层已经找到职责所有者、故障实现或明确调用边时立即停止扩张。随后只补所属测试、显式 import 或直接调用方；不要沿 `neighbors` 递归展开。
5. 用户给出明确路径时优先检查该路径，但仍用最近的 area/partition 校验职责。只有楼层作者内容确实相关时才读取对应 `floorScopes`；楼层范围不能取代 feature 路由。

首轮定位只需要这些字段：

- `features[].id/responsibility/notResponsibleFor/signals/negativeSignals/route`
- `areas[].id/root/responsibility/notResponsibleFor`
- `partitions[].id/root/responsibility/notResponsibleFor`
- 必要时的 `floorScopes[].floor/roots/signals/sharedPartitions/contentRefs/serviceRefs/featureRefs`
- `maintenancePolicy.invalidCore`

不要为首轮定位读取或扩展 `neighbors`、`serviceProviders`、`contentRefs`、完整文件树或 Benchmark 隐藏数据。

## 复用已读源码

先完成地图路由并得到已知文件与待读范围，再处理读取去重。覆盖脚本不选择 feature、不枚举文件、不返回源码，也不决定修改位置。

按当前工具能力选择一种去重方式：

| `inspect` Evidence | Node | 去重方式 |
|---|---|---|
| 有 | 任意 | 只依赖 `ALREADY_SEEN`、`covered=` 和 `receiptOnly=true`，不运行覆盖脚本 |
| 无 | 有 | 使用覆盖脚本规划未读范围，再用当前有界读取工具读取 |
| 无 | 无 | 在当前上下文人工维护已读范围，不申请开放 shell |

使用 `inspect` 时，不要先 `search` 再用同一 query 调 `bundle`；首次源码定位直接使用有界 `bundle`。收到 `[CACHE HIT ALREADY_SEEN]`、`covered=` 或 `receiptOnly=true` 后，不再请求同一文件版本的同一范围。

没有 `inspect` Evidence、但能执行 Node 时，在读取已知文件前调用本 Skill 的从属脚本：

```text
node .agents/skills/debug-game-code/scripts/read-coverage.mjs plan --session <task-id> --path <repo-relative-path> --start-line <n> --line-count <n>
```

- `line-count` 必须为 `1..160`；更大的范围拆成多次请求。
- `fullyRead=true`：不再读取该范围。
- `fullyRead=false`：只读取 `unread` 返回的范围。
- 真实源码成功展示后，逐个记录覆盖范围：

```text
node .agents/skills/debug-game-code/scripts/read-coverage.mjs record --session <task-id> --path <repo-relative-path> --start-line <n> --line-count <n>
```

读取被截断或无法确认 EOF 时，只记录实际显示的连续行。明确到达 EOF 时，记录原始请求范围，即使文件实际行数更少；这样不存在的尾部不会被反复规划为未读。同一 session 的 `plan`/`record` 串行调用。状态保存在系统临时目录，按仓库与会话隔离；文件 Hash 改变后只失效该文件。

## 安全回退

以下任一情况发生时，说明原因并停止相信 feature route：地图无效、feature 不唯一、route 引用不存在、root 越界或职责与源码明显漂移。

回退顺序固定为：

1. 用 area/partition 的职责和 signals 选择少量候选 root。
2. 仍不明确时，在 `game/src` 做一次有界 bundle。
3. 依据真实 import、调用流和测试确认 owner，并报告地图漂移；不要在当前修复中顺手重写地图，除非任务明确包含地图同步。

## 边界

- 地图不是文件索引，不因普通文件或内部子目录变化修改它。
- 不预读所有 route 层级，不递归邻居，不猜不存在的 ID 或路径。
- 路由结果不授予编辑权限；只修改已由源码证据确认的最小职责范围。
- 输出所选 `feature`、实际 tier、解析后的 roots、已读/未读范围和回退原因，便于复核定位是否有效。
