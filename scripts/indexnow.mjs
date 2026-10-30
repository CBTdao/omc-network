#!/usr/bin/env node
/**
 * Push the sitemap URLs to IndexNow (Bing, Yandex, Seznam, Naver — one call).
 *
 * Why this exists: Bing Webmaster reported our URLs as "已发现但未爬网"
 * (discovered, not crawled) for weeks. Nothing was wrong with the pages —
 * bingbot receives 200 on every one of them, robots.txt allows it, and the
 * sitemap lists them. A new domain simply has almost no crawl budget, and a
 * sitemap only says "here is a URL"; it does not ask for a crawl.
 *
 * IndexNow is the one protocol that asks. It is unauthenticated by design:
 * ownership is proven by hosting <key>.txt at the host root, so the worst a
 * stranger can do with it is announce our own URLs, which is not an attack.
 *
 * The key is read from the repository, not configured here, so the file that
 * served at the root and the key used in the request cannot drift.
 *
 *   node scripts/indexnow.mjs              # submit every sitemap URL
 *   node scripts/indexnow.mjs --dry-run    # show what would be sent
 *   node scripts/indexnow.mjs --host game.omc.network
 *   node scripts/indexnow.mjs /airdrop /zh  # only URLs containing these
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = (p = "") => join(root, "website", p);

const ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH = 100; // protocol maximum is 10,000 per request; smaller batches give clearer errors

function findKey() {
  // Only files carrying the "indexnow-" marker are candidates. Without it, the
  // Google Search Console proof (af9cdf6d...txt, which is a 32-char hex string
  // whose contents are that same hex string) is byte-for-byte a valid IndexNow
  // key file, and the two would be indistinguishable.
  const candidates = readdirSync(site()).filter((f) => /^indexnow-[A-Za-z0-9-]{8,128}\.txt$/.test(f));
  const usable = candidates.filter((f) => {
    // The key file must contain exactly the key, optionally with a trailing newline.
    const body = readFileSync(site(f), "utf8").trim();
    return body === f.replace(/\.txt$/, "");
  });
  if (usable.length === 0) {
    throw new Error("No IndexNow key file found at website/indexnow-<key>.txt — see https://www.indexnow.org/documentation");
  }
  if (usable.length > 1) {
    throw new Error(`More than one valid key file (${usable.join(", ")}); IndexNow would reject the request`);
  }
  return usable[0].replace(/\.txt$/, "");
}

function sitemapUrls() {
  const maps = ["sitemap.xml", "game/sitemap.xml"].map(site).filter(existsSync);
  const urls = [];
  for (const file of maps) {
    const xml = readFileSync(file, "utf8");
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) urls.push(m[1]);
  }
  return [...new Set(urls)];
}

async function submit(host, urls, key) {
  const keyLocation = `https://${host}/${key}.txt`;
  const body = { host, key, keyLocation, urlList: urls };

  if (process.env.DRY_RUN) {
    console.log(`[dry-run] POST ${ENDPOINT}`);
    console.log(JSON.stringify({ ...body, urlList: `[${urls.length} urls]` }, null, 2));
    return { ok: true, status: 0, text: "dry-run" };
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.status === 200 || res.status === 202, status: res.status, text: text.slice(0, 300) };
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
if (dryRun) process.env.DRY_RUN = "1";

const hostFilter = argv.find((a) => a.startsWith("--host="))?.split("=")[1]
  ?? (argv.includes("--host") ? argv[argv.indexOf("--host") + 1] : null);
const needles = argv.filter((a) => !a.startsWith("--") && a !== hostFilter);

const key = findKey();
let urls = sitemapUrls();

if (needles.length) {
  urls = urls.filter((u) => needles.some((n) => u.includes(n)));
}

const byHost = new Map();
for (const u of urls) {
  const host = new URL(u).host;
  if (hostFilter && host !== hostFilter) continue;
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push(u);
}

if (byHost.size === 0) {
  console.error("Nothing to submit — check the filters. Known URLs: " + sitemapUrls().length);
  process.exit(1);
}

console.log(`IndexNow key ${key} · ${urls.length} urls · ${byHost.size} host(s)${dryRun ? " · dry run" : ""}`);

let failed = 0;
for (const [host, list] of byHost) {
  // A host other than the apex needs its own key file; IndexNow fetches
  // keyLocation from that host and 403s if it is absent.
  const subKeyFile = host === "omc.network" ? site(`${key}.txt`) : site(`game/${key}.txt`);
  if (!existsSync(subKeyFile)) {
    console.error(`! ${host}: no key file at website/${host === "omc.network" ? "" : "game/"}${key}.txt — skipping`);
    failed++;
    continue;
  }
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const r = await submit(host, batch, key);
    const note = { 200: "accepted", 202: "accepted (key check pending)", 400: "bad request", 403: "key not reachable at keyLocation", 422: "url/host mismatch", 429: "rate limited" }[r.status] ?? "";
    console.log(`${r.ok ? "ok" : "FAIL"} ${host} · ${batch.length} urls · HTTP ${r.status}${note ? " · " + note : ""}${r.text && !r.ok ? " · " + r.text : ""}`);
    if (!r.ok) failed++;
  }
}

process.exit(failed ? 1 : 0);
