/**
 * VH 16.8.0 — probe #91: the Capability Genome (VH-COLOR Phase 1).
 *
 * Pins the engine that implements the VH-COLOR protocol's core unit:
 * the genome shape (§11), the §31 state machine, the §41/42 promotion
 * chain with its four hard gates and quarantine, the §32-33 central
 * invariant ("evolution may change capability / may not control its own
 * safety authority"), the §40 signed capability package, the §70 trust
 * grades C0-C5, §45 auto-rollback, and the M4 bridge that turns existing
 * VouchSkills into genomes with their lineage intact.
 *
 * Everything here is deterministic: no network, no clock reads (times are
 * injected), and the signing path uses the same Ed25519 keychain the
 * proof receipts use.
 */
import {
  canonicalJson,
  createGenomeRegistry,
  currentFor,
  deriveChild,
  exportGenomeLedger,
  genomeFromVouchSkill,
  governorReopen,
  GENOME_TRANSITIONS,
  importGenomeLedger,
  importPackage,
  latestVersion,
  monitor,
  newGenome,
  promote,
  registerGenome,
  runHardGates,
  buildCapabilityPackage,
  rollbackActive,
  trustGrade,
  verifyCapabilityPackage,
  type CapabilityGenome,
  type GenomeRegistry,
  type PromotionEvidence,
} from "../src/vouch/engine/genome";
import { signingSupported } from "../src/vouch/engine/signing";
import type { VouchSkill } from "../src/vouch/engine/vouch";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

const T0 = "2026-09-10T00:00:00.000Z";
let t = 0;
const now = (): string => new Date(Date.parse(T0) + ++t * 1000).toISOString();

const goodEvidence = (): PromotionEvidence => ({
  evaluated: 4, passed: 4, failed: 0, regressions: 0, avgScore: 4.5, replayed: true, crossVerifiedSeats: 1,
});

const makeGenome = (over: Partial<CapabilityGenome> = {}): CapabilityGenome =>
  newGenome(
    {
      id: "cap.demo",
      objective: { current: "re-plan every run", improve: "skip the re-plan when the trigger matches" },
      trigger: "when the request matches the verified pattern",
      procedure: ["match the trigger", "run the verified steps", "verify the output"],
      inputs: ["request"],
      outputs: ["result"],
      dependencies: [],
      resourceLimits: { maxSteps: 12 },
      failureModes: ["tool errors", "trigger drift"],
      evaluation: { required: true, gate: "hard" },
      safety: { permissionClass: "read-local", externalSideEffects: false },
      provenance: { originType: "observed" },
      ...over,
    },
    now(),
  );

