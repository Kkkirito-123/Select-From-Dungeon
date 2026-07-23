# SQL Demon Castle Eight-Floor Map and Art Direction

Status: **v1.0.0 freezes the eight-floor theme/topology contract, biome tiles
for all eight floors, and the reduced-motion/runtime budget**
Related curriculum: [Eight-floor curriculum blueprint](CURRICULUM.md)
Primary users: players, level designers, pixel artists, and frontend implementers

**English** | [简体中文](FLOOR_THEMES.zh-CN.md)

## 1. Goal

Give every floor its own map identity instead of reusing one maze with a
different background color. With the HUD hidden, players should still recognize
the floor from tiles, walls, macro topology, ambient elements, landmarks, and
the Boss-room silhouette.

Map variation must support learning:

- Floor 1 is warm, simple, and easy to navigate so beginners can focus on SQL.
- Middle floors gradually add structural complexity, with map shapes that echo
  the current concept.
- Floor 8 stops feeling like an ordinary random maze and becomes a ceremonial
  ascent to a black-and-gold throne.
- Visual variety must not create additional dead ends, empty backtracking, or
  continuous particle cost.

## 2. Global Map and Art Principles

### 2.1 Every floor changes five dimensions

1. **Element**: fire, lake/swamp life, undead ghost flame, fire/frost/storm,
   military iron, magma/dragon crystal, data life, and royal void.
2. **Material**: stone, wetland vegetation, graves and bones, lava and ice,
   riveted iron, volcanic dragon bone, roots and crystals, obsidian and gold.
3. **Macro topology**: looped keep, wetland forest, grave-city paths,
   elemental forge, partition rings, rollback factory, B+ tree branches, and
   throne ascent.
4. **Landmarks**: the entry, lessons, shortcuts, preview gate, and Boss arena use
   floor-specific silhouettes.
5. **Ambient motion**: each floor selects only one or two cheap discrete
   animations instead of stacking filters and endless particles.

A palette swap without structural change does not complete a floor theme.

### 2.2 Learning first

- Target 20–55 walkable tiles between required lesson landmarks.
- Rewardless dead ends are at most eight tiles; optional reward/story branches
  are at most twelve.
- Every macro learning zone has two exits or a return shortcut that opens after
  completion.
- The next major landmark should be discoverable within 30 seconds after battle;
  random encounters must not disguise empty pathfinding.
- Locked curriculum gates combine icon, material, and text instead of color
  alone.
- The minimap inherits floor material and topology while remaining a discovery
  map, never click-to-travel.
- Fire, magma, and lightning begin as visual language only. They do not deal
  passive damage or interrupt SQL input.

### 2.3 Element progression

```text
Living fire
  → wetland life
  → undead ghost flame
  → fire, frost, and storm
  → starlight and time
  → magma and cooling
  → root and data life
  → black-gold royal fire and the void core
```

Floor 1 fire provides safety and direction. Floor 6 turns fire into an
industrial furnace. Floor 8 transforms it into royal throne fire. The motif
persists without giving every floor the same meaning.

## 3. Eight-Floor Overview

| Floor | Map | Main element | Macro topology | Boss-room silhouette |
|---|---|---|---|---|
| 1 | Emberstone Keep | torches, embers, stone | broad corridors and short loops | semicircle brazier court |
| 2 | Aggregate Clocktower | brass, gears, steam | central shaft and converging spokes | circular clock core |
| 3 | Undead Grave City | bones, grave mire, ghost flame | grave-path loops | necromancer court |
| 4 | Elemental Forge | lava, frost, storm crystal | three elemental regions | elemental throne |
| 5 | Black-Iron Window Fortress | iron, banners, battlements | partitioned military loops | black-iron throne |
| 6 | Dragon Transaction Nest | magma, crystal, dragon bone | hatchery and savepoint caves | ancient dragon throne |
| 7 | Crystal Index Grove | roots, crystals, data flow | B+ tree branches | ancient root core |
| 8 | Obsidian Data Throne | obsidian, gold, royal flame | seven wings and a throne axis | stepped throne hall |

## 4. Floor Definitions

### Floor 1: Emberstone Keep

**Curriculum**: single-table queries.
**Experience**: safe, readable, and warm; movement and SQL receive attention.

| Dimension | Direction |
|---|---|
| Palette | charcoal, slate stone, warm orange, old gold, stable cyan SQL accent |
| Materials | large stone blocks, timber doors, iron bars, sparse moss, braziers |
| Topology | broad corridors, short loops, optional side rooms, no hidden doors |
| Ambient | two-frame torches, a few rising square embers, brazier value swaps |
| Landmarks | castle gate, Schema archive, filter corridor, null crypt, order tower |
| Shortcut | a stone return gate opens after the second required monster |
| Preview | a grouping emblem reveals Floor 2 brass light |

