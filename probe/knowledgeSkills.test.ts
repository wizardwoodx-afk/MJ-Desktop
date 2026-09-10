/**
 * MJ 12.1.0 — the KNOWLEDGE FORGE probe.
 *
 * Books → skills, done MJ's way: documents are distilled locally into
 * structured knowledge PROPOSALS (mechanical extractor core, optional LLM
 * pass through the machine's own harness CLIs), and nothing installs without
 * a human decision. Guardlines pinned here:
 *
 *   G1 content validated + provenance mandatory (source name, real SHA-256,
 *      byte length, tool+version, distiller identity, date).
 *   G2 no structure → no proposal: unstructured blobs are refused in words.
 *   G3 nothing installs silently; one human decision per proposal, recorded
 *      with identity; a second decision is refused.
 *   G4 knowledge ≠ learning: proposals claim no measured effect, never touch
 *      lessons/autonomy/bandit, and ride briefings labelled [knowledge].
 *   G5 the LLM pass is best-effort with an honest fallback — missing harness
 *      or garbage output degrades to mechanical, written into the proposal,
 *      never credited to a model that did not produce it.
 *   G6 approval mirrors into the shared skill memory as an approved RECOURSE
 *      (human governed write) and then rides every future briefing via the
 *      SAME approvedSkillDefs path verified-mission skills use.
 */
const memStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => void memStore.set(k, String(v)),
  removeItem: (k: string) => void memStore.delete(k),
  clear: () => memStore.clear(),
  key: (i: number) => [...memStore.keys()][i] ?? null,
  get length() {
    return memStore.size;
  },
} as Storage;

import * as fs from "node:fs";
import * as path from "node:path";
import {
  proposeKnowledgeSkill,
  decideKnowledgeProposal,
  loadKnowledgeProposals,
  extractStructure,
  classifyEndpoint,
  defaultVendorFor,
  loopbackHost,
  type ForgeDeps,
} from "../src/mission/knowledgeSkills";
import { loadSkills } from "../src/mission/skillEvolution";
import { loadLessons } from "../src/mission/lessons";
import { loadAutonomy } from "../src/mission/autonomyStore";
import { briefingForMission } from "../src/mission/selfEvolveRuntime";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}`);
}

const DOC = `# Authorize: a design rulebook

## The framework
A capability-not-data authorization framework: every action names the capability it needs; the caller either holds it or is refused before any write.
- Never check "who" before "what" → decide by capability first.
- When a token is revoked, in-flight requests must be refused within the same gate → short-lived grants.
- Always pair a new write path with a matching audit event before it ships.
- If a request lacks an explicit capability, prefer refusal to default-allow.
- Only attenuate authority: a child may tighten scope, never widen it.

## Anti-patterns
- Do not cache authorization decisions past the token's expiry window.
- Avoid default-allow unless the caller proved possession of the capability.

\`\`\`ts
// pattern: capability check precedes any side effect
if (!caps.has(action)) throw new Refusal("capability:" + action);
\`\`\`
`;

const UNSTRUCTURED = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(8);

