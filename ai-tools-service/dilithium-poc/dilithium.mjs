/**
 * Off-chain post-quantum signing for OMC — Dilithium / ML-DSA (FIPS 204).
 *
 * WHY THIS EXISTS
 * ---------------
 * OMC is an EVM contract on BNB Chain, so a user's token custody rests on the
 * EVM's ECDSA / secp256k1. OMC cannot change the signing algorithm of a user's
 * externally-owned account, and the *token* is not quantum-resistant today.
 *
 * What OMC DOES fully control is its own off-chain signing: messages it issues
 * (claim pre-authorizations, ai-tools job tickets, internal service auth). Those
 * can move to a post-quantum signature — Dilithium / ML-DSA — independent of the
 * chain. That is the one place OMC can be quantum-resistant *today*, because it
 * does not depend on the EVM.
 *
 * This module is the proof-of-concept for that path. It is real, runnable crypto
 * — not a claim about the token.
 *
 * USAGE
 * -----
 *   import { signAuthorization, verifyAuthorization, keygen } from "./dilithium.mjs";
 *   const keys = keygen();                       // { publicKey, secretKey } (Uint8Array)
 *   const payload = signAuthorization(authObj, keys.secretKey);
 *   const ok = verifyAuthorization(payload, keys.publicKey);
 *
 * The signed payload is a plain JSON object you can ship over HTTP / store on
 * chain as calldata: { scheme, alg, publicKey, message, signature }.
 */

import { ml_dsa65, ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";

// ML-DSA-65 (Dilithium) is the conservative default; 87 is the higher-security
// parameter set. Both are FIPS 204. Pick one and pin it — the verifier must know
// which scheme produced a signature.
export const SCHEMES = {
  "ML-DSA-65": ml_dsa65,
  "ML-DSA-87": ml_dsa87,
};

export const DEFAULT_SCHEME = "ML-DSA-65";

// ---- base64url (URL-safe, no padding) for transport -------------------------
const b64urlEncode = (bytes) =>
  Buffer.from(bytes).toString("base64url");
const b64urlDecode = (s) => new Uint8Array(Buffer.from(s, "base64url"));

// ---- canonical JSON: sorted keys, no whitespace -> deterministic bytes ------
export function canonicalize(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const sorted = Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

// ---- key generation --------------------------------------------------------
export function keygen(scheme = DEFAULT_SCHEME) {
  const C = SCHEMES[scheme];
  if (!C) throw new Error(`unknown scheme: ${scheme}`);
  return C.keygen(); // { publicKey, secretKey } as Uint8Array
}

/**
 * Sign an OMC-controlled authorization object.
 * Returns a self-describing, transport-ready payload.
 */
export function signAuthorization(auth, secretKey, scheme = DEFAULT_SCHEME) {
  const C = SCHEMES[scheme];
  if (!C) throw new Error(`unknown scheme: ${scheme}`);
  const message = canonicalize(auth);
  const msgBytes = new TextEncoder().encode(message);
  const signature = C.sign(msgBytes, secretKey);
  return {
    scheme,
    alg: "ML-DSA", // Dilithium, FIPS 204
    // public key is included so a verifier can check it against an allow-list
    // without a side channel; in production, pin it server-side instead.
    publicKey: b64urlEncode(C.getPublicKey(secretKey)),
    message, // canonical JSON string (auditable, not just a hash)
    signature: b64urlEncode(signature),
  };
}

/**
 * Verify a payload produced by signAuthorization.
 * `trustedPublicKey` (Uint8Array, optional) pins the expected signer; if omitted,
 * the embedded publicKey is trusted as-is (fine for a demo, not for production).
 */
export function verifyAuthorization(payload, trustedPublicKey = null) {
  const C = SCHEMES[payload.scheme];
  if (!C) throw new Error(`unknown scheme: ${payload.scheme}`);
  const pub = trustedPublicKey
    ? trustedPublicKey
    : b64urlDecode(payload.publicKey);
  const msgBytes = new TextEncoder().encode(payload.message);
  const sigBytes = b64urlDecode(payload.signature);
  return C.verify(sigBytes, msgBytes, pub);
}
