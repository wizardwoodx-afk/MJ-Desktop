import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/aibom.test.ts
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

// src/mission/aibom.ts
function buildAibom(args) {
  const byComponent = /* @__PURE__ */ new Map();
  for (const rec of args.records) {
    for (const ev of rec.receipt.events) {
      if (ev.kind !== "seat.outcome") continue;
      const harness = ev.data.harness;
      if (typeof harness !== "string" || harness.length === 0) continue;
      let entry = byComponent.get(harness);
      if (!entry) {
        entry = {
          component: harness,
          type: "ai-coding-agent",
          version: "not measured (CLIs do not report model versions to MJ)",
          identifier: harness,
          roles: [],
          missions: 0,
          seatIdentities: [],
          lastUsed: rec.issuedAt,
          approvalStatus: args.ownedHarnesses.includes(harness) ? "approved" : "not-declared"
        };
        byComponent.set(harness, entry);
      }
      const role = ev.data.role;
      if (typeof role === "string" && !entry.roles.includes(role)) entry.roles.push(role);
      const identity = ev.data.identity;
      if (typeof identity === "string" && !entry.seatIdentities.includes(identity)) entry.seatIdentities.push(identity);
      if (rec.issuedAt > entry.lastUsed) entry.lastUsed = rec.issuedAt;
    }
  }
  for (const rec of args.records) {
    const seen = /* @__PURE__ */ new Set();
    for (const ev of rec.receipt.events) {
      if (ev.kind !== "seat.outcome") continue;
      const harness = ev.data.harness;
      if (typeof harness !== "string" || seen.has(harness)) continue;
      seen.add(harness);
      const entry = byComponent.get(harness);
      if (entry) entry.missions += 1;
    }
  }
  const entries = [...byComponent.values()].sort((a, b) => a.component.localeCompare(b.component));
  return {
    format: "mj-aibom/1",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    mjVersion: args.mjVersion,
    receiptsScanned: args.records.length,
    entries,
    declarationSource: "MJ Role Board \u2014 the harnesses the user declared as owned (approved); observed-but-undeclared components are marked not-declared.",
    disclaimer: "Generated from proof receipts on this machine. Versions are not claimed because MJ does not measure them. Approval status reflects the user's own declaration, not any MJ judgment. This is an evidence inventory, not a certification."
  };
}
function aibomToMarkdown(bom) {
  const lines = [];
  lines.push(`# MJ \u2014 AI Bill of Materials (mj-aibom/1)`);
  lines.push(``);
  lines.push(`Generated ${bom.generatedAt} \xB7 MJ ${bom.mjVersion} \xB7 receipts scanned: ${bom.receiptsScanned}`);
  lines.push(``);
  if (bom.entries.length === 0) {
    lines.push(`No AI components observed in receipts yet. Run team missions to populate the inventory.`);
  } else {
    lines.push(`| Component | Roles | Missions | Approval | Version |`);
    lines.push(`|---|---|---|---|---|`);
    for (const e of bom.entries) {
      lines.push(`| ${e.component} | ${e.roles.join(", ") || "\u2014"} | ${e.missions} | ${e.approvalStatus} | ${e.version} |`);
    }
  }
  lines.push(``);
  lines.push(`_${bom.declarationSource}_`);
  lines.push(``);
  lines.push(`_${bom.disclaimer}_`);
  lines.push(``);
  return lines.join("\n");
}

