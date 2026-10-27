/**
 * Airdrop ledger — all SQL lives here.
 *
 * The store takes an injected pool so the same code runs against a real
 * Postgres in production and an in-process Postgres (PGlite) in tests.
 * Functions never read process.env; the caller decides where the database is.
 */

const { dayKeyUTC8, normalizeAddress } = require("./entry-message");

/* Must match contracts/params.json → airdrop.{baseEntries,referralEntries,perEntry}.
   These cannot be read from that file at runtime: a Vercel function cannot reach
   outside its own deployment root. db/tests/airdrop-api.test.mjs asserts the two
   stay equal, which is the only reason a literal is acceptable here. */
const CAPS = {
  base: 5,        // own entries per wallet, lifetime
  referral: 5,    // bonus entries an inviter can earn, lifetime
  perEntry: 20,   // OMC per entry — 2% of supply spread over 1,000,000 slots
};

/* Slots in the pool: 20,000,000 ÷ 20. Mirrors contracts/params.json airdrop.poolSlots.
   Once they are gone the campaign is over whatever a wallet's remaining cap says —
   "first come, first served" is not a slogan if the ledger does not enforce it. */
const POOL_SLOTS = 1_000_000;

/**
 * Slots already taken, counted from the ledger rather than from a counter.
 *
 * count(*) over a million rows costs tens of milliseconds and that is the right
 * trade: a cached counter that drifts turns first-come-first-served into "whoever
 * the cache remembered", and the failure is invisible until the pool is overdrawn.
 */
async function readPoolUsage(client) {
  const { rows } = await client.query("select count(*)::int as used from airdrop_entries");
  return Number((rows[0] && rows[0].used) || 0);
}

/* A pg Pool hands out dedicated clients; PGlite is a single connection. Both
   are treated the same way here so the transactional code has one shape. */
async function withClient(pool, fn) {
  if (typeof pool.connect === "function") {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      if (typeof client.release === "function") client.release();
    }
  }
  return fn(pool);
}

async function readCounts(client, address, day) {
  const { rows } = await client.query(
    `select
       count(*) filter (where source = 'wallet')                    as base,
       count(*) filter (where source = 'referral')                  as referral,
       count(*) filter (where source = 'wallet' and day_key = $2)   as today,
       coalesce(sum(amount), 0)                                     as amount
     from airdrop_entries
     where address = $1`,
    [address, day]
  );
  const r = rows[0] || {};
  const base = Number(r.base || 0);
  const referral = Number(r.referral || 0);
  return {
    base,
    referral,
    today: Number(r.today || 0),
    total: base + referral,
    amount: Number(r.amount || 0),
    cap: CAPS.base + Math.min(referral, CAPS.referral),
  };
}

/**
 * Recompute the credit row for one wallet (002). Returns null when the
 * allocation table is not present yet, so a database that has only run 001
 * keeps working instead of failing every registration.
 */
async function refreshAllocation(client, address) {
  try {
    const { rows } = await client.query("select * from refresh_airdrop_allocation($1)", [address]);
    return shapeAllocation(rows[0]);
  } catch (err) {
    if (err && (err.code === "42883" || err.code === "42P01")) return null;
    throw err;
  }
}

async function readAllocation(client, address) {
  try {
    const { rows } = await client.query("select * from airdrop_allocations where address = $1", [address]);
    return rows[0] ? shapeAllocation(rows[0]) : null;
  } catch (err) {
    if (err && err.code === "42P01") return null;
    throw err;
  }
}

function shapeAllocation(r) {
  if (!r) return null;
  return {
    baseEntries: Number(r.base_entries),
    referralEntries: Number(r.referral_entries),
    totalEntries: Number(r.total_entries),
    total: Number(r.total_amount),
    base: Number(r.base_amount),
    bonus: Number(r.bonus_amount),
    status: r.status,
    computedAt: r.computed_at,
  };
}

/** Public status for one address. Never throws for an unknown address. */
async function getStatus(pool, address, now) {
  const addr = normalizeAddress(address);
  const day = dayKeyUTC8(now || new Date());
  return withClient(pool, async (client) => {
    const counts = await readCounts(client, addr, day);
    const used = await readPoolUsage(client);
    const remaining = Math.max(0, POOL_SLOTS - used);
    return {
      address: addr,
      ...counts,
      day,
      allocation: await readAllocation(client, addr),
      pool: { slots: POOL_SLOTS, used, remaining },
      canParticipate:
        remaining > 0 && counts.today === 0 && counts.base < CAPS.base,
      caps: { ...CAPS, total: CAPS.base + CAPS.referral },
    };
  });
}

