# OMC off-chain post-quantum signing — Dilithium / ML-DSA PoC

This is the **real, runnable** part of OMC's post-quantum story.

## What this is (and what it is not)

OMC is an EVM contract on BNB Chain. A user's token custody therefore rests on the
EVM's **ECDSA / secp256k1**. OMC **cannot** change the signing algorithm of a
user's externally-owned account, and the **token is not quantum-resistant today**.
Anyone who writes "our coin is quantum-resistant" is wrong, and it will get
screenshot-dismantled.

What OMC **does** fully control is the signing of its *own* off-chain messages —
claim pre-authorizations, ai-tools job tickets, internal service credentials. Those
can use a post-quantum signature — **Dilithium / ML-DSA (FIPS 204)** — with no
dependence on the EVM. That is the one place OMC can be quantum-resistant **today**,
and this directory proves it.

This is a forward-looking capability track, not a claim about the token. The full
plan, the honest boundary, and the guardrails are in
[`docs/post-quantum-roadmap.md`](../../docs/post-quantum-roadmap.md).

## Run it

```bash
cd ai-tools-service/dilithium-poc
npm install            # pulls @noble/post-quantum (pure JS, zero native deps)
npm test              # sign/verify + tamper/wrong-key rejection, both parameter sets
npm run               # prints a signed, transport-ready authorization payload
```

## What `dilithium.mjs` gives you

- `keygen(scheme?)` — generate an ML-DSA keypair (`ML-DSA-65` default; `ML-DSA-87` available).
- `signAuthorization(auth, secretKey, scheme?)` — canonicalize the auth object, sign
  it, and return a self-describing JSON payload
  `{ scheme, alg, publicKey, message, signature }` (keys/sig are base64url for transport).
- `verifyAuthorization(payload, trustedPublicKey?)` — verify; if `trustedPublicKey`
  is given it is pinned (production mode), otherwise the embedded key is trusted (demo).

## How it would plug into OMC

1. The service that controls the message (e.g. the claim pre-authorizer or the
   ai-tools scheduler) holds a Dilithium **secret key in an HSM / cold environment** —
   never in app code, never in this repo.
2. It signs the authorization and ships the payload over the existing channel
   (HTTP header, or as calldata into the claim/verify function).
3. The verifier pins the service's **public key** (server-side allow-list) and calls
   `verifyAuthorization(payload, PINNED_PUBLIC_KEY)`. Tampered or wrong-key payloads
   are rejected.
4. The on-chain contract keeps doing what it does today (ECDSA, multisig owner,
   timelock). The post-quantum signature lives *off-chain*, in the layer OMC owns.

## Parameters

| Scheme     | Public key | Secret key | Signature |
|------------|-----------|-----------|-----------|
| ML-DSA-65  | 1952 B    | 4032 B    | 3309 B    |
| ML-DSA-87  | 2592 B    | 4896 B    | 4627 B    |

Signatures are large but constant-size and cheap to verify; they are meant for
low-frequency, high-trust control messages, not per-token transfers.

## Dependencies

- [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum) — pure-JS,
  audited, zero-dependency FIPS 203/204/205 implementation.
