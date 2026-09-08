const BLOCKED = new Set([
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
  "export",
]);

const WHITELIST_CALLS = new Set(["String", "Number", "Boolean", "Math", "Array", "Object", "JSON"]);

export function safeEvaluate(expr: string, input: unknown): unknown {
  const src = expr.trim();
  if (!src) throw new Error("empty expression");
  if (src.length > 600) throw new Error("expression too long");
  if (/[;`\\]/.test(src)) throw new Error("illegal character");

  const tokens = src.match(/[A-Za-z_][A-Za-z0-9_]*|["'][^"']*["']|[0-9]+(?:\.[0-9]+)?|[=!<>]=?|&&|\|\||[()[\].,+\-*/%?:]|true|false|null/g);
  if (!tokens || tokens.join("") !== src.replace(/\s+/g, "")) {
    throw new Error("malformed expression");
  }

  for (const t of tokens) {
    if (/^[A-Za-z_]/.test(t) && !["input", "true", "false", "null", "undefined"].includes(t) && !WHITELIST_CALLS.has(t)) {
      if (BLOCKED.has(t)) throw new Error(`blocked identifier: ${t}`);
    }
    if (BLOCKED.has(t)) throw new Error(`blocked identifier: ${t}`);
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
    `"use strict"; return (${src});`,
  );
  return fn(input, String, Number, Boolean, Math, Array, Object, JSON);
}