/**
 * Record one entry. The signature has already been verified by the caller —
 * this function only enforces the caps atomically.
 *
 * Returns { code, ...counts } where code is one of
 *   OK | LIMIT_DAILY | LIMIT_TOTAL
 */
async function registerEntry(pool, { address, referrer, refCode, message, signature, ipHash, now }) {
  const addr = normalizeAddress(address);
  const ref = referrer ? normalizeAddress(referrer) : null;
  const day = dayKeyUTC8(now || new Date());

  return withClient(pool, async (client) => {
    await client.query("begin");
    try {
      /* Serialise everything for this address, so two tabs clicking at the
         same instant cannot both pass the "one per day" check. */
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [addr]);

      /* The pool is global, so it needs a global lock too: two wallets on two
         connections would otherwise both read "one slot left" and both take it.
         Lock order is fixed (address, then pool) so two transactions cannot
         deadlock by taking them in opposite orders. */
      await client.query("select pg_advisory_xact_lock(hashtext($1))", ["omc-airdrop-pool"]);

      const before = await readCounts(client, addr, day);
      if (before.today >= 1) {
        await client.query("rollback");
        return { code: "LIMIT_DAILY", ...before };
      }
      if (before.base >= CAPS.base) {
        await client.query("rollback");
        return { code: "LIMIT_TOTAL", ...before };
      }

      /* First come, first served. Checked after the per-wallet caps because the
         caps are free and this is a count, and checked before the insert because
         the alternative is a pool that overdraws quietly. A referral credit in the
         same transaction can take one slot beyond the limit — the campaign ends
         with 1,000,001 entries at worst, which is a rounding error against 2% of
         supply and not worth a second lock to prevent. */
      const used = await readPoolUsage(client);
      if (used >= POOL_SLOTS) {
        await client.query("rollback");
        return { code: "POOL_EXHAUSTED", used, slots: POOL_SLOTS, ...before };
      }

      await client.query(
        `insert into airdrop_entries
           (address, day_key, amount, source, referrer, ref_code, message, signature, ip_hash)
         values ($1, $2, $3, 'wallet', null, $4, $5, $6, $7)`,
        [addr, day, CAPS.perEntry, refCode || null, message, signature, ipHash || null]
      );

      /* An invite only pays out on the invitee's very first entry, and only
         if the inviter is itself a participant and still under its bonus cap. */
      let credited = false;
      if (ref && ref !== addr && before.base === 0) {
        const inviter = await readCounts(client, ref, day);
        if (inviter.referral < CAPS.referral && inviter.total > 0) {
          const ins = await client.query(
            `insert into airdrop_entries
               (address, day_key, amount, source, referrer, ref_code, message, signature, ip_hash)
             values ($1, $2, $3, 'referral', $4, null, $5, $6, $7)
             on conflict do nothing
             returning id`,
            [ref, day, CAPS.perEntry, addr, message, signature, ipHash || null]
          );
          credited = ins.rows.length > 0;
        }
      }

      /* Keep the credit row in step with the events, inside the same
         transaction: an entry that commits without its allocation would be a
         participant the claim window has no record of. */
      const allocation = await refreshAllocation(client, addr);
      if (credited && ref) await refreshAllocation(client, ref);

      const after = await readCounts(client, addr, day);
      await client.query("commit");
      return { code: "OK", credited, ...after, allocation };
    } catch (err) {
      try { await client.query("rollback"); } catch (_) { /* connection gone */ }
      /* Backstop: the partial unique index fired despite the advisory lock. */
      if (err && err.code === "23505") {
        const counts = await readCounts(client, addr, day).catch(() => ({
          base: 0, referral: 0, today: 1, total: 0, amount: 0,
        }));
        return { code: "LIMIT_DAILY", ...counts };
      }
      throw err;
    }
  });
}

module.exports = { CAPS, POOL_SLOTS, getStatus, registerEntry, withClient, readPoolUsage };
