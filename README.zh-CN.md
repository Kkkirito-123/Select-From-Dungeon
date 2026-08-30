# SELECT * FROM DUNGEON

**简体中文** | [English](README.md)

本仓库包含三个相互独立的工程：

- [`game/`](game/README.zh-CN.md)：浏览器 SQL 肉鸽，包含 TypeScript 源码、Vitest
  测试、资源、产品文档和 Vite 构建。
- [`agent/`](agent/README.md)：可选的只读 Python Agent 服务，包含篝火复盘、抄写员陪伴和
  Main 下一步指引。
- [`presence/`](presence/README.zh-CN.md)：无第三方依赖的 Node.js SSE 服务，为游戏左下角统计
  已打开的标签页数量。

不启动任一可选服务时，游戏仍可完整游玩。三个工程不共享源码导入或依赖目录，运行时只通过严格
HTTP/SSE 契约连接。模块归属和执行边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 快速开始

启动浏览器游戏：

```bash
cd game
pnpm install --frozen-lockfile
pnpm dev
```

在另一个终端启动可选 Agent 服务：

```bash
python3 -m pip install -e agent
dungeon-agent --host 127.0.0.1 --port 8787
```

在另一个终端启动在线人数服务：

```bash
npm start --prefix presence
```

如需启用唯一的 `POST /v1/agent/run` 集成，将 `game/.env.example` 复制为
`game/.env.local`；模型密钥只放在 `agent/.env`。

`game/node_modules/` 是 pnpm 安装生成的依赖内容，不是项目源码，不会提交到 Git；删除后可根据
`game/pnpm-lock.yaml` 完整重新生成。

## Coding Agent Benchmark

游戏在 [`benchmark/agent-evals/`](benchmark/agent-evals/) 中维护 7 个仅供开发使用的真实修复场景，
并通过稳定的 [`scripts/benchmark-adapter.mjs`](scripts/benchmark-adapter.mjs) JSON 接口提供给
Dungeon Maintainer。维护器从当前工作树读取 Adapter，因此每次物化都以最新游戏为准，不再使用冻结副本。
物化后的目标仓库不包含 Benchmark 定义、隐藏 Oracle 数据或 Adapter 本身。

在仓库根目录查看公开场景清单：

```bash
node scripts/benchmark-adapter.mjs catalog
node scripts/benchmark-adapter.mjs describe --fixture terminal-action-bug --audience public
```

物化命令和隐私边界见 [benchmark/README.md](benchmark/README.md)。

## 验证

```bash
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
python3 -m unittest discover -s agent/tests
npm test --prefix presence
pnpm --dir game test
pnpm --dir game architecture:check
pnpm --dir game build
```

仓库原创代码和文字采用 [MIT License](LICENSE)。第三方运行时声明与保留的参考来源见
[ATTRIBUTIONS.md](ATTRIBUTIONS.md)。
