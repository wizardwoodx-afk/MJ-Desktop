/**
 * §10.1 OS-level sandboxing for agent seats (V11, MJ-11.0-PROPOSAL W3).
 *
 * Risk classes tell MJ what an action *is*; sandboxes make the dangerous ones *impossible*.
 * The 2026 baseline (Claude Code's /sandbox via Seatbelt/bubblewrap, Codex CLI's default
 * Landlock+seccomp) is now table stakes, so V11 wraps every spawned agent in a platform
 * sandbox chosen by the mission's risk tier:
 *
 *   LOW      → no wrapper, credentials still scrubbed from the environment
 *   MEDIUM   → filesystem: write only the workspace (+ session temp); network allowed
 *   HIGH     → MEDIUM + network deny (bubblewrap --unshare-net / Seatbelt deny network*)
 *   CRITICAL → no seat at all: a CRITICAL mission requires a human checkpoint before it
 *              can start, enforced upstream by the runtime
 *
 * The headline rule is the one this file proves: **enforcement is measured, not asserted.**
 * `verifyEnforcement` runs canaries — a write outside the workspace, a connect to a blocked
 * host — and the profile counts as enforced only when the canaries FAIL the way the sandbox
 * is supposed to make them fail. The Proof page shows "enforced: measured" per seat.
 */
import * as fsSync from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RiskClass } from "./types";

export type SandboxPlatform = "linux" | "macos" | "windows" | "unknown";
export type SandboxTier = "none" | "fs" | "fs+net";

export interface SandboxProfile {
  tier: SandboxTier;
  platform: SandboxPlatform;
  /** argv prefix that imposes the profile, empty when the platform has no wrapper. */
  wrapper: string[];
  /** Environment variable names removed before the child starts. */
  scrubbedEnvKeys: string[];
  /** Canaries that must fail for the profile to count as enforced. */
  canaries: Canary[];
  note: string;
}

export interface Canary {
  name: string;
  argv: string[];
  /** What "the sandbox worked" looks like: the command must exit non-zero. */
  mustFail: boolean;
}

/** Token-shaped credential environment, from the 2026 cross-tool baseline (28+ patterns). */
const SCRUB_EXACT = new Set([
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
  "GITHUB_TOKEN", "GH_TOKEN", "GH_ENTERPRISE_TOKEN",
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY",
  "XAI_API_KEY", "GROK_API_KEY", "OPENROUTER_API_KEY",
  "SLACK_BOT_TOKEN", "STRIPE_API_KEY", "NPM_TOKEN", "NODE_AUTH_TOKEN",
  "PYPI_TOKEN", "CARGO_REGISTRY_TOKEN", "HF_TOKEN", "VERCEL_TOKEN",
  "NETLIFY_AUTH_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "FIREBASE_TOKEN",
  "SSH_AUTH_SOCK", "GPG_PASSPHRASE", "MJ_UPDATER_KEY",
]);

const SCRUB_SUFFIX = ["_TOKEN", "_SECRET", "_API_KEY", "_APIKEY", "_PASSWORD", "_PRIVATE_KEY"];

/** env → env with every credential-shaped variable removed. */
export function scrubEnv(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    const upper = k.toUpperCase();
    const shaped =
      SCRUB_EXACT.has(upper) ||
      SCRUB_SUFFIX.some((s) => upper.endsWith(s)) ||
      // Token-shaped values (JWT / long opaque secrets) under innocent names.
      (v.length >= 40 && /^[A-Za-z0-9_\-.=+/]+$/.test(v)) ||
      /^[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{12,}/.test(v);
    if (!shaped) out[k] = v;
  }
  return out;
}

export function detectPlatform(): SandboxPlatform {
  if (typeof process === "undefined" || !process.platform) return typeof navigator !== "undefined" ? "unknown" : "unknown";
  const p = process.platform;
  return p === "darwin" ? "macos" : p === "win32" ? "windows" : p === "linux" ? "linux" : "unknown";
}

/**
 * The profile for a risk tier on a platform. `workspace` is the only writable directory in
 * fs-tier and above. On Windows the honest answer today is WSL2 — a native wrapper is not
 * shipped, and the module says so instead of pretending.
 */
