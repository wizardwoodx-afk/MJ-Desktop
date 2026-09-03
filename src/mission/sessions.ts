/**
 * AGENT SESSIONS — the thing that turns a sequence of CLI invocations into a conversation.
 *
 * WHY THIS EXISTS
 *
 * Every invocation of a coding CLI is a fresh process. A "reviewer" that has to re-read the whole
 * repository on every turn is not a team member, it is a search engine with opinions. Real teams need
 * continuity: the coder remembers what it wrote, the reviewer remembers what it objected to, and a
 * repair turn can say "fix the thing you just did".
 *
 * THE TWO RULES THE REAL BINARIES TAUGHT
 *
 * 1. Some CLIs let you choose the session id, some do not. Claude's `--session-id <uuid>` CREATES a
 *    conversation under the id you pass. OpenCode's `--session <id>` LOADS one and exits 1 with
 *    "Error: Session not found" if it does not exist — observed on the real 1.18.25 binary. Assuming
 *    every CLI accepts a chosen id breaks half of them on turn one.
 *
 * 2. Capture the id from the CLI's own output even when you chose it. That confirms the session
 *    actually started, which matters when the first turn died at authentication.
 *
 * Continuity was proven end to end, not assumed: turn one planted a codeword, a FRESH process resumed
 * on the captured id and recalled it exactly.
 */

import type { HarnessId } from "../domain/harness";
import { resolveCaps } from "./agentCapabilities";

export interface SessionKey {
  /** Which seat owns the conversation. */
  seatId: string;
  /** Which CLI. A conversation cannot move between vendors. */
  harness: HarnessId;
  /** Model, because resuming a Sonnet session with Opus is not the same conversation. */
  model: string | null;
  /** The directory the session was started in. Sessions are cwd-scoped. */
  cwd: string;
}

export interface AgentSession {
  key: SessionKey;
  /** The id the CLI knows this conversation by. */
  sessionId: string;
  /** True once the CLI has confirmed the session exists. */
  confirmed: boolean;
  turns: number;
  createdAt: string;
  updatedAt: string;
  /** Last thing this session was asked, kept so a retry does not silently repeat it. */
  lastPromptHash: string | null;
  /** Set when the CLI reported it could not resume, so MJ starts fresh instead of looping. */
  resumeFailedAt: string | null;
}

/** Stable key so a session is found again after a reload. */
export function sessionKeyString(k: SessionKey): string {
  return `${k.seatId}|${k.harness}|${k.model ?? "default"}|${k.cwd}`;
}

/**
 * A deterministic id for a seat's conversation.
 *
 * Derived rather than random, so the same seat on the same mission in the same worktree always maps to
 * the same session — which lets MJ resume after a restart without a database round trip. Not
 * cryptographic; this is a lookup handle, not a secret.
 */
export function deriveSessionId(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + i, 2246822519) >>> 0;
  }
  const hex = (n: number, len: number) => n.toString(16).padStart(len, "0").slice(-len);
  // Shaped like a UUID so `--session-id <uuid>` accepts it.
  return `${hex(h1, 8)}-${hex(h2, 4)}-4${hex(h1 >>> 8, 3)}-a${hex(h2 >>> 12, 3)}-${hex(h1 ^ h2, 8)}${hex(h2 ^ h1, 4)}`;
}

export class SessionStore {
  private byKey = new Map<string, AgentSession>();

  all(): AgentSession[] {
    return [...this.byKey.values()];
  }

  get(key: SessionKey): AgentSession | null {
    return this.byKey.get(sessionKeyString(key)) ?? null;
  }

  /**
   * Get the session for a seat, creating it on first use.
   *
   * `confirmed` starts false: MJ has asked for a session, but the CLI has not yet said it exists. That
   * distinction is what stops MJ resuming a conversation that never started.
   */
  obtain(key: SessionKey, now = new Date().toISOString()): AgentSession {
    const k = sessionKeyString(key);
    const existing = this.byKey.get(k);
    if (existing) return existing;
    const fresh: AgentSession = {
      key,
      sessionId: deriveSessionId(k),
      confirmed: false,
      turns: 0,
      createdAt: now,
      updatedAt: now,
      lastPromptHash: null,
      resumeFailedAt: null,
    };
    this.byKey.set(k, fresh);
    return fresh;
  }

