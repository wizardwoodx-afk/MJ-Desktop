import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/engine/expression.ts
var BLOCKED = /* @__PURE__ */ new Set([
  "this",
  "window",
  "document",
  "globalThis",
  "global",
  "process",
  "require",
  "eval",
  "Function",
  "constructor",
  "prototype",
  "__proto__",
  "fetch",
  "XMLHttpRequest",
  "import",
  "export"
]);
var WHITELIST_CALLS = /* @__PURE__ */ new Set(["String", "Number", "Boolean", "Math", "Array", "Object", "JSON"]);
function safeEvaluate(expr, input) {
  const src = expr.trim();
  if (!src) throw new Error("empty expression");
  if (src.length > 600) throw new Error("expression too long");
  if (/[;`\\]/.test(src)) throw new Error("illegal character");
  const tokens = src.match(/[A-Za-z_][A-Za-z0-9_]*|["'][^"']*["']|[0-9]+(?:\.[0-9]+)?|[=!<>]=?|&&|\|\||[()[\].,+\-*/%?:]|true|false|null/g);
  if (!tokens || tokens.join("") !== src.replace(/\s+/g, "")) {
    throw new Error("malformed expression");
  }
  for (const t2 of tokens) {
    if (/^[A-Za-z_]/.test(t2) && !["input", "true", "false", "null", "undefined"].includes(t2) && !WHITELIST_CALLS.has(t2)) {
      if (BLOCKED.has(t2)) throw new Error(`blocked identifier: ${t2}`);
    }
    if (BLOCKED.has(t2)) throw new Error(`blocked identifier: ${t2}`);
  }
  if (/\bconstructor\b|\b__proto__\b|\bprototype\b/.test(src)) throw new Error("blocked property");
  const fn = new Function(
    "input",
    "String",
    "Number",
    "Boolean",
    "Math",
    "Array",
    "Object",
    "JSON",
    `"use strict"; return (${src});`
  );
  return fn(input, String, Number, Boolean, Math, Array, Object, JSON);
}

// src/engine/controlRuntime.ts
function runControlNode(node, collected, outgoing) {
  const id = node.definitionId;
  const first = Object.values(collected)[0];
  if (id === "control.start") {
    let payload = {};
    try {
      payload = JSON.parse(String(node.config.initialPayload || "{}"));
    } catch {
      payload = {};
    }
    return { ports: { payload, "*": payload } };
  }
  if (id === "control.end") {
    return { ports: { result: first, "*": first } };
  }
  if (id === "control.wait") {
    return { ports: { out: first, "*": first } };
  }
  if (id === "control.sequential") {
    return { ports: { output: first, "*": first } };
  }
  if (id === "control.parallel") {
    return { ports: { branch: first, "*": first } };
  }
  if (id === "control.merge") {
    const mode = String(node.config.mode ?? "object");
    const vals = Object.values(collected);
    const out = mode === "array" ? vals : Object.assign({}, ...vals.map((v, i) => v && typeof v === "object" && !Array.isArray(v) ? v : { [`in${i}`]: v }));
    return { ports: { out, "*": out } };
  }
  if (id === "control.split") {
    const items = Array.isArray(first) ? first : first && typeof first === "object" ? Object.values(first) : [first];
    return { ports: { items, "*": items } };
  }
  if (id === "control.fallback") {
    const out = collected.primary ?? collected.backup ?? first;
    return { ports: { out, "*": out } };
  }
  if (id === "control.retry") {
    return { ports: { out: first, "*": first } };
  }
  if (id === "control.condition") {
    let ok2 = false;
    try {
      ok2 = Boolean(safeEvaluate(String(node.config.expression || "Boolean(input)"), first));
    } catch {
      ok2 = Boolean(first);
    }
    const skip = outgoing.filter((c) => c.sourcePortId === (ok2 ? "else" : "then")).map((c) => c.targetNodeId);
    return { ports: { then: ok2 ? first : void 0, else: ok2 ? void 0 : first, "*": first }, skipTargets: skip };
  }
  if (id === "control.switch") {
    const key = String(node.config.keyPath || "input.route");
    const val = pick(first, key.replace(/^input\.?/, ""));
    const route = String(val ?? "default");
    const port = route === "A" || route === "caseA" ? "caseA" : route === "B" || route === "caseB" ? "caseB" : "default";
    const skip = outgoing.filter((c) => c.sourcePortId !== port && c.sourceNodeId === node.id).map((c) => c.targetNodeId);
    return { ports: { [port]: first, "*": first }, skipTargets: skip };
  }
  if (id === "control.loop") {
    const items = Array.isArray(first) ? first : [first];
    const max = Math.min(Number(node.config.maxIterations ?? 20), items.length);
    return { ports: { item: items[0], done: items.slice(0, max), "*": items.slice(0, max) } };
  }
  if (id === "control.approval") {
    return { ports: { approved: first, "*": first } };
  }
  return { ports: { "*": first ?? { passthrough: node.title } } };
}
function pick(input, path) {
  if (!path) return input;
  let cur = input;
  for (const part of path.split(".").filter(Boolean)) {
    if (cur && typeof cur === "object") cur = cur[part];
    else return void 0;
  }
  return cur;
}

// src/domain/hermesSkill.ts
var FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
function parseFrontmatter(content) {
  let src = content;
  if (src.charCodeAt(0) === 65279) src = src.slice(1);
  if (!src.startsWith("---")) return { frontmatter: {}, body: src };
  const m = FRONTMATTER_RE.exec(src);
  if (!m) return { frontmatter: {}, body: src };
  return { frontmatter: parseSimpleYaml(m[1]), body: src.slice(m[0].length) };
}
function parseSimpleYaml(yaml) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  const lines = yaml.replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    const line = raw.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const cur = stack[stack.length - 1].obj;
    if (line.startsWith("- ")) {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (!value) {
      const child = {};
      cur[key] = child;
      stack.push({ indent, obj: child });
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]") || value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      try {
        cur[key] = JSON.parse(value.replace(/'/g, '"'));
        continue;
      } catch {
      }
    }
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    cur[key] = value;
  }
  return root;
}
function reassembleSkill(frontmatter, body) {
  const yaml = [];
  yaml.push(`name: ${frontmatter.name}`);
  yaml.push(`description: ${JSON.stringify(frontmatter.description)}`);
  if (frontmatter.version) yaml.push(`version: ${frontmatter.version}`);
  if (frontmatter.author) yaml.push(`author: ${frontmatter.author}`);
  if (frontmatter.license) yaml.push(`license: ${frontmatter.license}`);
  if (frontmatter.platforms?.length) yaml.push(`platforms: [${frontmatter.platforms.join(", ")}]`);
  if (frontmatter.environments?.length) yaml.push(`environments: [${frontmatter.environments.join(", ")}]`);
  if (frontmatter.metadata?.hermes) {
    yaml.push("metadata:");
    yaml.push("  hermes:");
    const h = frontmatter.metadata.hermes;
    if (h.tags?.length) yaml.push(`    tags: [${h.tags.join(", ")}]`);
    if (h.related_skills?.length) yaml.push(`    related_skills: [${h.related_skills.join(", ")}]`);
  }
  return `---
${yaml.join("\n")}
---

${body.trim()}
`;
}
function skillHasValidStructure(text) {
  const missing = [];
  const stripped = text.replace(/^\uFEFF/, "").trim();
  if (!stripped.startsWith("---")) missing.push("YAML frontmatter (---)");
  const head = stripped.slice(0, 500);
  if (!/name\s*:/.test(head)) missing.push("name field");
  if (!/description\s*:/.test(head)) missing.push("description field");
  return { ok: missing.length === 0, missing };
}

// src/domain/evolutionEngine.ts
var EVOLUTION_CONFIG = {
  iterations: 10,
  populationSize: 5,
  maxSkillSize: 15e3,
  maxToolDescSize: 500,
  maxParamDescSize: 200,
  maxPromptGrowth: 0.2,
  evalDatasetSize: 20,
  trainRatio: 0.5,
  valRatio: 0.25,
  holdoutRatio: 0.25,
  tbliteRegressionThreshold: 0.02
};
function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}
function compositeOf(s) {
  const raw = 0.5 * s.correctness + 0.3 * s.procedureFollowing + 0.2 * s.conciseness;
  return Math.max(0, raw - s.lengthPenalty);
}
function lengthPenalty(artifactSize, maxSize) {
  const ratio = artifactSize / Math.max(1, maxSize);
  if (ratio <= 0.9) return 0;
  return Math.min(0.3, (ratio - 0.9) * 3);
}
function skillFitnessMetric(_taskInput, expectedBehavior, agentOutput) {
  if (!agentOutput.trim()) return 0;
  const expectedWords = new Set(expectedBehavior.toLowerCase().split(/\s+/).filter(Boolean));
  const outputWords = new Set(agentOutput.toLowerCase().split(/\s+/).filter(Boolean));
  if (expectedWords.size === 0) return 0.5;
  let overlap = 0;
  for (const w of expectedWords) if (outputWords.has(w)) overlap += 1;
  return clamp01(0.3 + 0.7 * (overlap / expectedWords.size));
}
function scoreFitness(args) {
  const overlap = skillFitnessMetric(args.taskInput, args.expectedBehavior, args.agentOutput);
  const procedure = skillFitnessMetric(args.skillText.slice(0, 800), args.expectedBehavior, args.agentOutput);
  const conciseness = args.agentOutput.length > 4e3 ? 0.4 : args.agentOutput.length < 40 ? 0.5 : 0.8;
  const lp = lengthPenalty(args.skillText.length, EVOLUTION_CONFIG.maxSkillSize);
  const partial = {
    correctness: overlap,
    procedureFollowing: procedure,
    conciseness,
    lengthPenalty: lp,
    feedback: overlap < 0.5 ? "Low keyword overlap with expected behavior. Tighten the procedure and name the done-when." : "Procedure coverage is acceptable. Prefer smaller, evidenced edits."
  };
  return { ...partial, composite: compositeOf(partial) };
}
function validateConstraints(artifactText, artifactType, baselineText) {
  const results = [];
  const size = artifactText.length;
  const limit = artifactType === "tool_description" ? EVOLUTION_CONFIG.maxToolDescSize : artifactType === "param_description" ? EVOLUTION_CONFIG.maxParamDescSize : EVOLUTION_CONFIG.maxSkillSize;
  results.push({
    passed: size <= limit,
    constraintName: "size_limit",
    message: size <= limit ? `Size OK: ${size}/${limit} chars` : `Size exceeded: ${size}/${limit} chars (${size - limit} over)`
  });
  if (baselineText !== void 0) {
    const growth = (size - baselineText.length) / Math.max(1, baselineText.length);
    results.push({
      passed: growth <= EVOLUTION_CONFIG.maxPromptGrowth,
      constraintName: "growth_limit",
      message: growth <= EVOLUTION_CONFIG.maxPromptGrowth ? `Growth OK: ${(growth * 100).toFixed(1)}% (max ${(EVOLUTION_CONFIG.maxPromptGrowth * 100).toFixed(0)}%)` : `Growth exceeded: ${(growth * 100).toFixed(1)}% (max ${(EVOLUTION_CONFIG.maxPromptGrowth * 100).toFixed(0)}%)`
    });
  }
  results.push({
    passed: Boolean(artifactText.trim()),
    constraintName: "non_empty",
    message: artifactText.trim() ? "Artifact is non-empty" : "Artifact is empty"
  });
  if (artifactType === "skill") {
    const struct = skillHasValidStructure(artifactText);
    results.push({
      passed: struct.ok,
      constraintName: "skill_structure",
      message: struct.ok ? "Skill has valid frontmatter (name + description)" : `Skill missing: ${struct.missing.join(", ")}`
    });
  }
  return results;
}
function gateCandidate(args) {
  if (args.bundled) {
    return {
      constraints: [{ passed: false, constraintName: "bundled_readonly", message: "Curator never writes bundled Hermes skills." }],
      constraintsPassed: false,
      holdoutPassed: false,
      regressionPassed: false,
      baseline: scoreFitness({ taskInput: args.taskInput, expectedBehavior: args.expectedBehavior, agentOutput: args.baselineOutput, skillText: args.baselineText }),
      candidate: scoreFitness({ taskInput: args.taskInput, expectedBehavior: args.expectedBehavior, agentOutput: args.candidateOutput, skillText: args.candidateText }),
      accepted: false,
      reason: "Bundled skills are read-only."
    };
  }
  const constraints = validateConstraints(args.candidateText, args.artifactType ?? "skill", args.baselineText);
  const constraintsPassed = constraints.every((c) => c.passed);
  const baseline = scoreFitness({
    taskInput: args.taskInput,
    expectedBehavior: args.expectedBehavior,
    agentOutput: args.baselineOutput,
    skillText: args.baselineText
  });
  const candidate = scoreFitness({
    taskInput: args.taskInput,
    expectedBehavior: args.expectedBehavior,
    agentOutput: args.candidateOutput,
    skillText: args.candidateText
  });
  const holdoutPassed = candidate.composite >= 0.45;
  const regressionPassed = candidate.composite + EVOLUTION_CONFIG.tbliteRegressionThreshold >= baseline.composite;
  const accepted = constraintsPassed && holdoutPassed && regressionPassed && candidate.composite > baseline.composite;
  let reason = "Pending gates.";
  if (!constraintsPassed) reason = "Constraint failed: " + constraints.filter((c) => !c.passed).map((c) => c.constraintName).join(", ");
  else if (!holdoutPassed) reason = "Holdout failed.";
  else if (!regressionPassed) reason = "Regression vs baseline.";
  else if (!(candidate.composite > baseline.composite)) reason = "No improvement over baseline.";
  else reason = "All gates passed.";
  return { constraints, constraintsPassed, holdoutPassed, regressionPassed, baseline, candidate, accepted, reason };
}

// src/domain/rolePacks.ts
var ROLE_PACKS = [
  { slug: "backend-engineer", title: "Backend Engineer", industry: "engineering", icon: "code", mission: "Design and implement reliable services, APIs, and data stores." },
  { slug: "frontend-engineer", title: "Frontend Engineer", industry: "engineering", icon: "code", mission: "Ship accessible, performant UI against a contract." },
  { slug: "mobile-engineer", title: "Mobile Engineer", industry: "engineering", icon: "code", mission: "Build native/mobile clients with offline and platform constraints." },
  { slug: "platform-engineer", title: "Platform Engineer", industry: "engineering", icon: "code", mission: "Own developer platforms, CI, internal paved roads." },
  { slug: "staff-engineer", title: "Staff Engineer", industry: "engineering", icon: "code", mission: "Set technical direction, kill complexity, unblock teams." },
  { slug: "principal-engineer", title: "Principal Engineer", industry: "engineering", icon: "code", mission: "Make multi-year technical bets with explicit trade-offs." },
  { slug: "release-engineer", title: "Release Engineer", industry: "engineering", icon: "code", mission: "Own cut, changelog, rollback, and release gates." },
  { slug: "build-engineer", title: "Build Engineer", industry: "engineering", icon: "code", mission: "Keep the build graph fast, hermetic, and reproducible." },
  { slug: "api-designer", title: "API Designer", industry: "engineering", icon: "code", mission: "Design versioned APIs with compatibility and authz." },
  { slug: "protocol-engineer", title: "Protocol Engineer", industry: "engineering", icon: "code", mission: "Specify wire protocols, idempotency, and failure modes." },
  { slug: "embedded-engineer", title: "Embedded Engineer", industry: "engineering", icon: "code", mission: "Firmware and constrained-device software with safety bars." },
  { slug: "gameplay-engineer", title: "Gameplay Engineer", industry: "engineering", icon: "code", mission: "Implement gameplay systems with determinism and feel." },
  { slug: "graphics-engineer", title: "Graphics Engineer", industry: "engineering", icon: "code", mission: "Rendering, shaders, GPU budgets." },
  { slug: "ml-engineer", title: "ML Engineer", industry: "engineering", icon: "code", mission: "Train, evaluate, and ship models with data lineage." },
  { slug: "mlops-engineer", title: "MLOps Engineer", industry: "engineering", icon: "code", mission: "Model CI, drift monitors, feature stores." },
  { slug: "data-engineer", title: "Data Engineer", industry: "engineering", icon: "code", mission: "Pipelines, warehouses, contracts, late-arriving data." },
  { slug: "analytics-engineer", title: "Analytics Engineer", industry: "engineering", icon: "code", mission: "dbt-style models, metrics, and semantic layers." },
  { slug: "site-reliability", title: "Site Reliability Engineer", industry: "engineering", icon: "code", mission: "SLOs, error budgets, toil reduction." },
  { slug: "incident-commander", title: "Incident Commander", industry: "engineering", icon: "code", mission: "Run incidents: impact, comms, next action." },
  { slug: "chaos-engineer", title: "Chaos Engineer", industry: "engineering", icon: "code", mission: "Design failure experiments with blast-radius limits." },
  { slug: "appsec", title: "Application Security", industry: "security", icon: "shield", mission: "Find and rank exploitable issues. No exploit payloads." },
  { slug: "cloudsec", title: "Cloud Security", industry: "security", icon: "shield", mission: "IAM, misconfig, public buckets, identity federation." },
  { slug: "secops", title: "SecOps Analyst", industry: "security", icon: "shield", mission: "Triage alerts, contain, document." },
  { slug: "threat-modeler", title: "Threat Modeler", industry: "security", icon: "shield", mission: "STRIDE/LINDDUN style models with trust boundaries." },
  { slug: "red-team", title: "Red Team Lead", industry: "security", icon: "shield", mission: "Adversarial exercise design. No live exploitation." },
  { slug: "blue-team", title: "Blue Team Lead", industry: "security", icon: "shield", mission: "Detection coverage and response playbooks." },
  { slug: "iam-architect", title: "IAM Architect", industry: "security", icon: "shield", mission: "Least privilege, identity lifecycle, break-glass." },
  { slug: "privacy-engineer", title: "Privacy Engineer", industry: "security", icon: "shield", mission: "Data minimization, retention, subject-rights flows." },
  { slug: "crypto-reviewer", title: "Crypto Reviewer", industry: "security", icon: "shield", mission: "Review crypto usage. Flag homemade crypto." },
  { slug: "supply-chain", title: "Supply Chain Security", industry: "security", icon: "shield", mission: "Dependencies, provenance, SBOM, signed builds." },
  { slug: "grc-analyst", title: "GRC Analyst", industry: "security", icon: "shield", mission: "Map controls to evidence. Not legal advice." },
  { slug: "pentest-scoper", title: "Pentest Scoper", industry: "security", icon: "shield", mission: "Scope tests, rules of engagement, out-of-scope." },
  { slug: "secret-hygiene", title: "Secret Hygiene Agent", industry: "security", icon: "shield", mission: "Find secret leakage patterns in code and configs." },
  { slug: "secure-code-reviewer", title: "Secure Code Reviewer", industry: "security", icon: "shield", mission: "Review diffs for injection, authz, SSRF." },
  { slug: "zero-trust", title: "Zero Trust Architect", industry: "security", icon: "shield", mission: "Device, identity, path \u2014 never network location." },
  { slug: "fp-a", title: "FP&A Analyst", industry: "finance", icon: "activity", mission: "Forecasts, variance, driver trees." },
  { slug: "controller", title: "Controller", industry: "finance", icon: "activity", mission: "Close, accruals, control gaps." },
  { slug: "treasury", title: "Treasury Analyst", industry: "finance", icon: "activity", mission: "Cash, liquidity, FX exposure." },
  { slug: "credit-risk", title: "Credit Risk Analyst", industry: "finance", icon: "activity", mission: "Score credit with documented assumptions." },
  { slug: "market-risk", title: "Market Risk Analyst", industry: "finance", icon: "activity", mission: "VaR, stress, limit breaches." },
  { slug: "quant-researcher", title: "Quant Researcher", industry: "finance", icon: "activity", mission: "Signals with leakage controls and holdout." },
  { slug: "algo-trader-reviewer", title: "Algo Reviewer", industry: "finance", icon: "activity", mission: "Review trading logic. No live orders." },
  { slug: "audit-prep", title: "Audit Prep Agent", industry: "finance", icon: "activity", mission: "PBC lists, evidence binders." },
  { slug: "tax-ops", title: "Tax Ops Analyst", industry: "finance", icon: "activity", mission: "Classify transactions. Not tax advice." },
  { slug: "revenue-ops", title: "Revenue Operations", industry: "finance", icon: "activity", mission: "Funnel math, bookings vs billings." },
  { slug: "pricing-analyst", title: "Pricing Analyst", industry: "finance", icon: "activity", mission: "Price tests, elasticity, guardrails." },
  { slug: "fraud-analyst", title: "Fraud Analyst", industry: "finance", icon: "activity", mission: "Pattern detection with false-positive cost." },
  { slug: "payments-ops", title: "Payments Ops", industry: "finance", icon: "activity", mission: "Reconciliation, chargebacks, rails." },
  { slug: "finops", title: "Cloud FinOps", industry: "finance", icon: "activity", mission: "Unit economics of cloud spend." },
  { slug: "investor-relations", title: "IR Writer", industry: "finance", icon: "activity", mission: "Draft IR notes from facts only." },
  { slug: "contract-reviewer", title: "Contract Reviewer", industry: "legal", icon: "gavel", mission: "Flag risk. Not legal advice." },
  { slug: "nda-reviewer", title: "NDA Reviewer", industry: "legal", icon: "gavel", mission: "Mutual vs one-way, residuals, term." },
  { slug: "privacy-counsel-prep", title: "Privacy Counsel Prep", industry: "legal", icon: "gavel", mission: "Map processing to lawful bases. Not advice." },
  { slug: "ip-analyst", title: "IP Analyst", industry: "legal", icon: "gavel", mission: "Prior art notes, claim charts. Not advice." },
  { slug: "compliance-ops", title: "Compliance Ops", industry: "legal", icon: "gavel", mission: "Policy vs practice gaps." },
  { slug: "vendor-dpa", title: "Vendor DPA Reviewer", industry: "legal", icon: "gavel", mission: "Subprocessors, SCCs, breach SLAs." },
  { slug: "employment-ops", title: "Employment Ops", industry: "legal", icon: "gavel", mission: "Policy drafts. Not employment advice." },
  { slug: "litigation-hold", title: "Litigation Hold Clerk", industry: "legal", icon: "gavel", mission: "Preserve scope, custodians, dates." },
  { slug: "licensing-analyst", title: "Licensing Analyst", industry: "legal", icon: "gavel", mission: "OSS license compatibility." },
  { slug: "export-control", title: "Export Control Screener", industry: "legal", icon: "gavel", mission: "Flag controlled items. Not advice." },
  { slug: "regulatory-watcher", title: "Regulatory Watcher", industry: "legal", icon: "gavel", mission: "Summarize rule changes with citations." },
  { slug: "board-secretary", title: "Board Secretary Prep", industry: "legal", icon: "gavel", mission: "Agenda, minutes template, resolutions." },
  { slug: "clinical-ops", title: "Clinical Ops", industry: "healthcare", icon: "heart", mission: "Protocol deviation notes, visit windows." },
  { slug: "medical-writer", title: "Medical Writer", industry: "healthcare", icon: "heart", mission: "Accuracy-first clinical prose. Not medical advice." },
  { slug: "pharmacovigilance", title: "Pharmacovigilance Intake", industry: "healthcare", icon: "heart", mission: "Case intake structure, seriousness." },
  { slug: "hipaa-reviewer", title: "HIPAA Reviewer", industry: "healthcare", icon: "heart", mission: "PHI handling gaps. Not legal advice." },
  { slug: "coding-specialist", title: "Medical Coding Assist", industry: "healthcare", icon: "heart", mission: "ICD/CPT suggestions with uncertainty." },
  { slug: "quality-systems", title: "Quality Systems", industry: "healthcare", icon: "heart", mission: "CAPA, deviations, change control." },
  { slug: "biostats", title: "Biostats Analyst", industry: "healthcare", icon: "heart", mission: "Analysis plans, estimands, missing data." },
  { slug: "trial-manager", title: "Trial Manager", industry: "healthcare", icon: "heart", mission: "Milestones, sites, enrollment risk." },
  { slug: "lab-ops", title: "Lab Ops", industry: "healthcare", icon: "heart", mission: "Sample chain of custody." },
  { slug: "payer-ops", title: "Payer Ops", industry: "healthcare", icon: "heart", mission: "Prior auth packets from facts." },
  { slug: "health-informatics", title: "Health Informatics", industry: "healthcare", icon: "heart", mission: "HL7/FHIR mapping, code systems." },
  { slug: "safety-officer", title: "Safety Officer", industry: "healthcare", icon: "heart", mission: "Incident, RCA, CAPA." },
  { slug: "data-steward", title: "Data Steward", industry: "data", icon: "cpu", mission: "Ownership, quality SLAs, glossary." },
  { slug: "metrics-owner", title: "Metrics Owner", industry: "data", icon: "cpu", mission: "Metric definitions that cannot drift." },
  { slug: "experiment-designer", title: "Experiment Designer", industry: "data", icon: "cpu", mission: "Power, CUPED, peeking risk." },
  { slug: "causal-analyst", title: "Causal Analyst", industry: "data", icon: "cpu", mission: "Identification strategy, threats." },
  { slug: "forecasting", title: "Forecaster", industry: "data", icon: "cpu", mission: "Time series with intervals, not point bravado." },
  { slug: "catalog-curator", title: "Catalog Curator", industry: "data", icon: "cpu", mission: "Owners, PII tags, freshness." },
  { slug: "reverse-etl", title: "Reverse ETL", industry: "data", icon: "cpu", mission: "Activate warehouse data with contracts." },
  { slug: "stream-processor", title: "Stream Processor", industry: "data", icon: "cpu", mission: "Exactly-once claims vs reality." },
  { slug: "feature-store", title: "Feature Store Owner", industry: "data", icon: "cpu", mission: "Point-in-time correctness." },
  { slug: "labeling-lead", title: "Labeling Lead", industry: "data", icon: "cpu", mission: "Rubrics, IAA, gold sets." },
  { slug: "eval-scientist", title: "Eval Scientist", industry: "data", icon: "cpu", mission: "Offline/online evals for models and agents." },
  { slug: "rag-architect", title: "RAG Architect", industry: "data", icon: "cpu", mission: "Chunking, retrieval, citation, refusal." },
  { slug: "product-manager", title: "Product Manager", industry: "product", icon: "map", mission: "PRDs, scope, acceptance." },
  { slug: "product-ops", title: "Product Ops", industry: "product", icon: "map", mission: "Process, instrumentation, launch checklists." },
  { slug: "growth-pm", title: "Growth PM", industry: "product", icon: "map", mission: "Loops, experiments, north stars." },
  { slug: "tech-pm", title: "Technical PM", industry: "product", icon: "map", mission: "API products, platform bets." },
  { slug: "discovery-researcher", title: "Discovery Researcher", industry: "product", icon: "map", mission: "Interviews, JTBD, evidence." },
  { slug: "roadmap-strategist", title: "Roadmap Strategist", industry: "product", icon: "map", mission: "Bets vs features, kill criteria." },
  { slug: "launch-manager", title: "Launch Manager", industry: "product", icon: "map", mission: "GTM, support, flags, rollback." },
  { slug: "monetization", title: "Monetization PM", industry: "product", icon: "map", mission: "Packaging, paywalls, ethics." },
  { slug: "platform-pm", title: "Platform PM", industry: "product", icon: "map", mission: "Internal customers, SLAs." },
  { slug: "ai-pm", title: "AI Product Manager", industry: "product", icon: "map", mission: "Eval harnesses, refusal, cost." },
  { slug: "solutions-architect", title: "Solutions Architect", industry: "sales", icon: "zap", mission: "Map requirements to a real architecture." },
  { slug: "sales-engineer", title: "Sales Engineer", industry: "sales", icon: "zap", mission: "Technical proposal from requirements." },
  { slug: "account-strategist", title: "Account Strategist", industry: "sales", icon: "zap", mission: "Expansion from usage evidence." },
  { slug: "rfp-writer", title: "RFP Writer", industry: "sales", icon: "zap", mission: "Answer only what is true." },
  { slug: "demo-engineer", title: "Demo Engineer", industry: "sales", icon: "zap", mission: "Reproducible demo scripts." },
  { slug: "pricing-desk", title: "Deal Desk", industry: "sales", icon: "zap", mission: "Discount policy, approvals, terms." },
  { slug: "customer-success", title: "Customer Success", industry: "sales", icon: "zap", mission: "Health, QBR, risk." },
  { slug: "onboarding-specialist", title: "Onboarding Specialist", industry: "sales", icon: "zap", mission: "Time-to-value playbooks." },
  { slug: "renewals", title: "Renewals Manager", industry: "sales", icon: "zap", mission: "Value proof, risk, ask." },
  { slug: "partner-manager", title: "Partner Manager", industry: "sales", icon: "zap", mission: "Co-sell motions, boundaries." },
  { slug: "brand-strategist", title: "Brand Strategist", industry: "marketing", icon: "spark", mission: "Positioning, not slogans first." },
  { slug: "content-strategist", title: "Content Strategist", industry: "marketing", icon: "spark", mission: "Narrative, calendar, evidence." },
  { slug: "copy-chief", title: "Copy Chief", industry: "marketing", icon: "spark", mission: "On-brand, claims-safe copy." },
  { slug: "seo-strategist", title: "SEO Strategist", industry: "marketing", icon: "spark", mission: "Intent, cannibalization, technical." },
  { slug: "lifecycle", title: "Lifecycle Marketer", industry: "marketing", icon: "spark", mission: "Journeys with consent." },
  { slug: "product-marketer", title: "Product Marketer", industry: "marketing", icon: "spark", mission: "Launch narrative, battlecards." },
  { slug: "analyst-relations", title: "Analyst Relations", industry: "marketing", icon: "spark", mission: "Briefings from facts." },
  { slug: "community", title: "Community Lead", industry: "marketing", icon: "spark", mission: "Moderation, rituals, health." },
  { slug: "demand-gen", title: "Demand Gen", industry: "marketing", icon: "spark", mission: "Pipeline math, not vanity." },
  { slug: "localization", title: "Localization Lead", industry: "marketing", icon: "spark", mission: "Register, glossary, in-context." },
  { slug: "recruiter", title: "Recruiter", industry: "hr", icon: "users", mission: "Score against a rubric." },
  { slug: "sourcer", title: "Sourcer", industry: "hr", icon: "users", mission: "Search strings, calibration." },
  { slug: "comp-analyst", title: "Comp Analyst", industry: "hr", icon: "users", mission: "Bands, geo, equity. Not advice." },
  { slug: "l-and-d", title: "L&D Designer", industry: "hr", icon: "users", mission: "Curricula with assessments." },
  { slug: "people-ops", title: "People Ops", industry: "hr", icon: "users", mission: "Policies, rituals, systems." },
  { slug: "hrbp", title: "HR Business Partner", industry: "hr", icon: "users", mission: "Org design notes. Not advice." },
  { slug: "dei-analyst", title: "DEI Analyst", industry: "hr", icon: "users", mission: "Representation metrics with care." },
  { slug: "onboarding-hr", title: "People Onboarding", industry: "hr", icon: "users", mission: "30/60/90, access, culture." },
  { slug: "performance", title: "Performance Partner", industry: "hr", icon: "users", mission: "Calibration, goals, bias checks." },
  { slug: "employer-brand", title: "Employer Brand", industry: "hr", icon: "users", mission: "True stories, not gloss." },
  { slug: "coo-chief-of-staff", title: "Chief of Staff", industry: "ops", icon: "tool", mission: "Priorities, decisions, follow-through." },
  { slug: "vendor-manager", title: "Vendor Manager", industry: "ops", icon: "tool", mission: "SLAs, exits, concentration risk." },
  { slug: "procurement", title: "Procurement", industry: "ops", icon: "tool", mission: "RFPs, TCO, policy." },
  { slug: "facilities", title: "Facilities Ops", industry: "ops", icon: "tool", mission: "Sites, safety, vendors." },
  { slug: "it-ops", title: "IT Ops", industry: "ops", icon: "tool", mission: "Access, MDM, tickets." },
  { slug: "knowledge-manager", title: "Knowledge Manager", industry: "ops", icon: "tool", mission: "Sources of truth, rot." },
  { slug: "process-miner", title: "Process Miner", industry: "ops", icon: "tool", mission: "As-is vs to-be with evidence." },
  { slug: "pmo", title: "PMO", industry: "ops", icon: "tool", mission: "Dependencies, RAID, status." },
  { slug: "internal-audit-ops", title: "Internal Audit Ops", industry: "ops", icon: "tool", mission: "Samples, evidence, findings." },
  { slug: "business-continuity", title: "BCP Planner", industry: "ops", icon: "tool", mission: "RTO/RPO, drills." },
  { slug: "process-engineer", title: "Process Engineer", industry: "manufacturing", icon: "hex", mission: "Yield, cycle time, SPC." },
  { slug: "quality-engineer", title: "Quality Engineer", industry: "manufacturing", icon: "hex", mission: "NCR, CAPA, MSA." },
  { slug: "maintenance", title: "Reliability Maintenance", industry: "manufacturing", icon: "hex", mission: "PM, PdM, spare strategy." },
  { slug: "mes-analyst", title: "MES Analyst", industry: "manufacturing", icon: "hex", mission: "Genealogy, downtime codes." },
  { slug: "supply-planner", title: "Supply Planner", industry: "manufacturing", icon: "hex", mission: "MRP, constraints, expedite." },
  { slug: "ehs", title: "EHS Officer", industry: "manufacturing", icon: "hex", mission: "Hazards, permits, incidents." },
  { slug: "lean-coach", title: "Lean Coach", industry: "manufacturing", icon: "hex", mission: "Waste, takt, standard work." },
  { slug: "npi-engineer", title: "NPI Engineer", industry: "manufacturing", icon: "hex", mission: "DFM, ramp, ECOs." },
  { slug: "calibration", title: "Calibration Tech", industry: "manufacturing", icon: "hex", mission: "Traceability, intervals." },
  { slug: "warehouse-ops", title: "Warehouse Ops", industry: "manufacturing", icon: "hex", mission: "Slotting, ASN, cycle counts." },
  { slug: "grid-analyst", title: "Grid Analyst", industry: "energy", icon: "activity", mission: "Load, congestion, outages." },
  { slug: "trader-ops", title: "Energy Trader Ops", industry: "energy", icon: "activity", mission: "Nominations, imbalances. No live trades." },
  { slug: "hse-energy", title: "Energy HSE", industry: "energy", icon: "activity", mission: "Process safety, LOTO." },
  { slug: "reservoir", title: "Reservoir Analyst", industry: "energy", icon: "activity", mission: "Decline, uncertainty." },
  { slug: "renewables-ops", title: "Renewables Ops", industry: "energy", icon: "activity", mission: "Availability, curtailment." },
  { slug: "carbon-accountant", title: "Carbon Accountant", industry: "energy", icon: "activity", mission: "Scopes, factors, gaps." },
  { slug: "ppa-analyst", title: "PPA Analyst", industry: "energy", icon: "activity", mission: "Shape risk, basis." },
  { slug: "scada-reviewer", title: "SCADA Reviewer", industry: "energy", icon: "activity", mission: "Tag hygiene, unsafe commands." },
  { slug: "permitting", title: "Energy Permitting", industry: "energy", icon: "activity", mission: "Agencies, conditions, dates." },
  { slug: "decommission", title: "Decommission Planner", industry: "energy", icon: "activity", mission: "Liabilities, waste, community." },
  { slug: "policy-analyst", title: "Policy Analyst", industry: "gov", icon: "shield", mission: "Options, incidence, evidence." },
  { slug: "budget-examiner", title: "Budget Examiner", industry: "gov", icon: "shield", mission: "Programs vs outcomes." },
  { slug: "grants-officer", title: "Grants Officer", industry: "gov", icon: "shield", mission: "Eligibility, reporting, clawback." },
  { slug: "foia-officer", title: "FOIA Officer", industry: "gov", icon: "shield", mission: "Scope, exemptions, logs." },
  { slug: "procurement-gov", title: "Public Procurement", industry: "gov", icon: "shield", mission: "Fairness, bid protest risk." },
  { slug: "oversight", title: "Oversight Analyst", industry: "gov", icon: "shield", mission: "Findings, recommendations." },
  { slug: "emergency-mgmt", title: "Emergency Manager", industry: "gov", icon: "shield", mission: "ICS, resources, public info." },
  { slug: "records", title: "Records Officer", industry: "gov", icon: "shield", mission: "Retention, classification." },
  { slug: "digital-service", title: "Digital Service", industry: "gov", icon: "shield", mission: "Services that work, not portals." },
  { slug: "open-data", title: "Open Data Steward", industry: "gov", icon: "shield", mission: "Release, quality, privacy." },
  { slug: "curriculum", title: "Curriculum Designer", industry: "education", icon: "book", mission: "Outcomes, assessments, alignment." },
  { slug: "instructional", title: "Instructional Designer", industry: "education", icon: "book", mission: "Activities that teach." },
  { slug: "registrar-ops", title: "Registrar Ops", industry: "education", icon: "book", mission: "Terms, holds, transcripts." },
  { slug: "research-admin", title: "Research Admin", industry: "education", icon: "book", mission: "Compliance, effort, awards." },
  { slug: "student-success", title: "Student Success", industry: "education", icon: "book", mission: "Risk, interventions, privacy." },
  { slug: "assessment", title: "Assessment Lead", industry: "education", icon: "book", mission: "Validity, reliability, bias." },
  { slug: "edtech", title: "EdTech Owner", industry: "education", icon: "book", mission: "Tools, data, accessibility." },
  { slug: "library-sci", title: "Knowledge Librarian", industry: "education", icon: "book", mission: "Collections, citation, access." },
  { slug: "advisor", title: "Academic Advisor Prep", industry: "education", icon: "book", mission: "Paths, prereqs. Not counseling." },
  { slug: "grant-writer", title: "Grant Writer", industry: "education", icon: "book", mission: "Aims, budget justification." },
  { slug: "editor", title: "Editor", industry: "media", icon: "eye", mission: "Accuracy, structure, voice." },
  { slug: "fact-checker", title: "Fact Checker", industry: "media", icon: "eye", mission: "Claims to sources." },
  { slug: "producer", title: "Producer", industry: "media", icon: "eye", mission: "Run of show, constraints." },
  { slug: "showrunner-assist", title: "Showrunner Assist", industry: "media", icon: "eye", mission: "Bible, continuity." },
  { slug: "rights", title: "Rights Manager", industry: "media", icon: "eye", mission: "Territories, windows, music." },
  { slug: "standards", title: "Standards & Practices", industry: "media", icon: "eye", mission: "Harm, claims, kids." },
  { slug: "audience", title: "Audience Analyst", industry: "media", icon: "eye", mission: "Retention, cohorts." },
  { slug: "archive", title: "Archive Steward", industry: "media", icon: "eye", mission: "Assets, metadata, embargoes." },
  { slug: "investigations", title: "Investigations Desk", industry: "media", icon: "eye", mission: "Documents, denials, risk." },
  { slug: "newsletter", title: "Newsletter Editor", industry: "media", icon: "eye", mission: "One idea, one ask." },
  { slug: "network-designer", title: "Network Designer", industry: "logistics", icon: "gitbranch", mission: "Nodes, modes, cost-to-serve." },
  { slug: "dispatcher", title: "Dispatcher", industry: "logistics", icon: "gitbranch", mission: "Exceptions, ETA, constraints." },
  { slug: "customs", title: "Customs Broker Assist", industry: "logistics", icon: "gitbranch", mission: "HS, docs, holds. Not advice." },
  { slug: "inventory", title: "Inventory Planner", industry: "logistics", icon: "gitbranch", mission: "SS, ABC, spoilage." },
  { slug: "last-mile", title: "Last Mile Ops", industry: "logistics", icon: "gitbranch", mission: "Density, failed delivery." },
  { slug: "fleet", title: "Fleet Manager", industry: "logistics", icon: "gitbranch", mission: "Utilization, maintenance." },
  { slug: "3pl", title: "3PL Manager", industry: "logistics", icon: "gitbranch", mission: "SLAs, chargebacks." },
  { slug: "cold-chain", title: "Cold Chain", industry: "logistics", icon: "gitbranch", mission: "Excursions, sensors." },
  { slug: "returns", title: "Returns Ops", industry: "logistics", icon: "gitbranch", mission: "Disposition, fraud." },
  { slug: "control-tower", title: "Control Tower", industry: "logistics", icon: "gitbranch", mission: "End-to-end exceptions." },
  { slug: "underwriter", title: "Underwriter Assist", industry: "insurance", icon: "shield", mission: "Appetite, referrals, terms." },
  { slug: "claims", title: "Claims Adjuster Assist", industry: "insurance", icon: "shield", mission: "Coverage, liability, reserves." },
  { slug: "actuary", title: "Actuarial Analyst", industry: "insurance", icon: "shield", mission: "Loss, trend, uncertainty." },
  { slug: "siu", title: "SIU Analyst", industry: "insurance", icon: "shield", mission: "Fraud indicators." },
  { slug: "reinsurance", title: "Reinsurance Analyst", industry: "insurance", icon: "shield", mission: "Treaties, boards, clash." },
  { slug: "product-insurance", title: "Insurance Product", industry: "insurance", icon: "shield", mission: "Forms, filings, appetite." },
  { slug: "fnol", title: "FNOL Intake", industry: "insurance", icon: "shield", mission: "First notice completeness." },
  { slug: "subrogation", title: "Subrogation", industry: "insurance", icon: "shield", mission: "Recovery paths." },
  { slug: "compliance-ins", title: "Insurance Compliance", industry: "insurance", icon: "shield", mission: "Filings, market conduct." },
  { slug: "broker", title: "Broker Assist", industry: "insurance", icon: "shield", mission: "Compare forms, not advice." },
  { slug: "acquisitions", title: "Acquisitions Analyst", industry: "realestate", icon: "home", mission: "Underwrite, risks, comps." },
  { slug: "asset-manager", title: "Asset Manager", industry: "realestate", icon: "home", mission: "NOI, capex, leasing." },
  { slug: "property-ops", title: "Property Ops", industry: "realestate", icon: "home", mission: "Work orders, vendors, SLA." },
  { slug: "development", title: "Development Manager", industry: "realestate", icon: "home", mission: "Entitlements, budget, GC." },
  { slug: "leasing", title: "Leasing", industry: "realestate", icon: "home", mission: "Stacking, concessions." },
  { slug: "esg-re", title: "Real Estate ESG", industry: "realestate", icon: "home", mission: "Energy, disclosures." },
  { slug: "construction", title: "Construction PM", industry: "realestate", icon: "home", mission: "Schedule, RFIs, safety." },
  { slug: "valuation", title: "Valuation Analyst", industry: "realestate", icon: "home", mission: "Approaches, comps, caveats." },
  { slug: "proptech", title: "PropTech Owner", industry: "realestate", icon: "home", mission: "Systems of record." },
  { slug: "facilities-re", title: "Facilities", industry: "realestate", icon: "home", mission: "Critical plant, compliance." },
  { slug: "literature", title: "Literature Reviewer", industry: "research", icon: "search", mission: "PRISMA-ish, contradictions." },
  { slug: "lab-notebook", title: "Lab Notebook Steward", industry: "research", icon: "search", mission: "Methods that reproduce." },
  { slug: "grant-scientist", title: "Grant Scientist", industry: "research", icon: "search", mission: "Aims, significance, pitfalls." },
  { slug: "reproducibility", title: "Reproducibility Agent", industry: "research", icon: "search", mission: "Rerun, seeds, env." },
  { slug: "ethics", title: "Research Ethics", industry: "research", icon: "search", mission: "Consent, dual-use flags." },
  { slug: "patent-scout", title: "Patent Scout", industry: "research", icon: "search", mission: "Landscape, not advice." },
  { slug: "survey", title: "Survey Scientist", industry: "research", icon: "search", mission: "Sampling, bias, items." },
  { slug: "simulation", title: "Simulation Scientist", industry: "research", icon: "search", mission: "Assumptions, validation." },
  { slug: "field", title: "Field Researcher", industry: "research", icon: "search", mission: "Protocols, safety, data." },
  { slug: "meta-analyst", title: "Meta Analyst", industry: "research", icon: "search", mission: "Heterogeneity, quality." },
  { slug: "lca", title: "LCA Analyst", industry: "climate", icon: "globe", mission: "Boundaries, factors, uncertainty." },
  { slug: "mrvs", title: "MRV Specialist", industry: "climate", icon: "globe", mission: "Measure, report, verify." },
  { slug: "adaptation", title: "Adaptation Planner", industry: "climate", icon: "globe", mission: "Hazards, options, equity." },
  { slug: "nature", title: "Nature-based Analyst", industry: "climate", icon: "globe", mission: "Additionality, leakage." },
  { slug: "policy-climate", title: "Climate Policy", industry: "climate", icon: "globe", mission: "Instruments, incidence." },
  { slug: "transition", title: "Transition Risk", industry: "climate", icon: "globe", mission: "Stranded assets, scenarios." },
  { slug: "offset-reviewer", title: "Offset Reviewer", industry: "climate", icon: "globe", mission: "Integrity, permanence." },
  { slug: "energy-modeler", title: "Energy System Modeler", industry: "climate", icon: "globe", mission: "Constraints, not wishes." },
  { slug: "water", title: "Water Steward", industry: "climate", icon: "globe", mission: "Basin, quality, rights." },
  { slug: "biodiversity", title: "Biodiversity Analyst", industry: "climate", icon: "globe", mission: "Metrics that mean something." },
  { slug: "scribe", title: "Meeting Scribe", industry: "common", icon: "spark", mission: "Decisions, owners, dates only." },
  { slug: "critic-general", title: "General Critic", industry: "common", icon: "spark", mission: "Attack assumptions; stay specific." },
  { slug: "translator-pro", title: "Professional Translator", industry: "common", icon: "spark", mission: "Register and terminology control." },
  { slug: "summarizer-pro", title: "Executive Summarizer", industry: "common", icon: "spark", mission: "Claims mapped to sources." },
  { slug: "prompt-engineer", title: "Prompt Engineer", industry: "common", icon: "spark", mission: "Contracts for models, evals." },
  { slug: "eval-harness", title: "Eval Harness Designer", industry: "common", icon: "spark", mission: "Cases, graders, leakage." },
  { slug: "agent-ops", title: "Agent Ops", industry: "common", icon: "spark", mission: "Cost, traces, failure classes." },
  { slug: "toolsmith", title: "Toolsmith", industry: "common", icon: "spark", mission: "Design tools agents can actually call." },
  { slug: "memory-curator", title: "Memory Curator", industry: "common", icon: "spark", mission: "What to keep, decay, never secrets." },
  { slug: "skill-author", title: "Skill Author", industry: "common", icon: "spark", mission: "SKILL.md that a Hermes agent can run." },
  { slug: "orchestrator", title: "Orchestrator", industry: "common", icon: "spark", mission: "Who speaks, when, done-when." },
  { slug: "human-gate", title: "Human Gatekeeper", industry: "common", icon: "spark", mission: "What must not be autonomous." },
  { slug: "red-team-llm", title: "LLM Red Team", industry: "common", icon: "spark", mission: "Jailbreak classes, not payloads that harm." },
  { slug: "safety-reviewer", title: "AI Safety Reviewer", industry: "common", icon: "spark", mission: "Misuse, dual-use, overreach." },
  { slug: "cost-controller", title: "Token Cost Controller", industry: "common", icon: "spark", mission: "Budgets, caching, cheaper paths." },
  { slug: "schema-guardian", title: "Schema Guardian", industry: "common", icon: "spark", mission: "Typed contracts between agents." },
  { slug: "trace-analyst", title: "Trace Analyst", industry: "common", icon: "spark", mission: "Why a run failed, from events." },
  { slug: "oncall-agent", title: "On-call Agent", industry: "common", icon: "spark", mission: "Pages, runbooks, escalate." },
  { slug: "migration-lead", title: "Migration Lead", industry: "common", icon: "spark", mission: "Strangler, dual-run, rollback." },
  { slug: "docs-auditor", title: "Docs Auditor", industry: "common", icon: "spark", mission: "Docs vs code drift." }
];
var INDUSTRIES = Array.from(new Set(ROLE_PACKS.map((p2) => p2.industry)));
var ROLE_PACK_COUNT = ROLE_PACKS.length;

// src/domain/nodeLibrary.ts
var p = (id, label, dataType, opts = {}) => ({
  id,
  label,
  direction: "input",
  dataType,
  required: false,
  multiple: false,
  ...opts
});
var inP = (port) => ({ ...port, direction: "input" });
var outP = (port) => ({ ...port, direction: "output" });
var rp = (s) => ({ sections: s, version: 1 });
var stdLearning = (focus) => `When feedback is ON, treat every run as a training example. Record reusable procedures as skills, durable facts as memory, and failures as failure memory. Never store secrets. Propose refinements only with evidence from \u22652 runs. ${focus}`;
var stdInvariants = (role) => `You are ${role}. You never act outside this identity. You do not fabricate results, invent tools you were not granted, or expose secrets in any output.`;
var NODE_DEFINITIONS = [
  {
    id: "agent.planner",
    title: "Planner",
    category: "agent",
    icon: "map",
    description: "Decomposes goals into an executable plan with dependencies and acceptance criteria.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("plan", "Plan", "JSON", { required: true })), outP(p("summary", "Summary", "Markdown"))],
    defaultPurpose: "Produce a step-by-step plan with dependencies and success criteria.",
    configSchema: [
      { key: "maxSteps", label: "Maximum steps", type: "number", default: 8 },
      { key: "planningStyle", label: "Planning style", type: "select", options: ["sequential", "parallel-friendly", "milestone"], default: "sequential" }
    ],
    rolePrompt: rp({
      identity: "You are MJ Planner, an autonomous technical planning agent.",
      mission: "Transform a goal plus context into a precise, executable, verifiable plan. Ambiguity is a defect.",
      operatingPrinciples: "Understand before structuring. Decompose along natural seams. Every step must be independently actionable. Prefer fewer well-defined steps. Mark true dependencies. Surface risks.",
      procedures: "1. Parse goal, deliverables, constraints.\n2. Inventory context and capabilities.\n3. Draft verb-first steps with done-when criteria.\n4. Build dependency edges and topological order.\n5. Emit structured JSON.",
      toolStrategy: "Use no tools unless granted. Encode missing information as investigation steps.",
      verificationStrategy: "Every deliverable maps to \u22651 step. Every step has a done-when. No cycles. JSON matches schema.",
      collaborationRules: "Downstream agents cannot ask questions. Write steps they can execute without you.",
      learningRules: stdLearning("Improve decomposition granularity from downstream failures."),
      invariants: stdInvariants("a Planner")
    })
  },
  {
    id: "agent.researcher",
    title: "Researcher",
    category: "agent",
    icon: "search",
    description: "Investigates questions with evidence discipline: sources, verification, contradictions.",
    inputs: [inP(p("query", "Query", "Text", { required: true })), inP(p("context", "Context", "Object")), inP(p("browserSession", "Browser", "BrowserSession"))],
    outputs: [outP(p("findings", "Findings", "Markdown", { required: true })), outP(p("evidence", "Evidence", "JSON"))],
    defaultPurpose: "Research the assigned question and return verified findings with cited evidence.",
    configSchema: [
      { key: "depth", label: "Research depth", type: "select", options: ["quick-scan", "standard", "exhaustive"], default: "standard" },
      { key: "requirePrimarySources", label: "Require primary sources", type: "boolean", default: true }
    ],
    rolePrompt: rp({
      identity: "You are MJ Researcher, an evidence-first investigation agent.",
      mission: "Answer with provenance-explicit findings, calibrated confidence, and honest gaps.",
      operatingPrinciples: "Observation first. Triangulate. Weight primary sources. Treat contradictions as findings. Calibrate confidence. State unknowns.",
      procedures: "Decompose into sub-questions. Gather evidence. Capture source/date/quote. Detect contradictions. Synthesize: answer, evidence, caveats.",
      toolStrategy: "Browser and MCP search when granted. Never write filesystem. Degrade to context-only if tools fail twice.",
      verificationStrategy: "Every factual claim traces to evidence or is marked inference.",
      collaborationRules: "Emit Evidence as JSON so QA can verify mechanically.",
      learningRules: stdLearning("Focus on source-verification patterns."),
      invariants: stdInvariants("a Researcher")
    })
  },
  {
    id: "agent.browser",
    title: "Browser Agent",
    category: "agent",
    icon: "globe",
    description: "Operates headless browser sessions: navigate, interact, extract, verify after each action.",
    inputs: [inP(p("objective", "Objective", "Text", { required: true })), inP(p("session", "Browser Session", "BrowserSession"))],
    outputs: [outP(p("report", "Report", "Markdown", { required: true })), outP(p("sessionOut", "Browser Session", "BrowserSession")), outP(p("extractedData", "Extracted Data", "JSON"))],
    defaultPurpose: "Accomplish the browsing objective and report observed states with evidence.",
    configSchema: [
      { key: "startUrl", label: "Start URL", type: "text" },
      { key: "maxActions", label: "Max actions", type: "number", default: 25 }
    ],
    permissions: { browserControl: true, networkAccess: true },
    rolePrompt: rp({
      identity: "You are MJ Browser Agent, driving a real headless Chromium session.",
      mission: "Achieve the browsing objective with a reproducible action log and evidence.",
      operatingPrinciples: "Never assume success. Verify DOM after each action. Identify elements precisely. Recover once, then report blockers.",
      procedures: "Navigate. Confirm load. Locate. Interact. Verify. Extract. Report.",
      toolStrategy: "All interaction via browser capability. No direct filesystem writes.",
      verificationStrategy: "A click without observable effect is a failure.",
      collaborationRules: "Return the live session so chained nodes reuse cookies/state.",
      learningRules: stdLearning("Learn site-specific recipes only when stable across runs."),
      invariants: stdInvariants("a Browser Agent")
    })
  },
  {
    id: "agent.coder",
    title: "Coder",
    category: "agent",
    icon: "code",
    description: "Writes production-quality code following the task contract; runs checks when permitted.",
    inputs: [inP(p("task", "Task", "Text", { required: true })), inP(p("spec", "Spec/Context", "Markdown")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("result", "Result", "AgentResult", { required: true })), outP(p("filesChanged", "Files Changed", "JSON"))],
    defaultPurpose: "Implement the assigned coding task to the team's quality bar.",
    configSchema: [
      { key: "language", label: "Language", type: "text" },
      { key: "styleGuide", label: "Style notes", type: "textarea" }
    ],
    permissions: { filesystemRead: true, filesystemWrite: true, terminalExecute: true },
    rolePrompt: rp({
      identity: "You are MJ Coder, producing production-grade changes inside a supervised workflow.",
      mission: "Deliver code that satisfies the contract: correct, readable, consistent, verified.",
      operatingPrinciples: "Read before writing. Smallest correct change. Match existing style. No secrets. Surface requirement conflicts.",
      procedures: "Restate as testable behavior. Survey files. Implement incrementally. Self-review. Run checks. Report files and decisions.",
      toolStrategy: "Filesystem and terminal when granted. Prefer project-native commands.",
      verificationStrategy: "Run tests if they exist. State what verification ran vs skipped.",
      collaborationRules: "Emit machine-readable file lists for Tester and Reviewer.",
      learningRules: stdLearning("Distill repo-specific patterns into skills."),
      invariants: stdInvariants("a Coder")
    })
  },
  {
    id: "agent.debugger",
    title: "Debugger",
    category: "agent",
    icon: "bug",
    description: "Diagnoses failures from traces/logs, forms hypotheses, and verifies root causes.",
    inputs: [inP(p("symptom", "Symptom", "Text", { required: true })), inP(p("trace", "Trace/Evidence", "JSON")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("diagnosis", "Diagnosis", "AgentResult", { required: true })), outP(p("hypotheses", "Hypotheses", "JSON"))],
    defaultPurpose: "Find the root cause of the reported failure with evidence.",
    rolePrompt: rp({
      identity: "You are MJ Debugger. Root causes from evidence, not vibes.",
      mission: "Convert a symptom into a verified root-cause explanation.",
      operatingPrinciples: "Read evidence first. Form competing hypotheses. Design cheap discriminating tests. Stop at root cause.",
      procedures: "Characterize. Gather. Hypothesize. Discriminate. Eliminate. Confirm. Emit diagnosis.",
      toolStrategy: "Read-only filesystem and terminal preferred.",
      verificationStrategy: "Verified when the hypothesis explains every recorded symptom.",
      collaborationRules: "Hand hypotheses as JSON so Tester can automate checks.",
      learningRules: stdLearning("Build failure-mode signatures."),
      invariants: stdInvariants("a Debugger")
    })
  },
  {
    id: "agent.tester",
    title: "Tester",
    category: "agent",
    icon: "flask",
    description: "Designs and executes verification: cases, edge conditions, regression checks.",
    inputs: [inP(p("subject", "Subject", "AgentResult", { required: true })), inP(p("spec", "Spec", "Markdown")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("report", "Test Report", "Evaluation", { required: true })), outP(p("failures", "Failures", "JSON"))],
    defaultPurpose: "Design and execute a verification suite against the subject.",
    rolePrompt: rp({
      identity: "You are MJ Tester, an autonomous verification agent.",
      mission: "Prove or refute that the subject meets its contract with explicit cases.",
      operatingPrinciples: "Happy path, edges, regressions. Failures are findings. Never rubber-stamp.",
      procedures: "Extract intended behavior. Design cases. Execute. Record expected vs actual. Emit Evaluation.",
      toolStrategy: "Terminal for test runners when granted.",
      verificationStrategy: "A pass requires observed evidence, not author intent.",
      collaborationRules: "Failures must be actionable for Coder.",
      learningRules: stdLearning("Learn recurring defect classes."),
      invariants: stdInvariants("a Tester")
    })
  },
  {
    id: "agent.critic",
    title: "Critic",
    category: "agent",
    icon: "scale",
    description: "Adversarial review: attacks assumptions, finds holes, scores quality.",
    inputs: [inP(p("proposal", "Proposal", "any", { required: true })), inP(p("rubric", "Rubric", "Text"))],
    outputs: [outP(p("critique", "Critique", "Markdown", { required: true })), outP(p("score", "Score", "Evaluation"))],
    defaultPurpose: "Attack the proposal and return a scored critique.",
    rolePrompt: rp({
      identity: "You are MJ Critic. Your job is to find what is wrong.",
      mission: "Produce a precise, evidence-backed critique that a peer can act on.",
      operatingPrinciples: "Steelman first, then attack. Separate preference from defect. Score against the rubric.",
      procedures: "Restate claim. Check evidence. Find missing cases. Score. Recommend fixes.",
      toolStrategy: "No side-effect tools. Reasoning only unless evidence ports require lookup.",
      verificationStrategy: "Every criticism cites a location or missing artifact.",
      collaborationRules: "Be harsh and specific. Never vague.",
      learningRules: stdLearning("Calibrate scoring against accepted reviews."),
      invariants: stdInvariants("a Critic")
    })
  },
  {
    id: "agent.reviewer",
    title: "Reviewer",
    category: "agent",
    icon: "eye",
    description: "Constructive code/design review with blocking vs non-blocking findings.",
    inputs: [inP(p("workProduct", "Work Product", "any", { required: true })), inP(p("standards", "Standards", "Markdown"))],
    outputs: [outP(p("review", "Review", "Markdown", { required: true })), outP(p("verdict", "Verdict", "JSON"))],
    defaultPurpose: "Review the work product and issue an approve/request-changes verdict.",
    rolePrompt: rp({
      identity: "You are MJ Reviewer, a senior peer reviewer.",
      mission: "Protect quality without blocking good work. Distinguish blockers from nits.",
      operatingPrinciples: "Correctness, security, maintainability, fit. Prefer questions over edicts when uncertain.",
      procedures: "Read fully. List blockers. List suggestions. Issue verdict APPROVE | COMMENT | REQUEST_CHANGES.",
      toolStrategy: "Read-only. No writes.",
      verificationStrategy: "Blockers must be reproducible or contract-violating.",
      collaborationRules: "Coder owns the fix. Do not rewrite the work unless asked.",
      learningRules: stdLearning("Tune what you treat as a blocker."),
      invariants: stdInvariants("a Reviewer")
    })
  },
  {
    id: "agent.qa",
    title: "QA",
    category: "agent",
    icon: "check",
    description: "End-to-end quality gate: acceptance criteria, regressions, release readiness.",
    inputs: [inP(p("build", "Build", "any", { required: true })), inP(p("criteria", "Acceptance", "Markdown"))],
    outputs: [outP(p("gate", "Gate", "Evaluation", { required: true })), outP(p("notes", "Notes", "Markdown"))],
    defaultPurpose: "Decide whether the build is release-ready against acceptance criteria.",
    rolePrompt: rp({
      identity: "You are MJ QA, the last quality gate.",
      mission: "Decide go/no-go with explicit mapping from criteria to evidence.",
      operatingPrinciples: "If evidence is missing, the criterion fails. No hopeful passes.",
      procedures: "Enumerate criteria. Collect evidence. Score. Emit gate.",
      toolStrategy: "Browser and tests when granted.",
      verificationStrategy: "Every criterion has pass/fail plus evidence pointer.",
      collaborationRules: "A no-go must name the cheapest next action.",
      learningRules: stdLearning("Learn which criteria historically catch real defects."),
      invariants: stdInvariants("a QA agent")
    })
  },
  {
    id: "agent.docs",
    title: "Docs",
    category: "agent",
    icon: "book",
    description: "Writes accurate documentation from code, specs, and traces.",
    inputs: [inP(p("source", "Source", "any", { required: true })), inP(p("audience", "Audience", "Text"))],
    outputs: [outP(p("document", "Document", "Markdown", { required: true }))],
    defaultPurpose: "Produce accurate documentation for the given source and audience.",
    rolePrompt: rp({
      identity: "You are MJ Docs, a technical writer who refuses to invent APIs.",
      mission: "Document only what exists. Mark unknowns.",
      operatingPrinciples: "Accuracy over completeness. Examples must run. No marketing language.",
      procedures: "Inventory facts. Structure for the audience. Draft. Cross-check against source.",
      toolStrategy: "Read filesystem when granted.",
      verificationStrategy: "Every command, flag, and type must appear in the source.",
      collaborationRules: "Ask Coder for missing facts instead of guessing.",
      learningRules: stdLearning("Learn the project's documentation voice."),
      invariants: stdInvariants("a Docs agent")
    })
  },
  {
    id: "agent.security",
    title: "Security",
    category: "agent",
    icon: "shield",
    description: "Threat-models and reviews for injection, secrets, SSRF, authz, supply chain.",
    inputs: [inP(p("target", "Target", "any", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("findings", "Findings", "Markdown", { required: true })), outP(p("risks", "Risks", "JSON"))],
    defaultPurpose: "Threat-model the target and report prioritized security findings.",
    rolePrompt: rp({
      identity: "You are MJ Security, a defensive reviewer.",
      mission: "Find exploitable issues and rank them. Do not produce exploit payloads.",
      operatingPrinciples: "Assume hostile input. Secrets never belong in logs. Least privilege.",
      procedures: "Map trust boundaries. Enumerate threats. Check authn/z, injection, SSRF, secrets, deps. Report.",
      toolStrategy: "Read-only. Never attempt live exploitation.",
      verificationStrategy: "Each finding has impact, likelihood, and a concrete fix.",
      collaborationRules: "Escalate destructive findings to Human Approval.",
      learningRules: stdLearning("Track recurring vulnerability classes in this stack."),
      invariants: stdInvariants("a Security agent")
    })
  },
  {
    id: "agent.synthesizer",
    title: "Synthesizer",
    category: "agent",
    icon: "layers",
    description: "Merges multiple agent outputs into one coherent deliverable.",
    inputs: [inP(p("inputs", "Inputs", "any", { required: true, multiple: true })), inP(p("brief", "Brief", "Text"))],
    outputs: [outP(p("synthesis", "Synthesis", "Markdown", { required: true })), outP(p("conflicts", "Conflicts", "JSON"))],
    defaultPurpose: "Merge connected inputs into a single coherent deliverable.",
    rolePrompt: rp({
      identity: "You are MJ Synthesizer. You reconcile, you do not invent.",
      mission: "Produce one coherent artifact and explicitly list conflicts.",
      operatingPrinciples: "Preserve provenance. Prefer primary sources. Do not average disagreements away.",
      procedures: "Inventory inputs. Align structure. Merge agreements. Surface conflicts. Emit.",
      toolStrategy: "No tools required.",
      verificationStrategy: "Every claim traces to an input or is marked original.",
      collaborationRules: "Conflicts go downstream to Judge or Human Approval.",
      learningRules: stdLearning("Learn merge structures that readers preferred."),
      invariants: stdInvariants("a Synthesizer")
    })
  },
  {
    id: "agent.supervisor",
    title: "Supervisor",
    category: "agent",
    icon: "crown",
    description: "Coordinates specialist agents, assigns work, and watches contracts.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("status", "Status", "Object", { multiple: true }))],
    outputs: [outP(p("directive", "Directive", "JSON", { required: true })), outP(p("briefing", "Briefing", "Markdown"))],
    defaultPurpose: "Coordinate the crew: assign next work and watch contracts.",
    rolePrompt: rp({
      identity: "You are MJ Supervisor, crew lead for specialist agents.",
      mission: "Keep the workflow on contract. Unblock. Do not do specialist work yourself.",
      operatingPrinciples: "Delegate. Check contracts. Escalate policy issues. Stop runaway loops.",
      procedures: "Read goal and status. Decide next assignment. Emit directive JSON.",
      toolStrategy: "Workflow-modify only when granted.",
      verificationStrategy: "Directives name owner, input, done-when, timeout.",
      collaborationRules: "Specialists are peers. Do not override their identity.",
      learningRules: stdLearning("Learn which assignments historically stalled."),
      invariants: stdInvariants("a Supervisor")
    })
  },
  {
    id: "agent.router",
    title: "Router",
    category: "agent",
    icon: "gitbranch",
    description: "Classifies work and routes it to the right specialist path.",
    inputs: [inP(p("item", "Item", "any", { required: true })), inP(p("policy", "Policy", "JSON"))],
    outputs: [outP(p("route", "Route", "JSON", { required: true })), outP(p("reason", "Reason", "Text"))],
    defaultPurpose: "Classify the item and choose a route.",
    rolePrompt: rp({
      identity: "You are MJ Router. You classify, you do not solve.",
      mission: "Pick the single best route with a short reason.",
      operatingPrinciples: "Deterministic when policy exists. Conservative default otherwise.",
      procedures: "Read item. Apply policy. Choose route id. Explain in one sentence.",
      toolStrategy: "No tools.",
      verificationStrategy: "Route id must exist in policy.",
      collaborationRules: "Downstream Switch/Condition consumes your route JSON.",
      learningRules: stdLearning("Track misroutes from feedback."),
      invariants: stdInvariants("a Router")
    })
  },
  {
    id: "agent.judge",
    title: "Judge",
    category: "agent",
    icon: "gavel",
    description: "Scores outputs against a rubric and issues a binding decision.",
    inputs: [inP(p("artifact", "Artifact", "any", { required: true })), inP(p("rubric", "Rubric", "Text", { required: true }))],
    outputs: [outP(p("decision", "Decision", "Evaluation", { required: true })), outP(p("rationale", "Rationale", "Markdown"))],
    defaultPurpose: "Score the artifact against the rubric and issue a decision.",
    rolePrompt: rp({
      identity: "You are MJ Judge. Binding, calibrated, explainable.",
      mission: "Apply the rubric literally. Do not add hidden criteria.",
      operatingPrinciples: "Score each criterion. Average only if the rubric says so. Explain dissent.",
      procedures: "Parse rubric. Score each line 0-10. Compute total. Decide PASS/FAIL.",
      toolStrategy: "No tools.",
      verificationStrategy: "Rationale quotes the rubric language used.",
      collaborationRules: "Evolution and QA consume your scores.",
      learningRules: stdLearning("Calibrate against human feedback."),
      invariants: stdInvariants("a Judge")
    })
  },
  {
    id: "agent.reflection",
    title: "Reflection",
    category: "agent",
    icon: "refresh",
    description: "Generate \u2192 critique \u2192 revise loop over an upstream draft.",
    inputs: [inP(p("draft", "Draft", "any", { required: true })), inP(p("criteria", "Criteria", "Text"))],
    outputs: [outP(p("revised", "Revised", "any", { required: true })), outP(p("log", "Reflection Log", "JSON"))],
    defaultPurpose: "Revise the draft until it meets criteria or attempts are exhausted.",
    configSchema: [
      { key: "maxAttempts", label: "Max revisions", type: "number", default: 2 },
      { key: "passThreshold", label: "Pass threshold", type: "number", default: 7 }
    ],
    rolePrompt: rp({
      identity: "You are MJ Reflection, a bounded self-critique loop.",
      mission: "Improve the draft against criteria without changing identity or inventing facts.",
      operatingPrinciples: "Bounded attempts. Keep what works. Fix only failed checks.",
      procedures: "Score draft. If below threshold, revise targeting failed checks. Repeat.",
      toolStrategy: "No side effects.",
      verificationStrategy: "Log every attempt with score and changed spans.",
      collaborationRules: "Never weaken invariants of the upstream agent.",
      learningRules: stdLearning("Learn which revisions actually raised scores."),
      invariants: stdInvariants("a Reflection agent")
    })
  },
  {
    id: "agent.evolution",
    title: "Evolution",
    category: "agent",
    icon: "dna",
    description: "Proposes prompt/skill refinements from traces. Never auto-applies invariants.",
    inputs: [inP(p("traces", "Traces", "JSON", { required: true })), inP(p("baseline", "Baseline", "Evaluation"))],
    outputs: [outP(p("candidate", "Candidate", "JSON", { required: true })), outP(p("diff", "Diff", "Markdown"))],
    defaultPurpose: "Propose an evidenced prompt or skill refinement.",
    evolutionModeDefault: "SUGGEST",
    rolePrompt: rp({
      identity: "You are MJ Evolution. You propose. Humans or gates accept.",
      mission: "Turn traces into a small, evidenced candidate change.",
      operatingPrinciples: "Never touch invariants. Prefer the smallest change that would have prevented a failure.",
      procedures: "Read traces. Isolate failure class. Draft candidate. Produce unified diff. Emit.",
      toolStrategy: "Evolution sidecar if available, else single-shot refine.",
      verificationStrategy: "Candidate must include evidence ids and a rollback snapshot.",
      collaborationRules: "Protected invariants are sacred.",
      learningRules: stdLearning("Track which proposals were accepted."),
      invariants: stdInvariants("an Evolution agent")
    })
  },
  {
    id: "agent.crew",
    title: "Agent Crew",
    category: "agent",
    icon: "crown",
    description: "A working team: one supervisor plus the local CLIs you name (Claude Code, Codex, OpenCode, Cursor, Grok, Cline, Kilo). Not a Zapier router.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("result", "Crew Result", "AgentResult", { required: true })), outP(p("log", "Crew Log", "JSON"))],
    defaultPurpose: "Coordinate the named coding agents as a team against this goal.",
    configSchema: [
      { key: "harness", label: "Lead harness", type: "select", options: ["claude", "codex", "opencode", "cursor", "grok", "cline", "kilo", "llm"], default: "claude" },
      { key: "crew", label: "Crew (comma ids)", type: "text", default: "claude,codex,opencode" }
    ],
    permissions: { terminalExecute: true, filesystemRead: true, filesystemWrite: true, mcpUse: true },
    rolePrompt: rp({
      identity: "You are MJ Crew Lead. You coordinate real coding-agent CLIs. You do not pretend to be those agents.",
      mission: "Assign work to the crew, merge their outputs, surface conflicts.",
      operatingPrinciples: "Delegate. Never fake a CLI that is not installed. Fail closed.",
      procedures: "1. Restate the goal.\n2. Split work across the crew ids.\n3. Ask each harness to execute.\n4. Merge. Name disagreements.",
      toolStrategy: "Spawn only installed harnesses.",
      verificationStrategy: "Every crew member's output is quoted or attached.",
      collaborationRules: "Specialists keep their identity. You do not rewrite their diffs.",
      learningRules: stdLearning("Track which harness pairs worked."),
      invariants: stdInvariants("a Crew Lead")
    })
  },
  {
    id: "agent.custom",
    title: "Custom Agent",
    category: "agent",
    icon: "spark",
    description: "v1 assist target. One job, one identity. Purpose is not the role prompt.",
    inputs: [inP(p("input", "Input", "any", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("output", "Output", "AgentResult", { required: true })), outP(p("notes", "Notes", "JSON"))],
    defaultPurpose: "Accomplish the assigned job.",
    feedbackLoopDefault: "OFF",
    evolutionModeDefault: "OFF",
    rolePrompt: rp({
      identity: "You are a custom MJ specialist. Identity is set when the node is created.",
      mission: "Complete the purpose of this run without leaving this identity.",
      operatingPrinciples: "Stay in role. Prefer evidence. Mark unknowns. No secrets.",
      procedures: "1. Restate the job as a testable outcome.\n2. Use only granted tools.\n3. Verify against the purpose.\n4. Emit the deliverable.",
      toolStrategy: "Use only granted tools and allowed MCP servers.",
      verificationStrategy: "The deliverable must be usable without you present.",
      collaborationRules: "Peers consume the output port. Do not rewrite the graph.",
      learningRules: stdLearning("Only when Feedback Loop is ON."),
      invariants: stdInvariants("a Custom Agent")
    })
  },
  {
    id: "agent.architect",
    title: "Architect",
    category: "agent",
    group: "v3",
    icon: "hex",
    description: "Designs system structure, interfaces, and trade-offs before coding.",
    inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("constraints", "Constraints", "Object"))],
    outputs: [outP(p("architecture", "Architecture", "Markdown", { required: true })), outP(p("adrs", "ADRs", "JSON"))],
    defaultPurpose: "Propose an architecture with explicit trade-offs and ADRs.",
    rolePrompt: rp({
      identity: "You are MJ Architect.",
      mission: "Choose a structure that a Coder can implement without inventing boundaries.",
      operatingPrinciples: "Yagni. Make trade-offs explicit. Prefer boring technology.",
      procedures: "Restate forces. Sketch 2 options. Pick one. Write ADRs. Define interfaces.",
      toolStrategy: "Read repo when granted.",
      verificationStrategy: "Every component has an owner and an interface.",
      collaborationRules: "Do not write implementation code.",
      learningRules: stdLearning("Learn which ADRs aged well."),
      invariants: stdInvariants("an Architect")
    })
  },
  {
    id: "agent.local",
    title: "Local LLM",
    category: "agent",
    group: "v3",
    icon: "cpu",
    description: "Runs against a local Ollama-compatible endpoint. No cloud keys required.",
    inputs: [inP(p("prompt", "Prompt", "Text", { required: true })), inP(p("context", "Context", "any"))],
    outputs: [outP(p("completion", "Completion", "Text", { required: true })), outP(p("meta", "Meta", "JSON"))],
    defaultPurpose: "Complete the prompt on a local model.",
    configSchema: [
      { key: "endpoint", label: "Endpoint", type: "text", default: "http://127.0.0.1:11434" },
      { key: "model", label: "Model", type: "text", default: "llama3.1" }
    ],
    providers: [{ kind: "ollama", model: "llama3.1" }],
    rolePrompt: rp({
      identity: "You are a local model worker hosted inside MJ.",
      mission: "Follow the prompt exactly. Stay offline.",
      operatingPrinciples: "No network except the configured local endpoint.",
      procedures: "Compose prompt. Call local endpoint. Return text and token meta.",
      toolStrategy: "Local HTTP only.",
      verificationStrategy: "Fail closed if the endpoint is down.",
      collaborationRules: "Treat output as untrusted text for downstream agents.",
      learningRules: stdLearning("Track which local models perform well per task."),
      invariants: stdInvariants("a Local LLM worker")
    })
  },
  // ============================ CONTROL ============================
  {
    id: "control.start",
    title: "Start",
    category: "control",
    icon: "play",
    description: "Workflow entry. Emits the initial payload.",
    inputs: [],
    outputs: [outP(p("payload", "Payload", "WorkflowContext"))],
    defaultPurpose: "Begin the workflow.",
    configSchema: [{ key: "initialPayload", label: "Initial payload (JSON)", type: "textarea", default: "{}" }]
  },
  {
    id: "control.end",
    title: "End",
    category: "control",
    icon: "stop",
    description: "Workflow terminus. Collects the final result.",
    inputs: [inP(p("result", "Result", "any", { required: true, multiple: true }))],
    outputs: [],
    defaultPurpose: "Finish and collect results."
  },
  {
    id: "control.condition",
    title: "Condition",
    category: "control",
    icon: "split",
    description: "Boolean branch on a sandboxed expression.",
    inputs: [inP(p("value", "Value", "any", { required: true }))],
    outputs: [outP(p("then", "Then", "any")), outP(p("else", "Else", "any"))],
    configSchema: [{ key: "expression", label: "Expression", type: "text", default: "Boolean(input)" }]
  },
  {
    id: "control.switch",
    title: "Switch",
    category: "control",
    icon: "switch",
    description: "Multi-way branch on a key or expression.",
    inputs: [inP(p("value", "Value", "any", { required: true }))],
    outputs: [outP(p("caseA", "Case A", "any")), outP(p("caseB", "Case B", "any")), outP(p("default", "Default", "any"))],
    configSchema: [{ key: "keyPath", label: "Key path", type: "text", default: "input.route" }]
  },
  {
    id: "control.loop",
    title: "Loop",
    category: "control",
    icon: "refresh",
    description: "Iterates a collection with a bounded max.",
    inputs: [inP(p("items", "Items", "Array", { required: true }))],
    outputs: [outP(p("item", "Item", "any")), outP(p("done", "Done", "Array"))],
    configSchema: [{ key: "maxIterations", label: "Max iterations", type: "number", default: 20 }]
  },
  {
    id: "control.parallel",
    title: "Parallel",
    category: "control",
    icon: "parallel",
    description: "Fans a payload out to concurrent branches.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("branch", "Branch", "any", { multiple: true }))]
  },
  {
    id: "control.sequential",
    title: "Sequential",
    category: "control",
    icon: "list",
    description: "Forces serial execution of downstream nodes.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "any"))]
  },
  {
    id: "control.merge",
    title: "Merge",
    category: "control",
    icon: "merge",
    description: "Joins N inputs into one object or array.",
    inputs: [inP(p("in", "In", "any", { required: true, multiple: true }))],
    outputs: [outP(p("out", "Out", "Object"))],
    configSchema: [{ key: "mode", label: "Mode", type: "select", options: ["object", "array"], default: "object" }]
  },
  {
    id: "control.split",
    title: "Split",
    category: "control",
    icon: "split",
    description: "Splits an array or object into items.",
    inputs: [inP(p("in", "In", "any", { required: true }))],
    outputs: [outP(p("items", "Items", "Array"))]
  },
  {
    id: "control.wait",
    title: "Wait",
    category: "control",
    icon: "clock",
    description: "Delays the token by a fixed duration or until a signal.",
    inputs: [inP(p("in", "In", "any"))],
    outputs: [outP(p("out", "Out", "any"))],
    configSchema: [{ key: "ms", label: "Delay (ms)", type: "number", default: 1e3 }]
  },
  {
    id: "control.retry",
    title: "Retry",
    category: "control",
    icon: "refresh",
    description: "Retries a failed upstream with backoff.",
    inputs: [inP(p("in", "In", "any", { required: true }))],
    outputs: [outP(p("out", "Out", "any")), outP(p("failed", "Failed", "Error"))],
    configSchema: [
      { key: "maxAttempts", label: "Max attempts", type: "number", default: 3 },
      { key: "backoffMs", label: "Backoff (ms)", type: "number", default: 800 }
    ]
  },
  {
    id: "control.fallback",
    title: "Fallback",
    category: "control",
    icon: "shield",
    description: "Uses a backup path when the primary fails.",
    inputs: [inP(p("primary", "Primary", "any")), inP(p("backup", "Backup", "any"))],
    outputs: [outP(p("out", "Out", "any"))]
  },
  {
    id: "control.approval",
    title: "Human Approval",
    category: "control",
    icon: "hand",
    description: "Pauses execution until a human approves or rejects.",
    inputs: [inP(p("proposal", "Proposal", "any", { required: true }))],
    outputs: [outP(p("approved", "Approved", "any")), outP(p("rejected", "Rejected", "any"))],
    defaultPurpose: "Wait for a human decision."
  },
  // ============================ CAPABILITY ============================
  {
    id: "cap.transform",
    title: "Transform",
    category: "capability",
    icon: "wand",
    description: "Sandboxed expression over the input. No eval, no this, no globals.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "any"))],
    configSchema: [{ key: "expression", label: "Expression", type: "text", default: "input" }]
  },
  {
    id: "cap.http",
    title: "HTTP",
    category: "capability",
    icon: "globe",
    description: "Bounded HTTP fetch with SSRF guards.",
    inputs: [inP(p("url", "URL", "URL", { required: true })), inP(p("body", "Body", "any"))],
    outputs: [outP(p("response", "Response", "JSON")), outP(p("error", "Error", "Error"))],
    permissions: { networkAccess: true },
    configSchema: [
      { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "DELETE"], default: "GET" },
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", default: 15e3 }
    ]
  },
  {
    id: "cap.filesystem",
    title: "Filesystem",
    category: "capability",
    icon: "folder",
    description: "Read/write inside the workspace root.",
    inputs: [inP(p("path", "Path", "Text", { required: true })), inP(p("content", "Content", "Text"))],
    outputs: [outP(p("result", "Result", "File")), outP(p("listing", "Listing", "JSON"))],
    permissions: { filesystemRead: true, filesystemWrite: true },
    configSchema: [{ key: "op", label: "Operation", type: "select", options: ["read", "write", "list", "mkdir", "remove"], default: "read" }]
  },
  {
    id: "cap.terminal",
    title: "Terminal",
    category: "capability",
    icon: "terminal",
    description: "Runs an allowlisted program with timeout.",
    inputs: [inP(p("command", "Command", "Text", { required: true })), inP(p("cwd", "CWD", "Text"))],
    outputs: [outP(p("stdout", "Stdout", "Text")), outP(p("result", "Result", "JSON"))],
    permissions: { terminalExecute: true },
    configSchema: [{ key: "timeoutSecs", label: "Timeout (s)", type: "number", default: 60 }]
  },
  {
    id: "cap.browser",
    title: "Browser Session",
    category: "capability",
    icon: "globe",
    description: "Creates or reuses a headless browser session.",
    inputs: [inP(p("url", "Start URL", "URL"))],
    outputs: [outP(p("session", "Session", "BrowserSession"))],
    permissions: { browserControl: true, networkAccess: true }
  },
  {
    id: "cap.json",
    title: "JSON",
    category: "capability",
    group: "v3",
    icon: "braces",
    description: "Parse, stringify, pick, or merge JSON.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "JSON"))],
    configSchema: [
      { key: "op", label: "Operation", type: "select", options: ["parse", "stringify", "pick", "merge"], default: "parse" },
      { key: "path", label: "Path", type: "text", default: "" }
    ]
  },
  {
    id: "cap.webhook",
    title: "Webhook",
    category: "capability",
    group: "v3",
    icon: "zap",
    description: "Emits or receives a signed webhook event.",
    inputs: [inP(p("payload", "Payload", "JSON"))],
    outputs: [outP(p("event", "Event", "Event"))],
    permissions: { networkAccess: true },
    configSchema: [{ key: "url", label: "URL", type: "text" }]
  },
  {
    id: "cap.cron",
    title: "Schedule",
    category: "capability",
    group: "v3",
    icon: "clock",
    description: "Triggers the workflow on a cron expression (desktop scheduler).",
    inputs: [],
    outputs: [outP(p("tick", "Tick", "Event"))],
    configSchema: [{ key: "cron", label: "Cron", type: "text", default: "0 9 * * 1-5" }]
  },
  {
    id: "cap.vector",
    title: "Vector Memory",
    category: "capability",
    group: "v3",
    icon: "cpu",
    description: "Local embedding store for RAG-style recall.",
    inputs: [inP(p("query", "Query", "Text", { required: true })), inP(p("doc", "Document", "Text"))],
    outputs: [outP(p("hits", "Hits", "JSON"))],
    configSchema: [{ key: "k", label: "Top K", type: "number", default: 5 }]
  },
  // ============================ PRESETS ============================
  ...preset("copywriter", "Copywriter", "Writes on-brand marketing copy.", "Write persuasive copy that matches the brief."),
  ...preset("seo", "SEO Analyst", "Audits and improves search visibility.", "Audit SEO and propose concrete fixes."),
  ...preset("summarizer", "Summarizer", "Compresses long material without losing claims.", "Summarize faithfully with source mapping."),
  ...preset("translator", "Translator", "Translates with register and terminology control.", "Translate accurately; keep terms consistent."),
  ...preset("support", "Support Agent", "Drafts customer replies from policy and context.", "Draft a policy-faithful support reply."),
  ...preset("data-analyst", "Data Analyst", "Turns tables into findings and charts-as-prose.", "Analyze the data and report findings."),
  ...preset("pm", "Product Manager", "Writes PRDs, scopes, and acceptance criteria.", "Turn the brief into a PRD."),
  ...preset("sre", "SRE", "Incident commander: impact, blast radius, next actions.", "Triage the incident and propose next actions."),
  ...preset("legal", "Legal Reviewer", "Flags contractual and compliance risk. Not legal advice.", "Flag legal/compliance risks. Do not give advice."),
  ...preset("ux", "UX Writer", "Microcopy, empty states, error language.", "Write precise UX copy for the surface."),
  ...preset("recruiter", "Recruiter", "Screens candidates against a rubric.", "Score the candidate against the rubric."),
  ...preset("sales", "Sales Engineer", "Turns requirements into a technical proposal.", "Draft a technical proposal from the requirements."),
  ...ROLE_PACKS.map(packToDef)
];
function packToDef(pack) {
  return {
    id: `agent.pack.${pack.industry}.${pack.slug}`,
    title: pack.title,
    category: "agent",
    group: pack.industry,
    icon: pack.icon,
    description: `${pack.mission} Hermes-class agent. Not a Zapier step.`,
    inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("context", "Context", "any"))],
    outputs: [outP(p("deliverable", "Deliverable", "AgentResult", { required: true })), outP(p("notes", "Notes", "JSON"))],
    defaultPurpose: pack.mission,
    configSchema: [
      { key: "harness", label: "Runtime", type: "select", options: ["hermes", "claude", "codex", "opencode", "cursor", "grok", "cline", "kilo", "llm"], default: "hermes" }
    ],
    permissions: { filesystemRead: true, terminalExecute: true, mcpUse: true, memoryWrite: true, skillWrite: true },
    rolePrompt: rp({
      identity: `You are MJ ${pack.title}, a Hermes-class specialist (${pack.industry}).`,
      mission: pack.mission,
      operatingPrinciples: "Stay in this identity. Prefer evidence. Mark unknowns. Never invent tools. Fail closed. You are an autonomous worker, not an n8n step.",
      procedures: `1. Restate the brief as a testable outcome.
2. Use Hermes tools when granted.
3. Verify against: ${pack.mission}
4. Emit the deliverable. Call finish.`,
      toolStrategy: "Use only granted tools. Coding CLIs (Claude/Codex/OpenCode) if harness is set to them.",
      verificationStrategy: "The deliverable must be usable without you present.",
      collaborationRules: "Peers consume deliverable + notes. Shared team memory if teamMemoryKey is set.",
      learningRules: stdLearning(`Improve ${pack.title} craft from ratings.`),
      invariants: stdInvariants(`a ${pack.title}`)
    })
  };
}
function preset(slug, title, description, purpose) {
  return [
    {
      id: `agent.preset.${slug}`,
      title,
      category: "agent",
      group: "presets",
      icon: "spark",
      description,
      inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("context", "Context", "any"))],
      outputs: [outP(p("deliverable", "Deliverable", "Markdown", { required: true })), outP(p("notes", "Notes", "JSON"))],
      defaultPurpose: purpose,
      rolePrompt: rp({
        identity: `You are MJ ${title}, a specialist agent.`,
        mission: purpose,
        operatingPrinciples: "Stay in role. Prefer evidence. Mark unknowns. No secrets.",
        procedures: `PROCEDURE
1. Parse the brief.
2. Apply ${title.toLowerCase()} craft.
3. Verify against the brief.
4. Emit the deliverable.`,
        toolStrategy: "Use only granted tools.",
        verificationStrategy: "The deliverable must be usable without you present.",
        collaborationRules: "Peers consume Markdown + notes JSON.",
        learningRules: stdLearning(`Improve ${title.toLowerCase()} craft from ratings.`),
        invariants: stdInvariants(`a ${title}`)
      })
    }
  ];
}
var DEFINITIONS_BY_ID = new Map(NODE_DEFINITIONS.map((d) => [d.id, d]));
function cloneRolePrompt(src) {
  return { version: src.version, sections: { ...src.sections } };
}

// src/graph/factory.ts
function createNodeFromDef(def, id, x, y) {
  const node = {
    id,
    definitionId: def.id,
    title: def.title,
    x,
    y,
    purpose: def.defaultPurpose ?? "",
    inputs: def.inputs.map((p2) => ({ ...p2 })),
    outputs: def.outputs.map((p2) => ({ ...p2 })),
    config: Object.fromEntries((def.configSchema ?? []).map((c) => [c.key, c.default ?? ""])),
    rolePrompt: def.rolePrompt ? cloneRolePrompt(def.rolePrompt) : {
      sections: {
        identity: def.title,
        mission: "",
        operatingPrinciples: "",
        procedures: "",
        toolStrategy: "",
        verificationStrategy: "",
        collaborationRules: "",
        learningRules: "",
        invariants: `You are a ${def.title}. You never act outside this identity.`
      },
      version: 1
    },
    feedbackLoop: def.feedbackLoopDefault ?? "OFF",
    evolutionMode: def.evolutionModeDefault ?? "OFF",
    reflection: { enabled: false, maxAttempts: 2, passThreshold: 7 },
    permissions: {
      filesystemRead: false,
      filesystemWrite: false,
      terminalExecute: false,
      networkAccess: false,
      browserControl: false,
      mcpUse: false,
      providerExecute: def.category === "agent",
      workflowModify: false,
      memoryWrite: true,
      skillWrite: true,
      evolutionPropose: true,
      evolutionAccept: false,
      secretResolve: false,
      ...def.permissions ?? {}
    },
    contract: {
      requiredCapabilities: def.requiredPermissions ?? [],
      sideEffects: [],
      successCriteria: "Output satisfies the declared output schema and the stated success criteria.",
      failureCriteria: "Output cannot be produced within timeout or fails validation.",
      timeoutMs: def.contractTimeoutMs ?? 18e4,
      retryPolicy: { maxAttempts: 2, backoffMs: 1500 }
    },
    providers: def.providers ? structuredClone(def.providers) : def.category === "agent" ? [{ kind: "cli-agent", cliProviderId: "hermes" }] : [],
    allowedMcpServers: [],
    memoryEnabled: true
  };
  if (def.category === "agent") {
    node.config.harness = node.config.harness || "claude";
    node.permissions.terminalExecute = true;
    node.permissions.filesystemRead = true;
    node.permissions.mcpUse = true;
    node.permissions.providerExecute = true;
  }
  return node;
}

// src/domain/dataTypes.ts
var COMPAT = {
  any: [],
  Text: ["Text", "Markdown", "JSON", "URL", "Number", "Boolean"],
  Markdown: ["Markdown", "Text"],
  JSON: ["JSON", "Object", "Array", "Text"],
  Object: ["Object", "JSON", "WorkflowContext", "RepositoryContext", "AgentResult"],
  Array: ["Array", "JSON"],
  Image: ["Image", "File"],
  File: ["File", "Image"],
  URL: ["URL", "Text"],
  BrowserSession: ["BrowserSession"],
  AgentResult: ["AgentResult", "Text", "Markdown", "Object"],
  Evaluation: ["Evaluation", "JSON", "Object", "Text", "Markdown", "AgentResult"],
  Boolean: ["Boolean", "Text", "Number"],
  Number: ["Number", "Text"],
  Stream: ["Stream", "Text"],
  Event: ["Event", "JSON"],
  // V6 fix: a mission/workflow payload is routinely handed to an agent as its brief.
  // Without Text/Markdown/JSON here, every Start -> Agent wire was silently dropped.
  WorkflowContext: ["WorkflowContext", "Object", "Text", "Markdown", "JSON", "URL", "any"],
  RepositoryContext: ["RepositoryContext", "Object"],
  Error: ["Error", "Text"]
};
function portsCompatible(source, target) {
  if (source === "any" || target === "any") return true;
  if (source === target) return true;
  return (COMPAT[source] ?? []).includes(target);
}

// src/graph/validation.ts
function validateWorkflow(graph) {
  const issues = [];
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const conns = graph.connections;
  if (graph.nodes.length === 0) {
    issues.push({ severity: "warning", message: "Workflow is empty." });
    return issues;
  }
  for (const node of graph.nodes) {
    for (const port of node.inputs) {
      if (port.required && !conns.some((c) => c.targetNodeId === node.id && c.targetPortId === port.id)) {
        issues.push({
          nodeId: node.id,
          portId: port.id,
          severity: "error",
          message: `Node "${node.title}" is missing required input "${port.label}" (${port.dataType}).`
        });
      }
    }
    if (node.purpose.trim() === "" && node.inputs.length > 0 && node.definitionId.startsWith("agent.")) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: `Agent node "${node.title}" has no Purpose set.`
      });
    }
    if (!node.contract || typeof node.contract.timeoutMs !== "number" || node.contract.timeoutMs <= 0) {
      issues.push({
        nodeId: node.id,
        severity: "error",
        message: `Node "${node.title}" has an invalid execution timeout.`
      });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  for (const conn of conns) {
    const key = `${conn.sourceNodeId}:${conn.sourcePortId}->${conn.targetNodeId}:${conn.targetPortId}`;
    if (seen.has(key)) {
      issues.push({ connectionId: conn.id, severity: "error", message: "Duplicate connection between the same ports." });
    }
    seen.add(key);
    const src = nodes.get(conn.sourceNodeId);
    const tgt = nodes.get(conn.targetNodeId);
    if (!src || !tgt) {
      issues.push({ connectionId: conn.id, severity: "error", message: "Connection references missing nodes." });
      continue;
    }
    const srcPort = src.outputs.find((p2) => p2.id === conn.sourcePortId);
    const tgtPort = tgt.inputs.find((p2) => p2.id === conn.targetPortId);
    if (!srcPort) {
      issues.push({
        nodeId: src.id,
        portId: conn.sourcePortId,
        connectionId: conn.id,
        severity: "error",
        message: `Source port not found on "${src.title}".`
      });
    }
    if (!tgtPort) {
      issues.push({
        nodeId: tgt.id,
        portId: conn.targetPortId,
        connectionId: conn.id,
        severity: "error",
        message: `Target port not found on "${tgt.title}".`
      });
    }
    if (srcPort && tgtPort) {
      if (!portsCompatible(srcPort.dataType, tgtPort.dataType)) {
        issues.push({
          nodeId: tgt.id,
          portId: tgtPort.id,
          connectionId: conn.id,
          severity: "error",
          message: `Type mismatch: "${src.title}.${srcPort.label}" emits ${srcPort.dataType} but "${tgt.title}.${tgtPort.label}" expects ${tgtPort.dataType}.`
        });
      }
      if (!tgtPort.multiple) {
        const duplicates = conns.filter(
          (c) => c !== conn && c.targetNodeId === conn.targetNodeId && c.targetPortId === conn.targetPortId
        );
        if (duplicates.length > 0) {
          issues.push({
            nodeId: tgt.id,
            portId: tgtPort.id,
            severity: "error",
            message: `Input "${tgtPort.label}" on "${tgt.title}" accepts a single connection but receives multiple.`
          });
        }
      }
    }
  }
  const cycle = findCycle(graph.nodes, conns);
  if (cycle) {
    issues.push({
      severity: "error",
      message: `Cycle detected: ${cycle.map((id) => nodes.get(id)?.title ?? id).join(" \u2192 ")}`
    });
  }
  const consumed = /* @__PURE__ */ new Set([...conns.map((c) => c.sourceNodeId), ...conns.map((c) => c.targetNodeId)]);
  for (const node of graph.nodes) {
    if (!consumed.has(node.id) && graph.nodes.length > 1) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: `Node "${node.title}" is isolated (no connections).`
      });
    }
  }
  return issues;
}
function findCycle(nodes, conns) {
  const adj = /* @__PURE__ */ new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const c of conns) {
    if (adj.has(c.sourceNodeId)) adj.get(c.sourceNodeId).push(c.targetNodeId);
  }
  const state = /* @__PURE__ */ new Map();
  const stack = [];
  const dfs = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const s = state.get(next) ?? 0;
      if (s === 1) {
        stack.push(next);
        return true;
      }
      if (s === 0 && dfs(next)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  };
  for (const n of nodes) {
    if ((state.get(n.id) ?? 0) === 0) {
      stack.length = 0;
      if (dfs(n.id)) {
        const last = stack[stack.length - 1];
        const at = stack.indexOf(last);
        return stack.slice(at);
      }
    }
  }
  return null;
}
function topoSort(nodes, conns) {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const c of conns) {
    adj.get(c.sourceNodeId)?.push(c.targetNodeId);
    indeg.set(c.targetNodeId, (indeg.get(c.targetNodeId) ?? 0) + 1);
  }
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== nodes.length) throw new Error("graph contains a cycle");
  return order;
}

// src/domain/templates.ts
var WORKFLOW_TEMPLATES = [
  {
    id: "real-agent-crew",
    name: "Real Agent Crew",
    category: "Engineering",
    description: "Start \u2192 Claude/Codex/OpenCode crew \u2192 End. Not Zapier. Requires those CLIs on PATH.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "crew", defId: "agent.crew", x: 400, y: 180, purpose: "Ship the assigned coding task using the local CLIs as a team." },
      { key: "e", defId: "control.end", x: 760, y: 220 }
    ],
    wires: [
      ["s", "payload", "crew", "goal"],
      ["crew", "result", "e", "result"]
    ]
  },
  {
    id: "research-write-review",
    name: "Research \u2192 Write \u2192 Review",
    category: "Knowledge",
    description: "Investigate a question, synthesize a document, then review it.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "r", defId: "agent.researcher", x: 360, y: 80, purpose: "Research the assigned question with cited evidence." },
      { key: "d", defId: "agent.docs", x: 360, y: 340, purpose: "Write a clear document from the findings." },
      { key: "v", defId: "agent.reviewer", x: 680, y: 200, purpose: "Review the document for accuracy and gaps." },
      { key: "e", defId: "control.end", x: 980, y: 220 }
    ],
    wires: [
      ["s", "payload", "r", "query"],
      ["r", "findings", "d", "source"],
      ["d", "document", "v", "workProduct"],
      ["v", "review", "e", "result"]
    ]
  },
  {
    id: "code-test-review",
    name: "Code \u2192 Test \u2192 Review",
    category: "Engineering",
    description: "Implement a task, verify it, then peer-review.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 240 },
      { key: "c", defId: "agent.coder", x: 360, y: 80 },
      { key: "t", defId: "agent.tester", x: 360, y: 360 },
      { key: "v", defId: "agent.reviewer", x: 680, y: 220 },
      { key: "e", defId: "control.end", x: 980, y: 240 }
    ],
    wires: [
      ["s", "payload", "c", "task"],
      ["c", "result", "t", "subject"],
      ["c", "result", "v", "workProduct"],
      ["t", "report", "e", "result"],
      ["v", "review", "e", "result"]
    ]
  },
  {
    id: "plan-parallel-synth",
    name: "Plan \u2192 Parallel Research \u2192 Synthesize",
    category: "Knowledge",
    description: "Plan, fan out research, then merge.",
    steps: [
      { key: "s", defId: "control.start", x: 60, y: 260 },
      { key: "p", defId: "agent.planner", x: 320, y: 240 },
      { key: "fan", defId: "control.parallel", x: 580, y: 240 },
      { key: "r1", defId: "agent.researcher", x: 820, y: 80 },
      { key: "r2", defId: "agent.researcher", x: 820, y: 400 },
      { key: "y", defId: "agent.synthesizer", x: 1100, y: 240 },
      { key: "e", defId: "control.end", x: 1380, y: 260 }
    ],
    wires: [
      ["s", "payload", "p", "goal"],
      ["p", "plan", "fan", "input"],
      ["fan", "branch", "r1", "query"],
      ["fan", "branch", "r2", "query"],
      ["r1", "findings", "y", "inputs"],
      ["r2", "findings", "y", "inputs"],
      ["y", "synthesis", "e", "result"]
    ]
  },
  {
    id: "browser-extract",
    name: "Browse \u2192 Extract \u2192 Analyze",
    category: "Web",
    description: "Drive a browser, extract structured data, analyze it.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "sess", defId: "cap.browser", x: 340, y: 80 },
      { key: "b", defId: "agent.browser", x: 620, y: 200 },
      { key: "a", defId: "agent.preset.data-analyst", x: 920, y: 200 },
      { key: "e", defId: "control.end", x: 1220, y: 220 }
    ],
    wires: [
      ["s", "payload", "b", "objective"],
      ["sess", "session", "b", "session"],
      ["b", "extractedData", "a", "brief"],
      ["a", "deliverable", "e", "result"]
    ]
  },
  {
    id: "security-audit",
    name: "Security Audit",
    category: "Security",
    description: "Threat-model, review, and gate a change.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "sec", defId: "agent.security", x: 360, y: 80 },
      { key: "rev", defId: "agent.reviewer", x: 360, y: 360 },
      { key: "j", defId: "agent.judge", x: 680, y: 220 },
      { key: "h", defId: "control.approval", x: 960, y: 220 },
      { key: "e", defId: "control.end", x: 1240, y: 220 }
    ],
    wires: [
      ["s", "payload", "sec", "target"],
      ["s", "payload", "rev", "workProduct"],
      ["sec", "findings", "j", "artifact"],
      ["rev", "review", "j", "rubric"],
      ["j", "decision", "h", "proposal"],
      ["h", "approved", "e", "result"]
    ]
  },
  {
    id: "incident",
    name: "Incident Triage",
    category: "Operations",
    description: "Diagnose a failure, propose a fix, wait for approval.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "d", defId: "agent.debugger", x: 360, y: 80 },
      { key: "sre", defId: "agent.preset.sre", x: 360, y: 360 },
      { key: "c", defId: "agent.coder", x: 680, y: 220 },
      { key: "h", defId: "control.approval", x: 980, y: 220 },
      { key: "e", defId: "control.end", x: 1260, y: 220 }
    ],
    wires: [
      ["s", "payload", "d", "symptom"],
      ["s", "payload", "sre", "brief"],
      ["d", "diagnosis", "c", "task"],
      ["c", "result", "h", "proposal"],
      ["h", "approved", "e", "result"]
    ]
  },
  {
    id: "docs-from-code",
    name: "Docs from Code",
    category: "Engineering",
    description: "Read a repo context and produce documentation.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 180 },
      { key: "d", defId: "agent.docs", x: 400, y: 160 },
      { key: "v", defId: "agent.reviewer", x: 720, y: 160 },
      { key: "e", defId: "control.end", x: 1040, y: 180 }
    ],
    wires: [
      ["s", "payload", "d", "source"],
      ["d", "document", "v", "workProduct"],
      ["v", "review", "e", "result"]
    ]
  },
  {
    id: "debate",
    name: "Multi-agent Debate",
    category: "Quality",
    description: "Proposal, critic, judge. High-signal decisions.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 240 },
      { key: "p", defId: "agent.planner", x: 340, y: 80 },
      { key: "k", defId: "agent.critic", x: 340, y: 380 },
      { key: "j", defId: "agent.judge", x: 680, y: 220 },
      { key: "e", defId: "control.end", x: 1e3, y: 240 }
    ],
    wires: [
      ["s", "payload", "p", "goal"],
      ["p", "plan", "k", "proposal"],
      ["k", "critique", "j", "artifact"],
      ["p", "summary", "j", "rubric"],
      ["j", "decision", "e", "result"]
    ]
  },
  {
    id: "local-offline",
    name: "Local Offline Crew",
    category: "Local",
    description: "Plan and write using a local Ollama model. No cloud keys.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 200 },
      { key: "p", defId: "agent.planner", x: 360, y: 80 },
      { key: "l", defId: "agent.local", x: 360, y: 340 },
      { key: "y", defId: "agent.synthesizer", x: 680, y: 200 },
      { key: "e", defId: "control.end", x: 980, y: 220 }
    ],
    wires: [
      ["s", "payload", "p", "goal"],
      ["p", "summary", "l", "prompt"],
      ["p", "plan", "y", "inputs"],
      ["l", "completion", "y", "inputs"],
      ["y", "synthesis", "e", "result"]
    ]
  },
  {
    id: "content-engine",
    name: "Content Engine",
    category: "Marketing",
    description: "Research, copy, SEO pass, human approval.",
    steps: [
      { key: "s", defId: "control.start", x: 60, y: 240 },
      { key: "r", defId: "agent.researcher", x: 320, y: 80 },
      { key: "c", defId: "agent.preset.copywriter", x: 320, y: 380 },
      { key: "seo", defId: "agent.preset.seo", x: 640, y: 220 },
      { key: "h", defId: "control.approval", x: 940, y: 220 },
      { key: "e", defId: "control.end", x: 1220, y: 240 }
    ],
    wires: [
      ["s", "payload", "r", "query"],
      ["s", "payload", "c", "brief"],
      ["r", "findings", "seo", "brief"],
      ["c", "deliverable", "seo", "context"],
      ["seo", "deliverable", "h", "proposal"],
      ["h", "approved", "e", "result"]
    ]
  }
];
function templateFullyResolvable(id) {
  const t2 = WORKFLOW_TEMPLATES.find((x) => x.id === id);
  if (!t2) return false;
  return t2.steps.every((s) => DEFINITIONS_BY_ID.has(s.defId));
}
function loadTemplate(id) {
  const t2 = WORKFLOW_TEMPLATES.find((x) => x.id === id);
  if (!t2) return { instances: [], wires: [], skipped: [id] };
  const skipped = [];
  const instances = [];
  for (const step of t2.steps) {
    const def = DEFINITIONS_BY_ID.get(step.defId);
    if (!def) {
      skipped.push(step.defId);
      continue;
    }
    const node = createNodeFromDef(def, `n-${step.key}-${Math.random().toString(36).slice(2, 7)}`, step.x, step.y);
    node.templateKey = step.key;
    if (step.purpose) node.purpose = step.purpose;
    instances.push(node);
  }
  return { instances, wires: t2.wires, skipped };
}

// src/domain/frameworks.ts
var AGENT_FRAMEWORKS = [
  { id: "fw.pipeline", name: "Specialist Pipeline", category: "flow", description: "Plan \u2192 research \u2192 implement \u2192 test \u2192 review.", roster: ["agent.planner", "agent.researcher", "agent.coder", "agent.tester", "agent.reviewer"], pattern: "pipeline", notes: "Default engineering path." },
  { id: "fw.hierarchy", name: "Hierarchical Crew", category: "crew", description: "Supervisor assigns; specialists execute; supervisor merges.", roster: ["agent.supervisor", "agent.planner", "agent.coder", "agent.tester"], pattern: "hierarchy", notes: "Supervisor never does specialist work." },
  { id: "fw.debate", name: "Dialectic Debate", category: "quality", description: "Proposal vs critic vs judge.", roster: ["agent.planner", "agent.critic", "agent.judge"], pattern: "debate", notes: "Steelman then attack." },
  { id: "fw.redblue", name: "Red / Blue", category: "security", description: "Attacker framing vs defender; judge binds.", roster: ["agent.security", "agent.reviewer", "agent.judge"], pattern: "debate", notes: "No exploit payloads." },
  { id: "fw.mapreduce", name: "Map\u2013Reduce Research", category: "knowledge", description: "Fan-out researchers, synthesizer reduces.", roster: ["agent.planner", "agent.researcher", "agent.researcher", "agent.synthesizer"], pattern: "map-reduce", notes: "Conflicts are first-class." },
  { id: "fw.swarm", name: "Peer Swarm", category: "crew", description: "Peers work in parallel; synthesizer only merges.", roster: ["agent.coder", "agent.docs", "agent.security", "agent.synthesizer"], pattern: "swarm", notes: "No supervisor. Merge is explicit." },
  { id: "fw.pair", name: "Pair Programming", category: "engineering", description: "Driver implements, tester verifies, navigator reviews.", roster: ["agent.coder", "agent.tester", "agent.reviewer"], pattern: "pair", notes: "Navigator does not rewrite. Roster is typed: Coder.result(AgentResult) -> Tester.subject, Tester.report(Evaluation) -> Reviewer.workProduct." },
  { id: "fw.council", name: "Council / Jury", category: "quality", description: "Three specialists score; judge binds.", roster: ["agent.critic", "agent.reviewer", "agent.qa", "agent.judge"], pattern: "council", notes: "Majority is not automatic \u2014 judge explains dissent." },
  { id: "fw.shadow", name: "Shadow Harness", category: "eval", description: "Same task on two harnesses; synthesizer diffs.", roster: ["agent.coder", "agent.coder", "agent.synthesizer"], pattern: "shadow", notes: "Set different harnesses on the two coders." },
  { id: "fw.specdriven", name: "Spec-Driven", category: "engineering", description: "Architect \u2192 contract \u2192 implement \u2192 verify.", roster: ["agent.architect", "agent.planner", "agent.coder", "agent.tester", "agent.qa"], pattern: "pipeline", notes: "Code is illegal before the contract." },
  { id: "fw.incident", name: "Incident Command", category: "ops", description: "Commander, debugger, SRE, coder, human gate.", roster: ["agent.supervisor", "agent.debugger", "agent.preset.sre", "agent.coder", "control.approval"], pattern: "hierarchy", notes: "Destructive actions require approval." },
  { id: "fw.socratic", name: "Socratic", category: "quality", description: "Critic only asks; author revises; judge scores.", roster: ["agent.critic", "agent.reflection", "agent.judge"], pattern: "loop", notes: "Bounded revisions." },
  { id: "fw.ensemble", name: "Ensemble Vote", category: "quality", description: "Three independent answers; synthesizer + judge.", roster: ["agent.custom", "agent.custom", "agent.custom", "agent.synthesizer", "agent.judge"], pattern: "council", notes: "Independence is the point \u2014 no shared scratch." },
  { id: "fw.scoutact", name: "Scout then Act", category: "flow", description: "Researcher scouts; planner commits; coder acts.", roster: ["agent.researcher", "agent.planner", "agent.coder"], pattern: "pipeline", notes: "No coding before evidence." },
  { id: "fw.adversarial-review", name: "Adversarial Review", category: "quality", description: "Author, hostile critic, constructive reviewer, judge.", roster: ["agent.coder", "agent.critic", "agent.reviewer", "agent.judge"], pattern: "debate", notes: "Hostile and constructive are different jobs." },
  { id: "fw.contract-net", name: "Contract Net", category: "crew", description: "Router auctions work; specialists bid via plans; supervisor awards.", roster: ["agent.router", "agent.planner", "agent.planner", "agent.supervisor", "agent.coder"], pattern: "hierarchy", notes: "Award is explicit." },
  { id: "fw.blackboard", name: "Blackboard", category: "crew", description: "Shared memory; specialists post; synthesizer reads the board.", roster: ["agent.researcher", "agent.architect", "agent.security", "agent.synthesizer"], pattern: "swarm", notes: "Enable memory on every node. Same team key." },
  { id: "fw.war-room", name: "War Room", category: "ops", description: "Supervisor, security, SRE, debugger, human approval.", roster: ["agent.supervisor", "agent.security", "agent.preset.sre", "agent.debugger", "control.approval"], pattern: "hierarchy", notes: "Time-boxed. No silent changes." },
  { id: "fw.producer-gate", name: "Producer \u2192 Reviewer \u2192 Gate", category: "flow", description: "Make, review, QA gate, optional human.", roster: ["agent.coder", "agent.reviewer", "agent.qa", "control.approval"], pattern: "gate", notes: "QA cannot rewrite the work." },
  { id: "fw.recursive", name: "Recursive Decompose", category: "flow", description: "Planner splits; parallel specialists; synthesizer.", roster: ["agent.planner", "control.parallel", "agent.coder", "agent.docs", "control.merge", "agent.synthesizer"], pattern: "map-reduce", notes: "Control nodes are real traffic." },
  { id: "fw.canary", name: "Canary then Full", category: "engineering", description: "Small coder pass, tester, then full coder.", roster: ["agent.coder", "agent.tester", "agent.coder", "agent.qa"], pattern: "pipeline", notes: "Second coder sees the canary evidence." },
  { id: "fw.dual-control", name: "Dual Control", category: "risk", description: "Two independent agents must agree; else human.", roster: ["agent.security", "agent.reviewer", "agent.judge", "control.approval"], pattern: "gate", notes: "Disagreement is a stop, not a merge." },
  { id: "fw.knowledge-distill", name: "Knowledge Distill", category: "learning", description: "Run \u2192 reflection \u2192 evolution propose. Never auto-invariants.", roster: ["agent.coder", "agent.reflection", "agent.evolution"], pattern: "loop", notes: "Evolution SUGGEST only." },
  { id: "fw.handoff-chain", name: "Handoff Chain", category: "flow", description: "Each agent writes a handoff packet for the next identity.", roster: ["agent.researcher", "agent.architect", "agent.coder", "agent.docs", "agent.qa"], pattern: "pipeline", notes: "Handoff must be executable without the author." },
  { id: "fw.clinic", name: "Specialist Clinic", category: "crew", description: "Router sends to one of several enterprise specialists.", roster: ["agent.router", "agent.preset.legal", "agent.security", "agent.preset.data-analyst"], pattern: "hierarchy", notes: "Router classifies; only one clinic sees the case." },
  { id: "fw.triangulation", name: "Research Triangulation", category: "knowledge", description: "Three researchers, different angles; synthesizer; judge.", roster: ["agent.researcher", "agent.researcher", "agent.researcher", "agent.synthesizer", "agent.judge"], pattern: "map-reduce", notes: "Force independent sources." },
  { id: "fw.moe-router", name: "Mixture of Experts", category: "crew", description: "Router picks expert; expert works; critic checks routing.", roster: ["agent.router", "agent.custom", "agent.critic"], pattern: "hierarchy", notes: "Misroutes are feedback for the router." },
  { id: "fw.staged-approval", name: "Staged Approval", category: "risk", description: "Draft, internal review, human, then execute.", roster: ["agent.planner", "agent.reviewer", "control.approval", "agent.coder"], pattern: "gate", notes: "Coder does not run before approval." },
  { id: "fw.refine-loop", name: "Critic\u2013Refine Loop", category: "quality", description: "Make, attack, revise, bounded.", roster: ["agent.coder", "agent.critic", "agent.reflection", "agent.tester"], pattern: "loop", notes: "maxAttempts on reflection." },
  { id: "fw.docs-from-trace", name: "Docs from Trace", category: "engineering", description: "Coder, tester, docs from what actually ran.", roster: ["agent.coder", "agent.tester", "agent.docs", "agent.reviewer"], pattern: "pipeline", notes: "Docs may not invent APIs." },
  { id: "fw.security-gate", name: "Security Gate", category: "security", description: "Threat model, secure review, judge, human.", roster: ["agent.security", "agent.reviewer", "agent.judge", "control.approval"], pattern: "gate", notes: "Fail closed." },
  { id: "fw.local-offline", name: "Air-gapped Local", category: "local", description: "Planner + local LLM + synthesizer. No cloud.", roster: ["agent.planner", "agent.local", "agent.synthesizer"], pattern: "pipeline", notes: "Harness = llm / Ollama." },
  { id: "fw.enterprise-change", name: "Enterprise Change Advisory", category: "enterprise", description: "PM, architect, security, SRE, legal, CAB human.", roster: ["agent.preset.pm", "agent.architect", "agent.security", "agent.preset.sre", "agent.preset.legal", "control.approval"], pattern: "council", notes: "CAB is the human node." },
  { id: "fw.due-diligence", name: "Due Diligence", category: "enterprise", description: "Research, finance, legal, security, synthesizer, judge.", roster: ["agent.researcher", "agent.preset.data-analyst", "agent.preset.legal", "agent.security", "agent.synthesizer", "agent.judge"], pattern: "map-reduce", notes: "Conflicts stay visible." },
  { id: "fw.crew-cli", name: "Local CLI Crew", category: "engineering", description: "One Agent Crew node over Claude/Codex/OpenCode.", roster: ["agent.crew"], pattern: "swarm", notes: "Requires those CLIs on PATH." }
];
var FRAMEWORK_COUNT = AGENT_FRAMEWORKS.length;

// src/domain/teams.ts
function teamFromFramework(fw, name) {
  const members = fw.roster.filter((id) => DEFINITIONS_BY_ID.has(id)).map((id) => {
    const def = DEFINITIONS_BY_ID.get(id);
    return {
      definitionId: id,
      title: def.title,
      harness: def.category === "agent" ? "hermes" : ""
    };
  });
  return {
    name: name || fw.name,
    description: fw.description,
    memoryKey: `team:${(name || fw.id).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    frameworkId: fw.id,
    members
  };
}
function instantiateTeam(team, task) {
  const fw = AGENT_FRAMEWORKS.find((f) => f.id === team.frameworkId);
  const nodes = [];
  const startDef = DEFINITIONS_BY_ID.get("control.start");
  const endDef = DEFINITIONS_BY_ID.get("control.end");
  const start = createNodeFromDef(startDef, `n-start-${rand()}`, 80, 240);
  start.templateKey = "s";
  start.config.initialPayload = JSON.stringify({ task }, null, 2);
  nodes.push(start);
  const agents = [];
  team.members.forEach((m, i) => {
    const def = DEFINITIONS_BY_ID.get(m.definitionId);
    if (!def) return;
    const n = createNodeFromDef(def, `n-${i}-${rand()}`, 360 + i % 4 * 300, 80 + Math.floor(i / 4) * 220);
    n.templateKey = `m${i}`;
    n.title = m.title;
    if (def.category === "agent") {
      n.config.harness = m.harness || "hermes";
      n.config.teamMemoryKey = team.memoryKey;
      n.purpose = m.purpose || task;
      n.memoryEnabled = true;
    }
    agents.push(n);
    nodes.push(n);
  });
  const end = createNodeFromDef(endDef, `n-end-${rand()}`, 360 + Math.min(agents.length, 4) * 300, 240);
  end.templateKey = "e";
  nodes.push(end);
  const wires = [];
  const wire = (a, ap, b, bp) => {
    wires.push([String(a.templateKey), ap, String(b.templateKey), bp]);
  };
  const pattern = fw?.pattern ?? "pipeline";
  if (agents.length === 0) {
    wire(start, "payload", end, "result");
  } else if (pattern === "map-reduce" || pattern === "swarm" || pattern === "council" || pattern === "shadow") {
    const last = agents[agents.length - 1];
    const body = agents.slice(0, -1);
    for (const a of body.length ? body : agents) wire(start, "payload", a, a.inputs[0]?.id ?? "input");
    for (const a of body) wire(a, a.outputs[0]?.id ?? "output", last, last.inputs[0]?.id ?? "input");
    if (!body.length) wire(start, "payload", last, last.inputs[0]?.id ?? "input");
    wire(last, last.outputs[0]?.id ?? "output", end, "result");
  } else {
    wire(start, "payload", agents[0], agents[0].inputs[0]?.id ?? "input");
    for (let i = 0; i < agents.length - 1; i++) {
      wire(agents[i], agents[i].outputs[0]?.id ?? "output", agents[i + 1], agents[i + 1].inputs[0]?.id ?? "input");
    }
    wire(agents[agents.length - 1], agents[agents.length - 1].outputs[0]?.id ?? "output", end, "result");
  }
  return { nodes, wires };
}
function rand() {
  return Math.random().toString(36).slice(2, 8);
}

// src/domain/composer.ts
function composeNodePrompt(node, input, skills = [], memories = []) {
  const s = node.rolePrompt.sections;
  const rolePrompt = [
    `# Identity`,
    s.identity,
    ``,
    `# Mission`,
    s.mission,
    ``,
    `# Operating principles`,
    s.operatingPrinciples,
    ``,
    `# Procedures`,
    s.procedures,
    ``,
    `# Tool strategy`,
    s.toolStrategy,
    ``,
    `# Verification`,
    s.verificationStrategy,
    ``,
    `# Collaboration`,
    s.collaborationRules,
    ``,
    `# Learning`,
    s.learningRules,
    ``,
    `# Invariants (protected)`,
    s.invariants
  ].join("\n");
  const purpose = [
    `# Purpose (this run \u2014 not identity)`,
    node.purpose || "(no purpose set)"
  ].join("\n");
  const skillBlocks = skills.map((sk) => {
    if ("frontmatter" in sk) {
      return `## SKILL ${sk.frontmatter.name}
${sk.frontmatter.description}

${sk.body}`;
    }
    return `## SKILL ${sk.name}
${sk.description}

${sk.procedure}`;
  });
  const skillsText = skillBlocks.length ? `# Active skills

${skillBlocks.join("\n\n")}` : "# Active skills\n(none)";
  const memText = memories.length ? `# Memory

${memories.map((m) => `- [${m.kind}] ${m.content}`).join("\n")}` : "# Memory\n(none)";
  const contract = [
    `# Contract`,
    `Success: ${node.contract.successCriteria}`,
    `Failure: ${node.contract.failureCriteria}`,
    `Timeout: ${node.contract.timeoutMs}ms`,
    `Retry: ${node.contract.retryPolicy.maxAttempts} \xD7 ${node.contract.retryPolicy.backoffMs}ms`,
    node.contract.outputSchema?.length ? `Output schema: ${JSON.stringify(node.contract.outputSchema)}` : ""
  ].filter(Boolean).join("\n");
  const granted = Object.entries(node.permissions).filter(([, v]) => v).map(([k]) => k);
  const permissions = `# Permissions
Granted: ${granted.join(", ") || "(none)"}
Allowed MCP: ${node.allowedMcpServers.join(", ") || "(none)"}`;
  const system = [rolePrompt, skillsText, memText, contract, permissions].join("\n\n");
  const user = `${purpose}

# Input
${JSON.stringify(input, null, 2)}`;
  return {
    system,
    user,
    parts: { rolePrompt, purpose, skills: skillsText, memory: memText, contract, permissions }
  };
}

// probe/engine.test.ts
var pass = 0;
var fail = 0;
var t = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL ${name}: ${e.message}`);
  }
};
var eq = (a, b, m = "") => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
};
function materialise(nodes, wires, lenient = false) {
  const byKey = new Map(nodes.map((n) => [n.templateKey, n]));
  const out = [];
  wires.forEach(([sk, sp, tk, tp], i) => {
    const src = byKey.get(sk);
    const tgt = byKey.get(tk);
    if (!src || !tgt) throw new Error(`wire ${i} references unknown template key ${!src ? sk : tk}`);
    const find = (n, dir, k) => n[dir].find((p2) => p2.id.toLowerCase() === k.toLowerCase() || p2.label.toLowerCase() === k.toLowerCase());
    const s = find(src, "outputs", sp);
    const t2 = find(tgt, "inputs", tp);
    if (!s || !t2 || !portsCompatible(s.dataType, t2.dataType)) {
      if (lenient) return;
      throw new Error(`wire ${i}: ${src.title}.${s?.id ?? sp} -> ${tgt.title}.${t2?.id ?? tp} unresolvable`);
    }
    out.push({ id: "c" + i, sourceNodeId: src.id, sourcePortId: s.id, targetNodeId: tgt.id, targetPortId: t2.id, dataType: "any", status: "idle" });
  });
  return out;
}
var ok = (c, m = "") => {
  if (!c) throw new Error(m || "expected true");
};
console.log("\n== library integrity ==");
t("311 node definitions, unique ids", () => {
  eq(NODE_DEFINITIONS.length, 311);
  eq(new Set(NODE_DEFINITIONS.map((d) => d.id)).size, 311);
});
t("agent defs = 21 core + 256 role packs + 12 presets", () => {
  const ids = NODE_DEFINITIONS.map((d) => d.id);
  const core = ids.filter((i) => i.startsWith("agent.") && !i.startsWith("agent.pack.") && !i.startsWith("agent.preset."));
  const packs = ids.filter((i) => i.startsWith("agent.pack."));
  const presets = ids.filter((i) => i.startsWith("agent.preset."));
  console.log(`       core=${core.length} packs=${packs.length} presets=${presets.length} control=${ids.filter((i) => i.startsWith("control.")).length} cap=${ids.filter((i) => i.startsWith("cap.")).length}`);
  eq(core.length, 21);
  eq(packs.length, 256);
  eq(presets.length, 12);
});
t("256 role packs, unique slugs", () => {
  eq(ROLE_PACKS.length, 256);
  eq(new Set(ROLE_PACKS.map((r) => r.slug)).size, 256);
});
t("35 frameworks, 10 composition patterns", () => {
  eq(AGENT_FRAMEWORKS.length, 35);
  eq(new Set(AGENT_FRAMEWORKS.map((f) => f.pattern)).size, 10);
});
t("every framework roster id resolves in DEFINITIONS_BY_ID", () => {
  const used = [...new Set(AGENT_FRAMEWORKS.flatMap((f) => f.roster))];
  const missing = used.filter((r) => !DEFINITIONS_BY_ID.has(r));
  eq(missing, []);
  console.log(`       ${used.length} distinct roster ids across 35 frameworks`);
});
t("every template step defId resolves (templateFullyResolvable)", () => {
  const bad = WORKFLOW_TEMPLATES.filter((t2) => !templateFullyResolvable(t2.id)).map((t2) => t2.id);
  eq(bad, []);
});
console.log("\n== templates & teams ==");
var tplDeclared = 0;
var tplKept = 0;
var tplBroken = [];
for (const tpl of WORKFLOW_TEMPLATES) {
  const { instances: nodes, wires } = loadTemplate(tpl.id);
  ok(nodes.length >= 3, `template "${tpl.name}" too few nodes`);
  const connections = materialise(nodes, wires, true);
  tplDeclared += wires.length;
  tplKept += connections.length;
  const g = { schemaVersion: 2, id: "w", name: tpl.name, nodes, connections, viewport: { x: 0, y: 0, zoom: 1 } };
  const errors = validateWorkflow(g).filter((i) => i.severity === "error");
  if (errors.length) tplBroken.push(`${tpl.name} (${errors.length})`);
  const order = topoSort(nodes, connections);
  eq(order.length, nodes.length, `template "${tpl.name}": topoSort lost a node`);
}
t(`template wiring: every declared wire survives and no template leaves a required input unwired`, () => {
  eq([tplDeclared, tplKept], [52, 52]);
  eq(tplBroken, []);
});
t("framework->team->graph for all 35 frameworks", () => {
  let totalNodes = 0;
  for (const fw of AGENT_FRAMEWORKS) {
    const team = teamFromFramework(fw);
    const { nodes, wires } = instantiateTeam(team, "test task");
    totalNodes += nodes.length;
    ok(nodes.length >= 3, `${fw.id} produced ${nodes.length} nodes`);
    ok(wires.length >= 2, `${fw.id} produced ${wires.length} wires`);
  }
  console.log(`       ${totalNodes} nodes across 35 frameworks`);
});
console.log("\n== expression sandbox ==");
t("evaluates arithmetic and input access", () => {
  eq(safeEvaluate("input.a + 1", { a: 41 }), 42);
});
t("whitelisted globals only", () => {
  eq(safeEvaluate("Math.max(input.x, 3)", { x: 9 }), 9);
});
t("blocks window", () => {
  let threw = false;
  try {
    safeEvaluate("window.x", {});
  } catch {
    threw = true;
  }
  ok(threw, "window should be blocked");
});
t("blocks process", () => {
  let threw = false;
  try {
    safeEvaluate("process.env", {});
  } catch {
    threw = true;
  }
  ok(threw, "process should be blocked");
});
t("blocks semicolon injection", () => {
  let threw = false;
  try {
    safeEvaluate("1;2", {});
  } catch {
    threw = true;
  }
  ok(threw);
});
t("blocks prototype escape", () => {
  let threw = false;
  try {
    safeEvaluate("input.constructor", {});
  } catch {
    threw = true;
  }
  ok(threw);
});
t("rejects >600 chars", () => {
  let threw = false;
  try {
    safeEvaluate("1+".repeat(400) + "1", {});
  } catch {
    threw = true;
  }
  ok(threw);
});
console.log("\n== control runtime ==");
var mk = (id, cfg = {}, outgoing = []) => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get(id), "x", 0, 0);
  n.config = { ...n.config, ...cfg };
  return runControlNode(n, cfg.__collected ?? {}, outgoing);
};
t("control.start parses initialPayload JSON", () => {
  const r = mk("control.start", { initialPayload: '{"task":"ship"}', __collected: {} });
  eq(r.ports.payload.task, "ship");
});
t("control.start survives bad JSON", () => {
  const r = mk("control.start", { initialPayload: "not json", __collected: {} });
  eq(r.ports.payload, {});
});
t("control.merge object mode merges inputs", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("control.merge"), "m", 0, 0);
  const r = runControlNode(n, { a: { x: 1 }, b: { y: 2 } }, []);
  eq(r.ports.out, { x: 1, y: 2 });
});
t("control.merge array mode collects", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("control.merge"), "m", 0, 0);
  n.config.mode = "array";
  const r = runControlNode(n, { a: 1, b: 2 }, []);
  eq(r.ports.out, [1, 2]);
});
t("control.condition routes + returns skipTargets", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("control.condition"), "c", 0, 0);
  n.config.expression = "input > 5";
  const out = [
    { id: "c1", sourceNodeId: "c", sourcePortId: "then", targetNodeId: "T", targetPortId: "i", dataType: "any", status: "idle" },
    { id: "c2", sourceNodeId: "c", sourcePortId: "else", targetNodeId: "E", targetPortId: "i", dataType: "any", status: "idle" }
  ];
  const r = runControlNode(n, { input: 10 }, out);
  eq(r.skipTargets, ["E"]);
  const r2 = runControlNode(n, { input: 1 }, out);
  eq(r2.skipTargets, ["T"]);
});
t("control.switch maps A/B/default", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("control.switch"), "s", 0, 0);
  n.config.keyPath = "input.route";
  const out = ["caseA", "caseB", "default"].map((p2) => ({ id: "c" + p2, sourceNodeId: "s", sourcePortId: p2, targetNodeId: "T" + p2, targetPortId: "i", dataType: "any", status: "idle" }));
  eq(runControlNode(n, { input: { route: "B" } }, out).skipTargets, ["TcaseA", "Tdefault"]);
});
t("control.loop truncates to maxIterations", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("control.loop"), "l", 0, 0);
  n.config.maxIterations = 2;
  const r = runControlNode(n, { input: [1, 2, 3, 4] }, []);
  eq(r.ports.done, [1, 2]);
});
console.log("\n== evolution gates ==");
t("composite = 0.5c + 0.3p + 0.2conc - penalty", () => {
  eq(compositeOf({ correctness: 1, procedureFollowing: 1, conciseness: 1, lengthPenalty: 0, feedback: "" }), 1);
  eq(compositeOf({ correctness: 0.5, procedureFollowing: 0.5, conciseness: 0.5, lengthPenalty: 0.1, feedback: "" }), 0.4);
});
t("length penalty only above 90% of max", () => {
  eq(lengthPenalty(1e3, 15e3), 0);
  ok(lengthPenalty(15e3, 15e3) > 0);
});
t("bundled skills are read-only", () => {
  const g = gateCandidate({ baselineText: "a", candidateText: "b", taskInput: "t", expectedBehavior: "e", baselineOutput: "o", candidateOutput: "o", bundled: true });
  eq(g.accepted, false);
  ok(g.constraints[0].constraintName === "bundled_readonly");
});
t("growth gate rejects >20% growth", () => {
  const base = "x".repeat(1e3);
  const cand = "x".repeat(1500);
  const r = validateConstraints(cand, "skill", base);
  const growth = r.find((c) => c.constraintName === "growth_limit");
  eq(growth.passed, false);
});
t("empty candidate fails non_empty", () => {
  const r = validateConstraints("   ", "skill");
  eq(r.find((c) => c.constraintName === "non_empty").passed, false);
});
t("identical skill: no improvement over baseline", () => {
  const md = "---\nname: s\ndescription: d\n---\n# Body\nverify the build passes and report failures\n";
  const g = gateCandidate({ baselineText: md, candidateText: md, taskInput: "t", expectedBehavior: "verify the build passes", baselineOutput: "verify the build passes", candidateOutput: "verify the build passes", bundled: false });
  eq(g.accepted, false);
  ok(g.reason.includes("No improvement") || g.reason.includes("Holdout"), g.reason);
  console.log(`       reason="${g.reason}" baseline=${g.baseline.composite.toFixed(3)} candidate=${g.candidate.composite.toFixed(3)}`);
});
t("scheduler's own gate call can never accept: it scores both sides from the same output", () => {
  const run = (procedures) => gateCandidate({
    baselineText: reassembleSkill({ name: "coder", description: "d" }, procedures),
    candidateText: reassembleSkill({ name: "coder", description: "d" }, procedures + "\n\n## Learned corrections\n\n- Prefer explicit done-when after each tool call.\n"),
    taskInput: "fix the build",
    expectedBehavior: "tests pass",
    baselineOutput: "SAME OUTPUT",
    candidateOutput: "SAME OUTPUT",
    bundled: false
  });
  let accepted = 0;
  for (const proc of ["1. Reproduce.\n2. Fix.\n3. Verify.", "Run the tests.", "a".repeat(14e3), "Inspect, patch, re-run, confirm."]) {
    const g = run(proc);
    if (g.accepted) accepted++;
    console.log(`       procedures=${proc.length}ch baseline=${g.baseline.composite.toFixed(4)} candidate=${g.candidate.composite.toFixed(4)} accepted=${g.accepted} reason="${g.reason}"`);
  }
  eq(accepted, 0, "AUTONOMOUS accept should be unreachable while both sides score the same output");
});
t("holdout threshold is 0.45", () => {
  const g = gateCandidate({ baselineText: "a", candidateText: "a better", taskInput: "t", expectedBehavior: "zzz", baselineOutput: "", candidateOutput: "zzz", bundled: false });
  eq(g.holdoutPassed, g.candidate.composite >= 0.45);
});
t("scoreFitness returns 0 for empty output", () => {
  eq(scoreFitness({ taskInput: "a", expectedBehavior: "b", agentOutput: "  ", skillText: "s" }).correctness, 0);
});
t("config matches vendored GEPA numbers", () => {
  eq(EVOLUTION_CONFIG.maxSkillSize, 15e3);
  eq(EVOLUTION_CONFIG.maxToolDescSize, 500);
  eq(EVOLUTION_CONFIG.maxPromptGrowth, 0.2);
  eq(EVOLUTION_CONFIG.trainRatio, 0.5);
});
console.log("\n== SKILL.md contract ==");
t("parses YAML frontmatter + body", () => {
  const md = '---\nname: demo\ndescription: "a demo skill"\nversion: 1.0.0\n---\n# Body\nstep one\n';
  const p2 = parseFrontmatter(md);
  eq(p2.frontmatter.name, "demo");
  ok(p2.body.includes("step one"));
});
t("structure check flags missing description", () => {
  eq(skillHasValidStructure("---\nname: x\n---\nbody").ok, false);
  eq(skillHasValidStructure("---\nname: x\ndescription: y\n---\nbody").ok, true);
});
t("reassembleSkill round-trips", () => {
  const out = reassembleSkill({ name: "n", description: "d" }, "# Body");
  ok(out.startsWith("---") && out.includes("name: n") && out.includes("# Body"));
});
console.log("\n== graph validation & topo ==");
t("cycle detection", () => {
  const a = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.coder"), "a", 0, 0);
  const b = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.reviewer"), "b", 0, 0);
  const conn = (s, t2, id) => ({ id, sourceNodeId: s, sourcePortId: "output", targetNodeId: t2, targetPortId: "input", dataType: "any", status: "idle" });
  const g = { schemaVersion: 2, id: "g", name: "g", nodes: [a, b], connections: [conn("a", "b", "1"), conn("b", "a", "2")], viewport: { x: 0, y: 0, zoom: 1 } };
  const issues = validateWorkflow(g);
  ok(issues.some((i) => i.message.startsWith("Cycle detected")), "cycle not detected");
  let threw = false;
  try {
    topoSort(g.nodes, g.connections);
  } catch {
    threw = true;
  }
  ok(threw, "topoSort should throw on cycle");
});
t("topoSort orders start->agent->end", () => {
  const s = createNodeFromDef(DEFINITIONS_BY_ID.get("control.start"), "s", 0, 0);
  const a = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.coder"), "a", 0, 0);
  const e = createNodeFromDef(DEFINITIONS_BY_ID.get("control.end"), "e", 0, 0);
  const conn = (sn, sp, tn, tp, id) => ({ id, sourceNodeId: sn, sourcePortId: sp, targetNodeId: tn, targetPortId: tp, dataType: "any", status: "idle" });
  const conns = [conn("s", "payload", "a", a.inputs[0].id, "1"), conn("a", a.outputs[0].id, "e", "result", "2")];
  eq(topoSort([a, e, s], conns), ["s", "a", "e"]);
  const g = { schemaVersion: 2, id: "g", name: "g", nodes: [s, a, e], connections: conns, viewport: { x: 0, y: 0, zoom: 1 } };
  const errs = validateWorkflow(g).filter((i) => i.severity === "error");
  eq(errs, []);
});
t("type mismatch is an error", () => {
  const s = createNodeFromDef(DEFINITIONS_BY_ID.get("control.start"), "s", 0, 0);
  const a = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.coder"), "a", 0, 0);
  const bad = { id: "c", sourceNodeId: "s", sourcePortId: "payload", targetNodeId: "a", targetPortId: "does-not-exist", dataType: "any", status: "idle" };
  const g = { schemaVersion: 2, id: "g", name: "g", nodes: [s, a], connections: [bad], viewport: { x: 0, y: 0, zoom: 1 } };
  ok(validateWorkflow(g).some((i) => i.message.includes("Target port not found")));
});
t("portsCompatible allows any<->typed", () => {
  ok(portsCompatible("any", "Text"));
  ok(portsCompatible("Text", "any"));
});
console.log("\n== prompt composition ==");
t("system contains identity/skills/memory/contract/permissions; user holds purpose", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.security"), "sec", 0, 0);
  n.purpose = "Audit this repo";
  const c = composeNodePrompt(n, { input: "x" }, [], []);
  for (const h of ["# Identity", "# Mission", "# Procedures", "# Invariants", "# Active skills", "# Memory", "# Contract", "# Permissions"])
    ok(c.system.includes(h), `missing ${h}`);
  ok(c.user.includes("Audit this repo"));
  ok(!c.system.includes("Audit this repo"), "purpose leaked into identity/system");
  ok(!c.user.includes("# Identity"), "identity leaked into user turn");
});
t("memory and skills are injected when present", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.coder"), "c", 0, 0);
  const c = composeNodePrompt(n, {}, [
    { id: "s", nodeKey: "k", name: "ship", description: "d", procedure: "do it", preconditions: "", toolStrategy: "", verificationStrategy: "", knownFailureModes: "", version: 1, score: null, origin: "learned", active: true, createdAt: "", updatedAt: "" }
  ], [{ id: "m", nodeKey: "k", kind: "episodic", content: "last time X failed", tags: [], importance: 0.5, createdAt: "" }]);
  ok(c.system.includes("## SKILL ship") && c.system.includes("do it"));
  ok(c.system.includes("[episodic] last time X failed"));
});
console.log(`
${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
