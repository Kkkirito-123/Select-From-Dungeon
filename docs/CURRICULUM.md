# SQL Demon Castle Eight-Floor Curriculum Blueprint

Status: **v0.8.0 implements the eight-floor data contract and playable content
for floors one through four; floors five through eight remain planned**
Target: staged expansion after the current four-floor MVP
Primary users: SQL beginners, interview reviewers, level designers, and content maintainers

**English** | [简体中文](CURRICULUM.zh-CN.md)

[Floor map and art direction](FLOOR_THEMES.md) |
[中文地图蓝图](FLOOR_THEMES.zh-CN.md)

## 1. Goal

Evolve SQL Demon Castle from a sequence of increasingly difficult questions
into a learning game where every floor owns one coherent knowledge cluster.
Players should always know:

- what the current floor teaches;
- why a challenge belongs on that floor;
- whether they cleared it with hints or can solve an unseen variant;
- which abilities unlock the next floor;
- which encounters execute real SQL and which diagnose plans, transactions, or
  database internals.

The complete route covers practical SQL, data changes, transactions, indexes,
query plans, and common database interview topics. It does not claim to cover
every SQL dialect, DBA command, or production incident skill.

## 2. Users and Success Criteria

| User | Need | Success criterion |
|---|---|---|
| SQL beginner | Needs a clear starting order | Each floor introduces one cluster, and its Boss uses no unseen syntax |
| Interview reviewer | Has fragmented knowledge | Can target a weak floor and practice changed variants |
| Blog visitor | Wants a short playable session | A normal monster ends in one or two meaningful query stages |
| Content designer | Needs repeatable question quality | Every lesson follows one data, hint, evaluation, and acceptance contract |
| Maintainer | Must add floors without breaking progress | Each floor can be implemented, tested, released, and migrated separately |

## 3. Curriculum Principles

1. **Knowledge before stats**: difficulty comes from combining concepts, not
   merely adding HP or repeating the same answer.
2. **Single table, then aggregation, then relations**: grouping and joins do not
   precede reliable filtering.
3. **Complete input without rote copying**: the player writes
   `SELECT ... FROM ...`; completion provides keywords, tables, and full field
   names, never the complete answer.
4. **Evaluate semantics and the lesson concept**: correct rows are necessary,
   but the required knowledge feature must also be present.
5. **Allow equivalent answers**: aliases and valid equivalent expressions are
   accepted instead of matching one exact string.
6. **Keep questions inside the game world**: use monsters, rooms, gear, signals,
   chests, and castle incidents rather than unrelated employee or student data.
7. **Expose the full schema**: the terminal, Schema Codex, and completion menu
   show full table names, fields, types, and relationships.
8. **Use short visible IDs**: new floor fixtures start at visible ID `1`; IDs
   such as `101` or `1400` add typing noise without teaching SQL.
9. **Bosses integrate only taught knowledge**: a Boss may combine the current
   and previous floors, but cannot surprise the player with next-floor syntax.
10. **Optional breach gates are previews**: clearing one does not grant formal
    mastery or bypass curriculum dependencies.

## 4. Eight-Floor Overview

| Floor | Theme | Required abilities | Primary battle | Boss acceptance |
|---|---|---|---|---|
| 1 | Emberstone Keep | Single-table projection, filters, nulls, ordering, and limits | Query | One complete single-table query |
| 2 | Aggregate Clocktower | Aggregate functions, grouping, group filters, and conditional aggregation | Query | Produce a grouped ranking |
| 3 | Undead Grave City | Inner, left, self, multi-table joins, and set operations | Query | Audit grave-city relations and gear |
| 4 | Elemental Forge | Scalar, `IN`, `EXISTS`, correlated subqueries, CTEs, and recursive CTEs | Query | Recursively trace the elemental chain |
| 5 | Window Observatory | Partitions, ranks, neighboring rows, and rolling windows | Query | Per-group Top-N and trend analysis |
| 6 | Rollback Foundry | Data changes, constraints, transactions, savepoints, and ACID | Disposable sandbox | Repair data and roll back safely |
| 7 | Crystal Index Grove | B+ trees, composite and covering indexes, invalidation, and plans | Query + plan | Reduce the cost of a composite query |
| 8 | Obsidian Data Throne | MVCC, locks, anomalies, modeling, replication, sharding, and safety | Incident diagnosis | Multi-stage database interview finale |

Each floor should contain five or six required monsters, one optional elite, one
Boss, and random encounters that review older knowledge. Target duration is
20–35 minutes, with a faster path for players who answer independently.

## 5. Floor Definitions

