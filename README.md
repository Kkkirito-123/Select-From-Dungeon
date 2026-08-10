# SQL Demon Castle · SELECT * FROM DUNGEON

[简体中文](README.zh-CN.md) | **English**

[Eight-floor curriculum blueprint](docs/CURRICULUM.md) |
[Floor map and art direction](docs/FLOOR_THEMES.md) |
[Eight-floor narrative V2 (Chinese)](docs/product/narrative/EIGHT_FLOOR_NARRATIVE_DESIGN_V2.md) |
[Monster distribution V2 (Chinese)](docs/product/systems/EIGHT_FLOOR_MONSTER_DISTRIBUTION_V2.md) |
[Document index and roadmap](docs/README.md) |
[中文课程蓝图](docs/CURRICULUM.zh-CN.md) |
[中文地图蓝图](docs/FLOOR_THEMES.zh-CN.md)

**Package: `v2.0.0` · F1/F2 content candidate: `MVP 2.1 RC`** · [Player guide](GUIDE.md) ·
[Changelog](CHANGELOG.md) ·
[Release checklist](docs/RELEASE_CHECKLIST.md)

A Chinese browser roguelite for SQL beginners and interview review. SQL is the
combat action: physically explore a continuous canonical pixel maze, move into an
unidentified monster's ID-labelled tile to enter a separate duel, write a
complete SQLite query, and turn the correct result into an animated attack.

## MVP Features

- Complete an eight-floor Run made from one canonical set of deterministic
  `56x42` generator-v7 labyrinths. Players cannot enter or reroll a map seed;
  each authored layout is distributed across the compact map;
  DFS carving, about 15% loops, three keyed two-way shortcuts, route guidance,
  physical transit landmarks, and non-critical variation keep exploration
  dense without an unused outer maze. The ascent runs from the Ember Archive through tidal
  islands, frost graves, the elemental furnace, black-iron walls, dragon ridge,
  the sunset index garden, and the black-gold high hall.
- The header now shows the current slot out of eight. A validated campaign
  scaffold defines all eight ordered floor identities, curriculum prerequisites,
  exercise tiers, encounter roles, themes, and content pools. All eight floors
  are executable in v0.10 and hardened for low-cost play in v0.11.
- Collecting a Boss key on floors one through seven shows a gold
  `FLOOR NN CLEARED / CONGRATULATIONS!!` transition for approximately 1.5
  seconds and automatically enters the next floor—no extra pathfinding, `E`
  press, or menu choice. Level, XP, equipment, inventory, relics, and query
  count carry across.
- Reveal the discovery minimap by walking through fog. The minimap itself is
  not clickable. Floors two through eight use two physical region portals to
  connect their front, middle, and rear biomes without bypassing curriculum
  gates; defeating the middle area Boss automatically transfers the player
  into the rear main path. Floor one stays continuous and uses water-state
  changes plus its guaranteed physical shortcut instead of generic portals.
- Every floor now resolves its own labyrinth contract instead of inheriting a
  first-floor maze rule. Visibly open safe-room boundaries are directly
  walkable; there is no invisible threshold confirmation wall. Entry/rest safe
  rooms and the two campfire rings reveal their full safe
  area and reject ambushes, patrols, curriculum monsters, area Bosses, and
  traps. Beyond them, actors and traps are visible only inside that floor's
  local sight radius. Each Seed places a small, floor-specific set of physical
  one-use traps outside rooms, gates, landmarks, travel points, and safe cells;
  contact applies its armor-first damage without opening SQL combat, then leaves
  the trap visibly inert. Floors two through eight do not create collision from
  the invisible region partition. The living middle area Boss locks the visible
  rear transit and cross-region shortcuts, while curriculum room gates still
  prevent lesson bypass.
