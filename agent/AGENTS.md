# Agent Service Guide

This guide applies to `agent/`. Repository-wide safety and publication rules
remain authoritative.

## Ownership

- `campfire/` owns SQL-learning review contracts and flow.
- `scribe/` owns story companionship and defeat comfort contracts and flow.
- `director/` currently composes the changed child result into Main guidance.
- `shared/` is the only model, strict-text, hash, error, and telemetry boundary.
- `http/` parses transport input and assembles flows; it owns no role behavior.
- `tests/` stays centralized because it verifies contracts across all three
  roles and their shared runtime.

The three roles are one deployable service with separate business modules. Do
not split them into independent services or duplicate shared model clients.

## Safety Boundaries

- The service is stateless and read-only. Do not add a database, output store,
  memory, tools, autonomous planning, or gameplay commands.
- Never accept reference SQL, complete game snapshots, maps, movement,
  inventory, identity, or provider credentials from the browser.
- OpenTelemetry spans may contain identifiers, status, duration, fallback, and
  token counts, but never prompts, completions, SQL, display text, or secrets.
- Deterministic fallback must keep the game usable when a key, model, or trace
  exporter is unavailable.

## Commands

Run from repository root:

```bash
python3 -m pip install -e agent
python3 -m unittest discover -s agent/tests
python3 -m agent --host 127.0.0.1 --port 8787
```

Use short, readable names. Add Chinese comments only for module responsibility,
non-obvious orchestration, public contracts, and privacy/security boundaries;
do not narrate obvious statements line by line.
