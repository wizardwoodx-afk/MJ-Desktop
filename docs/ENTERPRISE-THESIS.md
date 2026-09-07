# Enterprise Thesis — The Cloud Coordinates. The Data Stays Home.

*MJ platform direction, 2026. This document is the validation artifact: what we
believe, why now, what we have already proven, and what must be validated
before heavy infrastructure is built.*

---

## One line

**A cloud control plane for companies whose data lives across thousands of
employee devices — employees collaborate and run approved operations across
one another's data without centralizing anything into the cloud.**

Shorter: **the cloud coordinates the company; the data stays with the people
who own it.**

## The problem, as companies feel it today

Corporate data no longer lives in one warehouse. It lives on laptops —
distributed employees, different locations, different networks — and every
current collaboration model forces a bad trade:

- **Upload everything** (cloud warehouse / SaaS storage): centralized breach
  surface, sovereignty and residency violations, and a direct collision with
  GDPR Article 25 *data minimization* — you copied data you never needed to.
- **Don't collaborate**: employees email attachments, use personal tools,
  and the shadow-data problem grows.
- **Clean rooms** (AWS/Snowflake/Databricks/InfoSum/Decentriq): real and
  funded, but shaped for *org-to-org analytics over warehouses* — not for
  Employee 1 needing one file from Employee 2's laptop.

The WhatsApp mental model everyone already understands: your gallery never
goes to the server; only the one photo you chose goes to the one person you
chose. Enterprises deserve the same model for company data.

## The idea

**Control plane / data plane separation** — the pattern Tailscale proved at
network level and NIST Zero Trust prescribes for access — applied to
corporate collaboration over endpoint-resident data:

```text
                    CLOUD CONTROL PLANE
        Identity | Policy | Discovery | Routing
        Sessions | Permissions | Audit receipts
                         |
          -------------------------------------
          |                                   |
     Employee 1                          Employee 2
      laptop                                laptop
   Company data                          Company data
   Local compute                         Local compute
          \                                   /
           \________ encrypted channel ______/
```

The cloud knows **who, which device, which resource, what operation, whether
it was allowed, when, and what evidence was produced.** It never becomes the
warehouse.

### The upgrade that makes it a company: capability, not data

The stronger form is not "share a file." It is:

> **Expose a capability without exposing the underlying data.**

Employee 2 does not ask for `revenue.xlsx`. Employee 2 asks:
*"run the approved 'revenue by region' calculation on your data."* The
computation happens **where the data lives**; only the permitted result
crosses the boundary — with a receipt.

## Honest engineering choice: three models

1. **Data transfer** — laptop → cloud processes it. The cloud sees the data.
   *(the model we reject)*
2. **Endpoint processing** — the laptop computes; only the result travels.
   The cloud never sees underlying data. *(our model, now)*
3. **Privacy-preserving remote computation** — confidential computing / MPC /
   homomorphic encryption. *(a later enterprise tier, not the MVP)*

Model 2 is the defensible start: it requires no new physics, works with any
data shape, and its claims are auditable with ordinary tooling.

## The moat candidate: zero trust you can *audit*, not just enforce

Meshes connect devices. Zero-trust systems make policy decisions. Almost
nobody produces **signed, verifiable evidence of every operation that crossed
a boundary** — who asked, what was permitted, what exactly left, attested
cryptographically, recomputable by an auditor who does not trust us.

That evidence layer is the differentiator, and it is the part we have already
built and probe-pinned inside MJ:

| Platform requirement | Already proven in MJ |
|---|---|
| Human authority for any departure | Authority Envelope: human-only principals, scope, expiry, revocation (custody, 31 probe assertions) |
| Spend/egress limits that hold under concurrency | BudgetGate atomic reservations; Egress Gate + digest-chained receipt ledger (66 live suites) |
| "Rules enforced in code, not prompts" | Guardrail Manifest — twelve pinned code checks |
| Proof-of-work export | Proof Dossier: digest-stamped evidence file |
| Agents can propose, only humans install | Ledger write-permission matrix |

MJ is the **flagship endpoint workload** of this platform: the runtime that
demonstrates the platform's guarantees on a single machine, before any cloud
exists.

## Roadmap (deliberately staged)

- **Phase 0 — now (desktop seed):** the Egress Gate and capability requests on
  one machine. Every departure needs authority + receipt. *Shipped: MJ 11.14.*
- **Phase 1 — two-node proof:** encrypted laptop↔laptop channel; the relay
  sees coordination and receipts, never payloads.
- **Phase 2 — control plane:** identity, enrollment, policy, discovery,
  session routing, audit rollup.
- **Phase 3 — org console + compliance exports:** the CISO view; GDPR
  minimization evidence as a product surface.

## What must be validated before cloud infrastructure is built

1. **Three design-partner conversations** with platform/CISO buyers: does
   "capability, not data" match a budgeted pain?
2. **Which operations** do real teams actually request across machines?
   (the whitelist is the product)
3. **Identity substrate decision:** roll our own enrollment vs ride an
   existing IdP (SSO/SAML/OIDC) — enterprises will demand the latter.
4. **Willingness to run an agent runtime (MJ) as the endpoint workload** vs
   plain file/operation sharing only.

## What we are NOT claiming

- The control-plane/data-plane pattern is not novel; Tailscale and zero-trust
  architectures established it. Our bet is the *combination*: endpoint-resident
  corporate data + capability sharing + cryptographic receipts + an agent
  runtime that proves what it did.
- Model 2 does not give formal cryptographic privacy guarantees (that is
  model 3's job). It gives *data minimization by architecture*, which is what
  the regulation and the CISO actually ask for first.
- An egress gate alone is not a company. The gate is the seed; the thesis is
  the company. Validation decides which one we are building.

---

*Provenance note: market statements above cite 2026 research — clean-room
platforms (AWS/Snowflake/Salesforce/InfoSum/Decentriq), Tailscale
control/data plane docs, NIST SP 800-207 zero trust, GDPR Art. 25 data
minimization guidance. Figures quoted elsewhere (clean-room costs, vendor
claims) are vendor-reported and unaudited.*