- The fixed internal world identity deterministically rebuilds course-route beacons, two
  middle/rear campfires, the entrance safe anchor, dead-end caches, and three
  keyed two-way shortcuts for generator-v6+ maps.
  Visible route interests stay within 18 steps on the main course route. Every
  remaining corridor dead end contains a one-use cache. Shortcut keys consume
  no inventory slot and never depend on random loot. At 40 unsuccessful route
  steps the game shows direction/distance, at 60 it highlights up to 24 cells,
  and at 100 it keeps the route highlight active at full strength. The player
  still moves manually; highlighting does not trigger ambushes, cross locked
  doors, or bypass required SQL.
- Press `E` beside the first-floor Scribe, archive wheel, or nameless dormitory
  to open its guidance in a centered game-stage record. Movement and patrols
  pause while it is open; press `E` again (`Escape` and the visible close action
  also work) to resume without replacing the persistent right-rail objective.
- All eight floors contain one optional physical hidden room with its own
  evidence theme. Floors four through eight deterministically award visibly
  distinct Ember Echo, Iron, Dragon, Crystal, and Royal armor. The late-floor
  rooms are the Silent Roster, Uncommitted Rookery, Blind Index Garden, and
  Zero-Row Chapel. Inspect an entrance with `E`; hidden rooms never gate story
  completion or curriculum progress.
- Move into a living curriculum monster's tile or trigger a step-based ambush to
  start a Pokémon-like single-target battle. Outside safe zones, eligible
  successful steps use a 2% base ambush chance after the safe window and
  guarantee an encounter after 30 eligible quiet steps. The deterministic
  result cannot be rerolled by reloading.
  Ordinary monsters take one slow patrol step about every 1,100 ms; the Boss
  remains anchored. Before defeat, the opponent exposes only its stable ID, HP,
  and next counter. The finishing blow shows `NAME RECOVERED / 获得名字` and
  permanently records the direct name in the Monster Codex.
- Ambushes draw only from the biome under the player. Floors one through eight
  use 5%, 7%, 9%, 11%, 13%, 15%, 17%, and 19% seeded mini-elite weights. Pools
  progress from slimes, wetland creatures, undead, and elementals to fortress
  troops, dragons, index beasts, and demon-castle guards.
  Authored visible area Bosses require floor-appropriate multi-stage exercises,
  award 3 XP, and do not block curriculum progress. Optional random loot is no
  longer guaranteed.
- Press `Q + S` (or the touch button) to open the in-game terminal. Every stage
  starts blank: the player writes the complete statement. Floors one through
  five and seven through eight use `SELECT`/`WITH`; floor six accepts controlled
  writes and transaction scripts against a disposable `repair_queue`.
- Use the embedded `PLAN ASSIST` completion stack without leaving the game.
  Prefixes rank SQL keywords, functions, all four canonical tables, all 22
  fields, and real JOIN relationships. Task cards distinguish primary and
  detail tables: monster targets use consecutive `monsters.id` values from
  `1` through `89`, while `monster_id` is only a detail-table relationship
  field. Sparse IDs in an older Run are migrated losslessly when loaded.
  Aliases such as `m.` narrow the list to that table. Use arrows plus
  `Enter`/`Tab`, click or tap, or open it explicitly with `Ctrl/Command +
  Space`. Accepting a suggestion never executes the query or fills the complete
  answer.
- Browse a permanent `SCHEMA CODEX` for field names, types, nullability, primary
  keys, and logical JOIN relationships. Its four table tabs are keyboard
  operable, while battle and breach terminals offer a collapsed complete-field
  quick reference. `REF` labels are teaching relationships, not declared SQLite
  foreign-key constraints.
- Execute real read-only SQLite WASM queries on floors one through five, seven,
  and eight, plus controlled `INSERT`, `UPDATE`, `DELETE`, transaction, and
  savepoint scripts on floor six. Floor seven grades stable
  `EXPLAIN QUERY PLAN` structure instead of device timing. Floor eight queries
  deterministic incident records and does not pretend SQLite is a distributed
  MVCC engine. Every floor-six submission runs in an exported in-memory database
  copy and is discarded after grading. Correct results attack; wrong results and
  syntax errors trigger the telegraphed counter. Empty input consumes no turn.
