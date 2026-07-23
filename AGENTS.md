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
beginners and interview learners. The current MVP is a four-floor Run; each floor
is a deterministic 64x48 continuous seeded maze, divided into 16x16 technical
partitions and braided with extra loops to reduce dead-end backtracking. Players reveal the
non-interactive minimap by physically walking the maze. Moving into a named
curriculum monster or passing an encounter check starts a separate
single-target battle where the player writes complete read-only SQL. The Run
starts at two hearts, uses deterministic one-damage counters with armor-first
absorption, awards rank-based XP with a visible post-battle settlement, and
puts every curriculum reward in an
`E`-opened loot bundle, explains acquired loot, automatically
opens a short non-interactive portal after each of the first three floor Bosses,
and ends at a fourth-floor recursive-CTE Boss. Step-meter ambushes award XP and
may produce only optional low-probability loot. Outside safe zones, each
eligible successful step has a 2% base ambush chance and the meter guarantees an
encounter after 30 eligible quiet steps; reloads do not reroll the result.
Each floor also contains three seeded physical campfires across the front,
middle, and rear learning phases. The same seed also derives main-course route
beacons, one-use supplies in every remaining dead end, and one guaranteed-key
two-way shortcut. Route points stay at most 18 walking steps apart; the key sits
in the middle or rear phase, does not consume inventory capacity, and never
depends on random loot. The player must physically reach the key, then press
`E` beside the shortcut to open it permanently and travel through it, so the
shortcut reduces repeat walking without bypassing required SQL.
Campfire visible safe zones, plus the entrance
zone, suppress ambushes and patrol entry. Pressing `E` beside a campfire offers
`在此休息` and `答案复盘`; resting restores maximum HP and makes that fire the
checkpoint. Death keeps Run progress and the enemy's remaining HP, shows
`YOU DIED`, returns to the last rested campfire (or the floor entrance), restores
HP, and opens the latest-battle review.
The Run also has a 12-slot equipment inventory, one equipped weapon, one
equipped armor, and three consumable stacks capped at five items each. `B`
opens inventory management only during exploration or from a campfire and
pauses movement and patrols. Armor HP absorbs counters before base HP and is
restored by campfire rest or respawn. Defeated monsters resolve independent
seeded low-probability candidates into one `E`-opened loot bundle with at most
three non-key items; elites and Bosses enforce minimum loot, course rewards and
keys stay deterministic, and reload, rest, or death never rerolls an existing
bundle. Full bags require explicit replacement, ordinary discards remain
recoverable on the current floor, and protected base/course/key items cannot be
discarded.
Ordinary world monsters take one slow patrol step about every 1,100 ms while
exploration is active. Each floor's locked Boss gate also exposes one optional
high-difficulty SQL breach: a correct composite query opens only that physical
gate, while a wrong or invalid query deals one armor-first damage and never
grants mastery, XP, or loot.
The top-console `答题复盘` view reads a browser-local answer log for the latest
battle and current floor. Each record contains the submitted SQL, explicit
reference SQL, result category, hint level, and battle outcome. The log is
capped at 200 SQL turns, never records movement or key presses, and is never
uploaded.
Authored monster display names stay direct and easy to type: two or three
Chinese characters such as `史莱姆`, `水胶怪`, or `幼龙`, without middle-dot
epithets or SQL-concept suffixes. Future floors must follow the same rule; SQL
meaning belongs in fields, objectives, and encounter mechanics rather than the
display name.
The v0.6 campaign framework defines and validates all eight planned floors,
including their ordered lesson prerequisites, three exercise tiers, five
encounter roles, theme/topology, monster/equipment/loot pools, deterministic
completion rewards, and runtime evidence boundary. The current executable
content covers floors one through four; the remaining four slots are saved
scaffolding, not a claim that those floors are playable yet.
The runtime derives three deterministic biome regions per executable floor
from the saved maze instead of persisting duplicate geometry. Floor one uses a
drainage channel, slime pool, and ember cellar; floor two uses a lake, swamp,
and forest; floor three uses a bone yard, grave mire, and spirit crypt; floor
four uses a fire forge, frost vault, and storm core. Ambushes draw only from the
current biome pool, with seeded 5%, 7%, 9%, and 11% mini-elite weights by floor.
Authored optional area Bosses use multi-stage floor-appropriate exercises, award
3 XP, and guarantee at least two themed drops. These actors never enter
entrance/campfire safe zones and do not gate curriculum completion.

