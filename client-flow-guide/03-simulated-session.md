# 一次完整的模拟协同会话

> 文档性质：本页全部内容均为虚构示例。问题、revision、动作 ID、返回值、诊断和检查结果
> 都没有在当前仓库中真实发生，也不代表存在对应缺陷。

## 模拟问题

```text
[模拟用户请求]
玩家在战斗中提交一条满足当前题意的 SQL，结果表能够显示，
但怪物生命没有变化。请定位查询执行与战斗结算之间的断点。
```

这段请求只描述玩家可见现象，不提供答案 SQL、隐藏 Judge、坐标、存档或完整状态。

## 第一阶段：识别与隔离

```text
[模拟维护器记录]
project marker : sql-dungeon
adapter        : v2
case audience  : public
source state   : fingerprint matched
workspace      : isolated repair repository created
publication    : not authorized
```

说明：维护器通过固定 marker 确认仓库身份，通过 public `describe` 获取公开问题，再由
`materialize` 准备不含隐藏 Benchmark 数据的隔离仓库。这里的字段值只是格式示例。

## 第二阶段：架构定位

```text
[模拟 Coding Agent 决策]
候选 feature : combat-resolution
primary       : features/game-session, domain/session/combat
adjacent      : features/terminal, domain/learning, infrastructure/sql
检查顺序      : 先结算所有者，再查直接调用方与执行适配器
```

对应的推理是：结果表能够显示，说明 SQL 可能已经执行；怪物生命没有变化更接近战斗状态提交问题，
因此先检查 [GameSession](../game/src/features/game-session/GameSession.ts)，再补充检查
[TerminalCoordinator](../game/src/features/terminal/TerminalCoordinator.ts) 和
[SqlEngine](../game/src/infrastructure/sql/SqlEngine.ts)。

## 第三阶段：受限交互

```text
[模拟 look 返回]
revision       : sim-r17
mode           : combat
current target : 当前战斗目标
prerequisites  : 当前可见题目说明已满足
actions        : [submit-current-query]
excluded       : coordinates, full map, save, inventory, hidden answer
```

```text
[模拟 query 请求]
revision : sim-r17
sql      : <说明用占位 SQL，不代表题目答案>
```

```text
[模拟 query 返回]
execution      : completed
visible result : result table updated
combat state   : no visible HP change
next boundary  : inspect terminal-to-session settlement call
```

说明：真实 `query` 只能写入当前打开的玩家文本框并点击真实提交控件。占位 SQL 不会在本页执行，
也不能由维护器替换成隐藏答案。

## 第四阶段：最小诊断与修改

```text
[模拟诊断，不是当前源码事实]
假设某个新增保护分支在 SQLite 返回结果后提前结束，
导致 TurnResolution 没有交给 GameSession 完成结算。
```

```text
[模拟修改计划]
目标文件 : 直接拥有该保护分支的协调器
改动范围 : 恢复一次明确的结算调用
非目标   : 不改判题规则、不改伤害公式、不改 SQLite、不改 UI
```

Coding Agent 会先确认调用链与测试证据，再修改最小所有者。若源码表明假设错误，则撤销该假设，
不会为了匹配模拟结论而强行修改真实代码。

## 第五阶段：验证与停止

```text
[模拟检查结果，不是真实测试输出]
focused check     : passed
architecture check: passed
Diff scope        : one approved owner
browser evidence  : not collected
remaining risk    : real device behavior unverified
```

如果真实检查连续失败、revision 已过期、动作无进展或需要越界数据，处理应停止并返回当前证据，
而不是重复操作或自动扩大权限。

## 第六阶段：人工交接

```text
[模拟最终交接]
状态       : ready for review
已提供     : Diff、检查类型、通过项、未验证项、剩余风险
尚未授权   : apply、commit、push、merge、release、deployment
下一决定   : 评审者接受、要求修改或拒绝
```

## 这套协同体现的价值

1. 问题从玩家可见现象开始，不要求用户先知道代码位置。
2. 架构地图缩小检查范围，但最终结论仍以源码和验证为准。
3. 浏览器桥提供足够完成交互的可见信息，同时保护答案、地图和玩家数据。
4. 修改与正式仓库隔离，失败可以停止和恢复。
5. 自动化负责形成证据，人负责决定是否应用和发布。

返回入口：[游戏代码与维护器协同流程](README.md)
