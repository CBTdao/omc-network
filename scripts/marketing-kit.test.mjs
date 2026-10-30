/**
 * The distribution kit and the share cards are the only places where the
 * campaign's numbers leave the repository and get forwarded into places we do
 * not control. A stale figure there cannot be corrected later, so it is bound
 * to contracts/params.json here.
 *
 * The cards are checked byte-wise (PNG header) rather than by opening them:
 * a truncated or wrong-size image is the one failure that looks fine in a
 * filename and ugly in a group chat.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const params = JSON.parse(readFileSync(join(root, "contracts/params.json"), "utf8"));
const a = params.airdrop;

const KIT = join(root, "docs/marketing/distribution-kit-zh.md");
const CARDS = join(root, "docs/marketing/cards");

const kit = readFileSync(KIT, "utf8");
const n = (v) => v.toLocaleString("en-US");

test("every campaign figure in the kit matches params.json", () => {
  for (const fact of [n(a.pool), n(a.poolSlots), `${a.perEntry} OMC`, `${a.claimCost.feeBnb} BNB`, a.claimOpens]) {
    assert.ok(kit.includes(fact), `distribution kit is missing or has drifted on: ${fact}`);
  }
});

test("the kit states the fee as a processing charge, not a price of entry", () => {
  assert.match(kit, /处理手续费/, "the fee must be named as a processing charge");
  for (const banned of ["入场费", "entrance fee", "paid airdrop", "必须购买", "购买代币"]) {
    assert.ok(!kit.includes(banned), `kit reintroduces the disqualifying framing: ${banned}`);
  }
});

test("the kit gives a way to measure the funnel, not just a to-do list", () => {
  // Without this the whole plan runs blind: the site has no analytics, so the
  // ledger endpoint is the only ground truth for whether a channel worked.
  assert.match(kit, /\/api\/airdrop\/summary/, "kit must name the ledger endpoint");
  assert.match(kit, /entries/, "kit must say which field to watch");
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

test("the card generator and the kit agree that the fee is charged at claim", () => {
  const gen = readFileSync(join(root, "website/tools/build_share_card.py"), "utf8");
  assert.match(gen, /claimCost/, "card figures must be read from params, not typed in");
  assert.match(gen, /处理手续费|processing/i, "the card must label the fee, not just show a number");
});
