import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const load = (path, name) => {
  const sandbox = { window: {} };
  runInNewContext(read(path), sandbox);
  return sandbox.window.I18N[name];
};

const EN = load("website/assets/js/lang/en.js", "en");
const ZH = load("website/assets/js/lang/zh.js", "zh");
const NEWS = (() => {
  const sandbox = { window: {} };
  runInNewContext(read("website/assets/data/news.js"), sandbox);
  return sandbox.window.OMC_NEWS;
})();

/**
 * Keys as they are written, in file order.
 *
 * Loading the file cannot find a duplicate: the last definition silently wins
 * and the resulting object has one key either way. The only way to see the
 * collision is to read the source, which is why this parses text rather than
 * the object.
 */
const declaredKeys = (path) => [...read(path).matchAll(/^\s*"([^"]+)"\s*:/gm)].map((m) => m[1]);

test("no dictionary key is defined twice", () => {
  // This caught a real one: the airdrop announcement took nw16, then the n<N>
  // content pipeline published an unrelated post under the same pair. Both
  // articles rendered with the newer title and nothing failed anywhere.
  for (const path of ["website/assets/js/lang/en.js", "website/assets/js/lang/zh.js"]) {
    const keys = declaredKeys(path);
    const seen = new Set();
    const dupes = [];
    for (const k of keys) {
      if (seen.has(k)) dupes.push(k);
      seen.add(k);
    }
    assert.deepEqual(dupes, [], `${path} defines these keys more than once: ${dupes.join(", ")}`);
  }
});

test("the two dictionaries stay symmetrical", () => {
  const en = Object.keys(EN).sort();
  const zh = Object.keys(ZH).sort();
  const missing = en.filter((k) => !(k in ZH));
  const extra = zh.filter((k) => !(k in EN));
  assert.deepEqual(missing, [], `missing from zh: ${missing.join(", ")}`);
  assert.deepEqual(extra, [], `missing from en: ${extra.join(", ")}`);
  assert.ok(en.length > 900, `expected the full dictionary, got ${en.length} keys`);
});

test("news ids are unique", () => {
  const ids = NEWS.map((n) => n.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  // Length rather than deepEqual: NEWS comes from another realm, and strict
  // deepEqual compares prototypes, so two empty arrays from different realms
  // are not equal. That is a property of the test, not of the data.
  assert.equal(dupes.length, 0, `duplicate news id: ${dupes.join(", ")}`);
});

test("every news item resolves its own keys, in both languages", () => {
  for (const item of NEWS) {
    for (const field of ["t", "d"]) {
      const key = item[field];
      assert.ok(key, `${item.id} has no ${field} key`);
      assert.ok(EN[key], `${item.id}: en.js is missing "${key}"`);
      assert.ok(ZH[key], `${item.id}: zh.js is missing "${key}"`);
    }
    // The title and body must not be the same key, and must not be each
    // other's -- a copy-paste slip renders a headline where the summary goes.
    assert.notEqual(item.t, item.d, `${item.id} uses one key for both fields`);
  }
});

test("news entries do not borrow another entry's keys", () => {
  // The failure mode this guards: two items pointing at the same key pair, so
  // one of them silently renders the other's text.
  const claims = new Map();
  for (const item of NEWS) {
    for (const field of ["t", "d"]) {
      const key = item[field];
      if (!claims.has(key)) claims.set(key, []);
      claims.get(key).push(item.id);
    }
  }
  const shared = [...claims.entries()].filter(([, ids]) => ids.length > 1);
  assert.deepEqual(shared.map(([k, ids]) => `${k} <- ${ids.join("/")}`), []);
});

test("the announcement is pinned and the static fallback points at its keys", () => {
  // Other items are pinned on purpose too -- n1 and n12 are pinned upstream --
  // so this asserts ours is one of them and carries its own keys, not that it
  // is the only pinned item.
  const pinned = NEWS.find((n) => n.id === "airdrop-2026");
  assert.ok(pinned, "the airdrop announcement must be in the feed");
  assert.equal(pinned.pin, true, "the announcement must be pinned");
  assert.equal(pinned.t, "nw.announce.t");
  assert.equal(pinned.d, "nw.announce.d");
  // news.html ships a static copy of the pinned item because the list is
  // otherwise rendered by JS and a crawler would see an empty div.
  const html = read("website/news.html");
  assert.match(html, /data-i18n="nw\.announce\.t"/, "the static pinned title must use the item's key");
  assert.match(html, /data-i18n="nw\.announce\.d"/, "the static pinned summary must use the item's key");
});
