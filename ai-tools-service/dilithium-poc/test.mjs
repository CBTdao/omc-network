import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCHEMES,
  keygen,
  signAuthorization,
  verifyAuthorization,
  canonicalize,
} from "./dilithium.mjs";

test("canonicalize is deterministic and key-order independent", () => {
  const a = canonicalize({ b: 1, a: 2 });
  const b = canonicalize({ a: 2, b: 1 });
  assert.equal(a, b, "key order must not change canonical output");
  assert.equal(a, '{"a":2,"b":1}');
});

for (const scheme of Object.keys(SCHEMES)) {
  test(`[${scheme}] sign/verify roundtrip, tamper + wrong-key rejection`, () => {
    const keys = keygen(scheme);
    const auth = {
      type: "claim-preauthorization",
      claim: "0x9f3c",
      amount: "20",
      ticker: "OMC",
      issuedAt: 1798742400,
      expiresAt: 1801420800,
      nonce: "k7p2x",
    };
    const payload = signAuthorization(auth, keys.secretKey, scheme);
    assert.equal(payload.scheme, scheme);
    assert.equal(
      verifyAuthorization(payload, keys.publicKey),
      true,
      "honest payload should verify"
    );

    const tampered = JSON.parse(JSON.stringify(payload));
    tampered.message = tampered.message.replace('"20"', '"99999"');
    assert.equal(
      verifyAuthorization(tampered, keys.publicKey),
      false,
      "tampered payload must be rejected"
    );

    const other = keygen(scheme);
    assert.equal(
      verifyAuthorization(payload, other.publicKey),
      false,
      "payload signed by a different key must be rejected"
    );
  });
}

test("verify rejects an unknown scheme", () => {
  const payload = {
    scheme: "NOPE-99",
    alg: "ML-DSA",
    publicKey: "AAAA",
    message: "{}",
    signature: "AAAA",
  };
  assert.throws(
    () => verifyAuthorization(payload, new Uint8Array(32)),
    /unknown scheme/
  );
});
