# v1.1.0 发布检查表

> 状态：本地实现与验收完成；PR CI 和合并状态以归档页为准。

## 1. 目标与边界

- 目标：修正 SQL 字段引导、怪物像素外形、随机掉落与长距离寻路，并提供不污染存档的 Debug 入口。
- 用户：SQL 初学者、面试复习者、博客访客和项目维护者。
- MVP：`monsters.id`/分表/JOIN 提示、39 种怪物外形、低概率自动恢复品、战斗撤退、区域门、
  区域音乐与管理员八层全图。
- 不做：不改课程顺序，不改存档结构，不接入 Agent/账号/后端，不部署，
  不创建 GitHub Release 或版本标签。

## 2. 兼容与分发

- 包版本：`1.1.0`。
- 当前 Run：继续使用 `select-from-dungeon:run:v10`。
- 永久档案：继续使用 `select-from-dungeon:profile:v2`。
- 引导状态：继续使用 `select-from-dungeon:onboarding:v1`。
- 旧存档：`run:v9` 至 `run:v4` 继续通过现有链路读取；旧 Key 不删除。
- 构建产物：`dist/` 必须包含根 `LICENSE` 与 `ATTRIBUTIONS.md` 的逐字节副本。
- 部署：不在本版本 PR 中执行，由用户另行确认目标与权限。

## 3. 发布门

- [x] Git 工作树仅包含 v1.1 改动。
- [x] TypeScript 类型检查通过。
- [x] 全部 Vitest 测试通过。
- [x] Vite 生产构建通过且无新增构建警告。
- [x] `dist/LICENSE` 与 `dist/ATTRIBUTIONS.md` 和根文件一致。
- [x] 本地浏览器与生产预览检查怪物外形、撤退、区域门和管理员模式。
- [x] PR CI 已通过。

## 4. 实际证据（完成后填写）

- 自动化：最终 `pnpm test` 通过 33 个测试文件、212 项测试；多阶段 schema 刷新另以
  `AppShell.test.ts`、`sqlAutocomplete.test.ts` 共 26 项及 `tsc --noEmit` 定向验证。
  `python3 scripts/validate-rules.py` 通过 12 项 portable 规则检查，校验器自身 8 项回归也通过。
- 构建：`pnpm build` 通过；入口 JS 为 494.51 kB，Phaser 保持独立可缓存 Chunk，构建没有
  500 kB 主包警告。`dist/LICENSE` 与 `dist/ATTRIBUTIONS.md` 均和根文件逐字节一致。
- 浏览器：桌面实测撤退返回本层复活点且不重置双方生命；管理员模式可查看八层全图，
  第八层显示 12 个存活怪物、1 个首领、2 个区域门并可定位三个生态区；专用事故表正确标记
  “本题主表”，关闭预览后刷新恢复正式存档。控制台没有错误。独立 Vite 生产预览首页与
  659,730 字节 SQLite WASM 均返回 HTTP 200。
- PR 归档：[PR #22](https://github.com/Kkkirito-123/select-from-dungeon/pull/22)。
- `v1.0.0` 的 1280/390/640px、SQL 首击与触控证据仍保留在 Git 历史和 PR #20，不冒充为
  本版本新增功能的证据。

## 5. 已知人工边界

以下项目不由自动化或短浏览器冒烟检查替代：

- 真人从第一层连续游玩到第八层的完整浏览器录像/记录。
- 精确 320px 视口的逐屏视觉审查。
- 真实音频设备上的主观音乐、音量与音画时序试听。
- 专用屏幕阅读器和认证级 WCAG 对比度审计。
- 受限第三方 iframe 对本地存储和音频策略的真实宿主验收。
