# SELECT * FROM DUNGEON

[简体中文](README.zh-CN.md) | **English**

This repository contains three independent projects:

- [`game/`](game/README.md): the browser SQL roguelite, including TypeScript
  source, Vitest tests, assets, product documents, and the Vite build.
- [`agent/`](agent/README.md): the optional read-only Python Agent service for
  Campfire review, Scribe companionship, and Main guidance.
- [`presence/`](presence/README.md): the dependency-free Node.js SSE service
  that counts open game tabs for the lower-left online indicator.

The game remains fully playable without either optional service. The projects
share no source imports or dependency directory; runtime integration uses
strict HTTP/SSE contracts. See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership
and execution boundaries.

## Quick start

Run the browser game:

```bash
cd game
pnpm install --frozen-lockfile
pnpm dev
```

Run the optional Agent service in another terminal:

```bash
python3 -m pip install -e agent
dungeon-agent --host 127.0.0.1 --port 8787
```

Run the live presence service in another terminal:

```bash
npm start --prefix presence
```

Copy `game/.env.example` to `game/.env.local` to enable the single optional
`POST /v1/agent/run` integration. Provider keys stay in `agent/.env`.

`game/node_modules/` is generated dependency content installed by pnpm. It is
not project source, is ignored by Git, and can be regenerated from
`game/pnpm-lock.yaml`.

## Coding-agent benchmark

The game owns seven development-only repair cases under
[`benchmark/agent-evals/`](benchmark/agent-evals/) and exposes them through the
stable [`scripts/benchmark-adapter.mjs`](scripts/benchmark-adapter.mjs) JSON
interface. Dungeon Maintainer reads this adapter from the current working tree,
so benchmark materialization always uses the current game instead of a frozen
copy. Materialized targets exclude the benchmark definitions, hidden Oracle
data, and the adapter itself.

Inspect the public catalog from the repository root:

```bash
node scripts/benchmark-adapter.mjs catalog
node scripts/benchmark-adapter.mjs describe --fixture terminal-action-bug --audience public
```

See [benchmark/README.md](benchmark/README.md) for the materialization command
and privacy boundary.

## Validation

```bash
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
python3 -m unittest discover -s agent/tests
npm test --prefix presence
pnpm --dir game test
pnpm --dir game architecture:check
pnpm --dir game build
```

Original repository code and prose use the [MIT License](LICENSE). Third-party
runtime notices and retained reference sources are listed in
[ATTRIBUTIONS.md](ATTRIBUTIONS.md).
