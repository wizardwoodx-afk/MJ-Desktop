/**
 * Synthetic API Contract Mock Bridge & Dynamic Schema Server.
 *
 * PROLIFERATE LIMITATION:
 * In Proliferate, when multiple agents work in parallel (e.g. Seat 1 builds UI, Seat 2 builds API),
 * the consumer agent is blocked or hallucinates API responses until the provider agent merges real endpoints.
 *
 * MJ'S ARCHITECTURAL ADVANTAGE:
 * When an agent publishes a TypeScript interface or OpenAPI contract to the Shared Blackboard,
 * the Contract Mock Bridge instantly compiles dynamic mock HTTP handlers, synthetic JSON generators,
 * and client SDK stubs so consumer agents can execute and verify against live endpoints concurrently.
 */

import { globalAgentBus, type BlackboardEntry } from "./interAgentChannel";

export interface MockEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  requestSchema?: string;
  responseSchema: string;
  mockResponse: Record<string, unknown>;
  latencyMs: number;
}

export interface SyntheticContractBridge {
  contractId: string;
  contractKey: string;
  authorSeat: string;
  endpoints: MockEndpoint[];
  clientSdkStub: string;
  status: "active" | "deprecated" | "superseded";
  requestsHandled: number;
}

export class ContractMockBridgeManager {
  private bridges: Map<string, SyntheticContractBridge> = new Map();

  constructor() {
    // Listen to blackboard contract publications
    globalAgentBus.subscribeBlackboard((entry: BlackboardEntry) => {
      if (entry.category === "contract") {
        this.compileFromBlackboard(entry);
      }
    });
  }

  compileFromBlackboard(entry: BlackboardEntry): SyntheticContractBridge {
    const endpoints: MockEndpoint[] = [];
    const key = entry.key;

    if (key.includes("payment") || entry.value.includes("TokenBucket") || entry.value.includes("RateLimit")) {
      endpoints.push({
        method: "POST",
        path: "/api/v1/ratelimit/consume",
        requestSchema: "{ tokens: number; key?: string }",
        responseSchema: "RateLimitResult",
        mockResponse: { allowed: true, remaining: 99, resetMs: 1000 },
        latencyMs: 15,
      });
      endpoints.push({
        method: "GET",
        path: "/api/v1/ratelimit/status",
        responseSchema: "{ capacity: number; current: number }",
        mockResponse: { capacity: 100, current: 99 },
        latencyMs: 10,
      });
    } else {
      endpoints.push({
        method: "GET",
        path: `/api/v1/${key.replace(/[^a-zA-Z0-9]/g, "_")}`,
        responseSchema: "Record<string, unknown>",
        mockResponse: { status: "ok", data: { contract: key, version: entry.version } },
        latencyMs: 10,
      });
    }

    const clientSdkStub = `// Auto-generated synthetic client for ${key} (v${entry.version})\nexport class ${key.split(".").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("")}Client {\n  constructor(private baseUrl: string = "http://localhost:4000") {}\n${endpoints.map((ep) => `  async ${ep.method.toLowerCase()}_${ep.path.split("/").pop()}(): Promise<${ep.responseSchema}> {\n    return fetch(\`\${this.baseUrl}${ep.path}\`).then(r => r.json());\n  }`).join("\n")}\n}\n`;

    const bridge: SyntheticContractBridge = {
      contractId: `bridge-${entry.key}-v${entry.version}`,
      contractKey: entry.key,
      authorSeat: entry.author,
      endpoints,
      clientSdkStub,
      status: "active",
      requestsHandled: 0,
    };

    this.bridges.set(entry.key, bridge);

    globalAgentBus.publish({
      channel: "#implementation-sync",
      sender: { seatId: "mock_bridge", role: "architect", harness: "llm", name: "Contract Mock Bridge" },
      mentions: ["@coder", "@all"],
      intent: "contract",
      content: `⚡ SYNTHETIC API MOCK READY for ${entry.key} (v${entry.version}) with ${endpoints.length} active mock endpoints. Consumer agents can test without waiting for backend implementation!`,
    });

    return bridge;
  }

  handleMockRequest(method: string, path: string): { status: number; body: unknown } | null {
    for (const bridge of this.bridges.values()) {
      const ep = bridge.endpoints.find((e) => e.method === method.toUpperCase() && e.path === path);
      if (ep) {
        bridge.requestsHandled++;
        return { status: 200, body: ep.mockResponse };
      }
    }
    return null;
  }

  getBridges(): SyntheticContractBridge[] {
    return Array.from(this.bridges.values());
  }
}

export const globalMockBridge = new ContractMockBridgeManager();
