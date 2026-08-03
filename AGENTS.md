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
beginners and interview learners. The MVP 2.0 Run has eight deterministic
`48x36` generator-v5 maps. Each floor uses an authored macro silhouette, stable
room slots, 2–4 tile-wide roads, three regions, physical transit landmarks, and
seeded non-critical variation. Generator-v4 `64x48` maps are a legacy save
compatibility path, not the new-Run layout. Players reveal the
non-interactive minimap by physically walking the maze. Curriculum monsters
show only a stable `ID #NNN` until defeated; the finishing blow recovers the
plain display name into the permanent Monster Codex. Moving into a living
curriculum monster or passing an encounter check starts a separate
single-target battle where the player writes complete read-only SQL. The Run
starts at two hearts, uses deterministic floor-and-role counters with armor-first
absorption, awards rank-based XP with a visible post-battle settlement, and
unlocks each deterministic curriculum reward in its room's
`E`-opened chest, explains acquired loot, automatically
opens a short non-interactive portal after each of the first seven floor Bosses,
and ends at an eighth-floor five-stage database-incident Boss followed by the
seven-page `MIGRATE` procedure. Step-meter ambushes award XP and
may produce only optional low-probability loot. Outside safe zones, each
eligible successful step has a 2% base ambush chance and the meter guarantees an
encounter after 30 eligible quiet steps; reloads do not reroll the result.
Each floor contains two seeded physical campfires in the middle and rear
learning phases; the entrance remains the front safe/respawn anchor. The same
seed also derives main-course route
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
restored by campfire rest or respawn. In v1.1, optional random loot is limited
to an immediately consumed recovery item: 2% for normal monsters, 5% for
mini-elites, 10% for area Bosses, and 0% for floor Bosses. Random loot has no
minimum count; course rewards, explicit chests, and keys stay deterministic.
Full bags require explicit replacement, ordinary discards remain
recoverable on the current floor, and protected base/course/key items cannot be
discarded.
Every campfire also renders the Scribe. Her recap is built only from local
floor-answer evidence. Five short narrative beats and two fixed Lost Name
evidence entries per floor unlock from existing Run progress; the local
`失名录` distinguishes unknown, confirmed `NULL`, and actual values. The eighth
floor resolves the sole MVP 2.0 ending, `MIGRATE`; no Agent, account, backend,
or network log is used.
Floors one through eight each contain exactly one optional physical hidden room:
the first-floor sealed archive opens after `WHERE / IS NULL`, and the
second-floor wreck ledger opens after `ORDER BY / LIMIT / DISTINCT`. Floor
three opens an ownerless reliquary after its first three relationship lessons.
Floor four reveals a compact first-floor ember echo only after the first three
subquery lessons and middle area Boss `ID #044`; that room deterministically
offers the `回燃衣` armor, whose equipped actor has a distinct hood, shoulders,
seal, and palette. Floors five through eight respectively hide the Silent
Roster, Uncommitted Rookery, Blind Index Garden, and Zero-Row Chapel; they
deterministically offer iron, dragon, crystal, and royal armor with visible
equipped silhouettes. Hidden-area gate state reuses `openedGateIds`, campfires
are never placed inside these rooms, and optional evidence or gear never gates
the main story or curriculum.
Ordinary world monsters take one slow patrol step about every 1,100 ms while
exploration is active. Each floor's locked Boss gate also exposes one optional
physical SQL cipher: a correct composite query opens only that physical route
and permanently changes its seal state, while a wrong or invalid query deals
one armor-first damage and never grants mastery, XP, or loot.
The top-console `答题复盘` view reads a browser-local answer log for the latest
battle and current floor. Each record contains the submitted SQL, explicit
reference SQL, result category, hint level, and battle outcome. The log is
capped at 200 SQL turns, never records movement or key presses, and is never
uploaded.
Authored monster display names stay direct and easy to type: two or three
Chinese characters such as `史莱姆`, `水胶怪`, or `幼龙`, without middle-dot
epithets or SQL-concept suffixes. New content must follow the same rule; SQL
meaning belongs in fields, objectives, and encounter mechanics rather than the
display name.
The campaign framework defines and validates all eight playable floors,
including their ordered lesson prerequisites, three exercise tiers, five
encounter roles, theme/topology, monster/equipment/loot pools, deterministic
completion rewards, and runtime evidence boundary. The executable content covers
47 required lesson groups across all eight floors and a five-stage final Boss.
The runtime derives three deterministic regions per executable floor from the
saved map instead of persisting duplicate geometry. The eight authored macro
themes progress from the Ember Archive through the Tidal Archipelago, Frost
Gravefield, Elemental Furnace, Black-Iron Outer City, Dragon Ridge, Sunset
Index Garden, and Black-Gold High Hall. Ambushes draw only from the current biome pool, with
seeded 5%, 7%, 9%, 11%, 13%, 15%, 17%, and 19% mini-elite weights by floor.
Authored optional area Bosses use multi-stage floor-appropriate exercises, award
3 XP, but do not guarantee random items. Floors two through eight use two
physical region portals to connect their three biomes; defeating the middle
area Boss transfers the player into the rear main-path region. Floor one is an
explicit exception: it remains one continuous authored route and uses water
state plus the guaranteed physical shortcut instead of generic region portals.
These actors never enter entrance or campfire safe zones and do not gate
curriculum completion.
Each floor also has one validated labyrinth contract that binds its unique maze
name and topology signature to stable entry, exit, Boss-gate, return-shortcut,
hidden-room, safe-room, sight-radius, and physical-hazard intent. The first move
from an authored safe room into the hostile maze opens that floor's threshold
confirmation; confirming it does not lock the return route. Authored entry/rest
rooms and seeded campfire rings reveal their complete safe area and reject
ambushes, patrols, curriculum actors, area Bosses, and hazards. Outside them,
current actor visibility uses the floor-specific local radius. Each floor's
seed deterministically places its own visible, one-use physical hazards away
from rooms, anchors, gates, transport, guided-map interests, and safe cells;
triggering one applies its authored armor-first damage without starting SQL
combat, then records the stable hazard ID in `openedGateIds` as inert. Floors
two through eight additionally enforce the living middle area Boss as a hard
movement boundary into the rear region; the portal requirement is not merely
presentation metadata.
Floors one through eight have authored runtime experience definitions:
stable landmarks, physical hidden-room entrances, derived world-state changes,
one physical SQL cipher, story triggers, Scribe placement, and admin presets.
Floor three makes JOIN
relationships visible through a bone bridge, paired steles, a relic chain, and
preserved witnesses. Floor four uses fire, frost, and storm regions; its middle
Boss `ID #044` blocks the rear region and reveals the optional first-floor ember
echo after defeat. The echo is an in-floor memory space, not a floor transition
or a second copy of first-floor progress.

