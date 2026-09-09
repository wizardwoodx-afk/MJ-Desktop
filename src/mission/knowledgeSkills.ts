/**
 * MJ 12.1.0 — KNOWLEDGE FORGE: books → human-approved skills.
 *
 * The idea (user, 2026): the OSS "book-to-skill" world proved that a good
 * technical book distilled into a structured skill beats dumping the book in
 * context — MJ gets the same capability natively, with its own honesty rules.
 *
 * What this module is:
 *   - A LOCAL converter: document content (markdown / plain text / html, or a
 *     standard Agent-Skills SKILL.md document) is distilled into a compact,
 *     structured skill (frameworks, decision rules, patterns, failure modes)
 *     by a deterministic MECHANICAL extractor, optionally enhanced by an LLM
 *     pass that runs through MJ's OWN installed harness CLIs (claude, codex,
 *     opencode, …) — same local-first boundary as seats: no MJ-side API
 *     keys and no MJ network layer. The harness CLI's OWN provider terms
 *     govern where its prompts go (cloud provider, or a local model the
 *     user configured) — see DATA HANDLING below.
 *   - An honest knowledge channel: the result is a PROPOSAL of origin
 *     "knowledge" that NEVER claims measured effect (it was not learned from
 *     a verified mission). A human approves or discards it; only approved
 *     proposals mirror into the shared skill memory (mj.skills.v1) as
 *     approved RECOURSE (governed write, human), and only then do they ride
 *     every future mission briefing via approvedSkillDefs — the SAME path
 *     verified-mission skills use.
 *
 *   DATA HANDLING — stated precisely (12.1.1, after the 12.1.0 review):
 *   the MECHANICAL extractor is fully local — content never leaves the
 *   machine. The OPTIONAL LLM pass invokes an installed harness CLI
 *   (claude/codex/opencode…); that CLI sends the prompt to the model
 *   provider IT is configured for (e.g. Anthropic for claude) unless the
 *   user pointed the harness at a local model (ANTHROPIC_BASE_URL etc.).
 *   Every proposal records dataHandling: "local" | "provider" reflecting
 *   what actually happened, and the UI discloses it before a cloud pass.
 *
 *   PROVIDER PRECISION (12.2.0, after the 12.1.1 review): when the content
 *   goes to a provider, the proposal also records providerInfo:
 *     vendor        — the harness's DEFAULT vendor when unconfigured
 *                     (claude → Anthropic, codex → OpenAI, opencode →
 *                     configurable…). Honest label: defaults can be
 *                     overridden by the user's own configuration.
 *     endpointClass — cloud-default | local-configured | unknown
 *     endpointBasis — how MJ knows: "detected" (an override was visible to
 *                     MJ), "user-declared" (you told MJ), or "not-visible"
 *                     (MJ runs the CLI with your environment and cannot
 *                     see the harness's own override settings — it says
 *                     "unknown" rather than guessing).
 *   MJ never guesses an endpoint: from the renderer the harness's override
 *   environment is normally NOT visible, so the truthful default is
 *   endpointClass "unknown" with the reason written — unless you declare it
 *   or a host integration supplies the override (probes do).
 *
 * Guardlines (each pinned by probe/knowledgeSkills.test.ts):
 *   G1 content is validated and provenance is mandatory — source name (if
 *      given), content sha256, byte length, tool + version, distiller
 *      identity, date. A proposal without provenance cannot be created.
 *   G2 no structure, no proposal: an unstructured blob is refused with a
 *      written reason (extract structure, not summaries).
 *   G3 nothing installs silently: proposals start "proposed"; only a human
 *      decide() can approve; decisions record by/at; a second decision is
 *      refused.
 *   G4 knowledge ≠ learning: proposals never touch lessons/autonomy/bandit
 *      stores, claim no measured effect, and are labelled [knowledge] in
 *      briefings.
 *   G5 the LLM pass is a best-effort enhancement with an honest fallback: a
 *      missing harness or a garbage LLM answer falls back to "mechanical",
 *      with the unavailability written into the proposal — the model is
 *      never credited with output it did not produce.
 *   G6 approved knowledge writes through the governed ledger as a human
 *      RECOURSE write (saveSkills(…, "human")).
 */
