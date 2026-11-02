/**
 * The messaging doc and the share cards are the only places where the
 * campaign's numbers leave the repository and get forwarded into places we do
 * not control. A stale figure there cannot be corrected later, so it is bound
 * to contracts/params.json here.
 *
 * The repository is public and every page's footer links into it, which is why
 * the doc is copy and not plan: a line like "the people claiming are gambling"
 * reads as candour when it is written for yourself, and as an admission when a
 * stranger finds it before you do. The strategy plan lives outside the repo.
 *
 * The cards are checked byte-wise (PNG header) rather than by opening them:
 * a truncated or wrong-size image is the one failure that looks fine in a
 * filename and ugly in a group chat.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const params = JSON.parse(readFileSync(join(root, "contracts/params.json"), "utf8"));
const a = params.airdrop;

const KIT = join(root, "docs/marketing/airdrop-messaging-en-zh.md");
const CARDS = join(root, "website/assets/img/press");

const kit = readFileSync(KIT, "utf8");
const n = (v) => v.toLocaleString("en-US");

test("every campaign figure in the messaging doc matches params.json", () => {
  for (const fact of [n(a.pool), n(a.poolSlots), `${a.perEntry} OMC`, `${a.claimCost.feeBnb} BNB`, a.claimOpens]) {
    assert.ok(kit.includes(fact), `messaging doc is missing or has drifted on: ${fact}`);
  }
});

test("the public doc carries copy, not plan", () => {
  // Every page footer links to blob/main/contracts/params.json, so docs/ is one
  // click from the site. These lines are honest when written for yourself and
  // self-defeating when a critic finds them first.
  for (const leak of ["在赌", "照抄", "临场", "自己给自己贴", "否决", "omc-internal"]) {
    assert.ok(!kit.includes(leak), `public doc leaks internal reasoning: ${leak}`);
  }
  assert.ok(
    !existsSync(join(root, "docs/marketing/distribution-kit-zh.md")),
    "the strategy plan belongs outside the repository",
  );
});

test("the doc states the fee as a processing charge, not a price of entry", () => {
  assert.match(kit, /处理手续费/, "the fee must be named as a processing charge");
  for (const banned of ["入场费", "entrance fee", "paid airdrop", "必须购买", "购买代币"]) {
    assert.ok(!kit.includes(banned), `doc reintroduces the disqualifying framing: ${banned}`);
  }
});

test("the doc gives a way to measure the funnel, not just a to-do list", () => {
  // Without this the whole plan runs blind: the site has no analytics, so the
  // ledger endpoint is the only ground truth for whether a channel worked.
  assert.match(kit, /\/api\/airdrop\/summary/, "doc must name the ledger endpoint");
  assert.match(kit, /entries/, "doc must say which field to watch");
});

test("the share cards exist at the size their names claim", () => {
  const expected = {
    "omc-airdrop-zh-1200x630.png": [1200, 630],
    "omc-airdrop-zh-1080x1080.png": [1080, 1080],
    "omc-airdrop-en-1200x630.png": [1200, 630],
  };
  for (const [name, [w, h]] of Object.entries(expected)) {
    const path = join(CARDS, name);
    assert.ok(existsSync(path), `${name} is missing — run python website/tools/build_share_card.py`);

    const buf = readFileSync(path);
    assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${name} is not a PNG`);
    // IHDR width/height are big-endian uint32 at offsets 16 and 20.
    assert.equal(buf.readUInt32BE(16), w, `${name} width`);
    assert.equal(buf.readUInt32BE(20), h, `${name} height`);
    assert.ok(buf.length > 20_000, `${name} looks empty (${buf.length} bytes)`);
  }
});

test("the card generator and the doc agree that the fee is charged at claim", () => {
  const gen = readFileSync(join(root, "website/tools/build_share_card.py"), "utf8");
  assert.match(gen, /claimCost/, "card figures must be read from params, not typed in");
  assert.match(gen, /处理手续费|processing/i, "the card must label the fee, not just show a number");
});

/* ---------------------------------------------------------------------------
 * The preview, not the page, is what a timeline shows. A card that 404s or a
 * declared size that disagrees with the file both render as the grey box, and
 * a grey box is the one failure nobody reports because nobody sees it.
 * ------------------------------------------------------------------------- */

const WEB = join(root, "website");
const SITE = "https://omc.network/";

function htmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") htmlFiles(p, out);
    } else if (entry.name.endsWith(".html")) {
      out.push(p);
    }
  }
  return out;
}

const metaContent = (html, attr, name) => {
  const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`));
  return m ? m[1] : null;
};

const localPath = (url) =>
  url.startsWith(SITE) ? join(WEB, url.slice(SITE.length).split("?")[0]) : null;

test("every og:image resolves to a file the site actually serves", () => {
  const missing = [];
  for (const file of htmlFiles(WEB)) {
    const html = readFileSync(file, "utf8");
    for (const [attr, name] of [["property", "og:image"], ["name", "twitter:image"]]) {
      const url = metaContent(html, attr, name);
      if (!url) continue;
      const local = localPath(url);
      if (local && !existsSync(local)) missing.push(`${file}: ${name} -> ${url}`);
    }
  }
  assert.deepEqual(missing, [], "share cards referenced but not on disk");
});

test("a card's declared size matches the file", () => {
  // Replacing a 1200x630 card with a 1080x1080 one and leaving the meta alone
  // makes the crawler letterbox or crop; the page still looks fine.
  for (const file of htmlFiles(WEB)) {
    const html = readFileSync(file, "utf8");
    const url = metaContent(html, "property", "og:image");
    const local = url && localPath(url);
    if (!local || !existsSync(local) || !local.endsWith(".png")) continue;
    const buf = readFileSync(local);
    const w = metaContent(html, "property", "og:image:width");
    const h = metaContent(html, "property", "og:image:height");
    if (w) assert.equal(Number(w), buf.readUInt32BE(16), `${file}: og:image:width`);
    if (h) assert.equal(Number(h), buf.readUInt32BE(20), `${file}: og:image:height`);
  }
});

test("the airdrop page is previewed with its own card, in the reader's language", () => {
  // /airdrop is the link every post points at. Sharing it with the wordmark
  // card means the preview says "Decentralised GPU Infrastructure" and carries
  // no figure, so the one line of text a timeline shows answers nothing.
  const en = readFileSync(join(WEB, "airdrop.html"), "utf8");
  const zh = readFileSync(join(WEB, "zh/airdrop.html"), "utf8");

  assert.match(metaContent(en, "property", "og:image"), /omc-airdrop-en-1200x630\.png$/);
  assert.match(metaContent(zh, "property", "og:image"), /omc-airdrop-zh-1200x630\.png$/);
  assert.equal(
    metaContent(zh, "name", "twitter:image"),
    metaContent(zh, "property", "og:image"),
    "og:image and twitter:image must not disagree, or X and Telegram show different cards",
  );
  // Alt text is the card's text alternative; an English alt on the Chinese page
  // is the same failure as an English card, just quieter.
  assert.match(metaContent(zh, "property", "og:image:alt"), /[\u4e00-\u9fff]/);
});