// probe/aibom.test.ts
function reportWith(harnesses) {
  return {
    status: "pass",
    seats: harnesses.map((h) => ({ seatId: h.seatId, role: h.role, outcome: "done", verified: true, harness: h.harness })),
    autonomyArms: [],
    reviewedBySnapshot: true,
    gateStatus: "PASS",
    gateTier: "cross-vendor"
  };
}
describe("AIBOM \u2014 the inventory auditors ask for", () => {
  it("observed components become entries with roles, mission counts and identity digests", async () => {
    const vault = new ReceiptVault();
    const r1 = await buildProofReceipt({
      mission: "m-1",
      teamId: "t-1",
      startedAt: "a",
      finishedAt: "b",
      mjVersion: "11.10.5",
      edition: "pro",
      report: reportWith([
        { seatId: "coder", role: "coder", harness: "claude-code" },
        { seatId: "reviewer", role: "reviewer", harness: "codex" }
      ])
    });
    const r2 = await buildProofReceipt({
      mission: "m-2",
      teamId: "t-1",
      startedAt: "c",
      finishedAt: "d",
      mjVersion: "11.10.5",
      edition: "pro",
      report: reportWith([{ seatId: "coder", role: "coder", harness: "claude-code" }])
    });
    vault.issue({ mission: "m-1", teamId: "t-1", gateStatus: "PASS", gateTier: "cross-vendor", receipt: r1 });
    vault.issue({ mission: "m-2", teamId: "t-1", gateStatus: "PASS", gateTier: "cross-vendor", receipt: r2 });
    const bom = buildAibom({ records: vault.list(), ownedHarnesses: ["claude-code"], mjVersion: "11.10.5" });
    assert.equal(bom.format, "mj-aibom/1");
    assert.equal(bom.receiptsScanned, 2);
    assert.equal(bom.entries.length, 2);
    const cc = bom.entries.find((e) => e.component === "claude-code");
    const cx = bom.entries.find((e) => e.component === "codex");
    assert.ok(cc && cx);
    assert.equal(cc.missions, 2, "claude-code appeared in both missions");
    assert.equal(cx.missions, 1);
    assert.deepEqual(cc.roles.sort(), ["coder"]);
    assert.deepEqual(cx.roles.sort(), ["reviewer"]);
    assert.ok(cc.seatIdentities.length >= 1, "seat identity digests must ride with the entry");
    assert.match(cc.seatIdentities[0], /^[0-9a-f]{64}$/);
  });
  it("approval status is the user's OWN declaration: owned = approved, else not-declared", async () => {
    const vault = new ReceiptVault();
    const rc = await buildProofReceipt({
      mission: "m-a",
      teamId: "t-a",
      startedAt: "a",
      finishedAt: "b",
      mjVersion: "11.10.5",
      edition: "pro",
      report: reportWith([
        { seatId: "coder", role: "coder", harness: "claude-code" },
        { seatId: "reviewer", role: "reviewer", harness: "grok-build" }
      ])
    });
    vault.issue({ mission: "m-a", teamId: "t-a", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc });
    const bom = buildAibom({ records: vault.list(), ownedHarnesses: ["claude-code"], mjVersion: "11.10.5" });
    const cc = bom.entries.find((e) => e.component === "claude-code");
    const gb = bom.entries.find((e) => e.component === "grok-build");
    assert.equal(cc?.approvalStatus, "approved");
    assert.equal(gb?.approvalStatus, "not-declared", "an undeclared harness must be marked, never auto-approved");
    assert.match(bom.declarationSource, /Role Board/);
  });
  it("honesty: versions are never invented; an empty vault yields an empty inventory", async () => {
    const vault = new ReceiptVault();
    const rc = await buildProofReceipt({
      mission: "m-v",
      teamId: "t-v",
      startedAt: "a",
      finishedAt: "b",
      mjVersion: "11.10.5",
      edition: "pro",
      report: reportWith([{ seatId: "coder", role: "coder", harness: "opencode" }])
    });
    vault.issue({ mission: "m-v", teamId: "t-v", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc });
    const bom = buildAibom({ records: vault.list(), ownedHarnesses: [], mjVersion: "11.10.5" });
    assert.match(bom.entries[0].version, /not measured/i, "MJ must not invent a model version it cannot measure");
    assert.match(bom.disclaimer, /not claimed/i);
    const empty = buildAibom({ records: [], ownedHarnesses: ["claude-code"], mjVersion: "11.10.5" });
    assert.equal(empty.entries.length, 0, "no receipts \u2192 no components; never speculative");
    const md = aibomToMarkdown(empty);
    assert.match(md, /No AI components observed/);
  });
  it("markdown rendering is a paste-ready audit table", async () => {
    const vault = new ReceiptVault();
    const rc = await buildProofReceipt({
      mission: "m-md",
      teamId: "t-md",
      startedAt: "a",
      finishedAt: "b",
      mjVersion: "11.10.5",
      edition: "pro",
      report: reportWith([{ seatId: "coder", role: "coder", harness: "claude-code" }])
    });
    vault.issue({ mission: "m-md", teamId: "t-md", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc });
    const md = aibomToMarkdown(buildAibom({ records: vault.list(), ownedHarnesses: ["claude-code"], mjVersion: "11.10.5" }));
    assert.match(md, /\| Component \| Roles \| Missions \| Approval \| Version \|/);
    assert.match(md, /claude-code/);
    assert.match(md, /approved/);
  });
});