The current product deliberately does not include AI generation, accounts,
leaderboards, multiplayer, a server database, or a faithful MySQL
optimizer/InnoDB runtime. The seed randomizes the physical maze,
non-critical room rewards, and optional loot, but not required SQL data,
prerequisite lessons, or key weapons. The first floor teaches `SELECT` through
`HAVING`; the harder second floor teaches `ORDER BY / LIMIT`, `DISTINCT`,
`INNER JOIN`, `LEFT JOIN`, and a composite `JOIN` query. Floor three adds inner,
left, self, and chained joins plus `UNION`; floor four adds scalar, `IN`,
`EXISTS`, correlated subqueries, CTEs, and recursive CTEs. Floor five covers
window functions; floor six uses a disposable DML/transaction sandbox; floor
seven teaches indexes and real SQLite query-plan evidence; floor eight uses
deterministic incident fixtures for MVCC, locks, isolation, modeling,
replication, sharding, and query security. These 47 lesson groups are not the
complete SQL or MySQL interview curriculum.

## Architecture and Execution Flow

```text
index.html -> src/main.ts
  -> AppShell (DOM HUD, minimap, inventory/loot, SQL terminal, local review)
  -> AppShellTemplate/AppShellDom (static markup and fail-fast stable selector contract)
  -> SqlAutocomplete (complete-schema vocabulary, ranking, replacement, listbox)
  -> SqlSchemaCatalog (canonical fields, types, generated DDL, teaching relations)
  -> FloorContracts (eight-floor curriculum, encounter, theme, and loot schema)
  -> GameSession (authoritative maze, combat, loot, answer log, profile)
  -> CampaignDomain (ordered eight-floor slots and transition invariants)
  -> RunGraph (curriculum dependency and point-of-interest graph)
  -> FloorMapBlueprints (eight authored macro layouts and transit identities)
  -> FloorLabyrinthContent (stable F1-F8 navigation, safe-room, sight, and hazard contracts)
  -> FloorExperience (authored F1-F8 landmarks, hidden rooms, SQL ciphers, story, world states)
  -> MazeGenerator/MazeValidation (deterministic 48x36 generator-v5 world)
  -> CampfireDomain (two seeded checkpoints, entrance anchor, safe-cell masks)
  -> GuidedMap (route beacons, dead-end caches, guaranteed key, shortcut)
  -> BiomeDomain (derived regions, static features, safe area-Boss anchors)
  -> FloorLabyrinthDomain (thresholds, local sight, safe-area resolution, seeded hazards)
  -> EncounterDirector (deterministic step meter, safe windows, ambush choice)
  -> MonsterRoaming (deterministic slow patrol decisions)
  -> LootDirector (seeded independent candidates and same-battle deduplication)
  -> SqlEngine (in-memory SQLite WASM, seed data, SELECT/WITH execution, HP sync)
  -> lessonEvaluator (query features, lesson locks, result semantics)
  -> NarrativeContent/NarrativeDomain (beats, evidence, ascents, MIGRATE)
  -> ActorVisuals/PixelActorFactory (shared world/battle actor recipes)
  -> DungeonScene (continuous map, fog, collision, patrol, Scribe, encounter)
  -> BattleScene (separate duel arena with shared actor animation)
  -> FeedbackDirector (semantic event -> one notice and one audio cue)
  -> MusicScore/ArcadeAudio (public-domain classical themes, electronic synthesis)
  -> NarrativeCodexView/MonsterCodexView (story and recovered identities)
  -> OnboardingController (move -> encounter -> terminal -> query -> pickup)

player movement -> MazeFloor collision/gates -> fog, pickup, or encounter meter
player SQL -> read-only policy -> SQLite result + EXPLAIN QUERY PLAN
  -> result semantics + lesson-lock validation -> auto attack or enemy counter
  -> HP update in GameSession and SQLite -> Phaser/UI refresh
  -> coalesced v11 Run save + permanent v3 profile save
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
the concept lock. Shared curriculum data and fixed room-chest rewards live in
`src/content/mvpLevel.ts`, with later executable floors in
`src/content/floor2Level.ts` through `floor8Level.ts`; room flavor and run rewards live in
`src/content/runContent.ts`; optional Boss-gate questions and semantic result
contracts live in `src/content/gateChallenges.ts`; onboarding copy lives in
`src/content/onboarding.ts`. SQL stages intentionally start blank.
`src/content/lessonTaskBrief.ts` is the player-facing SQL-task presentation
boundary. It derives the current situation, exact output columns, canonical
field meanings, JOIN relation, clauses, world effect, difficulty tier, and a
four-step hint ladder from the authored stage plus `sqlSchema`; `AppShell` only
renders that contract and must not rediscover SQL semantics. Ordinary encounter
stage one contains one current chapter plus baseline projection/filtering;
mini-elites may add at most one mastered chapter from stage two onward, and
floor Bosses progress from a single chapter to a final two- or three-chapter
audit. A complete SQL answer appears only in hint four.
`src/ui/appShellTemplate.ts` exclusively owns the static AppShell markup;
`src/ui/appShellDom.ts` owns reusable stable selector bindings. Runtime renderers
and event handlers must not duplicate that markup or silently query a second
selector for the same persistent node.
`src/content/inventoryCatalog.ts` owns inventory capacities, the current
weapon/armor/consumable catalog, and biome-based optional candidate probabilities;
`src/domain/lootDirector.ts` owns deterministic independent rolls and
same-battle deduplication. Runtime optional candidates are immediate recovery
items only; unlocked curriculum room chests still use the inventory flow.
`src/content/biomeContent.ts` owns the executable eight-floor biome encounter
pools and optional multi-stage exercises. `src/domain/biome.ts` derives region
ownership, static features, area-Boss positions, and two region portals from
the maze, campfires, guided map, and seed; this plan is rebuilt during load and
is not serialized.
`src/content/floorLabyrinth.ts` owns the stable eight-floor navigation contract;
`src/domain/floorLabyrinth.ts` resolves that intent against the current saved
`MazeFloor`, campfires, guided plan, and biome plan. It must not persist derived
safe-cell, sight, hazard-position, or threshold-confirmation duplicates.
`src/content/floorContracts.ts` owns campaign curriculum metadata and its
serializable schema. Registered drift `AUTH-003` is closed by cross-authority
tests, but this file is still not
the player-facing authority for floor names, biomes, or exact monster rosters.
Executable monster truth lives in the per-floor level files and
`biomeContent.ts`; player-facing places and events live in Floor Experience;
navigation boundaries live in Floor Labyrinth and Floor Map Blueprints.
`src/domain/campaign.ts` owns the serializable ordered floor slots and must
reject skipped, duplicated, or rerolled transitions. This campaign must never
route a floor through another floor's content. The authority register is
`docs/product/production/CONTENT_AUTHORITY_AND_TRACEABILITY.md`.

The V2 eight-floor narrative and monster-distribution contracts now have a
runtime and automated-test baseline; complete human playthrough, copy/audio
review, and final visual polish remain separate evidence. Preserve these durable
boundaries:

- Player-facing subregions map explicitly to the only physical navigation
  regions, `front`, `middle`, and `rear`; F2 may expose four display regions.
- Monster IDs `1–89`, lesson/result, equipment, story/evidence, and `MIGRATE`
  IDs plus Run v11/Profile v3 are compatibility keys and must not be renamed.
- Before the finishing blow, every player-visible monster reference goes
  through `monsterIdentityPresentation` or `monsterIntentName`; admin reveal is
  memory-only and never updates the profile.
- Story uses `blocking`, `ambient`, and `inspect`: blocking requires explicit
  confirmation, ambient expires after three successful moves, and inspect
  opens/closes with `E`. Restored Runs archive seen moments without replaying.
- `counterDamageForEncounter` is the combat authority: F1–2 all roles deal 1;
  F3–4 normal/elite deal 1 and Boss roles 2; F5–6 normal deals 1 and other roles
  2; F7–8 floor Bosses deal 3 and other roles 2. Errors share this rule and
  armor absorbs first; traps and SQL ciphers remain separate one-damage systems.
- The four teaching-table DDLs, monster primary/detail-key meanings, and stable
  save versions do not change for narrative work.
`src/ui/sqlAutocomplete.ts` owns deterministic suggestions derived from the
complete canonical schema, current task context, and MVP SQL vocabulary. It may
replace only the active token after explicit keyboard or pointer acceptance; it
must not generate a complete answer, submit a query, or bypass lesson
evaluation.

## Repository Map

```text
src/audio/          Public-domain classical-theme electronic Web Audio score and SFX
src/content/        Curriculum, SQL schema, map/actor/narrative truth, entities,
                    fixed weapons, rewards, and onboarding copy
