import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/receiptVault.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// src/mission/licensing.ts
var VERIFY_SECRET = "mj-commercial-v1-offline";

// src/mission/signing.ts
var STORAGE_KEY = "mj.issuerkey.v1";
var cached = null;
function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function ed25519Available() {
  try {
    return typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof crypto.subtle.generateKey === "function";
  } catch {
    return false;
  }
}
async function ensureIssuerIdentity() {
  if (cached) return cached;
  if (!ed25519Available()) return null;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity = {
          keyId: `mj-issuer-${stored.publicKeyHex.slice(0, 12)}`,
          publicKeyHex: stored.publicKeyHex,
          createdAt: stored.createdAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
        };
        cached = { identity, privateKey };
        return cached;
      }
    }
  } catch {
  }
  try {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKeyHex = toHex(rawPub);
    const identity = {
      keyId: `mj-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt }));
    } catch {
    }
    cached = { identity, privateKey: pair.privateKey };
    return cached;
  } catch {
    return null;
  }
}
async function signHexDigest(hexDigest) {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  try {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, holder.privateKey, fromHex(hexDigest)));
    return { alg: "EdDSA", keyId: holder.identity.keyId, publicKeyHex: holder.identity.publicKeyHex, sigHex: toHex(sig) };
  } catch {
    return null;
  }
}
async function signChainHash(chainHashHex) {
  return signHexDigest(chainHashHex);
}
async function verifyIssuerSignature(chainHashHex, sigHex, publicKeyHex) {
  if (!ed25519Available()) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", fromHex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromHex(sigHex), fromHex(chainHashHex));
  } catch {
    return false;
  }
}

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
  const seatEvents = [];
  for (const s of report.seats) {
    const data = { role: s.role, outcome: s.outcome, verified: s.verified };
    if (s.harness) {
      data.harness = s.harness;
      data.identity = await sha256hex(`${s.seatId}|${s.role}|${s.harness}`);
    }
    seatEvents.push({ kind: "seat.outcome", seatId: s.seatId, data });
  }
  const raw = [
    { kind: "mission.status", seatId: null, data: { status: report.status, reviewedBySnapshot: report.reviewedBySnapshot === true } },
    ...seatEvents,
    { kind: "mission.verdict", seatId: null, data: { verified: report.seats.some((s) => s.verified), arms: report.autonomyArms ?? [] } }
  ];
  if (report.gateStatus !== void 0) {
    raw.push({
      kind: "gate.verdict",
      seatId: null,
      data: {
        status: report.gateStatus,
        tier: report.gateTier ?? "n/a",
        // 11.10 — the writer→snapshot→verifier evidence link, in the chain itself.
        snapshotSha: report.gateSnapshotSha ?? null
      }
    });
  }
  if (report.arenaGate) {
    raw.push({
      kind: "arena.gate",
      seatId: null,
      data: {
        gate: report.arenaGate.gate,
        digest: report.arenaGate.digest,
        defended: report.arenaGate.defended,
        total: report.arenaGate.total,
        summary: report.arenaGate.summary
      }
    });
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
  const sig = await signChainHash(prev);
  if (sig) {
    return {
      format: "mj-proof-receipt/2",
      header,
      events,
      seal,
      issuer: { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex },
      signature: sig.sigHex
    };
  }
  return {
    format: "mj-proof-receipt/2",
    header,
    events,
    seal,
    issuer: null,
    signature: null,
    signatureNote: "This runtime has no Ed25519 (WebCrypto refused or is absent). The receipt is tamper-evident via its HMAC seal but NOT issuer-signed."
  };
}
async function verifyProofReceipt(rc) {
  if (rc.format !== "mj-proof-receipt/1" && rc.format !== "mj-proof-receipt/2") return { ok: false, reason: "unknown format" };
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
  if (rc.format === "mj-proof-receipt/2" && rc.signature) {
    if (!rc.issuer?.publicKeyHex) return { ok: false, reason: "receipt is signed but carries no issuer public key" };
    const ok = await verifyIssuerSignature(prev, rc.signature, rc.issuer.publicKeyHex);
    if (!ok) return { ok: false, reason: `issuer signature verification FAILED for chain head ${prev}` };
  }
  return { ok: true, events: rc.events.length };
}

// src/mission/receiptVault.ts
var VAULT_CAP = 50;
var STORAGE_KEY2 = "mj.receiptvault.v1";
var seq = 0;
var ReceiptVault = class {
  records = null;
  ensure() {
    if (this.records) return this.records;
    let loaded = [];
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY2);
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
      globalThis.localStorage?.setItem(STORAGE_KEY2, JSON.stringify(this.ensure()));
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
  /**
   * 11.10.1 — attach the merge attestation to an EXISTING record (the receipt chain is
   * closed at issuance and is never re-written; the attestation is metadata beside it).
   */
  attachMergeAttestation(id, att) {
    const rec = this.ensure().find((r) => r.id === id);
    if (!rec) return null;
    rec.mergeAttestation = att;
    this.persist();
    return rec;
  }
  /** 11.10.5 — attach the commit-bound provenance statement beside the attestation. */
  attachProvenance(id, st) {
    const rec = this.ensure().find((r) => r.id === id);
    if (!rec) return null;
    rec.provenance = st;
    this.persist();
    return rec;
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
      `Every team mission can issue a **Proof Receipt** (\`mj-proof-receipt/2\`): a SHA-256`,
      `hash-chained event log of the facts MJ actually measured \u2014 mission status, each seat's`,
      `role/outcome/verification (with a deterministic seat identity digest when the harness is`,
      `known), and the adversarial-gate verdict \u2014 sealed with HMAC-SHA-256 AND, since 11.10.1,`,
      `signed with the local issuer's Ed25519 key over the final chain hash. Events are linked`,
      `(\`prev\` \u2192 \`hash\`), so any edit, insertion or deletion breaks the chain.`,
      ``,
      `## The adversarial verification gate (11.9.9) and merge authority (11.10 \u2192 11.10.1)`,
      `MJ enforces that a run's output is verified by a **different harness than the one that`,
      `wrote it**. Self-verified runs are blocked (STRICT) or marked unverified (ADVISORY), and`,
      `the gate verdict is itself an event in the receipt chain. Since 11.10 the gate decides`,
      `whether a merge is **permitted**; since 11.10.1 the Merge Executor actually runs the gated`,
      `merge plan and records the merge-commit sha in a signed merge attestation.`,
      ``,
      `## Control mapping`,
      `- EU AI Act Art. 12 (transparency / record-keeping, tamper-evident logging): receipts are`,
      `  append-evident, hash-chained, issuer-signed, and exportable as JSONL for SIEM ingestion.`,
      `- ISO/IEC 42001 (AI management system): receipts + attestations form the documented,`,
      `  verifiable record of agent execution and human-gated merge decisions.`,
      `- SOC 2 (CC7/CC8 change management & monitoring): merge attestations name the gate verdict,`,
      `  any recorded override, and the exact commit that landed.`,
      ``,
      `## External verification (no MJ required)`,
      `1. Take the receipt JSONL. 2. Re-canonicalize each event body (recursive key sort),`,
      `3. re-hash the chain from the 64-zero genesis, 4. re-compute the HMAC seal with the`,
      `published verification secret, 5. verify the Ed25519 signature over the final chain hash`,
      `with the exported issuer public key. MJ ships this exact algorithm (verifyProofReceipt)`,
      `and any auditor can re-implement it from the format alone.`,
      ``,
      `## What MJ does NOT claim`,
      `MJ produces tamper-evident, issuer-signed evidence; it is not a certification body.`,
      `Control mappings above are a convenience crosswalk, not legal advice and not an audit`,
      `opinion. The issuer private key never leaves the machine that issued the receipts.`,
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
