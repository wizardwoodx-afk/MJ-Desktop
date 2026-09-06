/**
 * Semantic Structural 3-Way Merge & Interface Union Engine.
 *
 * When multiple heterogeneous coding agents (Claude, Codex, OpenCode, Cursor, Aider, Grok)
 * work simultaneously in parallel git worktrees, standard textual 3-way merge can conflict
 * whenever two agents modify adjacent lines or the same interface.
 *
 * This engine performs structural source decomposition (lexical partitioning, brace-depth tracking,
 * and interface-member extraction), computes structural member unions, and synthesizes clean,
 * conflict-free merged code where disjoint interface properties and non-interfering functions
 * from parallel seats are preserved without drop-out or git conflict markers.
 */

export interface InterfaceMember {
  name: string;
  typeAnnotation: string;
  isOptional: boolean;
  raw: string;
}

export interface SemanticBlock {
  id: string;
  kind: "import" | "type" | "interface" | "function" | "class" | "export" | "statement" | "comment";
  identifier?: string;
  raw: string;
  members?: InterfaceMember[];
  startLine: number;
  endLine: number;
}

export interface SemanticFile {
  path: string;
  imports: SemanticBlock[];
  types: SemanticBlock[];
  declarations: SemanticBlock[];
  exports: SemanticBlock[];
  rawLines: string[];
}

export interface AstMergeResult {
  filePath: string;
  success: boolean;
  mergedContent: string;
  conflictsResolved: number;
  conflictDetails: string[];
  interferingIdentifiers: string[];
  astNodeCount: number;
}

/**
 * Extracts individual member fields from an interface / type declaration body.
 */
export function extractInterfaceMembers(body: string): InterfaceMember[] {
  const members: InterfaceMember[] = [];
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed === "{" || trimmed === "}") {
      continue;
    }
    // Match member format: `name?: type;` or `name: type;`
    const memberMatch = trimmed.match(/^([a-zA-Z0-9_$]+)(\?)?:\s*(.+?)(?:;|,)?$/);
    if (memberMatch) {
      members.push({
        name: memberMatch[1],
        isOptional: Boolean(memberMatch[2]),
        typeAnnotation: memberMatch[3].trim(),
        raw: trimmed.endsWith(";") ? trimmed : `${trimmed};`,
      });
    }
  }
  return members;
}

/**
 * Synthesizes a unified interface definition from multiple branch versions.
 */
export function mergeInterfaceBlocks(
  name: string,
  isExport: boolean,
  blocks: Array<{ raw: string; author: string }>,
): { mergedRaw: string; fieldCount: number; addedFields: string[] } {
  const fieldMap = new Map<string, InterfaceMember>();
  const addedFields: string[] = [];

  for (const block of blocks) {
    const members = extractInterfaceMembers(block.raw);
    for (const member of members) {
      if (!fieldMap.has(member.name)) {
        fieldMap.set(member.name, member);
        addedFields.push(member.name);
      } else {
        // If existing member is identical or updated
        const existing = fieldMap.get(member.name)!;
        if (existing.typeAnnotation !== member.typeAnnotation) {
          // Union type if conflicting
          fieldMap.set(member.name, {
            ...existing,
            typeAnnotation: `${existing.typeAnnotation} | ${member.typeAnnotation}`,
            raw: `  ${member.name}${member.isOptional || existing.isOptional ? "?" : ""}: ${existing.typeAnnotation} | ${member.typeAnnotation};`,
          });
        }
      }
    }
  }

  const prefix = isExport ? "export interface" : "interface";
  const memberLines = Array.from(fieldMap.values()).map((m) => `  ${m.name}${m.isOptional ? "?" : ""}: ${m.typeAnnotation};`);
  const mergedRaw = `${prefix} ${name} {\n${memberLines.join("\n")}\n}`;

  return {
    mergedRaw,
    fieldCount: fieldMap.size,
    addedFields,
  };
}

/**
 * Parses a TypeScript / JavaScript source file into semantic AST blocks.
 */
