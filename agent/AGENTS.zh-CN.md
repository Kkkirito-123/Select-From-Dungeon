# Agent 服务指南

本指南约束 `agent/`，根目录的安全和发布规则继续生效。

## 归属

- `campfire/` 负责 SQL 学习复盘契约和流程。
- `scribe/` 负责剧情陪伴与失败安慰契约和流程。
- `director/` 当前负责把变化方子结果整理为 Main 下一步指引。
- `shared/` 是模型调用、纯文本规则、Hash、错误和遥测的唯一公共边界。
- `http/` 只解析传输输入并装配流程，不承载角色业务。
- `tests/` 集中保留，因为它验证三个角色及共享运行层之间的完整契约。

三个角色属于一个可部署服务，但业务模块相互分开。不得拆成三个服务，也不得复制公共模型客户端。

## 安全边界

- 服务无状态、只读，不增加数据库、输出存储、记忆、工具、自主规划或游戏指令。
- 不接收参考 SQL、完整游戏快照、地图、移动、背包、身份或浏览器 Provider 密钥。
- OpenTelemetry 只能记录标识、状态、耗时、fallback 和 Token 数，不记录 prompt、completion、
  SQL、展示正文或凭证。
- 未配置 Key、模型失败或遥测导出失败时，确定性回退仍须保证游戏可用。

## 命令

在仓库根目录执行：

```bash
python3 -m pip install -e agent
python3 -m unittest discover -s agent/tests
python3 -m agent --host 127.0.0.1 --port 8787
```

命名保持简短可读。中文注释只解释模块职责、非直观编排、公共契约和隐私/安全边界，不逐行复述代码。