async function main(): Promise<void> {
  /* ---------------- §11 + canonical form ---------------- */
  section("canonical JSON is byte-stable (key order never leaks into the digest)");
  const a = { z: 1, b: [{ d: 2, c: 3 }], a: "x" };
  const b = { a: "x", b: [{ c: 3, d: 2 }], z: 1 };
  ok("shuffled keys serialize identically", canonicalJson(a) === canonicalJson(b), canonicalJson(a));
  ok("and it is compact + sorted", canonicalJson(a) === '{"a":"x","b":[{"c":3,"d":2}],"z":1}', canonicalJson(a));

  /* ---------------- §31 the state machine, pinned ---------------- */
  section("the §31 state machine is exactly the spec's table");
  const pin: Record<string, readonly string[]> = {
    OBSERVED: ["CANDIDATE", "BLOCKED", "QUARANTINED"],
    CANDIDATE: ["UNDER_EVALUATION", "REJECTED", "BLOCKED", "QUARANTINED"],
    UNDER_EVALUATION: ["SHADOW", "REJECTED", "QUARANTINED"],
    SHADOW: ["CANARY", "REJECTED", "QUARANTINED"],
    CANARY: ["ACTIVE", "ROLLED_BACK", "QUARANTINED"],
    ACTIVE: ["DEPRECATED", "ROLLED_BACK", "QUARANTINED"],
    REJECTED: [],
    BLOCKED: [],
    ROLLED_BACK: [],
    DEPRECATED: [],
    QUARANTINED: ["UNDER_EVALUATION"],
  };
  let tableOk = Object.keys(pin).length === Object.keys(GENOME_TRANSITIONS).length;
  for (const [s, tos] of Object.entries(pin)) {
    const got = GENOME_TRANSITIONS[s as keyof typeof GENOME_TRANSITIONS];
    if (!got || got.length !== tos.length || tos.some((x) => !got.includes(x as never))) tableOk = false;
  }
  ok("all 11 states, exact outgoing sets (incl. the five negative states)", tableOk, JSON.stringify(GENOME_TRANSITIONS));
  ok("every negative state is terminal except QUARANTINED's governance reopen",
    ["REJECTED", "BLOCKED", "ROLLED_BACK", "DEPRECATED"].every((s) => GENOME_TRANSITIONS[s as keyof typeof GENOME_TRANSITIONS].length === 0)
      && GENOME_TRANSITIONS.QUARANTINED.length === 1);

  /* ---------------- the full happy path ---------------- */
  section("a clean capability climbs OBSERVED -> ACTIVE through all five gates");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ provenance: { originType: "observed" } }));
    const chain: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = promote(reg, "cap.demo", goodEvidence(), { now: now() });
      ok(`step ${i + 1}: ${r.from} -> ${r.to}`, r.ok && !r.quarantined && r.to !== undefined, r.reason);
      if (r.to) chain.push(r.to);
    }
    ok("landed exactly OBSERVED,CANDIDATE,UNDER_EVALUATION,SHADOW,CANARY,ACTIVE",
      chain.join(",") === "CANDIDATE,UNDER_EVALUATION,SHADOW,CANARY,ACTIVE", chain.join(","));
    const g = latestVersion(reg, "cap.demo");
    ok("history is append-only and complete (6 entries, first is the birth)",
      !!g && g.history.length === 6 && g.history[0].from === null && g.history[0].to === "OBSERVED",
      g ? String(g.history.length) : "missing");
  }

  /* ---------------- THE invariant: §32-33 ---------------- */
  section("§32-33 — a capability may not control its own safety authority");
  {
    const reg = createGenomeRegistry();
    const g = makeGenome({ id: "cap.netcall", safety: { permissionClass: "external", externalSideEffects: true } });
    registerGenome(reg, g);
    const r1 = promote(reg, "cap.netcall", goodEvidence(), { now: now() });
    ok("external side effects with no governor grant -> QUARANTINED at G1",
      !r1.ok && r1.quarantined && r1.failedGate === "G1-safety" && latestVersion(reg, "cap.netcall")?.status === "QUARANTINED",
      r1.reason);

    // The attack the whole protocol exists for: the capability writes a
    // governor grant INTO ITS OWN FIELDS and presents itself as granted.
    const forged = makeGenome({
      id: "cap.forged",
      safety: { permissionClass: "external", externalSideEffects: true },
      provenance: { originType: "observed", originReceiptId: "rcpt-look-so-official" },
    });
    (forged as unknown as Record<string, unknown>).governorGrant = {
      by: "the-capability-itself", grantedClass: "external", scope: "i grant myself", ts: now(),
    };
    registerGenome(reg, forged);
    const verdicts = runHardGates(forged, goodEvidence(), reg);
    ok("a grant embedded in the genome's own fields is INVISIBLE to G1",
      verdicts.find((v) => v.gate === "G1-safety")?.pass === false,
      JSON.stringify(verdicts.find((v) => v.gate === "G1-safety")));
    const r2 = promote(reg, "cap.forged", goodEvidence(), { now: now() });
    ok("...so the forged genome quarantines, not activates", r2.quarantined && r2.failedGate === "G1-safety", r2.reason);

    // The legitimate path: the grant arrives as a SEPARATE argument.
    const legit = makeGenome({ id: "cap.granted", safety: { permissionClass: "external", externalSideEffects: true } });
    registerGenome(reg, legit);
    const grant = { by: "governor:hq", grantedClass: "external", scope: "release traffic shaping", ts: now() };
    let to: string | undefined;
    for (let i = 0; i < 5; i++) to = promote(reg, "cap.granted", goodEvidence(), { governorGrant: grant, now: now() }).to;
    ok("the SAME genome with a real separate-authority grant climbs to ACTIVE", to === "ACTIVE");
    // and it stops being valid when the grant is withheld on a later step
    const later = makeGenome({ id: "cap.expire", safety: { permissionClass: "external", externalSideEffects: true } });
    registerGenome(reg, later);
    promote(reg, "cap.expire", goodEvidence(), { governorGrant: grant, now: now() }); // -> CANDIDATE
    const r3 = promote(reg, "cap.expire", goodEvidence(), { now: now() }); // grant withheld
    ok("withhold the grant on the next step and it quarantines again", r3.quarantined && r3.failedGate === "G1-safety", r3.reason);
  }

  /* ---------------- the other hard gates ---------------- */
  section("G2 provenance — no orphan capabilities");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.orphan", provenance: { originType: "distilled" } }));
    const r = promote(reg, "cap.orphan", goodEvidence(), { now: now() });
    ok("distilled without an origin receipt quarantines at G2", r.quarantined && r.failedGate === "G2-provenance", r.reason);

    registerGenome(reg, makeGenome({ id: "cap.dangling", provenance: { originType: "derived", lineage: { parent: "cap.nobody", parentVersion: 1 } } }));
    const r2 = promote(reg, "cap.dangling", goodEvidence(), { now: now() });
    ok("derived with a missing parent quarantines at G2", r2.quarantined && r2.failedGate === "G2-provenance", r2.reason);
  }
  section("G3 dependencies — a capability cannot lean on a capability that isn't there");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.dep", dependencies: ["cap.ghost"] }));
    const r = promote(reg, "cap.dep", goodEvidence(), { now: now() });
    ok("dangling dependency quarantines at G3", r.quarantined && r.failedGate === "G3-dependencies", r.reason);
  }
  section("G4 regression — zero regressions, always");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.regr" }));
    const r = promote(reg, "cap.regr", { ...goodEvidence(), regressions: 2 }, { now: now() });
    ok("two regressions in the evidence -> quarantined", r.quarantined && r.failedGate === "G4-regression", r.reason);

    const reg2 = createGenomeRegistry();
    registerGenome(reg2, makeGenome({ id: "cap.never", evaluation: { required: true, gate: "hard" } }));
    const r2 = promote(reg2, "cap.never", { ...goodEvidence(), evaluated: 3, passed: 0, failed: 3 }, { now: now() });
    ok("evaluation required but 0 passed -> quarantined", r2.quarantined && r2.failedGate === "G4-regression", r2.reason);
  }

  /* ---------------- §70 trust grades ---------------- */
  section("§70 trust grades C0-C5 come from the provenance chain, never from claims");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.t1", provenance: { originType: "observed" } }));
    ok("observed, nothing else -> C1", trustGrade(reg, "cap.t1").grade === "C1", trustGrade(reg, "cap.t1").basis);

    promote(reg, "cap.t1", { ...goodEvidence(), replayed: true, crossVerifiedSeats: 1 }, { now: now() });
    ok("+ replayed -> C2", trustGrade(reg, "cap.t1").grade === "C2", trustGrade(reg, "cap.t1").basis);

    const reg2 = createGenomeRegistry();
    registerGenome(reg2, makeGenome({ id: "cap.t2", provenance: { originType: "distilled", originReceiptId: "rcpt-1" } }));
    ok("distilled + receipt but not replayed -> C2 (receipt held)", trustGrade(reg2, "cap.t2").grade === "C2", trustGrade(reg2, "cap.t2").basis);
    for (let i = 0; i < 5; i++) promote(reg2, "cap.t2", goodEvidence(), { now: now() });
    ok("...climbed to ACTIVE on one seat -> C3", latestVersion(reg2, "cap.t2")?.status === "ACTIVE" && trustGrade(reg2, "cap.t2").grade === "C3",
      trustGrade(reg2, "cap.t2").basis);

    const reg3 = createGenomeRegistry();
    registerGenome(reg3, makeGenome({ id: "cap.t3", provenance: { originType: "distilled", originReceiptId: "rcpt-3", verifiedSeats: 2 } }));
    for (let i = 0; i < 5; i++) promote(reg3, "cap.t3", { ...goodEvidence(), crossVerifiedSeats: 2 }, { now: now() });
    ok("receipt + replay + two seats -> C4", trustGrade(reg3, "cap.t3").grade === "C4", trustGrade(reg3, "cap.t3").basis);

    // C5: an ACTIVE child of an ACTIVE C3+ parent.
    const child = deriveChild(reg3, "cap.t3", { procedure: ["tighter steps"] }, now());
    ok("evolution makes a CHILD (version+1, CANDIDATE, derived lineage) — the parent is untouched",
      child.ok && child.genome?.version === 2 && child.genome?.status === "CANDIDATE"
        && child.genome?.provenance.originType === "derived"
        && child.genome?.provenance.lineage?.parentVersion === 1
        && latestVersion(reg3, "cap.t3")?.version === 2,
      child.reason ?? "");
    for (let i = 0; i < 4; i++) promote(reg3, "cap.t3", { ...goodEvidence(), crossVerifiedSeats: 2 }, { now: now() });
    ok("child climbed to ACTIVE over an ACTIVE C3+ parent -> C5",
      latestVersion(reg3, "cap.t3")?.status === "ACTIVE" && trustGrade(reg3, "cap.t3").grade === "C5",
      trustGrade(reg3, "cap.t3").basis);
  }

  /* ---------------- §45 monitoring + rollback ---------------- */
  section("§45 auto-rollback — regressions in production roll back without a human");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.live" }));
    for (let i = 0; i < 5; i++) promote(reg, "cap.live", goodEvidence(), { now: now() });
    ok("v1 is ACTIVE and is the current capability", currentFor(reg, "cap.live")?.version === 1);

    const child = deriveChild(reg, "cap.live", { procedure: ["new risky steps"] }, now());
    for (let i = 0; i < 4; i++) promote(reg, "cap.live", goodEvidence(), { now: now() });
    ok("v2 evolved and promoted to ACTIVE", currentFor(reg, "cap.live")?.version === 2);

    const m = monitor(reg, "cap.live", { ...goodEvidence(), regressions: 1 }, now());
    ok("one regression in monitoring -> v2 rolled back automatically",
      m.rolledBack && reg.genomes.get("cap.live@2")?.status === "ROLLED_BACK", m.reason);
    ok("the host FALLS BACK to v1 instead of failing (roll back, don't fail)", currentFor(reg, "cap.live")?.version === 1,
      `current=${currentFor(reg, "cap.live")?.version ?? "null"}`);

    // v2 is terminal; a new explicit rollback targets the current version (v1).
    const explicit = rollbackActive(reg, "cap.live", "governor pulled it", now());
    ok("an explicit governor rollback also works and lands in ROLLED_BACK (terminal for that version)",
      explicit.ok && reg.genomes.get("cap.live@1")?.status === "ROLLED_BACK");
    ok("after v1 rolls back, nothing is current — the host says 'off', not 'old'", currentFor(reg, "cap.live") === null);
  }

  /* ---------------- quarantine is not escapable by the engine ---------------- */
  section("only a named governor reopens a quarantine — and it re-climbs from UNDER_EVALUATION");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.q", provenance: { originType: "distilled" } })); // G2 will fail
    promote(reg, "cap.q", goodEvidence(), { now: now() });
    const sneaky = promote(reg, "cap.q", goodEvidence(), { now: now() });
    ok("the promotion path itself refuses to lift a quarantine", !sneaky.ok && sneaky.quarantined && sneaky.reason.includes("governorReopen"), sneaky.reason);

    const anon = governorReopen(reg, "cap.q", "  ");
    ok("an anonymous reopen is refused", !anon.ok, anon.reason);
    const reopen = governorReopen(reg, "cap.q", "governor:hq", now());
    ok("a named governor reopens into UNDER_EVALUATION (not into CANARY)",
      reopen.ok && reopen.to === "UNDER_EVALUATION", reopen.reason);
    const g = latestVersion(reg, "cap.q");
    ok("...and it still fails G2 on the next step, because the receipt is still missing",
      promote(reg, "cap.q", goodEvidence(), { now: now() }).failedGate === "G2-provenance" && g?.status === "QUARANTINED");
  }

  /* ---------------- §40 the signed package ---------------- */
  section("§40 signed capability package — digest-sealed, issuer-signed, tamper-evident");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.pkg", provenance: { originType: "distilled", originReceiptId: "rcpt-pkg" } }));
    for (let i = 0; i < 5; i++) promote(reg, "cap.pkg", goodEvidence(), { now: now() });
    const genome = latestVersion(reg, "cap.pkg")!;

    const pkg = await buildCapabilityPackage(genome, now());
    ok("package is digest-sealed over the canonical genome", /^[0-9a-f]{64}$/.test(pkg.digest) && pkg.format === "vh-capability-package/1");

    const v = await verifyCapabilityPackage(pkg);
    ok("a sealed package verifies" + (v.signed ? " WITH the issuer signature" : " (unsigned: signing unsupported here)"), v.ok, v.reasons.join("; "));
    if (signingSupported()) {
      ok("on this host the package carries a real Ed25519 signature from the receipt keychain",
        v.signed && !!pkg.signature && pkg.signature.alg === "EdDSA" && pkg.signature.keyId.startsWith("vouch-issuer-"));
    }

    const tampered = { ...pkg, genome: { ...pkg.genome, procedure: [...pkg.genome.procedure, "steal the budget"] } };
    const vt = await verifyCapabilityPackage(tampered);
    ok("one extra procedure step after sealing -> digest mismatch, verification FAILS",
      !vt.ok && vt.reasons.some((r) => r.includes("digest mismatch")), vt.reasons.join("; "));
  }

  /* ---------------- import is never trusted into ACTIVE ---------------- */
  section("an import re-earns its trust on THIS host — it lands in UNDER_EVALUATION");
  {
    const donor = createGenomeRegistry();
    registerGenome(donor, makeGenome({ id: "cap.imported", provenance: { originType: "distilled", originReceiptId: "rcpt-i" } }));
    for (let i = 0; i < 5; i++) promote(donor, "cap.imported", goodEvidence(), { now: now() });
    const pkg = await buildCapabilityPackage(latestVersion(donor, "cap.imported")!, now());

    const mine = createGenomeRegistry();
    const r = await importPackage(mine, pkg, now());
    ok("a verified ACTIVE package imports cleanly", r.ok, r.reason ?? "");
    ok("...but it lands in UNDER_EVALUATION, not ACTIVE (trust is earned per host)",
      r.genome?.status === "UNDER_EVALUATION", r.genome?.status);
    ok("nothing is current for the host until it re-climbs the chain", currentFor(mine, "cap.imported") === null);

    const bogus = { ...pkg, digest: "0".repeat(64) };
    const rb = await importPackage(mine, bogus, now());
    ok("a corrupted package is refused at import", !rb.ok && (rb.reason ?? "").includes("digest mismatch"), rb.reason ?? "");
  }

  /* ---------------- the M4 bridge ---------------- */
  section("M4 bridge — a VouchSkill is a genome, with its lineage intact");
  {
    const skill: VouchSkill = {
      id: "s42", name: "kitchen sink", version: 3,
      when: "dispatching a mission like: repaint the hallway",
      steps: ["verify the seats", "dispatch the team", "check the receipts"],
      tool: "dispatch_mission",
      bornReceiptId: "rcpt-m4-42", runs: 7, wins: 6, avgScore: 4.3, flagged: false,
      updatedAt: T0, mission: { missionId: "m9", team: "t1", verifiedSeats: 2, seatCount: 3, cycleNo: 4 },
    };
    const g = genomeFromVouchSkill(skill, now());
    ok("trigger/steps/tool map to the genome shape", g.trigger === skill.when && g.procedure.length === 3 && g.safety.permissionClass === "write-local");
    ok("bornReceiptId becomes the origin receipt (provenance is NOT lost in the bridge)",
      g.provenance.originType === "distilled" && g.provenance.originReceiptId === "rcpt-m4-42");
    ok("mission seats become verified seats (trust input survives)", g.provenance.verifiedSeats === 2);
    ok("an M4-distilled skill with a receipt climbs to ACTIVE at C4 — its 2 verified seats survive the bridge",
      (() => {
        const reg = createGenomeRegistry();
        registerGenome(reg, g);
        for (let i = 0; i < 5; i++) promote(reg, g.id, goodEvidence(), { now: now() });
        return latestVersion(reg, g.id)?.status === "ACTIVE" && trustGrade(reg, g.id).grade === "C4";
      })());

    const flagged = genomeFromVouchSkill({ ...skill, id: "s43", flagged: true }, now());
    ok("a flagged skill arrives with the flag in its declared failure modes — it cannot quietly arrive clean",
      flagged.failureModes.some((f) => f.includes("flagged for review")));
  }

  /* ---------------- the ledger round-trip ---------------- */
  section("the registry survives a file round-trip byte-for-byte (canonical)");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.led" }));
    for (let i = 0; i < 2; i++) promote(reg, "cap.led", goodEvidence(), { now: now() });
    const text = exportGenomeLedger(reg, now());
    const back = importGenomeLedger(text);
    const same = canonicalJson(Array.from(back.genomes.values()).sort((x, y) => x.id.localeCompare(y.id)))
      === canonicalJson(Array.from(reg.genomes.values()).sort((x, y) => x.id.localeCompare(y.id)));
    ok("export -> import -> identical canonical state (history included)", same);
    let threw = false;
    try { importGenomeLedger(JSON.stringify({ format: "something-else" })); } catch { threw = true; }
    ok("a foreign document is refused, not guessed", threw);
  }

  /* ---------------- terminal states stay terminal ---------------- */
  section("ACTIVE has no arrow out of the promotion path — evolution is a child, not a re-promotion");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.term" }));
    for (let i = 0; i < 5; i++) promote(reg, "cap.term", goodEvidence(), { now: now() });
    ok("v1 is ACTIVE", latestVersion(reg, "cap.term")?.status === "ACTIVE");
    const r = promote(reg, "cap.term", goodEvidence(), { now: now() });
    ok("a second promote on the same version is refused — the chain ends at ACTIVE",
      !r.ok && r.reason.includes("no forward promotion"), r.reason);
    ok("...and the registry still has exactly one version", reg.genomes.size === 1, String(reg.genomes.size));
  }
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.log("\nfailures:");
      for (const f of failures) console.log(`  - ${f}`);
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error("probe crashed:", e);
    process.exit(1);
  });
