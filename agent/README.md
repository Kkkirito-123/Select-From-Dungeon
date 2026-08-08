# 篝火 Agent

这是可选的 Python 3.11+ 篝火复盘服务。它只分析当前楼层的 SQL 作答，不能读取游戏存档、地图、移动、背包或死亡记录，也不能修改游戏状态。

## 目录

```text
agent/
├─ contracts/   models.py、hash.py、validate.py：请求/响应和证据哈希
├─ flows/       review.py：一次复盘流程和确定性生成器
├─ campfire/    analyzer.py：旧导入路径兼容门面
├─ storage/     repo.py、sqlite.py：触发状态的内存/SQLite 存储
├─ http/        routes.py、response.py、server.py：路由、请求体和 HTTP 生命周期
└─ tests/       协议、流程、HTTP、存储测试
```

浏览器端的触发模块位于 `src/application/`：

```text
triggers/       快照变化 -> answer、campfire、floor、death 事件
hooks/          AnswerHook 标记 dirty；CampfireHook 负责去重、请求和回退
```

数据流是：

```text
战斗结束写入 AnswerAttemptRecord
  -> AnswerHook: 当前层 dirty
  -> 进入篝火两格圆形范围
  -> CampfireHook: requesting / ready / fallback
  -> CampfireAgentClient: POST /v1/campfire/review
  -> 结果只替换本地复盘文案
```

同一证据在当前页面只请求一次。请求超时、服务不可用、输出非法或哈希不匹配时，游戏继续使用本地确定性复盘；新的 SQL 作答会生成新的证据并允许下一次请求。Hook 不把 Agent 输出写入 Run、Profile 或 IndexedDB。

## 运行

在仓库根目录执行：

```bash
python3 -m unittest discover -s agent/tests
python3 -m agent --host 127.0.0.1 --port 8787
```

前端只有在配置 `VITE_CAMPFIRE_AGENT_URL=http://127.0.0.1:8787/v1/campfire/review` 后才会发起请求；未配置时完全使用本地复盘。

测试 DeepSeek 时，把 Key 设置在 Python 服务进程环境中，不要写入 `VITE_` 变量：

```powershell
$env:DEEPSEEK_API_KEY = "sk-你的Key"
$env:DEEPSEEK_MODEL = "deepseek-chat"
python -m agent --host 127.0.0.1 --port 8787
```

可直接编辑 [`agent/.env`](.env)；它已被 Git 忽略，只由 Python 服务读取。变量模板见 [`agent/.env.example`](.env.example)。Key 不会进入浏览器、游戏存档、请求正文或响应。未设置 Key 时服务使用确定性生成器，DeepSeek 超时或输出不合法时自动回退本地复盘。

默认服务不创建数据库文件。需要保存触发状态时显式指定 Agent 专用 SQLite：

```bash
python3 -m agent --db .local/campfire.db
```

该数据库只保存 `trigger_id`、类型、范围、楼层、证据哈希、状态、重试次数、错误码和已校验输出，不保存原始 SQL、完整存档或请求日志。生产环境可以在相同 `Store` 接口后替换为 PostgreSQL；第一版不绑定模型供应商。
