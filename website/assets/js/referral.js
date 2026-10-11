/* ============================================================
   Omniverse Compute (OMC) — Airdrop referral ("invite → extra entries")
   Loaded on /airdrop only, after wallet.js and before main.js.

   What it does
   - Gives every connected wallet a deterministic invite code derived from
     its own address, so no server is needed just to issue one.
   - Builds a share link:  /airdrop?ref=OMC-XXXXXXXX  (plus UTM tags).
   - Attributes the invitee on arrival (?ref=) and credits the inviter when
     the invitee registers their FIRST entry.
   - The reward is EXTRA ENTRY SLOTS, never tokens:
       base 5 entries/wallet + up to 5 referral entries = max 10 (200 OMC).
     The pool (20,000,000 OMC = 1,000,000 × 20) is unchanged — referrals
     only redistribute slots inside it, so the token budget is zero.
   - STRICTLY ONE LAYER: only direct invites count. No recursion, no
     downlines, no team bonuses, and no payment of any kind.

   Server-side
   - Counting across devices needs a backend. Set `endpoint` to a URL that
     accepts  POST {code, address, ts}  to record a referral server-side.
   - With no endpoint the card runs in PREVIEW mode: the mechanic is drawn
     with illustrative numbers and a "Preview" chip, mirroring the home-page
     ticker's preview feed (airdrop-stats.js). The invite link itself is
     real either way.
   ============================================================ */

window.OMC_REFERRAL = {
  endpoint: "",                                  // ← real referral API (optional)
  baseMax: 5,                                    // base entries per wallet (public promise)
  bonusMax: 5,                                   // max extra entries earned by inviting
  perEntry: 20,                                  // OMC per entry
  shareUrl: "https://omc.network/airdrop",
  utm: "utm_source=referral&utm_medium=social&utm_campaign=airdrop_invite"
};

