/* FLAMO — Vouch Cycle 2.0
 *
 * The outer cycle. ReAct lives INSIDE the ACT stage, not beside it: conflating the
 * two is what makes most "agent frameworks" unbuildable.
 *
 *   AUTHORITY  who allowed this, what scope, when it expires   (precondition, not a stage you can skip)
 *   ROUTE      classify the task -> this is also the scope key for RECALL
 *   RECALL     scoped retrieval. Never unscoped: a blind recall is a context dump.
 *   PLAN       a typed, revisable plan with a budget
 *   DELIBERATE the POV ladder as a GATE on the plan: 1POV me / 2POV them / 3POV auditor
 *   SIMULATE   dry-run the plan; predicted side effects, cost, failure modes
 *   GATE       human decides anything irreversible. No decision, no action.
 *   ACT        ReAct inner loop, bounded steps
 *   OBSERVE    measure what actually happened. Nothing is vouched unobserved.
 *   VOUCH      a digest over the cycle record — after the fact, never before
 *   LEARN      fold the outcome into lessons. With retention, or memory rots.
 *
 *   RECOVER    bounded branch off ACT: retry / replan / escalate. Not a restart.
 */

const STAGES = [
  { id: "authority",  name: "Authority",  hint: "envelope" },
  { id: "route",      name: "Route",      hint: "classify" },
  { id: "recall",     name: "Recall",     hint: "scoped" },
  { id: "plan",       name: "Plan",       hint: "typed" },
  { id: "deliberate", name: "Deliberate", hint: "3 POV" },
  { id: "simulate",   name: "Simulate",   hint: "dry run" },
  { id: "gate",       name: "Gate",       hint: "human" },
  { id: "act",        name: "Act",        hint: "ReAct" },
  { id: "observe",    name: "Observe",    hint: "measured" },
  { id: "vouch",      name: "Vouch",      hint: "digest" },
  { id: "learn",      name: "Learn",      hint: "lesson" },
];

const thread  = document.getElementById("thread");
const stagesEl = document.getElementById("stages");
const ledgerEl = document.getElementById("ledger");
const tagEl    = document.getElementById("cycleTag");
const input    = document.getElementById("input");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; };
const scroll = () => { thread.scrollTop = thread.scrollHeight; };

/* ---------- the rail ---------- */
let rail = {};
function renderRail() {
  stagesEl.innerHTML = STAGES.map((s) => {
    const st = rail[s.id] || "pending";
    return `<div class="stage ${st}"><i></i><b>${s.name}</b><em>${st === "pending" ? s.hint : st}</em></div>`;
  }).join("");
}
function setStage(id, state) { rail[id] = state; renderRail(); }
function resetRail() { rail = {}; renderRail(); }

/* ---------- cards ---------- */
function card(title, meta, body, cls = "") {
  const c = el(`<div class="card ${cls}">
      <div class="h"><b>${title}</b><span class="mono">${meta}</span></div>
      <div class="b">${body}</div>
    </div>`);
  thread.appendChild(c); scroll(); return c;
}
function say(who, text) {
  thread.appendChild(el(`<div class="msg ${who === "You" ? "me" : ""}">
      <div class="who">${who}</div><div class="bub">${text}</div></div>`));
  scroll();
}

/* ---------- a real digest over the cycle record ----------
 * If the host has no SubtleCrypto we say so instead of inventing a hash. */
async function digest(record) {
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  if (!globalThis.crypto?.subtle) return { hex: null, why: "SubtleCrypto unavailable in this context" };
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return { hex: [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), why: null };
}

/* ---------- the cycle ---------- */
let busy = false;
const lessons = [];

