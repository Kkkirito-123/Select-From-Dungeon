# Current Task

This file is the current L1/L2 task control surface. It stays `IDLE` when no
approved repository change is active. Do not use it as a log: keep only the
latest approved contract and latest recovery checkpoint.

```text
TASK_ID: client-flow-guide
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

Create a self-contained, non-executable Markdown package under
`client-flow-guide/` that explains the selected game code flows and simulates
how a user, Dungeon Maintainer, coding agent, local game bridge, and reviewer
collaborate on a bounded change.

### Users and stakeholders

- Presenters and client reviewers who need a clear end-to-end explanation
  without operating the real Maintainer or game runtime.
- Repository maintainers who need the simulation to preserve the real
  architecture, privacy, isolation, validation, and publication boundaries.

### MVP

1. Provide one entry README with reading order, roles, scope, and a prominent
   statement that all interactions and outputs are simulated.
2. Explain SQL judgment/combat, movement/encounters, and
   snapshot/render/persistence with compact Mermaid sequence diagrams and links
   to the owning source files.
3. Explain Maintainer collaboration from repository recognition and bounded
   case description through isolated materialization, architecture routing,
   local bridge interaction, source change, validation, Diff review, and
   explicit human authorization.
4. Provide one fictional session that shows inputs, decisions, bounded evidence,
   simulated tool results, stop conditions, and final handoff without exposing
   hidden Benchmark or player data.

### Non-goals

- No executable demo, scripts, application code, live Maintainer/game calls, or
  claim that the simulated outputs were observed at runtime.
- No production source, test, README, Architecture, protocol, Benchmark fixture,
  dependency, or configuration changes.
- No hidden reproduction, Oracle, answer SQL, complete map, save, inventory,
  identity, credential, or private endpoint content.
- No commit, push, merge, apply, release, or deployment.

### Expected scope

- `client-flow-guide/README.md`
- `client-flow-guide/01-game-code-flow.md`
- `client-flow-guide/02-maintainer-collaboration.md`
- `client-flow-guide/03-simulated-session.md`
- `TASK.md` and `TASK.zh-CN.md` only for the required task contract and
  checkpoint.

Existing uncommitted source-comment changes on
`docs/client-code-flow-comments` must remain untouched.

### Acceptance criteria

- AC-1: The new directory contains exactly the four named Markdown files and no
  executable artifact.
- AC-2: Every file clearly distinguishes verified repository facts from
  simulated requests, results, and decisions.
- AC-3: The three game flows use accurate ownership boundaries and clickable
  repository-relative source references.
- AC-4: The Maintainer flow accurately covers marker recognition, Adapter
  discovery/materialization, isolated work, architecture-guided inspection,
  development-only bridge boundaries, validation, Diff review, and separate
  apply/publication authority.
- AC-5: The fictional session contains no hidden or sensitive data and never
  implies that coordinates, full snapshots, hidden answers, or arbitrary shell
  access are exposed to the model.
- AC-6: Existing source changes are unchanged, Markdown structure and local
  links are statically inspected, and the complete Diff passes
  `git diff --check`.

### Risks and trade-offs

- A simulation can be mistaken for a captured runtime trace; each document must
  label illustrative content at the point of use.
- Too much tool detail would distract from the collaboration model, so the guide
  explains responsibilities and approval gates instead of internal transport.
- Mermaid support depends on the Markdown viewer; equivalent prose remains next
  to every diagram.

### Assumptions and validation

- Markdown is the delivery format; no browser app, slide deck, or executable
  sample is required.
- The directory name is `client-flow-guide/` and the work remains on the current
  `docs/client-code-flow-comments` branch.
- Validation is static only: inspect all new content, verify local link targets,
  confirm protected terms/data are absent, preserve the pre-existing source
  Diff, and run `git diff --check`.
- No publication action is authorized.

## Recovery Checkpoint

- Current bounded slice: AC-1 through AC-6 are complete on
  `docs/client-code-flow-comments`; no live Maintainer/game call, commit, push,
  merge, apply, release, or deployment was performed.
- AC-1/AC-2 evidence: `client-flow-guide/` contains exactly the four approved
  Markdown files and no executable artifact; every file labels its illustrative
  requests, results, or diagrams as simulated near the point of use.
- AC-3 evidence: three Mermaid sequence diagrams and equivalent prose describe
  SQL/combat, movement/encounters, and snapshot/render/persistence with local
  links to their owning source files.
- AC-4 evidence: the Maintainer flow covers the fixed marker, Adapter
  `catalog`/public `describe`/`materialize`, isolated work, schema-v4 routing,
  the DEV-local bridge boundary, validation, Diff review, and separate human
  authority for apply and publication.
- AC-5 evidence: the fictional session uses placeholders, labels its diagnosis
  and check output as simulated, and contains no executable SQL, credential
  pattern, hidden answer, Oracle, complete map, save, inventory, or identity
  data.
- AC-6 evidence: the four-file structure, headings, disclaimers, code fences,
  and local links pass a static Node check; no trailing-whitespace or sensitive
  pattern was found; `git diff --check` passes for tracked changes.
- Preserved work: the existing seven-file source-comment Diff and branch remain
  unchanged at the recorded per-file insertion/deletion counts.
- GUIDE_NO_UPDATE: stable agent permissions, routing, and stop conditions did
  not change.
- ARCHITECTURE_NO_UPDATE: the supplemental guide changes no runtime topology,
  ownership, protocol, data, command, or compatibility fact.
- README_NO_UPDATE: setup and player-facing behavior did not change; the new
  package is a scoped client explanation rather than a product entry point.
- Still unverified: Mermaid rendering in a specific external viewer; no live
  runtime, tests, or builds were run because the artifact is intentionally
  non-executable.
- Blocker: none.
- Next action: user review; any commit, push, merge, apply, release, or
  deployment requires separate authorization.