src/domain/         Pure state, combat rules, course graph, physical maze,
                    validation, roaming, semantic evaluation, and query policy
src/feedback/       Semantic gameplay-event routing to notices and audio cues
src/game/           Continuous-maze exploration, battle scene, and bootstrap
src/runtime/        Page lifecycle coordination for rendering, audio, and saves
src/sql/            SQLite WASM initialization, schema, execution, HP sync
src/storage/        Versioned Run/profile validation, recovery, and write coalescing
src/ui/             DOM shell, Lost Name codex, onboarding, and game orchestration
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
- SQLite `EXPLAIN QUERY PLAN` drives the floor-seven/eight query-load teaching
  signal. It is SQLite evidence, not a MySQL execution plan. MySQL/InnoDB concepts must
  be clearly labeled simulations or use a separately isolated real backend.
- Save data is browser-local and split between
  `select-from-dungeon:run:v11` (eight-floor campaign slots plus current floor,
  maze, actors, ground items, loot
  bundles, inventory, armor, consumables, unique-item history, key items, fog,
  two campfires, the entrance anchor, active checkpoint, encounter meter,
  level/XP, opened
  SQL cipher gates/shortcuts/dead-end caches/eight-floor hidden rooms,
  active gate challenge, at most 200
  local answer records, and disposable current Run state),
  `select-from-dungeon:profile:v3` (47 mastered lessons, recovered monster IDs,
  attempts, victories, and best query count), and
  `select-from-dungeon:onboarding:v1` (finished/skipped guide state). A valid
  `select-from-dungeon:run:v10` is migrated in memory into v11;
  valid `run:v8` is upgraded with deterministic eight-floor campaign slots, and `run:v7` is then
  migrated with empty inventory/loot state and acquired equipped gear
  registered; valid `run:v6`, `run:v5`, and `run:v4` data continue through the
  existing migrations before v11. Legacy keys remain undeleted; older Run keys remain
  unread.
  Valid `select-from-dungeon:profile:v1` and `profile:v2` records migrate into
  v3; missing identity records start empty while existing learning counters are
  preserved. `progressPersistence`
  coalesces non-critical movement/patrol snapshots while flushing query, loot,
  inventory, mode, and topology changes immediately; changing a shape requires
  a version or recovery decision.
