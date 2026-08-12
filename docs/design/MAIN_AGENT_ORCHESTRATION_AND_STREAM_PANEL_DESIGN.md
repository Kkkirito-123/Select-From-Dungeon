# Agent Runtime 与常亮面板设计

状态：已实现 MVP

## 目标与边界

篝火、抄写员和主 Agent 都是只读输出层。篝火只复盘当前楼层 SQL 学习记录；抄写员只负责剧情陪伴和失败安慰；主 Agent 只根据已经校验的子结果整理“当前情况”和“下一步”。三者都不能判题、移动玩家、修改路线、背包、存档或游戏状态。

本设计使用 XState 管理浏览器生命周期，PydanticAI 管理 Python 结构化模型调用，OpenTelemetry 管理调用观测。它们不接管 `GameSession`，不提供工具、记忆、自主规划、重试、轮询或流式网络协议。

```text
TriggerBus
  -> AgentRuntime
      -> XState AgentMachine (campfire || scribe || main)
      -> AgentCache (three independent memory maps)
      -> AgentGateway
          -> POST /v1/director/run
              -> changed PydanticAI child
              -> PydanticAI director
              -> OpenTelemetry spans
  -> AgentPanel (Main Next Plan + Agent Work)
```

## 浏览器运行时

`src/application/agent/AgentRuntime.ts` 是唯一 Agent 应用入口，并只暴露：

```ts
handle(event: Trigger): void;
interactScribe(snapshot, scribeId, authoredText): ScribeAgentContent;
campfireFor(snapshot): CampfireAgentContent | null;
subscribe(listener): () => void;
getState(): AgentRuntimeState;
destroy(): void;
```

XState actor 使用三个并行区域：

- `campfire`: `idle / dirty / running / ready / local`
- `scribe`: `idle / running / ready / local`
- `main`: `idle / running / ready / local`

XState invocation 的 `AbortSignal` 同时承担 5 秒网络中止之外的生命周期取消。同来源的新证据会取消旧请求，不同来源可以并行；同来源低优先级事件不会取消尚未完成的高优先级请求，而是直接跳过并写入内存日志。面板优先级固定为抄写员交互、死亡、篝火、导航；跨来源低优先级结果可以进入缓存，但不能覆盖高优先级面板。

新作答将当前楼层篝火标记为 dirty，并立即清除旧篝火活动背景，但保留缓存条目。换层会中止两个来源的 invocation，清除活动引用和上一层正文。请求期间保留已有 Main 正文，只更新运行状态。

## 三份内存缓存

`AgentCache` 内部维护三个独立 Map：

```text
campfire: floor:evidenceHash
scribe:   floor:scene:evidenceHash
main:     floor:event:campfireHash-or--:scribeHash-or--
```

`ready` 有效 10 分钟，`fallback` 有效 30 秒，每类最多 32 条并按 `savedAt` 淘汰最旧项。活动背景每次组装请求时必须重新经过对应 Map 的 TTL 检查。相同 Main 键命中时不请求、不重播，并记录 `CACHE HIT / 0 TOKENS`。缓存只存在当前页面内存，不写 Run、Profile、IndexedDB、localStorage 或 Python 服务。

## 协议与 Gateway

`AgentGateway` 是唯一浏览器网络边界，负责稳定 JSON、SHA-256、端点优先级、5 秒中止和严格响应校验。配置 `VITE_DIRECTOR_AGENT_URL` 后只调用统一端点；否则按来源调用旧子端点；都未配置时使用本地确定性结果。导航在旧端点模式下完全本地生成，在统一端点模式下允许 Main 整理下一步，但 Python 不调用抄写员模型。

统一请求仍使用 `protocolVersion: 1`。`POST /v1/director/run` 响应使用 `schemaVersion: 2`：

```ts
meta: {
  traceId: string | null;
  ms: number;
  calls: Array<{
    agent: "campfire" | "scribe" | "director";
    mode: "model" | "local";
    status: "ready" | "fallback";
    ms: number;
    tokens: { input: number | null; output: number | null; total: number | null };
  }>;
}
```