### Floor 1: Emberstone Keep

**Goal**: independently write a reliable single-table query.
**Prerequisite**: none.
**Runtime boundary**: real read-only SQLite.

| Node | Monster | Concept | Clear evidence |
|---|---|---|---|
| 1-1 | Slime | `SELECT`, `FROM`, `AS` | Return the complete requested fields |
| 1-2 | Bat | `WHERE` and comparisons | Locate a target through field predicates |
| 1-3 | Hound | `AND`, `OR`, `NOT`, parentheses | Express combined logic without hard-coded rows |
| 1-4 | Mimic | `IN`, `BETWEEN`, `LIKE` | Filter by sets, ranges, and patterns |
| 1-5 | Ghost | `IS NULL`, `IS NOT NULL` | Never use `= NULL` |
| 1-6 | Order Guard | `DISTINCT`, `ORDER BY`, `LIMIT/OFFSET` | Deduplicate, sort stably, and slice rows |

**Boss — Query Overseer**

- project requested fields from one table;
- use at least two filters;
- handle nulls or a pattern correctly;
- use an explicit stable tie-breaker;
- return only the requested rows;
- use no aggregation, joins, or subqueries.

**Guaranteed reward**: Filter Bow and the complete Schema Codex.
**Preview breach**: use `COUNT` and `GROUP BY` to break five aggregate locks.

### Floor 2: Aggregate Clocktower

**Goal**: turn detail rows into trustworthy statistics.
**Prerequisite**: independent Floor 1 clear, especially filtering and ordering.
**Runtime boundary**: real read-only SQLite.

| Node | Monster | Concept | Clear evidence |
|---|---|---|---|
| 2-1 | Count Slime | `COUNT(*)`, `COUNT(column)` | Explain how nulls affect counts |
| 2-2 | Statistic Golem | `SUM`, `AVG`, `MIN`, `MAX` | Choose an aggregate that matches the task |
| 2-3 | Group Priest | `GROUP BY` | Preserve valid grouping semantics |
| 2-4 | Gate Guard | `WHERE` versus `HAVING` | Separate pre-group and post-group filters |
| 2-5 | Case Witch | `CASE WHEN` | Build conditional values or aggregates |
| 2-6 | Ranking Officer | aggregation + order + limit | Produce a deterministic statistical ranking |

**Boss — Clocktower Core**

- filter valid signals before grouping;
- group by channel or sector;
- return count, total, and average together;
- retain only groups above a threshold;
- sort by an aggregate plus a stable tie-breaker and take the top N.

**Guaranteed reward**: Aggregate Hammer and Condition Rune.
**Preview breach**: join monsters to rooms through five relationship locks.

### Floor 3: Undead Grave City

**Goal**: join data through real relationships and detect missing right-side
records.
**Prerequisite**: Floor 2 grouping.
**Runtime boundary**: real read-only SQLite; unsupported dialect forms use an
equivalent query or an explicitly labeled concept demonstration.

| Node | Monster | Concept | Clear evidence |
|---|---|---|---|
| 3-1 | Skeleton | `INNER JOIN ... ON` | Use real keys; reject `ON 1=1` |
| 3-2 | Zombie | `LEFT JOIN` + `IS NULL` | Find left rows without a right match |
| 3-3 | Ghost | self join | Use clear aliases for two roles |
| 3-4 | Armored Skeleton | three-table join | Traverse rooms, monsters, and gear |
| 3-5 | Bone Knight | `UNION` | Align columns and merge grave-route rosters |
| 3-6 | Necromancer | joins + aggregation | Complete relation counts and strongest-gear audit |

**Boss — Necromancer**

- join rooms and monsters, then count records by grave-city sector;
- retain qualifying sectors with `GROUP BY` and `HAVING`;
- join monsters to gear, sort by power, and take the strongest core;
- avoid distorted results from false relations or one-to-many expansion.

**Guaranteed reward**: Bone Blade.
**Preview breach**: use `EXISTS` to find monsters with qualifying gear.

### Floor 4: Elemental Forge

**Goal**: express a query whose answer depends on another query.
**Prerequisite**: Floor 3 joins and aggregation.
**Runtime boundary**: real read-only SQLite.

| Node | Monster | Concept | Clear evidence |
|---|---|---|---|
| 4-1 | Fire Spirit | scalar subquery | Return exactly one comparable value |
| 4-2 | Ice Spirit | `IN` subquery | Filter monsters through a room set |
| 4-3 | Thunder Spirit | `EXISTS` | Test for related gear without returning it |
| 4-4 | Stone Golem | correlated subquery | Reference the current outer monster |
| 4-5 | Flame Lord | `WITH` CTE | Name the high-power gear stage |
| 4-6 | Element King | recursive CTE | Generate rooms and trace a master hierarchy |