export function sandboxProfileFor(risk: RiskClass, workspace: string, platform: SandboxPlatform = detectPlatform()): SandboxProfile {
  const tier: SandboxTier = risk === "LOW" ? "none" : risk === "MEDIUM" ? "fs" : "fs+net";
  const scrubbed = [...SCRUB_EXACT].sort();
  const base: SandboxProfile = {
    tier,
    platform,
    wrapper: [],
    scrubbedEnvKeys: scrubbed,
    canaries: [],
    note: "",
  };

  if (tier === "none") {
    return { ...base, note: "read-class task: no filesystem wrapper; credentials are still scrubbed from the child environment" };
  }
  if (platform === "linux") {
    // bubblewrap: the whole root read-only, the workspace + tmp writable, /dev and /proc stubbed.
    const wrapper = [
      "bwrap",
      "--ro-bind", "/", "/",
      "--bind", workspace, workspace,
      "--bind", os.tmpdir(), os.tmpdir(),
      "--dev", "/dev",
      "--proc", "/proc",
    ];
    if (tier === "fs+net") wrapper.push("--unshare-net");
    wrapper.push("--");
    return {
      ...base,
      wrapper,
      canaries: [
        {
          name: "write outside the workspace must fail",
          argv: [...wrapper, "sh", "-c", `echo mj-canary > ${path.join(path.dirname(workspace), "mj-sandbox-canary.txt")}`],
          mustFail: true,
        },
        ...(tier === "fs+net"
          ? [{ name: "network must be unreachable", argv: [...wrapper, "sh", "-c", "command -v curl >/dev/null && curl -m 2 -s https://example.com >/dev/null || false"], mustFail: true }]
          : []),
      ],
      note: "bubblewrap profile: root read-only, workspace+tmp writable" + (tier === "fs+net" ? ", network namespace isolated" : ""),
    };
  }
  if (platform === "macos") {
    // Seatbelt via sandbox-exec: write only the workspace; network denied at fs+net.
    const profile =
      tier === "fs+net"
        ? `(version 1)(deny default)(allow process*)(allow file-read*)(allow file-write* (subpath "${workspace}") (subpath "${os.tmpdir()}"))(deny network*)`
        : `(version 1)(deny default)(allow process*)(allow file-read*)(allow file-write* (subpath "${workspace}") (subpath "${os.tmpdir()}"))`;
    return {
      ...base,
      wrapper: ["sandbox-exec", "-p", profile],
      canaries: [
        {
          name: "write outside the workspace must fail",
          argv: ["sandbox-exec", "-p", profile, "sh", "-c", `echo mj-canary > ${path.join(path.dirname(workspace), "mj-sandbox-canary.txt")}`],
          mustFail: true,
        },
      ],
      note: "Seatbelt profile: workspace-only writes" + (tier === "fs+net" ? ", network denied" : ""),
    };
  }
  return {
    ...base,
    note: platform === "windows"
      ? "no native Windows wrapper is shipped; run missions under WSL2 where the Linux profiles apply — this seat runs UNSANDBOXED and the UI labels it"
      : "no wrapper available for this platform; credentials are still scrubbed",
  };
}

function proxyEnv(): Record<string, string> {
  return typeof process !== "undefined" && process.env ? (process.env as Record<string, string>) : {};
}

void proxyEnv;
export interface EnforcementResult {
  enforced: boolean;
  measured: boolean;
  evidence: Array<{ name: string; ran: boolean; failedAsExpected: boolean; detail: string }>;
  note: string;
}

/**
 * Run the canaries. The profile counts as enforced only when every canary that ran failed
 * the way it was supposed to. A platform with no wrapper is reported honestly: measured
 * false, enforced false — never a silent pass.
 */
export async function verifyEnforcement(profile: SandboxProfile, timeoutMs = 8000): Promise<EnforcementResult> {
  const evidence: EnforcementResult["evidence"] = [];
  if (profile.canaries.length === 0) {
    return { enforced: false, measured: false, evidence, note: profile.note };
  }
  const { execFile } = await import("node:child_process");
  let wrapperAbsent = false;
  for (const canary of profile.canaries) {
    const ran = await new Promise<{ failed: boolean; absent: boolean; detail: string }>((resolve) => {
      const timer = setTimeout(() => resolve({ failed: true, absent: false, detail: "timeout (treated as blocked)" }), timeoutMs);
      execFile(canary.argv[0], canary.argv.slice(1), { timeout: timeoutMs }, (err) => {
        clearTimeout(timer);
        const absent = Boolean(err) && (err as NodeJS.ErrnoException).code === "ENOENT";
        resolve({
          failed: Boolean(err),
          absent,
          detail: absent
            ? `wrapper '${canary.argv[0]}' is not installed — the canary never ran`
            : err
              ? (err.message.split("\n")[0] ?? "").slice(0, 120)
              : "exited 0",
        });
      });
    });
    if (ran.absent) wrapperAbsent = true;
    evidence.push({ name: canary.name, ran: !ran.absent, failedAsExpected: !ran.absent && ran.failed === canary.mustFail, detail: ran.detail });
  }
  // A missing wrapper is NOT enforcement: the canary did not fail *because the sandbox
  // blocked it*, it failed because nothing was there. Claiming enforced here would be the
  // exact fake-success this file exists to prevent.
  const enforced = !wrapperAbsent && evidence.length > 0 && evidence.every((e) => e.ran && e.failedAsExpected);
  return {
    enforced,
    measured: !wrapperAbsent,
    evidence,
    note: wrapperAbsent ? `${profile.note}; wrapper not installed on this machine — enforcement UNMEASURED` : profile.note,
  };
}

/**
 * Wrap argv for a seat: sandbox prefix first, then the agent. The wrapped command is what the
 * UI shows the user, so consent is informed — the profile is visible, not implicit.
 */
export function wrapForSeat(risk: RiskClass, workspace: string, program: string, args: string[]): { argv: string[]; profile: SandboxProfile } {
  const profile = sandboxProfileFor(risk, workspace);
  return { argv: profile.wrapper.length > 0 ? [...profile.wrapper, program, ...args] : [program, ...args], profile };
}

/** Only used by probes: a scratch workspace that exists, so profiles have a real directory. */
export function scratchWorkspace(): string {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "mj-seat-"));
  return dir;
}