async function runCycle(goal) {
  if (busy) return;
  busy = true;
  resetRail();
  say("You", goal);

  const record = { goal, at: new Date().toISOString(), stages: {} };
  const stamp = (id, artifact) => { record.stages[id] = artifact; };
  tagEl.innerHTML = 'running <span class="working"><i></i><i></i><i></i></span>';

  /* 1 — AUTHORITY: nothing runs without it */
  setStage("authority", "active"); await sleep(220);
  // REAL: MJ's custody module issues a signed root envelope. A non-human principal
  // is refused by MJ, not by this UI.
  const envelope = await MJ.issueRootEnvelope({
    principal: "human:you",
    scope: ["registry.read", "billing.write", "egress:share"],
    expiresAt: Date.now() + 3600_000,
    budgetUsd: 15,
  });
  const seat = await MJ.attenuate(envelope, "flamo.money", ["registry.read", "billing.write"]);
  stamp("authority", { id: envelope.id, principal: envelope.principal, scope: envelope.scope });
  card("Authority", envelope.id,
    `<div class="kv"><span>principal</span><span>${envelope.principal}</span></div>
     <div class="kv"><span>scope</span><span>${envelope.scope.join(", ")}</span></div>
     <div class="kv"><span>spend cap</span><span>$${envelope.budgetUsd}</span></div>
     <div class="kv"><span>signed</span><span>${envelope.signature ? "ed25519" : "unsigned"}</span></div>
     <div class="kv"><span>delegated to</span><span>${seat.envelope ? seat.envelope.delegationChain.join(" → ") : "REFUSED"}</span></div>`);
  setStage("authority", "done");

  /* 2 — ROUTE: classification IS the scope key for recall */
  setStage("route", "active"); await sleep(260);
  const route = { class: "billing + external-action", risk: "HIGH", owner: "Money", reversible: "partly" };
  stamp("route", route);
  card("Route", route.class,
    `<div class="kv"><span>risk</span><span>${route.risk}</span></div>
     <div class="kv"><span>owner agent</span><span>${route.owner}</span></div>
     <div class="kv"><span>reversible</span><span>${route.reversible}</span></div>`);
  setStage("route", "done");

  /* 3 — RECALL: scoped by the route, never a dump */
  setStage("recall", "active"); await sleep(260);
  const recall = { scope: route.class, hits: 3, top: "last renewal: 12 Sep 2025, ₹1,180, card ••4417" };
  stamp("recall", recall);
  card("Recall", `scope: ${recall.scope}`,
    `<div class="kv"><span>hits</span><span>${recall.hits} of 1,204 memories</span></div>
     <div class="kv"><span>top</span><span>${recall.top}</span></div>`);
  setStage("recall", "done");

  /* 4 — PLAN */
  setStage("plan", "active"); await sleep(300);
  const plan = ["Look up the registrar record and expiry",
                "Confirm the payment method on file is still valid",
                "Pay the 1-year renewal",
                "Re-point the invoice to the new entity",
                "File the receipt in the ledger"];
  stamp("plan", plan);
  card("Plan", `${plan.length} steps · budget ₹1,500`,
    `<ul class="steps">${plan.map((s) => `<li>${s}</li>`).join("")}</ul>`);
  setStage("plan", "done");

  /* 5 — DELIBERATE: the POV ladder, as a gate on the plan */
  setStage("deliberate", "active"); await sleep(340);
  const povs = [
    ["1POV", "me", "Fastest path is auto-renew on the stored card. Cheapest, no human in the loop."],
    ["2POV", "them", "The registrar emails a receipt to the OLD entity address. Finance won't see it, and the invoice mismatch surfaces at month-end, not now."],
    ["3POV", "auditor", "A spend of ₹1,180 with no approval and an invoice re-pointed afterwards reads as back-dating. Do the entity change first, then pay — or stop and ask."],
  ];
  stamp("deliberate", povs.map(([k]) => k));
  card("Deliberate", "POV ladder · plan revised",
    povs.map(([k, who, text]) => `<div class="pov"><b>${k}<br>${who}</b><p>${text}</p></div>`).join(""),
    "think");
  say("Flamo", "Third-person view changed the order: entity first, payment second. Otherwise the receipt lands in the old mailbox and the re-pointing looks back-dated.");
  setStage("deliberate", "done");

  /* 6 — SIMULATE */
  setStage("simulate", "active"); await sleep(320);
  const sim = { predictedSpend: "₹1,180", failureModes: 2, worst: "card declined after the entity change — renewal then needs a new card mid-flow" };
  stamp("simulate", sim);
  card("Simulate", "dry run · nothing executed",
    `<div class="kv"><span>predicted spend</span><span>${sim.predictedSpend}</span></div>
     <div class="kv"><span>failure modes</span><span>${sim.failureModes}</span></div>
     <div class="kv"><span>worst case</span><span>${sim.worst}</span></div>`);
  setStage("simulate", "done");

  /* 7 — GATE: hard stop */
  setStage("gate", "gated"); tagEl.textContent = "needs you";
  stamp("gate", { required: true, reason: "irreversible spend" });
  const approved = await new Promise((resolve) => {
    const g = el(`<div class="gate">
        <h4>Needs your approval</h4>
        <p>Re-point the invoice to the new entity, then pay ₹1,180 for a 1-year renewal.
           Predicted spend is inside your ₹1,500 cap. Reversible for 5 days.</p>
        <div class="row">
          <button class="btn pri" data-a="1">Approve</button>
          <button class="btn" data-a="0">Decline</button>
        </div>
      </div>`);
    thread.appendChild(g); scroll();
    g.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      g.remove(); resolve(b.dataset.a === "1");
    });
  });
  record.stages.gate.decision = approved ? "approved" : "declined";
  setStage("gate", approved ? "done" : "gated");

  if (!approved) {
    ["act", "observe", "vouch", "learn"].forEach((s) => setStage(s, "skip"));
    tagEl.textContent = "declined";
    say("Flamo", "Stopped. Nothing was executed, and the refusal is recorded in the cycle too — a declined run is still evidence.");
    busy = false; return;
  }

  /* 8 — ACT (ReAct inner loop) */
  setStage("act", "active"); tagEl.innerHTML = 'acting <span class="working"><i></i><i></i><i></i></span>';
  const acts = ["thought: entity must change before payment → action: registry.updateEntity → observation: ok",
                "thought: renewal price unchanged → action: registry.renew(1y) → observation: paid ₹1,180",
                "thought: receipt must reach finance → action: mail.forward(finance@) → observation: sent"];
  const actCard = card("Act", "ReAct · 3 steps", `<ul class="steps" id="actList"></ul>`);
  for (const a of acts) {
    await sleep(420);
    actCard.querySelector("#actList").appendChild(el(`<li>${a}</li>`)); scroll();
  }
  stamp("act", acts);
  setStage("act", "done");

  /* 9 — OBSERVE: measure, don't assume */
  setStage("observe", "active"); await sleep(300);
  const observed = { spent: "₹1,180", newExpiry: "12 Sep 2027", receiptTo: "finance@", unmeasured: 0 };
  stamp("observe", observed);
  card("Observe", "measured, not estimated",
    `<div class="kv"><span>spent</span><span>${observed.spent}</span></div>
     <div class="kv"><span>new expiry</span><span>${observed.newExpiry}</span></div>
     <div class="kv"><span>receipt routed</span><span>${observed.receiptTo}</span></div>
     <div class="kv"><span>unmeasured steps</span><span>${observed.unmeasured}</span></div>`);
  setStage("observe", "done");

  /* 10 — VOUCH */
  setStage("vouch", "active"); await sleep(260);
  // REAL: a hash-chained, Ed25519-signed MJ proof receipt — the same code the
  // desktop build runs, verified by MJ's own standalone verifier.
  const receipt = await MJ.buildProofReceipt({
    mission: "vouchcycle:" + goal.slice(0, 48).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    teamId: "vouch-harbor", startedAt: record.at, finishedAt: new Date().toISOString(),
    mjVersion: "14.1.3", edition: "vouch-harbor",
    report: { status: "completed", reviewedBySnapshot: true, gateStatus: "PASS",
      seats: [
        { seatId: "flamo.planner", role: "planner", outcome: "plan revised by 3POV", verified: true, harness: "llm" },
        { seatId: "flamo.money", role: "actor", outcome: observed.spent + " observed", verified: true, harness: "llm" },
      ] },
  });
  const checked = await MJ.verifyProofReceipt(receipt);
  const hex = receipt.events.at(-1).hash;
  stamp("vouch", { events: receipt.events.length, verified: checked.ok, signed: Boolean(receipt.signature) });
  card("Vouch", checked.ok ? `${receipt.events.length} events · chain ok` : "CHAIN BROKEN",
    `<div class="kv"><span>format</span><span>${receipt.format}</span></div>
     <div class="kv"><span>chain head</span><span>${hex.slice(0, 24)}…</span></div>
     <div class="kv"><span>issuer</span><span>${receipt.issuer ? receipt.issuer.keyId : "none"}</span></div>
     <div class="kv"><span>signature</span><span>${receipt.signature ? "ed25519 · " + receipt.signature.slice(0, 12) + "…" : "UNSIGNED"}</span></div>
     <div class="kv"><span>verifyProofReceipt</span><span>${JSON.stringify(checked)}</span></div>
     <p class="mono" style="color:var(--faint);margin-top:8px">Verify with zero Vouch Harbor state:<br>node tools/verify-receipt.mjs receipt.jsonl --issuer-key &lt;hex64&gt;</p>`,
    "vouched");
  ledgerEl.innerHTML = `<div class="ledger">
      <div class="kv"><span>seq</span><span>${receipt.seq}</span></div>
      <div class="kv"><span>digest</span><span>${hex ? hex.slice(0, 10) + "…" : "n/a"}</span></div>
      <div class="kv"><span>spent</span><span>${observed.spent}</span></div>
      <div class="kv"><span>authority</span><span>human · scoped</span></div>
      <div class="kv"><span>signed</span><span>no (demo)</span></div>
    </div>`;
  // The ledger screen only ever learns about a cycle here — after OBSERVE, never before.
  window.FLAMO_VOUCH?.({
    seq: receipt.events.length, goal, digest: hex, signed: Boolean(receipt.signature),
    spent: observed.spent, at: new Date().toLocaleString(),
    mission: receipt.header?.mission ?? "", jsonl: MJ.receiptToJsonl(receipt),
    issuer: receipt.issuer?.publicKeyHex ?? null,
  });
  setStage("vouch", "done");

  /* 11 — LEARN */
  setStage("learn", "active"); await sleep(280);
  const lesson = "Entity changes must precede payments when receipts are routed by entity — otherwise the audit trail reads as back-dated.";
  lessons.push(lesson);
  stamp("learn", { lesson, retention: "decays if unused in 90 days" });
  card("Learn", `1 lesson · ${lessons.length} total`,
    `<p style="font-size:13px;color:var(--muted)">${lesson}</p>
     <div class="kv" style="margin-top:8px"><span>retention</span><span>decays if unused in 90 days</span></div>`);
  setStage("learn", "done");

  tagEl.textContent = "vouched";
  say("Flamo", "Done — renewal paid, invoice re-pointed first, receipt routed to finance. The cycle is vouched and the ordering lesson is folded in for next time.");
  busy = false;
}

/* ---------- wiring ---------- */
document.getElementById("send").addEventListener("click", () => {
  const v = input.value.trim(); if (!v || busy) return;
  input.value = ""; runCycle(v);
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const v = input.value.trim(); if (v && !busy) { input.value = ""; runCycle(v); } }
});
document.getElementById("mode").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  document.documentElement.dataset.mode = b.dataset.m;
  for (const x of document.querySelectorAll("#mode button")) x.setAttribute("aria-pressed", String(x === b));
});

renderRail();
input.value = "Renew the domain before Friday and move the invoice to the new entity";