import { uid } from "../app/id";
import { loadSkills, mergeProposals, saveSkills, type SkillProposal } from "./skillEvolution";

export const KNOWLEDGE_TOOL = "mj-knowledge-forge/mechanical-v1";
const LS_KEY = "mj.knowledgeSkills.v1";

export interface KnowledgeProvenance {
  sourceName: string | null;
  sourceSha256: string;
  byteLength: number;
  tool: string;
  distilledAt: string;
}

export type Distiller =
  | { kind: "mechanical"; note: string | null }
  | { kind: "llm"; harness: string; note: string | null };

export type EndpointClass = "cloud-default" | "local-configured" | "unknown";
export type EndpointBasis = "detected" | "user-declared" | "not-visible";

export interface ProviderInfo {
  /** The harness's DEFAULT vendor when unconfigured — never a claim about
   *  the user's actual override (12.2.0). */
  vendor: string;
  endpointClass: EndpointClass;
  endpointBasis: EndpointBasis;
  /** Written reason — always present so "unknown" is never silent. */
  note: string;
}

export interface KnowledgeProposal {
  id: string;
  /** 12.1.1 — what actually happened to the content: "local" = never left
   *  the machine (mechanical, or an LLM pass that never invoked a CLI);
   *  "provider" = the content was sent to the selected harness CLI's
   *  configured model provider. Disclosure, not marketing. */
  dataHandling: "local" | "provider";
  /** 12.2.0 — present only when dataHandling === "provider". */
  providerInfo: ProviderInfo | null;
  title: string;
  summary: string;
  procedure: string;
  preconditions: string;
  toolStrategy: string;
  verificationStrategy: string;
  knownFailureModes: string;
  /** Honesty: knowledge is approved human knowledge, never a measured claim. */
  claimsMeasuredEffect: false;
  provenance: KnowledgeProvenance;
  distiller: Distiller;
  status: "proposed" | "approved" | "discarded";
  decidedBy: string | null;
  decidedAt: string | null;
  decidedNote: string | null;
}

export interface ExtractStructure {
  frameworks: string[];
  decisionRules: string[];
  codePatterns: string[];
  chapterHints: string[];
}

const RULE_HINTS = /\b(must|never|always|only|when|if|avoid|prefer|before|after)\b/i;
const ARROW = /→|=>|->|⇒/;

/** Deterministic structural extraction (G2: structure, not summaries). */
export function extractStructure(content: string): ExtractStructure {
  const lines = content.split(/\r?\n/);
  const frameworks: string[] = [];
  const decisionRules: string[] = [];
  const codePatterns: string[] = [];
  const chapterHints: string[] = [];
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

/** REAL SHA-256 (WebCrypto — same primitive MJ's receipt chain uses; works in
 *  the browser build and under node >= 20). Provenance must be honest. */
export async function sha256Hex(content: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ———————————————————————————————— store (shared, single key) ——————————————— */

export function loadKnowledgeProposals(): KnowledgeProposal[] {
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as KnowledgeProposal[];
      if (Array.isArray(p)) return p;
    }
  } catch {
    /* storage unavailable */
  }
  return [];
}

export function saveKnowledgeProposals(memory: KnowledgeProposal[]): void {
  try {
    globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(memory));
  } catch {
    /* memory-only when storage is unavailable */
  }
}

/* —————————————————————————————— the pipeline —————————————————————————————— */

/** Same boundary shape as TeamRunnerDeps.cliInvoke — the forge reuses the
 *  executor's real CLI contract so host deps drop in unchanged. */
/** DEFAULT vendor per harness when the user has not overridden anything.
 *  Honest by construction: opencode is model-agnostic (bring-your-own-key),
 *  so its vendor is "configurable", not a guess. Unknown harnesses fall
 *  back to "<harness>'s configured provider". */
