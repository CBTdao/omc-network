#!/usr/bin/env node
/**
 * SEO audit for the static pages in website/.
 *
 *   node scripts/seo-audit.mjs            # summary + problem list
 *   node scripts/seo-audit.mjs --all      # one line per page
 *   node scripts/seo-audit.mjs --json     # machine readable
 *
 * Rules are deliberately mechanical: things that can be checked without a
 * browser, a crawler or an opinion. Anything that needs judgement (is this a
 * good title?) is printed as a heuristic warning and never fails the run.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WEB = join(ROOT, "website");
const ORIGIN = "https://omc.network";
const GAME_ORIGIN = "https://game.omc.network";

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const showAll = args.has("--all");

/* ---------- file discovery ---------- */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const files = walk(WEB).sort();

/* ---------- tiny parsers ---------- */

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

const attr = (tag, name) => {
  // `(?:^|\s)` keeps `content=` from matching the tail of `data-i18n-content=`.
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decode(m[2] ?? m[3]) : null;
};

const textOf = (s) => decode(String(s).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

function head(html) {
  const i = html.search(/<\/head>/i);
  return i === -1 ? html : html.slice(0, i);
}

function pageInfo(file) {
  const html = readFileSync(file, "utf8");
  const h = head(html);
  const body = html.slice(h.length);
  const rel = relative(WEB, file).split(sep).join("/");
  const isGame = rel.startsWith("game/");
  const url = (() => {
    // website/game/ is deployed twice: at game.omc.network/ (its own Vercel
    // project, which is what the canonicals point at) and at omc.network/game/.
    // The canonical target is the subdomain, so that is what we expect.
    const path = isGame ? rel.slice("game/".length) : rel;
    if (path === "index.html") return isGame ? `${GAME_ORIGIN}/` : `${ORIGIN}/`;
    let clean = "/" + path.replace(/\.html$/, "");
    if (clean.endsWith("/index")) clean = clean.slice(0, -"index".length);
    return `${isGame ? GAME_ORIGIN : ORIGIN}${clean}`;
  })();

  const tags = [...h.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (name, key = "name") => {
    const t = tags.find((tag) => (attr(tag, key) || "").toLowerCase() === name.toLowerCase());
    return t ? attr(t, "content") : null;
  };

  const titleTag = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const canonicalTag = h.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  const h1s = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => textOf(m[1]));
  const h2s = (body.match(/<h2\b/gi) || []).length;
  const imgs = [...body.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const jsonld = [...h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const hreflang = [...h.matchAll(/<link[^>]+hreflang=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const ldErrors = [];
  const ldTypes = [];
  for (const block of jsonld) {
    try {
      const parsed = JSON.parse(block);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of list) {
        if (node && node["@type"]) ldTypes.push(String(node["@type"]));
        if (node && node["@graph"]) {
          for (const g of node["@graph"]) if (g && g["@type"]) ldTypes.push(String(g["@type"]));
        }
      }
    } catch (e) {
      ldErrors.push(e.message);
    }
  }

  const hasLang = /<html[^>]+lang=["'][^"']+["']/i.test(html);
  const langValue = (html.match(/<html[^>]+lang=["']([^"']+)["']/i) || [])[1] || null;

  const hit = [...body.matchAll(/<(?:a|link)\b[^>]*\bhref=["']([^"']+)["']/gi)].map((m) => m[1]);
  const links = hit.filter((h) => !/^(?:[a-z]+:|\/\/|#)/i.test(h));
  const broken = [];
  for (const href of new Set(links)) {
    const clean = href.split("#")[0].split("?")[0];
    if (!clean) continue;
    let target = clean.startsWith("/") ? join(WEB, clean) : join(WEB, dirname(rel), clean);
    const candidates = [target, `${target}.html`, join(target, "index.html")];
    if (clean.endsWith("/")) candidates.unshift(join(target, "index.html"));
    if (!candidates.some((c) => existsSync(c) && statSync(c).isFile())) broken.push(href);
  }

  return {
    file: rel,
    url,
    isGame,
    title: titleTag ? textOf(titleTag[1]) : null,
    description: meta("description"),
    robots: meta("robots"),
    canonical: canonicalTag ? attr(canonicalTag[0], "href") : null,
    ogTitle: meta("og:title", "property"),
    ogDescription: meta("og:description", "property"),
    ogImage: meta("og:image", "property"),
    ogUrl: meta("og:url", "property"),
    ogType: meta("og:type", "property"),
    twCard: meta("twitter:card"),
    twImage: meta("twitter:image"),
    viewport: meta("viewport"),
    h1s,
    h2Count: h2s,
    imgCount: imgs.length,
    imgNoAlt: imgs.filter((t) => attr(t, "alt") === null).length,
    imgEmptyAlt: imgs.filter((t) => attr(t, "alt") === "").length,
    ldErrors,
    ldTypes,
    hreflang,
    hasLang,
    langValue,
    jsonldCount: jsonld.length,
  };
}

/* ---------- sitemap / robots ---------- */

function sitemapUrls(file) {
  if (!existsSync(file)) return [];
  return [...readFileSync(file, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

const mainSitemap = sitemapUrls(join(WEB, "sitemap.xml"));
const gameSitemap = sitemapUrls(join(WEB, "game/sitemap.xml"));
const robots = existsSync(join(WEB, "robots.txt")) ? readFileSync(join(WEB, "robots.txt"), "utf8") : "";

/* ---------- checks ---------- */

const pages = files.map(pageInfo);
const problems = [];
const warnings = [];
const add = (list, page, rule, detail) => list.push({ page: page.file, url: page.url, rule, detail });

for (const p of pages) {
  const is404 = p.file.endsWith("404.html");

  if (!p.title) add(problems, p, "title-missing", "no <title>");
  else {
    if (p.title.length < 15) add(warnings, p, "title-short", `${p.title.length} chars: ${p.title}`);
    if (p.title.length > 65) add(warnings, p, "title-long", `${p.title.length} chars: ${p.title}`);
  }

  if (!p.description) add(problems, p, "description-missing", "no meta description");
  else {
    if (p.description.length < 50) add(warnings, p, "description-short", `${p.description.length} chars`);
    if (p.description.length > 165) add(warnings, p, "description-long", `${p.description.length} chars`);
  }

  // A 404 page is served for many URLs, so it must not name a canonical.
  if (!p.canonical && !is404) add(problems, p, "canonical-missing", "no canonical");
  else if (p.canonical && p.canonical !== p.url) add(problems, p, "canonical-mismatch", `canonical=${p.canonical} expected=${p.url}`);
  // Vercel runs cleanUrls + trailingSlash:false, so `/about` is the canonical form
  // and `/about/` would 308 back. Nothing to warn about here.

  if (!p.viewport) add(problems, p, "viewport-missing", "no viewport meta");
  if (!p.hasLang) add(problems, p, "lang-missing", "<html> has no lang");
  if (/^zh/i.test(p.langValue || "")) add(warnings, p, "lang-zh", `lang=${p.langValue} on an English page`);

  if (p.h1s.length === 0) add(problems, p, "h1-missing", "no <h1>");
  else if (p.h1s.length > 1) add(problems, p, "h1-multiple", `${p.h1s.length}: ${p.h1s.join(" | ").slice(0, 80)}`);
  else if (!p.h1s[0]) add(problems, p, "h1-empty", "empty <h1>");

  if (!p.ogTitle) add(problems, p, "og-title-missing", "no og:title");
  if (!p.ogDescription) add(problems, p, "og-description-missing", "no og:description");
  if (!p.ogImage) add(problems, p, "og-image-missing", "no og:image");
  if (!p.ogUrl) add(problems, p, "og-url-missing", "no og:url");
  else if (p.ogUrl !== p.url) add(problems, p, "og-url-mismatch", `og:url=${p.ogUrl} expected=${p.url}`);
  if (!p.ogType) add(warnings, p, "og-type-missing", "no og:type");
  if (!p.twCard) add(problems, p, "twitter-card-missing", "no twitter:card");
  if (!p.twImage) add(warnings, p, "twitter-image-missing", "no twitter:image");

  if (p.ldErrors.length) add(problems, p, "jsonld-parse", p.ldErrors.join("; "));
  if (p.imgNoAlt > 0) add(problems, p, "img-alt-missing", `${p.imgNoAlt}/${p.imgCount} <img> without alt`);

  if (is404) {
    if (!/noindex/i.test(p.robots || "")) add(problems, p, "404-indexable", "404 page is not noindex");
    if (p.canonical) add(warnings, p, "404-canonical", "404 page declares a canonical");
  } else if (/noindex/i.test(p.robots || "")) {
    add(problems, p, "noindex-not-404", "indexable page carries noindex");
  }

  const inSitemap = (p.isGame ? gameSitemap : mainSitemap).includes(p.url);
  if (!is404 && !inSitemap) add(problems, p, "not-in-sitemap", p.url);

  if (p.hreflang.includes("zh") || p.hreflang.includes("zh-CN"))
    add(warnings, p, "hreflang-zh", "zh hreflang points at an English URL");
}

/* duplicates */
const byTitle = new Map();
const byDesc = new Map();
for (const p of pages) {
  if (p.title) byTitle.set(p.title, [...(byTitle.get(p.title) || []), p]);
  if (p.description) byDesc.set(p.description, [...(byDesc.get(p.description) || []), p]);
}
for (const [title, list] of byTitle)
  if (list.length > 1) warnings.push({ page: list.map((p) => p.file).join(", "), url: "", rule: "duplicate-title", detail: `${list.length}× ${title}` });
for (const [, list] of byDesc)
  if (list.length > 1) warnings.push({ page: list.map((p) => p.file).join(", "), url: "", rule: "duplicate-description", detail: `${list.length} identical descriptions` });

/* sitemap pointing at pages that do not exist */
const live = new Set(pages.map((p) => p.url));
for (const u of mainSitemap) if (!live.has(u)) problems.push({ page: "website/sitemap.xml", url: u, rule: "sitemap-dead-url", detail: "listed but no page file" });
for (const u of gameSitemap) if (!live.has(u)) problems.push({ page: "website/game/sitemap.xml", url: u, rule: "sitemap-dead-url", detail: "listed but no page file" });

/* robots sanity */
if (!/Sitemap:\s*https:\/\/omc\.network\/sitemap\.xml/.test(robots))
  problems.push({ page: "website/robots.txt", url: "", rule: "robots-sitemap", detail: "does not declare the sitemap" });
if (/Disallow:\s*\/\s*$/m.test(robots))
  problems.push({ page: "website/robots.txt", url: "", rule: "robots-blocks-all", detail: "Disallow: / found" });

/* ---------- output ---------- */

const group = (list) => {
  const m = new Map();
  for (const item of list) m.set(item.rule, [...(m.get(item.rule) || []), item]);
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
};

if (asJson) {
  console.log(JSON.stringify({ pages: pages.length, problems, warnings }, null, 2));
} else {
  if (showAll) {
    console.log(`\npage                                                          title  desc  h1  canon  ld`);
    for (const p of pages) {
      console.log(
        `${p.file.padEnd(58)} ${String(p.title ? p.title.length : 0).padStart(5)} ${String(p.description ? p.description.length : 0).padStart(5)} ${String(p.h1s.length).padStart(3)} ${String(p.canonical ? "ok" : "-").padStart(6)} ${String(p.jsonldCount).padStart(3)}`
      );
    }
  }
  console.log(`\n${pages.length} pages · ${mainSitemap.length} main sitemap urls · ${gameSitemap.length} game sitemap urls`);
  console.log(`problems: ${problems.length} · warnings: ${warnings.length}\n`);
  for (const [rule, list] of group(problems)) {
    console.log(`✗ ${rule}  (${list.length})`);
    for (const it of list.slice(0, 40)) console.log(`    ${it.page}${it.url ? `  → ${it.url}` : ""}  ${it.detail}`);
    if (list.length > 40) console.log(`    … ${list.length - 40} more`);
  }
  for (const [rule, list] of group(warnings)) {
    console.log(`· ${rule}  (${list.length})`);
    for (const it of list.slice(0, 12)) console.log(`    ${it.page}  ${it.detail}`);
    if (list.length > 12) console.log(`    … ${list.length - 12} more`);
  }
}

process.exit(problems.length ? 1 : 0);
