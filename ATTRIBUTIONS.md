# Attributions and Source Register / 来源与归属清单

This repository's original implementation and prose are licensed under the
[MIT License](LICENSE). This register records external material consulted for
interoperability and design evidence. It does not relicense any third-party
work or imply endorsement by its owner.

本仓库的原创实现与文字采用 [MIT License](LICENSE)。本清单记录为兼容性和设计依据而查阅的
外部来源；它不会重新许可任何第三方作品，也不表示上游作者对本项目的认可。

Runtime code from the package-manager dependencies recorded below is bundled
into generated `dist/` output. The first two floor packs also include the
audited CC0 pixel-art files recorded in the dedicated section below. No
third-party font, audio, or substantial expressive passage is vendored. Unless
an entry says otherwise, documentation and engineering-practice sources are
reference-only: general methods or published interface facts were independently
implemented. Source names and trademarks remain the property of their
respective owners.

下方记录的包管理器运行依赖会进入生成的 `dist/` 构建；前两层资源包还会包含下文逐项登记的
CC0 像素图。本仓库没有引入第三方字体、音频或实质性表达段落。除非条目另有说明，文档与工程
实践来源仅作参考：本项目独立实现通用方法或公开接口事实。来源名称和商标归各自权利人所有。

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

### OpenZLAgent (optional)

