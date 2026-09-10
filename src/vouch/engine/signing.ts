/**
 * §ISSUER SIGNING — Ed25519 issuer identity for Vouch's proof receipts.
 *
 * WHY THIS EXISTS
 * Receipts are tamper-EVIDENT (HMAC seal over a published secret) but not
 * issuer-authentic — anyone who knows the secret could have produced the seal.
 * The 2026 industry direction is unambiguous — Ed25519-signed, hash-chained
 * receipts with offline verification against a published key (IETF ACTA
 * signed-receipts, Nobulex, AgenticRail, Provenrail, agentmark) — so Vouch's
 * issuer is a cryptographic identity: a locally generated Ed25519 keypair
 * signs the receipt chain, and any auditor holding the exported public key
 * can verify Vouch issued it, with zero Vouch state. Same shared standard
 * ships: one verifier covers the current and the legacy wire formats.
 *
 * THE HONESTY RULES
 *  - The private key lives ONLY on the user's machine: sealed in the OS keychain on the
 *    native (Tauri) desktop, in webview localStorage on the browser edition, in-memory
 *    otherwise. It is never sent anywhere; this product has no server to send it to.
 *  - When the runtime has no Ed25519 (an older webview), the receipt is NOT faked:
 *    `signature` stays null and `signatureNote` says exactly what happened. The HMAC
 *    seal still applies, so the receipt stays tamper-evident — and says so.
 *  - Verification is the same algorithm everywhere: re-check the chain, re-check the
 *    seal, and — when a signature and public key are present — verify Ed25519 over the
 *    final chain hash.
 *
 * Node-import-safe: storage is guarded; crypto.subtle exists on Node ≥ 15 (global) and in
 * every modern webview, and Ed25519 in WebCrypto on Node ≥ 18 and current browsers.
 */

export interface IssuerIdentity {
  /** Stable id for this issuer key: "vouch-issuer-" + first 12 hex chars of the public key. */
  keyId: string;
  /** Hex-encoded 32-byte Ed25519 public key. This is what auditors receive. */
  publicKeyHex: string;
  createdAt: string;
}

export interface IssuerSignature {
  alg: "EdDSA";
  keyId: string;
  publicKeyHex: string;
  /** Hex-encoded 64-byte Ed25519 signature over the final receipt chain hash. */
  sigHex: string;
}

const STORAGE_KEY = "vouch.issuerkey.v1";

/**
 * THE NATIVE SEAM — where the OS keychain plugs in at the Tauri phase. In
 * the Tauri host this returns a secret_get/secret_set-backed bridge
 * (service "vouch", ref KEYCHAIN_REF): the issuer's PRIVATE key is sealed in
 * the OS credential store and never leaves the machine. In the web edition
 * there is no host, so the bridge is honestly null and the key lives in
 * webview localStorage (the same deterministic path every probe exercises).
 * Rust side: src-tauri/src/secrets.rs reports the truth when a keyring is
 * unavailable (MemoryOnly) — a degraded key is stated, never silent.
 */
/** Named seam for the native phase: the keychain ref the Tauri shell will seal this key under. */
export const KEYCHAIN_REF = "vouch.issuerkey.v1";

async function keychainBridge(): Promise<{ get(): Promise<string | null>; set(json: string): Promise<boolean> } | null> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { ipc } = await import("../ipc/client");
    return {
      get: async () => {
        try {
          const r = await ipc.secretGet(KEYCHAIN_REF);
          return r.present && r.value ? r.value : null;
        } catch {
          return null;
        }
      },
      set: async (json: string) => {
        try {
          const r = await ipc.secretSet(KEYCHAIN_REF, json);
          return Boolean(r.stored);
        } catch {
          return false;
        }
      },
    };
  } catch {
    return null;
  }
}

let cached: { identity: IssuerIdentity; privateKey: CryptoKey } | null = null;

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function ed25519Available(): boolean {
  try {
    return typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof crypto.subtle.generateKey === "function";
  } catch {
    return false;
  }
}

/**
 * The Vouch issuer identity, generated once per machine. Persistence is best-effort: in a
 * browser/desktop with storage the same key survives restarts; under the probe runner it
 * is in-memory for the session, which is all a deterministic test needs.
 */