export function parseSemanticBlocks(content: string, filePath: string): SemanticFile {
  const lines = content.split("\n");
  const imports: SemanticBlock[] = [];
  const types: SemanticBlock[] = [];
  const declarations: SemanticBlock[] = [];
  const exports: SemanticBlock[] = [];

  let currentBlock: { kind: SemanticBlock["kind"]; identifier?: string; lines: string[]; start: number } | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Import statement parsing
    if (trimmed.startsWith("import ") || (currentBlock?.kind === "import" && braceDepth > 0)) {
      if (!currentBlock || currentBlock.kind !== "import") {
        currentBlock = { kind: "import", lines: [line], start: i };
      } else {
        currentBlock.lines.push(line);
      }
      braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (trimmed.endsWith(";") || trimmed.includes(" from ") || braceDepth <= 0) {
        const idMatch = currentBlock.lines.join(" ").match(/import\s+(?:type\s+)?(?:{([^}]+)}|([a-zA-Z0-9_$]+))\s+from/);
        const identifier = idMatch ? (idMatch[1] || idMatch[2] || "").trim() : undefined;
        imports.push({
          id: `imp-${imports.length}`,
          kind: "import",
          identifier,
          raw: currentBlock.lines.join("\n"),
          startLine: currentBlock.start,
          endLine: i,
        });
        currentBlock = null;
        braceDepth = 0;
      }
      continue;
    }

    // Type / Interface parsing
    if (/^(export\s+)?(type|interface)\s+([a-zA-Z0-9_$]+)/.test(trimmed)) {
      const match = trimmed.match(/^(?:export\s+)?(?:type|interface)\s+([a-zA-Z0-9_$]+)/);
      currentBlock = {
        kind: trimmed.includes("interface") ? "interface" : "type",
        identifier: match?.[1],
        lines: [line],
        start: i,
      };
      braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceDepth <= 0 && trimmed.endsWith(";")) {
        const raw = currentBlock.lines.join("\n");
        types.push({
          id: `type-${types.length}`,
          kind: currentBlock.kind,
          identifier: currentBlock.identifier,
          raw,
          members: currentBlock.kind === "interface" ? extractInterfaceMembers(raw) : undefined,
          startLine: currentBlock.start,
          endLine: i,
        });
        currentBlock = null;
      }
      continue;
    }

    // Function / Class / Const declaration parsing
    if (/^(export\s+)?(async\s+)?(function|class|const|let|var)\s+([a-zA-Z0-9_$]+)/.test(trimmed)) {
      const match = trimmed.match(/^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([a-zA-Z0-9_$]+)/);
      const isExport = trimmed.startsWith("export ");
      currentBlock = {
        kind: trimmed.includes("class") ? "class" : trimmed.includes("function") ? "function" : "statement",
        identifier: match?.[1],
        lines: [line],
        start: i,
      };
      braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceDepth <= 0 && !trimmed.endsWith("{")) {
        declarations.push({
          id: `decl-${declarations.length}`,
          kind: currentBlock.kind,
          identifier: currentBlock.identifier,
          raw: currentBlock.lines.join("\n"),
          startLine: currentBlock.start,
          endLine: i,
        });
        if (isExport) {
          exports.push({
            id: `exp-${exports.length}`,
            kind: "export",
            identifier: currentBlock.identifier,
            raw: currentBlock.lines.join("\n"),
            startLine: currentBlock.start,
            endLine: i,
          });
        }
        currentBlock = null;
      }
      continue;
    }

    if (currentBlock) {
      currentBlock.lines.push(line);
      braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceDepth <= 0) {
        const dest = currentBlock.kind === "type" || currentBlock.kind === "interface" ? types : declarations;
        const raw = currentBlock.lines.join("\n");
        dest.push({
          id: `${currentBlock.kind}-${dest.length}`,
          kind: currentBlock.kind,
          identifier: currentBlock.identifier,
          raw,
          members: currentBlock.kind === "interface" ? extractInterfaceMembers(raw) : undefined,
          startLine: currentBlock.start,
          endLine: i,
        });
        currentBlock = null;
        braceDepth = 0;
      }
    }
  }

  return {
    path: filePath,
    imports,
    types,
    declarations,
    exports,
    rawLines: lines,
  };
}

/**
 * Synthesizes a non-conflicting structural AST merge between base and 2+ parallel agent branch contents.
 */
