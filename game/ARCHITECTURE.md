# Current Game Architecture

This file records verified current facts for `game/`: product boundaries,
ownership, runtime flow, commands, data formats, compatibility, and security
surfaces. Stable editing rules live in `AGENTS.md`; the active repository task
lives in `../TASK.md`. `ARCHITECTURE.zh-CN.md` is the synchronized Chinese
translation.

## At a glance

Read this section first. Product version **1.0** is assembled from eight clear
areas; internal format numbers are separate compatibility identifiers.

```text
Browser
└─ index.html -> src/application/main.ts
   ├─ contracts/       Shared types and cross-layer protocols
   ├─ application/     Startup, configuration, lifecycle, orchestration
   ├─ features/        Workflow facades, coordinators, and runtime assembly
   ├─ content/         Authored curriculum, floors, story, SQL, inventory
   ├─ domain/          GameSession and pure gameplay rules
   ├─ infrastructure/  Persistence, SQLite, audio, presence, Agent IO
   ├─ presentation/    DOM panels and Phaser scenes
   └─ devtools/        Development-only Dungeon Maintainer bridge
```

| Area | Owns | Does not own |
| --- | --- | --- |
| `contracts/` | Cross-layer types, save/result/Agent/storage protocols | Gameplay rules, rendering, or I/O |
| `features/` | `GameSession`, terminal, narrative, snapshot, AppShell, and runtime packages | Duplicate authored content or adapter implementations |
| `content/` | Authored curriculum, floor/world/story/SQL/inventory definitions | Mutable runtime state or persistence |
| `domain/` | Session support services and gameplay rules for movement, combat, exploration, learning, progression, and loot | DOM, Phaser, network, or browser storage |
| `application/` | Startup, configuration, lifecycle, and event/Agent orchestration | Detailed gameplay decisions or rendering |
| `infrastructure/` | Persistence, SQLite, audio, presence, browser, and Agent adapters | Gameplay decisions or UI markup |
| `presentation/` | DOM panels/renderers and Phaser scenes; renders snapshots and forwards intent | Saves, SQL judging, hidden state, or rule ownership |
| `devtools/` | The development-only Dungeon Maintainer bridge and player-visible projections | Production paths, player saves, hidden answers, or full maps |

`GameSession` is the only mutable game-state committer. All other areas either
describe content, apply rules through it, perform external I/O, or render its
snapshots.

```text
Startup
index.html -> main.ts -> GameRuntime -> DataStore/GameSession -> AppShell + DungeonScene

Player action
DOM/Phaser input -> GameSession -> Snapshot/Event -> DOM + Phaser + Persistence

SQL action
SQL terminal -> SqlEngine + lessonEvaluator -> GameSession -> Snapshot/Event
```

Feature packages use one-way ports: `game-session` is the only mutable rules
facade; `terminal`, `narrative`, and `snapshot` consume explicit service ports;
`app-shell` owns DOM lifecycle and input routing; and `game-runtime` owns
construction, page lifecycle, and reverse teardown. `scripts/check-architecture.mjs`
rejects undeclared feature edges and cycles.

The current internal identifiers remain **Run 12**, **Profile 3**, and
**generator 7**. They describe save/world formats, not product releases.

## Product and Users