- The labyrinth contract adds no save field and does not change
  `select-from-dungeon:run:v11`. Generated hazard coordinates, safe-cell masks,
  and visibility are rebuilt from existing floor data; triggered hazard IDs
  reuse `openedGateIds`, while entry confirmation is reconstructed from the
  player's position, discovered cells, and visited rooms.
- Core learning drops and keys are deterministic. Runtime optional candidates
  are immediate recovery items only, with no rank-based minimum or loot bundle.
  Randomness must never block curriculum progress. Combat damage is
  deterministic so SQL targeting remains inspectable.
- A new Run starts at two hearts. Normal, elite, and Boss victories award 1, 3,
  and 5 XP; area Bosses also award 3 XP. Cumulative level thresholds are
  `0, 2, 4, 6, 8, 14, 22, 32, 44, 58, 74, 92, 112`, and base maximum health is
  `2 + floor((level - 1) / 2)`.
- One SQL submission is one combat turn, with no timer while thinking or typing.
  Correct results only trigger the player attack; wrong results and syntax
  errors trigger the telegraphed enemy counter. Empty input consumes no turn.
- Standing beside a locked Boss route and pressing `E` opens its optional
  physical SQL cipher terminal. Floor one requires a composite
  `JOIN + WHERE + COUNT + GROUP BY + HAVING + ORDER BY` query; floor two adds
  `LEFT JOIN`, `COUNT(DISTINCT ...)`, and `LIMIT`; floor three uses a three-table
  gear audit; floor four uses a CTE with grouped maximum power; floors five
  through eight continue with window, transaction, plan, and incident
  composites. Both query features and exact
  result semantics are validated. Success opens only that physical route,
  permanently changes the seal's visible state, and
  grants no mastery, attempts, XP, or loot. Wrong results and syntax errors deal
  one armor-first damage; empty input and `Escape` consume nothing.