- Open `答题复盘` from the top console to review every submitted SQL statement,
  its reference answer, error category, hint level, and battle outcome for the
  latest battle or current floor. The complete browser-local log keeps at most
  200 SQL turns and never records movement or key presses. The review remains
  browser-local and is calculated by deterministic game rules by default. When
  `VITE_CAMPFIRE_AGENT_URL` is explicitly configured, at most eight current-floor
  submitted SQL projections can improve the wording; the game does not send
  reference SQL or full game state. `VITE_SCRIBE_AGENT_URL` optionally enables
  the Scribe endpoint for inspection, death review, and navigation guidance;
  it receives only authored text and bounded scene evidence.
- Find two seeded physical campfires on every floor, in the middle and rear
  learning phases; the entrance is the front safe/respawn anchor. Their visibly bounded tiles and the floor entrance
  are safe zones with no ambushes, enemy spawns, or patrol entry. Stand beside a
  fire and press `E` to choose `在此休息` or `答案复盘`. Resting restores maximum
  HP and makes that fire the checkpoint. The recap action unlocks after the
  current-floor elite is defeated; before then, the fire remains fully usable
  for rest and checkpointing but the review action is disabled.
- Meet one physical Scribe on each floor, separately from the campfires. She has
  no chat box: inspecting her reveals authored content immediately, and the
  optional Scribe endpoint may asynchronously improve the display wording.
  Death review and navigation guidance use the same bounded, output-only path.
  Five concise story beats per floor still unlock through required progress, rest, Boss contact,
  and completion; the local `失名录` distinguishes unknown evidence, confirmed
  `NULL`, and actual values.
- Floors five through eight now have authored runtime landmarks rather than
  macro-theme placeholders. Window queries split and number fortress rosters;
  DML lessons compare original and candidate workshop states; index lessons
  light a scan road, index road, covering lake, and query-plan tree; concurrency
  and migration lessons restore version windows, a deadlock cycle, four
  incident wings, and a seven-step migration dais.
- Death no longer resets the Run. `YOU DIED` appears briefly, then the player
  returns at full HP to the last rested campfire or the floor entrance and
  automatically sees the battle that caused the defeat. Mastery, XP, gear,
  doors, defeated enemies, and the surviving enemy's remaining HP stay intact.
- Press `B` during exploration or at a campfire to manage the current build:
  a 12-slot equipment inventory, one weapon, one armor, and three consumable
  stacks capped at five items each. Inventory pauses movement and patrols and
  cannot be opened during combat. Armor HP absorbs counters before base HP and
  is restored by campfire rest or respawn.
- Stand beside the locked Boss route and press `E` to read that floor's
  physical SQL cipher. Its fixed composite query permanently opens only that
  side route and visibly changes the seal, but grants no mastery, XP, or loot.
  A wrong result or syntax error deals one damage to armor first; empty input
  and safe exit cost nothing.
- Start each Run with two hearts. Normal, elite, and Boss victories grant 1, 3,
  and 5 XP; levels unlock at 2, 4, 6, 8, then every four XP through 24, adding
  one maximum heart while restoring one heart. A post-battle card shows the
  defeated monster, exact XP change, level progress, and any level-up.
- Optional random loot is now limited to an immediately consumed recovery item:
  2% for normal/curriculum monsters, 5% for mini-elites, 10% for area Bosses,
  and 0% for floor Bosses. Most victories award XP only; random loot has no
  minimum count and never occupies the inventory.
  Curriculum rewards remain guaranteed in room chests unlocked by the
  corresponding lesson: Filter Bow after `SELECT`, Null Lantern
  after `IS NULL`, Aggregate Hammer before `GROUP BY`, Sort Saber and Join
  Chain on floor two, Bone Blade on floor three, Rune Staff on floor four,
  Iron Axe on floor five, Dragon Spear on floor six, Crystal Blade on floor
  seven, and Royal Sword on floor eight.
  Full equipment inventory requires explicit replacement and keeps leftovers in
  the bundle. Ordinary items can be dropped at the player's feet and recovered
  before floor transition; protected base/course items and keys cannot be
  discarded. Acquisition and XP-settlement cards disappear after three later
  successful movement steps.
