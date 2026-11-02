/**
 * Demo: OMC issues an off-chain, post-quantum-signed authorization that it fully
 * controls (a claim pre-authorization in this example). The signature is Dilithium
 * / ML-DSA (FIPS 204) — quantum-resistant today, with no dependence on the EVM's
 * ECDSA. This is the realistic leverage OMC has; the token's own custody stays on
 * the EVM and is not covered by this.
 */
import {
  keygen,
  signAuthorization,
  verifyAuthorization,
} from "./dilithium.mjs";

const keys = keygen();
console.log("scheme       :", "ML-DSA-65 (Dilithium, FIPS 204)");
console.log("public key   :", keys.publicKey.length, "bytes");
console.log("secret key   :", keys.secretKey.length, "bytes\n");

// An OMC-controlled authorization. In production this would be a claim ticket,
// an ai-tools job token, or an internal service credential — never a user's token
// transfer (that stays on the EVM with ECDSA).
const authorization = {
  type: "claim-preauthorization",
  claim: "0x9f3c...a01b",
  amount: "20",
  ticker: "OMC",
  issuedAt: 1798742400, // 2027-01-01T00:00:00Z
  expiresAt: 1801420800, // 2027-02-01T00:00:00Z
  nonce: "k7p2x",
};

const payload = signAuthorization(authorization, keys.secretKey);
console.log("signed payload (transport-ready JSON):");
console.log(JSON.stringify(payload, null, 2));

const ok = verifyAuthorization(payload, keys.publicKey);
console.log("\nverify (honest payload)     :", ok === true ? "PASS" : "FAIL");

// Tamper resistance: flip one field after signing.
const tampered = JSON.parse(JSON.stringify(payload));
tampered.message = tampered.message.replace('"20"', '"99999"');
const tamperOk = verifyAuthorization(tampered, keys.publicKey);
console.log("verify (tampered payload)   :", tamperOk === false ? "correctly REJECTED" : "WRONGLY ACCEPTED");

// Wrong-key rejection.
const other = keygen();
const wrongOk = verifyAuthorization(payload, other.publicKey);
console.log("verify (wrong public key)   :", wrongOk === false ? "correctly REJECTED" : "WRONGLY ACCEPTED");