- Source: [Kkkirito-123/OpenZLAgent at `e1d441afc1af`](https://github.com/Kkkirito-123/OpenZLAgent/tree/e1d441afc1af808e9f436aa80598542c449e9359).
- Use: optional Python-side OpenAI-compatible model client for one bounded,
  output-only Scribe response; no OpenZLAgent tool, memory, or MCP runtime is
  enabled.
- License: [MIT](https://github.com/Kkkirito-123/OpenZLAgent/blob/e1d441afc1af808e9f436aa80598542c449e9359/LICENSE),
  copyright 2026 OpenZLAgent.
- Status: installed only when the `agent` package's `openzl` extra is selected;
  no upstream source is vendored or included in the browser bundle.

## Vendored CC0 runtime art / 随包分发的 CC0 运行时美术

Of the vendored art, only the selected PNG files named below enter
`public/assets/floors/`; original ZIP
archives, editable Aseprite files, sample maps, previews, and community
extensions remain outside the runtime bundle. The immutable downloads,
per-file SHA-256 values, official-page license evidence, legal text, and
selection boundary are recorded under `assets/vendor/<source>/source.json`.
`scripts/assets/verify-runtime-assets.mjs` verifies each runtime copy against
that selected source.

只有下列精选 PNG 会进入 `public/assets/`；原始 ZIP、Aseprite 工程、示例地图、预览图和社区
扩展均不进入运行时包。不可变下载、逐文件 SHA-256、官方页面许可证据、法律文本与选择边界记录
在 `assets/vendor/<source>/source.json`，并由
`scripts/assets/verify-runtime-assets.mjs` 校验运行时副本。

### 0x72 — 16x16 DungeonTileset II

- Official source: [0x72 DungeonTileset II](https://0x72.itch.io/dungeontileset-ii).
- License: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/);
  attribution is not required.
- Runtime use: first-floor stone floor and low-wall atlases, one door pair, and
  one lever pair in `public/assets/floors/01-ember-archive/`.
- Inclusion boundary: selected upstream files only; no extension or community
  edit is included.

### Shade / Merchant Shade — 16x16 Puny World

- Official source: [16x16 Puny World](https://merchant-shade.itch.io/16x16-puny-world).
- License: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/);
  attribution is not required.
- Runtime use: second-floor sand, grass, cliff, tree, sign, and village
  structures in `public/assets/floors/02-tidal-archipelago/`.
- Inclusion boundary: the selected upstream overworld PNG only; sample maps and
  Tiled metadata are not shipped.

### Pixel Carvel / Foozle — Scallywag: Water and Islands

- Official source:
  [Scallywag — Water and Islands](https://foozlecc.itch.io/scallywag-water-islands).
- License: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/);
  both the official page and package README state CC0, and attribution is not
  required.
- Runtime use: second-floor water, coast, boat, reeds, rocks, and treasure
  frames in `public/assets/floors/02-tidal-archipelago/`.
- Inclusion boundary: the selected exported PNG only; editable Aseprite files
  remain source evidence and are not shipped.

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

## Project-generated audio / 项目自行生成音频

The concept packs under `docs/design/assets/region-01/` and
`docs/design/assets/music-ascent-v1/` contain project-original procedural WAV
previews generated from declared note data by
`scripts/generate-concept-audio.mjs` and
`scripts/generate-music-ascent-previews.mjs`. They use no sample, SoundFont,
external recording, imported MIDI, or third-party melody. The WAV files are
review material and are not loaded by the runtime bundle. The first pair under
`region-01/` is retained as a rejected sharpness reference; the ascent pack is
retained as a pre-implementation direction record, while
`src/audio/musicScore.ts` is the current runtime score.

The concept PNG files under `region-01/` and `mvp2/` were generated from
original project prompts and direction, then reviewed as visual references.
The MVP 2.0 character sheet used the repository's own scribe concept as its
only image reference. No third-party image was provided as an input or copied.
They are not production sprites, tiles, or runtime assets.

`docs/design/assets/region-01/` 与 `docs/design/assets/music-ascent-v1/` 下的 WAV
试听由 `scripts/generate-concept-audio.mjs` 和
`scripts/generate-music-ascent-previews.mjs` 根据项目原创的声明式音符数据生成，不使用
采样、SoundFont、外部录音、导入 MIDI 或第三方旋律；它们只用于评审，不进入运行时 Bundle。
其中 `region-01/` 的首轮两首保留为尖锐感淘汰对照，音乐上升包保留为实施前方向记录；
当前运行乐谱以 `src/audio/musicScore.ts` 为准。

`region-01/` 与 `mvp2/` 下的概念 PNG 来自项目原创提示词与方向，并经过人工用途审查；
MVP 2.0 角色阵容只使用仓库自有的抄写员概念图作为图片参考。生成过程没有输入或复制第三方
图片。它们不是正式 Sprite、Tile 或运行时素材。

The F1/F2 runtime score under `public/assets/audio/` is generated by
`scripts/generate-runtime-classical-audio.mjs`. It independently enters short
themes from Mozart's public-domain K.265 and Handel's public-domain
*Water Music*, then supplies project-owned harmony, form, rhythm, synthesis,
mixing, performance, and recordings. No modern performance, commercial game
track, sample, SoundFont, imported MIDI, score scan, or streaming-platform file
is used. OGG and MP3 are alternate encodings of the same project-generated
masters; exact sources, rights reasoning, durations, byte sizes, and SHA-256
hashes are recorded in `public/assets/audio/audio-source.json` and
`assets/audio/public-domain-arrangements/audio-source.json`.

第一、第二层位于 `public/assets/audio/` 的运行时音乐由
`scripts/generate-runtime-classical-audio.mjs` 生成。脚本独立录入莫扎特公版 K.265 与亨德尔
公版《水上音乐》的短主题，再由项目自行完成和声、曲式、节奏、合成、混音、演奏与录音。它不使用
现代演奏录音、商业游戏音乐、采样、SoundFont、导入 MIDI、乐谱扫描件或流媒体文件。OGG 与 MP3
只是同一项目自制母带的兼容编码；具体来源、权利依据、时长、字节数和 SHA-256 记录在
`public/assets/audio/audio-source.json` 与
`assets/audio/public-domain-arrangements/audio-source.json`。

Floors 3–8 retain the small real-time procedural score in
`src/audio/musicScore.ts` as a compatibility fallback. It never loads the
F1/F2 recordings or any commercial game audio. In particular, no music from
*Seer* is copied, transposed, sampled, or arranged.

第三至第八层暂时保留 `src/audio/musicScore.ts` 的轻量实时程序化乐谱作为兼容降级；它不会加载
第一、第二层录音或任何商业游戏音频。尤其不会复制、变调、采样或改编《赛尔号》音乐。

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
  curriculum graph, current 48x36 generator-v5 blueprints, legacy 64x48
  generator-v4 compatibility, physical-world validation, and prerequisite
  rules; no tutorial code, map, text, or asset is copied.

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
