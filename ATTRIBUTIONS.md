# Attributions and Source Register / 来源与归属清单

This repository's original implementation and prose are licensed under the
[MIT License](LICENSE). This register records external material consulted for
interoperability and design evidence. It does not relicense any third-party
work or imply endorsement by its owner.

本仓库的原创实现与文字采用 [MIT License](LICENSE)。本清单记录为兼容性和设计依据而查阅的
外部来源；它不会重新许可任何第三方作品，也不表示上游作者对本项目的认可。

Runtime code from the package-manager dependencies recorded below is bundled
into generated `dist/` output. No third-party image, font, audio, or substantial
expressive passage is vendored. Unless an entry says otherwise, documentation
and engineering-practice sources are reference-only: general methods or
published interface facts were independently implemented. Source names and
trademarks remain the property of their respective owners.

下方记录的包管理器运行依赖会进入生成的 `dist/` 构建。本仓库没有引入第三方图片、字体、音频
或实质性表达段落。除非条目另有说明，文档与工程实践来源仅作参考：本项目独立实现通用方法或
公开接口事实。来源名称和商标归各自权利人所有。

`pnpm build` copies the authoritative root `LICENSE` and this file byte-for-byte
into `dist/`. Those generated copies travel with the deployable static bundle;
edit only the root sources and rebuild instead of maintaining duplicate notices.

`pnpm build` 会把根目录权威 `LICENSE` 与本文件逐字节复制到 `dist/`，让许可和归属声明随可部署
静态包一起分发。只编辑根目录来源并重新构建，不得手工维护两份声明。

## Documentation and interoperability references / 文档与兼容性参考

### OpenAI Codex documentation