`SQL 魔王城 / SELECT * FROM DUNGEON` is a Chinese browser roguelite for SQL
beginners and interview learners. Product version 1.0 is the current eight-floor
Run. New Runs use one canonical set of eight
deterministic `56x42` generator-v7 maps; players cannot enter or reroll a map
seed. Each floor distributes its authored rooms across the compact map, with a
DFS labyrinth, about 15% loops, three regions, and physical transit landmarks.
Only generator-v7 maps are accepted by the current Run validator; historical
map formats are ignored. Players reveal the
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
beacons, one-use supplies in every remaining dead end, and three guaranteed-key
two-way shortcuts serving the front, middle, and rear phases. Route points stay
at most 18 walking steps apart; keys do not consume inventory capacity and never
depend on random loot. The player must physically reach each key, then press `E`
beside its shortcut to open and use it; shortcuts reduce repeat walking without
bypassing required SQL or a living region Boss. If the next fixed objective is
not reached after 40 successful steps, guidance shows direction and distance;
at 60 it highlights up to 24 route cells, and at 100 it keeps the route
highlight active at full strength. The player always moves manually; guidance
does not teleport or trigger ambushes.
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
restored by campfire rest or respawn. In product version 1.0, optional random loot is limited
to an immediately consumed recovery item: 2% for normal monsters, 5% for
mini-elites, 10% for area Bosses, and 0% for floor Bosses. Random loot has no
minimum count; course rewards, explicit chests, and keys stay deterministic.
Full bags require explicit replacement, ordinary discards remain
recoverable on the current floor, and protected base/course/key items cannot be
discarded.
Campfires and the Scribe are separate game objects. A physical campfire always
handles rest/checkpoint actions, but its learning recap stays unavailable until
the current-floor elite is defeated. After that condition, the campfire renders
an immediate deterministic recap from current-floor records; its review button
  is disabled before the condition. Each floor also has one physical Scribe whose
  authored content is the local fallback. There is no player prompt box. When
  `VITE_AGENT_URL` is configured, the optional stateless Python service runs
  only the changed Campfire or Scribe child and then Main guidance through
  `POST /v1/agent/run`. Local results
  remain the immediate fallback. The Scribe responds to
  inspection, death review, and navigation guidance level changes, and never
  changes gameplay state, routes, or saves. Five short narrative
beats and two fixed Lost Name evidence entries per floor still unlock from
existing Run progress; the local `失名录` distinguishes unknown, confirmed
`NULL`, and actual values. The eighth floor resolves the sole 1.0 ending,
`MIGRATE`; no account, server game database, or remote game log is used.
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
capped at 200 SQL turns and never records movement or key presses. The complete
  log remains browser-local and is summarized by deterministic game rules. An
  explicitly configured Campfire Agent receives only the current-floor aggregate
  and at most eight submitted SQL projections. The Scribe Agent receives only the
  current scene's authored message and bounded learning, death, or navigation
  evidence; reference SQL, movement, map, inventory, identity, and full game
  state never leave the browser.
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
hidden-room, safe-room, sight-radius, and physical-hazard intent. Players walk
directly from authored safe rooms into the hostile maze; no invisible threshold
or confirmation wall may block an otherwise walkable tile. Authored entry/rest
rooms and deterministic campfire rings reveal their complete safe area and reject
ambushes, patrols, curriculum actors, area Bosses, and hazards. Outside them,
current actor visibility uses the floor-specific local radius. Each floor's
seed deterministically places its own visible, one-use physical hazards away
from rooms, anchors, gates, transport, guided-map interests, and safe cells;
triggering one applies its authored armor-first damage without starting SQL
combat, then records the stable hazard ID in `openedGateIds` as inert. Floors
two through eight keep adjacent maze walking free of abstract region collision:
the living middle area Boss instead locks the visible middle-to-rear transit
and any cross-region shortcut. Room prerequisite gates still prevent curriculum
bypass.
Floors one through eight have authored runtime experience definitions:
stable landmarks, physical hidden-room entrances, derived world-state changes,
one physical SQL cipher, story triggers, Scribe placement, and admin presets.
Floor three makes JOIN
relationships visible through a bone bridge, paired steles, a relic chain, and
preserved witnesses. Floor four uses fire, frost, and storm regions; its middle
Boss `ID #044` guards the visible rear transit and reveals the optional first-floor ember
echo after defeat. The echo is an in-floor memory space, not a floor transition
or a second copy of first-floor progress.

