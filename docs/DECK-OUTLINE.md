# Vouch Harbor — pre-seed deck outline (10 slides)

*Built on `PRESEED-PITCH.md` + `VOUCH-HARBOR-ONEPAGER.md`. Every number must
stay sourced — if a stat can't be cited in the room, cut it.*

---

**S1 — The line**
"Vouch Harbor: the AI teammate that works on your machine and proves
everything it did."
One sentence. The logo. Nothing else on the slide.

**S2 — The world changed**
Agents now do real work: fleets of coding/ops agents in production.
But the blocker flipped from *capability* to *proof*: 88% of enterprise
agent pilots never reach production — blocked by risk controls, not model
quality (2026 surveys — cite PROBLEM-FOCUS). EU AI Act high-risk
enforcement began Aug 2, 2026: tamper-evident logging, human oversight,
penalties to 7% of global revenue.
Punch: *"Auditors don't want logs. They want evidence."*

**S3 — The two failures of today**
Left: cloud teammates (Grok Bot et al.) — they do the work, but the
"computer" is the vendor's VM, your credentials sit on it, and the proof is
"trust our logs" + a subscription.
Right: cloud observability — dashboards for engineers, explicitly
not auditor-grade evidence, still vendor-trust.
Center gap (the quadrant): **a teammate you talk to, on YOUR machine, that
signs what it did.** Nobody is there.

**S4 — The product (demo video, 90s — see DEMO-SCRIPT.md)**
One local-first app, one engine, six doors. The Teammate door is the hook:
you message your Vouch teammate, it plans, it pauses at the human gate, it dispatches a
real crew, and the receipt lands. Then the engine doors in 10 seconds each.

**S5 — The vouch (the mechanism slide)**
mj-proof-receipt: SHA-256 chain → HMAC seal → Ed25519 issuer signature (or
an honest "no signer" note). Verifiable offline with zero product state:
`node verify-receipt.mjs receipt.jsonl`.
Live moment: verify a tampered receipt on stage → it fails with the exact
sequence. Then the clean one → valid. *"Nothing faked. Nothing hidden."*

**S6 — Why now**
1. Regulation enforced (EU AI Act, Aug 2026) with global-revenue penalties.
2. The category got funded (agent governance: $34M seed, $30M A, $30M A,
   $85M+ — cite the tracker) — all of them cloud-trust-me.
3. Agents moved from demos to repos, budgets, prod systems.
4. Strategic M&A (identity + agent-security) shows incumbents paying up.
Punch: *the verifiable, local-first quadrant is the empty one.*

**S7 — Business model**
Open-core. Free personal tier (full verification core — the adoption
engine) → Pro (per seat: autonomous evolution, elastic fleets, FinOps/SIEM
exports) → Enterprise (audit binder automation, IAM/SIEM integrations,
cross-org channels, certification) — priced against a **compliance line
item**, not a dev-tool line item.
The receipt protocol ships open — the standard is the moat.

**S8 — Traction & engineering as signal (honest slide)**
Shipped: v16.9.0, 30+ releases, 91 probe suites + 90 offline bundles, byte-pinned offline
verification pack, cross-platform CI, independent Sep-2026 audit of the
receipt cryptography (zero integrity failures under deliberate tampering).
Honest gaps (this is the roadmap, not a secret): lighthouse customers,
two-machine transport, real FS/terminal tools behind the gate.
*We ship like we audit: every claim in this deck has a gate behind it.*

**S9 — The team**
Sree Harshen — founder/engineer: shipped the agent-work engine solo across 30+
certified releases (v9→v15), the receipt protocol, the offline verification
culture. (Add co-founder line when #2 signs — the hire is in the ask.)
Why us: the founder's edge — "evidence must be minted at execution time, on
the customer's machine, signed and chained — the way PKI changed
'trust this website' into 'verify this certificate'. We built that, for
agents."

**S10 — The ask**
Pre-seed to: land 3–5 lighthouse customers in regulated industries ·
ship the verifier CLI + audit binder as public artifacts + open the
receipt-verification standard (auditor partnership) · hire #2 (dist-sys/Rust)
and #3 (design/GTM).
**Seed milestone:** "agent receipts" becomes a procurement checkbox —
Vouch Harbor is the name on it.
Contact + "the verifier runs on your laptop during the Q&A — bring it."
