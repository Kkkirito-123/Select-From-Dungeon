# 仓库架构

仓库根目录只负责工程治理和发布入口，产品代码分别归属 `game/` 与 `agent/`。

```text
repository/
├─ game/                 浏览器游戏：源码、测试、资源、文档、Node 依赖与构建
├─ agent/                Python Agent：三个角色、共享运行层、HTTP 与测试
├─ scripts/              仓库级规则校验，不包含游戏生成脚本
├─ .github/workflows/    同时验证两个工程并部署 game/dist
├─ .agents/skills/       仓库协作流程
├─ LICENSE
└─ ATTRIBUTIONS.md
```

## 运行边界

```text
game/TriggerBus
  -> game/AgentRuntime
  -> HTTP（受限证据与严格响应）
  -> agent/HTTP service
      -> Campfire / Scribe / Main
```

- `game/` 不导入 Python 包；`agent/` 不导入游戏 TypeScript、存档或资源。
- Agent 是可选增强层，未配置或不可用时，游戏使用确定性本地文案。
- 两个工程分别管理依赖。`game/node_modules/` 和 Python 虚拟环境都是可再生内容，不属于源码。
- 根目录不提供第二套游戏入口或聚合业务代码，防止同一能力出现双轨实现。

## 责任划分

- 游戏规则、SQL 执行、存档、地图、战斗和 UI 只属于 `game/`。
- 篝火复盘、抄写员陪伴、Main 指引、模型调用和无正文遥测只属于 `agent/`。
- 跨工程变化必须同时更新 HTTP 契约两端，并通过两个工程的测试。
- 发布静态游戏时只上传 `game/dist/`；Agent 服务独立部署，不进入浏览器构建。
