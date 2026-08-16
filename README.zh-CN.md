# SELECT * FROM DUNGEON

**简体中文** | [English](README.md)

本仓库包含两个相互独立的工程：

- [`game/`](game/README.zh-CN.md)：浏览器 SQL 肉鸽，包含 TypeScript 源码、Vitest
  测试、资源、产品文档和 Vite 构建。
- [`agent/`](agent/README.md)：可选的只读 Python Agent 服务，包含篝火复盘、抄写员陪伴和
  Main 下一步指引。

不启动 Agent 服务时，游戏仍可完整游玩。两个工程不共享源码导入或依赖目录，运行时只通过严格
HTTP 契约连接。模块归属和执行边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

独立 `dungeon-maintainer` 可通过仅限开发态的本机桥启动同窗 Dashboard：Pi Agent 排查当前楼层，
在隔离 worktree 修复并复测，用户最后显式应用补丁。它不属于本仓库的在线 Python Agent 服务，
也不读取正式游戏存档。

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

如需启用唯一的 `POST /v1/agent/run` 集成，将 `game/.env.example` 复制为
`game/.env.local`；模型密钥只放在 `agent/.env`。

仅限开发态的游戏协议 v2 桥由独立 `dungeon-maintainer` 仓库调用，用于受限代码维护和 Pi Agent
指挥的八层浏览器试玩。BFS 路径与答案提交留在游戏桥内部，Agent 只选择受限工具。Runner 使用
临时 Chromium Context 与内存 Run，不属于本仓库的 Python Agent 服务，也不会污染正式存档。

`game/node_modules/` 是 pnpm 安装生成的依赖内容，不是项目源码，不会提交到 Git；删除后可根据
`game/pnpm-lock.yaml` 完整重新生成。

## 验证

```bash
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
python3 -m unittest discover -s agent/tests
pnpm --dir game test
pnpm --dir game architecture:check
pnpm --dir game build
```

仓库原创代码和文字采用 [MIT License](LICENSE)。第三方运行时声明与保留的参考来源见
[ATTRIBUTIONS.md](ATTRIBUTIONS.md)。