const HARNESS_DEFAULT_VENDOR: Record<string, string> = {
  claude: "Anthropic",
  codex: "OpenAI",
  gemini: "Google",
  grok: "xAI",
  qwen: "Alibaba Qwen",
  opencode: "configurable (see opencode's own provider settings)",
  openclaude: "configurable",
  cursor: "configurable (Cursor's model picker)",
};
/** Well-known endpoint override vars MJ can look for when a host exposes
 *  environment reads. Only vars MJ is confident about are listed — an
 *  unlisted override still means "unknown", never a guess. */
const HARNESS_ENV_OVERRIDES: Record<string, string[]> = {
  claude: ["ANTHROPIC_BASE_URL"],
  codex: ["OPENAI_BASE_URL"],
  opencode: ["OPENCODE_BASE_URL", "OPENAI_BASE_URL", "ANTHROPIC_BASE_URL"],
};

export function defaultVendorFor(harness: string): string {
  return HARNESS_DEFAULT_VENDOR[harness] ?? `${harness}'s configured provider`;
}

export function loopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}

/** Classify an endpoint override value. Pure + deterministic (probed). */
export function classifyEndpoint(baseUrl: string | null | undefined): { endpointClass: EndpointClass; note: string } {
  if (!baseUrl || !baseUrl.trim()) {
    return { endpointClass: "cloud-default", note: "no endpoint override visible — the harness's default cloud provider" };
  }
  try {
    const host = new URL(baseUrl.trim()).hostname;
    if (loopbackHost(host)) {
      return { endpointClass: "local-configured", note: `endpoint override points at loopback (${host}) — content stays on this machine` };
    }
    return { endpointClass: "unknown", note: `endpoint override points at a non-loopback host (${host}) — MJ cannot determine where it terminates` };
  } catch {
    return { endpointClass: "unknown", note: "endpoint override is not a valid URL — MJ cannot determine where content goes" };
  }
}

export interface LlmInvoke {
  (req: { bin: string; argv: string[]; cwd: string; timeoutSecs: number; env?: Record<string, string> }): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }>;
}
export interface ForgeDeps {
  resolveBin?: (bin: string) => Promise<string | null>;
  cliInvoke?: LlmInvoke;
  /** Optional environment read (native hosts may supply it later). When
   *  absent, MJ records endpointClass "unknown / not-visible" instead of
   *  guessing. Probes inject scripted readers to exercise detection. */
  readEnv?: (names: string[]) => Promise<Array<string | null>>;
}

const LLM_PROMPT = (content: string): string =>
  `You are a book-distiller. Extract STRUCTURE, not a summary, from the document below. ` +
  `Reply with ONLY a JSON object: {"title": string, "summary": string (<=2 lines), "procedure": string (compact step guidance), "decisionRules": string[], "knownFailureModes": string[]}. No markdown fences.\n\nDOCUMENT:\n${content.slice(0, 60_000)}`;

export interface ProposeArgs {
  content: string;
  /** Optional human-facing source name (file/book/chapter title). */
  sourceName?: string | null;
  /** Optional LLM enhancement through an MJ harness CLI (local). */
  llm?: { harness: string; deps: ForgeDeps; declaredEndpoint?: "cloud" | "local" | null } | null;
  nowIso?: string;
}

export type ProposeResult =
  | { ok: true; proposal: KnowledgeProposal }
  | { ok: false; error: string };

const MIN_CONTENT = 60;
const MAX_CONTENT = 400_000;