  /**
   * Record that a turn happened, and confirm the session if the CLI reported an id.
   *
   * `reportedId` is what the CLI printed. When it differs from the id MJ asked for, the CLI's word
   * wins — it owns the conversation — and the session is re-keyed so the next resume works.
   */
  recordTurn(key: SessionKey, reportedId: string | null, prompt: string, now = new Date().toISOString()): AgentSession {
    const s = this.obtain(key, now);
    if (reportedId && reportedId !== s.sessionId) {
      this.byKey.delete(sessionKeyString(key));
      s.sessionId = reportedId;
      this.byKey.set(sessionKeyString(key), s);
    }
    if (reportedId) s.confirmed = true;
    s.turns += 1;
    s.updatedAt = now;
    s.lastPromptHash = hashPrompt(prompt);
    s.resumeFailedAt = null;
    return s;
  }

  /** The CLI could not resume. Mark it so the next turn starts fresh instead of failing forever. */
  markResumeFailed(key: SessionKey, now = new Date().toISOString()): void {
    const s = this.get(key);
    if (s) s.resumeFailedAt = now;
  }

  hydrate(sessions: AgentSession[]): void {
    for (const s of sessions) this.byKey.set(sessionKeyString(s.key), s);
  }

  export(): AgentSession[] {
    return this.all();
  }
}

function hashPrompt(p: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < p.length; i += 1) h = Math.imul(h ^ p.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}

/* ------------------------------------------------------------------ argv */

export type TurnKind = "first" | "follow-up";

/**
 * Who owns the session id.
 *
 *   mj-chosen    MJ generated it and the CLI will create a session under it (Claude's --session-id).
 *   cli-chosen   The CLI invents its own id (OpenCode's `ses_...`). MJ must NOT pass one on turn one;
 *                passing an unknown id is a hard error, not a no-op.
 */
export type SessionIdKind = "mj-chosen" | "cli-chosen";

/**
 * The flags that give a turn conversational continuity.
 *
 * Returns nothing for harnesses with no documented resume, and says so — silently dropping continuity
 * would make a reviewer forget its own objections and approve on the second pass.
 */
export function sessionArgv(
  harness: HarnessId | string,
  opts: { kind: TurnKind; idKind: SessionIdKind; sessionId: string },
): { argv: string[]; continuity: "session" | "continue-latest" | "none"; warning: string | null } {
  // V11.6.3: session resolution consumes the SAME resolved-harness abstraction as every
  // other layer (the "one harness truth" pass, completed). A custom harness — registered
  // or not — has no documented resume shape by definition: the synthetic entry carries
  // none, so the turn is honestly stateless.
  const rc = resolveCaps(harness);
  if (rc.custom) {
    return { argv: [], continuity: "none", warning: "Custom harness: no session continuity — every turn is stateless." };
  }
  if (!rc.registered) {
    return { argv: [], continuity: "none", warning: `Harness "${harness}" is not registered (anymore); this turn is stateless.` };
  }
  const caps = rc.caps;

  // Turn one on a CLI that names its own sessions: emit nothing, then capture the id from the output.
  // This is not a limitation to apologise for — it is the only correct behaviour, because passing an id
  // the CLI has never heard of makes it exit 1 before doing any work at all.
  if (opts.kind === "first" && opts.idKind === "cli-chosen") {
    return { argv: [], continuity: "session", warning: null };
  }

  if (opts.kind === "first") {
    const start = caps.sessionStart;
    if (!start?.argv) {
      return { argv: [], continuity: "none", warning: `${caps.name} has no documented way to start a session under a chosen id, so this turn is stateless.` };
    }
    return { argv: start.argv.map((a) => (a === "$SESSION" ? opts.sessionId : a)), continuity: "session", warning: null };
  }

  const resume = caps.resume;
  if (!resume?.argv) {
    return {
      argv: [],
      continuity: "none",
      warning: `${caps.name} has no documented way to resume a session, so this turn starts from scratch. The agent will not remember the previous turn — do not treat a second-pass approval as informed.`,
    };
  }

  // A resume flag that takes no id (codex's bare `resume`) cannot select WHICH conversation to
  // continue. Say so rather than emitting a flag that resumes some other session.
  if (!resume.argv.includes("$SESSION")) {
    return {
      argv: [],
      continuity: "none",
      warning: `${caps.name}'s resume form takes no session id, so MJ cannot say which conversation to continue and will not guess. This turn starts from scratch and the prompt restates the context.`,
    };
  }

  return { argv: resume.argv.map((a) => (a === "$SESSION" ? opts.sessionId : a)), continuity: "session", warning: null };
}