The current product deliberately does not include free-form AI chat,
AI-authored curriculum or gameplay state, accounts, leaderboards, multiplayer,
a server game database, or a faithful MySQL optimizer/InnoDB runtime. The
optional output-only Scribe adapter is read-only and never gates play. A fixed
internal world key rebuilds the canonical physical maze; stable hashes may still
vary non-critical rewards and optional loot, but not required SQL data,
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
index.html -> src/application/main.ts
  -> features/game-runtime/GameRuntime (service assembly, lifecycle, reverse teardown)
  -> features/game-session/GameSession (single mutable rules facade)
  -> features/app-shell/AppShell (DOM HUD, minimap, inventory/loot, SQL terminal, local review)
     -> features/terminal/TerminalCoordinator (one SQL submission)
     -> features/narrative/NarrativeCoordinator (story actions and evidence confirmation)
     -> features/snapshot/SnapshotRenderer (pure snapshot projection)
  -> DEV-only DungeonAgentBridge (localhost + ?playtest=agent, memory-only store)
  -> AppShellTemplate/AppShellDom (static markup and fail-fast stable selector contract)
  -> PresenceClient -> same-origin SSE -> ../presence/server.mjs -> PresencePanel
  -> CampfireReview (current-floor deterministic SQL recap)
  -> TriggerBus -> AgentRuntime/XState (parallel Campfire, Scribe, Main lifecycle and memory caches)
  -> AgentGateway -> optional ../agent/src/dungeon_agents -> changed PydanticAI role -> Main guidance -> AgentPanel
  -> OpenTelemetry (content-free request, child, Main, and model spans)
  -> QuestionBankLoader/LearningLedger (verified SQLite content + IndexedDB evidence)
  -> SqlAutocomplete (complete-schema vocabulary, ranking, replacement, listbox)
  -> SqlSchemaCatalog (canonical fields, types, generated DDL, teaching relations)
  -> FloorContracts (eight-floor curriculum, encounter, theme, and loot schema)
  -> GameSession (authoritative maze, combat, loot, answer log, profile)
  -> CampaignDomain (ordered eight-floor slots and transition invariants)
  -> RunGraph (curriculum dependency and point-of-interest graph)
  -> FloorMapBlueprints (eight authored macro layouts and transit identities)
  -> FloorLabyrinthContent (stable F1-F8 navigation, safe-room, sight, and hazard contracts)
  -> FloorExperience (authored F1-F8 landmarks, hidden rooms, SQL ciphers, story, world states)
  -> MazeGenerator/MazeValidation (canonical deterministic 56x42 generator-v7 world)
  -> CampfireDomain (two seeded checkpoints, entrance anchor, safe-cell masks)
  -> GuidedMap (route beacons, dead-end caches, guaranteed key, shortcut)
  -> BiomeDomain (derived regions, static features, safe area-Boss anchors)
  -> FloorLabyrinthDomain (local sight, safe-area resolution, deterministic hazards)
  -> EncounterDirector (deterministic step meter, safe windows, ambush choice)
  -> MonsterRoaming (deterministic slow patrol decisions)
  -> LootDirector (seeded independent candidates and same-battle deduplication)
  -> SqlEngine (in-memory SQLite runtime: WASM first, asm.js fallback, seed data, SELECT/WITH execution, HP sync)
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
  -> coalesced v12 Run save + permanent v3 profile save + IndexedDB learning ledger
meaningful snapshot -> current-floor evidence -> deterministic local review output
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

`src/domain/learning/campfireReview.ts` owns the deterministic current-floor SQL
recap used by the Campfire Panel. It reads snapshot evidence only, does not
access storage or external services, and cannot mutate gameplay state.
`src/application/agent/scribeView.ts` projects the active scene into bounded
learning, death, or navigation evidence; authored content remains the local
fallback and existing identity redaction still applies before display.

`src/application/triggers/` converts snapshot changes into semantic events and
`src/application/agent/AgentRuntime.ts` owns one XState actor with parallel
Campfire, Scribe, and Main regions. It handles dirty state, same-source
cancellation, cross-source concurrency, panel priority, and three independent
page-memory caches. `src/infrastructure/agent/AgentGateway.ts` is the single
network boundary for the single endpoint, stable hashing, five-second aborts,
and strict response validation. Navigation uses a deterministic Scribe child and
does not invoke the Scribe model. `agent/` owns the Python 3.11+ strict Pydantic
contracts, PydanticAI model runner, child and Director flows, content-free
OpenTelemetry spans, and the three HTTP routes. It has no Agent database or
output store.

`src/application/config/` owns Chinese-commented runtime tuning values such as map size,
encounter rates, navigation thresholds, storage limits, and the same-origin
presence endpoint. `PresenceClient` validates SSE counts and owns reconnecting
browser state; `PresencePanel` renders only the supplied state.
It must never contain provider credentials. Content IDs, prose, SQL contracts,
and save versions remain with their existing authorities.

