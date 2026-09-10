# MJ — The Story (one spine, one artifact, four readers)

> This is the narrative document every pitch, demo, and page should align to.
> If a feature cannot be told as a chapter of THIS story, it does not go in the deck.

---

## The one sentence

**MJ is the assurance runtime for autonomous software work: it authorizes, bounds,
verifies, and measures every agent mission — and seals each one into a single signed
record that finance, audit, risk, and incident response can each read their own way,
verifiable by anyone with one command.**

## The one differentiator (the spine)

Not orchestration. Not another agent SDK. The spine is the **evidence chain**:

```
AUTHORIZE → EXECUTE → VERIFY → MEASURE → PROVE
(envelope)  (sandboxed (cross-    (budget,  (THE MISSION
 + scope     seats)    vendor,     spend,    RECORD — one
 + budget)            snapshot-   human     signed file,
                      bound)      rating)   verifiable anywhere)
```

Every competitor stops at some link of this chain — and asks you to trust their cloud
for it. MJ owns the whole chain **on the customer's machine** and ends it in an artifact
whose integrity anyone can re-compute:

> **One mission. One record. Zero MJ state required** — trust is anchored in the issuer public key: exchange its fingerprint out-of-band once, then pin it at every verification (`--issuer-key`).

## The one artifact — the Mission Record (14.1)

`mj-mission-record/1` — a single JSON file per mission, sealed by MJ's Ed25519 issuer key:

| Reader | What they look at inside the record |
|---|---|
| **Finance** | `economics` — per-cycle chargeback rows + mission totals (the exact CSV derivation) |
| **Audit / compliance** | `cycles[].gate` + the hash-chained receipts — EU AI Act Art. 12/14 evidence |
| **Risk / security** | `assuranceContext` + arena digests + the egress ledger trail |
| **Incident response** | `timeline` + re-verified receipt marks — the black box, already sealed |

Verify it anywhere: `node tools/verify-mission-record.mjs record.json` — zero
dependencies, zero MJ state, exit-code honesty. (Receipts verify with
`tools/verify-receipt.mjs`; dossiers with `verifyIncidentDossier`.)

## Why this is not a feature list

The features are chapters, not items:

1. **Authorize** — authority envelopes: human-rooted, scoped, attenuated, revocable;
   the 11-attack arena battery must pass before any agent runs.
2. **Execute** — 25 agent CLIs, OS-sandboxed with canary-verified enforcement,
   credentials scrubbed, race-proof budget reservations.
3. **Verify** — cross-vendor adversarial review bound to the exact snapshot SHA;
   STRICT mode forbids self-grading.
4. **Measure** — measured cost (never estimated), human 1–5 ratings, lesson memory;
   simulated runs teach nothing and charge nothing.
5. **Prove** — the Mission Record: receipts + economics + timeline + assurance
   context, signed, chained, egress-gated on export, verifiable offline.

FinOps, Assurance Score, Black Box, receipts, vault, egress ledger — these are the
*readers' views* of one artifact, produced by one runtime. That is the company.

## The persona map (investor-facing)

| Persona | Surface they touch | The sentence that lands |
|---|---|---|
| Engineer | Mission Loop | "My agent team runs real CLIs, sandboxed, under a hard budget." |
| Finance | FinOps card / CSV | "I get chargeback-grade, digest-stamped spend per team." |
| Auditor | Proof vault / Mission Record | "Hand me one file; I verify it without installing anything." |
| Risk / SecOps | Assurance + Black Box | "I see how much of the work is evidenced, and when something went wrong I get the black box." |

## The 90-second demo

1. Compose a crew, run a mission — watch the bus, the arena PASS, the gate.
2. Open **Audit**: the Assurance Score and its factor breakdown (or the honest
   `unevaluated`), the FinOps totals.
3. Export the **chargeback CSV** — egress gate authorizes, ledger records, digest stamped.
4. Seal the **Mission Record** — one file.
5. On a *different laptop with nothing installed*:
   `node verify-mission-record.mjs record.json --issuer-key <mj-issuer-key.hex>` → **VALID — issuer AUTHENTICATED**
   (the issuer key is exchanged out-of-band once; without it the verifier honestly says *issuer UNVERIFIED*).
6. Flip a number in the file, run again → **INVALID: digest mismatch**.

## Language discipline (say it exactly this way)

- ✅ "evidence / assurance score" — ❌ "safety guarantee" or "trust score"
- ✅ "MJ-governed artifacts leave through an auditable egress path" — ❌ "nothing can
  leave the laptop except through MJ"
- ✅ "measured" / "unmeasured" — ❌ estimated numbers presented as fact
- ✅ "verifiable without MJ" — ❌ "unhackable", "tamper-proof"
- Simulated is always labeled simulated; it teaches nothing and is never charged.
- ✅ "issuer key pinned out-of-band" — ❌ "zero trust required" (signature math alone cannot
  authenticate a self-reported key; the pin is the anchor).

## Position (researched Sept 2026 — see POSITIONING.md)

Orchestration is a giants' war (LangGraph ≈38% share). Governance is the funded theme
($34M seed / $30M A's) — but every funded control plane is cloud-trust-me. MJ owns the
empty quadrant: **local-first, cryptographically verifiable agent assurance**, with the
EU AI Act (enforced Aug 2026) as the forcing function.