export async function proposeKnowledgeSkill(args: ProposeArgs): Promise<ProposeResult> {
  const content = (args.content ?? "").trim();
  if (content.length < MIN_CONTENT) {
    return { ok: false, error: `document too small (${content.length} chars; need >= ${MIN_CONTENT}) — nothing to distill` };
  }
  if (content.length > MAX_CONTENT) {
    return { ok: false, error: `document too large (${content.length} chars; cap ${MAX_CONTENT}) — distill a chapter, not a library` };
  }
  const structure = extractStructure(content);
  if (structure.frameworks.length === 0 && structure.decisionRules.length === 0 && structure.chapterHints.length === 0) {
    return { ok: false, error: "no extractable structure (headings, rules, frameworks) — MJ distills structure, not summaries; a raw blob is refused" };
  }
  const nowIso = args.nowIso ?? new Date().toISOString();
  const sourceName = args.sourceName?.trim() || null;
  const sha = await sha256Hex(content);

  // G5 — best-effort LLM pass with an honest fallback. dataHandling is set
  // by what ACTUALLY happened: invoking the harness CLI sends the prompt to
  // that harness's configured model provider; only a pass that never invoked
  // a CLI stays "local".
  let distiller: Distiller = { kind: "mechanical", note: null };
  let dataHandling: KnowledgeProposal["dataHandling"] = "local";
  let providerInfo: ProviderInfo | null = null;
  let llmProcedure = "";
  let llmFailureModes: string[] = [];
  if (args.llm) {
    try {
      const bin = await args.llm.deps.resolveBin?.(args.llm.harness);
      if (!bin) {
        distiller = { kind: "mechanical", note: `LLM distillation requested via "${args.llm.harness}" but no local binary was found — mechanical structure only` };
      } else {
        dataHandling = "provider"; // content is about to go to the harness's model provider
        // 12.2.0 — provider precision: vendor (default) + endpoint class by
        // what MJ can actually see; never a guess.
        const vendor = defaultVendorFor(args.llm.harness);
        const overrideNames = HARNESS_ENV_OVERRIDES[args.llm.harness] ?? [];
        let endpoint: { endpointClass: EndpointClass; endpointBasis: EndpointBasis; note: string };
        if (overrideNames.length > 0 && args.llm.deps.readEnv) {
          try {
            const vals = await args.llm.deps.readEnv(overrideNames);
            const found = vals.find((v): v is string => typeof v === "string" && v.trim().length > 0);
            if (found === undefined) {
              endpoint = { endpointClass: "cloud-default", endpointBasis: "detected", note: "no endpoint override visible to MJ — the harness's default cloud provider" };
            } else {
              const c = classifyEndpoint(found);
              endpoint = { endpointClass: c.endpointClass, endpointBasis: "detected", note: c.note };
            }
          } catch {
            endpoint = { endpointClass: "unknown", endpointBasis: "not-visible", note: "MJ could not read the harness's endpoint override" };
          }
        } else if (args.llm.declaredEndpoint) {
          endpoint =
            args.llm.declaredEndpoint === "local"
              ? { endpointClass: "local-configured", endpointBasis: "user-declared", note: "you declared this harness uses a local model endpoint" }
              : { endpointClass: "cloud-default", endpointBasis: "user-declared", note: "you declared this harness uses its default cloud provider" };
        } else {
          endpoint = {
            endpointClass: "unknown",
            endpointBasis: "not-visible",
            note: `MJ runs ${args.llm.harness} with your environment and cannot see its endpoint override settings — the destination is whatever the harness's own configuration decides`,
          };
        }
        providerInfo = { vendor, ...endpoint };
        const res = await args.llm.deps.cliInvoke?.({
          bin,
          argv: ["-p", LLM_PROMPT(content)],
          cwd: ".",
          timeoutSecs: 600,
        });
        const stdout = (res?.stdout ?? "").trim();
        let parsed: Record<string, unknown> | null = null;
        if (stdout) {
          try {
            parsed = JSON.parse(stdout.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")) as Record<string, unknown>;
          } catch {
            parsed = null; // unparseable output is "no usable structure", not a crash
          }
        }
        if (!res || res.exitCode !== 0 || res.timedOut || !parsed || typeof parsed.procedure !== "string" || !parsed.procedure.trim()) {
          distiller = { kind: "mechanical", note: `LLM distillation via "${args.llm.harness}" returned no usable structure — mechanical structure only` };
        } else {
          distiller = { kind: "llm", harness: args.llm.harness, note: null };
          llmProcedure = (typeof parsed.procedure === "string" ? parsed.procedure : "").trim();
          if (Array.isArray(parsed.knownFailureModes)) {
            llmFailureModes = parsed.knownFailureModes.filter((x): x is string => typeof x === "string").slice(0, 8);
          }
        }
      }
    } catch (err) {
      distiller = { kind: "mechanical", note: `LLM distillation via "${args.llm.harness}" failed (${err instanceof Error ? err.message : String(err).slice(0, 120)}) — mechanical structure only` };
    }
  }

  const frameworks = structure.frameworks.slice(0, 12);
  const rules = structure.decisionRules.slice(0, 16);
  const summary =
    (structure.chapterHints.slice(0, 3).join(" / ") || "Untitled document") +
    (frameworks.length > 0 ? ` — frameworks: ${frameworks.slice(0, 4).join(", ")}` : "");
  const mechanicalProcedure = [
    ...(frameworks.length > 0 ? [`Frameworks: ${frameworks.join("; ")}`] : []),
    ...rules.map((r) => `- ${r}`),
  ].join("\n");
  const procedure = llmProcedure ? `LLM-distilled guidance:\n${llmProcedure}\n\nExtracted rules:\n${mechanicalProcedure}` : mechanicalProcedure || "Structured notes extracted from the source document.";
  const knownFailureModes = llmFailureModes.length > 0 ? llmFailureModes.join("\n- ") : "Not measured: knowledge skill — failures are only knowable after real use.";

  const proposal: KnowledgeProposal = {
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
    decidedNote: null,
  };
  const memory = loadKnowledgeProposals();
  memory.push(proposal);
  saveKnowledgeProposals(memory);
  return { ok: true, proposal };
}

export type KnowledgeDecision = "APPROVED" | "REJECTED";

export interface DecideArgs {
  id: string;
  decision: KnowledgeDecision;
  by: string;
  note?: string | null;
  nowIso?: string;
}

export type DecideResult =
  | { ok: true; proposal: KnowledgeProposal; mirrored: boolean }
  | { ok: false; error: string };

/** Human gate (G3, G6): APPROVED mirrors into the shared skill memory as an
 *  approved [knowledge] RECOURSE — governed human write — which then rides
 *  every future mission briefing via approvedSkillDefs. REJECTED is recorded
 *  and changes nothing. A proposal can be decided exactly once. */
export function decideKnowledgeProposal(args: DecideArgs): DecideResult {
  const memory = loadKnowledgeProposals();
  const p = memory.find((x) => x.id === args.id);
  if (!p) return { ok: false, error: `no knowledge proposal matches ${args.id}` };
  if (p.status !== "proposed") return { ok: false, error: `proposal ${args.id} was already ${p.status} — one decision per proposal` };
  const nowIso = args.nowIso ?? new Date().toISOString();
  let mirrored = false;
  if (args.decision === "APPROVED") {
    const skills = loadSkills();
    const line: SkillProposal = {
      id: `kn-${p.id.replace("kn-", "")}`,
      name: p.title.slice(0, 60),
      description: `[knowledge] ${p.summary.slice(0, 160)} — ${p.procedure.slice(0, 440)}`,
      source: "knowledge",
      sourceMissionId: `knowledge:${p.provenance.sourceSha256.slice(0, 16)}`,
      status: "approved",
      learnedAt: Date.parse(nowIso) || Date.now(),
    };
    saveSkills(mergeProposals(skills, [line]), "human");
    mirrored = true;
  }
  p.status = args.decision === "APPROVED" ? "approved" : "discarded";
  p.decidedBy = args.by;
  p.decidedAt = nowIso;
  p.decidedNote = args.note ?? null;
  saveKnowledgeProposals(memory);
  return { ok: true, proposal: p, mirrored };
}

