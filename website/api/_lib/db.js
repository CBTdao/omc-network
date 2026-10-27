/**
 * Postgres connection + request helpers for the airdrop API.
 *
 * The connection string comes from DATABASE_URL (Vercel's Neon/Postgres
 * integrations also expose POSTGRES_URL, so both are accepted). With neither
 * set the API reports 503 and the airdrop page stays in its local-preview
 * mode — it never pretends an entry was recorded.
 */

const crypto = require("crypto");

let pool = null;

function getPool() {
  if (pool) return pool;              /* already created, or injected by a test */
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  const { Pool } = require("pg");
  const local = /localhost|127\.0\.0\.1/.test(url);
  pool = new Pool({
    connectionString: url,
    ssl: local || process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  return pool;
}

/* Test seam: lets the handler tests run against an in-process Postgres
   (PGlite) without pretending a connection string exists. */
function setPool(p) {
  pool = p;
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).split(",")[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
}

/* IPs are stored only as a salted hash: enough to spot 500 entries from one
   machine, not enough to keep a visitor's address on file. */
function hashIp(req) {
  const ip = clientIp(req);
  if (!ip) return null;
  const salt = process.env.AIRDROP_IP_SALT || "omc-airdrop";
  return crypto.createHash("sha256").update(salt + "|" + ip).digest("hex").slice(0, 32);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = { getPool, setPool, hashIp, send };
