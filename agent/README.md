# SQL Dungeon output-only Agent

All Agent code lives in this top-level folder and has no gameplay write path:

```text
agent/runtime/          Evidence projection, deterministic fallback, cache, coordinator
agent/browser/deepseek/ Memory-only DeepSeek Worker and strict client protocol
agent/browser/scribe/   Bounded Scribe prompt
agent/browser/ui/       BYOK settings, disclosure, export/clear controls
agent/src/              Optional Python/OpenZLAgent local evaluator
agent/tests/            Python adapter tests
```

## Browser BYOK path

The shipped web app needs no Agent service. Local campfire and Scribe output is
always available. A player can explicitly enable DeepSeek in `AI 复盘设置`:

- the Key is sent once to a dedicated Worker and the password field is cleared;
- the Worker keeps it only in current-tab memory and only calls
  `https://api.deepseek.com`;
- the model list prefers `deepseek-v4-flash` when the provider returns it;
- refresh, tab close, `清除 Key`, or worker termination removes it;
- no Key is written to localStorage, sessionStorage, IndexedDB, logs, exports,
  URLs, telemetry, Run/Profile data, or the project server;
- DeepSeek may only supply strictly validated Scribe wording. Campfire facts,
  grading, HP, XP, loot, questions, maps, story flags, and saves remain local
  game authority.

The browser sends at most eight selected current-floor attempts plus bounded
lesson, world-change, relic, and unlocked-story evidence. There is no free-form
chat or prompt input. Provider, CORS, timeout, quota, or validation failure keeps
the deterministic local result and never blocks play.

## Optional Python/OpenZLAgent evaluator

The Python adapter is retained for local prompt evaluation and regression. It
is not used by the deployed browser BYOK route and must never proxy a player's
Key.

Fallback-only mode requires Python 3.11 or newer:

```bash
python3 -m pip install -e ./agent
sql-dungeon-agent --port 8787
```

To evaluate the pinned OpenZLAgent model-client adapter locally:

```bash
python3 -m pip install -e './agent[openzl]'
export SQL_DUNGEON_AGENT_MODEL_BASE_URL=https://provider.example/v1
export SQL_DUNGEON_AGENT_MODEL_NAME=your-model
export SQL_DUNGEON_AGENT_API_KEY=your-key
sql-dungeon-agent --port 8787
```

Provider credentials remain only in the Python process environment. The service
binds to loopback and permits loopback browser origins by default; it has no
tools, memory, MCP, game save access, or request logging.

## Verify

```bash
pnpm exec vitest run tests/Agent*.test.ts tests/DeepSeek*.test.ts tests/agentContext.test.ts
PYTHONPATH=agent/src python3 -m unittest discover -s agent/tests
```

The complete contract and failure behavior are documented in
`docs/product/systems/OUTPUT_ONLY_AGENT_SPEC.md`.
