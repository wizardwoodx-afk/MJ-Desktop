# MJ 14.0.0 — The Assurance Release · fix & features file

> This is the packaging record for 14.0: the market research behind each new feature,
> what ships, the honesty rules it obeys, and every fix folded in. Positioning rule for
> this release: **product-focused and customer-focused — no hype.** Every claim below is
> either a working module with a probe suite or a dated, linked external source.

---

## 1 · Why 14.0 exists

13.x proved the thesis technically (75 suites, receipts, arena, gates). What it lacked
was **customer-shaped surfaces**: an auditor who will never install MJ, a CFO who thinks
in chargeback rows, a risk committee that thinks in scores, an incident responder who
thinks in black boxes. The 2026 market named all four jobs — research below — so 14.0
implements them on top of the existing, tested engine. Nothing here is a wrapper around
someone else's dashboard; everything is derived from artifacts MJ already measures.

---

## 2 · The researched features (what makes MJ stand apart)

### 2.0 · Product surfaces — the Audit page consumes the stores (the integration pass)

The reviewer verdict on the first 14.0 packaging was exact: *"strong primitives, but
where do I actually use them?"* Closed. `src/mission/evidenceSurfaces.ts` reads the
stores the Mission Loop actually writes (cycle ledger `mj.missionLoop.v1`, the receipt
vault, the feedback store) and feeds the three engines from measured data only; the
**Audit page** now renders:

- **Assurance Score card** — live 0–100 with the named factor breakdown, dilution and
  the honest `unevaluated` refusal.
- **Agent FinOps card** — live totals (measured / unmeasured / over-cap / simulated),
  and a **CSV export that is itself egress-gated** (human envelope → departure ledger
  receipt → digest-stamped download).
- **Incident black box** — mission picker → sealed tamper-evident dossier download,
  likewise egress-gated, with the verification verdict shown at sealing.

Cycle records now persist `tokensOnlySeats` and the signed `budgetUsd` cap (schema-
tolerant for pre-14.0 records), so the surfaces never re-estimate what the loop
already measured. Pinned by `probe/evidenceSurfaces.test.ts` (seeds the REAL stores
through their real APIs and asserts the derived outputs, including the refusal cases).

### 2.1 · Verify-anywhere CLI — `tools/verify-receipt.mjs`

- **Market evidence:** the funded governance/observability stack asks buyers to trust
  vendor clouds (LangSmith/Braintrust-class tooling is explicitly *not auditor-grade
  evidence* per 2026 buyer's guides, e.g. kla.digital's compliance-software guide).
  The EU AI Act's Article 12/14 evidence duties (enforced since Aug 2026) demand
  traceability a third party can check.
- **What ships:** a one-file, zero-dependency verifier (node: builtins only — the probe
  pins its import list) that recomputes the hash chain, the HMAC seal, and the Ed25519
  issuer signature of any MJ receipt, from a file or stdin. Exit 0 = VALID with the
  exact break point named on failure.
- **Why it differentiates:** every competitor's audit story ends at "export our logs."
  MJ's ends at "run this file on an air-gapped laptop." That is the open-standard wedge:
  if agent receipts become a procurement checkbox, MJ owns the verifier.
- **Probe:** `probe/verifierTool.test.ts` — fresh receipt VALID, tamper INVALID at the
  exact seq, v1 seal-only receipts still verify, stdin path works.

### 2.2 · Agent FinOps — `src/mission/finOps.ts`

- **Market evidence:** "AI FinOps is now a real job" (buildmvpfast, Jun 2026); the
  2026 FinOps tool market (Amnic, Finout, Apptio/IBM, Harness) sells token tracking and
  chargeback/showback — all derived from provider bills and gateway telemetry, i.e.
  *after the fact, someone else's counters*. Regulated buyers ask for "audit-ready AI
  cost reporting" (Amnic's 2026 tool guide).
- **What ships:** chargeback rows computed where spend is actually committed — MJ's
  budget ledger reserves and settles real seat costs atomically at dispatch. Digest-
  stamped (`verifyChargebackDigest`), RFC-4180 CSV export with fixed columns.
- **Honesty rules (probe-pinned):** tokens-only seats are `unmeasured`, never priced;
  uncapped missions say `uncapped`, never "100%"; simulated seats are counted, never
  charged; any later edit to the issued chargeback breaks the digest.
- **Why it differentiates:** the only chargeback in the market whose line items are
  hash-chained execution evidence rather than reconstructed billing data.

