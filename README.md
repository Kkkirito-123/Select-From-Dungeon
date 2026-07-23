# SQL Demon Castle · SELECT * FROM DUNGEON

[简体中文](README.zh-CN.md) | **English**

[Eight-floor curriculum blueprint](docs/CURRICULUM.md) |
[中文课程蓝图](docs/CURRICULUM.zh-CN.md)

A Chinese browser roguelite for SQL beginners and interview review. SQL is the
combat action: physically explore a continuous seeded pixel maze, move into a
named monster's tile to enter a separate duel, write a complete SQLite query,
and turn the correct result into an animated attack.

## MVP Features

- Complete a two-floor Run made from separate deterministic 64x48 continuous
  mazes. Each uses twelve 16x16 technical partitions and extra loops to reduce
  dead-end backtracking. Floor one is a stone castle; floor two becomes the
  deep-blue, cyan, and violet Thunder Sonata Tower.
- Collecting the first Boss key plays an approximately 1.2-second relational
  portal and automatically enters floor two—no extra pathfinding, `E` press, or
  menu choice. Level, XP, weapon, relics, and query count carry across.
- Reveal the discovery minimap by walking through fog. It records explored
  regions and course gates; it is not clickable and never teleports the player.
- Move into a living curriculum monster's tile or trigger a step-based ambush to
  start a Pokémon-like single-target battle. Ambushes begin only after an early
  safe window, become guaranteed after prolonged quiet exploration, and cannot
  be rerolled by reloading.
  Ordinary monsters take one slow patrol step about every 1,100 ms; the Boss
  remains anchored. The opponent's full name, ID, HP, and next counter are
  visible before every query.
- Press `Q + S` (or the touch button) to open the in-game terminal. Every stage
  starts blank: the player writes the complete `SELECT ... FROM ...` statement.
- Use the embedded `PLAN ASSIST` completion stack without leaving the game.
  Prefixes rank SQL keywords, functions, all four canonical tables, and all 22
  fields; aliases such as `m.` narrow the list to that table. Use arrows plus
  `Enter`/`Tab`, click or tap, or open it explicitly with `Ctrl/Command +
  Space`. Accepting a suggestion never executes the query or fills the complete
  answer.
- Browse a permanent `SCHEMA CODEX` for field names, types, nullability, primary
  keys, and logical JOIN relationships. Its four table tabs are keyboard
  operable, while battle and breach terminals offer a collapsed complete-field
  quick reference. `REF` labels are teaching relationships, not declared SQLite
  foreign-key constraints.
- Execute real read-only SQLite WASM queries and inspect result rows plus
  `EXPLAIN QUERY PLAN`. Correct results attack; wrong results and syntax errors
  trigger the telegraphed counter. Empty input consumes no turn.
- Stand beside either locked Boss gate and press `E` to attempt an optional
  high-difficulty `QUERY BREACH`. Its fixed composite query can open that
  physical gate early, but grants no mastery, XP, or loot. A wrong result or
  syntax error costs one heart; empty input and safe exit cost nothing.
- Start each Run with two hearts. Normal, elite, and Boss victories grant 1, 3,
  and 5 XP; levels unlock at 2, 4, 6, 8, then every four XP through 24, adding
  one maximum heart while restoring one heart.
- Collect loose monster drops by walking over them. Altars, treasure chests, and
  campfires use `E` investigation. Guaranteed curriculum weapons remain
  deterministic: Filter Bow after `SELECT`, Null Lantern after `IS NULL`, and
  Aggregate Hammer before `GROUP BY`. Floor two adds the Sort Saber and Join
  Chain. Every acquisition opens a non-blocking card with the item's description
  and exact effect.
- Hear electronic-classical Web Audio: floor one rotates four original lyrical
  patterns, while floor two rotates three new chiptune arrangements of
  public-domain Beethoven compositions. Battles use original high-energy space
  arcade patterns. No third-party recording or other game's melody is bundled.
  Steps, wall bumps,
  encounters, query casts, hits, damage, stage
  clears, drops, pickups, gate openings, victory, and defeat receive distinct
  cues. No third-party music or audio asset is bundled.
- Follow an optional step-by-step guide through movement, finding a monster,
  opening the terminal, casting the first query, and collecting the first drop.
  It can be skipped or replayed without changing SQL mastery.
- Resume the maze, actors, ground items, fog, and combat state separately from
  permanent mastery, attempt counts, victories, and best query count. Starting
  a new Run preserves the profile.
