import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// src/app/id.ts
function uid(prefix) {
  n += 1;
  return `${prefix}-${Date.now().toString(36)}-${n.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
var n;
var init_id = __esm({
  "src/app/id.ts"() {
    "use strict";
    n = 0;
  }
});

// src/version.ts
var MJ_VERSION, MJ_VERSION_SHORT, MJ_TITLE;
var init_version = __esm({
  "src/version.ts"() {
    "use strict";
    MJ_VERSION = "14.1.1";
    MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");
    MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;
  }
});

// probe/knowledgeSkills.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/mission/knowledgeSkills.ts
init_id();

// src/mission/lessons.ts
var DECAY_PER_DAY = 0.95;
var RETRIEVE_K = 3;
var LS_KEY = "mj.lessons.v1";
function decayedStrength(l, now) {
  const days = Math.max(0, (now - l.createdAt) / 864e5);
  return l.strength * Math.pow(DECAY_PER_DAY, days);
}
function tokens(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
}
function retrieveLessons(memory2, goal, k, now) {
  const g = tokens(goal);
  const scored = memory2.map((l) => {
    const t = tokens(l.text);
    let overlap = 0;
    g.forEach((w) => {
      if (t.has(w)) overlap += 1;
    });
    const recency = 1 / (1 + (now - l.lastUsedAt) / 864e5);
    return { l, score: decayedStrength(l, now) * (1 + overlap) * (0.5 + 0.5 * recency) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.l);
}
function retrieveCausal(memory2, condition, k, now) {
  const c = tokens(condition);
  const causalText = (l) => l.causal ? [l.causal.decision, l.causal.action, l.causal.observation, l.causal.outcome].filter(Boolean).join(" ") : "";
  const scored = memory2.filter((l) => l.causal).map((l) => {
    const t = tokens(causalText(l));
    let overlap = 0;
    c.forEach((w) => {
      if (t.has(w)) overlap += 1;
    });
    return { l, score: overlap === 0 ? 0 : decayedStrength(l, now) * overlap };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((x) => x.l);
}
function lessonsForBriefing(memory2, goal, now) {
  const scars = retrieveLessons(memory2.filter((l) => l.kind === "failure"), goal, RETRIEVE_K, now);
  const scarIds = new Set(scars.map((l) => l.id));
  const rest = retrieveLessons(memory2, goal, RETRIEVE_K, now).filter((l) => !scarIds.has(l.id));
  return [...scars, ...rest].slice(0, RETRIEVE_K).map(
    (l) => l.kind === "failure" ? `[org memory scar] ${l.text}` : `[org memory] ${l.text}`
  );
}
function loadLessons() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.filter((l) => l && typeof l.text === "string");
    }
  } catch {
  }
  return [];
}

// src/mission/selfImprove.ts
var LS_KEY2 = "mj.selfimprove.v1";
var BASE_PARAMS = {
  reviewDepth: 1,
  checkBias: 0.5,
  serialExec: false,
  lessonBudget: 3,
  mosaic: false
};
function initialState(now) {
  const v = {
    id: "strategy-v1",
    gen: 1,
    params: { ...BASE_PARAMS },
    parentId: null,
    status: "adopted",
    score: null,
    evaluatedOn: 0,
    note: "baseline \u2014 shipped defaults; measured on the runs it itself governs",
    createdAt: now
  };
  return { versions: [v], adoptedId: v.id };
}
function loadImprovement() {
  try {
    const raw = localStorage.getItem(LS_KEY2);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.versions) && p.versions.length > 0) return p;
    }
  } catch {
  }
  return initialState(Date.now());
}
function adoptedVersion(s) {
  return s.versions.find((v) => v.id === s.adoptedId) ?? null;
}
function nextAssignment(s, runs) {
  const baseline = adoptedVersion(s);
  const candidate = s.versions.find((v) => v.status === "candidate") ?? null;
  if (!candidate) return baseline;
  if (!baseline) return candidate;
  const cN = runs.filter((r) => r.strategyId === candidate.id).length;
  const bN = runs.filter((r) => r.strategyId === baseline.id).length;
  return cN <= bN ? candidate : baseline;
}

// src/mission/ledger.ts
function canWrite(type, writer) {
  switch (type) {
    case "STANCE":
      return writer === "agent" || writer === "human" ? { ok: true, reason: "STANCE is live turn state; the runtime writes it" } : { ok: false, reason: "the experiment writes no live state" };
    case "PRECEDENT":
    case "SCAR":
      return writer === "agent" || writer === "human" ? { ok: true, reason: `${type} is written from MEASURED run facts only (reflection enforces this)` } : { ok: false, reason: "the experiment settles strategies, not episodes" };
    case "DOCTRINE":
      return writer === "human" ? { ok: true, reason: "house rules are human-written" } : { ok: false, reason: `DOCTRINE is human-only; ${writer} may propose, never write` };
    case "RECOURSE":
      return writer === "experiment" || writer === "human" ? { ok: true, reason: "RECOURSE changes only via measured adoption or human approval" } : { ok: false, reason: "an agent run cannot install strategies or skills on its own" };
  }
}
function enforceWrite(type, writer) {
  const v = canWrite(type, writer);
  if (!v.ok) throw new Error(`ledger: refused \u2014 ${writer} may not write ${type} (${v.reason})`);
}

// src/mission/skillEvolution.ts
var PROPOSAL_CAP = 20;
var LS_KEY3 = "mj.skills.v1";
function mergeProposals(memory2, fresh) {
  const next = [...memory2];
  for (const f of fresh) {
    if (!next.some((p) => p.name === f.name && p.source === f.source)) next.push(f);
  }
  return next.slice(-PROPOSAL_CAP);
}
function approvedSkillDefs(memory2) {
  return memory2.filter((p) => p.status === "approved").map((p) => ({
    id: `learned:${p.id}`,
    label: `\u2605 ${p.name}`,
    description: p.description,
    learnedFrom: p.sourceMissionId
  }));
}
function loadSkills() {
  try {
    const raw = localStorage.getItem(LS_KEY3);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
}
function saveSkills(memory2, writer = "human") {
  for (const m of memory2) if (m.status === "approved") enforceWrite("RECOURSE", writer);
  try {
    localStorage.setItem(LS_KEY3, JSON.stringify(memory2));
  } catch {
  }
}

// src/mission/knowledgeSkills.ts
var KNOWLEDGE_TOOL = "mj-knowledge-forge/mechanical-v1";
var LS_KEY4 = "mj.knowledgeSkills.v1";
var RULE_HINTS = /\b(must|never|always|only|when|if|avoid|prefer|before|after)\b/i;
var ARROW = /→|=>|->|⇒/;
function extractStructure(content) {
  const lines = content.split(/\r?\n/);
  const frameworks = [];
  const decisionRules = [];
  const codePatterns = [];
  const chapterHints = [];
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^```/.test(line)) {
      inFence = !inFence;
      if (!inFence && codePatterns.length < 8) codePatterns.push("fenced code block");
      continue;
    }
    if (inFence) continue;
    const heading = /^#{1,4}\s+(.+)$/.exec(line);
    if (heading) {
      const t = heading[1].replace(/[*_`]/g, "").trim();
      if (chapterHints.length < 24) chapterHints.push(t);
      if (/framework|model|pattern|principle|method|strategy|guide|checklist|design rule/i.test(t)) frameworks.push(t);
      continue;
    }
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    const text = bullet ? bullet[1] : line;
    if ((ARROW.test(text) || RULE_HINTS.test(text)) && text.length > 24 && text.length < 500 && decisionRules.length < 16) {
      decisionRules.push(text.replace(/^[-*•]\s*/, "").trim());
    }
  }
  return { frameworks, decisionRules, codePatterns, chapterHints };
}
async function sha256Hex(content) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function loadKnowledgeProposals() {
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY4);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
}
function saveKnowledgeProposals(memory2) {
  try {
    globalThis.localStorage?.setItem(LS_KEY4, JSON.stringify(memory2));
  } catch {
  }
}
var HARNESS_DEFAULT_VENDOR = {
  claude: "Anthropic",
  codex: "OpenAI",
  gemini: "Google",
  grok: "xAI",
  qwen: "Alibaba Qwen",
  opencode: "configurable (see opencode's own provider settings)",
  openclaude: "configurable",
  cursor: "configurable (Cursor's model picker)"
};
var HARNESS_ENV_OVERRIDES = {
  claude: ["ANTHROPIC_BASE_URL"],
  codex: ["OPENAI_BASE_URL"],
  opencode: ["OPENCODE_BASE_URL", "OPENAI_BASE_URL", "ANTHROPIC_BASE_URL"]
};
function defaultVendorFor(harness) {
  return HARNESS_DEFAULT_VENDOR[harness] ?? `${harness}'s configured provider`;
}
function loopbackHost(host) {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}
function classifyEndpoint(baseUrl) {
  if (!baseUrl || !baseUrl.trim()) {
    return { endpointClass: "cloud-default", note: "no endpoint override visible \u2014 the harness's default cloud provider" };
  }
  try {
    const host = new URL(baseUrl.trim()).hostname;
    if (loopbackHost(host)) {
      return { endpointClass: "local-configured", note: `endpoint override points at loopback (${host}) \u2014 content stays on this machine` };
    }
    return { endpointClass: "unknown", note: `endpoint override points at a non-loopback host (${host}) \u2014 MJ cannot determine where it terminates` };
  } catch {
    return { endpointClass: "unknown", note: "endpoint override is not a valid URL \u2014 MJ cannot determine where content goes" };
  }
}
var LLM_PROMPT = (content) => `You are a book-distiller. Extract STRUCTURE, not a summary, from the document below. Reply with ONLY a JSON object: {"title": string, "summary": string (<=2 lines), "procedure": string (compact step guidance), "decisionRules": string[], "knownFailureModes": string[]}. No markdown fences.

DOCUMENT:
${content.slice(0, 6e4)}`;
var MIN_CONTENT = 60;
var MAX_CONTENT = 4e5;
async function proposeKnowledgeSkill(args) {
  const content = (args.content ?? "").trim();
  if (content.length < MIN_CONTENT) {
    return { ok: false, error: `document too small (${content.length} chars; need >= ${MIN_CONTENT}) \u2014 nothing to distill` };
  }
  if (content.length > MAX_CONTENT) {
    return { ok: false, error: `document too large (${content.length} chars; cap ${MAX_CONTENT}) \u2014 distill a chapter, not a library` };
  }
  const structure = extractStructure(content);
  if (structure.frameworks.length === 0 && structure.decisionRules.length === 0 && structure.chapterHints.length === 0) {
    return { ok: false, error: "no extractable structure (headings, rules, frameworks) \u2014 MJ distills structure, not summaries; a raw blob is refused" };
  }
  const nowIso = args.nowIso ?? (/* @__PURE__ */ new Date()).toISOString();
  const sourceName = args.sourceName?.trim() || null;
  const sha = await sha256Hex(content);
  let distiller = { kind: "mechanical", note: null };
  let dataHandling = "local";
  let providerInfo = null;
  let llmProcedure = "";
  let llmFailureModes = [];
  if (args.llm) {
    try {
      const bin = await args.llm.deps.resolveBin?.(args.llm.harness);
      if (!bin) {
        distiller = { kind: "mechanical", note: `LLM distillation requested via "${args.llm.harness}" but no local binary was found \u2014 mechanical structure only` };
      } else {
        dataHandling = "provider";
        const vendor = defaultVendorFor(args.llm.harness);
        const overrideNames = HARNESS_ENV_OVERRIDES[args.llm.harness] ?? [];
        let endpoint;
        if (overrideNames.length > 0 && args.llm.deps.readEnv) {
          try {
            const vals = await args.llm.deps.readEnv(overrideNames);
            const found = vals.find((v) => typeof v === "string" && v.trim().length > 0);
            if (found === void 0) {
              endpoint = { endpointClass: "cloud-default", endpointBasis: "detected", note: "no endpoint override visible to MJ \u2014 the harness's default cloud provider" };
            } else {
              const c = classifyEndpoint(found);
              endpoint = { endpointClass: c.endpointClass, endpointBasis: "detected", note: c.note };
            }
          } catch {
            endpoint = { endpointClass: "unknown", endpointBasis: "not-visible", note: "MJ could not read the harness's endpoint override" };
          }
        } else if (args.llm.declaredEndpoint) {
          endpoint = args.llm.declaredEndpoint === "local" ? { endpointClass: "local-configured", endpointBasis: "user-declared", note: "you declared this harness uses a local model endpoint" } : { endpointClass: "cloud-default", endpointBasis: "user-declared", note: "you declared this harness uses its default cloud provider" };
        } else {
          endpoint = {
            endpointClass: "unknown",
            endpointBasis: "not-visible",
            note: `MJ runs ${args.llm.harness} with your environment and cannot see its endpoint override settings \u2014 the destination is whatever the harness's own configuration decides`
          };
        }
        providerInfo = { vendor, ...endpoint };
        const res = await args.llm.deps.cliInvoke?.({
          bin,
          argv: ["-p", LLM_PROMPT(content)],
          cwd: ".",
          timeoutSecs: 600
        });
        const stdout = (res?.stdout ?? "").trim();
        let parsed = null;
        if (stdout) {
          try {
            parsed = JSON.parse(stdout.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
          } catch {
            parsed = null;
          }
        }
        if (!res || res.exitCode !== 0 || res.timedOut || !parsed || typeof parsed.procedure !== "string" || !parsed.procedure.trim()) {
          distiller = { kind: "mechanical", note: `LLM distillation via "${args.llm.harness}" returned no usable structure \u2014 mechanical structure only` };
        } else {
          distiller = { kind: "llm", harness: args.llm.harness, note: null };
          llmProcedure = (typeof parsed.procedure === "string" ? parsed.procedure : "").trim();
          if (Array.isArray(parsed.knownFailureModes)) {
            llmFailureModes = parsed.knownFailureModes.filter((x) => typeof x === "string").slice(0, 8);
          }
        }
      }
    } catch (err) {
      distiller = { kind: "mechanical", note: `LLM distillation via "${args.llm.harness}" failed (${err instanceof Error ? err.message : String(err).slice(0, 120)}) \u2014 mechanical structure only` };
    }
  }
  const frameworks = structure.frameworks.slice(0, 12);
  const rules = structure.decisionRules.slice(0, 16);
  const summary = (structure.chapterHints.slice(0, 3).join(" / ") || "Untitled document") + (frameworks.length > 0 ? ` \u2014 frameworks: ${frameworks.slice(0, 4).join(", ")}` : "");
  const mechanicalProcedure = [
    ...frameworks.length > 0 ? [`Frameworks: ${frameworks.join("; ")}`] : [],
    ...rules.map((r) => `- ${r}`)
  ].join("\n");
  const procedure = llmProcedure ? `LLM-distilled guidance:
${llmProcedure}

Extracted rules:
${mechanicalProcedure}` : mechanicalProcedure || "Structured notes extracted from the source document.";
  const knownFailureModes = llmFailureModes.length > 0 ? llmFailureModes.join("\n- ") : "Not measured: knowledge skill \u2014 failures are only knowable after real use.";
  const proposal = {
    id: `kn-${uid("knw").slice(0, 14)}`,
    dataHandling,
    providerInfo,
    title: sourceName ?? structure.chapterHints[0] ?? "Knowledge skill",
    summary,
    procedure,
    preconditions: "The document source is owned by the operator (book/file with rights to read); this skill only applies to work it names.",
    toolStrategy: "Use the distilled rules as guidance during execution; treat them as human-approved knowledge, not as verified measurement.",
    verificationStrategy: "The repository's own verification gate still decides; this knowledge never bypasses GATE.",
    knownFailureModes,
    claimsMeasuredEffect: false,
    provenance: { sourceName, sourceSha256: sha, byteLength: new TextEncoder().encode(content).byteLength, tool: KNOWLEDGE_TOOL, distilledAt: nowIso },
    distiller,
    status: "proposed",
    decidedBy: null,
    decidedAt: null,
    decidedNote: null
  };
  const memory2 = loadKnowledgeProposals();
  memory2.push(proposal);
  saveKnowledgeProposals(memory2);
  return { ok: true, proposal };
}
function decideKnowledgeProposal(args) {
  const memory2 = loadKnowledgeProposals();
  const p = memory2.find((x) => x.id === args.id);
  if (!p) return { ok: false, error: `no knowledge proposal matches ${args.id}` };
  if (p.status !== "proposed") return { ok: false, error: `proposal ${args.id} was already ${p.status} \u2014 one decision per proposal` };
  const nowIso = args.nowIso ?? (/* @__PURE__ */ new Date()).toISOString();
  let mirrored = false;
  if (args.decision === "APPROVED") {
    const skills = loadSkills();
    const line = {
      id: `kn-${p.id.replace("kn-", "")}`,
      name: p.title.slice(0, 60),
      description: `[knowledge] ${p.summary.slice(0, 160)} \u2014 ${p.procedure.slice(0, 440)}`,
      source: "knowledge",
      sourceMissionId: `knowledge:${p.provenance.sourceSha256.slice(0, 16)}`,
      status: "approved",
      learnedAt: Date.parse(nowIso) || Date.now()
    };
    saveSkills(mergeProposals(skills, [line]), "human");
    mirrored = true;
  }
  p.status = args.decision === "APPROVED" ? "approved" : "discarded";
  p.decidedBy = args.by;
  p.decidedAt = nowIso;
  p.decidedNote = args.note ?? null;
  saveKnowledgeProposals(memory2);
  return { ok: true, proposal: p, mirrored };
}

// src/mission/elasticSeats.ts
var DEFAULT_ELASTIC_POLICY = {
  enabled: false,
  minSeats: 2,
  maxSeats: 9,
  unreviewedRatio: 1,
  failStreak: 2,
  scaleInIdleRuns: 3
};

// src/mission/evolutionBandit.ts
var DIMENSIONS = {
  review: ["review:shallow", "review:standard", "review:deep"],
  exec: ["exec:serial", "exec:wave"],
  check: ["check:lenient", "check:strict"]
};
var JUMP_ARM = "jump:structural";
function emptyBandit() {
  const arms = {};
  for (const list of Object.values(DIMENSIONS)) for (const id of list) arms[id] = { alpha: 1, beta: 1, pulls: 0 };
  arms[JUMP_ARM] = { alpha: 1, beta: 1, pulls: 0 };
  return { arms, totalPulls: 0, stagnationStreak: 0, bestVerifiedShare: null, history: [] };
}

// src/mission/autonomyStore.ts
var KEY = "mj.autonomy.v1";
var memory = null;
function loadAutonomy() {
  if (memory) return memory;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    memory = {
      bandit: raw?.bandit && raw.bandit.arms ? raw.bandit : emptyBandit(),
      elastic: { ...DEFAULT_ELASTIC_POLICY, ...raw?.elastic ?? {} },
      log: Array.isArray(raw?.log) ? raw.log.slice(-20) : [],
      idleRuns: typeof raw?.idleRuns === "number" ? raw.idleRuns : 0,
      recentFailed: Array.isArray(raw?.recentFailed) ? raw.recentFailed.slice(-4) : []
    };
    return memory;
  } catch {
    memory = { bandit: emptyBandit(), elastic: { ...DEFAULT_ELASTIC_POLICY }, log: [], idleRuns: 0, recentFailed: [] };
    return memory;
  }
}

// src/mission/belief.ts
var LS_KEY5 = "mj.beliefs.v1";
function needsApproval(b) {
  return b.provenance === "agent-inferred" && b.aboutUser && !b.approved;
}
function beliefsForBriefing(memory2, goal, now) {
  void now;
  const goalWords = goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const relevant = (b) => {
    if (needsApproval(b)) return false;
    const low = b.claim.toLowerCase();
    return b.klass === "contradicted" || b.isPrediction || goalWords.some((w) => low.includes(w));
  };
  const lines = [];
  for (const b of memory2.filter(relevant)) {
    if (b.isPrediction) lines.push(`[prediction \u2014 NOT evidence] ${b.claim}`);
    else if (b.klass === "contradicted") lines.push(`[belief contradicted] ${b.claim} \u2014 sources disagree; verify before acting on it`);
    else lines.push(`[belief ${b.klass}] ${b.claim} (${b.source})`);
  }
  return lines.slice(0, 6);
}
function loadBeliefs() {
  try {
    const raw = localStorage.getItem(LS_KEY5);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
}

// src/mission/selfEvolveRuntime.ts
init_version();
var RUNS_KEY = "mj.selfimprove.runs.v2";
var RUNS_KEY_V1 = "mj.selfimprove.runs.v1";
function loadExperimentRuns() {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
    const old = localStorage.getItem(RUNS_KEY_V1);
    if (old) {
      const p = JSON.parse(old);
      if (Array.isArray(p)) {
        const migrated = p.map((r) => ({ verified: r.verified, simulated: r.simulated, strategyId: null }));
        localStorage.setItem(RUNS_KEY, JSON.stringify(migrated.slice(-100)));
        localStorage.removeItem(RUNS_KEY_V1);
        return migrated;
      }
    }
  } catch {
  }
  return [];
}
function nextRunStrategy() {
  const v = nextAssignment(loadImprovement(), loadExperimentRuns());
  if (!v) return null;
  return { id: v.id, gen: v.gen, params: v.params, isCandidate: v.status === "candidate" };
}
function composeBriefing(lessons, skillLines, mosaicLines, goal, now, params) {
  const lines = lessonsForBriefing(lessons, goal, now);
  if (params.mosaic) for (const m of mosaicLines) lines.push(m);
  for (const d of skillLines) lines.push(d);
  return lines.slice(0, Math.max(0, params.lessonBudget) + 2 + (params.mosaic ? 4 : 0));
}
function briefingForMission(goal, now) {
  const assigned = nextRunStrategy();
  const params = assigned?.params ?? { reviewDepth: 1, checkBias: 0.5, serialExec: false, lessonBudget: 3, mosaic: false };
  const skillLines = approvedSkillDefs(loadSkills()).map((d) => `[learned skill ${d.label}] ${d.description}`);
  let mosaicLines = [];
  if (params.mosaic) {
    const mem = loadLessons();
    mosaicLines = [
      ...retrieveCausal(mem, goal, 2, now).map((l) => `[causal memory] tried: ${l.causal?.action ?? l.causal?.decision ?? "-"} \u2192 ${l.causal?.outcome ?? "-"}`),
      ...beliefsForBriefing(loadBeliefs(), goal, now)
    ];
  }
  return composeBriefing(loadLessons(), skillLines, mosaicLines, goal, now, params);
}

// probe/knowledgeSkills.test.ts
var memStore = /* @__PURE__ */ new Map();
globalThis.localStorage = {
  getItem: (k) => memStore.has(k) ? memStore.get(k) : null,
  setItem: (k, v) => void memStore.set(k, String(v)),
  removeItem: (k) => void memStore.delete(k),
  clear: () => memStore.clear(),
  key: (i) => [...memStore.keys()][i] ?? null,
  get length() {
    return memStore.size;
  }
};
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
var DOC = `# Authorize: a design rulebook

## The framework
A capability-not-data authorization framework: every action names the capability it needs; the caller either holds it or is refused before any write.
- Never check "who" before "what" \u2192 decide by capability first.
- When a token is revoked, in-flight requests must be refused within the same gate \u2192 short-lived grants.
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
var UNSTRUCTURED = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(8);
function scriptedDeps(opts) {
  return {
    resolveBin: async (bin) => opts.missing ? null : bin === "codex" && !opts.codexOk ? null : `/usr/local/bin/${bin}`,
    readEnv: opts.env === void 0 ? void 0 : async (names) => names.map((n2) => opts.env ? opts.env[n2] ?? null : null),
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
          knownFailureModes: ["stale grants after revocation"]
        }),
        stderr: "",
        timedOut: false
      };
    }
  };
}
async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function main() {
  section("0. the extractor is structural, deterministic and refuse-honest");
  const ex = extractStructure(DOC);
  ok("headings/frameworks are found", ex.frameworks.some((f) => /framework/i.test(f)), ex.frameworks.join("|"));
  ok("decision rules with 'never/when/only' arrows are extracted", ex.decisionRules.length >= 3, `${ex.decisionRules.length} rules`);
  ok("a second run extracts the identical structure (determinism)", JSON.stringify(ex) === JSON.stringify(extractStructure(DOC)));
  section("1. G1/G2 \u2014 provenance mandatory, structure required");
  const tooSmall = await proposeKnowledgeSkill({ content: "tiny", sourceName: "x.md" });
  ok("a too-small document is refused in words", !tooSmall.ok && /too small/.test(tooSmall.error ?? ""), tooSmall.error ?? "");
  const blob = await proposeKnowledgeSkill({ content: UNSTRUCTURED, sourceName: "blob.txt" });
  ok("an unstructured blob is refused (structure, not summaries)", !blob.ok && /no extractable structure/.test(blob.error ?? ""), blob.error ?? "");
  ok("refusals touched no store", loadKnowledgeProposals().length === 0);
  const p1 = await proposeKnowledgeSkill({ content: DOC, sourceName: "authorize-rulebook.md" });
  ok("a structured document distills into a proposal", p1.ok === true && p1.proposal.status === "proposed");
  const prop = p1.proposal;
  const expectSha = await sha256(DOC.trim());
  ok("provenance carries the REAL SHA-256 of the content (64 hex)", prop.provenance.sourceSha256 === expectSha && /^[0-9a-f]{64}$/.test(prop.provenance.sourceSha256), prop.provenance.sourceSha256);
  ok("provenance carries source name, byte length, tool and time", prop.provenance.sourceName === "authorize-rulebook.md" && prop.provenance.byteLength === Buffer.byteLength(DOC.trim(), "utf8") && prop.provenance.tool === "mj-knowledge-forge/mechanical-v1" && prop.provenance.distilledAt.length > 0);
  ok("a mechanical proposal says so, with no model credit", prop.distiller.kind === "mechanical");
  ok("the proposal records it claims NO measured effect", prop.claimsMeasuredEffect === false);
  ok("the distilled procedure carries the extracted rules", prop.procedure.includes("Never check") && prop.procedure.includes("capability"), prop.procedure.slice(0, 120));
  ok("known failure modes admit the knowledge is not measured", /Not measured/.test(prop.knownFailureModes));
  ok("the proposal is pending human decision", prop.decidedBy === null && prop.decidedAt === null);
  section("2. G4 \u2014 knowledge never pretends to be learning");
  const lessons0 = loadLessons().length;
  const pulls0 = Object.values(loadAutonomy().bandit.arms).reduce((a, b) => a + b.pulls, 0);
  const p1b = await proposeKnowledgeSkill({ content: DOC, sourceName: "authorize-rulebook.md" });
  ok("re-distilling the same document gives the same content hash, a fresh id", p1b.ok && p1b.proposal.provenance.sourceSha256 === expectSha && p1b.proposal.id !== prop.id);
  ok("proposing knowledge touched no lesson memory", loadLessons().length === lessons0, `before=${lessons0} after=${loadLessons().length}`);
  ok("proposing knowledge moved no bandit pull", Object.values(loadAutonomy().bandit.arms).reduce((a, b) => a + b.pulls, 0) === pulls0);
  ok("proposals do not enter the shared skill memory while pending", loadSkills().length === 0);
  section("3. G5 \u2014 the LLM pass is best-effort with an honest fallback");
  const llmOk = await proposeKnowledgeSkill({ content: DOC, sourceName: "ch3.md", llm: { harness: "claude", deps: scriptedDeps({}) } });
  const llmP = llmOk.proposal;
  ok("with a reachable harness the proposal is distiller=llm with the harness named", llmP.distiller.kind === "llm" && llmP.distiller.harness === "claude", JSON.stringify(llmP.distiller));
  ok("LLM-derived procedure is folded in and labelled as LLM-distilled", llmP.procedure.includes("LLM-distilled guidance") && llmP.procedure.includes("capability before any side effect"));
  ok("LLM-known failure modes ride the proposal", llmP.knownFailureModes.includes("stale grants"));
  const noBin = await proposeKnowledgeSkill({ content: DOC, sourceName: "x2.md", llm: { harness: "codex", deps: scriptedDeps({ missing: true }) } });
  const nb = noBin.proposal;
  ok("a requested but missing harness degrades to mechanical with the reason written in", nb.distiller.kind === "mechanical" && /no local binary/.test(nb.distiller.note ?? ""), JSON.stringify(nb.distiller));
  const gar = await proposeKnowledgeSkill({ content: DOC, sourceName: "x3.md", llm: { harness: "opencode", deps: scriptedDeps({ garbage: true }) } });
  const gp = gar.proposal;
  ok("a garbage LLM answer degrades to mechanical \u2014 never credited to the model", gp.distiller.kind === "mechanical" && /no usable structure/.test(gp.distiller.note ?? ""), JSON.stringify(gp.distiller));
  const thr = await proposeKnowledgeSkill({ content: DOC, sourceName: "x4.md", llm: { harness: "opencode", deps: scriptedDeps({ throwIt: true }) } });
  const tp = thr.proposal;
  ok("a crashing harness degrades to mechanical with the failure written in", tp.distiller.kind === "mechanical" && /failed/.test(tp.distiller.note ?? ""), JSON.stringify(tp.distiller));
  section("3b. 12.1.1 \u2014 renderer safety + data-handling honesty");
  const forgeSrc = fs.readFileSync(path.join(process.cwd(), "src/mission/knowledgeSkills.ts"), "utf8");
  ok("the forge module is renderer-safe \u2014 no Node-global Buffer anywhere in it", !/\bBuffer\./.test(forgeSrc), "Buffer.* still referenced");
  ok("byte provenance uses TextEncoder, not a Node global", /new TextEncoder\(\)\.encode\(content\)\.byteLength/.test(forgeSrc), "TextEncoder byte length not found");
  ok("a mechanical proposal records dataHandling: local (content never left the machine)", prop.dataHandling === "local");
  ok("an invoked cloud-LLM pass records dataHandling: provider (content went to the harness's model provider)", llmP.dataHandling === "provider");
  ok("a missing-binary pass never invoked a CLI and stays local", nb.dataHandling === "local");
  ok("a garbage-output pass DID invoke the CLI \u2014 provider, even though the answer was unusable", gp.dataHandling === "provider");
  ok("a crashing pass DID invoke the CLI \u2014 provider, honestly recorded", tp.dataHandling === "provider");
  const pageSrc = fs.readFileSync(path.join(process.cwd(), "src/pages/LoopPage.tsx"), "utf8");
  ok("the Loop page discloses provider-sent content before a cloud pass", pageSrc.includes("sends the document to that harness's configured model provider") && pageSrc.includes("Mechanical distillation is fully local"));
  ok("proposal cards show the data-handling chip", pageSrc.includes("data: sent to provider") && pageSrc.includes("data: local"));
  ok("positioning is honest: no claim that extraction proves the knowledge correct", !forgeSrc.includes("the provable way") && /structured knowledge proposals|extract structure, not summaries/.test(forgeSrc), "wording drifted");
  section("3c. 12.2.0 \u2014 provider precision: vendor + endpoint class, no guessing");
  ok("default vendor mapping is honest (claude\u2192Anthropic, codex\u2192OpenAI, opencode\u2192configurable)", defaultVendorFor("claude") === "Anthropic" && defaultVendorFor("codex") === "OpenAI" && /configurable/.test(defaultVendorFor("opencode")) && defaultVendorFor("mystery") === "mystery's configured provider");
  ok("loopback detection covers localhost/127.0.0.1/::1", loopbackHost("localhost") && loopbackHost("127.0.0.1") && loopbackHost("::1") && !loopbackHost("api.anthropic.com"));
  const cc1 = classifyEndpoint(null);
  ok("no override \u2192 cloud-default (the harness's default cloud)", cc1.endpointClass === "cloud-default" && /no endpoint override/.test(cc1.note));
  const cc2 = classifyEndpoint("http://localhost:11434");
  ok("loopback override \u2192 local-configured with the reason written", cc2.endpointClass === "local-configured" && /loopback/.test(cc2.note));
  const cc3 = classifyEndpoint("https://gateway.corp.example");
  ok("non-loopback override \u2192 unknown (MJ cannot tell where a proxy terminates)", cc3.endpointClass === "unknown" && /cannot determine/.test(cc3.note));
  const cc4 = classifyEndpoint("not a url at all");
  ok("invalid override URL \u2192 unknown, never a guess", cc4.endpointClass === "unknown");
  const det = await proposeKnowledgeSkill({ content: DOC, sourceName: "detected.md", llm: { harness: "claude", deps: scriptedDeps({ env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:11434" } }) } });
  const detP = det.proposal;
  ok("a detected loopback override records local-configured with basis=detected", detP.dataHandling === "provider" && detP.providerInfo?.endpointClass === "local-configured" && detP.providerInfo.endpointBasis === "detected" && detP.providerInfo.vendor === "Anthropic", JSON.stringify(detP.providerInfo));
  const cloudDet = await proposeKnowledgeSkill({ content: DOC, sourceName: "detected-cloud.md", llm: { harness: "claude", deps: scriptedDeps({ env: {} }) } });
  const cdP = cloudDet.proposal;
  ok("detected empty override env \u2192 cloud-default with basis=detected", cdP.providerInfo?.endpointClass === "cloud-default" && cdP.providerInfo.endpointBasis === "detected" && cdP.providerInfo.note.includes("no endpoint override"), JSON.stringify(cdP.providerInfo));
  const noVis = await proposeKnowledgeSkill({ content: DOC, sourceName: "novis.md", llm: { harness: "claude", deps: scriptedDeps({}) } });
  const nvP = noVis.proposal;
  ok("no env reader + no declaration \u2192 endpoint unknown, basis=not-visible, reason written", nvP.providerInfo?.endpointClass === "unknown" && nvP.providerInfo.endpointBasis === "not-visible" && /cannot see/.test(nvP.providerInfo.note), JSON.stringify(nvP.providerInfo));
  const declL = await proposeKnowledgeSkill({ content: DOC, sourceName: "declared-local.md", llm: { harness: "codex", deps: scriptedDeps({ codexOk: true }), declaredEndpoint: "local" } });
  const dlP = declL.proposal;
  ok("user-declared local \u2192 local-configured with basis=user-declared", dlP.providerInfo?.endpointClass === "local-configured" && dlP.providerInfo.endpointBasis === "user-declared" && dlP.providerInfo.vendor === "OpenAI", JSON.stringify(dlP.providerInfo));
  const declC = await proposeKnowledgeSkill({ content: DOC, sourceName: "declared-cloud.md", llm: { harness: "claude", deps: scriptedDeps({ codexOk: false }), declaredEndpoint: "cloud" } });
  const dcP = declC.proposal;
  ok("user-declared cloud \u2192 cloud-default with basis=user-declared", dcP.providerInfo?.endpointClass === "cloud-default" && dcP.providerInfo.endpointBasis === "user-declared");
  const localOnly = await proposeKnowledgeSkill({ content: DOC, sourceName: "local-only.md" });
  ok("mechanical-only proposals carry NO providerInfo (nothing went anywhere)", localOnly.ok && localOnly.proposal.dataHandling === "local" && localOnly.proposal.providerInfo === null);
  section("4. G3/G6 \u2014 one human decision, governed mirror, briefing integration");
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
  const dupId = dup.proposal.id;
  const dupAcc = decideKnowledgeProposal({ id: dupId, decision: "APPROVED", by: "probe-human" });
  ok("mirroring dedupes by name+source \u2014 no duplicate knowledge lines in briefings", dupAcc.ok && loadSkills().length === 1, `skills=${loadSkills().length}`);
  console.log(`
========================================`);
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