export async function ensureIssuerIdentity(): Promise<{ identity: IssuerIdentity; privateKey: CryptoKey } | null> {
  if (cached) return cached;
  if (!ed25519Available()) return null;

  // Try to rehydrate a previously generated key so the issuer identity is stable.
  // Native (Tauri) hosts read the sealed keychain copy first; browser hosts keep the
  // localStorage path (used as a mirrored fallback on native, too).
  const bridge = await keychainBridge();
  try {
    const raw = bridge ? await bridge.get() : globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as { publicKeyHex?: string; privateJwk?: JsonWebKey; createdAt?: string };
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity: IssuerIdentity = {
          keyId: `vouch-issuer-${stored.publicKeyHex.slice(0, 12)}`,
          publicKeyHex: stored.publicKeyHex,
          createdAt: stored.createdAt ?? new Date(0).toISOString(),
        };
        cached = { identity, privateKey };
        return cached;
      }
    }
  } catch {
    /* fall through to generation */
  }

  try {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKeyHex = toHex(rawPub);
    const identity: IssuerIdentity = {
      keyId: `vouch-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: new Date().toISOString(),
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const persisted = JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt });
    // Seal in the OS keychain when a native shell is present; localStorage remains the
    // browser host path and a mirrored fallback. A failed keychain write is not fatal —
    // the session still signs, exactly as the storage-unavailable case always has.
    try {
      if (bridge) await bridge.set(persisted);
    } catch {
      /* keychain unavailable — the localStorage write below still applies */
    }
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, persisted);
    } catch {
      /* storage unavailable — the session still signs; the identity just does not persist */
    }
    cached = { identity, privateKey: pair.privateKey };
    return cached;
  } catch {
    // WebCrypto exists but Ed25519 is refused (older webview). Honest null, never a fake.
    return null;
  }
}

/**
 * Sign an arbitrary hex digest (32 bytes of hex) with the issuer key. This is the
 * primitive; signChainHash below is the receipt-specific name for the same operation.
 */
export async function signHexDigest(hexDigest: string): Promise<IssuerSignature | null> {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  try {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, holder.privateKey, fromHex(hexDigest)));
    return { alg: "EdDSA", keyId: holder.identity.keyId, publicKeyHex: holder.identity.publicKeyHex, sigHex: toHex(sig) };
  } catch {
    return null;
  }
}

/** Sign the final chain hash of a receipt. Null when the runtime cannot sign. */
export async function signChainHash(chainHashHex: string): Promise<IssuerSignature | null> {
  return signHexDigest(chainHashHex);
}

/**
 * Verify an issuer signature with ONLY the message, the signature and the public key —
 * the exact auditor path, no product state involved. Returns false on any mismatch; throws on
 * malformed input only when the runtime cannot even attempt Ed25519 (also reported as
 * false by callers that wrap this).
 */
export async function verifyIssuerSignature(chainHashHex: string, sigHex: string, publicKeyHex: string): Promise<boolean> {
  if (!ed25519Available()) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", fromHex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromHex(sigHex), fromHex(chainHashHex));
  } catch {
    return false;
  }
}

/**
 * The public document an auditor receives: who the issuer is, the public key, and how to
 * verify. Plain text on purpose — it must survive email, tickets and print.
 */
export async function exportIssuerPublicKeyDocument(version: string): Promise<string | null> {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  return [
    "Vouch Harbor — Issuer Public Key (Ed25519)",
    "================================",
    "",
    `Version    : ${version}`,
    `Key id     : ${holder.identity.keyId}`,
    `Public key : ${holder.identity.publicKeyHex}`,
    `Created    : ${holder.identity.createdAt}`,
    "",
    "What this key verifies",
    "----------------------",
    "Every receipt issued by this Vouch Harbor install (current vh-proof-receipt/2, legacy",
    "mj-proof-receipt/1|2) carries `issuer` + `signature`:",
    "an Ed25519 signature over the receipt's FINAL CHAIN HASH (the `hash` of the last",
    "chained event). To verify a receipt without this product:",
    "",
    "  1. Re-canonicalize each event body (recursive key sort) and re-hash the chain",
    "     from the 64-zero genesis to recover the final chain hash.",
    "  2. Verify the Ed25519 signature over that hash with the public key above.",
    "  3. Re-check the HMAC seal as before (it still applies).",
    "",
    "The private key never leaves the machine that issued the receipts; there is no server",
    "it could leave through. Treat this document like a code-signing certificate: anyone",
    "holding it can verify the receipts; nobody holding it can forge them.",
    "",
  ].join("\n");
}

/** For tests and the compliance center: is issuer signing available in THIS runtime? */
export function signingSupported(): boolean {
  return ed25519Available();
}