- Play with WASD/arrow keys on desktop or visible touch controls and a full-screen
  SQL terminal on narrow screens.

## First-Floor Learning Route

1. `SELECT / FROM`: query monster `#101` for its `name`, then its `weakness`.
2. `WHERE / AND`: isolate the escaped hound by room and status, then query its
   weakness by the monster's visible name.
3. `IS NULL`: find the unowned monster ID, then the cursed unowned monster name.
4. `COUNT / GROUP BY`: group `monster_id = 800` signals by `channel` and count
   each group as `total`.
5. `HAVING`: filter Boss `#900` groups first at `COUNT(*) >= 2`, then at
   `COUNT(*) >= 3` to expose only the strongest core.

`WHERE` and `IS NULL` are free-order branches. `GROUP BY` unlocks only after both
are mastered and the fixed Aggregate Hammer is claimed. The seed may change the
physical maze and optional rewards, but it never changes required query data or
removes a key weapon. The dependency graph controls course gates, not player
teleportation; among unlocked areas, encounter order comes from actual maze
exploration.

Each stage includes an encounter briefing, visible schema, concept locks, and
progressive hints. Within the first-floor grammar—one flat `SELECT`, without
`OR`, subqueries, or set operators—validation checks both result semantics and
the current concept. Table aliases and `HAVING total ...` remain valid; no one
exact SQL string is required.

## Second-Floor Learning Route

1. `ORDER BY / LIMIT`: find the strongest `charge`, then return the top two in
   descending order.
2. `DISTINCT`: reduce mirrored signals to unique `channel` values and sort them.
3. `INNER JOIN / ON`: connect `monsters.room_id = rooms.id` and read room data.
4. `LEFT JOIN / IS NULL`: keep left-side monsters and find one with no gear row.
5. Composite `JOIN` Boss: join rooms, group, filter with `HAVING`, order the
   groups, then join gear to locate the strongest core.

Floor-two answers are still complete statements. Validation checks the real
result, concept locks, and the actual relationship predicate, so `ON 1=1` plus
hard-coded filters cannot bypass the lesson. Monster HP is aligned with stage
count and guaranteed weapon damage; repeating an already-solved stage is never
required.

## Run Locally

Requirements: Node.js `>=20.19` and pnpm `11.9.0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vite, normally `http://localhost:5173/`. Do not open
`index.html` through `file://`; the SQLite WASM file must be fetched over HTTP.

The first two attacks are:

```sql
SELECT name
FROM monsters
WHERE id = 101;

SELECT weakness
FROM monsters
WHERE id = 101;
```

Start at the castle gate and follow the onboarding card or cyan beacon through
the actual maze. The minimap only reveals where you have explored: it cannot be
clicked to travel. Move into the projection slime's tile, press `Q + S`, type
the complete query, and use `Ctrl/Cmd + Enter` to attack. After victory, walk
over the loose glowing drop to collect it automatically; use `E` only to
investigate altars, treasure chests, and campfires.

## Architecture and Storage

```text
AppShell ── HUD, discovery minimap, onboarding, terminal, query evidence
    │
GameSession ── authoritative physical world, actors, fog, combat, loot, profile
  ├─ RunGraph ── curriculum dependencies and point-of-interest gates
  ├─ MazeGenerator/MazeFloor ── seeded 64x48 physical maze
  ├─ MazeValidation ── topology, reachability, and save invariants
  ├─ EncounterDirector ── deterministic safe windows and step-based ambushes
  ├─ MonsterRoaming ── deterministic slow patrol decisions
  ├─ gateChallenges ── optional Boss-gate feature and result contracts
  ├─ lessonEvaluator ── result semantics + concept locks
  ├─ SqlSchemaCatalog ── canonical four-table metadata and generated DDL
  ├─ SqlAutocomplete ── complete-schema completion and accessible listbox state
  ├─ SqlEngine ── read-only SQLite WASM execution and runtime synchronization
  ├─ DungeonScene ── continuous exploration, fog, collision, patrol
  ├─ BattleScene ── duel presentation and combat animations
  ├─ FeedbackDirector ── exploration notices and event audio routing
  ├─ ArcadeAudio ── randomized exploration music and original battle Web Audio
  └─ OnboardingController ── separately persisted progressive guide
```

`RunGraph` is the curriculum dependency graph; it does not move the player.
`MazeFloor` is the physical world. The discovery minimap is a read-only view of
exploration, while movement, same-tile encounters, pickups, and gates are
resolved by `GameSession` against the maze.