`src/devtools/dungeon-agent/` owns the sole external maintainer protocol 1.0 and remains
development-only. The maintainer rejects every other bridge protocol.
`protocol.ts` owns types and temporary storage, `actions.ts` owns fixed DOM actions and visible
overlays, `projection.ts` owns the player-visible view, `navigation.ts` owns internal target/frontier
BFS and stop reasons, `query.ts` owns browser-only fixed query execution, `trace.ts` owns the bounded
semantic ring, and `bridge.ts` only composes the protocol lifecycle. `src/application/main.ts` may load
it only behind `import.meta.env.DEV`, a localhost URL, and `?playtest=agent`. This mode uses an in-memory
DataStore, disables the optional remote Agent endpoint, never opens the player's IndexedDB or local
Run/Profile. It may project only SQL already visible in the currently open terminal textarea; it must
never read `snapshot.adminAnswerSql`, hidden answers, unrevealed hints, the complete map, saves,
inventory, identity, or hidden judge data.

`src/content/sql/sqlSchema.ts` owns the canonical field/type/nullability metadata,
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
`src/content/curriculum/mvpLevel.ts`, with later executable floors in
`src/content/curriculum/floor2Level.ts` through `floor8Level.ts`; room flavor and run rewards live in
`src/content/world/runContent.ts`; optional Boss-gate questions and semantic result
contracts live in `src/content/curriculum/gateChallenges.ts`; onboarding copy lives in
`src/content/curriculum/onboarding.ts`. SQL stages intentionally start blank.
`src/content/curriculum/lessonTaskBrief.ts` is the player-facing SQL-task presentation
boundary. It derives the current situation, exact output columns, canonical
field meanings, JOIN relation, clauses, world effect, difficulty tier, and a
four-step hint ladder from the authored stage plus `sqlSchema`; `AppShell` only
renders that contract and must not rediscover SQL semantics. Ordinary encounter
stage one contains one current chapter plus baseline projection/filtering;
mini-elites may add at most one mastered chapter from stage two onward, and
floor Bosses progress from a single chapter to a final two- or three-chapter
audit. A complete SQL answer appears only in hint four.
`src/presentation/dom/appShellTemplate.ts` exclusively owns the static AppShell markup;
`src/presentation/dom/appShellDom.ts` owns reusable stable selector bindings. Runtime renderers
and event handlers must not duplicate that markup or silently query a second
selector for the same persistent node.
`src/presentation/dom/panels/` owns terminal, inventory, campfire, review, narrative,
Schema, and presence presentation. `RecordPanel` owns the shared story, inspection,
migration, and Scribe record surface; `TransitionPanel` owns floor, region, and defeat
transitions and their short timers; `TransientFeedbackPanel` owns pickup and combat
settlement cards; `AdminPanel` owns the administrator menu DOM, focus, and copy while
`AppShell` keeps cross-runtime administrator actions. `src/presentation/dom/renderers/`
owns HUD, minimap, and combat presentation. Panels receive snapshots and explicit
callbacks, never storage, external services, or Phaser instances.
`src/presentation/phaser/world/` owns terrain, fog, world-object visibility, and
topology rebuild decisions. `WorldRuntimeLayer` composes zone labels, gates, shortcuts,
campfires, and hazards. `FloorSetpieceLayer` is the single registry/facade for the
floor-specific modules in `world/setpieces/`; their shared lifecycle and common
landmarks live in `world/shared/FloorSetpieceModule.ts`. `DungeonScene` remains the
lifecycle and event facade.
`src/domain/learning/queryFeatureDetector.ts` owns SQL feature tags,
`queryIdentityRules.ts` owns the sealed-identity firewall, `lessonLocks.ts` owns
stage selection and the flat beginner-SQL shape guard, and
`lessonResultEvaluator.ts` owns authored result semantics. `lessonEvaluator.ts`
composes these current judging rules.
`src/content/inventory/inventoryCatalog.ts` owns inventory capacities, the current
weapon/armor/consumable catalog, and biome-based optional candidate probabilities;
`src/domain/inventory/lootDirector.ts` owns deterministic independent rolls and
same-battle deduplication. Runtime optional candidates are immediate recovery
items only; unlocked curriculum room chests still use the inventory flow.
`src/content/world/biomeContent.ts` owns the executable eight-floor biome encounter
pools and optional multi-stage exercises. `src/domain/exploration/biome.ts` derives region
ownership, static features, area-Boss positions, and two region portals from
the maze, campfires, guided map, and seed; this plan is rebuilt during load and
is not serialized.
`src/content/world/floorLabyrinth.ts` owns the stable eight-floor navigation contract;
`src/domain/exploration/floorLabyrinth.ts` resolves that intent against the current saved
`MazeFloor`, campfires, guided plan, and biome plan. It must not persist derived
safe-cell, sight, or hazard-position duplicates.
`src/content/curriculum/floorContracts.ts` owns campaign curriculum metadata and its
serializable schema. Registered drift `AUTH-003` is closed by cross-authority
tests, but this file is still not
the player-facing authority for floor names, biomes, or exact monster rosters.
Executable monster truth lives in the per-floor level files and
`biomeContent.ts`; player-facing places and events live in Floor Experience;
navigation boundaries live in Floor Labyrinth and Floor Map Blueprints.
`src/domain/progression/campaign.ts` owns the serializable ordered floor slots and must
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
  IDs plus Run v12/Profile v3 are stable current keys and must not be renamed.
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
`src/presentation/dom/sqlAutocomplete.ts` owns deterministic suggestions derived from the
complete canonical schema, current task context, and MVP SQL vocabulary. It may
replace only the active token after explicit keyboard or pointer acceptance; it
must not generate a complete answer, submit a query, or bypass lesson
evaluation.

