# Output-only Agent MVP

## Decision

The approved MVP has two independent read-only consumers:

- the campfire always handles rest/checkpointing, while its learning recap
  unlocks after the current-floor elite is defeated;
- the physical Scribe renders a short character response prepared in the
  background.

There is no free-form player prompt or chat box. Agent output cannot mutate Run,
Profile, combat, grading, curriculum, rewards, story, inventory, or map state.
Gameplay remains complete when Agent is disabled or DeepSeek is unavailable.

## Runtime flow

```text
GameSession snapshot (read only)
  -> bounded semantic evidence (at most 8 current-floor attempts)
  -> evidence hash
  -> immediate deterministic campfire + Scribe fallback
  -> optional dedicated Worker on floor start, route escalation,
     elite defeat, or floor end
       -> direct request to https://api.deepseek.com
       -> JSON mode, low temperature, short output, no tools
       -> strict plain-text/evidence/story validation
  -> cache replacement only when Run, floor, and evidence hash still match
```

Movement, key presses, render frames, undiscovered map cells, and full save
payloads are not Agent inputs. The Scribe output is prepared at floor start,
when route guidance escalates, after an elite defeat, and at floor end;
ordinary movement and patrol updates do not create a request. One evidence hash
is attempted at most once; 401, 402, 429, timeout, empty, or invalid responses
are not automatically retried.

## Input contract

The browser selects only:

- opaque Run instance ID, floor number, and evidence hash;
- up to eight prioritized answer attempts: stable attempt ID, lesson/stage,
  objective, result category, outcome, hint level, and derived SQL feature tags;
- current-floor completed lesson IDs and derived world-state changes;
- bounded acquired-relic metadata;
- at most one already-unlocked authored story source.

Raw submitted and reference SQL remain in the browser-local learning ledger but
are not Agent inputs. The bounded projection contains only derived SQL feature
tags and result categories, so untrusted player text cannot override the fixed
Scribe system prompt. Monster identity text still passes through the existing
discovery/redaction boundary.

## Browser Key boundary

The settings panel supports DeepSeek only: password input, connect, provider
model list, model selection, clear Key, and disable-by-clearing. The user must
accept the disclosure before connecting. When available in the provider model
list, `deepseek-v4-flash` is the default selection.

1. The page sends the Key once to a dedicated Worker and clears the input.
2. The Worker stores it only in private current-tab memory.
3. The Worker only accepts the fixed origin `https://api.deepseek.com`.
4. Refresh, tab close, clear, or worker termination removes the Key.
5. Only consent version and model ID may be persisted.

The Key must never enter localStorage, sessionStorage, IndexedDB, Run/Profile,
Agent output cache, URLs, request bodies, exports, errors, console output,
telemetry, or project-server requests. DeepSeek calls use Bearer authorization,
`credentials: "omit"`, `redirect: "error"`, `cache: "no-store"`,
`referrerPolicy: "no-referrer"`, and a bounded abort timeout. A provider response
containing the active credential is rejected before leaving the Worker.

Deployment CSP limits scripts/workers to self, keeps the SQLite WASM exception,
and limits network targets to self plus DeepSeek. If browser CORS ceases to work,
the product keeps local output and does not add a hidden Key proxy.

## Output contracts

```ts
interface CampfireOutput {
  available: boolean;
  headline: string;
  facts: string[];          // 0..3, deterministic local facts
  focusConcept: string | null;
  nextAction: string;
}

interface ScribeOutput {
  greeting: string;
  observation: string;
  guidance: string;
  relationshipLine: string | null;
  sourceBeatId: string | null;
  evidenceRefs: string[];   // request-owned attempt refs only
}
```

All fields are short, single-line plain text. Markdown, HTML, unknown keys,
unknown evidence, unapproved story IDs, credential echoes, and oversized output
are rejected. DeepSeek supplies only the `ScribeOutput`; deterministic local
code remains the campfire fact authority.

## Cache and learning data

Validated prepared output uses `select-from-dungeon:agent-output:v2`, separately
from Run v12 and Profile v3. It stores no submitted/reference SQL and binds each
entry to Run, floor, and evidence hash.

The complete answer ledger is browser-local IndexedDB: at most 5,000 full
attempts plus permanent question and lesson aggregates. JSON export and explicit
clearing never include a Key. The Run save retains its capped 200 records as
immediate recap evidence and IndexedDB fallback.

## OpenZLAgent relationship

`agent/src/` is an optional Python 3.11+ controlled output service using the
pinned OpenZLAgent model-client boundary. It defaults to loopback for local
development; online deployment requires an explicit HTTPS, authentication,
rate-limit, and request-redaction boundary. The deployed browser BYOK flow
never sends a player's Key through Python or a project server. Neither path
enables tools, memory, MCP, game writes, request logging, or another task
lifecycle.

## Acceptance criteria

1. Campfire and Scribe use separate contracts and UI locations; campfire review
   is disabled until the current-floor elite is defeated.
2. Local output is immediate and deterministic without network access.
3. The Key cannot be recovered from browser persistence, output messages,
   exports, errors, logs, or project-server traffic.
4. Every model request targets the fixed DeepSeek origin and every response is
   validated against current evidence.
5. Offline, CORS, timeout, quota, and invalid JSON preserve full gameplay and
   local recap behavior.
6. TypeScript/Python tests, production build, rule validation, and browser
   security inspection pass before release.
