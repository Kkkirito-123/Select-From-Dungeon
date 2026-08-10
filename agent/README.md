# Agent 服务

这是可选的 Python 3.11+ 游戏辅助服务。目前包含篝火复盘和抄写员场景响应两个独立领域。服务只接收浏览器投影的有限证据，不能读取游戏存档、地图、移动、背包或玩家身份，也不能修改游戏状态。

## 目录

```text
agent/
├─ contracts/   models.py、hash.py、validate.py、scribe.py：跨层契约和证据哈希
├─ flows/       review.py、scribe.py：篝火复盘和抄写员场景流程
├─ campfire/    analyzer.py：篝火旧导入路径兼容门面
├─ scribe/      analyzer.py：抄写员领域入口和兼容门面
├─ storage/     repo.py、sqlite.py：触发状态的内存/SQLite 存储
├─ http/        routes.py、response.py、server.py：路由、请求体和 HTTP 生命周期
└─ tests/       协议、流程、HTTP、存储测试
```

第一轮抄写员 MVP 提供 `POST /v1/scribe/respond`，支持 `interaction`、`death-review` 和 `navigation` 三类场景。请求必须携带当前场景的结构化证据和 `evidenceHash`；学习诊断中的缺失字段、多余字段、剩余概念和安全提示 ID 由游戏端生成，Agent 只负责组织确定性陪伴文案。`safeHintId` 必须原样绑定请求，服务不返回完整答案 SQL、游戏动作或路线修改。

浏览器端已经接入抄写员 Hook：没有配置模型服务时使用浏览器端确定性文案；配置服务后，远程结果只能异步替换展示文字，不能修改游戏状态、存档或路线。

浏览器端的触发模块位于 `src/application/`：

```text
triggers/       快照变化 -> answer、campfire、floor、death、navigation 事件
hooks/          AnswerHook、CampfireHook、ScribeHook 负责去重、请求和回退
```

数据流是：

```text
战斗结束写入 AnswerAttemptRecord
  -> AnswerHook: 当前层 dirty
  -> 进入篝火两格圆形范围
  -> CampfireHook: requesting / ready / fallback
  -> CampfireAgentClient: POST /v1/campfire/review
  -> 结果只替换本地复盘文案

抄写员交互、死亡和迷路等级上升分别进入 `interaction`、`death-review`、`navigation` 场景；
`ScribeHook` 立即生成本地文案，再由 `ScribeAgentClient` 异步请求 `POST /v1/scribe/respond`。
```

同一证据在当前页面只请求一次。请求超时、服务不可用、输出非法或哈希不匹配时，游戏继续使用本地确定性复盘；新的 SQL 作答会生成新的证据并允许下一次请求。Hook 不把 Agent 输出写入 Run、Profile 或 IndexedDB。

## 运行

在仓库根目录执行：

```bash
python3 -m unittest discover -s agent/tests
python3 -m agent --host 127.0.0.1 --port 8787
```

前端可分别配置 `VITE_CAMPFIRE_AGENT_URL=http://127.0.0.1:8787/v1/campfire/review` 和
`VITE_SCRIBE_AGENT_URL=http://127.0.0.1:8787/v1/scribe/respond`；未配置任一端点时，
对应功能继续使用本地确定性文案。

测试 DeepSeek 时，把 Key 设置在 Python 服务进程环境中，不要写入 `VITE_` 变量：

```powershell
$env:DEEPSEEK_API_KEY = "sk-你的Key"
$env:DEEPSEEK_MODEL = "deepseek-chat"
python -m agent --host 127.0.0.1 --port 8787
```

可直接编辑 [`agent/.env`](.env)；它已被 Git 忽略，只由 Python 服务读取。变量模板见 [`agent/.env.example`](.env.example)。Key 不会进入浏览器、游戏存档、请求正文或响应。未设置 Key 时服务使用确定性生成器，DeepSeek 超时或输出不合法时自动回退本地复盘。

默认服务不创建数据库文件。需要保存触发状态时显式指定 Agent 专用 SQLite：

```bash
python3 -m agent --db .local/agent.db
```

该数据库只保存 `trigger_id`、类型、范围、楼层、证据哈希、状态、重试次数、错误码和已校验输出，不保存原始 SQL、完整存档或请求日志。生产环境可以在相同 `Store` 接口后替换为 PostgreSQL；第一版不绑定模型供应商。
