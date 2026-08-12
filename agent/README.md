# Agent 服务

这是可选的 Python 3.11+ 只读辅助服务。它以一个进程承载三个职责独立的角色：篝火复盘 SQL 学习记录，抄写员提供剧情陪伴与失败安慰，Main 只整理下一步计划。服务不能读取或修改游戏存档、地图、移动、背包和玩家身份。

## 结构

```text
agent/
├─ src/dungeon_agents/
│  ├─ campfire/  严格证据、确定性复盘和篝火流程
│  ├─ scribe/    受限场景证据、陪伴文案和抄写员流程
│  ├─ main/      唯一 HTTP 契约、变化方编排和 Main 流程
│  ├─ shared/    公共契约、Hash、PydanticAI 和 OpenTelemetry
│  ├─ runtime/   子角色与 Main 的模型配置
│  └─ http/      单路由和 HTTP 生命周期
└─ tests/        三个角色、共享运行层与传输边界测试
```

三个角色属于一个部署单元，通过 `shared/` 复用模型和遥测能力；没有 Agent Store、SQLite、输出持久化、工具、记忆、重试或自主规划。

## 调用流程

```text
TriggerBus -> XState AgentRuntime -> AgentGateway
  -> POST /v1/agent/run
      -> 只运行变化的 Campfire 或 Scribe
      -> Main 只生成 guidance
      -> schema v1 + usage + traceId
```

该服务只有 `POST /v1/agent/run`。旧三条路径返回 404。导航使用确定性 Scribe 结果，不调用 Scribe 模型；Main 仍可根据该结果整理下一步。未配置服务或模型失败时，浏览器和服务端都能使用确定性本地结果。

## 安装与运行

在仓库根目录执行：

```bash
python3 -m pip install -e agent
python3 -m unittest discover -s agent/tests
dungeon-agent --host 127.0.0.1 --port 8787
```

浏览器配置写入 `game/.env.local`：

```text
VITE_AGENT_URL=http://127.0.0.1:8787/v1/agent/run
```

## 模型配置

服务读取进程环境变量和 Git 忽略的 `agent/.env`，模板见 `.env.example`。不要把模型 Key 写进任何 `VITE_` 变量。

```text
CHILD_API_KEY=篝火与抄写员共用的 Key
CHILD_MODEL=deepseek-chat
CHILD_URL=https://api.deepseek.com/chat/completions

MAIN_API_KEY=Main 独立 Key
MAIN_MODEL=deepseek-chat
MAIN_URL=https://api.deepseek.com/chat/completions
```

没有对应 Key 时该角色使用确定性回退；Main 不借用子角色 Key。完整 `/chat/completions` URL 会自动归一化。旧 `DEEPSEEK_*` 与 `DIRECTOR_*` 只作为本地配置迁移读取，不属于新接口。

## OpenTelemetry 与数据边界

默认不向外部发送 Trace。配置 `OTEL_EXPORTER_OTLP_ENDPOINT` 后才通过 OTLP/HTTP 导出。Span 包含 `agent.request`、`agent.child`、`agent.main` 和 PydanticAI 模型调用，只记录请求 ID、楼层、事件、来源、状态、耗时、fallback 与 token，不记录 prompt、completion、SQL、正文、快照、Key 或身份。

篝火只接收当前层聚合和最多八条有限 SQL 投影；抄写员只接收作者文案和受限场景证据；Main 模型只接收已经校验的角色展示字段。浏览器缓存只存在页面内存，Python 服务不保存请求或输出。
