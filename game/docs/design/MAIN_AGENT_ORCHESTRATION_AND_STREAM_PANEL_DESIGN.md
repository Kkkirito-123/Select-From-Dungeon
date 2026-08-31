# Agent Runtime 与常亮面板设计

状态：已实现

## 目标与边界

篝火、抄写员和 Main 都是只读输出角色。篝火只复盘当前楼层 SQL 学习记录；抄写员只负责剧情陪伴和失败安慰；Main 只根据已经校验的角色结果生成“下一步计划”。三者都不能判题、移动玩家、修改路线、背包、存档或游戏状态。

```text
TriggerBus
  -> AgentRuntime / XState (campfire || scribe || main)
      -> AgentCache (three page-memory maps)
      -> AgentGateway
          -> POST /v1/agent/run
              -> changed PydanticAI role
              -> PydanticAI Main
              -> OpenTelemetry
  -> AgentPanel (Next Plan + Agent Work)
```

XState 只管理浏览器 Agent 生命周期，PydanticAI 只管理 Python 结构化模型输出，OpenTelemetry 只管理不含正文的调用观测。它们不接管 `GameSession`，也不提供工具、记忆、自主规划、轮询或网络流式协议。

## 浏览器运行时

`src/application/agent/AgentRuntime.ts` 是唯一应用入口，对外只提供 `handle`、`interactScribe`、`campfireFor`、`subscribe`、`getState` 和 `destroy`。一个 XState actor 包含三个并行区域：

- `campfire`: `idle / dirty / running / ready / local`
- `scribe`: `idle / running / ready / local`
- `main`: `idle / running / ready / local`

Invocation 的 `AbortSignal` 负责同源新证据取消与换层取消，不同来源可以并行。同来源低优先级事件不会取消尚未完成的高优先级请求。面板优先级是抄写员交互、死亡、篝火、导航；低优先级结果可以缓存，但不能覆盖高优先级计划。

新作答会把当前楼层篝火标记为 dirty 并清除旧活动背景。换层会中止两个来源、清除活动引用及上一层角色正文，Main 改为当前层等待计划。请求期间保留已经显示的下一步，只更新状态。

## 页面内存缓存

`AgentCache` 分别维护 Campfire、Scribe 和 Main 三个 Map：

```text
campfire: floor:evidenceHash
scribe:   floor:scene:evidenceHash
main:     floor:event:campfireHash-or--:scribeHash-or--
```

`ready` 有效 10 分钟，`fallback` 有效 30 秒，每类最多 32 条。命中 Main 缓存时不联网、不重播，记录 `CACHE HIT / 0 TOKENS`。缓存、Token 累计和日志都只存在当前页面内存，不写 Run、Profile、IndexedDB、localStorage 或 Python 服务。

## 唯一协议与 Gateway

`AgentGateway` 只读取 `VITE_AGENT_URL`，唯一服务路径是 `POST /v1/agent/run`。它负责稳定 JSON、SHA-256、五秒超时、生命周期中止和严格字段校验；未配置或响应非法时由 Runtime 直接使用本地结果，不存在旧子端点双轨。

请求和响应都使用版本 1。响应核心字段为：

```ts
{
  schemaVersion: 1;
  child: { source; evidenceHash; status; content };
  main: { status; guidance };
  meta: {
    traceId: string | null;
    ms: number;
    calls: Array<{
      agent: "campfire" | "scribe" | "main";
      mode: "model" | "local";
      status: "ready" | "fallback";
      ms: number;
      tokens: { input: number | null; output: number | null; total: number | null };
    }>;
  };
}
```

响应必须精确匹配请求 ID、楼层、事件、来源、证据 Hash 和综合 Hash，并拒绝额外字段、HTML、工具标记和超长文本。Main 没有 `situation` 字段，只生成 `guidance`，避免重复游戏与角色界面已经展示的内容。

## Python 包与角色

Python 使用标准 `src/dungeon_agents` 包结构，`dungeon-agent` 是唯一 CLI。`shared/model.py` 是唯一 PydanticAI 模型入口，统一结构化输出、usage、OpenAI 兼容 URL 归一化和中性错误；不启用工具、记忆、重试或自主规划。

- Campfire 模型生成学习复盘展示字段，失败时使用确定性复盘。
- Scribe 模型只生成 `headline` 和 `message`；玩法字段由规则提供。
- 导航只使用确定性 Scribe 结果，不调用 Scribe 模型。
- Main 模型只接收已经校验的角色展示字段，只生成 `guidance`。

Campfire 与 Scribe 共用 `CHILD_*`，Main 独立读取 `MAIN_*`，未配置对应 Key 时使用确定性回退。旧 `DEEPSEEK_*` 与 `DIRECTOR_*` 仅作为本地配置迁移读取，不属于正式接口。

## OpenTelemetry

统一请求创建 `agent.request` 根 Span、`agent.child` 和 `agent.main` 子 Span；PydanticAI 创建模型 Span。自定义 Span 只记录请求 ID、楼层、事件、来源、状态、fallback、耗时和可用 Token，不记录 prompt、completion、SQL、正文、快照、Key 或身份。

默认不向外导出。配置标准 `OTEL_EXPORTER_OTLP_ENDPOINT` 后才通过 OTLP/HTTP 导出；初始化或导出失败不能影响游戏。

## 常亮面板

桌面端 240px 左栏包含两张像素卡片。上卡只用居中、高对比绿色文字显示 Main 的下一步计划；篝火复盘和抄写员剧情陪伴留在各自游戏界面。下卡显示三个角色状态、当前动作、本次与页面累计 Token，以及最近三条可读日志（Runtime 内仍保留最近 40 条）。

只有新的远程 Main `ready` 结果使用一个 `requestAnimationFrame` 按 24ms/Unicode 字符播放；缓存、本地结果和 Reduced Motion 直接显示全文。没有 SSE 时不得伪造服务端内部步骤。窗口宽度 `<=1140px` 时隐藏左栏并保留游戏布局。

## 数据边界与验证

Campfire 请求最多包含当前层八条有限 SQL 投影；Scribe 请求只包含作者文案和受限学习、死亡或导航证据；Main 模型只看到角色展示字段。请求不得包含参考 SQL、完整 `GameSnapshot`、地图、移动、背包、身份、Key 或游戏指令。服务无数据库、无 Store、无输出持久化，不改变 Run/Profile 数据版本。

```bash
python3 -m unittest discover -s agent/tests
pnpm --dir game test
pnpm --dir game architecture:check
pnpm --dir game build
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
```