- Floors one and two use continuous 46–55 second OGG/MP3 masters generated by
  this project from independently entered public-domain Mozart K.265 and Handel
  *Water Music* themes. Exploration, combat, and Boss arrangements crossfade
  for 1.2 seconds, with stronger low-mid rhythm and no sustained buzz bed.
  Floors three through eight retain the lightweight real-time Web Audio score
  as a compatibility fallback. No modern performance, MIDI, sample library, or
  other game's soundtrack is bundled. Steps, wall bumps,
  encounters, query casts, hits, damage, stage
  clears, drops, pickups, gate openings, victory, and defeat receive distinct
  cues. No third-party music or audio asset is bundled.
- Follow an optional step-by-step guide through movement, finding a monster,
  opening the terminal, casting the first query, and opening the first loot bundle.
  It can be skipped or replayed without changing SQL mastery.
- Resume the maze, actors, ground items, fog, two campfires, entrance anchor,
  checkpoint, and combat state separately from permanent mastery, recovered
  monster identities, attempt counts, victories, and best query count. Starting
  a new Run preserves the profile.
- Play with WASD/arrow keys on desktop or visible touch controls and a full-screen
  SQL terminal on narrow screens.
- Retreat from any battle to the current checkpoint without healing or resetting
  the enemy. Admin mode keeps only an in-memory entry for the next floor's
  starting position; it has no floor list, region jump, or state preset. During
  combat it fills the correct SQL automatically while settlement and review use
  the formal flow.
- Watch the same low-cost procedural actor recipes in the maze and battle
  arena: four player identity stages, an animated Scribe, and explicit
  silhouettes for every monster family. Reaching the eighth-floor victory
  resolves the single MVP 2.0 ending, `MIGRATE`, while preserving the history
  and rollback path described in the `失名录`.

## First-Floor Learning Route

1. `SELECT / FROM`: query monster `#1` for its `weakness`, then use the final
   `name` query to defeat it and recover its identity.
2. `WHERE / AND`: isolate ID `#2` by room and status, then query its weakness
   with explicit `id` and `status` predicates.
3. `IS NULL`: find the unowned monster ID, then the cursed unowned monster name.
4. `COUNT / GROUP BY`: group `monster_id = 4` signals by `channel` and count
   each group as `total`.
5. `HAVING`: filter Boss `#5` groups first at `COUNT(*) >= 2`, then at
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

## Third-Floor Learning Route

1. `INNER JOIN`: join monsters to rooms through the authored relationship.
2. `LEFT JOIN`: retain every target while exposing a missing related row.
3. Self join: connect a monster to its `master_id` record.
4. Three-table chain: traverse monsters, rooms, and gear.
5. `UNION`: merge compatible result sets without hard-coded answers.
6. Join audit Boss: complete two cumulative join-and-aggregate stages.

The grave-city floor keeps relationship predicates visible and grades both the
returned rows and the required join form. The guaranteed Bone Blade is its
course weapon.

## Fourth-Floor Learning Route

1. Scalar subquery.
2. `IN` subquery.
3. `EXISTS`.
4. Correlated subquery.
5. Common table expression with `WITH`.
6. Recursive CTE Boss with two cumulative stages.

The elemental forge permits the advanced non-flat forms only in their authored
stages. Every answer is still one read-only statement, and the Rune Staff is
the guaranteed course weapon.

## Fifth-Floor Learning Route

1. `OVER / PARTITION BY`: keep detail rows while adding per-squad counts.
2. `ROW_NUMBER`: create stable positions inside each fortress sector.
3. `RANK / DENSE_RANK`: handle tied equipment power without hiding rank gaps.
4. `LAG / LEAD`: compare previous and next equipment values without a self join.
5. Explicit `ROWS` frames: calculate a deterministic running power total.
6. CTE + window Top-N Boss: rank each sector, then filter in the outer query.

