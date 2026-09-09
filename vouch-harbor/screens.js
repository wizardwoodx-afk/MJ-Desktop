/* FLAMO — the three non-thread screens, plus nav and the vouch ledger.
 *
 * Honesty rule kept everywhere: a routine that has never run says "never run",
 * a tool that is not connected says "not connected". Nothing implies capability
 * the build does not have.
 */

const ROUTINES = [
  { name: "Inbox triage", cron: "30 7 * * 1-5", state: "never run", note: "needs the mail tool connected" },
  { name: "Domain & invoice watch", cron: "0 9 * * 1", state: "never run", note: "would gate on any spend" },
  { name: "Price drift check", cron: "0 */6 * * *", state: "never run", note: "read-only, no gate needed" },
];

const TOOLS = [
  { name: "registry", kind: "http", state: "not connected", risk: "can spend" },
  { name: "mail", kind: "imap", state: "not connected", risk: "can send" },
  { name: "billing", kind: "http", state: "not connected", risk: "read-only" },
  { name: "calendar", kind: "caldav", state: "not connected", risk: "can write" },
  { name: "files", kind: "local", state: "sandboxed", risk: "scoped paths" },
];

/* ---------- the ledger: real persistence, no invented history ----------
 * Native build: a JSON file in the app data dir via the Tauri bridge.
 * Browser: localStorage. FLAMO.Ledger reports which one it actually used. */

async function ledgerRows() {
  const rows = await window.FLAMO.Ledger.load();
  const host = document.getElementById("ledgerList");
  document.getElementById("navLedger").textContent = String(rows.length);
  if (!rows.length) {
    host.innerHTML = `<p class="empty">Nothing vouched yet. Run a cycle in Thread — a receipt lands here only after an action was observed.</p>
      <p class="empty" style="padding-top:6px">stored in: ${window.FLAMO.Ledger.where}</p>`;
    return;
  }
  host.innerHTML = rows.map((r, i) => `
    <div class="card vouched">
      <div class="h"><b>${r.goal}</b><span class="mono">${r.events ?? r.seq} events</span></div>
      <div class="b">
        <div class="kv"><span>mission</span><span>${r.mission || "—"}</span></div>
        <div class="kv"><span>chain head</span><span>${r.digest ? r.digest.slice(0, 18) + "…" : "unavailable"}</span></div>
        <div class="kv"><span>spent</span><span>${r.spent}</span></div>
        <div class="kv"><span>signature</span><span>${r.signed ? "ed25519" : "UNSIGNED"}</span></div>
        <div class="kv"><span>at</span><span>${r.at}</span></div>
        ${r.jsonl ? `<div class="row" style="margin-top:10px">
            <button class="btn" data-dl="${i}">Download receipt.jsonl</button>
            <button class="btn" data-key="${i}">Copy issuer key</button>
          </div>` : ""}
      </div>
    </div>`).join("") +
    `<p class="empty" style="padding:4px 0">stored in: ${window.FLAMO.Ledger.where}. Verify any receipt with zero
      Vouch Harbor state: <span class="mono">node tools/verify-receipt.mjs receipt.jsonl --issuer-key &lt;hex64&gt;</span></p>`;

  host.querySelectorAll("[data-dl]").forEach((b) => b.addEventListener("click", () => {
    const r = rows[Number(b.dataset.dl)];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([r.jsonl], { type: "application/x-ndjson" }));
    a.download = "receipt.jsonl"; a.click(); URL.revokeObjectURL(a.href);
  }));
  host.querySelectorAll("[data-key]").forEach((b) => b.addEventListener("click", async () => {
    const r = rows[Number(b.dataset.key)];
    if (r.issuer) { try { await navigator.clipboard.writeText(r.issuer); b.textContent = "Copied"; } catch { b.textContent = r.issuer.slice(0, 12) + "…"; } }
  }));
}

/** Called by cycle.js after OBSERVE, never before. */
window.FLAMO_VOUCH = async function (row) {
  const rows = await window.FLAMO.Ledger.load();
  rows.unshift(row);
  await window.FLAMO.Ledger.save(rows);
  await ledgerRows();
};

/* ---------- routines & tools ---------- */
function paintRoutines() {
  const cron = window.VH_CRON;
  const rows = ROUTINES.map((r) => {
    let next = "—", err = null;
    if (cron) {
      try { next = cron.nextRun(r.cron).toLocaleString(); }
      catch (e) { err = String(e.message); }
    }
    return `<div class="card">
      <div class="h"><b>${r.name}</b><span class="mono">${err ? "invalid" : r.state}</span></div>
      <div class="b">
        <div class="kv"><span>expression</span><span>${r.cron}</span></div>
        <div class="kv"><span>next run</span><span>${err ? "refused" : next}</span></div>
        ${err ? `<div class="kv"><span>why</span><span>${err.slice(0, 60)}…</span></div>` : ""}
        <div class="kv"><span>note</span><span>${r.note}</span></div>
      </div>
    </div>`;
  }).join("");

  document.getElementById("routineList").innerHTML = rows +
    `<p class="empty" style="padding:4px 0">Next-run times are computed by the real cron parser
      (<span class="mono">cron.js</span>, 17/17 tests). Nothing is fired yet — this build has no
      daemon, and FLAMO will not show a timer it is not running.</p>`;
}

function paintTools() {
  document.getElementById("toolList").innerHTML = TOOLS.map((t) => `
    <div class="card">
      <div class="h"><b>${t.name}</b><span class="mono">${t.state}</span></div>
      <div class="b">
        <div class="kv"><span>transport</span><span>${t.kind}</span></div>
        <div class="kv"><span>risk class</span><span>${t.risk}</span></div>
      </div>
    </div>`).join("");
}

/* ---------- nav ---------- */
const VIEWS = ["thread", "routines", "tools", "ledger"];
document.querySelectorAll(".nav[data-view]").forEach((n) => {
  n.addEventListener("click", () => {
    const v = n.dataset.view;
    for (const name of VIEWS) document.getElementById("view-" + name).hidden = name !== v;
    document.querySelectorAll(".nav[data-view]").forEach((x) => x.classList.toggle("on", x === n));
  });
});

paintRoutines();
window.addEventListener('vh:cron-ready', paintRoutines);
paintTools();
ledgerRows();
window.FLAMO.appInfo().then((i) => {
  const f = document.querySelector('.sidefoot .mono');
  if (f) f.textContent = i.native ? `native v${i.version}` : `browser v${i.version}`;
});
