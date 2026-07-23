# Repository Guide for AI Coding Agents

This file is the English operating authority for this repository. Read it before
working here, then read the closest nested `AGENTS.md` if one is added later.
`AGENTS.zh-CN.md` is the synchronized human-facing Chinese translation, and
`CLAUDE.md` remains a thin import of this file.

## Working Contract

- Reply in Chinese unless the user requests another language. Use UTF-8;
  identifiers, APIs, and tests follow the codebase language.
- Serve one explicit objective at a time. Inspect Git status, owning source,
  tests, contracts, and relevant documentation before editing.
- Preserve unrelated user work. Do not overwrite, roll back, delete, publish,
  reformat, or expose unrelated content without explicit authorization.
- Before a feature, refactor, deletion, dependency or schema change, batch edit,
  global configuration change, or other high-impact work, present the goal,
  users or stakeholders, MVP, non-goals, expected file scope, acceptance
  criteria, assumptions, validation, and risks, then wait for approval.
- Prefer the smallest coherent vertical slice. Do not add speculative features,
  abstractions, compatibility paths, dependencies, or documentation.
- Distinguish implementation, environment, validation-path, and tool failures.
  Do not repeat a materially identical failed attempt more than three times.
- Claim only checks that actually ran and distinguish unit, type, build,
  browser, provider, device, and end-to-end evidence.
- Local inspection and validation do not authorize Commit, Push, PR, deployment,
  destructive actions, or other external writes. Those need separate explicit
  authorization.

## Product and Users

`SQL 魔王城 / SELECT * FROM DUNGEON` is a Chinese browser roguelite for SQL
beginners and interview learners. The current MVP is a two-floor Run; each floor
is a deterministic 64x48 continuous seeded maze, divided into 16x16 technical
partitions and braided with extra loops to reduce dead-end backtracking. Players reveal the
non-interactive minimap by physically walking the maze. Moving into a named
curriculum monster or passing an encounter check starts a separate
single-target battle where the player writes complete read-only SQL. The Run
starts at two hearts, uses deterministic one-heart counters, awards rank-based
XP, explains acquired loot, automatically opens a short non-interactive portal
after the first-floor `HAVING` Boss, and ends at a second-floor composite
`JOIN` Boss.
Ordinary world monsters take one slow patrol step about every 1,100 ms while
exploration is active.

The current product deliberately does not include AI generation, accounts,
leaderboards, multiplayer, a server database, or a faithful MySQL
optimizer/InnoDB runtime. The seed randomizes the physical maze and non-critical
rewards, but not required SQL data, prerequisite lessons, or key weapons. The
first floor teaches `SELECT` through `HAVING`; the harder second floor teaches
`ORDER BY / LIMIT`, `DISTINCT`, `INNER JOIN`, `LEFT JOIN`, and a composite
`JOIN` query. These ten lesson groups are not the complete SQL or MySQL
interview curriculum.

## Architecture and Execution Flow

```text
index.html -> src/main.ts
  -> AppShell (DOM HUD, discovery minimap, onboarding, SQL terminal, evidence)
  -> GameSession (authoritative maze, actors, fog, combat, loot, profile)
  -> RunGraph (curriculum dependency and point-of-interest graph)
  -> MazeGenerator/MazeValidation (deterministic 64x48 physical world)
  -> EncounterDirector (deterministic step meter, safe windows, ambush choice)
  -> MonsterRoaming (deterministic slow patrol decisions)
  -> SqlEngine (in-memory SQLite WASM, seed data, SELECT execution, HP sync)
  -> lessonEvaluator (query features, lesson locks, result semantics)
  -> DungeonScene (continuous maze, fog, collision, patrol, same-tile encounter)
  -> BattleScene (separate duel arena, HP bars, intent, combat animation)
  -> FeedbackDirector (semantic event -> one notice and one audio cue)
  -> ArcadeAudio (randomized electronic-classical exploration loops, original
                  high-energy battle music, and event SFX)
  -> OnboardingController (move -> encounter -> terminal -> query -> pickup)

player movement -> MazeFloor collision/gates -> fog, pickup, or encounter meter
player SQL -> read-only policy -> SQLite result + EXPLAIN QUERY PLAN
  -> result semantics + lesson-lock validation -> auto attack or enemy counter
  -> HP update in GameSession and SQLite -> Phaser/UI refresh
  -> debounced v4 Run save + permanent v2 profile save
```

