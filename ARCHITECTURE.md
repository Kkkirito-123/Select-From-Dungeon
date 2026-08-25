# Current Repository Architecture

This file records verified current repository facts. Stable rules live in
`AGENTS.md`; the current L1/L2 contract and checkpoint live in `TASK.md`.
`ARCHITECTURE.zh-CN.md` is the synchronized Chinese translation.

## Repository Map

```text
game/                    Independent TypeScript/Vite browser game
agent/                   Independent Python Campfire/Scribe/Main service
scripts/                 Repository-rule validator and regression tests
.github/workflows/       Cross-project validation and game Pages deployment
.agents/skills/          Requirement, implementation, delivery, and sync workflows
.maintainer/project.json Fixed identity for the external Dungeon Maintainer
LICENSE                  Repository license
ATTRIBUTIONS.md          External-source and third-party attribution register
```

The root owns repository governance and distribution entry points. Product
code belongs to `game/` and `agent/`. Detailed game facts live in
`game/ARCHITECTURE.md`; Python-service facts are governed by `agent/AGENTS.md`
until that subtree needs its own current-facts map.

## Runtime and Dependency Boundaries

```text
game TriggerBus
  -> game AgentRuntime
  -> strict HTTP request with bounded evidence
  -> POST /v1/agent/run
  -> agent/src/dungeon_agents
      -> Campfire or Scribe -> Main
```

- The projects share no source imports or dependency tree. `game/` does not
  import Python packages; `agent/` does not import game TypeScript, saves, or
  assets.
- The Agent is an optional enhancement. The game uses deterministic local copy
  when the service is absent or unavailable.
- Game rules, SQL execution, saves, maps, combat, and UI belong to `game/`.
  Campfire synthesis, Scribe companionship, Main guidance, provider calls, and
  content-free telemetry belong to `agent/`.
- Cross-project changes update both sides of the HTTP contract and validate both
  projects. Static game publication uploads only `game/dist/`; the Agent is
  deployed separately and never enters the browser bundle.
- Legal files stay at repository root and are copied into `game/dist/` by the
  game build.

## Maintainer Boundary

The external Dungeon Maintainer recognizes this repository only through the
fixed `.maintainer/project.json` marker. Its browser bridge is owned by
`game/src/devtools/`, runs only on a local Vite development page with
`?playtest=agent`, uses a temporary in-memory playtest store, and must be absent
from production output. Its exact tool and projection contract is documented
in `game/ARCHITECTURE.md`.

## Canonical Validation Commands

```text
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
python3 -m unittest discover -s agent/tests
pnpm --dir game install --frozen-lockfile
pnpm --dir game test
pnpm --dir game architecture:check
pnpm --dir game build
```

On Windows, `python` can replace `python3` when it points to Python 3.
`game/node_modules/`, `game/dist/`, Python virtual environments, and caches are
generated content and are not source.
