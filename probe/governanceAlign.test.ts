/**
 * MJ 11.12.2 — governance alignment probe (external-review fixes).
 *
 * Pins the Authority Envelope mechanics (principal, attenuation subset rule,
 * expiry, revocation, scope check, signature) and the Ledger write-permission
 * matrix — the two governance gaps the external review named.
 */
import { issueRootEnvelope, attenuate, revoke, checkEnvelope, verifyEnvelope, isHumanPrincipal, type AuthorityEnvelope } from "../src/mission/custody";
import { canWrite, enforceWrite } from "../src/mission/ledger";
import { saveLessons } from "../src/mission/lessons";
import { saveSkills } from "../src/mission/skillEvolution";
import { saveBeliefs } from "../src/mission/belief";

// localStorage shim — the stores enforce BEFORE they persist, so a no-op store is enough.
if (typeof (globalThis as Record<string, unknown>).localStorage === "undefined") {
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

const NOW = 1_760_000_000_000;

section("1. authority envelopes — principal, attenuation, expiry, scope");
{
  const root = await issueRootEnvelope({
    principal: "human:runner",
    scope: ["run:team-mission", "spend:capped-by-ledger", "write:worktrees", "read:review-snapshot", "role:any"],
    expiresAt: NOW + 1000 * 60 * 30,
    now: NOW,
  });
  ok("root envelope traces to a human principal with a one-link chain", root.principal === "human:runner" && root.delegationChain.length === 1);
  ok("root envelope verifies", (await verifyEnvelope(root)).ok === true);

  const att = await attenuate(root, "seat:coder", ["role:any", "write:worktrees", "spend:capped-by-ledger"], { now: NOW + 1 });
  ok("attenuation to a subset succeeds and extends the delegation chain", !!att.envelope && att.envelope.delegationChain.join(",") === "human:runner,seat:coder");
  ok("a child cannot outlive its parent", att.envelope !== null && (att.envelope.expiresAt ?? Infinity) <= (root.expiresAt ?? Infinity));

  const grow = await attenuate(root, "seat:evil", ["role:any", "delete:production"], { now: NOW + 1 });
  ok("attenuation that would GROW scope is refused, with the offending scope named", grow.envelope === null && grow.reason.includes("delete:production"), grow.reason);

  const outlive = await attenuate(root, "seat:late", ["role:any"], { expiresAt: NOW + 1000 * 60 * 90, now: NOW + 1 });
  ok("a child expiry beyond the parent is refused", outlive.envelope === null);

  ok("in-scope action inside the window executes", checkEnvelope(root, "run:team-mission", NOW + 10).ok === true);
  ok("out-of-scope action is architecturally unable", checkEnvelope(root, "write:production-db", NOW + 10).ok === false);
  ok("an expired envelope refuses everything", checkEnvelope(root, "run:team-mission", NOW + 1000 * 60 * 31).ok === false);
  ok("a revoked envelope refuses everything", checkEnvelope(revoke(root, "principal cancelled the mission"), "run:team-mission", NOW + 10).ok === false);
  ok("no envelope → no execution without traced authority", checkEnvelope(null, "run:team-mission", NOW).ok === false);

  const tampered = { ...root, scope: [...root.scope, "write:production-db"] };
  ok("tampering with a signed envelope fails verification", (await verifyEnvelope(tampered)).ok === false);
}

section("2. the ledger write-permission matrix");
{
  ok("agents may NOT write DOCTRINE (propose only)", canWrite("DOCTRINE", "agent").ok === false);
  ok("humans write DOCTRINE", canWrite("DOCTRINE", "human").ok === true);
  ok("agents may NOT install strategies or skills (RECOURSE)", canWrite("RECOURSE", "agent").ok === false);
  ok("the measured experiment writes RECOURSE", canWrite("RECOURSE", "experiment").ok === true);
  ok("measured runs write SCAR", canWrite("SCAR", "agent").ok === true);
  ok("the experiment writes no episodes", canWrite("PRECEDENT", "experiment").ok === false);
}

section("3. the human-principal invariant is mechanical (11.12.3)");
{
  ok("human-format principals pass", isHumanPrincipal("human:runner") && isHumanPrincipal("human:a.b-c_9"));
  ok("agent/empty/ill-formed principals fail the format", !isHumanPrincipal("agent:foo") && !isHumanPrincipal("") && !isHumanPrincipal("human:") && !isHumanPrincipal("Human:runner") && !isHumanPrincipal("human:a b"));
  let threw = false;
  try {
    await issueRootEnvelope({ principal: "agent:foo", scope: ["run:team-mission"], expiresAt: NOW + 1000, now: NOW });
  } catch (e) { threw = String(e).includes("not a human principal"); }
  ok("issueRootEnvelope REFUSES to sign for a non-human root principal", threw);

  const root = await issueRootEnvelope({ principal: "human:runner", scope: ["run:team-mission", "role:any"], expiresAt: NOW + 1000 * 60 * 30, now: NOW });
  const forged = { ...root, principal: "agent:foo", delegationChain: ["agent:foo"] } as AuthorityEnvelope;
  const att = await attenuate(forged, "seat:coder", ["role:any"], { now: NOW + 1 });
  ok("attenuation refuses to delegate from a non-human root", att.envelope === null && att.reason.includes("not human-format"), att.reason);
  ok("verification flags a hand-rolled envelope with a non-human principal", (await verifyEnvelope(forged)).ok === false);
}

section("4. governed writes pass through the matrix at the store boundary (11.12.3)");
{
  let doctrineThrow = false;
  try { enforceWrite("DOCTRINE", "agent"); } catch { doctrineThrow = true; }
  ok("enforceWrite blocks an agent DOCTRINE write", doctrineThrow);

  let recourseThrow = false;
  try { enforceWrite("RECOURSE", "agent"); } catch { recourseThrow = true; }
  ok("enforceWrite blocks an agent RECOURSE install", recourseThrow);

  let allowed = true;
  try { enforceWrite("DOCTRINE", "human"); enforceWrite("RECOURSE", "experiment"); enforceWrite("SCAR", "agent"); } catch { allowed = false; }
  ok("permitted writers still pass", allowed);

  const approvedSkill = [{ id: "s1", name: "x", description: "", status: "approved", sourceMissionId: "m1", createdAt: NOW }] as never[];
  let agentInstallThrow = false;
  try { saveSkills(approvedSkill as never, "agent"); } catch { agentInstallThrow = true; }
  ok("saveSkills refuses an agent installing an approved skill", agentInstallThrow);
  let humanInstall = true;
  try { saveSkills(approvedSkill as never, "human"); } catch { humanInstall = false; }
  ok("saveSkills allows a human approval to persist", humanInstall);
  let proposalFree = true;
  try { saveSkills([{ ...approvedSkill[0], status: "proposed" }] as never, "agent"); } catch { proposalFree = false; }
  ok("proposals stay free evidence — agents may propose, never install", proposalFree);

  const scar = [{ id: "l1", kind: "failure", text: "tsc before commit", evidence: [], createdAt: NOW, useCount: 0 }] as never[];
  let agentScar = true;
  try { saveLessons(scar as never, "agent"); } catch { agentScar = false; }
  let experimentEpisodeThrow = false;
  try { saveLessons(scar as never, "experiment"); } catch { experimentEpisodeThrow = true; }
  ok("measured runs write SCAR; the experiment writes no episodes", agentScar && experimentEpisodeThrow);

  let stanceOk = true;
  try { saveBeliefs([], "agent"); } catch { stanceOk = false; }
  ok("the runtime persists STANCE", stanceOk);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
