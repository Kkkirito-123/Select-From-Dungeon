# Browser Agent boundary

This directory owns the deployed output-only Agent runtime:

- `deepseek/`: the session-memory credential worker and fixed-origin client;
- `scribe/`: the bounded character prompt;
- `ui/`: explicit consent, model selection, local export, and key clearing.

The game supplies a read-only evidence projection. This package returns only a
validated Scribe output. It has no gameplay tools, save mutation, free-form
player prompt, custom provider URL, or server proxy. The Python package under
`agent/src/` remains a loopback-only evaluation adapter.