The black-iron fortress uses consecutive monster IDs `45–55`, seeded fortress
encounters, and a guaranteed Iron Axe. Window ordering uses immutable
`monster_gear.power`, so defeated monsters changing to `hp = 0` cannot alter a
later lesson's expected result.

## Sixth-Floor Learning Route

1. `INSERT` with an explicit column list.
2. Targeted `UPDATE ... WHERE`.
3. Targeted `DELETE ... WHERE`.
4. `CHECK` failure handling with `INSERT OR IGNORE`.
5. `BEGIN / ROLLBACK`.
6. `SAVEPOINT / ROLLBACK TO / RELEASE / COMMIT`.

The dragon nest operates only on `repair_queue(id, item, quantity, status)`.
The validator blocks DDL, permanent course tables, unbounded updates/deletes,
and scripts longer than eight statements. A fresh database copy is created and
discarded for every attack, and the Dragon Spear is the guaranteed course
weapon.

## Run Locally

Requirements: Node.js `>=20.19` and pnpm `11.9.0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vite, normally `http://localhost:5173/`. Do not open
`index.html` through `file://`; the SQLite WASM file must be fetched over HTTP.

For a production-equivalent local check, build and serve `dist/` over HTTP:

```bash
pnpm build
pnpm preview
```

The game uses deterministic local SQL review and authored Scribe text by default.
Optional Python 3.11+ Campfire and Scribe Agent endpoints can be enabled with
`VITE_CAMPFIRE_AGENT_URL` and `VITE_SCRIBE_AGENT_URL`; they are stateless,
output-only services for `POST /v1/campfire/review` and
`POST /v1/scribe/respond`. The game remains fully playable without either
service, and no Agent output is persisted.

The top-bar `⌘ 管理员` button opens the spoiler-heavy admin view. It only
offers the next floor's starting position; the preview is memory-only and never
overwrites the formal Run or permanent monster profile. During combat it fills
the current correct SQL automatically, while settlement and review remain on
the formal flow. Reload the page to leave admin preview and restore the last
formal save.

The first two attacks are:

```sql
SELECT weakness
FROM monsters
WHERE id = 1;

SELECT name
FROM monsters
WHERE id = 1;
```

Start at the castle gate and follow the onboarding card or cyan beacon through
the actual maze. The minimap only reveals where you have explored: it cannot be
clicked to travel. Move into `ID #001`'s tile, press `Q + S`, type
the complete query, and use `Ctrl/Cmd + Enter` to attack. Before the final hit,
the target is shown only as `ID #001`; victory restores its name and records it
in the permanent Codex. Then read the XP settlement, approach any loot bundle
left on the monster's tile, and press `E` to process its items.

## Architecture and Storage

For a first pass through the code, follow this short route:

1. `src/application/main.ts`: startup and dependency assembly.
2. `src/domain/shared/types.ts` and `src/domain/session/GameSession.ts`: state contracts and the single source of gameplay truth.
3. `src/infrastructure/storage/localProgress.ts`: save validation, migration dispatch, and restoration.
   `src/infrastructure/storage/runMigrations.ts` owns the v4-v12 in-memory Run conversion chain.
4. `src/infrastructure/sql/SqlEngine.ts` and `src/domain/learning/lessonEvaluator.ts`: SQL execution and grading boundaries.
5. `src/presentation/phaser/` and `src/presentation/dom/`: Phaser and DOM presentation, including local review and authored narrative display.

The top-level source tree is:

```text
src/
├─ contracts/        cross-layer read-only game, persistence, result, Campfire/Scribe Agent, and storage contracts
├─ application/       startup, configuration, and page lifecycle
├─ content/           curriculum, world, narrative, inventory, and SQL content
├─ domain/            session facade/helpers, combat, exploration, learning, progression, and shared rules
├─ infrastructure/    audio, feedback, SQLite, storage codecs/migrations, and browser adapters
└─ presentation/     Phaser scenes, DOM views, and focused renderers
```

