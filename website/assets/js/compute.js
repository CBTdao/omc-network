/* ============================================================
   Omniverse Compute (OMC) — /compute (AI Compute Station) controller
   The requester-side page: pick a tier, size the job, see the quote,
   escrow it on chain. Reads the tier ladder straight out of
   OMCStaking so this page and /stake can never disagree.
   ============================================================ */
(function () {
  "use strict";

  var C = window.OMCCompute;
  if (!C) return;

  function T(k) { return window.i18nT ? window.i18nT(k) : k; }
  function $(id) { return document.getElementById(id); }
  function set(id, txt) { var e = $(id); if (e) e.textContent = txt; }
  function html(id, v) { var e = $(id); if (e) e.innerHTML = v; }

  function toast(msg) { if (typeof window.showToast === "function") window.showToast(msg); }

  /* ---------------- state ---------------- */

  var state = {
    addr: "",
    ladder: [],
    net: null,
    params: null,
    verify: 0,
    protect: 0,
    tier: 1,
    paidInOMC: true,
    tokenBal: 0n,
    faucetReadyAt: 0,
    faucetClaims: 0n,
    faucetMax: 5n,
    deadlineHours: 24,
    busy: false
  };

  /* ---------------- log ---------------- */

  function log(msg, cls) {
    var el = $("cmpLog");
    if (!el) return;
    var t = new Date().toTimeString().slice(0, 8);
    var line = document.createElement("div");
    line.innerHTML = '<b>' + t + '</b> ' + (cls ? '<span class="' + cls + '">' + msg + "</span>" : msg);
    el.insertBefore(line, el.firstChild);
    while (el.children.length > 60) el.removeChild(el.lastChild);
  }

  /* ============================================================
     RENDER — reads
     ============================================================ */

  var TIER_HW = {
    1: "hw1",
    2: "hw2",
    3: "hw3",
    4: "hw4",
    5: "hw5"
  };

  /* Structural fallback so the page is never empty before the first chain
     round-trip lands. These numbers are NOT the source of truth — every live
     render overwrites them with what stake.minStakeForTier() returns, and the
     regression suite asserts that compute-core.js never hard-codes a ladder.
     Keep in sync with the 5-tier table in the whitepaper (§7.5, proposed). */
  var FALLBACK_LADDER = [
    { tier: 1, min: 20n },
    { tier: 2, min: 100n },
    { tier: 3, min: 500n },
    { tier: 4, min: 1000n },
    { tier: 5, min: 5000n }
  ];

  function renderTiers() {
    var box = $("cmpTiers");
    if (!box) return;
    var ladder = state.ladder && state.ladder.length ? state.ladder : FALLBACK_LADDER;
    box.innerHTML = ladder
      .map(function (r) {
        var on = state.tier === r.tier ? " on" : "";
        return (
          '<button type="button" class="cmp-tier' + on + '" data-tier="' + r.tier + '">' +
          '<span class="tn">' + T("cst.tier") + " " + r.tier + "</span>" +
          '<span class="th">' + T("stk." + TIER_HW[r.tier]) + "</span>" +
          '<span class="tm">' + C.fmt(r.min, 0) + " tOMC</span>" +
          "</button>"
        );
      })
      .join("");
    Array.prototype.forEach.call(box.querySelectorAll(".cmp-tier"), function (b) {
      b.addEventListener("click", function () {
        state.tier = Number(b.getAttribute("data-tier"));
        renderTiers();
        renderQuote();
      });
    });
  }

  function renderLadderTable() {
    var tb = $("cmpLadder");
    if (!tb) return;
    var ladder = state.ladder && state.ladder.length ? state.ladder : FALLBACK_LADDER;
    tb.innerHTML = ladder
      .map(function (r) {
        return (
          "<tr>" +
          "<td><b>" + T("cst.tier") + " " + r.tier + "</b></td>" +
          "<td>" + T("stk." + TIER_HW[r.tier]) + "</td>" +
          '<td class="num">' + C.fmt(r.min, 0) + " tOMC</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderNetwork() {
    if (!state.net) return;
    var s = state.net.staking;
    var m = state.net.market;
    set("cmpNetNodes", C.fmt(s.nodes, 0));
    set("cmpNetStaked", C.fmt(s.totalStake, 0) + " tOMC");
    set("cmpNetLiquidity", C.fmt(s.rewardLiquidity, 0) + " tOMC");
    set("cmpNetSlashed", C.fmt(s.totalSlashed, 2) + " tOMC");
    set("cmpJobsTotal", C.fmt(m.jobsTotal, 0));
    set("cmpJobsSettled", C.fmt(m.jobsSettled, 0));
    set("cmpJobsSettled2", C.fmt(m.jobsSettled, 0));
    set("cmpVolume", C.fmt(m.settledVolume, 2) + " tOMC");
    set("cmpFeesBurned", C.fmt(m.feesBurned, 4) + " tOMC");
  }

  /* ---------------- quote ---------------- */

  function currentQuote() {
    var rate = $("cmpRate") ? $("cmpRate").value : "";
    var hours = parseFloat($("cmpHours") ? $("cmpHours").value : "0") || 0;
    return C.quote({
      rate: rate,
      hours: hours,
      verifyPolicy: state.verify,
      protection: state.protect,
      paidInOMC: state.paidInOMC
    });
  }

  function renderQuote() {
    var q = currentQuote();
    var box = $("cmpQuoteOut");

    if (!q.ok) {
      if (box) {
        box.className = "cmp-quote empty";
        box.innerHTML = '<div class="qh">' + T("cst.quote_empty") + "</div>" +
          '<div class="qfoot">' + T("cst.quote_foot") + "</div>";
      }
      paintCreate();
      return;
    }

    /* the rate the visitor typed is in OMC, which has no market price yet, so
       the output is deliberately a *tOMC* number and never a dollar one */
    var rows = [
      [T("cst.q_rate"), C.fmt(C.parseAmount(String(q.rate)) * BigInt(Math.round(q.hours))) + " tOMC"],
      [
        T("cst.q_verify") + " · " + T("cst.v" + state.verify),
        "×" + q.multLo + (q.multLo === q.multHi ? "" : " – ×" + q.multHi)
      ],
      [T("cst.q_fee"), (q.feeRate * 100).toFixed(2) + "%" + (state.paidInOMC ? " (" + T("cst.q_disc") + ")" : "")]
    ];

    if (box) {
      box.className = "cmp-quote";
      box.innerHTML =
        '<div class="qh">' + T("cst.quote_h") + "</div>" +
        '<div class="qbig"><span class="qlo">' + q.totalLow.toFixed(2) + "</span>" +
        '<span class="qdash">–</span>' +
        '<span class="qhi">' + q.totalHigh.toFixed(2) + "</span>" +
        '<span class="qunit">tOMC</span></div>' +
        '<div class="qrows">' +
        rows
          .map(function (r) {
            return '<div class="qrow"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>";
          })
          .join("") +
        "</div>" +
        '<div class="qfoot">' + T("cst.quote_foot") + "</div>";
    }
    paintCreate();
  }

  /* ============================================================
     ACTIONS — writes
     ============================================================ */

  function guard() {
    if (!window.OMCWallet || !window.OMCWallet.address()) {
      toast(T("cst.err_nowallet"));
      return false;
    }
    if (state.busy) return false;
    return true;
  }

  function tx(label, to, data, gas) {
    if (!guard()) return Promise.resolve();
    state.busy = true;
    paintCreate();
    log("→ " + label);
    return C.send(to, data, gas)
      .then(function (hash) {
        log("· " + label + " submitted " + hash.slice(0, 12) + "…");
        return C.rcpt(hash).then(function (r) {
          if (r.status !== "0x1") {
            log("✗ " + label + " reverted", "e");
            toast(T("cst.toast_reverted"));
          } else {
            log("✓ " + label + " confirmed (gas " + BigInt(r.gasUsed).toString() + ")", "g");
            toast(T("cst.toast_ok"));
          }
          return refreshAll();
        });
      })
      .catch(function (e) {
        var m = (e && (e.shortMessage || e.message)) || "error";
        if (/user rejected|denied/i.test(m)) m = "rejected in wallet";
        log("✗ " + label + " — " + m, "e");
        toast(m.slice(0, 90));
      })
      .then(function () {
        state.busy = false;
        paintCreate();
      });
  }

  /* approve exactly the escrow about to be created — never an open allowance */
  function doApprove() {
    var q = currentQuote();
    if (!q.ok) return toast(T("cst.err_quote"));
    /* the ceiling is the high end of the quote, rounded up to whole tOMC */
    var amt = C.parseAmount(String(Math.ceil(q.totalHigh)));
    tx("approve(market)", C.CFG.token, C.enc.approve(C.CFG.market, amt), 70000);
  }

  function doCreateJob() {
    var q = currentQuote();
    if (!q.ok) return toast(T("cst.err_quote"));

    var spec = $("cmpSpec") ? $("cmpSpec").value.trim() : "";
    if (!spec) return toast(T("cst.err_spec"));

    /* hash the spec locally so only a commitment goes on chain */
    var specHash = keccakLike(spec);

    var ceiling = C.parseAmount(String(Math.ceil(q.totalHigh)));
    var deadline = BigInt(Math.floor(Date.now() / 1000) + state.deadlineHours * 3600);

    tx(
      "createJob(tier " + state.tier + ")",
      C.CFG.market,
      C.enc.createJob(specHash, state.tier, state.verify, state.protect, ceiling, deadline, state.paidInOMC),
      500000
    );
  }

  /* keccak256 of a UTF-8 string, using the wallet's own implementation when
     available and falling back to a pure-JS Keccak-f[1600]. Only a commitment
     goes on chain, so this never has to leave the browser. */
  function keccakLike(str) {
    return keccak256Bytes(utf8Bytes(str));
  }

  function utf8Bytes(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  /* --- minimal Keccak-256 ---
     A plain Keccak-f[1600] over 25 x 64-bit lanes held as BigInt. Slower than
     a hand-unrolled uint32 version and much easier to read against the spec:
     theta -> rho+pi -> chi -> iota, 24 rounds, rate 136 bytes, pad 0x01/0x80
     (Keccak padding, not SHA-3's 0x06). Only a commitment hash goes on chain
     for a job spec, so this never has to be fast. */
  var M64 = (1n << 64n) - 1n;

  var KECCAK_RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
    0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
    0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
    0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
    0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
    0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
    0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];

  /* rho rotation offsets indexed by lane x + 5y */
  var KECCAK_RHO = [
     0,  1, 62, 28, 27,
    36, 44,  6, 55, 20,
     3, 10, 43, 25, 39,
    41, 45, 15, 21,  8,
    18,  2, 61, 56, 14
  ];

  function rotl64(x, n) {
    if (n === 0) return x & M64;
    var k = BigInt(n);
    return ((x << k) | (x >> (64n - k))) & M64;
  }

  function keccakF(a) {
    var b = new Array(25);
    var c = new Array(5);
    var d = new Array(5);
    for (var round = 0; round < 24; round++) {
      /* theta */
      for (var x = 0; x < 5; x++) {
        c[x] = a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20];
      }
      for (var x2 = 0; x2 < 5; x2++) {
        d[x2] = c[(x2 + 4) % 5] ^ rotl64(c[(x2 + 1) % 5], 1);
      }
      for (var x3 = 0; x3 < 5; x3++) {
        for (var y = 0; y < 5; y++) {
          a[x3 + 5 * y] = (a[x3 + 5 * y] ^ d[x3]) & M64;
        }
      }
      /* rho + pi */
      for (var x4 = 0; x4 < 5; x4++) {
        for (var y2 = 0; y2 < 5; y2++) {
          b[y2 + 5 * ((2 * x4 + 3 * y2) % 5)] = rotl64(a[x4 + 5 * y2], KECCAK_RHO[x4 + 5 * y2]);
        }
      }
      /* chi */
      for (var x5 = 0; x5 < 5; x5++) {
        for (var y3 = 0; y3 < 5; y3++) {
          a[x5 + 5 * y3] = (b[x5 + 5 * y3] ^ ((~b[(x5 + 1) % 5 + 5 * y3] & M64) & b[(x5 + 2) % 5 + 5 * y3])) & M64;
        }
      }
      /* iota */
      a[0] = (a[0] ^ KECCAK_RC[round]) & M64;
    }
    return a;
  }

  function keccak256Bytes(bytes) {
    var rate = 136; // 1088-bit rate for Keccak-256
    var input = bytes.slice();
    var pad = rate - (input.length % rate);
    if (pad === 1) {
      input.push(0x81);
    } else {
      input.push(0x01);
      for (var p = 0; p < pad - 2; p++) input.push(0x00);
      input.push(0x80);
    }

    var a = new Array(25);
    for (var i = 0; i < 25; i++) a[i] = 0n;

    for (var off = 0; off < input.length; off += rate) {
      for (var l = 0; l < rate / 8; l++) {
        var w = 0n;
        for (var b = 7; b >= 0; b--) {
          w = (w << 8n) | BigInt(input[off + l * 8 + b] || 0);
        }
        a[l] = (a[l] ^ w) & M64;
      }
      keccakF(a);
    }

    var out = "";
    for (var k = 0; k < 4; k++) {
      var lane = a[k];
      for (var byte = 0; byte < 8; byte++) {
        out += Number((lane >> BigInt(8 * byte)) & 0xffn).toString(16).padStart(2, "0");
      }
    }
    return "0x" + out;
  }

  /* ---------------- faucet ---------------- */

  /* Test tOMC is claimed in place: 20 per claim, once a day, five per address
     — the same rules the mainnet airdrop will use. The limits live on-chain
     in the token contract (FAUCET_AMOUNT / FAUCET_COOLDOWN / MAX_FAUCET_CLAIMS). */
  function doFaucet() {
    if (!window.OMCWallet || !window.OMCWallet.address()) return;
    if (state.busy) return;
    state.busy = true;
    paintAll();
    C.send(C.CFG.token, C.enc.claimFaucet(), 150000)
      .then(function (hash) {
        log("claimFaucet submitted " + hash.slice(0, 12) + "…");
        return C.rcpt(hash).then(function (r) {
          if (r.status !== "0x1") {
            log("✗ claimFaucet reverted", "e");
          } else {
            log("✓ claimFaucet confirmed", "g");
          }
          return refreshAll();
        });
      })
      .catch(function (e) {
        var m = (e && (e.shortMessage || e.message)) || "error";
        if (/user rejected|denied/i.test(m)) m = "rejected in wallet";
        log("✗ claimFaucet — " + m, "e");
      })
      .then(function () { state.busy = false; paintAll(); });
  }

  function paintFaucet() {
    var btn = $("cmpBtnFaucet");
    var note = $("cmpFaucetNote");
    if (!btn || !note) return;
    var has = !!(window.OMCWallet && window.OMCWallet.address());
    var c = Number(state.faucetClaims), m = Number(state.faucetMax);
    var now = Math.floor(Date.now() / 1000);
    if (!has) {
      note.textContent = T("cst.faucet_air");
      btn.disabled = true;
      return;
    }
    if (c >= m) {
      btn.disabled = true;
      note.textContent = T("stk.faucet_done");
    } else if (now < state.faucetReadyAt) {
      var left = state.faucetReadyAt - now;
      var hh = String(Math.floor(left / 3600)).padStart(2, "0");
      var mm = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
      var ss = String(left % 60).padStart(2, "0");
      note.textContent = T("stk.faucet_claimed").replace("{n}", String(c)) + " · " + T("stk.faucet_next").replace("{t}", hh + ":" + mm + ":" + ss);
      btn.disabled = true;
    } else {
      note.textContent = T("stk.faucet_claimed").replace("{n}", String(c));
      btn.disabled = state.busy;
    }
  }

  /* ---------------- paint ---------------- */

  function paintCreate() {
    var q = currentQuote();
    var btn = $("cmpBtnCreate");
    var appr = $("cmpBtnApprove");
    var hasWallet = !!(window.OMCWallet && window.OMCWallet.address());
    var specOk = $("cmpSpec") ? $("cmpSpec").value.trim().length > 0 : false;

    var needAllow = false;
    if (q.ok) {
      var ceiling = C.parseAmount(String(Math.ceil(q.totalHigh)));
      needAllow = hasWallet && state.tokenBal >= ceiling;
    }
    /* the allowance is only interesting once the wallet is known; we cannot
       read it without an address, so both buttons stay disabled until then */
    if (btn) btn.disabled = state.busy || !q.ok || !specOk || !hasWallet;
    if (appr) appr.disabled = state.busy || !q.ok || !hasWallet;
    void needAllow;
  }

  function paintWallet() {
    var has = !!(window.OMCWallet && window.OMCWallet.address());
    set("cmpWStatus", has ? T("cst.w_connected") : T("cst.w_idle"));
    set("cmpWAddr", has ? C.short(window.OMCWallet.address()) : "—");
    var b = $("cmpWStatus");
    if (b) b.className = "pill " + (has ? "live" : "idle");
    set("cmpTileBal", C.fmt(state.tokenBal, 2));
    paintCreate();
    paintFaucet();
  }

  /* ============================================================
     LOAD
     ============================================================ */

  function loadReads() {
    /* loadLadder() already self-heals to the structural table; the other two
       reads degrade to nulls rather than rejecting so the ladder still paints */
    return Promise.all([
      C.loadLadder(),
      C.loadNetwork().catch(function () { return null; }),
      C.loadParams().catch(function () { return null; })
    ]).then(function (r) {
      state.ladder = r[0];
      state.net = r[1];
      state.params = r[2];
      renderTiers();
      renderLadderTable();
      renderNetwork();
      renderQuote();
    });
  }

  function loadWalletReads() {
    var a = window.OMCWallet && window.OMCWallet.address();
    state.addr = a || "";
    if (!a) {
      state.tokenBal = 0n;
      state.faucetReadyAt = 0;
      state.faucetClaims = 0n;
      paintWallet();
      return Promise.resolve();
    }
    return Promise.all([
      C.ethCall(C.CFG.token, C.enc.balanceOf(a)),
      C.ethCall(C.CFG.token, C.enc.faucetReadyAt(a)).catch(function () { return "0x" + "0".repeat(64); }),
      C.ethCall(C.CFG.token, C.enc.faucetClaims(a)).catch(function () { return "0x" + "0".repeat(64); }),
      C.ethCall(C.CFG.token, C.enc.maxFaucetClaims()).catch(function () { return "0x" + "0".repeat(63) + "5"; })
    ])
      .then(function (r) {
        state.tokenBal = C.decWord(r[0]);
        state.faucetReadyAt = Number(C.decWord(r[1]));
        state.faucetClaims = C.decWord(r[2]);
        state.faucetMax = C.decWord(r[3]);
        paintWallet();
      })
      .catch(function () {
        paintWallet();
      });
  }

  function refreshAll() {
    return Promise.all([loadReads(), loadWalletReads()]);
  }

  /* ============================================================
     WIRE UP
     ============================================================ */

  function bindSegments() {
    ["cmpVerify", "cmpProtect"].forEach(function (id) {
      var box = $(id);
      if (!box) return;
      Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
        b.addEventListener("click", function () {
          Array.prototype.forEach.call(box.querySelectorAll("button"), function (o) {
            o.classList.remove("on");
          });
          b.classList.add("on");
          var v = Number(b.getAttribute("data-v"));
          if (id === "cmpVerify") state.verify = v;
          else state.protect = v;
          renderQuote();
        });
      });
    });

    var pay = $("cmpPay");
    if (pay) {
      Array.prototype.forEach.call(pay.querySelectorAll("button"), function (b) {
        b.addEventListener("click", function () {
          Array.prototype.forEach.call(pay.querySelectorAll("button"), function (o) {
            o.classList.remove("on");
          });
          b.classList.add("on");
          state.paidInOMC = b.getAttribute("data-v") === "omc";
          renderQuote();
        });
      });
    }
  }

  function init() {
    if (!$("cmpTiers")) return;

    bindSegments();

    ["cmpRate", "cmpHours", "cmpSpec"].forEach(function (id) {
      var e = $(id);
      if (e) e.addEventListener("input", renderQuote);
    });

    var dl = $("cmpDeadline");
    if (dl) {
      dl.addEventListener("change", function () {
        state.deadlineHours = Number(dl.value) || 24;
      });
    }

    var bc = $("cmpBtnCreate");
    if (bc) bc.addEventListener("click", doCreateJob);
    var ba = $("cmpBtnApprove");
    if (ba) ba.addEventListener("click", doApprove);
    var bf = $("cmpBtnFaucet");
    if (bf) bf.addEventListener("click", doFaucet);

    /* wallet.js broadcasts "omc:wallet" on every connect / sign-out / chain
       change — subscribe the same way main.js and airdrop-stats.js do. */
    document.addEventListener("omc:wallet", function () {
      loadWalletReads();
      paintAll();
    });

    var conn = $("cmpConnect");
    if (conn) {
      conn.addEventListener("click", function () {
        if (!window.OMCWallet) return;
        if (window.OMCWallet.address()) {
          window.OMCWallet.signOut();
        } else {
          window.OMCWallet.open();
        }
      });
    }

    if (window.i18nApply) window.i18nApply();

    refreshAll().catch(function (e) {
      log("read failed — " + ((e && e.message) || "rpc"), "e");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
