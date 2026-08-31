/**
 * Official MCP catalog — wraps vendored servers, does not reimplement them.
 *
 * vendor/mcp-servers-reference/src/{filesystem,git,memory,sequentialthinking,time}
 * vendor/mcp-github
 *
 * Control MCP is the only MJ-authored server. Mutations are Plan → Apply → Verify.
 * Transport is stdio. No HTTP 127.0.0.1 sidecar.
 */

export type McpTransport = "stdio";

export interface VendoredMcpSpec {
  id: string;
  name: string;
  vendorPath: string;
  kind: "typescript" | "python" | "go" | "mj";
  command: string;
  args: string[];
  description: string;
  pinned: boolean;
  authoredByMj: boolean;
}

export const VENDORED_MCP_SERVERS: VendoredMcpSpec[] = [
  {
    id: "mcp.filesystem",
    name: "Filesystem",
    vendorPath: "vendor/mcp-servers-reference/src/filesystem",
    kind: "typescript",
    command: "npx",
    args: ["-y", "tsx", "vendor/mcp-servers-reference/src/filesystem/index.ts"],
    description: "Official MCP filesystem server (read/write inside the workspace root).",
    pinned: true,
    authoredByMj: false,
  },
  {
    id: "mcp.git",
    name: "Git",
    vendorPath: "vendor/mcp-servers-reference/src/git",
    kind: "python",
    command: "python",
    args: ["-m", "mcp_server_git"],
    description: "Official MCP git server.",
    pinned: true,
    authoredByMj: false,
  },
  {
    id: "mcp.memory",
    name: "Memory",
    vendorPath: "vendor/mcp-servers-reference/src/memory",
    kind: "typescript",
    command: "npx",
    args: ["-y", "tsx", "vendor/mcp-servers-reference/src/memory/index.ts"],
    description: "Official MCP knowledge-graph memory server.",
    pinned: true,
    authoredByMj: false,
  },
  {
    id: "mcp.sequential-thinking",
    name: "Sequential Thinking",
    vendorPath: "vendor/mcp-servers-reference/src/sequentialthinking",
    kind: "typescript",
    command: "npx",
    args: ["-y", "tsx", "vendor/mcp-servers-reference/src/sequentialthinking/index.ts"],
    description: "Official MCP sequential-thinking server.",
    pinned: true,
    authoredByMj: false,
  },
  {
    id: "mcp.time",
    name: "Time",
    vendorPath: "vendor/mcp-servers-reference/src/time",
    kind: "python",
    command: "python",
    args: ["-m", "mcp_server_time"],
    description: "Official MCP time server.",
    pinned: true,
    authoredByMj: false,
  },
  {
    id: "mcp.github",
    name: "GitHub",
    vendorPath: "vendor/mcp-github",
    kind: "go",
    command: "github-mcp-server",
    args: ["stdio"],
    description: "Official GitHub MCP server (stdio).",
    pinned: true,
    authoredByMj: false,
  },
  {
    id: "mcp.control",
    name: "Control MCP",
    vendorPath: "src-tauri/src/control_mcp.rs",
    kind: "mj",
    command: "mj-control-mcp",
    args: ["stdio"],
    description: "MJ-authored Control MCP. Graph mutations are Plan → Apply → Verify. Stdio only.",
    pinned: true,
    authoredByMj: true,
  },
];

export interface ControlPlan {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  preview: string;
}

export interface ControlVerify {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export const CONTROL_MCP_TOOLS = [
  "validate_graph",
  "connect_ports",
  "disconnect_ports",
  "run_workflow",
  "pause_execution",
  "resume_execution",
  "cancel_execution",
  "list_nodes",
] as const;

export function planControlMutation(tool: string, args: Record<string, unknown>): ControlPlan {
  return {
    id: `plan-${Date.now()}`,
    tool,
    args,
    preview: `${tool} ${JSON.stringify(args)}`,
  };
}