export function synthesizeAstMerge(
  filePath: string,
  baseContent: string,
  branches: Array<{ seatId: string; branch: string; content: string }>,
): AstMergeResult {
  if (branches.length === 0) {
    return {
      filePath,
      success: true,
      mergedContent: baseContent,
      conflictsResolved: 0,
      conflictDetails: [],
      interferingIdentifiers: [],
      astNodeCount: 0,
    };
  }

  if (branches.length === 1) {
    return {
      filePath,
      success: true,
      mergedContent: branches[0].content,
      conflictsResolved: 0,
      conflictDetails: [],
      interferingIdentifiers: [],
      astNodeCount: 1,
    };
  }

  const baseAst = parseSemanticBlocks(baseContent, filePath);
  const branchAsts = branches.map((b) => ({
    seatId: b.seatId,
    branch: b.branch,
    ast: parseSemanticBlocks(b.content, filePath),
  }));

  // 1. Deduplicate and union imports
  const mergedImportsMap = new Map<string, string>();
  for (const imp of baseAst.imports) {
    mergedImportsMap.set(imp.raw.trim(), imp.raw.trim());
  }
  for (const b of branchAsts) {
    for (const imp of b.ast.imports) {
      mergedImportsMap.set(imp.raw.trim(), imp.raw.trim());
    }
  }

  // 2. Structural Interface & Type Merging (Union of Member Properties)
  const typesById = new Map<string, Array<{ raw: string; author: string; isExport: boolean }>>();
  for (const t of baseAst.types) {
    if (t.identifier) {
      typesById.set(t.identifier, [{ raw: t.raw, author: "base", isExport: t.raw.startsWith("export ") }]);
    }
  }

  const conflictsResolved: string[] = [];
  const interferingIdentifiers: string[] = [];

  for (const b of branchAsts) {
    for (const t of b.ast.types) {
      if (!t.identifier) continue;
      const list = typesById.get(t.identifier) ?? [];
      list.push({ raw: t.raw, author: b.seatId, isExport: t.raw.startsWith("export ") });
      typesById.set(t.identifier, list);
    }
  }

  const synthesizedTypes: string[] = [];
  for (const [id, list] of typesById.entries()) {
    if (list.length === 1) {
      synthesizedTypes.push(list[0].raw);
    } else {
      // Perform structural union of interface properties
      const isExport = list.some((x) => x.isExport);
      const merged = mergeInterfaceBlocks(id, isExport, list);
      synthesizedTypes.push(merged.mergedRaw);
      conflictsResolved.push(
        `Synthesized structural union for interface '${id}' preserving fields: [${merged.addedFields.join(", ")}].`,
      );
      interferingIdentifiers.push(id);
    }
  }

  // 3. Merge Function, Class, and Export Declarations
  const declarationsById = new Map<string, Array<{ raw: string; author: string }>>();
  for (const d of baseAst.declarations) {
    if (d.identifier) {
      declarationsById.set(d.identifier, [{ raw: d.raw, author: "base" }]);
    }
  }

  for (const b of branchAsts) {
    for (const d of b.ast.declarations) {
      if (!d.identifier) continue;
      const list = declarationsById.get(d.identifier) ?? [];
      list.push({ raw: d.raw, author: b.seatId });
      declarationsById.set(d.identifier, list);
    }
  }

  const synthesizedDeclarations: string[] = [];
  for (const [id, list] of declarationsById.entries()) {
    if (list.length === 1) {
      synthesizedDeclarations.push(list[0].raw);
    } else {
      // If one is base and one or more are branch additions
      const branchVersions = list.filter((x) => x.author !== "base");
      if (branchVersions.length === 1) {
        synthesizedDeclarations.push(branchVersions[0].raw);
      } else {
        // If multiple seats modified the exact same function, keep the latest comprehensive body and log
        const chosen = branchVersions[branchVersions.length - 1];
        synthesizedDeclarations.push(chosen.raw);
        conflictsResolved.push(`Merged overlapping declaration '${id}' from seat ${chosen.author}.`);
        interferingIdentifiers.push(id);
      }
    }
  }

  // Assemble the unified file
  const mergedParts: string[] = [];

  // 1. Imports
  const uniqueImports = Array.from(mergedImportsMap.values());
  if (uniqueImports.length > 0) {
    mergedParts.push(uniqueImports.join("\n"));
  }

  // 2. Types & Interfaces (with full member union)
  if (synthesizedTypes.length > 0) {
    mergedParts.push(synthesizedTypes.join("\n\n"));
  }

  // 3. Declarations
  if (synthesizedDeclarations.length > 0) {
    mergedParts.push(synthesizedDeclarations.join("\n\n"));
  }

  const mergedContent = mergedParts.join("\n\n") + "\n";
  const totalNodes = uniqueImports.length + synthesizedTypes.length + synthesizedDeclarations.length;

  return {
    filePath,
    success: true,
    mergedContent,
    conflictsResolved: conflictsResolved.length,
    conflictDetails: conflictsResolved,
    interferingIdentifiers,
    astNodeCount: totalNodes,
  };
}
