# SQL Dungeon output-only Agent

Agent 只产生篝火复盘和抄写员文本，不拥有游戏写入权限。游戏仍然负责判题、战斗、地图、奖励和存档。

```text
agent/runtime/              浏览器 Hook、证据投影、缓存、输出守卫
agent/browser/deepseek/     Worker 内存 Key 与 DeepSeek 直连
agent/browser/scribe/       固定角色提示词
agent/browser/ui/           BYOK 设置和学习记录操作
agent/src/sql_dungeon_agent/
  contracts.py              Python 与浏览器共用的闭合协议
  pipeline.py               一次请求同时准备两类输出
  campfire/analyzer.py      确定性学习复盘
  scribe/composer.py        抄写员表达与本地降级
  providers/openzl.py       可选 OpenZLAgent 模型适配器
  api.py                    受限 HTTP 入口
agent/tests/                Python 协议和服务测试
```

## 触发边界

浏览器只在四类语义 Hook 后准备 Agent：

- `floor-start`：进入楼层时生成开场抄写员内容；默认只使用本地输出，不调用模型。
- `route-guidance`：方向提示、路线高亮或逐格护送首次升级时，生成路线指引。
- `elite-defeated`：本层精英生命从大于 0 变为 0，解锁篝火复盘。
- `floor-end`：进入传送或 Run 胜利态时生成层末抄写员内容。

普通移动、巡逻、按键、提示按钮和渲染帧不会触发模型请求。相同证据 Hash 只准备一次。

篝火复盘的 `available` 在当前层精英被击败前为 `false`；前端仍可使用篝火休息，但复盘按钮保持禁用。

Python 输入只包含题目 ID、知识点、结果类别、提示等级、SQL 特征、路线方向和已验证剧情证据，不包含完整 SQL、地图坐标、移动轨迹或 API Key。

## Browser BYOK path

网页不需要 Agent 服务。确定性篝火和抄写员内容始终可用。玩家可以在
`AI 复盘设置` 中显式启用 DeepSeek：

- Key 只发送一次到专用 Worker，密码输入框立即清空；
- Worker 只在当前标签页内存中保留 Key，只访问 `https://api.deepseek.com`；
- 刷新、关闭标签页、清除 Key 或 Worker 终止都会清除 Key；
- 不写入 localStorage、sessionStorage、IndexedDB、日志、导出文件、URL、存档或项目服务器；
- DeepSeek 只能提供经过校验的抄写员措辞，不能改变篝火事实、战斗、题目、地图和存档。

## Python service

Python 服务当前作为本机或受控内网的输出服务，用于在线模型适配和回归；它不接收玩家 BYOK Key，也不代理浏览器 Key。

默认服务绑定 loopback：

```bash
python3 -m pip install -e ./agent
sql-dungeon-agent --port 8787
```

如需启用固定的 OpenZLAgent 适配器：

```bash
python3 -m pip install -e './agent[openzl]'
export SQL_DUNGEON_AGENT_MODEL_BASE_URL=https://provider.example/v1
export SQL_DUNGEON_AGENT_MODEL_NAME=your-model
export SQL_DUNGEON_AGENT_API_KEY=your-key
sql-dungeon-agent --port 8787
```

公开部署前还必须在网关补齐 HTTPS、身份认证、限流和错误监控。服务没有工具、记忆、MCP、游戏存档访问或请求日志。

## Verify

```bash
pnpm exec vitest run tests/Agent*.test.ts tests/DeepSeek*.test.ts tests/agentContext.test.ts
PYTHONPATH=agent/src python3 -m unittest discover -s agent/tests
```