- New Runs use generator-v5 `48x36` `MazeFloor` records built from eight
  authored macro blueprints; generator-v4 `64x48` records remain loadable for
  legacy Run compatibility. Broad routes, stable room slots, and deterministic
  local variation replace the old technical-partition maze. Players must walk through the
  continuous world; the discovery minimap is not a navigation control. Moving
  into the same tile as a living curriculum monster or triggering the
  successful-step encounter meter starts the separate battle scene. After its
  safe window, the meter applies a 2% base chance on each eligible successful
  step and guarantees a battle at 30 eligible quiet steps. Entrance and
  campfire safe zones never advance this encounter risk, never spawn enemies,
  and reject patrol entry. Ordinary world monsters patrol slowly; the Boss
  remains anchored.
- All eight floors resolve their independent labyrinth contract at runtime.
  Crossing from an authored safe room into the maze requires one explicit
  threshold confirmation for the current floor. Safe rooms and campfire rings
  expose their whole safe area; the hostile maze exposes only the current
  floor's local sight radius. Seeded physical hazards are visible only when both
  discovered and currently in sight, apply their configured one-time
  armor-first damage without opening combat, and then become inert. F2-F8 rear
  regions also reject every normal walking step while the bound middle area
  Boss is alive; F1 remains the continuous no-region-portal exception.
