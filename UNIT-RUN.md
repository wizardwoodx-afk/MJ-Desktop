
> mj-desktop@6.0.0 unit
> esbuild tools/unit.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/unit.mjs --log-level=error && node node_modules/.cache/unit.mjs


MJ 6.0 — unit tests

  PASS  hashString matches the vectors pinned in Rust
  PASS  hashString is stable and collision-free on near-identical inputs
  PASS  classifyError separates harness absence from a plain retry
  PASS  every FailureClass has a label
  PASS  STEP_REPETITION fires when an agent repeats its own output
  PASS  STEP_REPETITION stays quiet when each attempt differs
  PASS  STEP_REPETITION stays quiet on a single attempt
  PASS  PREMATURE_TERMINATION fires on a completed task with no artifact
  PASS  PREMATURE_TERMINATION stays quiet when an artifact exists
  PASS  every FailureClass has a repair ladder
  PASS  no ladder opens with a blind retry
  PASS  the new MAST classes repair by changing the agent's situation
  PASS  every ladder ends by escalating to a human
  PASS  a fresh manifest verifies clean
  PASS  the manifest declares its content synthetic (Art. 50)
  PASS  editing any claim breaks the manifest hash
  PASS  a manifest bound to a broken ledger does not verify
  PASS  lineage is exported as C2PA-style ingredients
  PASS  drift between the manifest and live content is reported
  PASS  the rendered manifest is valid JSON that round-trips

20 passed, 0 failed

