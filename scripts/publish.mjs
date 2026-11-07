#!/usr/bin/env node
/**
 * One command to publish a content change from a workstation.
 *
 * The GitHub Actions job runs the same chain on every push to main. This script
 * exists for the cases where the job is not available (no workflow scope on the
 * deploy token, working offline, or wanting to see the diff before pushing) and
 * for the one thing CI deliberately does not hold: the Bing API key.
 *
 *   node scripts/publish.mjs             # rebuild, verify, then notify
 *   node scripts/publish.mjs --no-push   # rebuild + verify only (no network)
 *
 * The order is load-bearing. build_news.py writes the pages and feeds,
 * build_llms_full.py reads those pages, inject_facts.py stamps dateModified and
 * the identity block, and build_sitemap.py reads those stamps for lastmod.
 * Running the sitemap builder earlier produces dates that describe the previous
 * version of every page.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PY = process.platform === "win32" ? "python" : "python3";
const noPush = process.argv.includes("--no-push");

const steps = [
  ["rebuild news pages and feeds", PY, ["website/tools/build_news.py"]],
  ["rebuild full-text dumps", PY, ["website/tools/build_llms_full.py"]],
  ["stamp facts and identity", PY, ["website/tools/inject_facts.py"]],
  ["rebuild sitemap", PY, ["website/tools/build_sitemap.py"]],
  ["verify news", PY, ["website/tools/build_news.py", "--check"]],
  ["verify facts", PY, ["website/tools/inject_facts.py", "--check"]],
  ["verify sitemap", PY, ["website/tools/build_sitemap.py", "--check"]],
  ["run Node guards", process.execPath, [
    "--test", "scripts/seo-coverage.test.mjs", "scripts/news-static.test.mjs",
    "scripts/entity-identity.test.mjs", "scripts/i18n-integrity.test.mjs",
  ]],
];

if (!noPush) {
  steps.push(["IndexNow", process.execPath, ["scripts/indexnow.mjs"]]);
  steps.push(["Bing Webmaster submission", process.execPath, ["scripts/bing-submit.mjs"]]);
}

for (const [label, cmd, args] of steps) {
  process.stdout.write(`\n==> ${label}\n`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.error) {
    console.error(`FAIL ${label}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`FAIL ${label} (exit ${r.status}) — chain stopped.`);
    process.exit(r.status || 1);
  }
}

console.log("\nPublish chain complete.");
console.log(noPush
  ? "Re-run without --no-push (or let CI do it) to notify the crawlers."
  : "Read back the real crawl state with: node scripts/bing-submit.mjs --status");