**Boss — Element King**

- generate consecutive room IDs with a recursive CTE and join real rooms;
- state the anchor, `UNION ALL` recursive member, and termination condition;
- start at the Fire Spirit and follow `master_id` to the Element King;
- return names and depths in stable order.

**Guaranteed reward**: Rune Staff.
**Preview breach**: use `ROW_NUMBER() OVER (...)` for the top monster in each
sector.

### Floor 5: Window Observatory

**Goal**: rank, compare, and accumulate without collapsing detail rows.
**Prerequisite**: Floor 4 CTEs and aggregation.
**Runtime boundary**: real read-only SQLite window queries.

| Node | Monster | Concept | Clear evidence |
|---|---|---|---|
| 5-1 | Partition Ghost | `OVER`, `PARTITION BY` | Explain row-count differences from `GROUP BY` |
| 5-2 | Number Guard | `ROW_NUMBER` | Produce a deterministic unique order |
| 5-3 | Rank Twins | `RANK`, `DENSE_RANK` | Handle ties and rank gaps |
| 5-4 | Neighbor Hound | `LAG`, `LEAD` | Compare neighboring events |
| 5-5 | Rolling Golem | running and moving windows | Define ordering and the frame |
| 5-6 | Top-N Officer | CTE + window filter | Return the top N rows per group |

**Boss — Temporal Observer**

- rank monsters inside every sector;
- retain the top two in each group;
- show the gap from the previous rank;
- calculate cumulative regional threat;
- remain correct when values are tied.

**Guaranteed reward**: Window Compass and Temporal Cloak.
**Preview breach**: complete five writes in a disposable copy, then restore the
original state with `ROLLBACK`.

### Floor 6: Rollback Foundry

**Goal**: modify data safely and understand transaction boundaries and recovery.
**Prerequisite**: Floors 1–5 query skills.
**Runtime boundary**: every battle uses a disposable database copy. Exit,
failure, and reload must never mutate permanent curriculum data.

| Node | Monster | Concept | Clear evidence |
|---|---|---|---|
| 6-1 | Insert Smith | `INSERT` | Name columns and satisfy data constraints |
| 6-2 | Repair Guard | `UPDATE ... WHERE` | Preview scope; reject accidental full-table updates |
| 6-3 | Cleanup Slime | `DELETE ... WHERE` | Verify the deletion set with an equivalent `SELECT` |
| 6-4 | Constraint Golem | primary, unique, null, check, and reference constraints | Diagnose a failed write |
| 6-5 | Rollback Knight | `BEGIN`, `COMMIT`, `ROLLBACK` | Distinguish success and failure paths |
| 6-6 | Savepoint Mage | `SAVEPOINT`, `ROLLBACK TO` | Undo only a local transaction error |

**Boss — Transaction Furnace**

- insert a repair record in one isolated transaction;
- update an exact target and delete a duplicate;
- encounter a deliberate constraint failure;
- roll back to a savepoint and continue;
- verify both committed sandbox state and untouched permanent data;
- explain ACID through the scenario rather than only recalling the acronym.

**Guaranteed reward**: Rollback Shield and Constraint Armor.
**Preview breach**: read query plans and select five effective index options.

### Floor 7: Crystal Index Grove

**Goal**: choose indexes from query patterns and verify decisions through query
plans instead of memorizing “add an index.”
**Prerequisite**: joins, subqueries, and transaction basics.
**Runtime boundary**: resettable performance fixtures; stable teaching metrics
replace device wall-clock time as the primary score.

| Node | Monster | Concept | Clear evidence |
|---|---|---|---|
| 7-1 | B+ Tree Guard | B+ tree access | Explain equality, range, and ordered access |
| 7-2 | Composite Beast | composite index and left prefix | Choose column order from filters and sorting |
| 7-3 | Covering Ghost | covering index and table lookup | Identify whether all required columns are covered |
| 7-4 | Invalidation Witch | functions, conversions, leading wildcards, low selectivity | Explain ineffective index use |
| 7-5 | Plan Scout | `EXPLAIN QUERY PLAN` | Distinguish scans, searches, temp sorts, and join order |
| 7-6 | Optimization Officer | rewrite and index trade-offs | Balance read benefit and write amplification |

**Boss — Ancient Index Tree**

- record the baseline plan for a filter, join, order, and limit query;
- select or design a composite index;
- rewrite the query when appropriate;
- prove improvement through stable scan, temporary structure, and access-path
  evidence;