The current product deliberately does not include AI generation, accounts,
leaderboards, multiplayer, a server database, or a faithful MySQL
optimizer/InnoDB runtime. Floors five through eight are not implemented. The
seed randomizes the physical maze,
non-critical room rewards, and optional loot, but not required SQL data,
prerequisite lessons, or key weapons. The first floor teaches `SELECT` through
`HAVING`; the harder second floor teaches `ORDER BY / LIMIT`, `DISTINCT`,
`INNER JOIN`, `LEFT JOIN`, and a composite `JOIN` query. Floor three adds inner,
left, self, and chained joins plus `UNION`; floor four adds scalar, `IN`,
`EXISTS`, correlated subqueries, CTEs, and recursive CTEs. These 22 lesson
groups are not the complete SQL or MySQL interview curriculum.

## Architecture and Execution Flow

```text
index.html -> src/main.ts
  -> AppShell (DOM HUD, minimap, inventory/loot, SQL terminal, local review)
  -> SqlAutocomplete (complete-schema vocabulary, ranking, replacement, listbox)
  -> SqlSchemaCatalog (canonical fields, types, generated DDL, teaching relations)
  -> FloorContracts (eight-floor curriculum, encounter, theme, and loot schema)
  -> GameSession (authoritative maze, combat, loot, answer log, profile)
  -> CampaignDomain (ordered eight-floor slots and transition invariants)
  -> RunGraph (curriculum dependency and point-of-interest graph)
  -> MazeGenerator/MazeValidation (deterministic 64x48 physical world)
  -> CampfireDomain (three seeded checkpoints and shared safe-cell masks)
  -> GuidedMap (route beacons, dead-end caches, guaranteed key, shortcut)
  -> BiomeDomain (derived regions, static features, safe area-Boss anchors)
  -> EncounterDirector (deterministic step meter, safe windows, ambush choice)
  -> MonsterRoaming (deterministic slow patrol decisions)
  -> LootDirector (seeded independent candidates, rank minimums, deduplication)
  -> SqlEngine (in-memory SQLite WASM, seed data, SELECT/WITH execution, HP sync)
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
  -> debounced v9 Run save + permanent v2 profile save
```

`GameSession` owns physical movement, campfires/checkpoints, guided-map
interaction state, safe zones,
encounter meter, lesson, actor, fog, combat, HP, armor, inventory, seeded loot,
answer-history, and profile truth. `RunGraph` is the curriculum dependency
graph; it is not the physical navigation model. `MazeFloor` is the saved
physical world, including
tiles, zones, gates, anchors, and decoration. `DungeonScene` renders that world,
collects input, and schedules the roughly 1,100 ms patrol tick, while
`BattleScene` renders combat events; neither may calculate combat rules. The
AppShell minimap is discovery evidence only and must never teleport the player.
`FeedbackDirector` maps a semantic event to its runtime Web Audio cue and
optional notice, `EncounterDirector` makes repeatable successful-step ambush
decisions without rerolling on reload, and `OnboardingController` owns the
separately persisted step-by-step tutorial.

`src/content/sqlSchema.ts` owns the canonical field/type/nullability metadata,
generated DDL, and teaching relationships for `monsters`, `monster_signals`,
`rooms`, and `monster_gear`. `SqlEngine` executes that DDL and owns in-memory
query execution; UI code must not duplicate the table definitions or bypass its
read-only policy. The catalog relationships are JOIN guidance, not declared
SQLite `FOREIGN KEY` constraints. `lessonEvaluator`
accepts equivalent SQL only when both result semantics and the current concept
locks pass. First-floor lessons are intentionally limited to one flat `SELECT`
without `OR`, subqueries, or set operators so required predicates cannot be
hidden in a dead branch. The same one-statement boundary applies to second-floor
sorting and join lessons, whose relationship predicates are checked as part of
the concept lock. Shared curriculum data and fixed drops live in
`src/content/mvpLevel.ts`, with later executable floors in
`src/content/floor2Level.ts`, `floor3Level.ts`, and `floor4Level.ts`; room flavor and run rewards live in
`src/content/runContent.ts`; optional Boss-gate questions and semantic result
contracts live in `src/content/gateChallenges.ts`; onboarding copy lives in
`src/content/onboarding.ts`. SQL stages intentionally start blank.
`src/content/inventoryCatalog.ts` owns inventory capacities, the current
weapon/armor/consumable catalog, and biome-based optional candidate probabilities;
`src/domain/lootDirector.ts` owns deterministic independent rolls, rank minimums,
same-battle deduplication, unique-equipment conversion, and the three-item cap.
`src/content/biomeContent.ts` owns the executable four-floor biome encounter
pools and optional multi-stage exercises. `src/domain/biome.ts` derives region
ownership, static features, and area-Boss positions from the maze, campfires,
guided map, and seed; this plan is rebuilt during load and is not serialized.
`src/content/floorContracts.ts` is the canonical eight-floor future-content
schema. `src/domain/campaign.ts` owns its serializable ordered floor slots and
must reject skipped, duplicated, or rerolled transitions. This campaign
scaffolding must not silently route an unimplemented floor through any implemented
content.
`src/ui/sqlAutocomplete.ts` owns deterministic suggestions derived from the
complete canonical schema, current task context, and MVP SQL vocabulary. It may
replace only the active token after explicit keyboard or pointer acceptance; it
must not generate a complete answer, submit a query, or bypass lesson
evaluation.

