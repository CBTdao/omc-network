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
const { ensureSchema } = require("../_lib/migrate");

/**
 * Public progress numbers for the home-page ticker. Reads the credit ledger
 * (002) and degrades to null when that migration has not been applied, so the
 * page falls back to its static copy instead of showing zeros as if they were
 * real. Zeros that mean "no data" are a lie with a straight face.
 */
async function readTotals(pool) {
  try {
    const { rows } = await pool.query(
      "select wallets, entries, amount, is_frozen from airdrop_totals"
    );
    const r = rows[0];
    if (!r) return null;
    return {
      wallets: Number(r.wallets),
      entries: Number(r.entries),
      amount: Number(r.amount),
      frozen: Boolean(r.is_frozen),
    };
  } catch (err) {
    if (err && (err.code === "42P01" || err.code === "42883")) return null;
    throw err;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, code: "METHOD" });
  }

  const pool = getPool();
  if (!pool) return send(res, 503, { ok: false, code: "UNAVAILABLE" });

  /* Same self-migration as POST /entry: a freshly created database works
     without anyone running psql against it. */
  try {
    await ensureSchema(pool);
  } catch (err) {
    console.error("airdrop schema failed", err && err.message);
    return send(res, 503, { ok: false, code: "SCHEMA_UNAVAILABLE" });
  }

  const address = normalizeAddress(
    (req.query && req.query.address) || ""
  );

  if (!address) {
    return send(res, 200, {
      ok: true,
      service: "airdrop-ledger",
      caps: { ...CAPS, total: CAPS.base + CAPS.referral },
      totals: await readTotals(pool),
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
      allocation: status.allocation,
    });
  } catch (err) {
    console.error("airdrop summary failed", err && err.message);
    return send(res, 500, { ok: false, code: "SERVER_ERROR" });
  }
};
