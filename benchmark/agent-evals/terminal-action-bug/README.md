# terminal-action-bug

## 目的

这个用例冻结了 SQL Dungeon 中“玩家可见 `terminal` 动作存在，但执行后返回
`action-not-available`”的真实维修现场，用于比较 Coding Agent 的复现、源码定位、
一次性方案审批、最小修改和刷新重放能力。

## 组成

- `../_bases/game-repair-v1/repository/`：519 文件共享正常基线，只保存一份。
- `source.patch`：把终端按钮映射改坏的一行 Bug Patch。
- `fixture.json`：共享基线 ID、补丁 Hash 和唯一预期 dirty 路径。
- `case.json`：允许发送给 Agent 的公开任务和超时。
- `reproduction.json`：零模型复现所需的固定语义动作。
- `expected.json`：Harness 可读取的隐藏验收事实；不应注入模型上下文。

## 边界

导入时已排除指向原仓库的 `.git` 文件和外部 `game/node_modules` Junction。原始许可证、
署名、第三方素材说明和英文文档均完整保留。不得把本 README 或 `expected.json` 复制到
物化后的仓库根目录，避免向被测 Agent 泄露故障答案。
