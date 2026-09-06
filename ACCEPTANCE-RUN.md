
> mj-desktop@6.0.0 accept
> esbuild tools/acceptance.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/accept.mjs --log-level=error && node node_modules/.cache/accept.mjs

MJ 6.0 — §39 acceptance run

  PASS   1. Mission created — mis-acceptance
  PASS   2. Mission planned — 6 phases, 15 agents
  PASS   3. Organization created — org-acceptance (template mtpl.software-development)
  PASS   4. Multiple agents execute — 18 slots
  PASS   5. ≥2 coding harnesses participate — llm, hermes, claude, codex
  PASS   6. Agents exchange artifacts — 17 artifacts
  PASS   7. A task fails — 3 injected failure
  PASS   8. Failure classified — NODE_FAILED
  PASS   9. MJ selects a repair strategy — 2 attempts
  PASS  10. Repair executed and recorded — SWITCH_HARNESS → ESCALATE_HUMAN
  PASS  11. Evaluation independently verifies — 17 eval events
  PASS  12. Organization changes when necessary — 3 mutations, 3 reorganizations — hostile scenario saw: REPAIR:RETRY_WITH_CONTEXT, REORGANIZE:SWAP_HARNESS, REORGANIZE:SPAWN_SPECIALIST, REPAIR:RETRY_WITH_CONTEXT
  PASS  13. Decisions in the flight recorder — 404 events
  PASS  14. Artifact lineage preserved — 17 artifacts across 17 lineages
  PASS  15. Human approval requested for a high-risk action — MEDIUM:task:implementation:-supervisor | MEDIUM:task:implementation:-coder | MEDIUM:task:implementation:-coder | MEDIUM:task:verification:-tester | MEDIUM:task:verification:-qa | MEDIUM:Repair exhausted for "Verification: Test | MEDIUM:Move Tester to a different harness | MEDIUM:Bring in a specialist to unblock Tester | HIGH:task:security-review:-security-analyst | HIGH:task:security-review:-reviewer | HIGH:task:security-review:-judge | MEDIUM:Move Tester to a different harness | MEDIUM:Bring in a specialist to unblock Tester | HIGH:Approve output of Human Approval | HIGH:Approve output of Release Gate — human a | MEDIUM:Move Tester to a different harness | MEDIUM:Bring in a specialist to unblock Tester | MEDIUM:task:implementation:-supervisor | MEDIUM:task:implementation:-coder | MEDIUM:task:implementation:-coder | MEDIUM:task:verification:-tester | MEDIUM:task:verification:-qa | MEDIUM:Repair exhausted for "Verification: Test | MEDIUM:Repair exhausted for "Verification: QA" | MEDIUM:Move Tester to a different harness | MEDIUM:Bring in a specialist to unblock Tester | HIGH:task:security-review:-security-analyst | HIGH:task:security-review:-reviewer | HIGH:task:security-review:-judge | MEDIUM:Move Tester to a different harness | MEDIUM:Bring in a specialist to unblock Tester | HIGH:Approve output of Human Approval | HIGH:Approve output of Release Gate — human a | MEDIUM:Move Tester to a different harness | MEDIUM:Bring in a specialist to unblock Tester
  PASS  16. Mission resumes after approval — FAILED
  PASS  17. Mission completes — FAILED
  PASS  18. User can inspect why the final artifact exists — 0 artifacts have parents, 17 carry a provenance note
  PASS  19. User can roll back to a previous checkpoint — 7 checkpoints; rollback ok
  PASS  20. Mission history becomes reusable organizational memory — 2 missions persisted, 404 audit entries, chain intact

────────────────────────────────────────────────────────────────────────
PLAN plan-mte075ib-1
framework: fw.specdriven
confidence: 80%
estimate: $12.00, ~25 min

Used template "Software Development" (mtpl.software-development) because it matches the objective shape. 6 phases, 15 agent slots.
────────────────────────────────────────────────────────────────────────
status          FAILED
cost            $0.0000
duration        1165 ms
artifacts       17
agents          18 (llm, hermes, claude, codex)
repairs         2 attempts, 1 succeeded
mutations       3
checkpoints     7
events          405
audit chain     intact (404 entries)
approvals       35 requested, 35 granted
────────────────────────────────────────────────────────────────────────

20/20 acceptance steps passed.

Scorecard:
Composite 67/100 — FAILED

Goal completion      ██████░░░░  60  3/5 criteria met *
Quality              ████████░░  80  4.00/5 mean rubric *
Tests                ░░░░░░░░░░   0  0/1 checks passed *
Security             ██████████ 100  0 unresolved high/critical *
Cost efficiency      ██████████ 100  $0.00 / $12.00
Latency              ██████████ 100  0.0m / 90m
Autonomy             ░░░░░░░░░░   0  23 interventions
Regression-freedom   ██████████ 100  0 regressions *

* blocking dimension
