#!/usr/bin/env node
/**
 * Submit URLs to Bing through the Webmaster URL Submission API, and read back
 * what Bing actually did with them.
 *
 * Why this exists next to scripts/indexnow.mjs: they answer different questions.
 *
 *   IndexNow  -- "these URLs exist or changed". Unauthenticated, no quota to
 *                speak of, works for any host. Says nothing about outcome.
 *   This API  -- authenticated against a verified property, and it can be asked
 *                what happened: GetUrlInfo returns LastCrawledDate per URL.
 *
 * That last part is the reason for the script. Every submission endpoint
 * answers 200 whether or not it will do anything -- including for a URL that
 * does not belong to the property at all. A 200 is not evidence. The only
 * evidence is a LastCrawledDate that moved, which is what --status reports.
 *
 * Credentials are not in the repository. The key is read from
 * BING_WEBMASTER_API_KEY, or from ~/.bing-api-key, which is outside version
 * control on purpose -- it grants write access to every property on the
 * account, not just this one.
 *
 * Usage:
 *   node scripts/bing-submit.mjs              submit every sitemap URL
 *   node scripts/bing-submit.mjs airdrop      only URLs containing "airdrop"
 *   node scripts/bing-submit.mjs --status     crawl state per URL, submits nothing
 *   node scripts/bing-submit.mjs --sites      verified properties on the account
 *   node scripts/bing-submit.mjs --dry-run    show the plan, send nothing
 *
 * Substring filters take no leading slash: Git Bash on Windows rewrites
 * "/airdrop" into a Windows path before node sees it.
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://ssl.bing.com/webmaster/api.svc/json";

// Sitemaps whose URLs this script is responsible for. game.omc.network is a
// separate deployment with its own sitemap, and it is included on purpose: a
// URL with no verified property is exactly the case that fails silently
// everywhere else, so it needs to show up in the report rather than be skipped.
const SITEMAPS = ["website/sitemap.xml", "website/game/sitemap.xml"];

// Bing documents a per-request URL limit; 500 keeps requests small enough that
// a partial failure is cheap to retry, and the total is still a handful of
// calls for this site.
const BATCH = 500;

export function apiKey() {
  const fromEnv = process.env.BING_WEBMASTER_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const file = join(homedir(), ".bing-api-key");
  if (!existsSync(file)) {
    throw new Error(
      "No API key. Set BING_WEBMASTER_API_KEY or write the key to ~/.bing-api-key " +
        "(Bing Webmaster Tools -> Settings -> API access -> API key).",
    );
  }
  const key = readFileSync(file, "utf8").trim();
  if (!key) throw new Error(`~/.bing-api-key is empty`);
  return key;
}

async function call(method, { query = {}, body } = {}) {
  const url = new URL(`${API}/${method}`);
  url.searchParams.set("apikey", apiKey());
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json; charset=utf-8" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${method} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.ErrorCode) {
    // The API reports failures as HTTP 400 with a numeric ErrorCode, which is
    // easy to mistake for a bad request when it is really a bad key or a quota
    // that ran out. Name the cause.
    const code = json.ErrorCode;
    const hint =
      code === 3
        ? "invalid API key"
        : code === 4
          ? "key does not own this site, or the site is not verified"
          : code === 5
            ? "daily URL submission quota exhausted"
            : "unexpected error";
    throw new Error(`${method} failed: HTTP ${res.status} ErrorCode=${code ?? "-"} (${hint}) ${json.Message ?? ""}`.trim());
  }
  return json.d ?? null;
}

export async function sites() {
  const list = (await call("GetUserSites")) ?? [];
  return list.map((s) => ({ url: s.Url, verified: Boolean(s.IsVerified) }));
}

/**
 * Pick the verified property that owns a URL: the longest property URL that is
 * a prefix of it. Longest, not first, because this account has both
 * https://omc.network/ and https://omc.network/zh/ verified -- a Chinese page
 * belongs to both, and submitting it under the narrower one is the correct
 * attribution.
 *
 * Returns null when nothing covers the URL, which is the case worth reporting.
 */
export function pickProperty(url, properties) {
  const target = new URL(url);
  let best = null;
  for (const p of properties) {
    if (!p.verified) continue;
    let base;
    try {
      base = new URL(p.url);
    } catch {
      continue;
    }
    if (base.host !== target.host) continue;
    // Compare on a slash-terminated path so /zh/ does not match /zhairdrop.
    const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
    const targetPath = target.pathname.endsWith("/") ? target.pathname : `${target.pathname}/`;
    if (!targetPath.startsWith(basePath)) continue;
    if (!best || basePath.length > best.pathLength) {
      best = { url: p.url, pathLength: basePath.length };
    }
  }
  return best ? best.url : null;
}

