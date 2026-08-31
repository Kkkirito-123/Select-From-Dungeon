# SQL Demon Castle · SELECT * FROM DUNGEON

[中文说明](README.zh-CN.md) | **English**

The `game/` directory is the standalone browser game. It is an offline-first SQL roguelite built with TypeScript, Vite, Phaser, and SQLite WASM. The game does not require the optional Python Agent or Node.js presence service.

## Run

Requirements: Node.js `>=20.19` and pnpm `11.9.0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the Vite URL in a browser. For a production-style local build:

```bash
pnpm build
pnpm preview
```

Do not open `index.html` with `file://`; SQLite WASM must be served over HTTP.

## Game Loop

1. Explore a deterministic `56x42` floor and reveal the fog.
2. Touch an ID-labelled monster to enter a single-target SQL encounter.
3. Read the task and visible schema, then write a complete SQLite statement.
4. Correct results deal damage; mistakes trigger the announced counterattack.
5. Rest at campfires, claim course rewards, recover identities, and unlock the next route.

## Content

The eight-floor curriculum moves from basic filtering to query safety:

| Floor | Region | Focus |
|---:|---|---|
| 1 | Ember Archive | `SELECT`, `WHERE`, `IS NULL`, aggregation |
| 2 | Tidal Archipelago | ordering, distinct values, joins |
| 3 | Frost Gravefield | relationship and set queries |
| 4 | Elemental Furnace | subqueries and CTEs |
| 5 | Black-Iron Order | window functions and ranking |
| 6 | Dragon Ridge Workshop | controlled DML and transactions |
| 7 | Sunset Index Garden | indexes and query plans |
| 8 | Black-Gold High Hall | concurrency, migration, and query safety |

The Scribe and the `失名录` connect the lessons into one ascent. The final record is `MIGRATE`.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | `WASD` / arrow keys | Direction buttons |
| Inspect, rest, open, pick up | `E` | `E` button |
| Open SQL terminal | `Q + S` | `SQL 战斗` |
| Execute query | `Ctrl/Cmd + Enter` | Execute button |
| Inventory | `B` | Inventory button |
| Close panel | `Esc` | Close button |

## Data and Privacy

Run state, mastery, recovered monster names, and up to 200 SQL attempt records are stored in the browser. No account or server is needed. When `VITE_AGENT_URL` is explicitly configured, the optional Agent receives only bounded current-floor evidence; it never receives hidden answers or the full game state.

## Validation

```bash
pnpm test
pnpm architecture:check
pnpm build
```

The public download keeps this package and its runtime assets. Detailed design drafts, production notes, and preview recordings are not part of the game distribution; see [`docs/README.md`](docs/README.md) for the documentation boundary.

## License

See the repository root [LICENSE](../LICENSE) and [ATTRIBUTIONS.md](../ATTRIBUTIONS.md).