响应必须精确匹配请求 ID、楼层、事件、来源、证据 Hash 和综合 Hash，拒绝额外字段、HTML、工具标记及超长文本。`situation` 必须是变化方标题和第一条事实的确定性组合；只有 `guidance` 可由主模型生成。旧 `/v1/campfire/review` 与 `/v1/scribe/respond` 继续返回 schema v1。

## Python 模型与角色

`agent/shared/model.py` 是唯一模型入口。它通过 `pydantic-ai-slim[openai]` 调用 OpenAI 兼容服务，统一结构化输出、usage、URL 归一化和中性错误；不启用工具、记忆、重试或自主规划。Pydantic 契约统一使用严格类型、`extra="forbid"`、字段长度和纯文本校验。

- 篝火模型生成完整学习复盘展示字段，失败时使用确定性复盘。
- 抄写员模型只生成 `headline` 和 `message`；`facts`、`nextAction`、`safeHintId` 由确定性规则提供。模型只用于实体交互和死亡安慰。
- 导航始终使用确定性抄写员子结果，不调用抄写员模型。
- 主模型只接收两个子 Agent 已校验的展示字段，只生成 `guidance`；`situation` 始终确定性生成。

篝火和抄写员读取 `DEEPSEEK_*`，主 Agent 独立读取 `DIRECTOR_*`，主 Key 不回退到子 Key。未配置对应 Key、模型失败或输出非法时使用确定性回退。完整 `/chat/completions` URL 会自动归一化为兼容 base URL。

## OpenTelemetry

每个路由流程创建 `agent.request` 根 Span，统一流程下包含 `agent.child` 和 `agent.director` 子 Span；PydanticAI 负责模型 Span。自定义 Span 只记录请求 ID、楼层、事件、来源、状态、fallback、耗时和可用 token 数字，不记录 prompt、completion、SQL、正文、快照、Key 或身份。

默认只在进程内创建 Span，不向外部发送。配置标准 `OTEL_EXPORTER_OTLP_ENDPOINT` 后通过 OTLP/HTTP 导出；初始化或导出失败不能影响游戏请求。

## 常亮面板

桌面端 `AgentPanel` 是 240px 左栏中的两张像素卡片。上卡只显示 Main Agent 的下一步计划，使用居中的高对比绿色文字；当前情况、篝火复盘和抄写员剧情陪伴仍留在各自游戏界面，不在左栏重复。下卡用三行状态流显示篝火、抄写员和 Main Agent 的阶段，并用“当前动作”和可读的最近动作显示运行进展，同时保留本次与页面累计 Token，以及最近 40 条页面内存日志。

Token 区在模型返回数字时显示实际值，缓存和本地回退显示 `0`，旧端点无法提供 usage 时显示 `N/A`。日志只展示浏览器已知的请求、缓存、状态，以及完整 HTTP 响应返回后的各 Agent 耗时和 Token；没有 SSE 时不得伪造服务端内部逐步流。只有新的远程 Main `ready` 结果使用单个 `requestAnimationFrame` 按 24ms/Unicode 字符播放；缓存、本地结果和 Reduced Motion 直接显示全文。窗口宽度 `<=1140px` 时隐藏左栏并保留原游戏布局。

## 数据边界

篝火请求最多包含当前层八条有限 SQL 投影；抄写员请求只包含作者文案和受限的学习、死亡或导航证据；主模型只看到子 Agent 展示字段。请求不得包含参考 SQL、完整 `GameSnapshot`、地图、移动、背包、身份、Key 或游戏指令。Agent 服务无数据库、无 Store、无输出持久化，也不改变 Run/Profile 数据版本。

## 验证命令

```bash
python3 -m unittest discover -s agent/tests
pnpm test
pnpm architecture:check
pnpm build
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
```