Within the facades, `src/presentation/dom/panels/` owns focused DOM interactions,
`src/presentation/dom/renderers/` owns HUD/minimap/combat presentation, and
`src/presentation/phaser/world/` owns world rendering decisions. The learning
boundary keeps SQL feature tags in `queryFeatureDetector.ts`, the sealed-identity
firewall in `queryIdentityRules.ts`, stage selection in `lessonLocks.ts`, authored
result semantics in `lessonResultEvaluator.ts`, and compatibility composition in
`lessonEvaluator.ts`.

```text
AppShell ── HUD, discovery minimap, onboarding, terminal, local review, authored narrative
    │
GameSession ── authoritative physical world, actors, fog, combat, loot, profile
  ├─ FloorContracts ── validated eight-floor curriculum and content schema
  ├─ CampaignDomain ── ordered eight-floor slots and transition invariants
  ├─ RunGraph ── curriculum dependencies and point-of-interest gates
  ├─ FloorMapBlueprints ── eight authored macro layouts and transit identities
  ├─ FloorLabyrinthContent/Domain ── F1-F8 safe areas, sight, hazards
  ├─ MazeGenerator/MazeFloor ── canonical 56x42 generator-v7 physical map
  ├─ MazeValidation ── topology, reachability, and save invariants
  ├─ CampfireDomain ── two seeded fires, entrance checkpoint, visible safe masks
  ├─ GuidedMap ── route beacons, dead-end caches, guaranteed key, shortcut
  ├─ BiomeDomain ── derived regions, static features, safe area-Boss anchors
  ├─ EncounterDirector ── deterministic safe windows and step-based ambushes
  ├─ MonsterRoaming ── deterministic slow patrol decisions
  ├─ LootDirector ── independent recovery candidates and deduplication
  ├─ gateChallenges ── optional Boss-gate feature and result contracts
  ├─ lessonEvaluator ── result semantics + concept locks
  ├─ SqlSchemaCatalog ── canonical four-table metadata and generated DDL
  ├─ SqlAutocomplete ── complete-schema completion and accessible listbox state
  ├─ SqlEngine ── read-only queries plus disposable write/transaction sandbox
  ├─ NarrativeContent/Domain ── five beats per floor, evidence, ascents, MIGRATE
  ├─ ActorVisuals/PixelActorFactory ── shared world/battle procedural actors
  ├─ DungeonScene ── continuous exploration, fog, collision, patrol, Scribe
  ├─ BattleScene ── duel presentation and shared actor animations
  ├─ FeedbackDirector ── exploration notices and event audio routing
  ├─ RecordedScorePlayer/ArcadeAudio ── F1/F2 masters + procedural fallback/SFX
  ├─ NarrativeCodexView ── local Lost Name evidence and migration progress
└─ OnboardingController ── separately persisted progressive guide
```

```text
agent/
├─ contracts/ ── Campfire/Scribe models, evidence hash, request/response validation
├─ flows/     ── review and Scribe flows with deterministic generators
├─ campfire/  ── Campfire compatibility entry point
├─ scribe/    ── Scribe compatibility entry point
├─ storage/   ── in-memory or optional SQLite trigger store
└─ http/      ── routes, request body, and HTTP lifecycle
```

`src/application/triggers/` converts snapshot changes into semantic events;
`src/application/hooks/` owns the `dirty / requesting / ready / fallback` state.
A new answer marks the current floor dirty, entering the circular two-cell
campfire range starts at most one request for that evidence, and `ScribeHook`
responds to physical Scribe inspection, death, and navigation guidance level
changes.
`src/domain/learning/campfireReview.ts` still produces the immediate local result.
The optional `src/infrastructure/agent/CampfireAgentClient.ts` sends only the
bounded current-floor projection, caches by evidence hash in memory, and accepts
responses only when their request identity and hash match. The
`src/infrastructure/agent/ScribeAgentClient.ts` sends only authored text and
bounded scene evidence to `POST /v1/scribe/respond`; invalid or stale responses
are discarded and the authored/local text remains usable. The Scribe never
modifies gameplay state, routes, or saves.