- `GuidedMap` is derived deterministically from the curriculum graph, saved
  `MazeFloor`, and two campfires rather than duplicated in save data. Route
  beacons appear about every 14 steps with no gap above 18, and every remaining
  corridor dead end contains a one-use supply. Each floor currently has exactly
  one two-way shortcut and one guaranteed middle/rear key that consumes no
  inventory slot. Opening requires both the key and the shortcut's course
  prerequisites; opening, rest, and death never reroll or relock it.
- Collecting a key on floors one through seven enters `transition` mode.
  AppShell displays the gold `FLOOR NN CLEARED / CONGRATULATIONS!!` feedback and calls
  `GameSession.advanceFloor()` after about 1.5 seconds without requiring
  movement or `E`; level, XP, equipment, inventory, consumables, key items,
  relics, and query count carry into a newly generated harder floor while
  per-floor maze and lesson state reset.
- Every victory shows an explicit XP settlement. Curriculum victories unlock
  their deterministic room chest instead of manufacturing a guaranteed monster
  drop. Ambush results contain only optional seeded immediate recovery and are
  usually empty. Acquisition copy names every
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
- All eight floors route entry, Boss settlement, ascent, world changes, Scribe,
  landmarks, and hidden evidence through the three story presentations.
  Blocking records pause movement/patrols and cannot be confirmed with
  `Escape`; inspect records may close with `E`, `Escape`, or their close action.
  Identity/XP/loot settlement completes before queued story and world changes.
- Web Audio music and event cues are authored in project code. All eight floors
  electronically re-synthesize identified public-domain classical themes with
  region variations and separate exploration, combat, and Boss movements.
  Short, soft voices and phrase overlap avoid the previous buzzing sustained
  bed; floor and mode changes use a short fade. No recording, MIDI, sample
  library, or copied game soundtrack is bundled.
  Movement, wall
  bumps, encounters, query casts, hits, damage, stage clears, drops, pickups,
  gates, victory, and defeat have distinct feedback; reduced-motion preferences
  may suppress motion effects without suppressing gameplay state.
- The renderer targets 30 FPS. Page-hidden lifecycle handling flushes progress,
  sleeps the Phaser loop, stops scheduled audio, and resumes safely when visible.
  Unchanged heavy HUD lists are reused instead of rebuilt on every snapshot.
- The production build keeps Phaser, `sql.js`, and SQLite WASM in separate
  cacheable assets. `sqlite-runtime` must remain outside the application entry;
  the WASM file remains an external fetched asset and is not inlined.
- `.github/workflows/deploy-pages.yml` is opt-in through
  `PAGES_ENABLED=true` and must validate rules, tests, and `dist` before
  deployment. If private-repository Pages is rejected by the provider/plan,
  keep the repository private and the variable false/unset, record
  `provider-blocked`, and do not buy, publish, or switch hosts without authority.
  Bundle/runtime optimization remains a separate MVP 2.1 change.
- Characters and UI effects remain generated from project code. The first two
  floor slices may also load the audited CC0 tile/prop packs declared in their
  runtime manifests; source archives, hashes, licenses, and transformed outputs
  must stay reproducible through the asset scripts. Music and sound effects are
  rendered from project-authored score/event code using public-domain musical
  material, not bundled commercial recordings. Do not add any third-party art,
  fonts, audio, or copied level text without a license review and attribution
  update.
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