export function sitemapUrls() {
  const out = [];
  for (const rel of SITEMAPS) {
    const file = join(ROOT, rel);
    if (!existsSync(file)) continue;
    const xml = readFileSync(file, "utf8");
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      if (!out.includes(m[1])) out.push(m[1]);
    }
  }
  return out;
}

/** Bing serialises dates as /Date(ms)/, with DateTime.MinValue for "never". */
export function parseBingDate(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/\/Date\((-?\d+)\)\//);
  if (!m) return null;
  const ms = Number(m[1]);
  // DateTime.MinValue is the sentinel for "known URL, never fetched".
  if (ms <= -62135596800000 + 1000) return null;
  return new Date(ms);
}

async function submit(group, urls, dryRun) {
  const batches = [];
  for (let i = 0; i < urls.length; i += BATCH) batches.push(urls.slice(i, i + BATCH));
  let sent = 0;
  for (const batch of batches) {
    if (dryRun) {
      sent += batch.length;
      continue;
    }
    // A 200 here only means the request was accepted. Nothing is verified until
    // --status shows a crawl date, so this function deliberately does not claim
    // more than "accepted".
    await call("SubmitUrlbatch", { body: { siteUrl: group, urlList: batch } });
    sent += batch.length;
  }
  return sent;
}

async function status(url, property) {
  const info = await call("GetUrlInfo", { query: { siteUrl: property, url: url } });
  if (!info) return { state: "no data", crawled: null, blocked: null };
  const crawled = parseBingDate(info.LastCrawledDate);
  return {
    state: crawled ? "crawled" : "never crawled",
    crawled,
    blocked: info.IsBlocked ?? null,
  };
}

const fmt = (d) =>
  d ? d.toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 16) : "—";

async function main(argv) {
  const flags = argv.filter((a) => a.startsWith("--"));
  const filters = argv.filter((a) => !a.startsWith("--"));

  if (flags.includes("--sites")) {
    const list = await sites();
    console.log(`Verified properties on this account (${list.length}):`);
    for (const s of list) console.log(`  ${s.verified ? "ok  " : "unverified"}  ${s.url}`);
    return;
  }

  let urls = sitemapUrls();
  if (filters.length) urls = urls.filter((u) => filters.some((f) => u.includes(f)));
  if (urls.length === 0) {
    console.error("Nothing to do — no sitemap URL matched the filters.");
    console.error("Hint: drop the leading slash (airdrop, not /airdrop); Git Bash rewrites it as a path.");
    process.exitCode = 1;
    return;
  }

  const props = await sites();
  const groups = new Map();
  const uncovered = [];
  for (const u of urls) {
    const p = pickProperty(u, props);
    if (!p) {
      uncovered.push(u);
      continue;
    }
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(u);
  }

  if (flags.includes("--status")) {
    console.log(`Crawl state, ${urls.length} URLs (UTC+8, "—" = never fetched)\n`);
    let crawled = 0;
    for (const [property, list] of [...groups, [null, uncovered]]) {
      for (const u of list) {
        if (!property) {
          console.log(`  no property  ${u}`);
          continue;
        }
        const s = await status(u, property);
        if (s.crawled) crawled++;
        const flag = s.blocked ? "  BLOCKED" : "";
        console.log(`  ${s.state.padEnd(13)} ${fmt(s.crawled).padEnd(18)} ${u}${flag}`);
      }
    }
    console.log(`\n${crawled}/${urls.length} crawled.`);
    if (uncovered.length) {
      console.log(`\nACTION NEEDED: ${uncovered.length} URL(s) have no verified property in Bing.`);
      console.log(`Add them at https://www.bing.com/webmaster -> Add site, then re-run.`);
      console.log(`The ownership file is already deployed on those hosts, so it verifies immediately.`);
    }
    return;
  }

  const dryRun = flags.includes("--dry-run");
  for (const [property, list] of groups) {
    const sent = await submit(property, list, dryRun);
    console.log(`${dryRun ? "would submit" : "submitted"}  ${String(sent).padStart(4)} urls  under ${property}`);
  }
  if (uncovered.length) {
    console.log(`\nskipped ${uncovered.length} urls with no verified property:`);
    for (const u of uncovered.slice(0, 5)) console.log(`  ${u}`);
    if (uncovered.length > 5) console.log(`  ... and ${uncovered.length - 5} more`);
    console.log(`\nACTION NEEDED: add these hosts as sites in Bing Webmaster, then re-run.`);
  }
  if (!dryRun) {
    console.log(`\nA 200 means the request was accepted, not that a page will be fetched.`);
    console.log(`Check with: node scripts/bing-submit.mjs --status`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
