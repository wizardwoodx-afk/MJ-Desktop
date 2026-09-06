import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/receiptVault.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// src/mission/licensing.ts
var VERIFY_SECRET = "mj-commercial-v1-offline";

// src/mission/receipts.ts
var enc = new TextEncoder();
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
var canon = (o) => JSON.stringify(sortDeep(o));
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(s, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(s));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function buildProofReceipt(args) {
  const { report } = args;
  const raw = [
    { kind: "mission.status", seatId: null, data: { status: report.status, reviewedBySnapshot: report.reviewedBySnapshot === true } },
    ...report.seats.map((s) => ({
      kind: "seat.outcome",
      seatId: s.seatId,
      data: { role: s.role, outcome: s.outcome, verified: s.verified }
    })),
    { kind: "mission.verdict", seatId: null, data: { verified: report.seats.some((s) => s.verified), arms: report.autonomyArms ?? [] } }
  ];
  if (report.gateStatus !== void 0) {
    raw.push({ kind: "gate.verdict", seatId: null, data: { status: report.gateStatus, tier: report.gateTier ?? "n/a" } });
  }
  const events = [];
  let prev = "0".repeat(64);
  let seq2 = 0;
  for (const r of raw) {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const body = { seq: seq2, ts, kind: r.kind, seatId: r.seatId, data: r.data, prev };
    const hash = await sha256hex(canon(body));
    events.push({ ...body, hash });
    prev = hash;
    seq2 += 1;
  }
  const header = {
    mission: args.mission,
    teamId: args.teamId,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    mjVersion: args.mjVersion,
    edition: args.edition,
    autonomyArms: report.autonomyArms ?? []
  };
  const seal = await hmacHex(prev, VERIFY_SECRET);
  return { format: "mj-proof-receipt/1", header, events, seal };
}
async function verifyProofReceipt(rc) {
  if (rc.format !== "mj-proof-receipt/1") return { ok: false, reason: "unknown format" };
  let prev = "0".repeat(64);
  for (const e of rc.events) {
    if (e.prev !== prev) return { ok: false, reason: `chain broken at seq ${e.seq}` };
    const { hash, ...body } = e;
    const expect = await sha256hex(canon(body));
    if (expect !== hash) return { ok: false, reason: `hash mismatch at seq ${e.seq}` };
    prev = hash;
  }
  const seal = await hmacHex(prev, VERIFY_SECRET);
  if (seal !== rc.seal) return { ok: false, reason: "seal mismatch" };
  return { ok: true, events: rc.events.length };
}

