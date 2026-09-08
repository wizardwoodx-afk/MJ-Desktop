import { uid } from "../app/id";
import type { ExecutionStats, NodeInstance, WorkflowGraph } from "../domain/types";

import { ipc, nodeKeyOf } from "../ipc/client";
import { setNodeRuntimeOutput, useGraphStore } from "../graph/store";
import { topoSort } from "../graph/validation";
import { safeEvaluate } from "./expression";
import { notifyNative } from "../app/desktop";
import { composeNodePrompt } from "../domain/composer";
import { reassembleSkill, runPluginHook } from "../domain/hermesSkill";
import { gateCandidate } from "../domain/evolutionEngine";
import { harnessOf } from "./harnessRunner";
import { runHermesNode } from "./hermesRuntime";
import { runControlNode } from "./controlRuntime";

type Control = "pause" | "resume" | "cancel";

const controllers = new Map<string, { paused: boolean; cancelled: boolean }>();

export function controlExecution(execId: string, action: Control) {
  const c = controllers.get(execId);
  if (!c) return;
  if (action === "pause") c.paused = true;
  if (action === "resume") c.paused = false;
  if (action === "cancel") c.cancelled = true;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitWhilePaused(ctl: { paused: boolean; cancelled: boolean }) {
  while (ctl.paused && !ctl.cancelled) await sleep(80);
}

async function runAgent(node: NodeInstance, collected: Record<string, unknown>, execId: string, workflowId: string, stats: ExecutionStats): Promise<{ text: string; tokensIn: number; tokensOut: number; cost: number; via: string }> {
  const nodeKey = nodeKeyOf(workflowId, node.id);
  runPluginHook({ hook: "on_session_start", nodeKey, executionId: execId });
  const skills = (await ipc.skillsList(nodeKey)).skills;
  const memories = node.memoryEnabled ? await ipc.memorySearch(nodeKey, node.purpose || node.title, 8) : [];
  const composed = composeNodePrompt(node, collected, skills, memories);
  runPluginHook({ hook: "pre_llm_call", nodeKey, executionId: execId, payload: { chars: composed.system.length } });

  const hid = harnessOf(node);
  let text = "";
  let tokensIn = Math.round((composed.system.length + composed.user.length) / 4);
  let tokensOut = 0;
  let cost = 0;
  let via: string = hid;

  const ran = await runHermesNode(node, collected, composed, execId, workflowId);
  text = ran.text;
  via = ran.via;
  tokensOut = Math.round(text.length / 4);

  runPluginHook({ hook: "post_llm_call", nodeKey, executionId: execId, payload: { via } });

  if (node.feedbackLoop === "ON") {
    const md = reassembleSkill(
      { name: slug(node.title), description: node.purpose || node.title, version: "1.0.0", author: "MJ", metadata: { hermes: { tags: [node.definitionId] } } },
      `# ${node.title}\n\n${node.rolePrompt.sections.procedures}\n\n## Last run\n\n${text.slice(0, 800)}`,
    );
    await ipc.skillUpsert({
      nodeKey,
      name: slug(node.title),
      description: node.purpose || node.title,
      procedure: md,
      origin: "learned",
    });
  }

  if (node.evolutionMode !== "OFF") {
    await runEvolutionGate(node, nodeKey, execId, text, via, stats);
  }

  runPluginHook({ hook: "on_session_end", nodeKey, executionId: execId });
  return { text, tokensIn, tokensOut, cost, via };
}

const LEARNED_CORRECTION = "- Prefer explicit done-when checks after every tool call.";

/**
 * V6 fix. V5 scored the baseline and the candidate from the *same* string
 * (`text.slice(0, 400)` on both sides) while the gate requires
 * `candidate.composite > baseline.composite` — so a candidate could never be accepted and
 * AUTONOMOUS was a silent no-op.
 *
 * Now:
 *   - SUGGEST   proposes with the candidate explicitly marked UNMEASURED. No fabricated score.
 *   - AUTONOMOUS pays for one bounded re-run of the node with the candidate procedures and
 *     gates on two independently measured outputs. If the re-run cannot be measured, the
 *     candidate stays PROPOSED — it is never auto-accepted on unmeasured evidence.
 */
async function runEvolutionGate(
  node: NodeInstance,
  nodeKey: string,
  execId: string,
  baselineOutput: string,
  via: string,
  stats: ExecutionStats,
): Promise<void> {
  const name = slug(node.title);
  const frontmatter = { name, description: node.purpose || node.title };
  const baseline = reassembleSkill(frontmatter, node.rolePrompt.sections.procedures);
  const candidate = reassembleSkill(
    frontmatter,
    `${node.rolePrompt.sections.procedures}\n\n## Learned corrections\n\n${LEARNED_CORRECTION}\n`,
  );
  const expectedBehavior = node.contract.successCriteria;

  let candidateOutput: string | null = null;
  let measured = false;
  if (node.evolutionMode === "AUTONOMOUS" && node.config.measureCandidates !== false) {
    const probe: NodeInstance = {
      ...node,
      evolutionMode: "OFF",
      feedbackLoop: "OFF",
      rolePrompt: {
        ...node.rolePrompt,
        sections: {
          ...node.rolePrompt.sections,
          procedures: `${node.rolePrompt.sections.procedures}\n\n## Learned corrections\n\n${LEARNED_CORRECTION}\n`,
        },
      },
    };
    const composed = composeNodePrompt(probe, { purpose: node.purpose }, [], []);
    try {
      const rerun = await runHermesNode(probe, { purpose: node.purpose }, composed, execId, execId);
      candidateOutput = rerun.text;
      measured = true;
      stats.inputTokens += Math.round((composed.system.length + composed.user.length) / 4);
      stats.outputTokens += Math.round(rerun.text.length / 4);
    } catch (e) {
      await ipc.eventEmit(execId, "EVOLUTION_UNMEASURED", "WARN", node.id, {
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const gate = gateCandidate({
    baselineText: baseline,
    candidateText: candidate,
    taskInput: node.purpose,
    expectedBehavior,
    baselineOutput: baselineOutput.slice(0, 400),
    candidateOutput: (candidateOutput ?? baselineOutput).slice(0, 400),
    bundled: false,
  });

  const saved = await ipc.evolutionProposeSave({
    nodeKey,
    parentVersion: node.rolePrompt.version,
    candidateVersion: node.rolePrompt.version + 1,
    trigger: "post-run",
    evidence: [via, measured ? "candidate re-run measured" : "candidate UNMEASURED"],
    changes: { skill: { procedure: LEARNED_CORRECTION } },
    baselineScore: gate.baseline.composite,
    candidateScore: measured ? gate.candidate.composite : null,
    holdoutPassed: measured ? gate.holdoutPassed : null,
    regressionPassed: measured ? gate.regressionPassed : null,
  }) as { id?: string };

  await ipc.eventEmit(execId, "EVOLUTION_PROPOSED", "EVOLUTION", node.id, {
    candidateId: saved?.id ?? null,
    measured,
    accepted: measured && gate.accepted,
    baseline: gate.baseline.composite,
    candidate: measured ? gate.candidate.composite : null,
    reason: measured ? gate.reason : "Unmeasured: SUGGEST mode records the proposal only.",
  });

  if (node.evolutionMode === "AUTONOMOUS" && measured && gate.accepted && saved?.id) {
    await ipc.evolutionDecide(saved.id, "ACCEPTED");
  }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom";
}

export async function runWorkflow(graph: WorkflowGraph): Promise<string> {
  const store = useGraphStore.getState();
  const created = await ipc.executionCreate(store.workflowId || graph.id, 1);
  const execId = created.id;
  controllers.set(execId, { paused: false, cancelled: false });
  const ctl = controllers.get(execId)!;

  const stats: ExecutionStats = {
    nodesRun: 0,
    nodesFailed: 0,
    retries: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    costUsd: 0,
    evaluationScores: [],
  };
  const t0 = Date.now();

  const emit = (kind: string, level: string, nodeId: string | null, data: Record<string, unknown>) =>
    ipc.eventEmit(execId, kind, level, nodeId, data);

  await emit("WORKFLOW_STARTED", "INFO", null, { nodes: graph.nodes.length });

  const outputs = new Map<string, Record<string, unknown>>();
  let order: string[] = [];
  try {
    order = topoSort(graph.nodes, graph.connections);
  } catch (e) {
    await emit("WORKFLOW_FAILED", "ERROR", null, { error: String(e) });
    await ipc.executionFinish(execId, "FAILED", String(e), { ...stats });
    return execId;
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const skip = new Set<string>();

  for (const id of order) {
    if (ctl.cancelled) {
      await emit("WORKFLOW_CANCELLED", "WARN", null, {});
      stats.durationMs = Date.now() - t0;
      await ipc.executionFinish(execId, "CANCELLED", "cancelled", { ...stats });
      return execId;
    }
    await waitWhilePaused(ctl);

    const node = byId.get(id)!;
    const incoming = graph.connections.filter((c) => c.targetNodeId === id);

    // V6 fix: `skip` used to be filled by control.condition / control.switch and never read,
    // so both branches of a condition executed. A node is bypassed only when it was targeted
    // by a not-taken branch AND no live edge still feeds it.
    if (skip.has(id)) {
      const liveIn = incoming.filter((c) => !skip.has(c.sourceNodeId));
      if (liveIn.length === 0) {
        incoming.forEach((c) => store.setConnectionStatus(c.id, "idle"));
        store.setNodeStatus(id, "blocked");
        await emit("NODE_SKIPPED", "INFO", id, { title: node.title, reason: "branch-not-taken" });
        continue;
      }
      skip.delete(id);
    }

    const collected: Record<string, unknown> = {};
    for (const c of incoming) {
      const src = outputs.get(c.sourceNodeId);
      collected[c.targetPortId] = src?.[c.sourcePortId] ?? src?.["*"];
      store.setConnectionStatus(c.id, "active");
    }

    store.setNodeStatus(id, "queued");
    await emit("NODE_QUEUED", "INFO", id, { title: node.title });
    store.setNodeStatus(id, "running");
    await emit("NODE_STARTED", "INFO", id, { definitionId: node.definitionId });

    if (node.definitionId === "control.approval") {
      store.setNodeStatus(id, "waiting");
      await emit("NODE_WAITING", "INFO", id, { reason: "human-approval" });
      await ipc.approvalRequest(execId, `${store.workflowId}:${id}`, `Approve output of ${node.title}`, collected);
      let decided = false;
      for (let i = 0; i < 600 && !ctl.cancelled; i++) {
        const st = (await ipc.approvalGet(execId, `${store.workflowId}:${id}`)) as { decided?: boolean; status?: string };
        if (st.decided) {
          decided = st.status === "APPROVED";
          break;
        }
        await sleep(500);
      }
      if (!decided) {
        store.setNodeStatus(id, "failed");
        stats.nodesFailed += 1;
        await emit("NODE_FAILED", "ERROR", id, { error: "rejected or timed out" });
        continue;
      }
    }

    if (node.definitionId === "control.wait") {
      const ms = Number(node.config.ms ?? 400);
      await sleep(Math.min(ms, 4000));
    }

    if (node.definitionId === "cap.transform") {
      try {
        const val = safeEvaluate(String(node.config.expression || "input"), collected.input ?? collected);
        outputs.set(id, { output: val, "*": val });
        setNodeRuntimeOutput(id, typeof val === "string" ? val : JSON.stringify(val, null, 2));
        store.setNodeStatus(id, "succeeded");
        stats.nodesRun += 1;
        await emit("NODE_SUCCEEDED", "INFO", id, { transform: true });
        incoming.forEach((c) => store.setConnectionStatus(c.id, "completed"));
        continue;
      } catch (e) {
        store.setNodeStatus(id, "failed");
        stats.nodesFailed += 1;
        await emit("NODE_FAILED", "ERROR", id, { error: String(e) });
        continue;
      }
    }

    if (node.definitionId.startsWith("control.")) {
      const outgoing = graph.connections.filter((c) => c.sourceNodeId === id);
      const r = runControlNode(node, collected, outgoing);
      (r.skipTargets ?? []).forEach((t) => skip.add(t));
      outputs.set(id, r.ports);
      setNodeRuntimeOutput(id, JSON.stringify(r.ports["*"] ?? r.ports, null, 2).slice(0, 4000));
      store.setNodeStatus(id, "succeeded");
      stats.nodesRun += 1;
      await emit("NODE_SUCCEEDED", "INFO", id, { control: node.definitionId, skipped: r.skipTargets ?? [] });
      incoming.forEach((c) => store.setConnectionStatus(c.id, "completed"));
      continue;
    }

    if (node.definitionId.startsWith("cap.") && node.definitionId !== "cap.transform") {
      try {
        const capOut = await runCapability(node, collected);
        outputs.set(id, capOut);
        setNodeRuntimeOutput(id, JSON.stringify(capOut["*"] ?? capOut, null, 2).slice(0, 4000));
        store.setNodeStatus(id, "succeeded");
        stats.nodesRun += 1;
        await emit("NODE_SUCCEEDED", "INFO", id, { capability: node.definitionId });
        incoming.forEach((c) => store.setConnectionStatus(c.id, "completed"));
      } catch (e) {
        store.setNodeStatus(id, "failed");
        stats.nodesFailed += 1;
        await emit("NODE_FAILED", "ERROR", id, { error: String(e) });
      }
      continue;
    }

    if (!node.definitionId.startsWith("agent.")) {
      const text = JSON.stringify(Object.keys(collected).length ? collected : { passthrough: node.title }, null, 2);
      const outPorts = Object.fromEntries(node.outputs.map((p) => [p.id, collected[p.id] ?? text]));
      outPorts["*"] = text;
      outputs.set(id, outPorts);
      setNodeRuntimeOutput(id, text);
      store.setNodeStatus(id, "succeeded");
      stats.nodesRun += 1;
      await emit("NODE_SUCCEEDED", "INFO", id, { passthrough: true, kind: node.definitionId });
      incoming.forEach((c) => store.setConnectionStatus(c.id, "completed"));
      continue;
    }

    store.setNodeStatus(id, "streaming");
    await emit("NODE_STREAMING", "INFO", id, { harness: harnessOf(node) });

    try {
      const result = await runAgent(node, collected, execId, store.workflowId || graph.id, stats);
      const chunks = result.text.split(/(?<=\n)/);
      let acc = "";
      for (const ch of chunks) {
        if (ctl.cancelled) break;
        await waitWhilePaused(ctl);
        acc += ch;
        setNodeRuntimeOutput(id, acc);
        await sleep(12);
      }
      const outPorts = Object.fromEntries(node.outputs.map((p) => [p.id, result.text]));
      outPorts["*"] = result.text;
      outputs.set(id, outPorts);
      stats.nodesRun += 1;
      stats.inputTokens += result.tokensIn;
      stats.outputTokens += result.tokensOut;
      stats.costUsd += result.cost;
      store.setNodeStatus(id, "succeeded");
      await emit("NODE_SUCCEEDED", "INFO", id, { tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd: result.cost, via: result.via });
      incoming.forEach((c) => store.setConnectionStatus(c.id, "completed"));
    } catch (e) {
      store.setNodeStatus(id, "failed");
      stats.nodesFailed += 1;
      await emit("NODE_FAILED", "ERROR", id, { error: String(e) });
      await ipc.dlqAdd(execId, nodeKeyOf(store.workflowId, id), String(e), collected, "node-exception", "Retry with a provider key or simpler purpose.");
    }
  }

  stats.durationMs = Date.now() - t0;
  const status = ctl.cancelled ? "CANCELLED" : stats.nodesFailed > 0 ? "FAILED" : "COMPLETED";
  await emit(status === "COMPLETED" ? "WORKFLOW_COMPLETED" : status === "FAILED" ? "WORKFLOW_FAILED" : "WORKFLOW_CANCELLED", "INFO", null, {
    ...stats,
  });
  await ipc.executionFinish(execId, status, null, { ...stats });
  notifyNative("MJ", `${graph.name || "Workflow"} ${status.toLowerCase()} · ${stats.nodesRun} nodes · $${stats.costUsd.toFixed(4)}`);
  return execId;
}

async function runCapability(node: NodeInstance, collected: Record<string, unknown>): Promise<Record<string, unknown>> {
  const first = Object.values(collected)[0];
  const id = node.definitionId;
  if (id === "cap.filesystem") {
    const path = String(collected.path ?? node.config.path ?? ".");
    const op = String(node.config.op ?? "read");
    if (op === "list") {
      const listing = await ipc.fsList(path);
      return { listing, result: listing, "*": listing };
    }
    if (op === "write") {
      await ipc.fsWrite(path, String(collected.content ?? ""));
      return { result: path, "*": path };
    }
    if (op === "mkdir") {
      await ipc.fsMkdir(path);
      return { result: path, "*": path };
    }
    if (op === "remove") {
      await ipc.fsRemove(path, false);
      return { result: path, "*": path };
    }
    const content = await ipc.fsRead(path);
    return { result: content, "*": content };
  }
  if (id === "cap.terminal") {
    const cmd = String(collected.command ?? node.config.command ?? "");
    const [program, ...args] = cmd.split(/\s+/).filter(Boolean);
    if (!program) throw new Error("terminal: empty command");
    const r = await ipc.shellExec(program, args, collected.cwd as string | undefined, Number(node.config.timeoutSecs ?? 60));
    return { stdout: (r as { stdout?: string }).stdout, result: r, "*": r };
  }
  if (id === "cap.json") {
    const op = String(node.config.op ?? "parse");
    const input = collected.input ?? first;
    let output: unknown = input;
    if (op === "parse") output = typeof input === "string" ? JSON.parse(input) : input;
    else if (op === "stringify") output = JSON.stringify(input);
    return { output, "*": output };
  }
  if (id === "cap.browser") {
    // V7 fix (bug V): this returned a session object and counted as a successful node output even
    // though no browser exists in this build, so cap.browser always "worked" while doing nothing.
    // Keyed on the node: a workflow re-run resumes the same tab, and repeated runs do not pile up
    // abandoned contexts until the service's session cap blocks the next mission.
    // Keyed on the node (ids carry a timestamp, a counter and a random suffix, so they are unique).
    const sess = await ipc.browserSessionCreate(`cap.browser:${node.id}`) as { sessionId?: string | null; reason?: string };
    if (!sess.sessionId) {
      throw new Error(`cap.browser cannot run: ${sess.reason ?? "no browser is attached in this build"}`);
    }
    if (collected.url) {
      const nav = await ipc.browserNavigate(String(sess.sessionId), String(collected.url)) as { ok?: boolean; notAttached?: boolean; reason?: string };
      if (nav.ok === false || nav.notAttached) {
        throw new Error(`cap.browser navigation failed: nothing was fetched. ${nav.reason ?? ""}`.trim());
      }
    }
    return { session: sess, "*": sess };
  }
  if (id === "cap.http") {
    throw new Error("HTTP capability is host-bound. Use an agent with networkAccess or an MCP server. MJ will not silently fake a 200.");
  }
  if (id === "cap.vector") {
    const hits = await ipc.memorySearch(String(node.id), String(collected.query ?? ""), Number(node.config.k ?? 5));
    return { hits, "*": hits };
  }
  return { "*": first ?? collected };
}

export function newLocalExecId() {
  return uid("exec");
}