The Boss room is a semicircular court. Five braziers behind the Query Overseer
light one at a time as stages clear, then collapse into the automatic portal.

There is no dynamic lighting. Tile values and two-frame animation provide the
fire identity.

### Floor 2: Aggregate Clocktower

**Curriculum**: aggregation and grouping.
**Experience**: make many details visibly converge into fewer groups.

| Dimension | Direction |
|---|---|
| Palette | dark brown, brass, furnace red, steam white, gauge cyan |
| Materials | riveted plates, gear walls, pipes, gauges, furnace brick |
| Topology | four to six spoke corridors converge on the clock shaft |
| Ambient | four-frame slow gears, discrete steam blocks, stepped gauge needles |
| Landmarks | count engine, average tank, group deck, HAVING valve |
| Shortcut | each group lesson activates a bidirectional central lift |
| Preview | brass plates form a relation chain toward Floor 3 lightning |

The Boss room is a circular clock face. Group sectors light after reaching the
`HAVING` threshold. Steam is event-triggered and short-lived rather than a
continuous particle system.

### Floor 3: Undead Grave City

**Curriculum**: joins and set operations.
**Experience**: trace one undead population through rooms, masters, and gear.

| Dimension | Direction |
|---|---|
| Palette | bone gray, grave green, ghost violet, old gold, stable cyan SQL accent |
| Materials | bone piles, graves, mire, sarcophagus silhouettes, ghost lamps |
| Topology | the low-cost 64x48 loop maze split into bone yard, grave mire, and spirit crypt |
| Ambient | static bones/graves and low-frequency stepped ghost flames |
| Landmarks | Bone Bridge, Empty-Armor Passage, Echo Hall, Knight Tomb, Burial Hall, Necromancer Court |
| Shortcut | one guaranteed middle/rear key opens a permanent bidirectional route |
| Preview | fire, frost, and storm emblems point toward Floor 4 |

The three regions use separate tile palettes, static pixel features, and undead
encounter pools. A deeper red-brown Boss arena isolates the Necromancer. v0.8.0
deliberately reuses the validated loop topology for navigation and performance;
a stronger custom grave-city silhouette remains future art work.

### Floor 4: Elemental Forge

**Curriculum**: subqueries, `EXISTS`, and CTEs.
**Experience**: use three elemental regions for nested and recursive queries
without making navigation harder than the SQL.

| Dimension | Direction |
|---|---|
| Palette | lava orange, frost blue, storm violet, dark iron, rune gold |
| Materials | forge brick, ice sheets, crystal pillars, rune stone, elemental throne |
| Topology | the low-cost loop maze split into fire forge, frost vault, and storm core |
| Ambient | static lava, ice, and crystal with sparse stepped value changes |
| Landmarks | Fire Chamber, Frost Vault, Storm Pool, Stone Forge, Rune Ring, Elemental Throne |
| Shortcut | one guaranteed middle/rear key opens a permanent bidirectional route |
| Preview | elemental runes form a window-partition ring toward Floor 5 |

Each region has its own palette, elemental props, and encounter pool; the Boss
arena uses a purple-red throne palette for the Element King. v0.8.0 adds no
real-time lighting, heat distortion, reflections, blur, post-processing, or
larger map.

### Floor 5: Black-Iron Window Fortress

**Curriculum**: window functions.
**Experience**: express partitions, order, neighboring rows, and frames through
distinct military formations and fortress districts.

| Dimension | Direction |
|---|---|
| Palette | black-iron gray, cool cyan, banner red, old gold, paper white |
| Materials | riveted iron, old stone, banners, battlements, weapon racks |
| Topology | iron yard, barracks, and inner citadel form three looped partitions |
| Ambient | static crossed iron, banners, and battlements with one cheap beacon animation |
| Landmarks | OVER formation, ROW_NUMBER tower, RANK arena, cumulative wall |
| Shortcut | the middle/rear key opens a fixed two-way fortress gate |
| Preview | eggs and magma light appear behind the dragon gate |

The Boss room is a black-iron throne hall. Battlements and a gold crown
silhouette establish the floor ruler; SQL results remain the only proof.

### Floor 6: Dragon Transaction Nest

**Curriculum**: data changes and transactions.
**Experience**: show visible before, failed, rolled-back, and committed states.

| Dimension | Direction |
|---|---|
| Palette | volcanic black, magma orange, warning red, crystal cyan, bone gold |
| Materials | volcanic rock, dragon eggs, magma pools, crystal, ancient bones |
| Topology | magma hatchery, crystal cavern, and dragon throne form three loops |
| Ambient | static eggs, magma, crystals, and bones; no continuous particles |
| Landmarks | INSERT hatchery, UPDATE scale forge, DELETE nest, SAVEPOINT throne |
| Shortcut | the middle/rear key opens a fixed two-way bone gate |
| Preview | green index roots grow through the furnace wall toward Floor 7 |

