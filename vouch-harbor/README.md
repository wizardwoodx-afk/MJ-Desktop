# Vouch Harbor v0.1 — the agent whose every action is vouched for

**FLAMO** is the agent you talk to. **MJ 14.1.3** is the proof core underneath it.
The merge is real, not a plan: `mj-core.js` is MJ's own `custody`, `receipts`,
`signing`, `egress` and `riskPolicy` modules bundled for the browser, and the
cycle calls them.

What that means concretely — when a cycle vouches, the app:

1. issues a **real signed authority envelope** (`MJ.issueRootEnvelope`, human
   principal or MJ refuses) and attenuates it for the acting seat;
2. builds a **real `mj-proof-receipt/2`** — hash-chained, Ed25519-signed;
3. verifies it (`MJ.verifyProofReceipt`), and a tampered receipt fails;
4. stores it so you can **download `receipt.jsonl`** and verify it anywhere:

```
node MJ-14.1.3/tools/verify-receipt.mjs receipt.jsonl --issuer-key <hex64>
# VALID: mj-proof-receipt/2, 4 event(s). Issuer AUTHENTICATED.  (exit 0)
```

Zero Vouch Harbor state required. That is the whole product.

## Run it

```
cd flamo
python3 -m http.server 5174
```

Open http://localhost:5174 — no build step, no dependencies, no network.

## What this build is, and is not

**Is:** the full interaction model with a **real proof core**. The 11-stage Vouch
Cycle as a live state machine, the POV ladder changing a plan, a hard human gate,
genuine signed receipts, tamper detection, and a ledger you can export and audit.

**Is not:** a connected agent. No tool is connected, no scheduler runs, and no
action touches the world. The UI says so everywhere rather than implying
capability it does not have — a routine that never ran reads `never run`, a tool
that is not connected reads `not connected`.

## Proving the merge

```
node tools/merge-e2e.mjs
```

Issues an envelope, refuses a non-human principal, refuses scope growth, builds
and verifies a signed receipt, and refuses egress without authority. Then hand
the receipt to MJ's standalone verifier — see above.

## The Vouch Cycle 2.0

```
AUTHORITY → ROUTE → RECALL → PLAN → DELIBERATE(1POV/2POV/3POV) → SIMULATE
   → GATE → ACT⟲ReAct → OBSERVE → VOUCH → LEARN
                    ↓ fail
                 RECOVER (bounded)
```

Two loops, not one. The chain above is the **outer cycle**; ReAct
(thought → action → observation, bounded) lives **inside** ACT. Conflating them
is why most agent frameworks never ship.

| Stage | Emits | Refuses to run when |
|---|---|---|
| AUTHORITY | envelope: principal, scope, spend cap, expiry | principal is not human; envelope expired |
| ROUTE | task class, risk, owner agent | — |
| RECALL | scoped hits | no scope key (a blind recall is a context dump) |
| PLAN | typed steps + budget | budget unbounded |
| DELIBERATE | 1POV / 2POV / 3POV verdicts, plan revision | plan object missing |
| SIMULATE | predicted spend, failure modes, worst case | plan not typed |
| GATE | human decision | action is reversible → gate is skipped, not faked |
| ACT | ReAct transcript, bounded steps | gate undecided |
| OBSERVE | measured outcome, `unmeasured` count | — |
| VOUCH | digest over the cycle record | **nothing was observed** |
| LEARN | lesson + retention rule | run was simulated (simulations teach nothing) |
| RECOVER | bounded retry / replan / escalate | retry budget exhausted → escalate to human |

### Why ROUTE precedes RECALL

Retrieval must be scoped. The route classification *is* the scope key; recall
without it dumps memory into context — the exact failure MJ's `memory.ts`
refuses by contract.

### Why PLAN precedes DELIBERATE

Deliberation needs an artifact to attack. Thinking before planning is narration;
thinking after planning is a **gate**. That difference is the whole reason the
POV ladder is mechanical instead of decorative.

### Why OBSERVE precedes VOUCH

You cannot vouch an action you did not measure. MJ's discipline — *measured, or
`unmeasured`* — is what makes a receipt worth anything.

## Design system — Verdigris

Four tokens per mode. Every other tone is derived with `color-mix`, so the
palette cannot rot out of sync with itself.

| | Ground | Surface | Ink | Signal |
|---|---|---|---|---|
| Light | `#F0F0EC` | `#F8F8F5` | `#1B1E1C` | `#3F7A6A` |
| Dark  | `#131614` | `#1A1E1B` | `#E4E7E2` | `#6FB79F` |

**Banned**, because they are what make an interface read as machine-made:
gradient text and buttons · backdrop-blur glass · glowing borders and coloured
shadows · emoji as icons · more than one accent · pill rounding everywhere ·
idle animation.

**Used instead:** hairlines rather than shadows · one signal colour under 5% of
the surface · 6px radii · flat fills · typographic hierarchy · 140–240ms motion
on transform/opacity only · `prefers-reduced-motion` honoured.

## Files

```
index.html      four views: Thread, Routines, Tools, Ledger
flamo.css       the Verdigris token system and every component rule
motion.css      the motion layer (8 keyframes, reduced-motion safe)
cycle.js        the Vouch Cycle state machine
screens.js      Routines / Tools / Ledger + nav + receipt export
flamo-ipc.js    Tauri bridge with an honest browser fallback
mj-core.js      MJ 14.1.3 proof core, bundled (custody/receipts/signing/egress/risk)
tools/merge-e2e.mjs   the merge regression test
src-tauri/      the Tauri v2 native shell (see BUILD-DESKTOP.md)
```
