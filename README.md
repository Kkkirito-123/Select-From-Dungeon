# SELECT * FROM DUNGEON

[简体中文](README.zh-CN.md) | **English**

This repository contains two independent projects:

- [`game/`](game/README.md): the browser SQL roguelite, including TypeScript
  source, Vitest tests, assets, product documents, and the Vite build.
- [`agent/`](agent/README.md): the optional read-only Python Agent service for
  Campfire review, Scribe companionship, and Main guidance.

The game remains fully playable without the Agent service. The projects share
no source imports or dependency directory; their only runtime integration is a
strict HTTP contract. See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership and
execution boundaries.

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
python3 -m agent --host 127.0.0.1 --port 8787
```

`game/node_modules/` is generated dependency content installed by pnpm. It is
not project source, is ignored by Git, and can be regenerated from
`game/pnpm-lock.yaml`.

## Validation

```bash
python3 scripts/test_validate_rules.py
python3 scripts/validate-rules.py
python3 -m unittest discover -s agent/tests
pnpm --dir game test
pnpm --dir game architecture:check
pnpm --dir game build
```

Original repository code and prose use the [MIT License](LICENSE). Third-party
runtime notices and retained reference sources are listed in
[ATTRIBUTIONS.md](ATTRIBUTIONS.md).
