# SELECT * FROM DUNGEON

**简体中文** | [English](README.md)

本仓库包含两个相互独立的工程：

- [`game/`](game/README.zh-CN.md)：浏览器 SQL 肉鸽，包含 TypeScript 源码、Vitest
  测试、资源、产品文档和 Vite 构建。
- [`agent/`](agent/README.md)：可选的只读 Python Agent 服务，包含篝火复盘、抄写员陪伴和
  Main 下一步指引。

不启动 Agent 服务时，游戏仍可完整游玩。两个工程不共享源码导入或依赖目录，运行时只通过严格
HTTP 契约连接。模块归属和执行边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

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
python3 -m agent --host 127.0.0.1 --port 8787
```

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
