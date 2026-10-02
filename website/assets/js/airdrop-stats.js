/* ============================================================
   Omniverse Compute (OMC) — Airdrop progress ticker (home page)

   Data source
   - OMC_STATS.endpoint: leave "" for the built-in preview feed.
     Set it to a JSON URL returning
       { claimed: 12345, participants: 9000, updatedAt: 1700000000,
         events: [{ addr: "0x…", amount: 20, ts: 1700000000000 }] }
     and the ticker switches to real data automatically (the
     "preview data" chip hides itself).
   - With no endpoint the feed is generated locally from a
     deterministic pseudo-random source and is clearly marked as
     preview data in the UI. It is NOT on-chain data.

   Two phases
   - Before the airdrop opens: honest zero-state — countdown plus the
     pool rules scrolling in the window.
   - After it opens: claims / participants / latest participations.
   - Add ?ticker=preview to the URL to preview the live layout early.
   ============================================================ */

window.OMC_STATS = {
  endpoint: "",                                  // ← real data feed (optional)
  pool: 20000000,                                // OMC reserved for the airdrop
  perEntry: 20,                                  // OMC per entry
  totalEntries: 1000000,                         // pool ÷ perEntry
  startAt: "2026-11-01T00:00:00+08:00",
  endAt: "2026-12-31T23:59:59+08:00",
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
    return { en: "en-US", zh: "zh-CN", ja: "ja-JP", es: "es-ES", ko: "ko-KR", pt: "pt-BR", fr: "fr-FR" }[l] || "en-US";
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
        state.source = "chain";
        state.claimed = Number(j.claimed || 0);
        state.participants = Number(j.participants || state.claimed);
        state.updatedAt = Number(j.updatedAt || Math.floor(Date.now() / 1000)) * (String(j.updatedAt).length > 10 ? 1 : 1000);
        state.events = (j.events || []).slice(0, CFG.maxRows);
        cb(true);
      })
      .catch(function () { cb(false); });
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
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    set("tkClaimed", nf(state.claimed));
    set("tkParts", nf(state.participants));
    set("tkLeft", nf(Math.max(0, CFG.totalEntries - state.claimed)));
    set("tkPct", pct.toFixed(pct >= 1 ? 2 : 3) + "%");
    var fill = document.getElementById("tkFill");
    if (fill) fill.style.width = Math.min(100, pct).toFixed(3) + "%";

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
      else live.textContent = T("tk.demo");
    }
    var note = document.getElementById("tkNote");
    if (note) note.hidden = state.source !== "preview";

    var before = document.getElementById("tkBefore");
    if (before) before.hidden = phase() !== "pre";
  }

  function renderFeed() {
    var box = document.getElementById("tkFeed");
    if (!box) return;
    var ph = phase();

    /* Before launch the pool rules scroll instead of fabricated claims */
    if (ph === "pre" && !PREVIEW && state.source !== "chain") {
      box.innerHTML = ["ad.chip_start", "ad.chip_per", "ad.chip_wallet", "ad.chip_daily", "ad.chip_tge"]
        .map(function (k) { return '<div class="tk-row rule">' + T(k) + "</div>"; })
        .join("");
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
    if (CFG.endpoint) {
      loadRemote(function (ok) { if (!ok) { buildPreview(); } render(); });
      return;
    }
    buildPreview();
    render();
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