- explain why more indexes are not always better.

**Guaranteed reward**: Index Eye and Plan Lens.
**Preview breach**: diagnose an incident involving MVCC, lock waits, and retry.

### Floor 8: Obsidian Data Throne

**Goal**: connect SQL skill to common database interview topics and incident
reasoning.
**Prerequisite**: independent clears of Floors 1–7.
**Runtime boundary**: queries execute normally; MVCC, replication, and sharding
use deterministic timelines, plan diagrams, or incident records instead of
pretending local SQLite proves production behavior.

| Node | Monster | Concept | Clear evidence |
|---|---|---|---|
| 8-1 | Version Ghost | MVCC, snapshots, visibility | Determine visible versions on a timeline |
| 8-2 | Chain Knight | row locks, gap concept, deadlock, waits | Find a wait cycle and safe recovery order |
| 8-3 | Isolation Lich | dirty, non-repeatable, and phantom reads | Identify anomalies from evidence |
| 8-4 | Model Golem | normalization, keys, uniqueness, denormalization | Design for an explicit workload |
| 8-5 | Replication Twins | replica lag, consistency, availability | Diagnose read-after-write and failover trade-offs |
| 8-6 | Sharding Beast | partitioning, sharding, routing, cross-shard work | Identify when not to shard and key risks |
| 8-7 | Injection Assassin | parameters, least privilege, input boundaries | Reject concatenation and unauthorized queries |

**Final Boss — Database Demon King**

1. write a query combining joins, aggregation, and a window function;
2. identify its main plan problem;
3. select an index and explain write cost;
4. reason about visibility, waits, and isolation anomalies on a concurrency
   timeline;
5. propose a safe, reversible, and verifiable remediation order.

Stages may be saved independently. Clearing the finale represents completion of
the high-frequency SQL and database interview route, not production DBA
experience.

**Guaranteed reward**: Data Crown, complete Codex, and variant challenge mode.

## 6. Combat, Hints, and Mastery

### 6.1 Battle Length

| Encounter | Stages | Rule |
|---|---:|---|
| Required monster | 1–2 | Recognize the concept, then solve a variant |
| Elite | 2–3 | Combine two already taught concepts |
| Floor Boss | 3–5 | Integrate the floor without repeating one query |
| Random encounter | 1 | Review prior material; introduce no new syntax |
| Preview breach guardian | 5 | Explicit next-floor danger; failure is lethal, victory grants no formal mastery |

A breach requires a second risk confirmation. Its five locks must represent
five different steps, never five repetitions of one correct query.

### 6.2 Progressive Hints

| Level | Provide | Withhold |
|---|---|---|
| 0 | Objective, monster name, short ID, and complete schema | No solution guidance |
| 1 | A concept cue, such as “null is not compared with equals” | No table/field combination |
| 2 | Required tables, full fields, and relationship | No clause order |
| 3 | A skeleton such as `SELECT ___ FROM ___ WHERE ___` | No key expression |
| 4 | Specific diagnosis and a near-complete structure | Never auto-execute or award victory |

Hints accumulate from small to large. Using hints affects mastery grading but
does not remove permanent learning progress.

### 6.3 Mastery States

```text
Unseen
  → Introduced
  → Cleared with hints
  → Cleared independently
  → Variant mastered
```

- **Unlock the next floor**: every required concept is at least cleared with
  hints, and the Boss is defeated.
- **Independent clear**: complete the formal lesson without level 3–4 hints.
- **Variant mastered**: clear two changed-data review tasks consecutively
  without hints.
- **Floor mastery**: all required concepts reach variant mastery; this is an
  achievement, not a main-path gate.

Random encounters prioritize recent failures, high-hint clears, and material
not reviewed recently. Variants change data and objectives, not only names.

## 7. Lesson and Evaluation Contract

Every lesson defines at least:

```text
floorId
lessonId
prerequisites
conceptsIntroduced
battleType
schemaSnapshot
visibleTablesAndFields
gameObjective
stages
expectedResultSemantics
requiredQueryFeatures
forbiddenQueryFeatures
hintsFromSmallToLarge
reviewVariants
deterministicReward
bossContribution
```

Implementations must ensure:

- the monster name and current target are visible before battle;
- objective IDs match data IDs and prefer short floor-local IDs from `1`;
- completion exposes full field names rather than truncated inaccessible text;
- canonical answers exist only for tests; runtime uses semantic and feature
  evaluation;
- at least one differently written equivalent solution is tested;
- feedback distinguishes syntax, schema, result, missing concept, and unsafe
  statement failures;