- Sources: [AGENTS.md guidance](https://developers.openai.com/codex/guides/agents-md)
  and [Codex Skills](https://developers.openai.com/codex/skills).
- Use: Agent-instruction discovery, Skill routing, and progressive disclosure.
- Status: public product documentation; no open-source license for the website
  content is relied upon. No documentation text or code is included.

### OpenAI Skill Creator

- Source: [Skill Creator and `openai.yaml` reference](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator).
- Use: Skill directory structure, metadata field names, and validation
  expectations.
- License: [Apache-2.0](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator/LICENSE.txt).
- Status: interoperable formats and independently authored repository files;
  no upstream script, asset, or instructional body is included.

### Anthropic Claude Code documentation

- Source: [Claude Code project memory](https://code.claude.com/docs/en/memory).
- Use: the thin `CLAUDE.md` import adapter.
- Status: public product documentation; no open-source license for the website
  content is relied upon. No documentation text or code is included.

### Agent Skills specification

- Source: [Agent Skills specification](https://agentskills.io/specification),
  repository revision
  [`38a2ff82958a`](https://github.com/agentskills/agentskills/tree/38a2ff82958afee88dadf4831509e6f7e9d8ef4e).
- Use: portable Skill frontmatter and directory conventions.
- License: [Apache-2.0](https://github.com/agentskills/agentskills/blob/38a2ff82958afee88dadf4831509e6f7e9d8ef4e/LICENSE).
- Status: specification-compatible independent implementation; no upstream
  source file is included.

## Automation dependencies / 自动化依赖

### actions/setup-node

- Source: [actions/setup-node at `48b55a011bda`](https://github.com/actions/setup-node/tree/48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e),
  released as `v6.4.0` when adopted.
- Use: provide the pinned Node.js runtime for GitHub Actions validation.
- License: [MIT](https://github.com/actions/setup-node/blob/48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e/LICENSE),
  copyright GitHub, Inc. and contributors.
- Status: remotely executed Action pinned to an immutable commit; no upstream
  source file is included in this repository.

### actions/checkout

- Source: [actions/checkout at `3d3c42e5aac5`](https://github.com/actions/checkout/tree/3d3c42e5aac5ba805825da76410c181273ba90b1),
  released as `v7.0.1` when adopted.
- Use: check out this repository in GitHub Actions validation jobs.
- License: [MIT](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/LICENSE),
  copyright GitHub, Inc. and contributors.
- Status: remotely executed Action pinned to an immutable commit; no upstream
  source file is included in this repository.

### actions/setup-python

- Source: [actions/setup-python at `5fda3b95a4ea`](https://github.com/actions/setup-python/tree/5fda3b95a4ea91299a34e894583c3862153e4b97),
  released as `v7.0.0` when adopted.
- Use: provide the pinned Python runtime for GitHub Actions validation jobs.
- License: [MIT](https://github.com/actions/setup-python/blob/5fda3b95a4ea91299a34e894583c3862153e4b97/LICENSE),
  copyright GitHub, Inc. and contributors.
- Status: remotely executed Action pinned to an immutable commit; no upstream
  source file is included in this repository.

## Runtime dependencies / 运行时依赖

### Phaser 4.2.1

- Source: [phaserjs/phaser at `41be1e462bc6`](https://github.com/phaserjs/phaser/tree/41be1e462bc600064e498cba370bfa8c5c055a22).
- Use: browser rendering, scenes, input, animation, scaling, and generated pixel
  game objects.
- License: MIT, copyright 2026 Richard Davey, Phaser Studio Inc.
- Status: installed through pnpm and bundled into generated JavaScript; no
  third-party art or example level is copied.

### sql.js 1.14.1 and SQLite WASM

- Source: [sql-js/sql.js at `01f58601309b`](https://github.com/sql-js/sql.js/tree/01f58601309b5e6684649dbfa0be44980ede94af).
- Use: execute the in-memory teaching database in the browser and bundle the
  SQLite WebAssembly binary.
- License: sql.js is MIT, copyright 2017 sql.js authors. SQLite itself is
  [dedicated to the public domain](https://www.sqlite.org/copyright.html).
- Status: installed through pnpm and bundled into generated JavaScript/WASM.

### Bundled MIT notices / 构建内 MIT 声明

The following notices apply to the generated runtime bundles:

```text
The MIT License (MIT)

Copyright (c) 2026 Richard Davey, Phaser Studio Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

MIT license

Copyright (c) 2017 sql.js authors (see upstream AUTHORS)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Original procedural audio / 原创程序化音频

The four first-floor exploration patterns (`C Major Circuit`, `Moonlight Data
Lake`, `Nocturne Cache`, and `Adagio Terminal`) use original note, rhythm,
synthesis, and sequencing data authored in `src/audio/ArcadeAudio.ts`; their
labels and broad harmonic vocabulary acknowledge public-domain classical
traditions without transcribing a named work.

The second-floor exploration playlist contains new in-code chiptune
arrangements of Beethoven's Symphony No. 5 first movement, *Für Elise*, and the
Moonlight Sonata first movement. Their underlying compositions were published
well before 1931 and are public domain in the United States. Every oscillator,
rhythm, sequence, and runtime performance in this project is newly authored;
no third-party recording or sample is bundled. The U.S. Copyright Office
separately distinguishes a musical composition from a sound recording:
[What is Copyright?](https://copyright.gov/what-is-copyright/) and
[Musical Compositions and Sound Recordings](https://www.copyright.gov/register/pa-sr.html).

All battle patterns, including the second-floor `Relation Storm Pursuit` and
`Conductor Singularity`, are original retro science-fiction arcade designs and
do not reproduce music from Seer or another game.

第一层四首探索曲式（`C 大调回路`、`月光数据湖`、`夜曲缓存`、`柔板终端`）的音符、节奏、合成
与编排数据均原创于 `src/audio/ArcadeAudio.ts`；曲名和宽泛和声语言向公版古典传统致意，不转录
具体作品。

第二层探索歌单由代码重新编排贝多芬第五交响曲第一乐章、《致爱丽丝》和《月光奏鸣曲》第一乐章
的芯片版本；这些底层作品早于 1931 年发表，在美国已进入公版。项目中的振荡器、节奏、序列和
运行时演奏均为新创作，没有打包第三方录音或采样。美国版权局分别说明了乐曲作品与录音作品的
区别，来源见上方链接。

包括第二层 `关系风暴追击` 与 `指挥家奇点` 在内的全部战斗曲均为原创复古科幻街机设计，没有
复制《赛尔号》或其他游戏音乐。

## Learning-game and combat-design references / 教学游戏与战斗设计参考

### SQLBolt

- Source: [SQLBolt interactive lessons](https://sqlbolt.com/).
- Use: one SQL concept followed immediately by a browser exercise, with a
  beginner-to-aggregate progression.
- Status: design reference only; no lesson text, schema, code, or asset is
  included.

### SQLNoir

- Source: [SQLNoir](https://www.sqlnoir.com/).
- Use: real SQL queries as the verb that advances a narrative, with the brief,
  schema, and editor available in one workspace.
- Status: design reference only; no case, text, schema, code, or asset is
  included.

### Database Detective: Minor Crimes Division

- Source: [official Steam listing](https://store.steampowered.com/app/3950130/Database_Detective_Minor_Crimes_Division/).
- Use: evidence that SQL can function as a polished game's core mechanic rather
  than a detached quiz surface.
- Status: design reference only; no game content or asset is included.

### Sea of Stars and Into the Breach

- Sources: [Sabotage Studio's Sea of Stars press kit](https://sabotagestudio.com/presskits/sea-of-stars/)
  and [Into the Breach's official Steam listing](https://store.steampowered.com/app/590380/Into_the_Breach/).
- Use: readable concept locks, explicitly telegraphed enemy actions, and a
  deliberate turn in which the player can choose the correct counter.
- Status: high-level interaction reference only; no rule implementation, text,
  art, audio, or other asset is copied.

### Hades

- Source: [Supergiant Games' official Hades page](https://www.supergiantgames.com/games/hades/).
- Use: high-level roguelite run structure: short connected encounters, visible
  room choices, temporary build rewards, and a Boss endpoint.
- Status: design reference only. The seeded room graph, prerequisite rules,
  rewards, text, visuals, audio, and implementation in this repository were
  independently created; no Hades code or asset is included.

### Phaser procedural-dungeon reference

- Source: [Phaser procedural dungeon tutorial index](https://phaser.io/news/2016/03/procedural-dungeon-tutorial).
- Use: evidence for expressing a dungeon as generated room connectivity rather
  than one fixed painted maze.
- Status: reference only. This repository uses its own deterministic hash,
  curriculum graph, 64x48 maze generator, physical-world validation, and
  prerequisite rules; no tutorial code, map, text, or asset is copied.

## Procedural-generation references / 程序生成参考

### Minecraft Creator: World Generation Overview

- Source: [World Generation Overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/world-generation?view=minecraft-bedrock-stable).
- Use: general reference for a versioned seed driving deterministic generation,
  organizing a world into technical partitions, and separating terrain,
  structure, feature, and entity passes.
- Status: public Microsoft/Minecraft product documentation used as a conceptual
  reference only. The maze algorithm and data model in this repository were
  independently authored; no documentation text, code, world, or asset is
  copied.
- 用途与状态：仅参考“种子、技术分区、分阶段生成”的通用方法；本项目独立实现，没有复制文档
  文字、代码、世界或素材。

### Minecraft Creator: Feature Rules

- Source: [Introduction to Features and Feature Rules](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/featuresintroduction?view=minecraft-bedrock-stable).
- Use: general reference for placing decorations in an explicit later pass and
  constraining feature distribution by location and environment rather than
  mixing it into topology generation.
- Status: public Microsoft/Minecraft product documentation used as a conceptual
  reference only. No schema, rule file, code, text, or asset is copied.
- 用途与状态：仅参考“装饰独立阶段与条件化放置”的通用方法；没有复制 Schema、规则文件、代码、
  文字或素材。

### Minecraft Creator: Jigsaw Structures

- Source: [Introduction to Jigsaw Structures](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/introductiontojigsawstructures?view=minecraft-bedrock-stable).
- Use: general reference for composing larger spaces from bounded structure
  pieces, connector constraints, and weighted template pools.
- Status: public Microsoft/Minecraft product documentation used as a conceptual
  reference only. SQL Demon Castle does not include Minecraft templates,
  structures, formats, code, text, or assets.
- 用途与状态：仅参考“有边界结构块、连接约束、加权模板池”的通用方法；项目没有包含 Minecraft
  模板、结构、格式、代码、文字或素材。

### Bob Nystrom: Rooms and Mazes

- Source: [Rooms and Mazes: A Procedural Dungeon Generator](https://journal.stuffwithstuff.com/2014/12/21/rooms-and-mazes/).
- Use: general reference for combining open rooms with carved maze corridors,
  connecting isolated regions, and retaining selected loops to reduce forced
  backtracking.
- Status: design reference only. This repository's generator, topology repair,
  validation, tests, map data, and visuals were independently authored; no
  article code, prose, diagram, generated map, or asset is copied.
- 用途与状态：仅参考“房间加迷宫、区域连通、适量环路”的通用方法；生成器、修复、校验、测试、
  地图数据与视觉均为独立实现，没有复制文章代码、文字、图示、地图或素材。

## Engineering-practice references / 工程实践参考

### Google Engineering Practices

- Source: [Small CL guidance](https://google.github.io/eng-practices/review/developer/small-cls.html),
  repository revision
  [`3bb3ec25b3b0`](https://github.com/google/eng-practices/tree/3bb3ec25b3b0199f4940b1aa75f0ac5c5753301c).
- Use: focused changes and reviewability.
- License: [CC-BY-3.0](https://github.com/google/eng-practices/blob/3bb3ec25b3b0199f4940b1aa75f0ac5c5753301c/LICENSE).
- Status: concepts only; no guide text is included.

### Microsoft Engineering Fundamentals Playbook

- Source: [Pull-request guidance](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/pull-requests/),
  repository revision
  [`016770e43d8a`](https://github.com/microsoft/code-with-engineering-playbook/tree/016770e43d8a75be87b98c000c049f07c4a6e6f8).
- Use: risk-based review and evidence practices.
- License: documentation is
  [CC-BY-4.0](https://github.com/microsoft/code-with-engineering-playbook/blob/016770e43d8a75be87b98c000c049f07c4a6e6f8/LICENSE);
  repository code has a separate
  [MIT notice](https://github.com/microsoft/code-with-engineering-playbook/blob/016770e43d8a75be87b98c000c049f07c4a6e6f8/LICENSE-CODE).
- Status: documentation concepts only; no project code or guide text is
  included.

## Agent-workflow references / Agent 工作流参考

### OpenGUI

- Source: [Core-Mate/OpenGUI](https://github.com/Core-Mate/OpenGUI/tree/7cf28b90866459e74300869766896f953761dd60).
- Use: concise repository-specific architecture and runtime-fact mapping.
- License: [Business Source License 1.1](https://github.com/Core-Mate/OpenGUI/blob/7cf28b90866459e74300869766896f953761dd60/LICENSE),
  with `Additional Use Grant: None`, Change Date `2030-04-29`, and Change
  License `Apache-2.0` for the audited revision.
- Status: design reference only; no OpenGUI code, text, asset, or production
  functionality is included.

### DeerFlow

- Source: [bytedance/deer-flow](https://github.com/bytedance/deer-flow/tree/1a1c5def0da35e8347009fe1fed8e0e2321b0ede).
- Use: root/module guidance layering and deterministic boundary checks.
- License: [MIT](https://github.com/bytedance/deer-flow/blob/1a1c5def0da35e8347009fe1fed8e0e2321b0ede/LICENSE),
  copyright ByteDance Ltd. and/or its affiliates and DeerFlow Authors.
- Status: design reference only; no source file is included.

### Tencent Technology Engineering article

- Source: [“AI代码生成率94%：我们用一个 Skill 跑通需求开发全流程”](https://mp.weixin.qq.com/s/mGGIbFyF4U1PrBJVdfgcvg).
- Use: staged narrowing, checkpoints, failure classification, evidence chains,
  and selective cross-session state.
- License: no public reuse license was identified for the article.
- Status: reference-only summary; no article text, screenshot, image, or code is
  included.

### obra/superpowers

- Source: [obra/superpowers](https://github.com/obra/superpowers/tree/d884ae04edebef577e82ff7c4e143debd0bbec99).
- Use: reusable workflow and checkpoint patterns.
- License: [MIT](https://github.com/obra/superpowers/blob/d884ae04edebef577e82ff7c4e143debd0bbec99/LICENSE),
  copyright Jesse Vincent.
- Status: concepts only; no source file is included.

### addyosmani/agent-skills

- Source: [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/2fbfa004a0192529bc997d103fc12f19a3804aab).
- Use: reusable Skill composition and coding-workflow patterns.
- License: [MIT](https://github.com/addyosmani/agent-skills/blob/2fbfa004a0192529bc997d103fc12f19a3804aab/LICENSE),
  copyright Addy Osmani.
- Status: concepts only; no source file is included.

### multica-ai/andrej-karpathy-skills

- Source: [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills/tree/2c606141936f1eeef17fa3043a72095b4765b9c2).
- Use: simplicity, surgical-change, and goal-driven coding discipline.
- License status: the audited
  [README declares MIT](https://github.com/multica-ai/andrej-karpathy-skills/blob/2c606141936f1eeef17fa3043a72095b4765b9c2/README.md#license),
  but that revision contains no standalone root license text. This is a
  community interpretation, not an official Andrej Karpathy repository.
- Status: concepts only; no quote, source file, or project rule is included.

## Maintenance rule / 维护规则

Before publishing a change that copies or modifies third-party code, prose,
images, prompts, schemas beyond interoperability facts, or other protected
material:

1. record the exact source revision and copied or modified files;
2. verify that the source license permits the intended use and distribution;
3. preserve every required copyright, license, attribution, change, and NOTICE
   statement in the correct scope;
4. confirm compatibility with this repository's MIT License; and
5. remove or independently rewrite the material when permission is absent or
   compatibility is unresolved.

发布复制或修改第三方代码、文字、图片、Prompt、超出兼容性事实的 Schema 或其他受保护材料
之前，必须记录精确来源和文件，核验许可范围，保留所需版权、许可证、归属、修改及 NOTICE
声明，确认与本仓库 MIT License 兼容；无法确认时必须移除或独立重写。
