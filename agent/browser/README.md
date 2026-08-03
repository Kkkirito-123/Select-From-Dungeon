# Browser Agent boundary

This directory owns the deployed output-only Agent runtime:

- `deepseek/`: the session-memory credential worker and fixed-origin client;
- `scribe/`: the bounded character prompt;
- `ui/`: explicit consent, model selection, local export, and key clearing.

The game supplies a read-only evidence projection. The runtime is driven by
four semantic hooks: floor start, route guidance, elite defeated, and floor
end. This package returns only validated Scribe wording and deterministic
Campfire facts. It has no gameplay tools, save mutation, free-form player
prompt, custom provider URL, or server proxy. The Python package under
`agent/src/` remains a controlled output service and never receives a browser
BYOK Key.