## Game Project Map

The machine-readable routing authority is the game-owned
`../.maintainer/architecture-map.json`. Schema v4 adds cross-layer `features`, a
bounded runtime contract, and a stable-boundary signature to the existing
layer/area/partition and eight `floorScopes`. Feature and floor roots name stable
directories, never individual files or globs. Ordinary files and internal folders
do not update the map; stable roots, responsibilities, or routes increment the
boundary revision and signature.

Normal inspection routes by capability first and keeps an optional floor as
context. It expands through the feature's primary, adjacent, shared, and fallback
roots before the safe area/repository fallback. The maintainer accepts only the
complete current schema v4 map; every other or invalid map falls back to ordinary
safe search. Floor children must not import sibling floors. Common algorithms and
services move to a parent service partition and a single registry composes them
one-way. `GameSession` remains the only mutable session-state committer. Focused
navigation guidance lives in `domain/session/exploration/navigationGuidance.ts`;
inventory transformations are composed by `domain/session/inventory/`; combat
question drawing, experience, damage, and battle review are composed by
`domain/session/combat/`. These modules consume narrow contexts and do not own a
second session state.

The session-specific read model is exposed through `domain/session/sessionSelectors.ts`;
the feature facade only adapts its explicit context to the public getters. AppShell's
reset path is a separate `features/app-shell/workflows/ResetWorkflow.ts` workflow:
it sequences UI cleanup, session reset, SQLite reset, battle cancellation, and audio
restoration through ports while keeping DOM ownership in AppShell.

The feature package directory is the maintainer's first lookup point:

| Package | Entry point | Locate this kind of issue |
| --- | --- | --- |
| `features/game-session/` | `GameSession.ts` | State, public actions, snapshots, and rules facade |
| `features/terminal/` | `TerminalCoordinator.ts` | SQL submission, SQLite sync, battle animation, and busy cleanup |
| `features/narrative/` | `NarrativeCoordinator.ts` | Story actions, audio/world effects, and evidence confirmation |
| `features/snapshot/` | `SnapshotRenderer.ts` | Snapshot deltas, mode entry, and render projection |
| `features/app-shell/` | `AppShell.ts` | DOM assembly, input routing, and panel lifecycle; `rendering/` owns snapshot projection and `workflows/` owns narrative/feedback-transition/reset orchestration |
| `features/game-runtime/` | `GameRuntime.ts` | Startup assembly, page visibility, failure recovery, and teardown |

The package direction is fixed as “lower-level service -> feature coordinator ->
GameRuntime”; the architecture checker rejects undeclared feature edges and cycles.
`GameRuntime` is the final owner of external resource disposal for Audio, Presence,
persistence, and the maintainer bridge; `AppShell.destroy()` only unbinds its own
DOM subscriptions, panels, and user-gesture listeners to avoid duplicate async disposal.