The Boss arena uses ancient dragon bones and a crown silhouette. Each script is
graded in a temporary SQLite copy, and the result table shows final-state
differences without mutating the permanent world.

Lava is tile animation without heat distortion. It deals no passive damage in
the initial implementation.

### Floor 7: Crystal Index Grove

**Curriculum**: indexes and query plans.
**Experience**: make B+ tree nodes and access paths explorable without hiding
orientation.

| Dimension | Direction |
|---|---|
| Palette | ink green, teal, crystal cyan, ivory, index gold |
| Materials | giant roots, stone tablets, data crystals, leaf platforms, lit paths |
| Topology | root to internal nodes to leaves, with horizontal leaf links |
| Ambient | crystal pulses, short data-leaf falls, stepped root light |
| Landmarks | composite fork, covering canopy, invalidation marsh, plan tablet |
| Shortcut | a valid index lights a shorter path while the base route stays reachable |
| Preview | roots surround the black-gold gate to Floor 8 |

A worse index choice never forces excessive real walking. Path length is visual
feedback; stable plan evidence remains the curriculum evaluator.

The Boss room is the root chamber of an ancient tree. Plan nodes light along the
roots, while scans and temporary sorts use visible non-flashing warning tiles.

### Floor 8: Obsidian Data Throne

**Curriculum**: database interview finale.
**Experience**: change from ordinary exploration to a ceremonial entry through
seven wings and up to a throne.

| Dimension | Direction |
|---|---|
| Palette | obsidian, dark crimson, royal violet, old gold, cyan-white core |
| Materials | long obsidian bricks, gold pillars, red banners, royal braziers |
| Topology | one fixed central axis connects seven knowledge wings |
| Ambient | two-frame royal flames, stepped banners, distant storm light, core pulse |
| Landmarks | MVCC archive, lock court, isolation chamber, model hall, replica towers, shard gate, security walk |
| Shortcut | each cleared wing opens a gold arch back to the central axis |
| Finale gate | all seven floor emblems unlock the throne hall along its centerline |

Floor 8 is not a fully random maze. The central axis, seven wings, and throne
remain fixed. The Seed varies side rooms, decoration, optional rewards, and
review encounters without compromising the final direction.

The Boss room has three compositions:

1. **Long stair**: display the prior seven floor emblems.
2. **Judgment deck**: run query, plan, and concurrency-timeline stages.
3. **Black-gold throne**: overlap the Database Demon King with the cyan-white
   core; the throne splits after the final verified remediation.

Tile replacement, a short camera shake, and a few pooled rectangles create the
final animation. There is no video or full-screen shader.

## 5. Floor Transitions

Claiming the Boss reward automatically opens the portal. The player does not
search for another exit or open a menu.

The shared one-to-two-second rhythm is:

1. the current element converges on the portal;
2. the next palette and landmark silhouette appear;
3. player build and learning profile persist;
4. the new entrance states its floor, learning goal, and syntax scope;
5. controls return with a short safe window.

| Transition | Visual |
|---|---|
| 1 → 2 | embers assemble into a brass gear |
| 2 → 3 | the gear discharges into a relation bridge |
| 3 → 4 | lightning shatters into mirror pieces |
| 4 → 5 | mirror pieces align into an astral window |
| 5 → 6 | the orbit falls into a furnace and lights a savepoint |
| 6 → 7 | cooled slag grows green roots |
| 7 → 8 | the roots push open the black-gold gate |

## 6. Floor Theme Data Contract

Implementation should be data-driven, not eight copied `DungeonScene` classes:

```text
FloorTheme
  id
  name
  learningTheme
  worldElement
  palette
  materialSet
  topologyStrategy
  tileSet
  decorRules
  landmarkRules
  gateStyle
  bossArena
  portalStyle
  minimapStyle
  musicProfile
  performanceBudget
```

Proposed topology strategies:

```text
floor-1: looped_keep
floor-2: aggregate_hub
floor-3: relational_islands
floor-4: nested_chambers
floor-5: partition_rings
floor-6: rollback_factory
floor-7: btree_branches
floor-8: throne_ascent
```

Every strategy retains deterministic Seeds, required reachability, unskippable
curriculum gates, guaranteed critical rewards, and discovery fog.

## 7. FC-style Performance Budget

Theme variation comes from tiny assets and rules, not GPU effects.

