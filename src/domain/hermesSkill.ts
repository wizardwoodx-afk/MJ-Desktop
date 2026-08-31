/**
 * Hermes Agent skill contract — wraps the vendored SKILL.md schema.
 *
 * Source of truth:
 *   vendor/hermes-agent/agent/skill_utils.py  (parse_frontmatter, platforms, environments)
 *   vendor/hermes-agent-self-evolution/evolution/skills/skill_module.py  (load_skill, reassemble_skill)
 *
 * A skill is a folder containing SKILL.md with YAML frontmatter:
 *   ---
 *   name: apple-notes
 *   description: "…"
 *   version: 1.0.1
 *   platforms: [macos]
 *   metadata:
 *     hermes:
 *       tags: […]
 *   ---
 *   # Body (procedure markdown)
 *
 * Bundled skills under vendor/hermes-agent/skills are READ-ONLY.
 * Curator / evolution never writes them. User and learned skills live
 * in the MJ skill store (native: {appData}/skills, preview: localDb).
 */

export type SkillOrigin = "bundled" | "user" | "learned" | "evolution";

export interface HermesFrontmatter {
  name: string;
  description: string;
  version?: string;
  author?: string;
  license?: string;
  platforms?: string[];
  environments?: string[];
  metadata?: {
    hermes?: {
      tags?: string[];
      related_skills?: string[];
      fallback_for_toolsets?: string[];
      requires_toolsets?: string[];
      fallback_for_tools?: string[];
      requires_tools?: string[];
      config?: Array<{ key: string; description: string; default?: unknown; prompt?: string }>;
    };
  };
  prerequisites?: Record<string, unknown>;
}

export interface HermesSkill {
  path?: string;
  raw: string;
  frontmatter: HermesFrontmatter;
  body: string;
  origin: SkillOrigin;
  bundled: boolean;
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  let src = content;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  if (!src.startsWith("---")) return { frontmatter: {}, body: src };
  const m = FRONTMATTER_RE.exec(src);
  if (!m) return { frontmatter: {}, body: src };
  return { frontmatter: parseSimpleYaml(m[1]), body: src.slice(m[0].length) };
}

/** Minimal YAML subset used by SKILL.md frontmatter (mirrors skill_utils fallback). */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [{ indent: -1, obj: root }];
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
      const child: Record<string, unknown> = {};
      cur[key] = child;
      stack.push({ indent, obj: child });
      continue;
    }
    if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      try {
        cur[key] = JSON.parse(value.replace(/'/g, "\""));
        continue;
      } catch {
        /* fall through */
      }
    }
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    cur[key] = value;
  }
  return root;
}

export function loadSkill(raw: string, origin: SkillOrigin = "user", path?: string): HermesSkill {
  const { frontmatter, body } = parseFrontmatter(raw);
  const name = String(frontmatter.name ?? (path ? path.split(/[\\/]/).slice(-2, -1)[0] : "unnamed"));
  const description = String(frontmatter.description ?? "");
  return {
    path,
    raw,
    frontmatter: { ...frontmatter, name, description } as HermesFrontmatter,
    body: body.trim(),
    origin,
    bundled: origin === "bundled",
  };
}

export function reassembleSkill(frontmatter: HermesFrontmatter, body: string): string {
  const yaml: string[] = [];
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
  return `---\n${yaml.join("\n")}\n---\n\n${body.trim()}\n`;
}

export function skillHasValidStructure(text: string): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const stripped = text.replace(/^\uFEFF/, "").trim();
  if (!stripped.startsWith("---")) missing.push("YAML frontmatter (---)");
  const head = stripped.slice(0, 500);
  if (!/name\s*:/.test(head)) missing.push("name field");
  if (!/description\s*:/.test(head)) missing.push("description field");
  return { ok: missing.length === 0, missing };
}

export const HERMES_PLUGIN_HOOKS = [
  "on_session_start",
  "pre_llm_call",
  "post_llm_call",
  "on_session_end",
] as const;

export type HermesPluginHook = (typeof HERMES_PLUGIN_HOOKS)[number];

export interface HookContext {
  hook: HermesPluginHook;
  nodeKey?: string;
  executionId?: string;
  payload?: Record<string, unknown>;
}

export function runPluginHook(ctx: HookContext): Record<string, unknown> {
  return {
    hook: ctx.hook,
    applied: true,
    vendor: "hermes-agent",
    at: new Date().toISOString(),
    nodeKey: ctx.nodeKey ?? null,
    executionId: ctx.executionId ?? null,
  };
}

export const BUNDLED_SKILLS_ROOT = "vendor/hermes-agent/skills";
export const ESSENTIAL_SKILLS = new Set(["hermes-agent"]);
