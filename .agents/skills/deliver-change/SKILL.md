---
name: "deliver-change"
description: "Orchestrate an approved substantive repository change from context inspection through bounded implementation, risk-based validation, final Diff review, and Guide, Architecture, and README synchronization. Use for complete approved features, refactors, multi-file fixes, dependency or schema changes, batch edits, and other end-to-end implementation work. Do not use for raw requirements, first template bootstrap, one localized implementation slice, read-only diagnosis or review, post-hoc documentation sync, or publishing."
---

# Deliver Change

Turn one approved change contract into the smallest verified vertical slice.
This Skill owns checkpoints and integration evidence; the coding stage follows
`$implement-change`.

## Workflow

1. Read the root and applicable nested `AGENTS.md`, the exact approved
   `CONTRACT_REF`, its `ARCHITECTURE_REF`, Git status, owning implementation,
   contracts, tests, and relevant documentation. Preserve unrelated work.
2. Check Task status is `ACTIVE`, approval is confirmed, positive revisions
   match, and the contract contains the goal, users or stakeholders, MVP, non-goals,
   expected scope, acceptance criteria, and risks. If approval is missing or a
   material decision is unresolved, stop and use `$define-requirement` or read
   `.agents/skills/define-requirement/SKILL.md`.
3. Before slicing an L2 change, confirm that public-interface and data effects,
   permission and security boundaries, compatibility, migration and rollout,
   and rollback or recovery are resolved or explicitly inapplicable. Return to
   `$define-requirement` when a material item is still open.
4. Build a trace from each acceptance criterion to the likely component,
   behavioral change, and validation evidence. Split large work into the fewest
   independently verifiable vertical slices; do not split one shared interface
   across uncoordinated workers.
5. For each slice, use `$implement-change` or read
   `.agents/skills/implement-change/SKILL.md`. At the checkpoint, compare the
   slice with the approved contract for drift; do not re-ask about unchanged
   scope. Update the Task recovery checkpoint with the current slice, evidence,
   unverified behavior, blocker, and one next action before the next slice.
6. Validate the integrated change in proportion to risk. Reuse valid slice
   evidence and rerun only checks invalidated by integration or required by the
   broader repository gate:
   - compare observable behavior with every acceptance criterion
   - run focused tests or checks first, then the repository's appropriate broader
     lint, type, build, test, migration, integration, or runtime gate
   - record each check, result, what it proves, and what it does not prove
   - distinguish static, mocked, build, integration, provider, device, and
     end-to-end evidence
7. Classify failures before retrying:
   - implementation failure: correct the code or test within scope
   - validation-path or environment failure: correct the check or report the
     unavailable dependency
   - tool failure: repair it only when within the approved scope, otherwise
     report it separately
   Stop after three materially identical failed attempts and preserve the
   evidence rather than looping.
8. Review the complete Diff and every changed file in context. Check user
   behavior, design, unnecessary complexity, edge cases, tests, documentation,
   security, credentials, permissions, compatibility, generated artifacts,
   unrelated edits, and accidental public APIs.
9. Use `$sync-project-guide` or read
   `.agents/skills/sync-project-guide/SKILL.md`. Require explicit Guide,
   Architecture, and README update decisions based on stable, current, and
   user-facing facts.
10. Report `DELIVERED`, `PARTIAL`, or `BLOCKED` truthfully with the objective,
   files, acceptance evidence, validation results, guide decision, discoveries,
   unverified areas, and remaining risk. Do not publish unless the user
   separately authorizes the exact external Git actions.

## Task State

`TASK.md` is the single current repository checkpoint. On completion, map final
evidence to every acceptance criterion and set `STATUS: COMPLETE`; after that
evidence is preserved in the delivery report, PR, or chosen tracker, restore
Task and its translation to `IDLE`. Do not duplicate current state elsewhere.

## Boundaries

- Do not expand the approved objective, overwrite user work, expose credentials,
  or perform destructive or external writes without authority.
- Ask again only when scope, product behavior, public contracts, cost, security,
  or material risk changes beyond the approved plan.
- Keep semantic decisions with the agent and repeatable deterministic checks in
  existing scripts or quality gates.
- Parallelize only independent work. The primary agent remains responsible for
  resolving overlaps and validating the integrated result.

## Completion Evidence

Report the delivery status, requirement-to-evidence trace, files changed, checks
and fresh results, final review findings, Guide, Architecture, and README sync decisions,
assumptions, unverified areas, remaining risks, and any reusable rule justified
by repeated evidence.
