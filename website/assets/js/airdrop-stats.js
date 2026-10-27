/* ============================================================
   Omniverse Compute (OMC) — Airdrop progress ticker (home page)

   Data source
   - OMC_STATS.endpoint: the ledger this widget reads. It defaults to
     /api/airdrop/summary, which returns { totals: { entries, wallets } }.
     Entries are the unit the pool is denominated in, so `entries` is what
     "claimed" means here.
   - If the ledger cannot be reached the numbers render blank and labelled
     ("Not connected"). They are never estimated: inventing progress on a
     campaign with a hard 1,000,000-slot ceiling tells a visitor the pool is
     fuller than it is, which is the opposite of first-come-first-served.
   - Demonstration data still exists, but only at ?ticker=preview, and the UI
     marks it as preview. It is NOT on-chain data and is never a fallback.

   Two phases
   - Before the claim window opens: honest zero-state — the pool rules
     scroll in the window instead of fabricated claims.
   - After it opens: claims / participants / latest participations.
   - Add ?ticker=preview to the URL to preview the live layout early.
   ============================================================ */

window.OMC_STATS = {
  /* The ledger the campaign writes to. It returns running totals — entries and
     wallets — which is everything this ticker claims to show.
     An empty endpoint used to mean "generate a preview". It now means "say the
     ledger is not connected", because invented progress on a campaign with a hard
     1,000,000-slot ceiling is a number a visitor will act on: it makes a pool look
     nearly full when nobody has registered. */
  endpoint: "/api/airdrop/summary",
  pool: 20000000,                                // OMC reserved for the airdrop
  perEntry: 20,                                  // OMC per entry
  totalEntries: 1000000,                         // pool ÷ perEntry
  /* These two instants gate the CLAIM window — which is what this ticker
     reports — not participation. The claim window opens together with TGE,
     mainnet and staking on 2027-01-01 00:00 (UTC+8) and runs three months,
     ending 2027-03-31 23:59:59 (UTC+8). Participation (completing the tasks
     and registering entries) is open earlier; see the two-gate note in
     main.js. Keeping both instants in the +08:00 offset is deliberate: every
     page shows the date in UTC+8, so a visitor in another timezone still sees
     the same opening day. */
  startAt: "2027-01-01T00:00:00+08:00",
  endAt: "2027-03-31T23:59:59+08:00",
  refreshMs: 6000,                               // poll / advance cadence
  maxRows: 10
};

