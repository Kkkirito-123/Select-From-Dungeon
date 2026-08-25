# 当前仓库架构

本文件记录已验证的当前仓库事实。稳定规则位于 `AGENTS.md`，当前 L1/L2 契约与检查点位于
`TASK.md`。本文件是英文权威 `ARCHITECTURE.md` 的同步中文译文。

## 仓库地图

```text
game/                    独立 TypeScript/Vite 浏览器游戏
agent/                   独立 Python 篝火/抄写员/Main 服务
scripts/                 仓库规则校验器及回归测试
.github/workflows/       跨工程验证和游戏 Pages 部署
.agents/skills/          需求、实现、交付与同步流程
.maintainer/project.json 外部 Dungeon Maintainer 的固定项目标识
LICENSE                  仓库许可证
ATTRIBUTIONS.md          外部来源与第三方归属登记
```

根目录负责仓库治理和分发入口，产品代码分别归属 `game/` 与 `agent/`。游戏详细事实位于
`game/ARCHITECTURE.md`；Python 服务在确有独立当前事实地图需求前，继续由 `agent/AGENTS.md` 管理。

## 运行与依赖边界

```text
game TriggerBus
  -> game AgentRuntime
  -> 携带受限证据的严格 HTTP 请求
  -> POST /v1/agent/run
  -> agent/src/dungeon_agents
      -> Campfire 或 Scribe -> Main
```

- 两个工程不共享源码导入或依赖树。`game/` 不导入 Python 包；`agent/` 不导入游戏 TypeScript、
  存档或资源。
- Agent 是可选增强层；服务缺失或不可用时，游戏使用确定性本地文案。
- 游戏规则、SQL 执行、存档、地图、战斗和 UI 只属于 `game/`；篝火合成、抄写员陪伴、Main 引导、
  Provider 调用和无正文遥测只属于 `agent/`。
- 跨工程变化必须同时更新 HTTP 契约两端并验证两个工程。静态游戏发布只上传 `game/dist/`；Agent
  独立部署，不进入浏览器构建。
- 法律文件保留在仓库根，游戏构建时复制到 `game/dist/`。

## 维护器边界

外部 Dungeon Maintainer 只能通过固定 `.maintainer/project.json` 标识识别本仓库。浏览器桥由
`game/src/devtools/` 持有，只在本机 Vite 开发页加 `?playtest=agent` 时运行，使用临时内存试玩
存储，生产产物不得包含该桥。准确工具和投影契约记录在 `game/ARCHITECTURE.md`。

## 标准验证命令

```text
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
python3 -m unittest discover -s agent/tests
pnpm --dir game install --frozen-lockfile
pnpm --dir game test
pnpm --dir game architecture:check
pnpm --dir game build
```

Windows 上若 `python` 指向 Python 3，可以代替 `python3`。`game/node_modules/`、`game/dist/`、
Python 虚拟环境和缓存都是生成内容，不属于源码。
