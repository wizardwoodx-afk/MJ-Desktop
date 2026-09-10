# Vouch Harbor — 90-second demo script

*The demo is the product. No slides during it. Run the desktop app (or the
web edition if desktop isn't possible in the room). The three beats:
**talk to it → it asks → it proves it.***

---

### Beat 1 — the colleague (0:00–0:25)

> "This is ROGUE — a named, persistent teammate. I don't configure
> workflows; I just message it."

*(Type into the Teammate door:)*

```
Remember: I'm Sree, and my project is Vouch Harbor.
```

> "It stored that on *this* machine — see the rail. I can read it, delete
> it. Nothing about me lives on a vendor's VM."

### Beat 2 — the human gate (0:25–0:55)

> "Now a job that touches anything: it asks. That's the whole product in one
> motion."

```
Write a file called brief.txt: Vouch Harbor — every job vouched
```

*(The run PAUSES. First a **SIMULATE** card: ROGUE has dry-run the write and
signed a prediction — "brief.txt will exist in the local workspace with N
chars" — then the approval card: **HUMAN GATE — write a file to the local
workspace. [Approve] [Deny]**)*

> "It imagines the job before it does it — and it asks. A chatbot does
> neither."

*(Click **Approve** — the file lands in the Workspace rail, the VOUCH check
shows the prediction **matched** reality, and the receipt step appears:
`RECEIPT · 5+ events · ed25519 signed`. Try it once more on an existing
file and the simulation flags the overwrite as a warning before the gate.)*

### Beat 3 — the vouch (0:55–1:30)

> "Every finished job mints a receipt. This one just did."

*(In the rail: click **verify (offline)** → `verified ok · 4 events`. Click
**export .jsonl** → file downloads.)*

> "And here's the part that matters to your CISO: I can verify that file on
> a machine that has never run Vouch Harbor. Zero state. Let me show the
> honest version —"

*(In a terminal, tamper one byte of an exported event field, re-run:)*

```
node tools/verify-receipt.mjs receipt.jsonl
# → CHAIN BROKEN at seq 2
```

> "Nothing faked. Nothing hidden. That's the product."

*(Optional, if a crew is composed — 15 seconds:)*

```
Dispatch a mission: summarize what this runtime is
```

> "Same gate. Real crew. Same receipt. One engine, one protocol."

---

## The one-liner after the demo

> "Grok Bot puts your teammates on their cloud. Vouch Harbor puts the
> teammate on your machine — and signs everything it did. We're raising a
> pre-seed to make 'agent receipts' a procurement checkbox."

## Stage risks & fallbacks

- **No network in the room:** everything in this demo is offline (simulated
  brain, local KB, local receipts). It's designed for that.
- **Ed25519 refused by the runtime:** the receipt says so in writing
  (`signatureNote`) and still verifies via chain + seal. Never hide it —
  narrate it. It's a feature.
- **Dispatch with no crew:** it refuses honestly. If you want the beat,
  compose a 2-seat crew before the demo (Mission Loop door, 30 seconds).
- **Don't** demo the simulated brain's limits as if they were the brain. If
  asked: "15.0 ships the offline brain so the product works with zero
  accounts; 15.1 plugs any provider into the same seam — same receipts."
