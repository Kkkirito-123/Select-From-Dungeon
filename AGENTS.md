# Stable Repository Rules for AI Coding Agents

This file is the stable repository authority. `ARCHITECTURE.md` owns verified
current repository facts; `TASK.md` owns the current L1/L2 work contract and
recovery checkpoint. `AGENTS.zh-CN.md` is the synchronized Chinese translation.

## Authority and Reading Order

- Read this guide first, then the closest nested `AGENTS.md`. `game/AGENTS.md`
  owns browser-game rules and `agent/AGENTS.md` owns the optional Python service.
  A nested guide may refine local rules but cannot weaken root safety,
  permission, evidence, or publication boundaries.
- Source and executable tests are evidence of current behavior. An approved
  Task is evidence of intended behavior. Report material drift between them.
- Stable permissions, routing, and stop conditions belong here. Current layout,
  ownership, flow, commands, configuration, data, protocol, and runtime facts
  belong in Architecture. Current objective, scope, acceptance, approval, and
  checkpoint belong in Task.
- L0 inspection may stop after the relevant rules and source. L1/L2 work reads
  the exact `CONTRACT_REF` and `ARCHITECTURE_REF` from `TASK.md`; do not scan for
  or invent a different contract.
- After context reduction, session resume, or uncertain continuity, reread this
  guide, the exact Task, the exact Architecture reference, and Git status. Stop
  if a source is missing or revision, scope, and approval disagree.

## Working Contract

- Reply in Chinese unless the user requests another language. Use UTF-8; source
  identifiers, APIs, and tests follow the codebase language.
- Serve one explicit objective at a time. Inspect Git status, the closest guide,
  owning source, tests, contracts, and relevant documentation before editing.
- Preserve unrelated user work and ignored local configuration. Never print,
  commit, rewrite, or expose credentials or sensitive local content.
- Features, refactors, deletions, dependency or schema changes, batch edits,
  global configuration changes, and other high-impact work require an approved
  objective, users, MVP, non-goals, scope, acceptance, validation, and risk
  boundary. A material change invalidates that approval.
- Prefer the smallest coherent change. Do not create speculative features,
  abstractions, compatibility paths, dependencies, or duplicate authorities.
- When ambiguity changes user-visible behavior, public contracts, cost,
  security, or scope, expose the alternatives and request a decision. Otherwise
  use the smallest reversible assumption and report it.
- Distinguish permission, implementation, environment, validation-path, and
  tool failures. Do not repeat a materially identical failed attempt more than
  three times.
- Claim only checks that actually ran and distinguish static, unit, mocked,
  build, integration, provider, browser, device, and end-to-end evidence.
- Read-only inspection and local validation do not authorize destructive or
  external writes. Commit, Push, PR, Merge, Release, deployment, and related
  publication actions require separate explicit authority.

## Route Work Through Skills

Reusable workflows live under `.agents/skills/`. Load only the selected
English `SKILL.md` after its name and description match the task.

```text
unapproved or ambiguous change -> $define-requirement -> approval
first template bootstrap       -> $bootstrap-repository
approved substantive delivery  -> $deliver-change
bounded implementation slice   -> $implement-change
guide / architecture / README  -> $sync-project-guide
explicit publication authority -> $publish-change
```

Clients without native Skill discovery read
`.agents/skills/<skill-name>/SKILL.md`. Completion never grants publication
authority.

## Task and Architecture Protocol

- `TASK.md` stays `IDLE` when there is no active approved L1/L2 work. `ACTIVE`
  and `COMPLETE` require confirmed approval and equal positive contract and
  approved revisions. Material scope or safety changes require a new approved
  revision before implementation resumes.
- A Task checkpoint keeps only the current bounded slice, evidence mapped to
  acceptance IDs, unverified behavior, blocker, and one next action. It is not
  a changelog or raw-log store.
- Add or update nested Architecture only when a subtree has genuinely distinct
  layout, ownership, flow, commands, data, protocol, compatibility, security,
  generated-code ownership, or runtime facts.
- Route verified durable-fact drift through `$sync-project-guide`. Keep setup
  and user behavior in README files, and history in Issues, PRs, reports, or the
  chosen tracker.

## Evidence and Stop Conditions

- Define observable success before editing. Run focused checks first, then the
  appropriate broader quality gate.
- Review every changed line and the complete Diff for behavior, security,
  compatibility, generated artifacts, stale documentation, and scope drift.
- Stop when approval no longer matches scope, a safety boundary would be
  weakened, required evidence cannot be obtained within authority, or a merge
  conflict cannot be resolved without overwriting user work.