(function () {
  var root = document.getElementById("airdropTicker");
  if (!root) return;

  var CFG = window.OMC_STATS;
  var START = Date.parse(CFG.startAt);
  var END = Date.parse(CFG.endAt);
  var PREVIEW = /[?&]ticker=preview\b/.test(location.search);

  var state = { claimed: 0, participants: 0, source: "pre", events: [], updatedAt: 0 };

  function T(k, p) { return window.i18nT ? window.i18nT(k, p) : k; }
  function nf(n) { return Number(n || 0).toLocaleString(window.i18nCurrent ? langTag() : "en-US"); }
  function langTag() {
    var l = window.i18nCurrent ? window.i18nCurrent() : "en";
    return { en: "en-US", zh: "zh-CN" }[l] || "en-US";
  }

  /* ---------- deterministic pseudo-random helpers ---------- */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rand(seed) {
    var x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }
  function fakeAddress(seed) {
    var hex = "0123456789abcdef", out = "0x";
    for (var i = 0; i < 40; i++) out += hex[Math.floor(rand(seed + i * 7.3) * 16)];
    return out;
  }

  /* ---------- preview feed ---------- */
  function buildPreview() {
    var now = Date.now();
    var days = (START - now) / 86400000;
    var lead = Math.max(0, Math.min(1, 1 - days / 45));          // ramps towards launch
    var rate = 6200 + 5200 * lead;                               // claims / day
    var day = Math.max(0, (now - START) / 86400000);
    var claimed = Math.min(Math.round(CFG.totalEntries * 0.62), Math.round(rate * day));
    state.source = "preview";
    state.claimed = claimed;
    state.participants = Math.round(claimed * 0.74);
    state.updatedAt = now;
    state.events = [];
    for (var i = 0; i < CFG.maxRows; i++) {
      var seed = Math.floor(now / 9000) * 31 + i;
      state.events.push({
        addr: fakeAddress(seed),
        amount: CFG.perEntry,
        ts: now - Math.round((i * 47 + rand(seed) * 40) * 1000)
      });
    }
  }

  /* ---------- real feed ---------- */
  function loadRemote(cb) {
    fetch(CFG.endpoint, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        /* Field names are the API's, not this file's: the ledger reports `entries`
           and `wallets`, because "entries" is the unit the pool is denominated in.
           A response without them means the ledger is not connected — a state to
           show, not one to paper over with generated numbers. */
        var t = j && j.totals;
        if (!t || typeof t.entries !== "number") { cb(false); return; }
        state.source = "chain";
        state.claimed = Number(t.entries || 0);
        state.participants = Number(t.wallets || 0);
        state.updatedAt = Date.now();
        /* There is no public per-claim feed. An empty list renders as an empty
           list; it must not be filled with addresses nobody claimed from. */
        state.events = [];
        cb(true);
      })
      .catch(function () { cb(false); });
  }

  /* Nothing to show, and saying so. */
  function offline() {
    state.source = "unavailable";
    state.claimed = 0;
    state.participants = 0;
    state.events = [];
    render();
  }

  /* ---------- time rendering ---------- */
  function ago(ts) {
    var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 5) return T("tk.now");
    if (s < 60) return T("tk.ago_s", { n: s });
    if (s < 3600) return T("tk.ago_m", { n: Math.floor(s / 60) });
    if (s < 86400) return T("tk.ago_h", { n: Math.floor(s / 3600) });
    return T("tk.ago_s", { n: Math.floor(s / 86400) }) + "d";
  }

  /* ---------- render ---------- */
  function phase() {
    var now = Date.now();
    if (now < START) return "pre";
    if (now > END) return "ended";
    return "live";
  }

  function renderNumbers() {
    var pct = state.claimed / CFG.totalEntries * 100;
    var connected = state.source !== "unavailable";
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    set("tkClaimed", connected ? nf(state.claimed) : "—");
    set("tkParts", connected ? nf(state.participants) : "—");
    set("tkLeft", connected ? nf(Math.max(0, CFG.totalEntries - state.claimed)) : "—");
    set("tkPct", connected ? pct.toFixed(pct >= 1 ? 2 : 3) + "%" : "—");
    var fill = document.getElementById("tkFill");
    if (fill) fill.style.width = (connected ? Math.min(100, pct) : 0).toFixed(3) + "%";

    /* the visitor's own progress, from the local airdrop state */
    var mine = "—";
    try {
      var entries = (JSON.parse(localStorage.getItem("omc_airdrop_v1")) || {}).entries || [];
      mine = entries.length ? entries.length * CFG.perEntry + " OMC" : (window.OMCWallet && OMCWallet.isConnected() ? "0 OMC" : "—");
    } catch (e) {}
    set("tkMine", mine);

    var chip = root.querySelector(".tk-demo");
    if (chip) chip.hidden = state.source !== "preview";
    var live = root.querySelector(".tk-live");
    if (live) {
      if (state.source === "chain") live.textContent = T("tk.live");
      else if (state.source === "preview") live.textContent = T("tk.demo");
      else live.textContent = T("tk.offline");
    }
    var note = document.getElementById("tkNote");
    if (note) {
      /* The note is the only place that says the figures above are not coming
         from the ledger, so it has to appear whenever that is true. */
      var warn = state.source === "preview" || state.source === "unavailable";
      note.hidden = !warn;
      if (warn) note.textContent = T(state.source === "preview" ? "tk.demo_note" : "tk.offline_note");
    }

    var before = document.getElementById("tkBefore");
    if (before) before.hidden = phase() !== "pre";
  }

  function renderFeed() {
    var box = document.getElementById("tkFeed");
    if (!box) return;
    var ph = phase();

    /* Before the claim window opens the pool rules scroll instead of
       fabricated claims */
    if (ph === "pre" && !PREVIEW && state.source !== "chain") {
      box.innerHTML = ["ad.chip_start", "ad.chip_claim", "ad.chip_per", "ad.chip_wallet", "ad.chip_daily"]
        .map(function (k) { return '<div class="tk-row rule">' + T(k) + "</div>"; })
        .join("");
      return;
    }

    /* Nothing from the ledger: say so, and say nothing else. */
    if (state.source === "unavailable") {
      box.innerHTML = '<div class="tk-row rule">' + T("tk.offline_note") + "</div>";
      return;
    }

    /* Connected but no rows: the ledger publishes totals, not a per-claim feed, so
       this is the normal live state rather than an error. */
    if (!state.events.length) {
      box.innerHTML = '<div class="tk-row rule">' + T("tk.no_feed") + "</div>";
      return;
    }

    var rows = state.events.map(function (ev) {
      return '<div class="tk-row">' +
        '<span class="tk-a">' + (ev.addr ? ev.addr.slice(0, 6) + "…" + ev.addr.slice(-4) : "0x…") + "</span>" +
        "<b>+" + nf(ev.amount || CFG.perEntry) + " OMC</b>" +
        "<i>" + ago(ev.ts) + "</i>" +
        "</div>";
    });
    box.innerHTML = rows.join("");
  }

  function render() { renderNumbers(); renderFeed(); }

  /* ---------- ticking ---------- */
  function tickTimes() {
    /* refresh only the relative timestamps so rows do not flicker */
    var box = document.getElementById("tkFeed");
    if (!box) return;
    var times = box.querySelectorAll(".tk-row i");
    if (times.length !== state.events.length) return;
    for (var i = 0; i < times.length; i++) times[i].textContent = ago(state.events[i].ts);
  }

  function advance() {
    var p = phase();
    if (p === "pre") { state.claimed = 0; state.participants = 0; state.events = []; state.source = "pre"; render(); return; }
    /* Demonstration mode is opt-in, by URL, and labelled as such in the UI. It is
       never the fallback: a fallback that invents numbers is a fallback that lies
       exactly when the ledger is broken. */
    if (PREVIEW) { buildPreview(); render(); return; }
    if (!CFG.endpoint) { offline(); return; }
    loadRemote(function (ok) { if (ok) render(); else offline(); });
  }

  function boot() {
    advance();
    render();
    setInterval(function () { if (phase() === "live") advance(); else tickTimes(); }, CFG.refreshMs);
    setInterval(tickTimes, 1000);
    document.addEventListener("i18n:changed", render);
    document.addEventListener("omc:wallet", renderNumbers);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
