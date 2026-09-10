# MCP conformance fixtures — provenance

These are the OFFICIAL JSON Schemas of the Model Context Protocol
specification, committed verbatim from the spec's own repository. They are the
ground truth that `probe/mcpConformance.test.ts` (suite #89) validates Vouch
Harbor's MCP wire against, in both directions (our requests and the server's
responses).

## Files

| File | Source | Retrieved | sha256 |
|---|---|---|---|
| `schema-2026-07-28.json` | https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2026-07-28/schema.json | 2026-09-10 | `ef70b61f99b6d2e5e3b46863822eab08dff6a45bedc7a08914e0e5b133f40203` |
| `schema-2025-06-18.json` | https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2025-06-18/schema.json | 2026-09-10 | `af845e7e5b9d27107d1690f0936022546177a1403e63ffb11470135b296a2e01` |
| `ext-tasks-2026-07-28.json` | https://raw.githubusercontent.com/modelcontextprotocol/ext-tasks/main/schema/2026-07-28/schema.json | 2026-09-10 | `bf30afb7ac251e3e22c037b7a685f60ef6603031b5484c0d08b1fa0bbe86d460` |

Notes:

- `schema-2025-06-18.json` is draft-07 (uses `definitions`); the other two are
  draft 2020-12 (use `$defs`).
- The Tasks extension (`io.modelcontextprotocol.tasks`) has its result types in
  the separate `ext-tasks` schema — the core 2026 schema has no Task defs.
- The conformance suite sha256-pins all three files on every run: a swapped or
  edited fixture fails the gate. If the spec publishes a new revision, fetch it,
  record it here, update the digests in the probe, and re-run the suite — that
  re-run IS the conformance claim for the new revision.

## Regenerated per run (not committed)

- `report.json` — the full per-check conformance report (every message
  validated, both eras, both directions). Customer-facing evidence;
  `tools/mcp-conformance/report.json` is written on every suite run.
