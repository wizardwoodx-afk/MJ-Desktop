/**
 * Browser stand-in for `node:readline` — MJ 11.8.5.
 *
 * `acp.ts` uses `createInterface` to read an ACP agent's stdout line by line. There is no child
 * process in a WebView to read from, so there is nothing to line-buffer.
 *
 * Returns an interface that yields nothing and closes immediately, rather than throwing: readline is
 * always consumed as a stream, and a throw at construction would surface as an opaque startup
 * failure inside `acp_open`. An empty stream is the truthful answer — no lines will ever arrive —
 * and `acp.ts` already treats a stream that ends without output as a failed agent session.
 */

export interface EmptyInterface {
  on(_event: string, _listener: (...args: unknown[]) => void): EmptyInterface;
  once(_event: string, _listener: (...args: unknown[]) => void): EmptyInterface;
  off(_event: string, _listener: (...args: unknown[]) => void): EmptyInterface;
  close(): void;
  [Symbol.asyncIterator](): AsyncGenerator<never, void, unknown>;
}

function emptyInterface(): EmptyInterface {
  const self: EmptyInterface = {
    on: () => self,
    once: () => self,
    off: () => self,
    close: () => {},
    async *[Symbol.asyncIterator]() {
      /* no lines will ever arrive — there is no process behind this stream */
    },
  };
  return self;
}

export function createInterface(..._args: unknown[]): EmptyInterface {
  return emptyInterface();
}

export default { createInterface };
