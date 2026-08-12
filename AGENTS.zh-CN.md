# AI 编码 Agent 仓库指南

本文件是根级英文权威 `AGENTS.md` 的同步中文译文。先阅读根指南，再阅读目标目录最近的
`AGENTS.md`：`game/AGENTS.md` 负责浏览器游戏规则，`agent/AGENTS.md` 负责可选 Python 服务。

## 工作契约

- 默认使用中文回复，除非用户要求其他语言；统一使用 UTF-8。
- 编辑前检查 Git 状态、最近指南、所属源码、测试、契约和相关文档。
- 保留用户无关改动与忽略的本地配置，不得输出、提交或重写凭证。
- 功能、重构、依赖变化、删除、Schema 变化和发布都需要明确授权与相称验证。
- 选择最小完整改动，不建立重复的兼容路径、抽象、注释或文档权威。
- 只声明实际执行的检查；测试、CI、安全检查或冲突处理不通过时停止，不得强制合并。

## 仓库结构

```text
game/                  独立 TypeScript/Vite 浏览器游戏
agent/                 独立 Python 篝火/抄写员/Main 服务
scripts/               仓库规则校验器及其回归测试
.github/workflows/     跨工程验证和游戏 Pages 部署
.agents/skills/        需求、实现、交付与指南同步流程
```

两个工程不共享源码导入或依赖树。游戏只能通过严格 HTTP 契约调用 Agent，而且未启动 Agent 时仍
必须可玩。Agent 不得读取游戏存档、地图、背包、身份、完整快照或浏览器中的 Provider 密钥。
法律文件保留在仓库根，游戏构建时复制到 `game/dist/`。

## 标准命令

```bash
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
python3 -m unittest discover -s agent/tests
pnpm --dir game install --frozen-lockfile
pnpm --dir game test
pnpm --dir game architecture:check
pnpm --dir game build
```

`game/node_modules/`、`game/dist/`、Python 虚拟环境和缓存都是生成内容，不属于源码，不得提交。

## Skill 与交付

适用时按仓库 Skill 路由工作：

```text
未批准或有歧义的修改 -> $define-requirement -> 用户确认
已批准的仓库级改动   -> $deliver-change
边界明确的实现切片   -> $implement-change
指南同步             -> $sync-project-guide
首次模板初始化       -> $bootstrap-repository
已审查结果 + 明确发布授权 -> $publish-change
```

不能原生发现 Skill 的客户端读取 `.agents/skills/<skill-name>/SKILL.md`。更近的指南可以补充模块
约束，但不得削弱根级安全、验证和发布规则。