// src/mission/receiptVault.ts
var VAULT_CAP = 50;
var STORAGE_KEY = "mj.receiptvault.v1";
var seq = 0;
var ReceiptVault = class {
  records = null;
  ensure() {
    if (this.records) return this.records;
    let loaded = [];
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          loaded = parsed.filter(
            (r) => Boolean(r && typeof r === "object" && r.receipt && Array.isArray(r.receipt.events))
          );
        }
      }
    } catch {
      loaded = [];
    }
    this.records = loaded;
    return loaded;
  }
  persist() {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.ensure()));
    } catch {
    }
  }
  /** Store an issued receipt. Oldest records fall off at VAULT_CAP. */
  issue(input) {
    const rec = {
      id: `rcp_${Date.now().toString(36)}_${(seq++).toString(36)}`,
      issuedAt: (/* @__PURE__ */ new Date()).toISOString(),
      mission: input.mission,
      teamId: input.teamId,
      gateStatus: input.gateStatus,
      gateTier: input.gateTier,
      receipt: input.receipt
    };
    const list = this.ensure();
    list.unshift(rec);
    if (list.length > VAULT_CAP) list.length = VAULT_CAP;
    this.persist();
    return rec;
  }
  list() {
    return [...this.ensure()];
  }
  get(id) {
    return this.ensure().find((r) => r.id === id) ?? null;
  }
  clear() {
    this.records = [];
    this.persist();
  }
  /**
   * Re-verify EVERY stored receipt's chain and seal. This is the vault's reason to exist:
   * tamper with a stored receipt and MJ itself names the broken record.
   */
  async audit() {
    const broken = [];
    const list = this.ensure();
    for (const rec of list) {
      const v = await verifyProofReceipt(rec.receipt);
      if (!v.ok) broken.push({ id: rec.id, reason: v.reason });
    }
    return { total: list.length, valid: list.length - broken.length, broken };
  }
  /**
   * Flat JSONL for SIEM ingestion: one object per line, receipt headers and events both
   * tagged with the vault record id, so a Splunk-style pipeline can group by run.
   * Chain-preserving because every event line is the event verbatim (hash included).
   */
  siemBundle() {
    const lines = [];
    for (const rec of this.ensure()) {
      lines.push(JSON.stringify({ type: "mj.receipt.header", vaultId: rec.id, gateStatus: rec.gateStatus, gateTier: rec.gateTier, format: rec.receipt.format, header: rec.receipt.header, seal: rec.receipt.seal }));
      for (const e of rec.receipt.events) {
        lines.push(JSON.stringify({ type: "mj.receipt.event", vaultId: rec.id, event: e }));
      }
    }
    return `${lines.join("\n")}
`;
  }
  /**
   * The one-pager: what the evidence layer is, which control it serves, how an auditor
   * re-verifies it WITHOUT MJ, and — stated just as plainly — what MJ does not claim.
   */
  onePager(args) {
    const count = this.ensure().length;
    return [
      `# MJ \u2014 Agent Run Evidence & Compliance One-Pager`,
      ``,
      `MJ ${args.mjVersion} \xB7 edition: ${args.edition} \xB7 generated ${(/* @__PURE__ */ new Date()).toISOString()} \xB7 receipts on file: ${count}`,
      ``,
      `## What MJ records`,
      `Every team mission can issue a **Proof Receipt** (\`mj-proof-receipt/1\`): a SHA-256`,
      `hash-chained event log of the facts MJ actually measured \u2014 mission status, each seat's`,
      `role/outcome/verification, and the adversarial-gate verdict \u2014 sealed with HMAC-SHA-256.`,
      `Events are linked (\`prev\` \u2192 \`hash\`), so any edit, insertion or deletion breaks the chain.`,
      ``,
      `## The adversarial verification gate (11.9.9)`,
      `Since 11.9.9, MJ enforces that a run's output is verified by a **different harness than`,
      `the one that wrote it**. Self-verified runs are blocked (STRICT) or marked unverified`,
      `(ADVISORY), and the gate verdict is itself an event in the receipt chain.`,
      ``,
      `## Control mapping`,
      `- EU AI Act Art. 12 (transparency / record-keeping, tamper-evident logging): receipts are`,
      `  append-evident, hash-chained, and exportable as JSONL for SIEM ingestion.`,
      `- Audit trail: each receipt names the team, mission, seat outcomes and MJ version, with no`,
      `  inferred data \u2014 exit codes, snapshot shas and parsed CLI usage only.`,
      `- Export formats: per-receipt JSONL (receiptToJsonl) and flat SIEM bundle (vault.siemBundle).`,
      ``,
      `## External verification (no MJ required)`,
      `1. Take the receipt JSONL. 2. Re-canonicalize each event body (recursive key sort),`,
      `3. re-hash the chain from the 64-zero genesis, 4. re-compute the HMAC seal with the`,
      `published verification secret. MJ ships this exact algorithm (verifyProofReceipt) and any`,
      `auditor can re-implement it from the format alone.`,
      ``,
      `## What MJ does NOT claim`,
      `MJ produces tamper-evident evidence; it is not a certification body. The HMAC seal is a`,
      `published-secret seal (externally re-computable); hardware/Ed25519 signing is on the`,
      `enterprise roadmap and the schema reserves room for it. This is not legal advice.`,
      ``
    ].join("\n");
  }
};
var globalReceiptVault = new ReceiptVault();

