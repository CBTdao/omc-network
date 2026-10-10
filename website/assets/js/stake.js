/* ============================================================
   Omniverse Compute (OMC) — /stake page controller
   Drives the staking UI with stake-core.js + the site wallet.
   ============================================================ */
(function () {
  "use strict";

  var S = window.OMCStake;
  if (!S) return;

  function T(k) { return window.i18nT ? window.i18nT(k) : k; }
  function $(id) { return document.getElementById(id); }
  function set(id, txt) { var e = $(id); if (e) e.textContent = txt; }
  function html(id, v) { var e = $(id); if (e) e.innerHTML = v; }
  function attr(id, name, v) { var e = $(id); if (e) e.setAttribute(name, v); }

  function toast(msg) { if (typeof window.showToast === "function") window.showToast(msg); }

  /* ---------------- state ---------------- */
  var state = {
    addr: "",
    tokenBal: 0n,
    allowance: 0n,
    node: null,
    proto: null,
    base: 0n,
    tierCount: 5,
    tier: 1,
    busy: false,
    faucetReadyAt: 0,
    heartbeatInterval: 1800,
    heartbeatGrace: 600
  };

  /* ---------------- log ---------------- */
  function log(msg, cls) {
    var el = $("stkLog");
    if (!el) return;
    var t = new Date().toTimeString().slice(0, 8);
    var line = document.createElement("div");
    line.innerHTML = '<b>' + t + '</b> ' + (cls ? '<span class="' + cls + '">' + msg + "</span>" : msg);
    el.insertBefore(line, el.firstChild);
    while (el.children.length > 60) el.removeChild(el.lastChild);
  }

  /* ---------------- guard ---------------- */
  function guard() {
    if (!window.OMCWallet || !window.OMCWallet.address()) {
      toast(T("stk.err_nowallet"));
      return false;
    }
    if (state.busy) return false;
    return true;
  }

  /* Every write goes through here: guard → send → wait for receipt →
     refresh. A reverted receipt is surfaced as a revert, not a success. */
  function tx(label, to, data, gas) {
    if (!guard()) return Promise.resolve();
    state.busy = true;
    paintActions();
    log("→ " + label);
    return S.send(to, data, gas)
      .then(function (hash) {
        log("· " + label + " submitted " + hash.slice(0, 12) + "…");
        return S.rcpt(hash).then(function (r) {
          if (r.status !== "0x1") {
            log("✗ " + label + " reverted", "e");
            toast(T("stk.toast_reverted"));
          } else {
            log("✓ " + label + " confirmed (gas " + BigInt(r.gasUsed).toString() + ")", "g");
            toast(T("stk.toast_ok"));
          }
          return refresh();
        });
      })
      .catch(function (e) {
        var m = (e && (e.shortMessage || e.message)) || "error";
        if (/user rejected|denied/i.test(m)) m = "rejected in wallet";
        log("✗ " + label + " — " + m, "e");
        toast(m.slice(0, 90));
      })
      .then(function () { state.busy = false; paintActions(); });
  }

  /* ---------------- actions ---------------- */

  function doFaucet() {
    tx("claimFaucet", S.CFG.token, S.enc.claimFaucet(), 90000);
  }

  function doApprove() {
    var amt = S.parseAmount($("stkAmount").value);
    if (amt === null || amt <= 0n) return toast(T("stk.err_amount"));
    /* approve exactly what is being staked, not an unlimited allowance:
       an unbounded approval outlives this page and this contract. */
    tx("approve", S.CFG.token, S.enc.approve(S.CFG.staking, amt), 70000);
  }

  function doStake() {
    var amt = S.parseAmount($("stkAmount").value);
    if (amt === null || amt <= 0n) return toast(T("stk.err_amount"));
    var tier = state.tier;
    var min = tierMin(tier);
    var total = (state.node && state.node.stake ? state.node.stake : 0n);
    if (state.node && state.node.registered) {
      if (total + amt < tierMin(tier)) return toast(T("stk.err_below_tier"));
    } else if (amt < min) {
      return toast(T("stk.err_below_tier"));
    }
    if (state.tokenBal < amt) return toast(T("stk.err_balance"));

    if (state.allowance < amt) {
      log("allowance is short — approving " + S.fmt(amt) + " tOMC first");
      return tx("approve", S.CFG.token, S.enc.approve(S.CFG.staking, amt), 70000).then(function () {
        return tx("stake(" + S.fmt(amt) + ", tier " + tier + ")", S.CFG.staking, S.enc.stake(amt, tier), 260000);
      });
    }
    tx("stake(" + S.fmt(amt) + ", tier " + tier + ")", S.CFG.staking, S.enc.stake(amt, tier), 260000);
  }

  function doRegister() {
    var tier = state.tier;
    var ep = ($("stkEndpoint").value || "").trim();
    if (!ep) return toast(T("stk.err_endpoint"));
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(ep)) return toast(T("stk.err_endpoint"));
    tx("registerNode(tier " + tier + ")", S.CFG.staking, S.enc.registerNode(tier, ep), 300000);
  }

  function doHeartbeat() {
    tx("heartbeat", S.CFG.staking, S.enc.heartbeat(), 160000);
  }

  function doClaim() {
    tx("claim", S.CFG.staking, S.enc.claim(), 220000);
  }

  function doUnstake(all) {
    if (!state.node || state.node.stake <= 0n) return toast(T("stk.err_nostake"));
    var amt;
    if (all) {
      amt = state.node.stake;
    } else {
      amt = S.parseAmount($("stkUnstake").value);
      if (amt === null || amt <= 0n) return toast(T("stk.err_amount"));
      if (amt > state.node.stake) return toast(T("stk.err_over_stake"));
      var left = state.node.stake - amt;
      if (state.node.registered && left < state.node.minStake) {
        return toast(T("stk.err_keep_min"));
      }
    }
    tx("unstake(" + S.fmt(amt) + ")", S.CFG.staking, S.enc.unstake(amt), 220000);
  }

  function doDeregister() {
    tx("deregister", S.CFG.staking, S.enc.deregister(), 180000);
  }

  /* ---------------- rendering ---------------- */

  function paintWallet() {
    var connected = !!(window.OMCWallet && window.OMCWallet.address());
    state.addr = connected ? window.OMCWallet.address() : "";

    set("stkWAddr", connected ? state.addr : T("stk.not_connected"));
    $("stkWAddr").className = "addr";
    $("stkWStatus").className = "pill " + (connected ? "on" : "idle");
    $("stkWStatus").innerHTML = '<span class="dot"></span>' + (connected ? T("stk.connected") : T("stk.idle"));
    $("stkConnect").textContent = connected ? T("stk.disconnect") : T("stk.connect");
    attr("stkWAddr", "title", state.addr || "");
  }

  function paintBalance() {
    set("stkTileBal", S.fmt(state.tokenBal));
    set("stkTileAllow", S.fmt(state.allowance));
    set("stkTileStake", S.fmt(state.node ? state.node.stake : 0n));
    set("stkTilePending", S.fmt(state.node ? state.node.pending : 0n));
  }

  /* the ladder is read straight from the contract one rung at a time, so the
     table can never drift from the deployed minimums */
  function paintTiers() {
    var wrap = $("stkTiers");
    if (wrap) {
      wrap.innerHTML = "";
      for (var t = 1; t <= state.tierCount; t++) {
        var d = document.createElement("div");
        d.className = "tier" + (t === state.tier ? " sel" : "");
        d.setAttribute("data-tier", String(t));
        d.innerHTML = "<b>T" + t + "</b><span>" + S.fmt(tierMin(t), 0) + "</span>";
        wrap.appendChild(d);
      }
    }
    var tbl = $("stkTierTable");
    if (tbl) {
      var rows = "";
      for (var i = 1; i <= state.tierCount; i++) {
        rows += '<tr class="' + (i === state.tier ? "cur" : "") + '"><td>Tier ' + i + "</td><td>" +
          S.fmt(tierMin(i), 0) + " tOMC</td></tr>";
      }
      tbl.innerHTML = rows;
    }
    var cur = state.node && state.node.tier ? state.node.tier : 0;
    set("stkNodeTier", cur ? "Tier " + cur : "—");
  }

  function tierMin(t) {
    if (state.ladder && state.ladder[t] !== undefined) return state.ladder[t];
    return 0n;
  }

  function paintNode() {
    var n = state.node;
    var reg = n && n.registered;
    var overdue = n && n.overdue;

    $("stkNodePill").className = "pill " + (!reg ? "idle" : overdue ? "bad" : "on");
    $("stkNodePill").innerHTML = '<span class="dot"></span>' +
      (!reg ? T("stk.pill_unregistered") : overdue ? T("stk.pill_overdue") : T("stk.pill_active"));

    set("stkNodeTier", reg ? "Tier " + n.tier : "—");
    set("stkNodeStake", n ? S.fmt(n.stake) + " tOMC" : "—");
    set("stkNodeMin", n ? S.fmt(n.minStake) + " tOMC" : "—");
    set("stkNodePending", S.fmt(n ? n.pending : 0n) + " tOMC");
    set("stkNodeWork", n ? n.workUnits.toString() : "0");
    set("stkNodeSlashed", n ? S.fmt(n.slashedTotal) + " tOMC" : "0 tOMC");
    set("stkNodeMissed", n ? n.missedHeartbeats.toString() : "0");
    set("stkNodeEndpoint", ($("stkEndpoint").value || "").trim() || "—");

    var dl = $("stkNodeDeadline");
    if (dl) {
      if (!reg || !n.deadline || n.deadline === 0n) {
        dl.textContent = "—";
        dl.className = "v";
      } else {
        var now = BigInt(Math.floor(Date.now() / 1000));
        if (n.deadline <= now) {
          dl.textContent = T("stk.expired") + " — " + T("stk.slash_pending");
          dl.className = "v bad";
        } else {
          dl.textContent = T("stk.in") + " " + S.fmtDuration(Number(n.deadline - now));
          dl.className = "v";
        }
      }
    }

    var bar = $("stkLiveness");
    if (bar) {
      if (!reg || !n.lastHeartbeat || !state.node.deadline) {
        bar.style.display = "none";
      } else {
        var total = Number(state.heartbeatInterval + state.heartbeatGrace);
        var left = Number(n.deadline) - Math.floor(Date.now() / 1000);
        var pct = Math.max(0, Math.min(100, (left / total) * 100));
        bar.style.display = "block";
        $("stkLivenessFill").style.width = pct.toFixed(1) + "%";
        $("stkLivenessFill").style.background = pct > 50 ? "var(--green)" : pct > 20 ? "var(--orange)" : "var(--red)";
      }
    }
  }

  function paintProto() {
    var p = state.proto;
    if (!p) return;
    set("stkProtoTotal", S.fmt(p.totalStake) + " tOMC");
    set("stkProtoLiquidity", S.fmt(p.rewardLiquidity) + " tOMC");
    set("stkProtoEmission", S.fmt(p.emissionPerSecond, 4) + " /s");
    set("stkProtoNodes", p.nodes.toString());
    set("stkProtoSlashed", S.fmt(p.totalSlashed) + " tOMC");
    set("stkProtoWork", p.totalWorkUnits.toString());
    set("stkProtoApr", "—");
  }

  function paintActions() {
    var connected = !!(window.OMCWallet && window.OMCWallet.address());
    var n = state.node;
    var reg = !!(n && n.registered);
    var b = state.busy;

    $("stkBtnFaucet").disabled = !connected || b;
    $("stkBtnApprove").disabled = !connected || b;
    $("stkBtnStake").disabled = !connected || b;
    $("stkBtnRegister").disabled = !connected || b;
    $("stkBtnHeartbeat").disabled = !connected || !reg || b;
    $("stkBtnClaim").disabled = !connected || b || !(n && n.pending > 0n);
    $("stkBtnDeregister").disabled = !connected || !reg || b;
    $("stkBtnUnstake").disabled = !connected || !n || n.stake <= 0n || b;
    $("stkBtnUnstakeAll").disabled = !connected || !n || n.stake <= 0n || b;

    if (n && n.registered && n.stake > 0n && !b) {
      $("stkBtnUnstakeAll").textContent = T("stk.unstake_all") + " (" + S.fmt(n.stake) + " tOMC)";
    } else {
      $("stkBtnUnstakeAll").textContent = T("stk.unstake_all");
    }
  }

  function paintFaucet() {
    var now = Math.floor(Date.now() / 1000);
    var e = $("stkFaucetNote");
    if (!e) return;
    if (!state.faucetReadyAt || state.faucetReadyAt <= now) {
      e.textContent = T("stk.faucet_ready");
      e.className = "note";
    } else {
      e.textContent = T("stk.faucet_cooldown") + " " + S.fmtDuration(state.faucetReadyAt - now);
      e.className = "note";
    }
  }

  function paintAll() {
    paintWallet();
    paintTiers();
    paintBalance();
    paintNode();
    paintProto();
    paintActions();
    paintFaucet();
  }

  /* ---------------- reading ---------------- */

  function refresh() {
    var addr = window.OMCWallet && window.OMCWallet.address();
    if (!addr) {
      state.tokenBal = 0n; state.allowance = 0n; state.node = null;
      paintAll();
      return Promise.resolve();
    }
    state.addr = addr;

    var jobs = [
      S.ethCall(S.CFG.token, S.enc.balanceOf(addr)).then(function (h) { state.tokenBal = S.decWord(h); }),
      S.ethCall(S.CFG.token, S.enc.allowance(addr, S.CFG.staking)).then(function (h) { state.allowance = S.decWord(h); }),
      S.ethCall(S.CFG.staking, S.enc.nodeSummary(addr)).then(function (h) { state.node = S.decNodeSummary(h); }),
      S.ethCall(S.CFG.staking, S.enc.protocolStats()).then(function (h) { state.proto = S.decProtocolStats(h); }),
      S.ethCall(S.CFG.staking, S.enc.heartbeatInterval()).then(function (h) { state.heartbeatInterval = Number(S.decWord(h)); }),
      S.ethCall(S.CFG.staking, S.enc.heartbeatGrace()).then(function (h) { state.heartbeatGrace = Number(S.decWord(h)); }),
      /* the node's own published endpoint comes from the contract, not from
         whatever the visitor happens to have typed in the form */
      S.ethCall(S.CFG.staking, S.enc.endpoint(addr)).then(function (h) {
        var ep = S.decString(h);
        if (ep) $("stkEndpoint").value = ep;
      }).catch(function () {})
    ];

    jobs.push(S.ethCall(S.CFG.token, S.enc.faucetReadyAt(addr)).then(function (h) {
      state.faucetReadyAt = Number(S.decWord(h));
    }));
    jobs.push(S.rpc("eth_getBalance", [addr, "latest"]).then(function (h) {
      set("stkTileGas", S.fmt(BigInt(h), 4) + " tBNB");
    }).catch(function () {}));
    jobs.push(S.ethCall(S.CFG.token, S.enc.faucetRemaining()).then(function (h) {
      set("stkFaucetPool", S.fmt(S.decWord(h), 0) + " tOMC");
    }).catch(function () {}));

    return Promise.all(jobs).then(function () {
      paintAll();
    }).catch(function (e) {
      log("read error — " + ((e && e.message) || e), "e");
    });
  }

  /* ---------------- boot ---------------- */

  function bind() {
    var box = $("stkTiers");
    if (box) {
      box.addEventListener("click", function (ev) {
        var t = ev.target.closest ? ev.target.closest(".tier") : null;
        if (!t) return;
        state.tier = Number(t.getAttribute("data-tier"));
        paintTiers();
        paintStakeHint();
      });
    }

    $("stkConnect").addEventListener("click", function () {
      if (window.OMCWallet.address()) {
        window.OMCWallet.signOut();
        state.node = null; state.tokenBal = 0n; state.allowance = 0n;
        paintAll();
      } else {
        window.OMCWallet.open();
      }
    });

    $("stkBtnFaucet").addEventListener("click", doFaucet);
    $("stkBtnApprove").addEventListener("click", doApprove);
    $("stkBtnStake").addEventListener("click", doStake);
    $("stkBtnRegister").addEventListener("click", doRegister);
    $("stkBtnHeartbeat").addEventListener("click", doHeartbeat);
    $("stkBtnClaim").addEventListener("click", doClaim);
    $("stkBtnDeregister").addEventListener("click", doDeregister);
    $("stkBtnUnstake").addEventListener("click", function () { doUnstake(false); });
    $("stkBtnUnstakeAll").addEventListener("click", function () { doUnstake(true); });

    var amount = $("stkAmount");
    if (amount) {
      amount.addEventListener("input", paintStakeHint);
      var max = $("stkAmountMax");
      if (max) max.addEventListener("click", function () {
        amount.value = S.fmt(state.tokenBal, 18).replace(/,/g, "");
        paintStakeHint();
      });
    }

    document.addEventListener("i18n:changed", paintAll);
  }

  function paintStakeHint() {
    var amt = S.parseAmount($("stkAmount").value);
    var min = tierMin(state.tier);
    var e = $("stkStakeHint");
    if (!e) return;
    e.style.color = "";
    if (amt === null || amt <= 0n) {
      e.textContent = T("stk.hint_min") + " " + S.fmt(min, 0) + " tOMC";
      return;
    }
    if (state.node && state.node.registered) {
      e.textContent = T("stk.hint_after") + " " + S.fmt(state.node.stake + amt) + " tOMC";
      return;
    }
    if (amt < min) {
      e.style.color = "var(--red)";
      e.textContent = T("stk.err_below_tier") + " (" + S.fmt(min, 0) + " tOMC)";
      return;
    }
    e.textContent = T("stk.hint_ok");
  }

  function boot() {
    if (!$("stkApp")) return;
    state.tierCount = 5;
    bind();
    /* read the whole ladder up front so the tier table renders — and the
       stake-minimum hint is correct — before a wallet is connected */
    var ladders = [];
    for (var t = 1; t <= state.tierCount; t++) {
      ladders.push(S.ethCall(S.CFG.staking, S.enc.minStakeForTier(t)));
    }
    Promise.all(ladders).then(function (hexes) {
      state.ladder = {};
      for (var i = 0; i < hexes.length; i++) {
        state.ladder[i + 1] = S.decWord(hexes[i]);
      }
      paintTiers();
      paintStakeHint();
      paintActions();
    }).catch(function () { paintActions(); });
    S.ethCall(S.CFG.staking, S.enc.protocolStats()).then(function (h) {
      state.proto = S.decProtocolStats(h);
      paintProto();
    }).catch(function () {});

    refresh();
    setInterval(function () { if (!state.busy) refresh(); }, 20000);
    setInterval(function () { if (!state.busy) { paintNode(); paintFaucet(); } }, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
