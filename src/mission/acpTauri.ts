/**
 * ACP transport for the native (Tauri) host.
 *
 * The WebView cannot spawn processes; the Rust side owns the child. Four commands form the
 * bridge (`acp_open`, `acp_send`, `acp_recv`, `acp_close` in `src-tauri/src/commands.rs`):
 * the child's stdout lines are funneled through a channel the frontend polls. Protocol logic
 * stays in `acp.ts` — this file is only pipes.
 *
 * NOTE (honest, per this tree's rules): the Rust bridge commands were written for V11 and are
 * compiled only when a machine with the GTK/WebKit toolchain runs `cargo check` — see
 * MJ-11.0-UPGRADE.md §"What is not proven".
 */
import type { AcpTransport } from "./acp";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args ?? {});
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TauriAcpTransport implements AcpTransport {
  private handle: number | null = null;
  private running = false;

  constructor(
    private readonly program: string,
    private readonly args: string[],
    private readonly cwd?: string,
  ) {}

  async start(onLine: (line: string) => void, onExit: (code: number | null) => void): Promise<void> {
    this.handle = await invoke<number>("acp_open", {
      program: this.program,
      args: this.args,
      cwd: this.cwd ?? null,
    });
    this.running = true;
    void this.pump(onLine, onExit);
  }

  private async pump(onLine: (line: string) => void, onExit: (code: number | null) => void): Promise<void> {
    while (this.running && this.handle !== null) {
      const r = await invoke<{ line: string | null; exitCode: number | null }>("acp_recv", { handle: this.handle });
      if (r.line !== null) {
        onLine(r.line);
        continue;
      }
      if (r.exitCode !== null) {
        onExit(r.exitCode);
        return;
      }
      await sleep(15);
    }
  }

  send(line: string): void {
    if (this.handle === null) throw new Error("acp: transport not started");
    void invoke("acp_send", { handle: this.handle, line });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.handle !== null) {
      try {
        await invoke("acp_close", { handle: this.handle });
      } catch {
        /* the child may already be gone — closing a dead handle is not an error */
      }
      this.handle = null;
    }
  }
}
