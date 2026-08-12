# Agent 服务

这是可选的 Python 3.11+ 只读辅助服务。篝火负责 SQL 学习复盘，抄写员负责剧情陪伴与失败安慰，主 Agent 负责整理当前情况和下一步。服务不能读取游戏存档、地图、移动、背包或玩家身份，也不能修改游戏状态。

## 目录

```text
agent/
├─ campfire/   严格契约、确定性复盘和篝火流程
├─ scribe/     严格契约、确定性玩法字段和陪伴流程
├─ director/   schema v2 契约、变化方编排和主 Agent 流程
├─ shared/     公共契约、Hash、PydanticAI 模型入口和 OpenTelemetry
├─ runtime/    服务端模型配置
├─ http/       三个兼容路由和 HTTP 生命周期
└─ tests/      契约、流程、usage、遥测和 HTTP 测试
```

服务不包含 Agent Store、SQLite、输出持久化、工具、记忆、重试或自主规划。三个角色通过 `shared/` 复用基础能力，业务流程保持独立，由 `http/server.py` 组装。

## 调用流程

浏览器的 `AgentRuntime` 使用 XState 管理篝火、抄写员和 Main 三个并行状态区，`AgentGateway` 统一处理 SHA-256、5 秒中止、端点优先级与严格校验。

```text
TriggerBus -> AgentRuntime -> AgentGateway
  -> POST /v1/director/run
      -> 只运行变化方子 Agent
      -> 主 Agent 只生成 guidance
      -> schema v2 + usage + traceId
```

`POST /v1/campfire/review` 和 `POST /v1/scribe/respond` 继续返回 schema v1。`POST /v1/director/run` 返回 schema v2，并在 `meta.calls` 中提供每次子 Agent/Main 调用的模式、状态、耗时和 token。配置统一端点后浏览器不调用旧子端点；未配置统一端点时旧端点仍可独立使用；全部未配置时游戏使用浏览器本地文案。

抄写员模型只生成 `headline` 与陪伴 `message`，玩法相关的 `facts`、`nextAction` 和 `safeHintId` 由确定性规则补齐。导航不会调用抄写员模型；统一端点仍可让主 Agent 根据确定性导航结果整理下一步。

## 安装与运行

在仓库根目录执行：

```bash
python3 -m pip install -e agent
python3 -m unittest discover -s agent/tests
python3 -m agent --host 127.0.0.1 --port 8787
```

前端优先配置统一端点：

```text
VITE_DIRECTOR_AGENT_URL=http://127.0.0.1:8787/v1/director/run
```

兼容路径仍可分别配置：

```text
VITE_CAMPFIRE_AGENT_URL=http://127.0.0.1:8787/v1/campfire/review
VITE_SCRIBE_AGENT_URL=http://127.0.0.1:8787/v1/scribe/respond
```

## 模型配置

服务读取进程环境变量，也会读取 Git 忽略的 `agent/.env`。变量名模板见 `agent/.env.example`。不要把 Key 写进任何 `VITE_` 变量；浏览器不需要模型 Key。

```text
DEEPSEEK_API_KEY=子Agent Key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_URL=https://api.deepseek.com/chat/completions

DIRECTOR_API_KEY=主Agent Key
DIRECTOR_MODEL=deepseek-chat
DIRECTOR_URL=https://api.deepseek.com/chat/completions
```

两个子 Agent 共用 `DEEPSEEK_*`；主 Agent 只使用 `DIRECTOR_*`，不会借用子 Agent Key。未配置对应 Key时使用确定性回退。完整 `/chat/completions` URL 会自动归一化。

## OpenTelemetry

默认不向外部发送 Trace。设置标准 OTLP/HTTP Collector 地址后启用导出：

```text
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
```

Span 包含 `agent.request`、`agent.child`、`agent.director` 和 PydanticAI 模型调用，只记录请求 ID、楼层、事件、来源、状态、耗时、fallback 和 token；不记录 prompt、completion、SQL、正文、快照、Key 或身份。导出失败不影响游戏。

## 数据边界

篝火只接收当前层聚合和最多八条有限 SQL 投影；抄写员只接收作者文案和受限场景证据；主模型只接收已校验的子 Agent 展示字段。服务不接收参考 SQL、完整快照、地图、移动、背包、身份或游戏指令。浏览器的三份 Agent 缓存只存在页面内存，Python 服务同样不保存请求或输出。