`FloorContracts` defines the eight-floor curriculum and content boundary, while
`CampaignDomain` serializes deterministic ordered slots and rejects skips or
duplicate activation. `RunGraph` is the executable
eight-floor dependency graph; it does not move the player.
`MazeFloor` is the physical world. The discovery minimap is a read-only view of
exploration, while movement, same-tile encounters, pickups, and gates are
resolved by `GameSession` against the maze.

New Runs use one canonical maze-generator-v7 set of eight `56x42` compact
labyrinths that spread authored rooms across the full map. Players cannot input
or reroll a map seed. Generator-v6 `96x72`, generator-v5 `48x36`,
and generator-v4 `64x48` maps remain loadable only for legacy Run compatibility.
The generator isolates `topology` and `decor` random streams. `GuidedMap`
then derives route beacons, dead-end caches, and the keyed shortcut from the
fixed maze, curriculum graph, and campfires, so decoration density cannot move
courses, keys, or shortcuts. Actors and fixed curriculum room chests derive from
course anchors, while biome loot uses independent stable hashes. The biome plan
is rebuilt from maze, campfires, guided map, and seed instead of being stored.
The eight-floor labyrinth content similarly stores only stable intent; its safe
cells, current sight, and hazard coordinates are resolved from the canonical
maze. Triggered traps reuse `openedGateIds`; directly crossing open room
boundaries adds no save field. Run v12 pins the question-bank version, deterministic
deck state, repeat-practice reward state, and navigation guidance counters.

The generated, read-only `public/data/question-bank-v2.sqlite` contains 960
questions: each floor has 64 L1, 40 L2, and 16 L3 questions. On floors two
through eight, L1 contains 40 current-floor and 24 review questions; L2/L3 are
current-floor questions. Each floor uses 15 families
of eight executable variants built from real fixture values, with exact result
and ordering evidence stored for grading. Fixed curriculum monsters and floor
Bosses keep authored stages; normal, mini-elite, and area-Boss practice battles
draw one L1, two L2, and three L3 questions. Its manifest verifies version, size, count, and
SHA-256 before use. A new bank version only applies to a new Run.

On floors one through five and seven through eight, the terminal accepts one
read-only `SELECT` or `WITH` statement and displays at most 50 rows. Floor six
accepts one to eight validated statements against disposable `repair_queue`;
DDL, `PRAGMA`, `ATTACH`, permanent tables, and unbounded updates/deletes are
rejected. Query plans and query load are SQLite teaching signals, not evidence
about the MySQL optimizer. Floor-eight concurrency and distribution exercises
read deterministic incident fixtures rather than claiming native SQLite
behavior.

Browser-local storage is split into:

- `select-from-dungeon:run:v12`: disposable current Run, including the
  deterministic eight-floor campaign scaffold, current executable floor,
  generated maze, world actors, ground items, pending loot bundles,
  equipment inventory, armor/armor HP, consumables, unique-item history, key
  items, discovered fog cells, two campfires, the entrance anchor, active checkpoint, HP,
  level/XP, encounter meter, relics, combat progress, opened challenge gates,
  opened shortcut/cache state, the active gate challenge, and up to 200 local
  SQL answer records, question-bank/deck state, first-reward random-practice
  state, and guidance counters. The guided plan itself is rebuilt from the seed instead
  of storing a duplicate copy.
- `select-from-dungeon:profile:v3`: 47 mastered lessons, recovered monster IDs,
  attempts, victories, and best run query count.
- `select-from-dungeon:onboarding:v1`: whether the optional guide was completed
  or skipped.
- Campfire and Scribe Agent output are memory-only in the browser and are never
  written to Run, Profile, or IndexedDB. The Python service is stateless by default; an
  explicit Agent-only SQLite store may persist trigger metadata and validated
  output, never the game database or raw SQL.
