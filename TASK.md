# Current Task

This file is the current L1/L2 task control surface. It stays `IDLE` when no
approved repository change is active. Do not use it as a log: keep only the
latest approved contract and latest recovery checkpoint.

```text
TASK_ID: gui-agent-tool-convergence
STATUS: COMPLETE
CONTRACT_REF: TASK.md
CONTRACT_REVISION: 1
APPROVED_REVISION: 1
APPROVAL: confirmed
ARCHITECTURE_REF: game/ARCHITECTURE.md
EXTERNAL_REF: game/ARCHITECTURE.md
```

## Contract

### Goal

Replace the model-facing VLM-style navigation loop with a bounded textual GUI
agent contract and reduce Dungeon Maintainer from twelve model-visible tools to
eight. The new contract must acquire prerequisite items without coordinates,
stop at real interaction boundaries, detect repeated no-progress actions, and
keep every source write inside the existing detached-worktree safety boundary.

### Users and stakeholders

- Maintainer users who need the coding agent to reproduce and repair gameplay
  failures without entering an infinite navigation loop.
- Maintainer and game engineers who own the tool, replay, browser bridge, and
  write-security contracts.
- Players, whose game rules, saves, answers, inventory, and visible interaction
  behavior must not be exposed or changed by this development-only bridge.

### MVP

1. Expose exactly eight model tools: `inspect`, `edit`, `check`, `finish`,
   `workspace`, `look`, `act`, and `query`. Keep `/play`, `/diff`, `/verify`,
   `/apply`, and `/discard` unchanged.
2. Merge evidence list/get into `inspect`; merge precise patch and full-file
   creation/write into the maintainer-owned `edit`; merge worktree operations
   into `workspace`; merge movement and visible interaction into `act`; and
   make `query` write the visible textarea then click the real submit control in
   one call. Load no Pi native write tool.
3. Make every `look`/action result carry a revision, current target,
   prerequisite descriptions, and executable action IDs. `act` accepts only an
   action from the latest matching revision, performs at most 64 real movement
   steps, and stops whenever an `E` interaction becomes available.
4. Resolve unclaimed room rewards, the required aggregate-hammer room, and
   uncollected guaranteed shortcut keys before a blocked downstream objective.
   Two consecutive no-progress attempts for the same revision and action must
   return `stalled` instead of continuing the model loop.
5. Preserve semantic replay using internal movement, interaction, SQL-input,
   and submit trace primitives even though the model-facing tools are merged.

### Non-goals

- No screenshot/VLM input, arbitrary mouse coordinates, selectors, JavaScript,
  shell tool, multi-agent runtime, or second autonomous model loop.
- No gameplay, curriculum, map generation, inventory, save-schema, SQL judging,
  hidden-judge, or production bridge changes.
- No changes to the five user commands, automatic apply/commit/push, or formal
  repository publication.
- No weakening of path, approval, privacy, replay, or patch-budget boundaries.

### Expected scope

- `dungeon-maintainer/src/pi/**`, `src/game/**`, and the existing workspace
  write implementation needed to own the eight tools.
- Focused maintainer tests for registration, editing safety, replay, stale
  revisions, stalled actions, and merged query behavior.
- `game/src/devtools/dungeon-agent/**` and focused bridge tests for the v4
  textual GUI-agent contract and prerequisite navigation.
- Maintainer and game Architecture/README documentation only where verified
  public tool, protocol, ownership, or user-facing facts change.

### Acceptance criteria

- AC-1: The model receives exactly the eight named tools and no Pi native
  `write`; the five user commands remain registered and behave as before.
- AC-2: `inspect` supports source inspection and evidence list/get. `edit`
  supports unique replacement, new-file creation, and complete text writes,
  always requiring a current `baseHash`, exact approved paths, realpath checks,
  detached worktree isolation, write budgets, refresh/replay, and post-write
  evidence.
- AC-3: Protocol 1.0 views include a revision, target, prerequisites, and stable
  action IDs without coordinates, complete maps, inventory, saves, hidden
  answers, or judge data. Stale or unavailable actions do not execute.