// probe/receiptVault.test.ts
var cleanReport = (over = {}) => ({
  status: "completed",
  seats: [
    { seatId: "impl", role: "coder", outcome: "completed", verified: true },
    { seatId: "reviewer", role: "reviewer", outcome: "completed", verified: true }
  ],
  autonomyArms: [],
  reviewedBySnapshot: true,
  ...over
});
async function receipt(over = {}) {
  return buildProofReceipt({
    mission: "mission-vault",
    teamId: "team-vault",
    startedAt: "2026-09-06T10:00:00Z",
    finishedAt: "2026-09-06T10:05:00Z",
    mjVersion: "11.9.9",
    edition: "desktop",
    report: cleanReport(over)
  });
}
describe("receiptVault \u2014 issue, list, cap", () => {
  it("issued receipts are listed newest-first with their gate verdict", async () => {
    const vault = new ReceiptVault();
    const r1 = await receipt();
    const r2 = await receipt({ gateStatus: "PASS", gateTier: "cross-vendor" });
    vault.issue({ mission: "m1", teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: r1 });
    vault.issue({ mission: "m2", teamId: "t", gateStatus: "PASS", gateTier: "cross-vendor", receipt: r2 });
    const list = vault.list();
    assert.equal(list.length, 2);
    assert.equal(list[0].mission, "m2");
    assert.equal(list[0].gateStatus, "PASS");
    assert.equal(list[1].gateStatus, "n/a");
    assert.ok(vault.get(list[0].id));
    assert.equal(vault.get("nope"), null);
  });
  it("the vault trims to VAULT_CAP oldest-first", async () => {
    const vault = new ReceiptVault();
    const rc = await receipt();
    for (let i = 0; i < VAULT_CAP + 3; i++) {
      vault.issue({ mission: `m${i}`, teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: rc });
    }
    assert.equal(vault.list().length, VAULT_CAP);
    assert.equal(vault.list()[0].mission, `m${VAULT_CAP + 2}`);
  });
});
describe("receiptVault \u2014 self-audit", () => {
  it("a clean vault audits 100% valid", async () => {
    const vault = new ReceiptVault();
    vault.issue({ mission: "m1", teamId: "t", gateStatus: "PASS", gateTier: "cross-vendor", receipt: await receipt({ gateStatus: "PASS", gateTier: "cross-vendor" }) });
    vault.issue({ mission: "m2", teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: await receipt() });
    const a = await vault.audit();
    assert.equal(a.total, 2);
    assert.equal(a.valid, 2);
    assert.deepEqual(a.broken, []);
  });
  it("a tampered stored receipt is detected and named by id", async () => {
    const vault = new ReceiptVault();
    const good = await receipt();
    const bad = await receipt();
    bad.events[1] = { ...bad.events[1], data: { ...bad.events[1].data, verified: false } };
    const g = vault.issue({ mission: "good", teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: good });
    const b = vault.issue({ mission: "bad", teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: bad });
    const a = await vault.audit();
    assert.equal(a.valid, 1);
    assert.equal(a.broken.length, 1);
    assert.equal(a.broken[0].id, b.id);
    assert.notEqual(a.broken[0].id, g.id);
    assert.match(a.broken[0].reason, /hash|chain/);
  });
});
describe("receiptVault \u2014 SIEM export", () => {
  it("bundle is flat JSONL: one header line and N event lines per receipt, hashes intact", async () => {
    const vault = new ReceiptVault();
    const r1 = await receipt();
    const r2 = await receipt({ gateStatus: "PASS", gateTier: "cross-vendor" });
    vault.issue({ mission: "m1", teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: r1 });
    vault.issue({ mission: "m2", teamId: "t", gateStatus: "PASS", gateTier: "cross-vendor", receipt: r2 });
    const lines = vault.siemBundle().trim().split("\n").map((l) => JSON.parse(l));
    const headers = lines.filter((l) => l.type === "mj.receipt.header");
    const events = lines.filter((l) => l.type === "mj.receipt.event");
    assert.equal(headers.length, 2);
    assert.equal(events.length, r1.events.length + r2.events.length);
    const firstEvent = events[0];
    const rec = vault.get(firstEvent.vaultId);
    assert.ok(rec);
    assert.equal(firstEvent.event.hash, rec.receipt.events[0].hash);
    const gated = headers.find((h) => h.header.mission === "mission-vault" && h.gateStatus === "PASS");
    assert.ok(gated);
  });
});
describe("receiptVault \u2014 the one-pager", () => {
  it("states the control mapping AND the honest non-claims", () => {
    const vault = new ReceiptVault();
    const page = vault.onePager({ mjVersion: "11.9.9", edition: "desktop" });
    assert.match(page, /EU AI Act Art\. 12/);
    assert.match(page, /different harness/);
    assert.match(page, /verifyProofReceipt/);
    assert.match(page, /not a certification body/);
    assert.match(page, /not legal advice/);
  });
});
describe("receipts \u2014 gate event back-compat", () => {
  it("an ungated report keeps the exact pre-11.9.9 event shape (4 events, no gate event)", async () => {
    const rc = await receipt();
    assert.equal(rc.events.length, 4);
    assert.ok(!rc.events.some((e) => e.kind === "gate.verdict"));
  });
  it("a gated report appends exactly one gate.verdict event, in-chain", async () => {
    const rc = await receipt({ gateStatus: "PASS", gateTier: "cross-vendor" });
    assert.equal(rc.events.length, 5);
    const gate = rc.events.find((e) => e.kind === "gate.verdict");
    assert.ok(gate);
    assert.equal(gate.data.status, "PASS");
    assert.equal(gate.data.tier, "cross-vendor");
    const i = rc.events.indexOf(gate);
    assert.equal(gate.prev, rc.events[i - 1].hash);
  });
});