The maze generator currently isolates `topology` and `decor` random streams.
Actors and fixed curriculum drops are derived deterministically from course
anchors; there are no separate `theme`, `loot`, or `spawn` streams and no
independent content-version field in this MVP.

The terminal accepts one `SELECT` statement and displays at most 50 rows. DML,
DDL, `PRAGMA`, `ATTACH`, and multiple statements are rejected. Query plans and
I/O heat are SQLite teaching signals, not evidence about the MySQL optimizer.

Browser-local storage is split into:

- `select-from-dungeon:run:v5`: disposable current Run, including the current
  floor, generated maze, world actors, ground items, discovered fog cells, HP,
  level/XP, encounter meter, gear, relics, combat progress, opened challenge
  gates, and the active gate challenge.
- `select-from-dungeon:profile:v2`: ten mastered lessons, attempts, victories, and
  best run query count.
- `select-from-dungeon:onboarding:v1`: whether the optional guide was completed
  or skipped.

A valid `run:v4` is migrated in memory into v5 with its progress preserved and
no challenge gates opened; earlier Run keys remain unread and undeleted. A valid
`profile:v1` migrates to v2, preserving first-floor mastery while adding
second-floor counters. Snapshot persistence is debounced in `src/main.ts` so
movement and patrol updates do not force a synchronous storage write for every
emitted state.

## Validation and Build

```bash
pnpm test
pnpm build
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
```

`pnpm build` type-checks the project and writes the static site to `dist/`.
The build also copies the authoritative root `LICENSE` and `ATTRIBUTIONS.md`
into `dist/`; do not maintain separate hand-written copies. Deploy that directory
to a static host that serves WASM with the correct MIME type.

Fresh browser evidence is intentionally narrower than the feature list. This
revision verified the first-floor challenge prompt, safe exit, one-heart failure,
successful semantic breach, walking through the opened gate, reload recovery,
focus without page jumping, and no horizontal overflow at 390x844. The latest
completion pass additionally verified automatic prefix suggestions,
`Ctrl+Space`, arrow selection, `Enter`, `Tab`, pointer/touch acceptance,
two-stage `Escape`, unchanged query counts, and desktop plus 390x844 layouts.
The Schema Codex pass verified four-table tab and arrow-key navigation, focus
retention, the 22-field terminal reference, `armor` completion from the
canonical catalog, 44 px mobile tab targets, no 390 px horizontal overflow, and
no console warnings/errors. The integrated pass then opened the complete-field
and query-evidence panels together at 1280x720, reproduced and fixed pointer
interception over the execute action, completed the HAVING battle by clicking
that action, moved after terminal close, collected the key, entered floor two
automatically, recovered the floor-two state after reload, and rechecked the
390 px layout without console warnings/errors. Earlier evidence covered startup,
HUD, touch controls, same-tile combat, pickups, patrol contact, counters, and
same-seed reload. A complete two-floor manual browser Run, 200%/320px layout,
Reduced Motion, subjective audio/timing, and the 10-second
performance/save-rate checks have not yet been run. Unit tests and a successful
build do not substitute for those checks. Domain automation physically walks
both floor-one branch orders,
the automatic transition, and all five floor-two lessons without Session travel
or positioning helpers; that is still not a manual browser Run.

To embed a deployed build in a blog:

```html
<iframe
  src="https://your.blog/games/select-from-dungeon/"
  title="SQL Demon Castle"
  width="100%"
  height="900"
  loading="lazy"
  allow="autoplay"
></iframe>
```

Audio still waits for the visitor's first click or key press because browsers
block unsolicited playback. If an embedded browser blocks local storage, the
storage layer fails safely and the current in-memory Session is not discarded,
but that tab cannot resume the Run after a reload. The restricted-iframe path
has unit coverage, not a completed browser iframe acceptance run.

## Scope and Attribution

This MVP covers ten lesson groups across two floors, ending with `LEFT JOIN` and
a composite `JOIN` challenge. Subqueries, window functions, transactions, index
internals, isolation levels, and the wider MySQL interview curriculum remain
future floors, not claims of this release.

Original code and prose use the [MIT License](LICENSE), copyright
`Kkkirito-123`. Runtime notices and design references are listed in
[ATTRIBUTIONS.md](ATTRIBUTIONS.md). Pixel characters, tiles, room decoration,
music, and sound effects are generated by project code.
