/**
 * §ISSUER SIGNING — Ed25519 issuer identity for MJ's proof receipts (MJ 11.10.1).
 *
 * WHY THIS EXISTS
 * Through 11.10, MJ's receipts were tamper-EVIDENT but not issuer-authentic: the HMAC seal
 * uses a published secret, so anyone who knows the secret could have produced the seal.
 * The 2026 industry direction is unambiguous — Ed25519-signed, hash-chained receipts with
 * offline verification against a published key (IETF ACTA signed-receipts, Nobulex,
 * AgenticRail, Provenrail, agentmark) — so 11.10.1 makes MJ's issuer a cryptographic
 * identity: a locally generated Ed25519 keypair signs the receipt chain, and any auditor
 * holding the exported public key can verify MJ issued it, with zero MJ state.
 *
 * THE HONESTY RULES
 *  - The private key lives ONLY on the user's machine (localStorage when available,
 *    in-memory otherwise). It is never sent anywhere; MJ has no server to send it to.
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
  /** Stable id for this issuer key: "mj-issuer-" + first 12 hex chars of the public key. */
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

const STORAGE_KEY = "mj.issuerkey.v1";

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
 * The MJ issuer identity, generated once per machine. Persistence is best-effort: in a
 * browser/desktop with storage the same key survives restarts; under the probe runner it
 * is in-memory for the session, which is all a deterministic test needs.
 */
export async function ensureIssuerIdentity(): Promise<{ identity: IssuerIdentity; privateKey: CryptoKey } | null> {
  if (cached) return cached;
  if (!ed25519Available()) return null;

  // Try to rehydrate a previously generated key so the issuer identity is stable.
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as { publicKeyHex?: string; privateJwk?: JsonWebKey; createdAt?: string };
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity: IssuerIdentity = {
          keyId: `mj-issuer-${stored.publicKeyHex.slice(0, 12)}`,
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
      keyId: `mj-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: new Date().toISOString(),
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt }));
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
 * the exact auditor path, no MJ state involved. Returns false on any mismatch; throws on
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
export async function exportIssuerPublicKeyDocument(mjVersion: string): Promise<string | null> {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  return [
    "MJ — Issuer Public Key (Ed25519)",
    "================================",
    "",
    `MJ version : ${mjVersion}`,
    `Key id     : ${holder.identity.keyId}`,
    `Public key : ${holder.identity.publicKeyHex}`,
    `Created    : ${holder.identity.createdAt}`,
    "",
    "What this key verifies",
    "----------------------",
    "Every mj-proof-receipt/2 issued by this MJ install carries `issuer` + `signature`:",
    "an Ed25519 signature over the receipt's FINAL CHAIN HASH (the `hash` of the last",
    "chained event). To verify a receipt without MJ:",
    "",
    "  1. Re-canonicalize each event body (recursive key sort) and re-hash the chain",
    "     from the 64-zero genesis to recover the final chain hash.",
    "  2. Verify the Ed25519 signature over that hash with the public key above.",
    "  3. Re-check the HMAC seal as before (it still applies).",
    "",
    "The private key never leaves the machine that issued the receipts; MJ has no server",
    "it could leave through. Treat this document like a code-signing certificate: anyone",
    "holding it can verify MJ's receipts; nobody holding it can forge them.",
    "",
  ].join("\n");
}

/** For tests and the compliance center: is issuer signing available in THIS runtime? */
export function signingSupported(): boolean {
  return ed25519Available();
}