### 2.3 · Fleet Assurance Score — `src/mission/assuranceScore.ts`

- **Market evidence:** risk committees and cyber-insurers need a vocabulary for "how
  evidenced is this agent team's work?" — no funded vendor publishes a measured answer
  (the governance funding wave — JetStream $34M seed, Guild.ai $30M A, Geordie $30M A —
  sells visibility, not evidence grades). The agent-insurability idea needs exactly such
  a score as its actuarial primitive.
- **What ships:** a 0–100 score with a named factor breakdown — verification mix 35
  (cross-vendor verified ratio is the strong form; same-vendor capped), governance arena
  20, budget discipline 20, egress integrity 15, human feedback 10 — computed only from
  artifacts MJ already issues (gate verdicts, arena digests, the budget ledger, the
  egress ledger, human ratings).
- **Honesty rules (probe-pinned):** zero measured runs → `unevaluated` (the bandit's
  settlement rule, applied to scores); simulated runs **dilute** via evidence coverage
  and never add points; the score is monotone in every factor; the breakdown ships with
  every score — it is an audit input, not a badge.
- **Why it differentiates:** first assurance metric that refuses to exist without
  evidence. Scores that can be gamed will be gamed; this one is derived from signed
  chains.

### 2.4 · Incident black box — `src/mission/incidentDossier.ts`

- **Market evidence:** the category was just named twice — Microsoft Research's AgentRx
  (Mar 2026) replays agent trajectories like a flight recorder for *diagnosis*; Vorlon
  launched an "AI Agent Flight Recorder" at RSAC 2026 for *security forensics*, built on
  cloud telemetry ("immutable" = trust their platform). Both validate the job; both stop
  short of cryptographic, local evidence.
- **What ships:** a one-file, digest-stamped dossier per incident: canonical timeline,
  authority envelope id, and every proof receipt **re-verified live at build time and
  again at verify time** — plus a SIEM-shaped JSONL projection for the security stack.
- **Honesty rules (probe-pinned):** a broken receipt is included but MARKED, and the
  digest covers the mark (the dossier cannot look healthier than its evidence); flipping
  a verdict after sealing fails verification; the timeline must be in canonical order.
- **Why it differentiates:** vendor flight recorders ask you to trust their cloud;
  MJ's black box is a file on your machine whose integrity any third party re-computes
  with the 14.0 verifier.

---

## 3 · Fixes folded into 14.0 (from the product-push audit cycle)

| Fix | Where |
|---|---|
| CI probe watchdog 120s → 300s default; `MJ_PROBE_TIMEOUT_MS` set in CI; `set -o pipefail` + always-on `probe-run.log` artifact upload; runner git identity before probes | `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `tools/run-all-probes.mjs` |
| Receipt-issuer Ed25519 key seals to the **OS keychain** on native desktop (new typed `secret_get` IPC); browser keeps localStorage; probes keep the deterministic path | `src/mission/signing.ts`, `src/ipc/client.ts`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs` |
| Portable browser-service paths (`%LOCALAPPDATA%\MJ\mj-browser`, `~/.local/share/mj/mj-browser`); dev-machine `D:\` paths removed from code, Node search, and user-facing messages | `src-tauri/src/commands.rs` |
| README duplicated header repaired; positioning banner added | `README.md` |

---

## 4 · Verification numbers (this tree)

- `tsc --noEmit` — 0 errors.
- `npm test` — **80/80** probe suites (5 new: finOps, assuranceScore, incidentDossier, verifierTool, evidenceSurfaces).
- `node verify/run.mjs` — **79/79** offline bundles (pack + MANIFEST rebuilt; freshness gate green).
- Version drift gate green across package.json / lock / version.ts / Cargo.toml / Cargo.lock /
  tauri.conf.json / README title / operational docs / release.yml / BUILD-INFO.
- **Before tagging `v14.0.0`:** re-run all four gates under the standalone Node 22.23.2 and
  refresh `verify/BUILD-INFO.txt` (the release ritual, unchanged).

## 5 · What 14.0 deliberately does NOT do (the anti-hype list)

- No UI redesign claims — the surface is frozen at INK + NATURA by design.
- No "agentic AI" adjectives — the new modules are deterministic, measured, and refuse
  loudly rather than estimate.
- No cloud service claims — everything in 14.0 runs on the customer's machine, by
  architecture, not by policy.
- No benchmark claims — the Assurance Score measures *evidence*, not intelligence.