- normal lessons never require repeating meaningless SQL to drain HP;
- every required curriculum reward stays deterministic inside a loot bundle,
  while ambushes may add only optional low-probability loot;
- data changes occur only in a disposable sandbox, and plan/transaction tests
  never mutate permanent progress.

## 8. Current Four Floors and the Long-Term Blueprint

The current playable MVP retains the original first two floors and adds two
more in v0.8.0:

- Floor 1: `SELECT`, `WHERE`, `IS NULL`, `GROUP BY`, `HAVING`
- Floor 2: `ORDER BY`, `DISTINCT`, `INNER JOIN`, `LEFT JOIN`, composite `JOIN`
- Floor 3: inner/left/self/three-table joins, `UNION`, and relation audit
- Floor 4: scalar, `IN`, `EXISTS`, correlated subqueries, CTE, and recursive CTE

It remains playable, but its order is not the long-term curriculum. Reuse its
monsters, fixtures, and evaluators instead of rewriting everything at once:

| New floor | Reuse | Add |
|---|---|---|
| New Floor 1 | current `SELECT`, `WHERE`, `IS NULL`; current Floor 2 `ORDER BY`, `DISTINCT` | `OR/NOT`, `IN/BETWEEN/LIKE`, single-table Boss |
| New Floor 2 | current `GROUP BY`, `HAVING`, Aggregate Hammer | `SUM/AVG/MIN/MAX`, `CASE WHEN`, aggregate Boss |
| New Floor 3 | current `INNER JOIN`, `LEFT JOIN`, JOIN Boss | self join, cardinality, `UNION/UNION ALL` |
| New Floor 4 | current subquery, CTE, and recursive CTE lessons | `NOT IN` null boundaries and more equivalent variants |

Permanent progress migrates by stable `lessonId`, not former physical floor
number. Old in-progress Runs start a clearly announced new Run instead of
attempting to translate coordinates across curriculum maps.

## 9. Staged Delivery

Each item is a separate pull request:

1. **Curriculum blueprint PR**: this document, its Chinese mirror, and README
   links only.
2. **Curriculum data contract PR**: lesson schema, mastery states, and content
   validator without map changes.
3. **Floor 1 reorder PR**: the full single-table cluster and Boss.
4. **Floor 2 aggregate PR**: migrate grouping and add aggregate/conditional
   lessons.
5. **Floor 3 relations PR**: migrate joins and add self/set/cardinality lessons.
6. **Floor 4 and 5 PRs**: one independent PR for subquery/CTE, then windows.
7. **Sandbox engine PR** before implementing Floor 6.
8. **Plan scoring PR** before implementing Floor 7.
9. **Incident simulator PR** before implementing Floor 8.

Before coding a floor, list its complete question table, schema changes, save
migration, and browser acceptance route.

## 10. Non-goals

- This blueprint PR does not implement floors, monsters, maps, art, or audio.
- It does not change the current evaluator, SQLite safety boundary, save shape,
  XP, or combat balance.
- It does not collapse MySQL, PostgreSQL, and SQLite into one universal syntax.
- It does not replace writing SQL with multiple choice; diagnosis is reserved
  for behavior local SQLite cannot prove.
- It does not promise production database design, tuning, or incident expertise
  after game completion.

## 11. Acceptance Criteria and Risks

### Acceptance criteria

- All eight floors define prerequisites, required nodes, Boss, rewards, and a
  next-floor preview.
- Floors 1–5 contain no reversed syntax dependency.
- Floor 6 explicitly uses a disposable write sandbox.
- Floor 7 scoring does not depend on one device's absolute timings.
- Floor 8 uses deterministic evidence rather than simulated claims about SQLite
  concurrency.
- Hints grow from concepts to structure and never auto-fill the answer.
- Mastery distinguishes hinted clears from independent changed-data solutions.
- The current four floors have an incremental, reversible migration path.
- Every implementation stage can be reviewed and accepted in isolation.

### Risks and trade-offs

| Risk | Trade-off |
|---|---|
| Eight floors are a large content commitment | Deliver by floor; reorder the first three before expanding |
| SQL dialects differ | Execute against project SQLite and label interview-specific dialects |
| Writes could corrupt saves | Require a disposable database and reset verification first |
| Performance depends on hardware | Grade plan structure and stable counts, not only milliseconds |
| Theory may feel like rote study | Use timelines, incident logs, and lock graphs |
| Hints encourage copying | Lower mastery grade and vary both data and objectives |
| Curriculum migration may break progress | Migrate by stable `lessonId`; restart only the current Run |