(function () {
  "use strict";

  var CFG = window.OMC_REFERRAL;
  var LS_IN = "omc_ref_in_v1";         // { code, ts } — who invited this browser
  var LS_LEDGER = "omc_ref_ledger_v1"; // { "OMC-XXXXXXXX": n } — credits earned
  var LS_CREDITED = "omc_ref_credited_v1"; // the invitee already credited its inviter

  var BASE_MAX = Number(CFG.baseMax) || 5;
  var MAX_BONUS = Number(CFG.bonusMax) || 5;
  var SHARE_URL = CFG.shareUrl || "https://omc.network/airdrop";
  var UTM = CFG.utm || "utm_source=referral";
  var CODE_RE = /^OMC-[0-9A-F]{8}$/;

  function T(k, p) { return window.i18nT ? window.i18nT(k, p) : k; }
  function $(id) { return document.getElementById(id); }
  function set(id, v) { var el = $(id); if (el) el.textContent = v; }

  function readJSON(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; }
    catch (e) { return d; }
  }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function address() { return window.OMCWallet ? window.OMCWallet.address() : ""; }
  function codeFor(a) { return a ? ("OMC-" + a.slice(2, 10).toUpperCase()) : ""; }
  function myCode() { return codeFor(address()); }
  function shareLink(code) { return SHARE_URL + "?ref=" + encodeURIComponent(code) + "&" + UTM; }

  /* deterministic hash → stable preview numbers for a given code */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function ledger() { var l = readJSON(LS_LEDGER, null); return (l && typeof l === "object") ? l : {}; }
  function realCount(code) { return code ? (Number(ledger()[code]) || 0) : 0; }
  function previewCount(code) { return code ? (1 + (hash(code) % 3)) : 0; }  /* 1..3, illustrative */

  function isPreview() { return !CFG.endpoint; }
  function countFor(code) { return isPreview() ? previewCount(code) : realCount(code); }
  function bonusFor(code) { return Math.max(0, Math.min(MAX_BONUS, countFor(code))); }

  /* ------------------------------------------------------------
     Public API — main.js reads the cap from here, so the referral
     bonus raises the per-wallet limit without touching main.js.
     ------------------------------------------------------------ */
  window.OMCReferral = {
    baseMax: BASE_MAX,
    bonusMax: MAX_BONUS,
    preview: isPreview,
    code: function () { return myCode(); },
    link: function () { var c = myCode(); return shareLink(c || "OMC-XXXXXXXX"); },
    count: function () { var c = myCode(); return c ? countFor(c) : 0; },
    bonus: function () { var c = myCode(); return c ? bonusFor(c) : 0; },
    totalCap: function () { var c = myCode(); return BASE_MAX + (c ? bonusFor(c) : 0); }
  };

  /* ---------- referral capture (invitee side) ---------- */
  function captureIncoming() {
    var m = /[?&]ref=([^&#]+)/.exec(location.search);
    if (!m) return;
    var code = decodeURIComponent(m[1]).trim().toUpperCase();
    if (!CODE_RE.test(code)) return;
    if (readJSON(LS_IN, null)) return;            /* first touch wins */
    writeJSON(LS_IN, { code: code, ts: Date.now() });
  }

  function post(code) {
    if (!CFG.endpoint) return;
    try {
      fetch(CFG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code, address: address(), ts: Date.now() })
      }).catch(function () {});
    } catch (e) {}
  }

  /* Credit the inviter on the invitee's FIRST registered entry.
     One credit per browser; self-referral is refused. */
  document.addEventListener("omc:participated", function (e) {
    var d = (e && e.detail) || {};
    if (!d.first) return;
    var inc = readJSON(LS_IN, null);
    if (!inc || !CODE_RE.test(inc.code)) return;
    if (readJSON(LS_CREDITED, false)) return;
    if (inc.code === myCode()) return;             /* no self-referral */
    var l = ledger();
    l[inc.code] = (Number(l[inc.code]) || 0) + 1;
    writeJSON(LS_LEDGER, l);
    writeJSON(LS_CREDITED, true);
    post(inc.code);
    render();
  });

  /* ---------- render ---------- */
  function render() {
    var card = $("refCard");
    if (!card) return;
    var code = myCode();
    var conn = !!code;
    card.classList.toggle("locked", !conn);

    var link = $("refLink");
    if (link) link.textContent = shareLink(code || "OMC-XXXXXXXX");
    set("refCode", conn ? code : "—");
    var copyBtn = $("refCopy");
    if (copyBtn) copyBtn.disabled = !conn;

    var n = conn ? countFor(code) : 0;
    var bonus = conn ? bonusFor(code) : 0;
    set("refFriends", String(n));
    set("refBonus", "+" + bonus);
    set("refCap", (BASE_MAX + bonus) + " / " + (BASE_MAX + MAX_BONUS));

    var rail = $("refRail");
    if (rail) {
      if (!rail.children.length) {
        for (var i = 0; i < MAX_BONUS; i++) {
          var s = document.createElement("span");
          s.className = "ref-slot";
          rail.appendChild(s);
        }
      }
      for (var j = 0; j < rail.children.length; j++) {
        rail.children[j].classList.toggle("on", j < bonus);
      }
    }

    var chip = $("refChip"); if (chip) chip.hidden = !isPreview();
    var note = $("refNote"); if (note) note.hidden = !isPreview();
    var lk = $("refLocked"); if (lk) lk.hidden = conn;
  }

  function renderBanner() {
    var b = $("refBanner");
    if (!b) return;
    var inc = readJSON(LS_IN, null);
    if (!inc || !CODE_RE.test(inc.code)) { b.hidden = true; return; }
    set("refFrom", inc.code);
    b.hidden = false;
  }

  /* ---------- copy ---------- */
  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  function boot() {
    if (!$("refCard")) return;
    captureIncoming();
    render();
    renderBanner();

    var copyBtn = $("refCopy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var code = myCode();
        if (!code) { if (window.showToast) window.showToast(T("ref.need_wallet")); return; }
        var done = function () { if (window.showToast) window.showToast(T("ref.copied")); };
        var text = shareLink(code);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
        } else fallbackCopy(text, done);
      });
    }

    document.addEventListener("omc:wallet", render);
    document.addEventListener("i18n:changed", function () { render(); renderBanner(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