`GameSession` owns physical movement, encounter meter, lesson, actor, fog,
combat, HP, XP, loot, and profile truth. `RunGraph` is the curriculum dependency graph; it is not the
physical navigation model. `MazeFloor` is the saved physical world, including
tiles, zones, gates, anchors, and decoration. `DungeonScene` renders that world,
collects input, and schedules the roughly 1,100 ms patrol tick, while
`BattleScene` renders combat events; neither may calculate combat rules. The
AppShell minimap is discovery evidence only and must never teleport the player.
`FeedbackDirector` maps a semantic event to its runtime Web Audio cue and
optional notice, `EncounterDirector` makes repeatable successful-step ambush
decisions without rerolling on reload, and `OnboardingController` owns the
separately persisted step-by-step tutorial.

`SqlEngine` owns the `monsters`, `monster_signals`, `rooms`, and `monster_gear`
in-memory schema and query execution; UI code must not bypass its read-only policy. `lessonEvaluator`
accepts equivalent SQL only when both result semantics and the current concept
locks pass. First-floor lessons are intentionally limited to one flat `SELECT`
without `OR`, subqueries, or set operators so required predicates cannot be
hidden in a dead branch. The same one-statement boundary applies to second-floor
sorting and join lessons, whose relationship predicates are checked as part of
the concept lock. Shared curriculum data and fixed drops live in
`src/content/mvpLevel.ts`, with second-floor content in
`src/content/floor2Level.ts`; room flavor and run rewards live in
`src/content/runContent.ts`; onboarding copy lives in
`src/content/onboarding.ts`. SQL stages intentionally start blank.

## Repository Map

```text
src/audio/          Original procedural Web Audio music loops and event SFX
src/content/        Curriculum, entities, fixed weapons, rewards, onboarding copy
src/domain/         Pure state, combat rules, course graph, physical maze,
                    validation, roaming, semantic evaluation, and query policy
src/feedback/       Semantic gameplay-event routing to notices and audio cues
src/game/           Continuous-maze exploration, battle scene, and bootstrap
src/sql/            SQLite WASM initialization, schema, execution, HP sync
src/storage/        Versioned maze Run/profile local-storage validation/recovery
src/ui/             DOM shell, onboarding state, and SQL/game orchestration
tests/              Vitest tests for rules, maze, roaming, feedback, storage,
                    onboarding, and query policy
.agents/skills/     Requirement, bootstrap, delivery, implementation, guide-sync,
                    and explicit-publication workflows
scripts/            Portable repository-rule validator and its regression tests
.github/workflows/  Read-only CI for rules, tests, types, and production build
dist/               Generated static build; ignored and never hand-edited
```

There is no nested module guide because the repository is still small and uses
one setup and quality gate.

## Canonical Commands

Requirements: Node.js `>=20.19` and pnpm `11.9.0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
```

`pnpm build` runs TypeScript checking before the Vite production build. The
static output is `dist/`; serve it through HTTP rather than opening files through
`file://` because the WASM asset must be fetched normally.

## Runtime and Safety Boundaries

- SQL runs entirely in the browser through `sql.js`/SQLite WASM. No query or
  gameplay data is sent to a backend.
- The battle terminal accepts one `SELECT` statement. DML, DDL, `PRAGMA`,
  `ATTACH`, and multi-statement input are rejected before execution. Results are
  capped at 50 displayed rows.
- First-floor grading further limits answers to one flat `SELECT` without `OR`,
  subqueries, `UNION`, `INTERSECT`, or `EXCEPT`. Table-qualified columns and the
  required `total` alias in `HAVING` are supported.
- SQLite `EXPLAIN QUERY PLAN` drives the current I/O-heat teaching signal. It is
  SQLite evidence, not a MySQL execution plan. Future MySQL/InnoDB concepts must
  be clearly labeled simulations or use a separately isolated real backend.
- Save data is browser-local and split between
  `select-from-dungeon:run:v4` (current floor, maze, actors, ground items, fog,
  encounter meter, level/XP, and disposable current Run state),
  `select-from-dungeon:profile:v2` (ten mastered lessons, attempts, victories, best
  query count), and `select-from-dungeon:onboarding:v1` (finished/skipped guide
  state). Legacy Run keys are neither loaded nor deleted; a valid
  `select-from-dungeon:profile:v1` is migrated into v2. Snapshot-driven
  persistence is debounced in `src/main.ts`; changing a shape requires a version
  or recovery decision.