## Repository Map

```text
src/audio/          Original procedural Web Audio music loops and event SFX
src/content/        Curriculum, canonical SQL schema, entities, fixed weapons,
                    rewards, and onboarding copy
src/domain/         Pure state, combat rules, course graph, physical maze,
                    validation, roaming, semantic evaluation, and query policy
src/feedback/       Semantic gameplay-event routing to notices and audio cues
src/game/           Continuous-maze exploration, battle scene, and bootstrap
src/sql/            SQLite WASM initialization, schema, execution, HP sync
src/storage/        Versioned maze Run/profile local-storage validation/recovery
src/ui/             DOM shell, onboarding state, and SQL/game orchestration
tests/              Vitest tests for rules, maze, roaming, feedback, storage,
                    onboarding, and query policy
docs/               Current bilingual blueprints, one active roadmap, future
                    candidate designs under docs/design/, and historical reports
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
- The battle terminal accepts one read-only `SELECT` or `WITH` statement. DML, DDL, `PRAGMA`,
  `ATTACH`, and multi-statement input are rejected before execution. Results are
  capped at 50 displayed rows.
- Both SQL textareas provide an IDE-like `PLAN ASSIST` listbox. Typing a prefix
  opens ranked keyword, function, canonical table, and complete field
  suggestions; `Ctrl/Command + Space` opens contextual suggestions, arrows move
  selection, `Enter`/`Tab` or pointer input accepts, and `Escape` dismisses
  suggestions before it closes the terminal. Qualified aliases such as `m.`
  show only fields from the resolved table. Accepting a suggestion never submits
  or counts as a query.
- The permanent Schema Codex exposes all four tables and 22 fields with type,
  nullability, primary-key, and logical-relation metadata. Its tabs support
  click, arrows, `Home`, and `End`; both terminals also expose a collapsed
  complete-field reference without changing the current lesson objective.
- First-floor grading further limits answers to one flat `SELECT` without `OR`,
  subqueries, `UNION`, `INTERSECT`, or `EXCEPT`. Table-qualified columns and the
  required `total` alias in `HAVING` are supported.
- SQLite `EXPLAIN QUERY PLAN` drives the current I/O-heat teaching signal. It is
  SQLite evidence, not a MySQL execution plan. Future MySQL/InnoDB concepts must
  be clearly labeled simulations or use a separately isolated real backend.
- Save data is browser-local and split between
  `select-from-dungeon:run:v9` (eight-floor campaign slots plus current floor,
  maze, actors, ground items, loot
  bundles, inventory, armor, consumables, unique-item history, key items, fog,
  three campfires, the active checkpoint, encounter meter, level/XP, opened
  challenge gates/shortcuts/dead-end caches, active gate challenge, at most 200
  local answer records, and disposable current Run state),
  `select-from-dungeon:profile:v2` (22 mastered lessons, attempts, victories, best
  query count), and `select-from-dungeon:onboarding:v1` (finished/skipped guide
  state). A valid `select-from-dungeon:run:v8` is migrated in memory into v9
  with deterministic eight-floor campaign slots. A valid `run:v7` is then
  migrated with empty inventory/loot state and acquired equipped gear
  registered; valid `run:v6`, `run:v5`, and `run:v4` data continue through the
  existing migrations before v9. Legacy keys remain undeleted; older Run keys remain
  unread.
  A valid `select-from-dungeon:profile:v1` is migrated into v2, and a pre-v0.8
  v2 profile is backfilled with the new lesson counters. Snapshot-driven
  persistence is debounced in `src/main.ts`; changing a shape requires a
  version or recovery decision.
- Core learning drops and keys are deterministic. Optional items use independent
  deterministic candidate rolls, rank-based minimums, same-battle deduplication,
  and at most three non-key items per bundle. Randomness must never block
  curriculum progress or reroll an existing bundle. Combat damage is
  deterministic so SQL targeting remains inspectable.
- A new Run starts at two hearts. Normal, elite, and Boss victories award 1, 3,
  and 5 XP; cumulative level thresholds are 2, 4, 6, 8, then continue in
  four-XP steps through 24. Level-ups add one maximum heart and restore one
  heart per level gained.
- One SQL submission is one combat turn, with no timer while thinking or typing.
  Correct results only trigger the player attack; wrong results and syntax
  errors trigger the telegraphed enemy counter. Empty input consumes no turn.
- Standing beside a locked Boss gate and pressing `E` opens an optional
  `QUERY BREACH` terminal. Floor one requires a composite
  `JOIN + WHERE + COUNT + GROUP BY + HAVING + ORDER BY` query; floor two adds
  `LEFT JOIN`, `COUNT(DISTINCT ...)`, and `LIMIT`; floor three uses a three-table
  gear audit; floor four uses a CTE with grouped maximum power. Both query features and exact
  result semantics are validated. Success opens only that physical gate and
  grants no mastery, attempts, XP, or loot. Wrong results and syntax errors deal
  one armor-first damage; empty input and `Escape` consume nothing.
- The 64x48 `MazeFloor` records 16x16 technical partitions and adds deterministic
  loops after carving to reduce dead ends. Players must walk through the
  continuous world; the discovery minimap is not a navigation control. Moving
  into the same tile as a living curriculum monster or triggering the
  successful-step encounter meter starts the separate battle scene. After its
  safe window, the meter applies a 2% base chance on each eligible successful
  step and guarantees a battle at 30 eligible quiet steps. Entrance and
  campfire safe zones never advance this encounter risk, never spawn enemies,
  and reject patrol entry. Ordinary world monsters patrol slowly; the Boss
  remains anchored.
- `GuidedMap` is derived deterministically from the curriculum graph, saved
  `MazeFloor`, and three campfires rather than duplicated in save data. Route
  beacons appear about every 14 steps with no gap above 18, and every remaining
  corridor dead end contains a one-use supply. Each floor currently has exactly
  one two-way shortcut and one guaranteed middle/rear key that consumes no
  inventory slot. Opening requires both the key and the shortcut's course
  prerequisites; opening, rest, and death never reroll or relock it.
- Collecting a key on floors one through three enters `transition` mode.
  AppShell displays the gold `FLOOR NN CLEARED / CONGRATULATIONS!!` feedback and calls
  `GameSession.advanceFloor()` after about 1.5 seconds without requiring
  movement or `E`; level, XP, equipment, inventory, consumables, key items,
  relics, and query count carry into a newly generated harder floor while
  per-floor maze and lesson state reset.
- Every victory shows an explicit XP settlement. A non-empty result leaves one
  `E`-opened loot bundle on the defeated monster's tile; curriculum bundles
  include their deterministic reward, while ambush bundles contain only
  optional seeded candidates and may be empty. Acquisition copy names every
  item and its exact effect. Settlement and acquisition cards dismiss after
  three later successful movement steps. Legacy loose drops remain
  touch-collectable, while altars, treasure rooms, and campfires also use `E`.
  Critical curriculum gear remains deterministic and reachable.
- The inventory has 12 equipment slots, one weapon slot, one armor slot, and
  three consumable stacks of at most five. Equipped items do not consume
  inventory slots. Inventory is available from exploration and campfires, blocks
  movement and patrols while open, and is unavailable during combat. Armor
  absorbs incoming damage before HP; campfire rest and respawn restore equipped
  armor. Full equipment inventory requires an explicit replace target and leaves
  the displaced item in the open bundle. Ordinary equipment/consumables can be
  dropped at the player's feet and recovered until floor transition; protected
  base/course items and keys cannot be discarded.
- A physical campfire blocks its center tile and opens its two-action menu from
  an adjacent tile. `在此休息` restores maximum HP and updates the checkpoint;
  `答案复盘` shows the current floor. Defeat is a short state transition, not a
  Run reset: after about 1.2 seconds the player respawns at the checkpoint or
  entrance with full HP, while mastery, XP, gear, doors, defeated enemies, and
  the surviving enemy's current HP remain intact. The automatically opened
  review is scoped to the battle that caused death.
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