- AC-4: Navigation selects a claimable reward, required aggregate-hammer room,
  or uncollected guaranteed shortcut key when it blocks the next objective.
  Movement stops at an `E` interaction and never auto-crosses it.
- AC-5: `act` is capped at 64 real steps. The second consecutive no-progress
  call for the same state/action returns `stalled` with the latest view.
- AC-6: `query` first writes the supplied SQL into the currently visible fixed
  player textarea and then clicks its real submit control. SQL text remains
  process-local for replay and is absent from persistent events and traces.
- AC-7: Refresh replay preserves the merged action/query behavior and reports
  stale, rejected, unavailable, or stalled outcomes rather than treating a
  banner-only change as success.
- AC-8: Focused tests, full tests, TypeScript, lint, architecture checks,
  production builds, `git diff --check`, and the production bridge-symbol check
  pass in both repositories as applicable, with unrelated user edits preserved.

### Public interface, compatibility, rollout, and recovery

- The development-only browser bridge uses protocol 1.0 and atomically exposes
  `look/act/query`; the maintainer client and game bridge are delivered together.
  No compatibility adapter is retained because mismatched versions fail closed at startup.
- Internal replay records keep their existing low-level semantic action names;
  no persisted task or save migration is required.
- Rollout is local through the feature branch. Recovery is to stop the local
  maintainer runtime and revert this branch; formal repositories and player
  saves remain untouched until a separately authorized `/apply` or Git action.

### Risks and trade-offs

- A revision fingerprint that omits action-relevant visible state could accept
  stale intent; tests must cover state and action changes.
- Prerequisite selection must not expose coordinates or bypass lesson/guardian
  gates. Navigation still walks only discovered/currently walkable cells.
- Full-file writes increase blast radius, so the existing three-file/120-line
  task budget, hash binding, exact scope, privacy checks, and replay order remain
  mandatory.
- Combining SQL input and submit reduces a tool round trip but requires replay
  to retain the SQL only in process memory and fail explicitly after restart.

### Assumptions and validation

- The user's instruction to start implementation confirms the previously
  presented eight-tool design, maintainer-owned `edit`, one-call `query`, and
  unchanged user commands.
- Existing source and executable tests define gameplay behavior. Focused tests
  run before broader quality gates; browser/Vite evidence is distinguished from
  static and mocked evidence.
- No commit, push, merge, release, deployment, or other publication is
  authorized.

## Recovery Checkpoint

- Current bounded slice: AC-1 through AC-8 are implemented and verified on
  `feature/gui-agent-tool-convergence` in both repositories; no commit, push,
  merge, apply, release, or deployment was performed.
- AC-1/AC-2 evidence: maintainer Extension tests register exactly
  `inspect/edit/check/finish/workspace/look/act/query`; Pi native tools and Bash
  are not loaded. Edit tests cover current hashes, exact scope, realpath,
  detached-worktree isolation, three-file/120-line budgets, approval, refresh,
  replay, and evidence invalidation.
- AC-3/AC-4/AC-5 evidence: protocol 1.0 types and bridge tests cover revision-bound
  stable actions, stale rejection, prerequisite reward/aggregate-hammer/shortcut
  key selection, interaction stops, the 64-step cap, and second-attempt
  `stalled`, without coordinates or hidden player data.
- AC-6/AC-7 evidence: maintainer replay and game bridge tests cover merged SQL
  write-plus-submit, process-local SQL replay, restart failure, stale/unavailable/
  rejected/stalled outcomes, and post-refresh replay assertions.
- AC-8 evidence: maintainer lint, TypeScript, build, and 129/129 tests pass; game
  architecture check, production build, and 558/558 tests pass; both
  `git diff --check` checks pass, and `game/dist` contains no
  `__DUNGEON_PLAYTEST__` symbol.
- Preserved work: the pre-existing maintainer Eval changes remain in place; a
  mismatched Eval plan-Oracle fixture was aligned with its existing production
  predicate. Test-generated changes to the frozen Eval Dataset were removed.
- Still unverified: none within the approved contract.
- Blocker: none.
- Next action: user review and separate authorization for any commit, push,
  merge, or release action.