function scriptedDeps(opts: { missing?: boolean; garbage?: boolean; throwIt?: boolean; env?: Record<string, string>; codexOk?: boolean }): ForgeDeps {
  return {
    resolveBin: async (bin) => (opts.missing ? null : bin === "codex" && !opts.codexOk ? null : `/usr/local/bin/${bin}`),
    readEnv: opts.env === undefined ? undefined : async (names) => names.map((n) => (opts.env ? opts.env[n] ?? null : null)),
    cliInvoke: async () => {
      if (opts.throwIt) throw new Error("harness crashed");
      if (opts.garbage) return { exitCode: 0, stdout: "I am not JSON at all", stderr: "", timedOut: false };
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          title: "LLM Authorize",
          summary: "LLM summary of the rulebook",
          procedure: "Check capability before any side effect; refuse by default.",
          decisionRules: ["capability first"],
          knownFailureModes: ["stale grants after revocation"],
        }),
        stderr: "",
        timedOut: false,
      };
    },
  };
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function main(): Promise<void> {
  section("0. the extractor is structural, deterministic and refuse-honest");
  const ex = extractStructure(DOC);
  ok("headings/frameworks are found", ex.frameworks.some((f) => /framework/i.test(f)), ex.frameworks.join("|"));
  ok("decision rules with 'never/when/only' arrows are extracted", ex.decisionRules.length >= 3, `${ex.decisionRules.length} rules`);
  ok("a second run extracts the identical structure (determinism)", JSON.stringify(ex) === JSON.stringify(extractStructure(DOC)));

  section("1. G1/G2 — provenance mandatory, structure required");
  const tooSmall = await proposeKnowledgeSkill({ content: "tiny", sourceName: "x.md" });
  ok("a too-small document is refused in words", !tooSmall.ok && /too small/.test(tooSmall.error ?? ""), tooSmall.error ?? "");
  const blob = await proposeKnowledgeSkill({ content: UNSTRUCTURED, sourceName: "blob.txt" });
  ok("an unstructured blob is refused (structure, not summaries)", !blob.ok && /no extractable structure/.test(blob.error ?? ""), blob.error ?? "");
  ok("refusals touched no store", loadKnowledgeProposals().length === 0);
  const p1 = await proposeKnowledgeSkill({ content: DOC, sourceName: "authorize-rulebook.md" });
  ok("a structured document distills into a proposal", p1.ok === true && p1.proposal.status === "proposed");
  const prop = (p1 as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal;
  const expectSha = await sha256(DOC.trim());
  ok("provenance carries the REAL SHA-256 of the content (64 hex)", prop.provenance.sourceSha256 === expectSha && /^[0-9a-f]{64}$/.test(prop.provenance.sourceSha256), prop.provenance.sourceSha256);
  ok("provenance carries source name, byte length, tool and time", prop.provenance.sourceName === "authorize-rulebook.md" && prop.provenance.byteLength === Buffer.byteLength(DOC.trim(), "utf8") && prop.provenance.tool === "vh-knowledge-forge/mechanical-v1" && prop.provenance.distilledAt.length > 0);
  ok("a mechanical proposal says so, with no model credit", prop.distiller.kind === "mechanical");
  ok("the proposal records it claims NO measured effect", prop.claimsMeasuredEffect === false);
  ok("the distilled procedure carries the extracted rules", prop.procedure.includes("Never check") && prop.procedure.includes("capability"), prop.procedure.slice(0, 120));
  ok("known failure modes admit the knowledge is not measured", /Not measured/.test(prop.knownFailureModes));
  ok("the proposal is pending human decision", prop.decidedBy === null && prop.decidedAt === null);

  section("2. G4 — knowledge never pretends to be learning");
  const lessons0 = loadLessons().length;
  const pulls0 = Object.values(loadAutonomy().bandit.arms).reduce((a, b) => a + b.pulls, 0);
  const p1b = await proposeKnowledgeSkill({ content: DOC, sourceName: "authorize-rulebook.md" });
  ok("re-distilling the same document gives the same content hash, a fresh id", (p1b as { ok: true }).ok && (p1b as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal.provenance.sourceSha256 === expectSha && (p1b as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal.id !== prop.id);
  ok("proposing knowledge touched no lesson memory", loadLessons().length === lessons0, `before=${lessons0} after=${loadLessons().length}`);
  ok("proposing knowledge moved no bandit pull", Object.values(loadAutonomy().bandit.arms).reduce((a, b) => a + b.pulls, 0) === pulls0);
  ok("proposals do not enter the shared skill memory while pending", loadSkills().length === 0);

  section("3. G5 — the LLM pass is best-effort with an honest fallback");
  const llmOk = await proposeKnowledgeSkill({ content: DOC, sourceName: "ch3.md", llm: { harness: "claude", deps: scriptedDeps({}) } });
  const llmP = (llmOk as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal;
  ok("with a reachable harness the proposal is distiller=llm with the harness named", llmP.distiller.kind === "llm" && llmP.distiller.harness === "claude", JSON.stringify(llmP.distiller));
  ok("LLM-derived procedure is folded in and labelled as LLM-distilled", llmP.procedure.includes("LLM-distilled guidance") && llmP.procedure.includes("capability before any side effect"));
  ok("LLM-known failure modes ride the proposal", llmP.knownFailureModes.includes("stale grants"));
  const noBin = await proposeKnowledgeSkill({ content: DOC, sourceName: "x2.md", llm: { harness: "codex", deps: scriptedDeps({ missing: true }) } });
  const nb = (noBin as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal;
  ok("a requested but missing harness degrades to mechanical with the reason written in", nb.distiller.kind === "mechanical" && /no local binary/.test(nb.distiller.note ?? ""), JSON.stringify(nb.distiller));
  const gar = await proposeKnowledgeSkill({ content: DOC, sourceName: "x3.md", llm: { harness: "opencode", deps: scriptedDeps({ garbage: true }) } });
  const gp = (gar as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal;
  ok("a garbage LLM answer degrades to mechanical — never credited to the model", gp.distiller.kind === "mechanical" && /no usable structure/.test(gp.distiller.note ?? ""), JSON.stringify(gp.distiller));
  const thr = await proposeKnowledgeSkill({ content: DOC, sourceName: "x4.md", llm: { harness: "opencode", deps: scriptedDeps({ throwIt: true }) } });
  const tp = (thr as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal;
  ok("a crashing harness degrades to mechanical with the failure written in", tp.distiller.kind === "mechanical" && /failed/.test(tp.distiller.note ?? ""), JSON.stringify(tp.distiller));

  section("3b. 12.1.1 — renderer safety + data-handling honesty");
  const forgeSrc = fs.readFileSync(path.join(process.cwd(), "src/mission/knowledgeSkills.ts"), "utf8");
  ok("the forge module is renderer-safe — no Node-global Buffer anywhere in it", !/\bBuffer\./.test(forgeSrc), "Buffer.* still referenced");
  ok("byte provenance uses TextEncoder, not a Node global", /new TextEncoder\(\)\.encode\(content\)\.byteLength/.test(forgeSrc), "TextEncoder byte length not found");
  ok("a mechanical proposal records dataHandling: local (content never left the machine)", (prop as import("../src/mission/knowledgeSkills").KnowledgeProposal).dataHandling === "local");
  ok("an invoked cloud-LLM pass records dataHandling: provider (content went to the harness's model provider)", (llmP as import("../src/mission/knowledgeSkills").KnowledgeProposal).dataHandling === "provider");
  ok("a missing-binary pass never invoked a CLI and stays local", (nb as import("../src/mission/knowledgeSkills").KnowledgeProposal).dataHandling === "local");
  ok("a garbage-output pass DID invoke the CLI — provider, even though the answer was unusable", (gp as import("../src/mission/knowledgeSkills").KnowledgeProposal).dataHandling === "provider");
  ok("a crashing pass DID invoke the CLI — provider, honestly recorded", (tp as import("../src/mission/knowledgeSkills").KnowledgeProposal).dataHandling === "provider");
  const pageSrc = fs.readFileSync(path.join(process.cwd(), "src/pages/LoopPage.tsx"), "utf8");
  ok("the Loop page discloses provider-sent content before a cloud pass", pageSrc.includes("sends the document to that harness's configured model provider") && pageSrc.includes("Mechanical distillation is fully local"));
  ok("proposal cards show the data-handling chip", pageSrc.includes("data: sent to provider") && pageSrc.includes("data: local"));
  ok("positioning is honest: no claim that extraction proves the knowledge correct", !forgeSrc.includes("the provable way") && /structured knowledge proposals|extract structure, not summaries/.test(forgeSrc), "wording drifted");

  section("3c. 12.2.0 — provider precision: vendor + endpoint class, no guessing");
  ok("default vendor mapping is honest (claude→Anthropic, codex→OpenAI, opencode→configurable)", defaultVendorFor("claude") === "Anthropic" && defaultVendorFor("codex") === "OpenAI" && /configurable/.test(defaultVendorFor("opencode")) && defaultVendorFor("mystery") === "mystery's configured provider");
  ok("loopback detection covers localhost/127.0.0.1/::1", loopbackHost("localhost") && loopbackHost("127.0.0.1") && loopbackHost("::1") && !loopbackHost("api.anthropic.com"));
  const cc1 = classifyEndpoint(null);
  ok("no override → cloud-default (the harness's default cloud)", cc1.endpointClass === "cloud-default" && /no endpoint override/.test(cc1.note));
  const cc2 = classifyEndpoint("http://localhost:11434");
  ok("loopback override → local-configured with the reason written", cc2.endpointClass === "local-configured" && /loopback/.test(cc2.note));
  const cc3 = classifyEndpoint("https://gateway.corp.example");
  ok("non-loopback override → unknown (MJ cannot tell where a proxy terminates)", cc3.endpointClass === "unknown" && /cannot determine/.test(cc3.note));
  const cc4 = classifyEndpoint("not a url at all");
  ok("invalid override URL → unknown, never a guess", cc4.endpointClass === "unknown");
  const det = await proposeKnowledgeSkill({ content: DOC, sourceName: "detected.md", llm: { harness: "claude", deps: scriptedDeps({ env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:11434" } }) } });
  const detP = (det as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal;
  ok("a detected loopback override records local-configured with basis=detected", detP.dataHandling === "provider" && detP.providerInfo?.endpointClass === "local-configured" && detP.providerInfo.endpointBasis === "detected" && detP.providerInfo.vendor === "Anthropic", JSON.stringify(detP.providerInfo));
  const cloudDet = await proposeKnowledgeSkill({ content: DOC, sourceName: "detected-cloud.md", llm: { harness: "claude", deps: scriptedDeps({ env: {} }) } });
  const cdP = (cloudDet as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal;
  ok("detected empty override env → cloud-default with basis=detected", cdP.providerInfo?.endpointClass === "cloud-default" && cdP.providerInfo.endpointBasis === "detected" && cdP.providerInfo.note.includes("no endpoint override"), JSON.stringify(cdP.providerInfo));
  const noVis = await proposeKnowledgeSkill({ content: DOC, sourceName: "novis.md", llm: { harness: "claude", deps: scriptedDeps({}) } });
  const nvP = (noVis as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal;
  ok("no env reader + no declaration → endpoint unknown, basis=not-visible, reason written", nvP.providerInfo?.endpointClass === "unknown" && nvP.providerInfo.endpointBasis === "not-visible" && /cannot see/.test(nvP.providerInfo.note), JSON.stringify(nvP.providerInfo));
  const declL = await proposeKnowledgeSkill({ content: DOC, sourceName: "declared-local.md", llm: { harness: "codex", deps: scriptedDeps({ codexOk: true }), declaredEndpoint: "local" } });
  const dlP = (declL as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal;
  ok("user-declared local → local-configured with basis=user-declared", dlP.providerInfo?.endpointClass === "local-configured" && dlP.providerInfo.endpointBasis === "user-declared" && dlP.providerInfo.vendor === "OpenAI", JSON.stringify(dlP.providerInfo));
  const declC = await proposeKnowledgeSkill({ content: DOC, sourceName: "declared-cloud.md", llm: { harness: "claude", deps: scriptedDeps({ codexOk: false }), declaredEndpoint: "cloud" } });
  const dcP = (declC as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal;
  ok("user-declared cloud → cloud-default with basis=user-declared", dcP.providerInfo?.endpointClass === "cloud-default" && dcP.providerInfo.endpointBasis === "user-declared");
  const localOnly = await proposeKnowledgeSkill({ content: DOC, sourceName: "local-only.md" });
  ok("mechanical-only proposals carry NO providerInfo (nothing went anywhere)", (localOnly as { ok: true }).ok && (localOnly as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal.dataHandling === "local" && (localOnly as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal.providerInfo === null);

  section("4. G3/G6 — one human decision, governed mirror, briefing integration");
  const bad = decideKnowledgeProposal({ id: "kn-nope", decision: "APPROVED", by: "probe-human" });
  ok("deciding an unknown proposal is refused", !bad.ok && /no knowledge proposal/.test(bad.error ?? ""), bad.error ?? "");
  const reject = decideKnowledgeProposal({ id: prop.id, decision: "REJECTED", by: "probe-human", note: "not for our stack" });
  ok("a REJECTED proposal is recorded with identity, reason and time", reject.ok && reject.proposal.status === "discarded" && reject.proposal.decidedBy === "probe-human" && reject.proposal.decidedNote === "not for our stack" && reject.proposal.decidedAt !== null);
  ok("a rejection mirrored nothing into skill memory", reject.ok && reject.mirrored === false && loadSkills().length === 0);
  const again = decideKnowledgeProposal({ id: prop.id, decision: "APPROVED", by: "probe-human" });
  ok("a second decision on the same proposal is refused (one decision per proposal)", !again.ok && /already/.test(again.error ?? ""), again.error ?? "");
  const beforeBrief = briefingForMission("harden the authorize gate", Date.now()).join("\n");
  ok("the pending/discarded knowledge does not ride briefings yet", !beforeBrief.includes("authorize-rulebook") && !beforeBrief.includes("[knowledge]"), beforeBrief.slice(0, 200));
  const acc = decideKnowledgeProposal({ id: llmP.id, decision: "APPROVED", by: "probe-human" });
  ok("an APPROVED knowledge proposal mirrors into the shared skill memory", acc.ok && acc.mirrored === true && loadSkills().length === 1);
  const mirrored = loadSkills()[0];
  ok("the mirror is an approved [knowledge] RECOURSE with knowledge provenance", mirrored.source === "knowledge" && mirrored.status === "approved" && mirrored.description.startsWith("[knowledge]") && mirrored.sourceMissionId.startsWith("knowledge:"), JSON.stringify({ source: mirrored.source, id: mirrored.sourceMissionId }));
  const afterBrief = briefingForMission("harden the authorize gate", Date.now()).join("\n");
  ok("the approved knowledge rides future mission briefings via the SAME path as learned skills", afterBrief.includes("[knowledge]") && afterBrief.includes(mirrored.name), afterBrief.slice(0, 300));
  ok("the approving human is the recorded decider on the knowledge record", loadKnowledgeProposals().find((p) => p.id === llmP.id)?.decidedBy === "probe-human");
  const dup = await proposeKnowledgeSkill({ content: DOC, sourceName: mirrored.name, llm: { harness: "claude", deps: scriptedDeps({}) } });
  const dupId = (dup as { ok: true; proposal: import("../src/mission/knowledgeSkills").KnowledgeProposal }).proposal.id;
  const dupAcc = decideKnowledgeProposal({ id: dupId, decision: "APPROVED", by: "probe-human" });
  ok("mirroring dedupes by name+source — no duplicate knowledge lines in briefings", dupAcc.ok && loadSkills().length === 1, `skills=${loadSkills().length}`);

  console.log(`\n========================================`);
  console.log(`KNOWLEDGE SKILLS PROBE SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("knowledgeSkills probe crashed:", err);
  process.exit(1);
});