### Game-owned Benchmark contract

`../scripts/benchmark-adapter.mjs` is Adapter v2 and the only external source of
production Benchmark cases. `catalog` returns schema/Adapter version 2, the
stable ordered `full` suite of 7 public cases, and a SHA-256
`sourceFingerprint`. The fingerprint covers the current Git commit and
worktree state plus the Adapter and architecture map; it is an invalidation key,
not a source or hidden-data projection. Public `describe` returns only the
public case. Runner `describe` additionally returns the hidden reproduction and
expected contract. `materialize` creates a one-commit isolated repair repository
without `benchmark/`, the Adapter, or the source task files.

Each hidden `../benchmark/agent-evals/*/expected.json` uses schema v3 and
declares one or more `expectedRouteFeatures`. The architecture check requires
the public prompt to have a positive best match for every declared feature, so
case routing changes together with the game-owned map rather than a maintainer
file index. The hidden browser Judge returns only bounded verification fields.

```text
src/contracts/          Cross-layer read-only game, persistence, result, Agent, and storage contracts
src/application/        Startup, runtime configuration, and page lifecycle
src/content/            Static curriculum, world, narrative, inventory, and SQL content; floor author data under */floors/floorNN
src/domain/             Session support services, combat, exploration, learning, progression, inventory, and shared rules
src/features/           GameSession, terminal, narrative, snapshot, AppShell, and GameRuntime packages
src/infrastructure/     Audio, feedback, SQLite, storage codecs/validators, presence, and browser adapters
src/presentation/       Phaser scenes, DOM application views, and focused renderers
src/devtools/           Development-only external maintainer bridge; no production import path
tests/              Vitest tests for rules, maze, roaming, feedback, storage,
                    onboarding, and query policy
docs/               Current bilingual blueprints, one active roadmap, future
                    candidate designs under docs/design/, and historical reports
scripts/            Game asset, question-bank, and architecture scripts
dist/               Generated static build; ignored and never hand-edited
```

Repository governance, the optional Python service, and cross-project CI live
one level above this project. The optional Node.js presence service also lives
there and never enters `game/dist`.

## Canonical Commands

Run these commands from `game/`. Requirements: Node.js `>=20.19` and pnpm `11.9.0`.

```bash
pnpm install --frozen-lockfile
pnpm question-bank:build
pnpm dev
pnpm test
pnpm build
```

`pnpm build` runs TypeScript checking before the Vite production build. The
static output is `dist/`; serve it through HTTP rather than opening files through
`file://` because the WASM asset must be fetched normally.

The presence client defaults to relative `api/presence`, so `/game/` deployments
request `/game/api/presence`. Vite proxies `/api/presence` to the local service;
production Nginx must proxy the deployed path with buffering disabled. A missing
service changes only the indicator to unavailable and cannot block startup.

## Runtime and Safety Boundaries

- The Dungeon Maintainer bridge is installed only when `import.meta.env.DEV`, a localhost
  hostname, and `?playtest=agent` all match. It uses a page-memory DataStore and a temporary
  Chromium `sessionStorage` checkpoint that is deleted immediately after restore. The bridge
  exposes only `prepare/checkpoint/look/act/query/judge/events`; `act` accepts only a stable action ID
  from the matching latest revision, and `query` writes its SQL to the current fixed player textarea
  before clicking the real submit control. Model-facing projections never
  receive hidden answers, unrevealed hints, complete maps, saves, inventory, identity, or hidden
  Judge details. The fixed Benchmark runner alone may read the bounded `judge` summary described
  above; it is not added to `look`, action results, or model context. The only SQL exception is the
  current value of a player-visible textarea while its
  terminal is open; closed terminals and `snapshot.adminAnswerSql` remain outside the projection.
  Production builds must not contain an accessible `window.__DUNGEON_PLAYTEST__`.
- SQL execution remains entirely in the browser through `sql.js`. The runtime
  prefers SQLite WASM and falls back to the bundled asm.js build when the host
  blocks WebAssembly code generation, so static hosting and restricted embedded
  browsers use the same game path.
  Campfire review uses only current-floor local snapshot records, and the Scribe
  uses authored content plus a bounded scene projection. If explicitly configured,
  the optional Agent endpoint receives one changed child projection and
  already validated same-floor child display text through `POST /v1/agent/run`.
  The game remains playable without
  any service and keeps no Agent output in browser storage.
