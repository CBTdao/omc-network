/**
 * GET /api/airdrop/summary            → service status + caps (used on page load)
 * GET /api/airdrop/summary?address=0x → that wallet's recorded entries
 *
 * The address is only a lookup key: reading someone else's totals reveals
 * nothing beyond what the chain would show anyway (how many entries a wallet
 * registered), and it is what makes cross-device resume possible.
 */

const { normalizeAddress, ADDRESS_RE } = require("../_lib/entry-message");
const { getPool, send } = require("../_lib/db");
const { CAPS, getStatus } = require("../_lib/store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, code: "METHOD" });
  }

  const pool = getPool();
  if (!pool) return send(res, 503, { ok: false, code: "UNAVAILABLE" });

  const address = normalizeAddress(
    (req.query && req.query.address) || ""
  );

  if (!address) {
    return send(res, 200, {
      ok: true,
      service: "airdrop-ledger",
      caps: { ...CAPS, total: CAPS.base + CAPS.referral },
    });
  }

  if (!ADDRESS_RE.test(address)) return send(res, 400, { ok: false, code: "BAD_ADDRESS" });

  try {
    const status = await getStatus(pool, address);
    return send(res, 200, {
      ok: true,
      entries: {
        base: status.base,
        referral: status.referral,
        total: status.total,
        today: status.today,
        amount: status.amount,
        cap: status.cap,
      },
      day: status.day,
      canParticipate: status.canParticipate,
      caps: status.caps,
    });
  } catch (err) {
    console.error("airdrop summary failed", err && err.message);
    return send(res, 500, { ok: false, code: "SERVER_ERROR" });
  }
};
