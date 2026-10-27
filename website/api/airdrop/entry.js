/**
 * POST /api/airdrop/entry
 *
 * Body: { address, message, signature, referrer? }
 *
 * The signed message is rebuilt server-side and compared byte for byte, so the
 * day and the referrer cannot be altered after signing. The recovered signer
 * must equal the claimed address. Caps are enforced in the store, inside an
 * advisory lock.
 */

const { verifyMessage } = require("ethers");
const { parseMessage, dayKeyUTC8, normalizeAddress, ADDRESS_RE } = require("../_lib/entry-message");
const { getPool, hashIp, send } = require("../_lib/db");
const { registerEntry } = require("../_lib/store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, code: "METHOD" });
  }

  const pool = getPool();
  if (!pool) return send(res, 503, { ok: false, code: "UNAVAILABLE" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const address = normalizeAddress(body.address);
  const { message, signature } = body;

  if (!ADDRESS_RE.test(address) || typeof message !== "string" || typeof signature !== "string") {
    return send(res, 400, { ok: false, code: "BAD_REQUEST" });
  }

  const parsed = parseMessage(message);
  if (!parsed) return send(res, 400, { ok: false, code: "BAD_MESSAGE" });
  if (parsed.address !== address) return send(res, 400, { ok: false, code: "BAD_MESSAGE" });

  /* The message is bound to one UTC+8 day; yesterday's signature is dead. */
  if (parsed.day !== dayKeyUTC8(new Date())) {
    return send(res, 409, { ok: false, code: "STALE_MESSAGE", day: dayKeyUTC8(new Date()) });
  }

  /* The optional referrer in the body must be the one that was signed. */
  const referrer = body.referrer ? normalizeAddress(body.referrer) : null;
  if (referrer && referrer !== parsed.referrer) {
    return send(res, 400, { ok: false, code: "BAD_MESSAGE" });
  }

  let signer;
  try {
    signer = normalizeAddress(verifyMessage(message, signature));
  } catch (_) {
    return send(res, 400, { ok: false, code: "BAD_SIGNATURE" });
  }
  if (signer !== address) return send(res, 400, { ok: false, code: "BAD_SIGNATURE" });

  try {
    const result = await registerEntry(pool, {
      address,
      referrer: parsed.referrer,
      refCode: typeof body.code === "string" && /^OMC-[A-Z0-9]{8}$/.test(body.code)
        ? body.code
        : null,
      message,
      signature,
      ipHash: hashIp(req),
    });

    const status = result.code === "OK" ? 200 : 409;
    return send(res, status, {
      ok: result.code === "OK",
      code: result.code,
      creditedReferrer: !!result.credited,
      entries: {
        base: result.base,
        referral: result.referral,
        total: result.total,
        today: result.today,
        amount: result.amount,
        cap: result.cap,
      },
      allocation: result.allocation || null,
    });
  } catch (err) {
    console.error("airdrop entry failed", err && err.message);
    return send(res, 500, { ok: false, code: "SERVER_ERROR" });
  }
};
