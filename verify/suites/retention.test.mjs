import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/retention.test.ts
import { describe, it, before, after } from "node:test";
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
async function exportIssuerPublicKeyDocument(mjVersion) {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  return [
    "MJ \u2014 Issuer Public Key (Ed25519)",
    "================================",
    "",
    `MJ version : ${mjVersion}`,
    `Key id     : ${holder.identity.keyId}`,
    `Public key : ${holder.identity.publicKeyHex}`,
    `Created    : ${holder.identity.createdAt}`,
    "",
    "What this key verifies",
    "----------------------",
    "Every mj-proof-receipt/2 issued by this MJ install carries `issuer` + `signature`:",
    "an Ed25519 signature over the receipt's FINAL CHAIN HASH (the `hash` of the last",
    "chained event). To verify a receipt without MJ:",
    "",
    "  1. Re-canonicalize each event body (recursive key sort) and re-hash the chain",
    "     from the 64-zero genesis to recover the final chain hash.",
    "  2. Verify the Ed25519 signature over that hash with the public key above.",
    "  3. Re-check the HMAC seal as before (it still applies).",
    "",
    "The private key never leaves the machine that issued the receipts; MJ has no server",
    "it could leave through. Treat this document like a code-signing certificate: anyone",
    "holding it can verify MJ's receipts; nobody holding it can forge them.",
    ""
  ].join("\n");
}
function signingSupported() {
  return ed25519Available();
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
  const { report: report2 } = args;
  const seatEvents = [];
  for (const s of report2.seats) {
    const data = { role: s.role, outcome: s.outcome, verified: s.verified };
    if (s.harness) {
      data.harness = s.harness;
      data.identity = await sha256hex(`${s.seatId}|${s.role}|${s.harness}`);
    }
    seatEvents.push({ kind: "seat.outcome", seatId: s.seatId, data });
  }
  const raw = [
    { kind: "mission.status", seatId: null, data: { status: report2.status, reviewedBySnapshot: report2.reviewedBySnapshot === true } },
    ...seatEvents,
    { kind: "mission.verdict", seatId: null, data: { verified: report2.seats.some((s) => s.verified), arms: report2.autonomyArms ?? [] } }
  ];
  if (report2.gateStatus !== void 0) {
    raw.push({
      kind: "gate.verdict",
      seatId: null,
      data: {
        status: report2.gateStatus,
        tier: report2.gateTier ?? "n/a",
        // 11.10 — the writer→snapshot→verifier evidence link, in the chain itself.
        snapshotSha: report2.gateSnapshotSha ?? null
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
    autonomyArms: report2.autonomyArms ?? []
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
function receiptToJsonl(rc) {
  const head = { receipt: rc.header, format: rc.format, seal: rc.seal };
  if (rc.issuer !== void 0) head.issuer = rc.issuer;
  if (rc.signature !== void 0) head.signature = rc.signature;
  if (rc.signatureNote !== void 0) head.signatureNote = rc.signatureNote;
  const lines = [JSON.stringify(head), ...rc.events.map((e) => JSON.stringify(e))];
  return `${lines.join("\n")}
`;
}

// src/mission/receiptVault.ts
var VAULT_CAP = 50;
var STORAGE_KEY2 = "mj.receiptvault.v1";
var RETENTION_KEY = "mj.retention.v1";
var RETENTION_DEFAULT_MONTHS = 6;
var RETENTION_OPTIONS = [6, 12, 24];
function loadRetentionPolicy() {
  try {
    const raw = globalThis.localStorage?.getItem(RETENTION_KEY);
    const n = raw === null ? NaN : Number(raw);
    return RETENTION_OPTIONS.includes(n) ? n : RETENTION_DEFAULT_MONTHS;
  } catch {
    return RETENTION_DEFAULT_MONTHS;
  }
}
function saveRetentionPolicy(months) {
  try {
    if (RETENTION_OPTIONS.includes(months)) {
      globalThis.localStorage?.setItem(RETENTION_KEY, String(months));
    }
  } catch {
  }
}
function retentionStatus(issuedAt, months) {
  const t = new Date(issuedAt);
  t.setUTCMonth(t.getUTCMonth() + months);
  return { until: t.toISOString(), satisfied: Date.now() >= t.getTime() };
}
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

// src/mission/evidencePack.ts
var EVIDENCE_CONTROL_MAPPINGS = [
  {
    control: "EU AI Act \u2014 Art. 12 (record-keeping & logging)",
    whatItAsksFor: "Automatic recording of events over the system's lifetime, in a tamper-evident form, to enable traceability.",
    whatMJProvides: "Hash-chained, issuer-signed proof receipts recording measured run events (status, seat outcomes, gate verdict, snapshot shas), exportable as JSONL.",
    artifact: "receipts[].receiptJsonl"
  },
  {
    control: "EU AI Act \u2014 Art. 13 (transparency to deployers)",
    whatItAsksFor: "Instructions and capability information so deployers can interpret outputs.",
    whatMJProvides: "The one-pager and this pack's manifest: what MJ records, how it is verified externally, and what MJ does not claim.",
    artifact: "onePager, manifest"
  },
  {
    control: "ISO/IEC 42001 \u2014 Clause 8 (AI risk & impact assessment, documented operations)",
    whatItAsksFor: "Documented, verifiable records of AI system operation and the decisions made over them.",
    whatMJProvides: "Gate verdicts in-chain plus merge attestations naming the gate decision, any recorded override, and the merge-commit sha that landed.",
    artifact: "receipts[].gateStatus, mergeAttestations[]"
  },
  {
    control: "SOC 2 \u2014 CC7.2 / CC7.3 (monitor & evaluate security events)",
    whatItAsksFor: "Monitoring of system activity and evaluation of detected events.",
    whatMJProvides: "SIEM-ingestible JSONL (one object per line, tagged per run) for ingestion into the customer's existing monitoring pipeline.",
    artifact: "siemBundle"
  },
  {
    control: "SOC 2 \u2014 CC8.1 (change management: authorized, tested, approved changes)",
    whatItAsksFor: "Changes are authorized, tested, approved and implemented with an audit trail.",
    whatMJProvides: "The merge gate as authorization control, the repo's own check as the test, the recorded override/approval decision, and the merge-commit sha as the implementation record.",
    artifact: "mergeAttestations[]"
  },
  {
    control: "SOC 2 CC8.1 / SOX 404 \u2014 AI-code authorship (2026 auditor focus)",
    whatItAsksFor: "For AI-generated changes: who/what initiated the change, whether it was independently validated, and an accountable authorship trail \u2014 the assumption behind every change-management attestation.",
    whatMJProvides: "Commit-bound provenance statements: the merge commit as subject; writer seats (harness + identity digest) as materials; the cross-harness gate verdict + review-snapshot sha as the independent approval; executed merge steps as the implementation record.",
    artifact: "provenanceStatements[]"
  },
  {
    control: "NIST SP 800-218A / SLSA v1.2 (AI code provenance gap)",
    whatItAsksFor: "Provenance distinguishing AI-authored from human-authored source, captured in the layer that runs the agent \u2014 a category the current standards do not yet define.",
    whatMJProvides: "mj-provenance-statement/1: in-toto-shaped statements with an MJ predicate (builder, materials, verification, merge), signed with the issuer key \u2014 plus the AIBOM inventory of every AI component observed in receipts.",
    artifact: "provenanceStatements[], aibom"
  }
];
async function buildEvidencePack(args) {
  const records = args.vault.list();
  const receipts = [];
  let validCount = 0;
  const broken = [];
  for (const rec of records) {
    const v = await verifyProofReceipt(rec.receipt);
    if (v.ok) validCount += 1;
    else broken.push({ id: rec.id, reason: v.reason });
    receipts.push({
      vaultId: rec.id,
      mission: rec.mission,
      teamId: rec.teamId,
      issuedAt: rec.issuedAt,
      gateStatus: rec.gateStatus,
      gateTier: rec.gateTier,
      validAtExport: v.ok,
      verifyReason: v.ok ? null : v.reason,
      receiptJsonl: receiptToJsonl(rec.receipt)
    });
  }
  const mergeAttestations = records.filter((r) => r.mergeAttestation).map((r) => ({ vaultId: r.id, attestation: r.mergeAttestation }));
  const provenanceStatements = records.filter((r) => r.provenance).map((r) => ({ vaultId: r.id, statement: r.provenance }));
  const aibom = buildAibom({ records, ownedHarnesses: args.ownedHarnesses, mjVersion: args.mjVersion });
  const issuerDoc = await exportIssuerPublicKeyDocument(args.mjVersion);
  return {
    format: "mj-evidence-pack/1",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    mjVersion: args.mjVersion,
    manifest: {
      receiptsOnFile: records.length,
      receiptsValidAtExport: validCount,
      receiptsBrokenAtExport: broken,
      mergeAttestations: mergeAttestations.length,
      provenanceStatements: provenanceStatements.length,
      retentionMonths: loadRetentionPolicy(),
      issuerSigningAvailable: signingSupported(),
      note: receipts.length === 0 ? "No receipts are on file yet. Evidence is produced when team missions run and issue proof receipts." : broken.length === 0 ? "All receipts on file re-verified clean at export time." : `${broken.length} receipt(s) FAILED re-verification at export time \u2014 see manifest.receiptsBrokenAtExport. They are included as-is so the breakage is visible, not hidden.`
    },
    receipts,
    mergeAttestations,
    provenanceStatements,
    aibom,
    siemBundle: args.vault.siemBundle(),
    onePager: args.vault.onePager({ mjVersion: args.mjVersion, edition: args.edition }),
    issuerPublicKeyDocument: issuerDoc,
    controlMappings: EVIDENCE_CONTROL_MAPPINGS,
    disclaimer: "This pack is machine-verifiable evidence produced by MJ on the user's own machine. The control mappings are a convenience crosswalk prepared by the MJ project to help reviewers locate relevant artifacts; they are NOT a legal opinion, NOT an audit, and NOT a claim that MJ or its outputs satisfy any regulation or standard. Verification of the enclosed receipts requires no MJ software \u2014 see the one-pager's external-verification steps."
  };
}

// src/mission/mergePlan.ts
var ROLE_ORDER = {
  architect: 0,
  coder: 1,
  debugger: 2,
  tester: 3,
  security: 4,
  reviewer: 5,
  synthesizer: 6
};
function orderBranches(candidates) {
  const byBranch = new Map(candidates.map((c) => [c.branch, c]));
  const ordered = [];
  const placed = /* @__PURE__ */ new Set();
  const cycles = [];
  const visit = (c, stack) => {
    if (placed.has(c.branch)) return;
    if (stack.includes(c.branch)) {
      cycles.push([...stack.slice(stack.indexOf(c.branch)), c.branch].join(" -> "));
      return;
    }
    for (const dep of c.dependsOn) {
      const d = byBranch.get(dep);
      if (d) visit(d, [...stack, c.branch]);
    }
    placed.add(c.branch);
    ordered.push(c);
  };
  const sorted = [...candidates].sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 99;
    const rb = ROLE_ORDER[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    return b.additions + b.deletions - (a.additions + a.deletions);
  });
  for (const c of sorted) visit(c, []);
  return { ordered, cycles };
}
function planMerge(candidates, opts) {
  const problems = [];
  const excluded = [];
  const mergeable = [];
  for (const c of candidates) {
    if (!c.verified) {
      excluded.push({ branch: c.branch, seatId: c.seatId, reason: "Its own verification did not pass, so it does not merge. A branch that failed its checks would put a known-broken state on the base branch." });
      continue;
    }
    if (c.additions + c.deletions === 0) {
      excluded.push({ branch: c.branch, seatId: c.seatId, reason: "It changed nothing. Merging an empty branch adds a commit and a conflict surface for no benefit." });
      continue;
    }
    mergeable.push(c);
  }
  const { ordered, cycles } = orderBranches(mergeable);
  for (const cyc of cycles) problems.push(`Dependency cycle: ${cyc}. Two branches each claim to depend on the other, which is a decomposition bug \u2014 MJ will not guess an order.`);
  const steps = ordered.map((c, i) => ({
    order: i + 1,
    branch: c.branch,
    seatId: c.seatId,
    argv: [
      ["checkout", opts.baseBranch],
      ["merge", "--no-ff", "--no-edit", c.branch]
    ],
    requires: i === 0 ? [opts.baseBranch] : [ordered[i - 1]?.branch ?? opts.baseBranch],
    note: c.role === "tester" ? "Tests merge after the code they test, so the base branch is never in a state where tests reference code that is not there." : c.dependsOn.length ? `Depends on ${c.dependsOn.join(", ")}, so it merges after them.` : `${c.role} work; +${c.additions}/-${c.deletions}.`
  }));
  const preflight = [];
  for (let i = 0; i < mergeable.length; i += 1) {
    for (let j = i + 1; j < mergeable.length; j += 1) {
      const a = mergeable[i];
      const b = mergeable[j];
      if (!a || !b) continue;
      if (a.dependsOn.includes(b.branch) || b.dependsOn.includes(a.branch)) continue;
      preflight.push({
        a: a.branch,
        b: b.branch,
        // merge-tree does a three-way merge in memory. No working tree is touched, so this is safe to
        // run while agents are still working.
        //
        // It takes TWO branches, not three: the merge base is derived from their history. Passing the
        // base as a third argument makes git reject the command with a usage error (exit 129), which is
        // easy to mistake for "these branches conflict" — verified on git 2.47.3.
        argv: ["merge-tree", "--write-tree", "--name-only", a.branch, b.branch],
        why: `Neither declares a dependency on the other, so a conflict here would be a surprise. Check before merging, not after.`
      });
    }
  }
  if (mergeable.length > 4) {
    problems.push(`${mergeable.length} branches are queued to merge. Four is about where review stops keeping up; consider splitting the mission.`);
  }
  if (excluded.length === candidates.length && candidates.length > 0) {
    problems.push("Every branch was excluded, so nothing will be merged. The mission produced no verified change.");
  }
  const cleanup = [];
  for (const c of mergeable) {
    cleanup.push(["worktree", "remove", "--force", c.worktreePath]);
    cleanup.push(["branch", "-d", c.branch]);
  }
  cleanup.push(["worktree", "prune"]);
  return { steps, excluded, preflight, postMergeCheck: opts.testCommand ?? [], cleanup, problems };
}
function interpretMergeTree(exitCode, stdout) {
  if (exitCode === 0) return { clean: true, conflicted: [], error: null };
  if (exitCode === 1) {
    const lines = stdout.split(/\r?\n/);
    const oid = (lines[0] ?? "").trim();
    const body = lines.slice(1);
    const cut = body.findIndex((l) => !l.trim());
    const paths = (cut === -1 ? body : body.slice(0, cut)).map((l) => l.trim()).filter(Boolean);
    const conflicted = paths.map((l) => l.includes("	") ? l.split("	").pop() ?? l : l).filter((l) => l !== oid);
    return { clean: false, conflicted, error: null };
  }
  return {
    clean: false,
    conflicted: [],
    error: exitCode === null ? "git merge-tree did not run at all." : exitCode === 129 ? "git merge-tree rejected its arguments (exit 129 is a usage error). This is MJ's mistake in how it called git, NOT a conflict between the branches." : `git merge-tree exited ${exitCode}, which is neither clean (0) nor conflict (1).`
  };
}

// src/mission/mergeExecutor.ts
async function revParse(git2, ref) {
  const r = await git2(["rev-parse", ref]);
  if (r.code !== 0) return null;
  const sha = r.out.trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}
async function executeMergePlan(input) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const base = (msg, extra) => ({
    executed: false,
    refusedReason: msg,
    startedAt,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    baseBranch: input.baseBranch,
    simulated: input.simulated === true,
    baseShaBefore: null,
    mergeCommitSha: null,
    preflight: [],
    steps: [],
    postMergeCheck: { ran: false, ok: null, detail: "not run" },
    cleanup: [],
    gate: { status: input.gate.status, tier: input.gate.tier, allowed: input.gate.allowed, overrideRecorded: Boolean(input.overrideRecorded) },
    ...extra
  });
  if (!input.gate.allowed && !input.overrideRecorded) {
    return base(`Merge REFUSED by the verification gate (${input.gate.status}, tier ${input.gate.tier}): ${input.gate.reason}. Nothing was merged. Record an explicit override to proceed anyway \u2014 MJ will name it in the attestation.`);
  }
  if (input.plan.problems.length > 0) {
    return base(`Merge REFUSED: the plan itself reports problems: ${input.plan.problems.join(" ")}`);
  }
  if (input.plan.steps.length === 0) {
    return base("Merge REFUSED: the plan has no steps. Nothing was verified, changed, or mergeable \u2014 there is nothing to execute.");
  }
  if (input.simulated) {
    return base("This host has no git access (browser/dev preview), so the merge was planned but NOT executed. Re-run from the desktop app to merge for real.");
  }
  const preflight = [];
  const steps = [];
  const cleanup = [];
  for (const p of input.plan.preflight) {
    const r = await input.git(p.argv);
    const interp = interpretMergeTree(r.code, r.out);
    preflight.push({
      a: p.a,
      b: p.b,
      clean: interp.clean,
      conflicted: interp.conflicted,
      detail: interp.error ?? (interp.clean ? "clean" : `conflict in: ${interp.conflicted.join(", ") || "(no paths listed)"}`)
    });
    if (interp.error || !interp.clean) {
      return base(
        `Merge REFUSED at pre-flight: ${p.a} vs ${p.b} \u2014 ${interp.error ?? `conflicting paths: ${interp.conflicted.join(", ") || "(see git output)"}`}. No branch was merged.`,
        { preflight }
      );
    }
  }
  const baseShaBefore = await revParse(input.git, input.baseBranch);
  let failed = null;
  for (const step of [...input.plan.steps].sort((a, b) => a.order - b.order)) {
    const rec = { order: step.order, branch: step.branch, seatId: step.seatId, ok: false, commands: [] };
    steps.push(rec);
    for (const argv of step.argv) {
      const r = await input.git(argv);
      const detail = r.code === 0 ? "ok" : (r.err.trim() || r.out.trim() || `exit ${r.code}`).split("\n")[0] ?? `exit ${r.code}`;
      rec.commands.push({ argv, code: r.code, detail });
      if (r.code !== 0) {
        failed = { step: rec, code: r.code, argv, err: detail };
        break;
      }
    }
    if (!failed) rec.ok = true;
    if (failed) break;
  }
  if (failed) {
    return base(
      `Merge FAILED at step ${failed.step.order} (${failed.step.branch}): git ${failed.argv.join(" ")} exited ${failed.code} \u2014 ${failed.err}. Steps after it were NOT attempted; the repository is left exactly where git left it.`,
      { preflight, steps, baseShaBefore }
    );
  }
  const pmc = { ran: false, ok: null, detail: "not run" };
  if (input.plan.postMergeCheck.length > 0) {
    if (input.runRepoCommand) {
      const r = await input.runRepoCommand(input.plan.postMergeCheck);
      pmc.ran = true;
      pmc.ok = r.code === 0;
      pmc.detail = r.code === 0 ? `exit 0: ${input.plan.postMergeCheck.join(" ")}` : `exit ${r.code}: ${(r.err.trim() || r.out.trim()).split("\n")[0] ?? ""}`;
    } else {
      pmc.detail = `planned (${input.plan.postMergeCheck.join(" ")}) but this host has no repo-command runner \u2014 the combined suite was NOT executed. Do not treat the merge as validated.`;
    }
  } else {
    pmc.detail = "no post-merge check was planned for this team";
  }
  for (const argv of input.plan.cleanup) {
    const r = await input.git(argv);
    cleanup.push({ argv, ok: r.code === 0 });
  }
  const mergeCommitSha = await revParse(input.git, "HEAD");
  return {
    executed: true,
    startedAt,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    baseBranch: input.baseBranch,
    simulated: false,
    baseShaBefore,
    mergeCommitSha,
    preflight,
    steps,
    postMergeCheck: pmc,
    cleanup,
    gate: { status: input.gate.status, tier: input.gate.tier, allowed: input.gate.allowed, overrideRecorded: Boolean(input.overrideRecorded) }
  };
}
function sortDeep2(v) {
  if (Array.isArray(v)) return v.map(sortDeep2);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep2(v[k]);
    return out;
  }
  return v;
}
async function sha256hex2(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function mergeAttestationPayload(a) {
  const { issuer: _i, signature: _s, signatureNote: _n, ...payload } = a;
  return sortDeep2(payload);
}
async function buildMergeAttestation(result, mjVersion) {
  const att = {
    format: "mj-merge-attestation/1",
    issuedAt: (/* @__PURE__ */ new Date()).toISOString(),
    mjVersion,
    baseBranch: result.baseBranch,
    executed: result.executed,
    simulated: result.simulated,
    ...result.refusedReason !== void 0 ? { refusedReason: result.refusedReason } : {},
    gate: result.gate,
    stepsMerged: result.steps.filter((s) => s.ok).map((s) => ({ order: s.order, branch: s.branch, seatId: s.seatId })),
    baseShaBefore: result.baseShaBefore,
    mergeCommitSha: result.mergeCommitSha,
    postMergeCheck: result.postMergeCheck,
    issuer: null,
    signature: null
  };
  const payload = mergeAttestationPayload(att);
  const digest = await sha256hex2(JSON.stringify(payload));
  const sig = await signHexDigest(digest);
  if (sig) {
    att.issuer = { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex };
    att.signature = sig.sigHex;
  } else {
    att.signatureNote = "Runtime has no Ed25519 \u2014 attestation is unsigned (payload is still fully recorded).";
  }
  return att;
}

// src/mission/provenance.ts
var MJ_PROVENANCE_PREDICATE_TYPE = "https://mj.desktop/provenance/v1";
function sortDeep3(v) {
  if (Array.isArray(v)) return v.map(sortDeep3);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep3(v[k]);
    return out;
  }
  return v;
}
async function sha256hex3(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function provenanceBody(st) {
  const { issuer: _i, signature: _s, signatureNote: _n, ...body } = st;
  return sortDeep3(body);
}
async function buildProvenanceStatement(args) {
  if (!args.merge.executed || !args.merge.mergeCommitSha) return null;
  const materials = [];
  for (const c of args.candidates.filter((c2) => c2.verified)) {
    const step = args.merge.steps.find((s) => s.branch === c.branch && s.ok);
    if (!step) continue;
    materials.push({
      seatId: c.seatId,
      role: c.role,
      harness: harnessForSeat(c.seatId, args),
      branch: c.branch,
      identity: await sha256hex3(`${c.seatId}|${c.role}|${harnessForSeat(c.seatId, args)}`),
      verified: true,
      additions: c.additions,
      deletions: c.deletions
    });
  }
  const st = {
    _type: "https://in-toto.io/Statement/v1",
    format: "mj-provenance-statement/1",
    subject: [{ name: args.merge.baseBranch, digest: { gitCommit: args.merge.mergeCommitSha } }],
    predicateType: MJ_PROVENANCE_PREDICATE_TYPE,
    predicate: {
      builder: { id: `mj-desktop@${args.mjVersion}` },
      buildType: "mj.verified-team-run/v1",
      metadata: { mission: args.mission, teamId: args.teamId, mjVersion: args.mjVersion, issuedAt: (/* @__PURE__ */ new Date()).toISOString() },
      materials,
      verification: {
        gateStatus: args.gate.status,
        gateTier: args.gate.tier,
        crossVerified: args.gate.crossVerified,
        snapshotSha: args.gate.evidence?.snapshotSha ?? null,
        reviewers: (args.gate.evidence?.reviewedBy ?? []).map((r) => ({ seatId: r.seatId, harness: r.harness, matchesSnapshot: r.matchesSnapshot }))
      },
      merge: {
        baseBranch: args.merge.baseBranch,
        baseShaBefore: args.merge.baseShaBefore,
        mergeCommitSha: args.merge.mergeCommitSha,
        stepsMerged: args.merge.steps.filter((s) => s.ok).length,
        overrideRecorded: args.merge.gate.overrideRecorded,
        postMergeCheckOk: args.merge.postMergeCheck.ran ? args.merge.postMergeCheck.ok : null
      }
    },
    issuer: null,
    signature: null
  };
  const digest = await sha256hex3(JSON.stringify(provenanceBody(st)));
  const sig = await signHexDigest(digest);
  if (sig) {
    st.issuer = { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex };
    st.signature = sig.sigHex;
  } else {
    st.signatureNote = "Runtime has no Ed25519 \u2014 statement is unsigned (its contents are still fully recorded).";
  }
  return st;
}
function harnessForSeat(seatId, args) {
  const measured = args.harnessBySeat[seatId];
  if (measured) return measured;
  const ev = args.gate.evidence;
  const hit = ev?.reviewedBy.find((r) => r.seatId === seatId);
  return hit?.harness ?? "unknown";
}

// probe/retention.test.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
var report = {
  status: "pass",
  seats: [{ seatId: "coder", role: "coder", outcome: "done", verified: true, harness: "claude-code" }],
  autonomyArms: [],
  reviewedBySnapshot: true,
  gateStatus: "PASS",
  gateTier: "cross-vendor"
};
var PASS_GATE = {
  status: "PASS",
  tier: "cross-vendor",
  reasons: [],
  policy: "STRICT",
  crossVerified: true,
  evidence: null
};
function git(repo, argv) {
  try {
    const out = execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e) {
    const err = e;
    return { code: err.status ?? 1, out: String(err.stdout ?? ""), err: String(err.stderr ?? "") };
  }
}
describe("retention policy \u2014 the honest floor", () => {
  const store = /* @__PURE__ */ new Map();
  before(() => {
    globalThis.localStorage = {
      getItem: (k) => store.has(k) ? store.get(k) : null,
      setItem: (k, v) => void store.set(k, String(v)),
      removeItem: (k) => void store.delete(k),
      clear: () => void store.clear()
    };
  });
  after(() => {
    delete globalThis.localStorage;
  });
  it("defaults to 6 months and round-trips only declared options", async () => {
    assert.equal(RETENTION_DEFAULT_MONTHS, 6);
    assert.equal(loadRetentionPolicy(), 6, "with nothing stored the floor is the Art. 26 minimum");
    saveRetentionPolicy(12);
    assert.equal(loadRetentionPolicy(), 12);
    saveRetentionPolicy(7);
    assert.equal(loadRetentionPolicy(), 12);
    saveRetentionPolicy(6);
  });
  it("retentionStatus is honest: a fresh record is required, an old one is satisfied", async () => {
    const now = /* @__PURE__ */ new Date();
    const fresh = retentionStatus(now.toISOString(), 6);
    assert.equal(fresh.satisfied, false, "a record issued now cannot already satisfy a 6-month floor");
    const old = new Date(now);
    old.setUTCMonth(old.getUTCMonth() - 7);
    const aged = retentionStatus(old.toISOString(), 6);
    assert.equal(aged.satisfied, true);
    assert.ok(aged.until > old.toISOString(), "the 'until' date must sit after issue time");
  });
});
describe("evidence pack \u2014 the deployer bundle grows up", () => {
  it("carries the retention floor, the AIBOM and the provenance statements", async () => {
    const vault = new ReceiptVault();
    const rc = await buildProofReceipt({ mission: "m-r", teamId: "t-r", startedAt: "a", finishedAt: "b", mjVersion: "11.10.5", edition: "pro", report });
    const rec = vault.issue({ mission: "m-r", teamId: "t-r", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc });
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjret-"));
    fs.writeFileSync(path.join(repo, "app.js"), "1\n");
    execFileSync("git", ["init", "-q", "."], { cwd: repo });
    execFileSync("git", ["config", "user.email", "mj@mj.desktop"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "MJ"], { cwd: repo });
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: repo });
    const base = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).out.trim();
    git(repo, ["checkout", "-q", "-b", "mj/coder"]);
    fs.writeFileSync(path.join(repo, "feature.js"), "2\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "feature"]);
    git(repo, ["checkout", "-q", base]);
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo }
    );
    const merge = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false },
      git: (argv) => Promise.resolve(git(repo, argv)),
      mjVersion: "11.10.5"
    });
    assert.equal(merge.executed, true);
    vault.attachMergeAttestation(rec.id, await buildMergeAttestation(merge, "11.10.5"));
    const prov = await buildProvenanceStatement({
      mission: "m-r",
      teamId: "t-r",
      mjVersion: "11.10.5",
      candidates: [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      gate: PASS_GATE,
      merge,
      harnessBySeat: { coder: "claude-code" }
    });
    assert.ok(prov);
    vault.attachProvenance(rec.id, prov);
    const pack = await buildEvidencePack({ vault, mjVersion: "11.10.5", edition: "pro", ownedHarnesses: ["claude-code"] });
    assert.equal(pack.manifest.retentionMonths, loadRetentionPolicy(), "the pack must NAME the declared floor");
    assert.ok(pack.manifest.retentionMonths >= 6, "the floor cannot be below the Art. 26 minimum");
    assert.equal(pack.manifest.provenanceStatements, 1);
    assert.equal(pack.provenanceStatements.length, 1);
    assert.equal(pack.provenanceStatements[0].statement.subject[0].digest.gitCommit, merge.mergeCommitSha);
    assert.equal(pack.aibom.entries.length, 1);
    assert.equal(pack.aibom.entries[0].component, "claude-code");
    assert.equal(pack.aibom.entries[0].approvalStatus, "approved");
    assert.ok(pack.controlMappings.some((m) => m.control.includes("SOX 404")));
    assert.ok(pack.controlMappings.some((m) => m.control.includes("NIST SP 800-218A")));
    assert.ok(pack.controlMappings.length >= 6);
  });
});
