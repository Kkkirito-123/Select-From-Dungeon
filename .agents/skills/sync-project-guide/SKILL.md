---
name: "sync-project-guide"
description: "Inspect final change evidence and decide independently whether stable Agent guidance, current Architecture facts, and user-facing README content need synchronization. Use for an explicit guidance check, an authorized guide, Architecture, or README update, or the final stage of an approved delivery or bootstrap when durable rules or current facts may have changed. Edit only within the authorized file scope; otherwise report the required update. Do not use for changelogs, temporary status, future plans, or internal refactors that leave relevant facts unchanged."
---

# Sync Project Guide

Keep stable rules, verified current facts, and user-facing documentation in
their separate authorities without creating a changelog or duplicate map.

## Workflow

1. Establish the mode and exact file scope before editing:
   - `CHECK_ONLY`: inspect and report; do not modify files
   - `SYNC_AUTHORIZED`: an explicit update request or approved delivery/bootstrap
     contract authorizes only the named or plan-scoped Guide, Architecture, and
     README files
   Then read Git status, the staged Diff, the unstaged Diff, the in-scope
   untracked files, root and closest Guide and Architecture files governing a
   changed area. Read the exact Task for approved L1/L2 work. Use source and
   executable tests for current behavior and an approved Task for intended
   behavior; report material drift.
2. Compare the change against these durable facts:
   - top-level layout, module ownership, service topology, or primary entry points
   - main request, data, event, or agent execution flow
   - dependency direction, public contracts, protocols, or compatibility rules
   - canonical setup, development, run, build, migration, or validation commands
   - configuration sources, precedence, or important defaults
   - data or storage ownership, schema boundaries, or migration responsibility
   - repository workflow, Agent or Skill routing, or critical quality gates
   - security boundaries, sensitive areas, generated-code ownership, or runtime
     behavior an agent must know before editing
   - license or distribution boundaries
3. Make three independent decisions; one change can require several surfaces:
   - no relevant change -> `GUIDE_NO_UPDATE` or `README_NO_UPDATE`
   - change found but editing is check-only or outside the authorized file scope
     -> `GUIDE_UPDATE_REQUIRED` or `README_UPDATE_REQUIRED`
   - apply the same states independently to Architecture:
     `ARCHITECTURE_NO_UPDATE`, `ARCHITECTURE_UPDATE_REQUIRED`, or
     `ARCHITECTURE_UPDATED`
   - change found and its files are authorized -> synchronize the owning
     surface and report its `*_UPDATED` state
4. For an authorized Guide update, edit only the closest `AGENTS.md` that owns
   a changed stable permission, safety, routing, or stop condition. Update the
   root guide only for repository-wide stable rules.
5. For an authorized Architecture update, edit each closest
   `ARCHITECTURE.md` that owns a changed current fact. Update root Architecture
   for repository topology, cross-module flow, commands, or other repository-
   wide facts. Replace stale statements with verified current behavior.
6. Synchronize every authorized retained human translation without changing the
   English authority. Keep `CLAUDE.md` as the exact thin import. Handle an
   authorized user-facing README update independently of the guide decision.
7. Report pre-existing or out-of-scope drift without repairing it. Never use a
   current sync task as authority for unrelated documentation cleanup.
8. Verify every mentioned path, entry point, and command against the repository.
   Inspect the documentation Diff for misplaced Task state, stable/current-fact
   duplication, stale claims, excessive detail, and conflicts with nearer rules.

## Boundaries

- Do not update a Guide or Architecture merely because files changed.
- A request to check, review, or report is not edit authorization. Do not modify
  a file excluded by the approved scope even when it needs an update.
- Do not add implementation trivia, timestamps, commit SHAs, temporary progress,
  TODOs, release history, speculative directories, or complete dependency lists.
- Do not create a fixed documentation hierarchy for a small repository.
- A nearer guide may refine local rules but must not silently weaken root safety,
  permission, or publication boundaries.
- If evidence is insufficient, report the uncertainty and leave the guide
  unchanged rather than inventing a fact.

## Completion Evidence

State final Guide, Architecture, and README statuses; identify the stable,
current, and user-facing facts considered; list authorized files changed;
identify required but unauthorized updates; cite repository evidence; and note
remaining uncertainty.