| Area | Budget |
|---|---|
| Base tiles | retain the 16×16 integer pixel grid |
| Palette | 8–12 main colors per floor; SQL, danger, and reward semantics stay stable |
| Terrain | one static tile layer or batched Graphics, no Tween per wall |
| Animated environment | at most 16 animated decorations in the viewport |
| Ambient fragments | at most 24 pooled rectangles on screen; short-lived |
| Fire and lava | two or three tile frames, no dynamic light or heat distortion |
| Mirrors and stars | alternate tiles and a shared beat, no reflection or screen filter |
| Weather | sparse lines or a background layer; fully paused when hidden |
| Assets | reuse geometry and small atlases; no high-resolution video backgrounds |
| Updates | terrain has no frame logic; update only visible actors and small effects |

Success needs evidence rather than a claim of “zero cost”:

- target 60 FPS on desktop and stable 30 FPS on lower-end phones;
- no obvious long frame during ten seconds of continuous movement;
- map, weather, and music stop advancing while the page is hidden;
- Reduced Motion disables decorative Tweens, fragments, and shake while
  preserving landmarks and state;
- a new floor does not force all eight floor-specific large assets into the
  initial bundle;
- if performance misses budget, remove ambient decoration before weakening SQL
  feedback or legibility.

## 8. Accessibility

- Floor identity uses material, silhouette, and topology instead of color alone.
- Gates combine icon, text, and material; red/green is never the only signal.
- Flame, lightning, and stars avoid rapid flashes; important cues stay below
  three light changes per second.
- SQL text, HP, hints, and actions keep a stable layout across themes.
- Reduced Motion, mute, and narrow screens preserve a static floor identity.
- Boss visuals never cover the terminal, completion fields, or query results.

## 9. Acceptance Criteria

### Map and learning

- An entrance screenshot without HUD is enough to distinguish all eight floors.
- Each floor differs in at least four of element, material, topology, landmark,
  and Boss shape.
- Floor 1 visibly contains a torch or brazier; Floor 8 clearly contains the
  black-gold axis and throne.
- Required distances, dead-end length, and return shortcuts meet the global
  budgets.
- Environmental danger does not deal passive damage in the first implementation.
- Metaphors supplement complete terminal fields and objectives.

### Automated

- Every topology strategy is deterministic for a fixed Seed.
- At least 500 Seeds pass required reachability, gate, Boss path, and dead-end
  bounds.
- Floor 8 keeps the central axis and throne fixed while varying allowed side
  content.
- Theme changes preserve `lessonId`, mastery, and deterministic rewards.
- Reduced Motion and page-hidden states stop decorative updates.

### Browser

- Desktop and 390×844 each verify the entry, a required zone, Boss room, and
  portal.
- Exercise continuous movement, ambient motion, battle transition, and return.
- Record ten-second frame timing and active-object count.
- Verify fire, lightning, mirrors, stars, magma, forest, and throne without
  console errors.
- A successful build does not replace visual, navigation, and performance QA.

## 10. Staged Delivery

1. **Theme contract PR**: define `FloorTheme` and topology IDs without changing
   the current map.
2. **Shared tile and budget PR**: establish palette, viewport animation, and
   Reduced Motion baselines.
3. **Floor 1 PR**: implement Emberstone Keep and measure it first.
4. **Floor 2 and 3 PRs**: Aggregate Clocktower and Relational Bridgeworks remain
   separate changes.
5. **Floor 4 and 5 PRs**: nested catacombs, then partition rings.
6. **Floor 6 and 7 PRs**: rollback factory, then B+ tree grove.
7. **Floor 8 throne PR**: independently implement the fixed axis, seven wings,
   and throne arena.

Every floor PR includes map screenshots, Seed reachability tests, narrow-screen
checks, a performance record, and a rollback path.

## 11. Non-goals and Risks

### Non-goals

- This document does not implement tiles, generators, animation, art, music, or
  floors.
- Do not copy another game's maps, art, Boss rooms, or audio.
- Do not use video backgrounds, dynamic lighting, real-time reflection, or
  full-screen shaders.
- Visual puzzles do not replace SQL, and map hazards never attack during input.

### Risks and trade-offs

| Risk | Trade-off |
|---|---|
| Eight custom themes increase bundle size | share 16×16 geometry and lazy-load small floor atlases |
| Different topology increases generator complexity | share reachability and gate validation, vary only macro strategy |
| Map metaphor becomes a puzzle burden | terminal keeps explicit objectives, full fields, and relations |
| Fire and weather consume performance | use small tile frames and pooled blocks; pause offscreen and hidden |
| Final-floor randomness weakens the throne | fix the central axis and throne; vary side-wing detail only |
| Theme reduces readability | keep HUD and SQL semantic colors stable; theme the world layer only |
