# Repository Guide for AI Coding Agents

This is the repository-wide authority. Read it first, then read the closest
nested `AGENTS.md`: `game/AGENTS.md` owns browser-game rules and
`agent/AGENTS.md` owns the optional Python service.

## Working Contract

- Reply in Chinese unless the user requests another language. Use UTF-8.
- Inspect Git status, the closest guide, owning source, tests, contracts, and
  relevant documentation before editing.
- Preserve unrelated user work and ignored local configuration. Never print,
  commit, or rewrite credentials.
- Features, refactors, dependency changes, deletions, schema changes, and
  publication require explicit authority and proportionate validation.
- Prefer the smallest coherent change. Do not create compatibility paths,
  abstractions, comments, or documents that repeat an existing authority.
- Only claim checks that actually ran. Stop instead of force-merging when tests,
  CI, security checks, or conflict resolution are not clean.

## Repository Topology

```text
game/                  Independent TypeScript/Vite browser game
agent/                 Independent Python Campfire/Scribe/Main service
scripts/               Repository-rule validator and its regression tests
.github/workflows/     Cross-project validation and game Pages deployment
.agents/skills/        Requirement, implementation, delivery, and guide workflows
```

The projects share no source imports or dependency tree. The game may call the
Agent only through its strict HTTP contract and must remain playable without it.
The Agent must never read game saves, maps, inventory, identity, complete
snapshots, or provider secrets from the browser. Legal files stay at repository
root and are copied into `game/dist/` by the game build.

## Canonical Commands

```bash
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
python3 -m unittest discover -s agent/tests
pnpm --dir game install --frozen-lockfile
pnpm --dir game test
pnpm --dir game architecture:check
pnpm --dir game build
```

Generated directories such as `game/node_modules/`, `game/dist/`, Python
virtual environments, and caches are not source and must not be committed.

## Skills and Delivery

Route work through the repository Skills when applicable:

```text
unapproved or ambiguous change -> $define-requirement -> approval
approved repository change     -> $deliver-change
bounded implementation slice   -> $implement-change
guide synchronization          -> $sync-project-guide
first template bootstrap       -> $bootstrap-repository
reviewed result with explicit publication authority -> $publish-change
```

Clients without native Skill discovery read
`.agents/skills/<skill-name>/SKILL.md`. A nearer guide may add module constraints
but cannot weaken repository safety, validation, or publication rules.
