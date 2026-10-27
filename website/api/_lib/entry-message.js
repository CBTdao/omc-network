/**
 * Canonical airdrop-entry message.
 *
 * The signature has to prove three things at once: who owns the address, for
 * which day the entry is being claimed, and whether an invite is attached. So
 * the message carries all three, and the server rebuilds it from the parsed
 * fields and requires an exact match — a signer cannot quietly change the day
 * or the referrer after signing.
 *
 * Keeping the day inside the message also kills replay: a signature harvested
 * today cannot register an entry tomorrow, because tomorrow the server derives
 * a different canonical string.
 */

const PURPOSE = "Omniverse Compute (OMC) — airdrop entry";
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const NONCE_RE = /^[0-9a-f]{16}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* UTC+8 calendar day as YYYY-MM-DD. The airdrop resets at 00:00 UTC+8. */
function dayKeyUTC8(date) {
  const ms = (date instanceof Date ? date.getTime() : Number(date)) + 8 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeAddress(a) {
  return String(a || "").trim().toLowerCase();
}

function buildMessage({ address, day, referrer, nonce }) {
  return [
    PURPOSE,
    "",
    "Address: " + normalizeAddress(address),
    "Day: " + day + " (UTC+8)",
    "Referrer: " + (referrer ? normalizeAddress(referrer) : "none"),
    "Nonce: " + nonce,
    "",
    "Signing this message registers one airdrop entry for the day above.",
    "It costs no gas and grants no spending rights.",
  ].join("\n");
}

/**
 * Parse a signed message back into its fields.
 * Returns null when the shape is not the canonical one, so callers can reject
 * anything that was not produced by buildMessage().
 */
function parseMessage(message) {
  if (typeof message !== "string") return null;
  const lines = message.split("\n");
  if (lines[0] !== PURPOSE) return null;

  const fields = {};
  for (const line of lines) {
    const m = /^(Address|Day|Referrer|Nonce): (.*)$/.exec(line);
    if (m) fields[m[1]] = m[2];
  }

  const address = normalizeAddress(fields.Address);
  const nonce = fields.Nonce || "";
  const dayRaw = fields.Day || "";
  const day = dayRaw.replace(/\s*\(UTC\+8\)$/, "");
  const refRaw = fields.Referrer;
  const referrer = refRaw && refRaw !== "none" ? normalizeAddress(refRaw) : null;

  if (!ADDRESS_RE.test(address)) return null;
  if (!NONCE_RE.test(nonce)) return null;
  if (!DAY_RE.test(day)) return null;
  if (referrer !== null && !ADDRESS_RE.test(referrer)) return null;
  if (referrer === address) return null;

  /* Exact-match rebuild: anything appended, reordered or reworded is rejected. */
  if (buildMessage({ address, day, referrer, nonce }) !== message) return null;

  return { address, day, referrer, nonce };
}

module.exports = {
  PURPOSE,
  ADDRESS_RE,
  dayKeyUTC8,
  normalizeAddress,
  buildMessage,
  parseMessage,
};