- IndexedDB `select-from-dungeon-learning`: at most 5,000 full answer attempts
  plus permanent question and lesson aggregates, with JSON export and explicit
  clearing.
- IndexedDB `select-from-dungeon-content`: verified versioned question-bank
  bytes used to keep an in-progress Run pinned to its bank version.

A valid `run:v11` is migrated in memory into v12 without changing the current
Run. Valid `run:v10` through `run:v4` saves continue through the existing
migration chain before v12. Legacy keys are not deleted; earlier Run keys remain
unread. Valid `profile:v1` and `profile:v2` records migrate to v3, preserving
learning counters while initializing missing identity records as empty.
`src/infrastructure/storage/progressPersistence.ts` coalesces non-critical movement and patrol
snapshots, while query, loot, inventory, mode, and topology changes flush
immediately.

SQL execution and review evidence remain in browser-local SQLite, Run/Profile,
and IndexedDB boundaries. The optional Agent receives only the current-floor
projection when explicitly configured; it is not a source of gameplay truth.

## Validation and Build

```bash
pnpm question-bank:build
pnpm test
pnpm build
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
```

`pnpm build` type-checks the project and writes the static site to `dist/`.
The build also copies the authoritative root `LICENSE` and `ATTRIBUTIONS.md`
into `dist/`; do not maintain separate hand-written copies. Deploy that directory
to a static host that serves WASM with the correct MIME type.

GitHub Pages is deliberately opt-in. `.github/workflows/deploy-pages.yml` runs
only when the repository variable `PAGES_ENABLED=true`; it validates the
rules, tests, and production build before publishing `dist`, and keeps Vite
`base: "./"`. The current repository remains private. If its provider/plan does
not allow a workflow-backed Pages site, publication is recorded as
`provider-blocked`, the variable stays false or unset, and the repository must
not be made public or moved to another host without separate authorization.

MVP 2.0 retains the existing Phaser, SQLite WASM, world-rules, and application
chunk split. Further bundle/startup optimization is deferred to the independent
MVP 2.1 performance pass; this content release does not change engine,
dependencies, schema, or save versions for that purpose.

### Current Validation Status

- **Automated coverage:** all eight labyrinth contracts and map blueprints, 47
  required lesson groups, required anchors and Boss boundaries, shortcut keys
  and hidden entrances, safe-zone constraints, real SQLite reference results,
  and compatible save migrations.
- **Browser spot checks:** representative F1, F2, F4, and F8 scenes plus SQL
  combat, cipher gates, campfire and death review, inventory, autocomplete,
  Schema Codex, reload recovery, and floor transitions. Key desktop, narrow,
  touch, and Reduced Motion paths were checked without horizontal overflow or
  console errors.
- **Human checks remaining:** one continuous eight-floor playthrough, open
  safe-room crossings and patrol visibility details, a few uncovered dialog
  states, headphone/speaker fatigue review, and a restricted iframe environment.

Automated tests and a production build do not replace browser or human QA.
Version-by-version evidence is no longer accumulated in the README; use Git
history when that detail is needed.

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

This MVP covers 47 lesson groups across eight floors, ending with real SQLite
query-plan exercises and deterministic incident analysis for MVCC, locking,
isolation, modeling, replication, sharding, and SQL security. Distributed-system
records are teaching fixtures, not claims that SQLite implements those systems.
The 12-slot inventory, equippable armor, seeded biome multi-drop system, and all
eight biome slices are implemented.

Original code and prose use the [MIT License](LICENSE), copyright
`Kkkirito-123`. Runtime notices and design references are listed in
[ATTRIBUTIONS.md](ATTRIBUTIONS.md). Characters and UI effects are generated by
project code. The first two floors additionally use audited CC0 tile/prop packs
through reproducible manifests; music and sound effects are rendered from
project-authored score/event code using public-domain musical material rather
than copied recordings.