- Core learning drops are deterministic. Randomness must never block curriculum
  progress. Combat damage is deterministic so SQL targeting remains inspectable.
- A new Run starts at two hearts. Normal, elite, and Boss victories award 1, 3,
  and 5 XP; cumulative level thresholds are 2, 4, 6, 8, then continue in
  four-XP steps through 24. Level-ups add one maximum heart and restore one
  heart per level gained.
- One SQL submission is one combat turn, with no timer while thinking or typing.
  Correct results only trigger the player attack; wrong results and syntax
  errors trigger the telegraphed enemy counter. Empty input consumes no turn.
- The 64x48 `MazeFloor` records 16x16 technical partitions and adds deterministic
  loops after carving to reduce dead ends. Players must walk through the
  continuous world; the discovery minimap is not a navigation control. Moving
  into the same tile as a living curriculum monster or triggering the
  successful-step encounter meter starts the separate battle scene. Safe steps
  prevent immediate ambush chains. Ordinary world monsters patrol slowly; the
  Boss remains anchored.
- Collecting the first-floor key enters `transition` mode. AppShell displays the
  portal and calls `GameSession.advanceFloor()` after about 1.2 seconds without
  requiring movement or `E`; level, XP, weapon, relics, and query count carry
  into a newly generated harder floor while per-floor maze and lesson state reset.
- Loose monster drops use touch collection and are picked up by walking over
  them. A non-blocking card names every acquired item and explains its effect.
  Altars, treasure chests, and campfires use `E` investigation. Critical
  curriculum gear remains deterministic and reachable.
- Web Audio music and event cues are authored in project code. First-floor
  exploration rotates four lyrical electronic-classical patterns; second-floor
  exploration rotates three in-code chiptune arrangements of public-domain
  Beethoven compositions. Combat switches to original high-energy retro sci-fi
  patterns and never uses a copied game recording or melody.
  Movement, wall
  bumps, encounters, query casts, hits, damage, stage clears, drops, pickups,
  gates, victory, and defeat have distinct feedback; reduced-motion preferences
  may suppress motion effects without suppressing gameplay state.
- Pixel characters, tiles, room decoration, music, and sound effects are
  generated from project code. Do not add third-party art, fonts, audio, or
  copied level text without a license review and attribution update.
- Runtime dependencies are pinned in `package.json` and `pnpm-lock.yaml`.
  Dependency changes remain approval-gated and require license, bundle, build,
  and browser checks proportional to risk.
- Never expose credentials, personal data, private endpoints, or sensitive local
  content in code, fixtures, logs, screenshots, manifests, or reports.

## Repository Skills and Delivery

Reusable workflows live under `.agents/skills/`:

```text
unapproved or ambiguous change -> $define-requirement -> approval
first approved bootstrap        -> $bootstrap-repository
approved substantive delivery   -> $deliver-change
  -> $implement-change -> validation/review -> $sync-project-guide
localized low-risk slice        -> $implement-change -> sync decision
guide/README-only work           -> $sync-project-guide
reviewed local result + separate publication authority -> $publish-change
```

Clients without native Skill discovery must read the routed
`.agents/skills/<skill-name>/SKILL.md`. Missing Skills are reported and never
claimed as executed. `$publish-change` never triggers implicitly.

## Architecture Sync and Evidence

Update the closest guide when a change alters durable layout, ownership, flow,
commands, configuration, storage, schema, security, compatibility, workflow,
quality gates, generated-code ownership, license, or distribution facts. Update
the root guide for repository-wide facts and keep the Chinese translation
synchronized. Make a separate README decision for user-facing setup or behavior.

Final delivery reports state changed files, checks and fresh results,
discoveries, unverified areas, remaining risks, and one of
`GUIDE_UPDATED`/`GUIDE_NO_UPDATE` plus
`README_UPDATED`/`README_NO_UPDATE`. Review the complete Diff before completion.

The repository's original code and prose use the root MIT `LICENSE`. Retained
template material keeps its original notice, and third-party runtime notices and
reference sources remain recorded in `ATTRIBUTIONS.md`.