/** Does this CLI let MJ choose the session id, or does it assign its own? */
export function sessionIdKind(harness: HarnessId | string): SessionIdKind {
  // V11.6.3: through the resolver — a custom harness never names its own session id.
  const rc = resolveCaps(harness);
  if (rc.custom) return "cli-chosen";
  return rc.caps.sessionStart?.argv ? "mj-chosen" : "cli-chosen";
}

/* ------------------------------------------------------------------ reading the id back */

/**
 * Pull the session id out of a CLI's output.
 *
 * Checked against real output: Claude Code 2.1.197 emits `"session_id":"<uuid>"`, OpenCode 1.18.25
 * emits `"sessionID":"ses_..."` on every NDJSON event. Both confirmed by live runs.
 */
export function parseSessionId(harness: string, raw: string): string | null {
  if (!raw.trim()) return null;
  for (const line of [raw.trim(), ...raw.split(/\r?\n/).map((l) => l.trim())]) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      // Field order matters: OpenCode is camelCase, Claude is snake_case.
      const id = obj.session_id ?? obj.sessionID ?? obj.sessionId ?? obj.session;
      if (typeof id === "string" && id.length > 0) return id;
    } catch {
      /* not JSON; fall through to the pattern match */
    }
  }
  const m = /"session_?[iI][dD]"\s*:\s*"([^"]+)"/.exec(raw);
  if (m?.[1]) return m[1];
  if (harness === "codex") {
    const c = /(?:^|\s)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\s|$)/i.exec(raw);
    if (c?.[1]) return c[1];
  }
  return null;
}

/**
 * Did the CLI say it could not resume?
 *
 * These are documented failure messages, not guesses: resuming from the wrong directory, a corrupt
 * transcript, or a reclaimed cloud environment all have to start fresh rather than retry forever.
 */
export function detectResumeFailure(raw: string): string | null {
  const patterns: Array<[RegExp, string]> = [
    [/Session not found/i, "the session id is not known to this CLI (it may belong to a different directory, or never existed)"],
    [/No conversation found with session ID/i, "the session id is not known in this directory (sessions are scoped to the cwd and its worktrees)"],
    [/Failed to resume the conversation/i, "the CLI found the session but could not load it"],
    [/Could not resume session/i, "the session's environment expired"],
  ];
  for (const [re, why] of patterns) if (re.test(raw)) return why;
  return null;
}

/* ------------------------------------------------------------------ prompts that use continuity */

/**
 * Build a follow-up prompt.
 *
 * With continuity, the agent already has the previous turns, so MJ sends only what is new. Without it,
 * MJ has to restate the context — and must say that it is restating, because an agent that believes it
 * remembers something it does not is worse than one that knows it is starting over.
 */
export function followUpPrompt(opts: {
  continuity: "session" | "continue-latest" | "none";
  harnessName: string;
  previousSummary: string;
  instruction: string;
  evidence?: string[];
}): string {
  const lines: string[] = [];
  if (opts.continuity === "none") {
    lines.push(
      `NOTE: ${opts.harnessName} cannot resume a session, so you have NO memory of the previous turn.`,
      `Everything you need is restated below. Do not assume you have already seen this work.`,
      ``,
      `## What happened so far`,
      opts.previousSummary,
      ``,
    );
  }
  lines.push(`## Do this next`, opts.instruction);
  if (opts.evidence?.length) {
    lines.push(``, `## Evidence you must work from`);
    for (const e of opts.evidence) lines.push(`- ${e}`);
  }
  return lines.join("\n");
}