- The lower-left online indicator counts active browser-tab SSE connections, not
  unique people. It sends no player identifier or gameplay data. The Node.js
  service keeps only an in-memory connection set, binds to localhost by default,
  and requires shared state before it can be replicated.
- Agent requests contain a request ID, evidence hash, current floor, and only
  the scene-specific bounded evidence. Campfire requests contain aggregate counts
  and at most eight submitted SQL projections; Scribe requests contain only the
  authored message plus bounded learning, death, or navigation evidence. The Main
  Agent model sees only child display text. Neither request contains reference SQL,
  full `GameSnapshot`, player identity, movement,
  map, inventory, or gameplay commands. Responses must match the request hash and
  strict text limits before they can replace local wording. The unified route
  returns schema v1 call metadata for duration, mode, status, token usage, and an
  optional trace ID. Agent caches, output, usage totals, and live logs are
  page-memory only; the Python service does not persist requests or output.
- OpenTelemetry creates `agent.request`, `agent.child`, `agent.main`, and
  PydanticAI model spans. No trace is exported unless
  `OTEL_EXPORTER_OTLP_ENDPOINT` is configured. Spans may contain request ID,
  floor, event, source, status, fallback, duration, and token counts, but never
  prompt, completion, SQL, display text, snapshot, API key, or identity.
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
- `public/data/question-bank-v1.sqlite` is generated from authored TypeScript
  stages and is never hand-edited. Its manifest pins the version, byte length,
  SHA-256, and 960-question count. Every floor has 64 L1, 40 L2, and 16 L3
  questions. On floors two through eight, L1 contains 40 current-floor plus 24
  read-only review questions; L2 and L3 remain current-floor questions. Each
  floor has 15 deterministic families with eight executable,
  materially parameterized variants; generated rows, ordering, and floor-seven
  plan evidence form the per-question grading contract. Empty-result exercises
  must say so explicitly. Fixed curriculum monsters and floor Bosses keep their
  authored stages; normal, mini-elite, and area-Boss practice encounters draw
  one L1, two L2, and three L3 questions respectively.
  The generator creates a separate SQL fixture per floor from
  `monstersForFloor(floor)` and rejects monster relationship references outside
  that floor's closure. Run v12 must bind the current bank version and complete
  practice draw state; mismatched historical bindings are rejected. New Runs
  pin the active bank version and draw deterministic no-repeat decks.
  IndexedDB stores at most 5,000 full attempts plus permanent question/lesson
  aggregates; export and explicit clearing never include an API Key.
- `src/infrastructure/storage/localProgress.ts` is the Run/Profile
  load/save/clear facade for the current `run:v12` and `profile:v3` keys.
  `runCodec.ts` owns Run JSON encoding and `profileCodec.ts` owns Profile
  creation, validation, and encoding. Run validation flows one-way from
  `runDataValidators.ts` for player/combat/inventory values through
  `runWorldValidator.ts` for graph/map/world structures to `runValidator.ts`,
  which composes SavedRun cross-field invariants and exposes the version entry.
- Browser data is stored in one IndexedDB database,
  `select-from-dungeon-data`. Its `run_nodes` and `floor_nodes` stores keep
  global Run data separate from the active floor; `profile_nodes` keeps the
  v3 permanent profile; `guide_nodes` keeps onboarding; `attempts`,
  `question_stats`, and `lesson_stats` keep learning evidence; and
  `question_banks` keeps verified question-bank bytes. Only valid
  `select-from-dungeon:run:v12` and `select-from-dungeon:profile:v3` records are
  loaded. Current localStorage values may seed the unified IndexedDB or act as
  its unavailable-browser fallback. Historical Run/Profile keys and the old
  learning/content IndexedDB databases are neither read nor deleted; starting a
  new Run is the recovery path for unsupported data.
  `progressPersistence`
  coalesces non-critical movement/patrol snapshots while flushing query, loot,
  inventory, mode, and topology changes immediately; changing a shape requires
  a version or recovery decision.
