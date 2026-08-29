# Current Task

This file is the current L1/L2 task control surface. It stays `IDLE` when no
approved repository change is active. Do not use it as a log: keep only the
latest approved contract and latest recovery checkpoint.

```text
TASK_ID: game-session-app-shell-partition
STATUS: IDLE
CONTRACT_REF: TASK.md
CONTRACT_REVISION: 0
APPROVED_REVISION: 0
APPROVAL: not-required
ARCHITECTURE_REF: game/ARCHITECTURE.md
EXTERNAL_REF: none
```

## Contract

### Goal

Partition the two oversized `GameSession` and `AppShell` coordinators into
explicit feature packages with a pi-style dependency direction: lower-level
services expose narrow ports, feature coordinators compose them, and the
top-level runtime owns construction and teardown. Preserve current gameplay,
save formats, maintainer boundaries, and player-visible behavior.

### Users and stakeholders

- Maintainers and client engineers who need to locate a responsibility from its
  directory and file name without reading a monolith.
- Players, who must see the same current Run v12/Profile v3 game behavior.
- The Dungeon Maintainer, whose bridge and projections must keep their existing
  development-only contract.

### MVP

1. Add a clear `game/src/features/` layout with six bounded feature packages:
   `game-session`, `terminal`, `narrative`, `snapshot`, `app-shell`, and
   `game-runtime`.
2. Move pure GameSession-derived queries behind an explicit read-only context;
   `GameSession` remains the only mutable rules state committer and keeps its
   public API as thin forwarding methods where callers already depend on it.
3. Move Terminal, Narrative, and Snapshot workflows behind narrow ports. Their
   coordinators may return decisions and render projections, but may not own
   gameplay state, persistence, hidden answers, or DOM construction outside
   their declared adapter boundary.
4. Keep `AppShell` as the DOM lifecycle/event-routing facade and `main.ts` as a
   thin entry point. `GameRuntime` owns dependency construction, subscriptions,
   and teardown, including partial-initialization cleanup.
5. Add focused boundary tests and update architecture/maintainer documentation
   so a new engineer can trace each feature to its entry point and tests.

### Non-goals

- No changes to Run v12/Profile v3 schemas, generator-v7 maps, question-bank
  identity, stable IDs, gameplay rules, SQL grading, or progression order.
- No second mutable game-state store, reducer/event-sourcing rewrite, operation
  log, or pi-specific queue/lane semantics.
- No new runtime dependency, public HTTP protocol, storage migration, or
  production exposure of the development-only maintainer bridge.
- No broad formatting cleanup or changes to unrelated pre-existing worktree
  edits.

### Expected scope

- `game/src/features/**` and the existing owning modules under
  `game/src/domain/session`, `game/src/presentation/dom`, and
  `game/src/application` needed to connect the new boundaries.
- Focused tests for selectors, coordinator ports, lifecycle cleanup, and the
  existing GameSession/AppShell behavior.
- `game/ARCHITECTURE.md`, `game/ARCHITECTURE.zh-CN.md`,
  `game/docs/CODE_GUIDE.zh-CN.md`, and the maintainer architecture map only
  where verified ownership/routes change.

### Acceptance criteria

- AC-1: All existing current-game tests pass with unchanged public session,
  snapshot, persistence, maintainer, and player-visible contracts.
- AC-2: `GameSession` has no DOM, Phaser, storage, network, or Agent imports;
  it remains the sole rules-state writer. `AppShell` has no direct rule or
  storage mutation and remains the DOM lifecycle facade.
- AC-3: Each new feature package has an explicit entry point and narrow ports;
  dependency direction is lower-level services -> feature coordinator ->
  runtime entry, with no circular imports. Architecture checks enforce this.
- AC-4: Empty terminal input causes zero SQL/session calls; a submitted action
  commits at most once; animation/error/abort paths always release busy state
  and clean up. Narrative evidence and MIGRATE retain confirmation order.
- AC-5: Snapshot output remains defensively copied and redacted exactly as
  before; mode-entry, transition, audio, minimap, and battle feedback behavior
  remains intact.
- AC-6: `main.ts` is a thin bootstrap and `GameRuntime.destroy()` is repeatable
  and cleans subscriptions/resources after partial initialization.
- AC-7: TypeScript, focused tests, full game tests, production build,
  architecture/rules checks, and `git diff --check` pass; no generated output
  or unrelated edits are introduced.

### Compatibility, recovery, and risks

- This is a behavior-preserving source reorganization. Existing v12/v3 data and
  all current development/optional-service boundaries remain valid.
- If a method cannot be moved without changing state-commit order, snapshot
  redaction, storage shape, or protocol behavior, leave that method behind as a
  documented facade and report it rather than forcing a risky abstraction.
- The worktree already contains unrelated uncommitted cleanup changes; all
  changes must be layered on top of them and never reset or overwrite them.

### Assumptions and validation

- The user-approved design is the source of intent: English responsibility
  names, one explicit feature entry point, and lower layers hidden behind ports.
- Existing source and tests define behavior. Baseline checks are run before
  each slice; focused checks precede the integrated full quality gate.
- No commit, push, merge, deployment, or external publication is authorized.

## Recovery Checkpoint

- Current bounded slice: feature partition integrated; runtime resource ownership
  and partial-initialization cleanup hardened.
- Evidence: direct Node entrypoints passed TypeScript, focused coordinator and
  lifecycle tests (6 files, 47 tests), full Vitest (88 files, 537 tests), Vite
  production build, architecture and repository-rule checks, and `git diff --check`.
  The production bundle contains no maintainer-bridge symbols. The seven fixed
  Benchmark browser Oracles also matched both the broken and clean-after states
  (7/7, with zero browser errors).
- Maintainer latest-branch Agent runs reached the real Provider boundary, but no
  model turn completed because the Provider returned HTTP 402 (insufficient
  balance). Those runs are recorded as `infra_error` / infrastructure with
  `model-billing-unavailable`, rather than as game correctness failures.
- Still unverified: device acceptance, a human eight-floor completion run, and
  constrained-iframe behavior. On this Windows shell, `pnpm test`/`pnpm build`
  cannot resolve local `.bin` commands; equivalent direct Node entrypoints passed.
- Blocker: none.
- Next action: a maintainer may review and publish this work under a separate
  explicit Git action; no commit, push, merge, or deployment was performed.
