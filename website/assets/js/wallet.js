/* ============================================================
   Omniverse Compute (OMC) — Wallet sign-in
   Loaded on every page (after i18n.js, before main.js).

   What it does
   - Detects an injected EIP-1193 provider (MetaMask / OKX / Binance /
     Bitget / Rabby…), including the multi-provider array.
   - Connect → personal_sign challenge → local session
     (localStorage `omc_session_v1`). The signature proves address
     ownership; it costs no gas and grants no spending rights.
   - Detects the active chain and can switch to BNB Smart Chain
     Testnet (97) via wallet_switchEthereumChain / wallet_addEthereumChain.
   - Renders: the nav entry, the account dropdown and the sign-in modal.

   Server-side verification
   - Signature verification currently happens on the client only, so the
     session is a UX convenience, NOT an authorisation token.
   - Set VERIFY_ENDPOINT to a URL that accepts
     POST {address, message, signature} to verify server-side; the
     request is fired after a successful signature.
   ============================================================ */

(function () {
  var VERIFY_ENDPOINT = ""; // e.g. "https://api.example.com/auth/omc"
  var LS_SESSION = "omc_session_v1";
  var LS_AIRDROP = "omc_airdrop_v1";
  var LS_LANG = "omc_lang";

  var CHAIN_ID = 97;
  var CHAIN_HEX = "0x61";
  var CHAIN_NAME = "BNB Smart Chain Testnet";
  var EXPLORER = "https://testnet.bscscan.com";
  var CHAIN_PARAMS = {
    chainId: CHAIN_HEX,
    chainName: CHAIN_NAME,
    nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
    rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545"],
    blockExplorerUrls: [EXPLORER]
  };

  function T(k, p) { return window.i18nT ? window.i18nT(k, p) : k; }
  function $(id) { return document.getElementById(id); }

  function provider() {
    var eth = window.ethereum;
    if (!eth) return null;
    /* Multi-wallet browsers expose an array — prefer a real injected wallet */
    if (Array.isArray(eth.providers) && eth.providers.length) {
      var hit = null;
      eth.providers.forEach(function (p) {
        if (!hit && p && (p.isMetaMask || p.isOKExWallet || p.isBinance || p.isBitKeep || p.isRabby)) hit = p;
      });
      return hit || eth.providers[0];
    }
    return eth;
  }

  /* ---------- session ---------- */
  function readSession() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_SESSION));
      return s && s.address ? s : null;
    } catch (e) { return null; }
  }
  function writeSession(s) {
    try { s ? localStorage.setItem(LS_SESSION, JSON.stringify(s)) : localStorage.removeItem(LS_SESSION); } catch (e) {}
  }
  function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }

  /* ---------- airdrop local stats (menu rows) ---------- */
  function dayKeyUTC8(ts) { return new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10); }
  function airdropStats() {
    var entries = [];
    try { entries = (JSON.parse(localStorage.getItem(LS_AIRDROP)) || {}).entries || []; } catch (e) {}
    var today = dayKeyUTC8(Date.now()), n = 0;
    entries.forEach(function (ts) { if (dayKeyUTC8(ts) === today) n++; });
    return { total: entries.length, today: n, accum: entries.length * 20 };
  }

  /* ---------- toast (reuses main.js helper when available) ---------- */
  function toast(msg) {
    if (typeof window.showToast === "function") window.showToast(msg);
  }

  /* ============================================================
     Modal + nav markup
     ============================================================ */
  function injectModal() {
    if ($("wlModal")) return;
    var wrap = document.createElement("div");
    wrap.className = "wl-modal";
    wrap.id = "wlModal";
    wrap.hidden = true;
    wrap.innerHTML = [
      '<div class="wl-backdrop" data-wl-close></div>',
      '<div class="wl-card" role="dialog" aria-modal="true">',
      '  <button class="wl-x" data-wl-close aria-label="Close">✕</button>',
      '  <div class="wl-logo"><img src="assets/img/logo.png" alt="OMC" /></div>',
      '  <h3 data-i18n="wl.title">Connect wallet</h3>',
      '  <p class="wl-sub" data-i18n="wl.sub">Sign in to track your airdrop progress.</p>',
      '  <div class="wl-opts">',
      '    <button class="wl-opt" id="wlOptInjected">',
      '      <span class="ic">🦊</span>',
      '      <span class="txt"><b data-i18n="wl.injected">Browser wallet</b>',
      '        <i data-i18n="wl.injected_d">MetaMask, OKX, Binance Wallet…</i></span>',
      '      <span class="go">→</span>',
      '    </button>',
      '    <button class="wl-opt soon" disabled>',
      '      <span class="ic">📱</span>',
      '      <span class="txt"><b data-i18n="wl.mobile">WalletConnect / mobile wallets</b>',
      '        <i data-i18n="wl.mobile_d">Coming soon — use a browser wallet for now.</i></span>',
      '      <span class="go">·</span>',
      '    </button>',
      '  </div>',
      '  <details class="wl-risk" id="wlRisk">',
      '    <summary><span class="wl-risk-ic">⚠️</span><span data-i18n="wl.risk_q">Wallet shows a “Proceed with caution” warning?</span></summary>',
      '    <p data-i18n="wl.risk_a">MetaMask and some other wallets show a generic caution banner on newly launched domains and airdrop-related pages. It is the wallet’s built-in guard, not a judgment about this site. OMC only asks for one free, read-only signature — no transfers, no token approvals, no gas. If the banner appears, choose “Connect anyway / 仍然连接” to continue.</p>',
      '  </details>',
      '  <p class="wl-none" id="wlNone" hidden data-i18n="wl.none">No Web3 wallet detected.</p>',
      '  <a class="wl-install" id="wlInstall" href="https://metamask.io/download/" target="_blank" rel="noopener" hidden data-i18n="wl.install">Install MetaMask ↗</a>',
      '  <div class="wl-busy" id="wlBusy" hidden><span class="spin"></span><span data-i18n="wl.signing">Waiting for your signature…</span></div>',
      '  <p class="wl-hint" data-i18n="wl.sign_hint">🔒 Signing is free.</p>',
      '  <p class="wl-note" data-i18n="wl.note">Browsing never requires a wallet.</p>',
      '</div>'
    ].join("");
    document.body.appendChild(wrap);

    wrap.addEventListener("click", function (e) {
      if (e.target.closest("[data-wl-close]")) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
    $("wlOptInjected").addEventListener("click", connect);
  }

  function openModal() {
    injectModal();
    var m = $("wlModal");
    m.hidden = false;
    requestAnimationFrame(function () { m.classList.add("show"); });
    document.body.style.overflow = "hidden";
    var ok = !!provider();
    if ($("wlNone")) $("wlNone").hidden = ok;
    if ($("wlInstall")) $("wlInstall").hidden = ok;
    if ($("wlOptInjected")) $("wlOptInjected").disabled = !ok;
    if (window.i18nApply) window.i18nApply(window.i18nCurrent());
  }

  function closeModal() {
    var m = $("wlModal");
    if (!m) return;
    m.classList.remove("show");
    document.body.style.overflow = "";
    setTimeout(function () { m.hidden = true; }, 220);
  }

  function busy(on) {
    if ($("wlBusy")) $("wlBusy").hidden = !on;
    if ($("wlOptInjected")) $("wlOptInjected").disabled = on || !provider();
  }

  /* ============================================================
     Nav entry
     ============================================================ */
  function menusHTML(s) {
    var st = airdropStats();
    var onNet = s.chainId === CHAIN_ID;
    return [
      '<div class="wl-menu">',
      '  <div class="wl-menu-head">',
      '    <span class="mono" id="wlMenuAddr">' + s.address + '</span>',
      '    <button class="wl-mini" id="wlCopy" data-i18n="wl.copy">Copy</button>',
      '  </div>',
      '  <div class="wl-net ' + (onNet ? "ok" : "bad") + '" id="wlNet">',
      '    <span class="dot"></span>',
      '    <span>' + (onNet ? T("wl.net_ok") : T("wl.net_wrong")) + '</span>',
      '  </div>',
      '  <div class="wl-menu-stats">',
      '    <div><span data-i18n="wl.k_entries">Participations</span><b>' + st.total + '</b></div>',
      '    <div><span data-i18n="wl.k_accum">Accumulated</span><b>' + st.accum.toLocaleString("en-US") + '</b></div>',
      '    <div><span data-i18n="wl.k_today">Today</span><b>' + st.today + '</b></div>',
      '  </div>',
      onNet ? "" : '  <button class="wl-menu-item" id="wlSwitch" data-i18n="wl.switch_net">Switch to BSC Testnet</button>',
      '  <a class="wl-menu-item" href="' + EXPLORER + '/address/' + s.address + '" target="_blank" rel="noopener" data-i18n="wl.explorer">View on BscScan ↗</a>',
      '  <a class="wl-menu-item" href="airdrop.html" data-i18n="wl.open_airdrop">Open airdrop page →</a>',
      '  <button class="wl-menu-item danger" id="wlOut" data-i18n="wl.signout">Sign out</button>',
      '</div>'
    ].join("");
  }

  function renderNav() {
    var slot = $("walletNav");
    if (!slot) return;
    var s = readSession();
    if (!s) {
      slot.innerHTML = '<button class="wl-nav-btn" id="wlNavBtn">👛 <span data-i18n="nav.signin">Sign in</span></button>';
    } else {
      slot.innerHTML =
        '<div class="wl-account">' +
        '  <button class="wl-nav-btn on" id="wlNavBtn"><span class="wl-dot"></span>' +
        '    <span class="wl-addr">' + short(s.address) + '</span></button>' +
        menusHTML(s) +
        '</div>';
    }
    var btn = $("wlNavBtn");
    if (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!readSession()) { openModal(); return; }
        var acct = slot.querySelector(".wl-account");
        if (acct) acct.classList.toggle("open");
      });
    }
    bindMenu();
    if (window.i18nApply) window.i18nApply(window.i18nCurrent());
  }

  var bound = false;
  function bindMenu() {
    var copy = $("wlCopy"), out = $("wlOut"), sw = $("wlSwitch");
    if (copy) copy.addEventListener("click", function () {
      var s = readSession();
      if (!s) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s.address).then(function () { toast(T("js.copy_done")); });
      }
    });
    if (out) out.addEventListener("click", signOut);
    if (sw) sw.addEventListener("click", switchChain);

    if (!bound) {
      bound = true;
      document.addEventListener("click", function () {
        var acct = document.querySelector(".wl-account.open");
        if (acct) acct.classList.remove("open");
      });
    }
  }

  /* ============================================================
     Connect / sign / sign-out
     ============================================================ */
  function challenge(address, chainId) {
    var nonce = "";
    var hex = "0123456789abcdef";
    for (var i = 0; i < 16; i++) nonce += hex[Math.floor(Math.random() * 16)];
    return [
      "Omniverse Compute (OMC) — wallet sign-in",
      "",
      "Address: " + address,
      "Chain ID: " + chainId,
      "Nonce: " + nonce,
      "Issued: " + new Date().toISOString(),
      "",
      "Signing this message proves you control this address.",
      "It costs no gas and grants no spending rights."
    ].join("\n");
  }

  function connect() {
    var p = provider();
    if (!p) { toast(T("wl.err_no")); return; }
    busy(true);
    p.request({ method: "eth_requestAccounts" })
      .then(function (accs) {
        var addr = accs && accs[0];
        if (!addr) throw { _kind: "noaccount" };
        return p.request({ method: "eth_chainId" }).then(function (cid) {
          return { address: addr, chainId: parseInt(cid, 16) };
        });
      })
      .then(function (res) {
        var msg = challenge(res.address, res.chainId);
        return p.request({ method: "personal_sign", params: [msg, res.address] })
          .then(function (sig) {
            res.message = msg;
            res.signature = sig;
            return res;
          });
      })
      .then(function (sess) {
        sess.ts = Date.now();
        writeSession(sess);
        busy(false);
        closeModal();
        renderNav();
        notify();
        toast(T("js.toast_connected"));
        if (VERIFY_ENDPOINT) {
          try {
            fetch(VERIFY_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: sess.address, message: sess.message, signature: sess.signature
              })
            }).catch(function () {});
          } catch (e) {}
        }
      })
      .catch(function (err) {
        busy(false);
        if (err && err.code === 4001) toast(T("wl.err_rejected"));
        else if (err && err._kind === "noaccount") toast(T("wl.err_account"));
        else toast(T("js.toast_rejected"));
      });
  }

  function signOut() {
    writeSession(null);
    renderNav();
    notify();
    toast(T("js.toast_disconnected"));
  }

  function switchChain() {
    var p = provider();
    if (!p) return;
    p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] })
      .catch(function (e) {
        if (e && (e.code === 4902 || /unrecognized|not added|add chain/i.test(e.message || ""))) {
          return p.request({ method: "wallet_addEthereumChain", params: [CHAIN_PARAMS] });
        }
        throw e;
      })
      .then(function () { return p.request({ method: "eth_chainId" }); })
      .then(function (cid) {
        var s = readSession();
        if (s) { s.chainId = parseInt(cid, 16); writeSession(s); }
        renderNav();
        notify();
        toast(T("wl.net_ok"));
      })
      .catch(function () { toast(T("wl.net_wrong")); });
  }

  function notify() {
    var s = readSession();
    document.dispatchEvent(new CustomEvent("omc:wallet", {
      detail: { address: s ? s.address : "", chainId: s ? s.chainId : null }
    }));
  }

  /* ---------- provider events ---------- */
  function watch() {
    var p = provider();
    if (!p || !p.on) return;
    p.on("accountsChanged", function (accs) {
      var s = readSession();
      if (!s) return;
      if (accs && accs[0]) {
        if (accs[0].toLowerCase() !== s.address.toLowerCase()) {
          s.address = accs[0];
          s.message = "";
          s.signature = "";
          s.ts = Date.now();
          writeSession(s);
        }
      } else {
        writeSession(null);
      }
      renderNav();
      notify();
    });
    p.on("chainChanged", function (cid) {
      var s = readSession();
      if (!s) return;
      s.chainId = parseInt(cid, 16);
      writeSession(s);
      renderNav();
      notify();
    });
  }

  /* ---------- legacy migration: airdrop page used to own the wallet ---------- */
  function migrate() {
    if (readSession()) return;
    try {
      var st = JSON.parse(localStorage.getItem(LS_AIRDROP)) || {};
      if (st.wallet) {
        writeSession({ address: st.wallet, chainId: CHAIN_ID, message: "", signature: "", ts: Date.now(), migrated: true });
        delete st.wallet;
        localStorage.setItem(LS_AIRDROP, JSON.stringify(st));
      }
    } catch (e) {}
  }

  /* ---------- boot ---------- */
  function boot() {
    migrate();
    injectModal();
    renderNav();
    watch();
    notify();
    document.addEventListener("i18n:changed", renderNav);
  }

  window.OMCWallet = {
    address: function () { var s = readSession(); return s ? s.address : ""; },
    chainId: function () { var s = readSession(); return s ? s.chainId : null; },
    isConnected: function () { return !!readSession(); },
    short: short,
    connect: connect,
    open: openModal,
    signOut: signOut
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
