# Game-owned Benchmark Adapter

This directory owns development-only coding-agent repair cases for the current
game. Run the stable JSON interface from the repository root:

```powershell
node scripts/benchmark-adapter.mjs catalog
node scripts/benchmark-adapter.mjs describe --fixture terminal-action-bug --audience public
node scripts/benchmark-adapter.mjs materialize --fixture terminal-action-bug --destination <new-directory> --variant broken
```

`materialize` copies the current Git working tree, excludes this directory and
the adapter implementation, injects one selected fault, and creates a clean
single-commit repository. Hidden reproduction inputs and Oracle definitions
remain here and are never copied into the coding-agent target.