- The labyrinth contract adds no separate save field. Generated hazard coordinates, safe-cell masks,
  and visibility are rebuilt from existing floor data; triggered hazard IDs
  reuse `openedGateIds`, while entry confirmation is reconstructed from the
  player's position, discovered cells, and visited rooms.
- Core learning drops and keys are deterministic. Runtime optional candidates
  are immediate recovery items only, with no rank-based minimum or loot bundle.
  Randomness must never block curriculum progress. Combat damage is
  deterministic so SQL targeting remains inspectable.
- Ordinary and mini-elite random monsters draw one and two bank questions
  respectively. They can be challenged again, but only their first victory in
  the current Run awards XP or optional loot.
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
- New Runs use one canonical generator-v7 `56x42` `MazeFloor` set that distributes the
  authored rooms across the compact map with DFS carving and about 15% loops;
  remote DFS branches outside the authored-room connection envelope are sealed
  back into walls instead of forming an unused outer maze. Other generator
  versions are rejected. There is no player-facing seed input or map reroll. Players must walk through the
  continuous world; the discovery minimap is not a navigation control. Moving
  into the same tile as a living curriculum monster or triggering the
  successful-step encounter meter starts the separate battle scene. After its
  safe window, the meter applies a 2% base chance on each eligible successful
  step and guarantees a battle at 30 eligible quiet steps. Entrance and
  campfire safe zones never advance this encounter risk, never spawn enemies,
  and reject patrol entry. Ordinary world monsters patrol slowly; the Boss
  remains anchored.
- All eight floors resolve their independent labyrinth contract at runtime.
  Players can cross every visibly open safe-room boundary directly; invisible
  threshold confirmation walls are forbidden. Safe rooms and campfire rings
  expose their whole safe area; the hostile maze exposes only the current
  floor's local sight radius. Seeded physical hazards are visible only when both
  discovered and currently in sight, apply their configured one-time
  armor-first damage without opening combat, and then become inert. F2-F8 rear
  regions also reject every normal walking step while the bound middle area
  Boss is alive; F1 remains the continuous no-region-portal exception.
- `GuidedMap` is derived deterministically from the curriculum graph, saved
  `MazeFloor`, and two campfires rather than duplicated in save data. Route
  beacons appear about every 14 steps with no gap above 18, and every remaining
  corridor dead end contains a one-use supply. Every current floor has three
  two-way shortcuts and three guaranteed keys that consume no inventory slot.
  Opening requires both the key and the shortcut's course
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
  three later successful movement steps. Loose dropped items remain
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
- The production build keeps Phaser, `sql.js`, and the SQLite runtime in
  separate cacheable assets. `sqlite-runtime` must remain outside the
  application entry; the WASM file remains an external fetched asset and is
  not inlined. The bundled asm.js fallback is used only when WASM initialization
  is rejected by the host environment.
- The repository-root `.github/workflows/deploy-pages.yml` is opt-in through
  `PAGES_ENABLED=true` and must validate both projects and `game/dist` before
  deployment. If private-repository Pages is rejected by the provider/plan,
  keep the repository private and the variable false/unset, record
  `provider-blocked`, and do not buy, publish, or switch hosts without authority.
  Bundle/runtime optimization remains a separate post-1.0 change.
- Characters and UI effects remain generated from project code. The first two
  floor slices may also load the audited CC0 tile/prop packs declared in their
  runtime manifests; source archives, hashes, licenses, and transformed outputs
  must stay reproducible through the asset scripts. Music and sound effects are
  rendered from project-authored score/event code using public-domain musical
  material, not bundled commercial recordings. Do not add any third-party art,
  fonts, audio, or copied level text without a license review and attribution
  update.
- Browser runtime dependencies are pinned in `package.json` and
  `pnpm-lock.yaml`. Dependency changes remain approval-gated and require
  license, bundle, build, and browser checks proportional to risk.
- Never expose credentials, personal data, private endpoints, or sensitive local
  content in code, fixtures, logs, screenshots, manifests, or reports.

The repository's original code and prose use the parent MIT `LICENSE`. Retained
template material keeps its original notice, and third-party runtime notices and
reference sources remain recorded in the parent `ATTRIBUTIONS.md`.
