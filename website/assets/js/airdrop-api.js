/* ============================================================
   OMC — airdrop ledger client
   ------------------------------------------------------------
   Registers an airdrop entry against the signing wallet and keeps it in the
   server-side ledger (api/airdrop/*), so entries survive a cleared browser and
   follow the wallet across devices.

   The flow is: build the canonical message → personal_sign → POST. The server
   rebuilds the same message byte for byte and requires the recovered signer to
   equal the claimed address, so nothing in this file can be trusted to lie.

   Degradation: if the ledger is not configured (no DATABASE_URL) the API
   answers 503 and this module reports offline; main.js then keeps the old
   browser-local preview, and the page says so.
   ============================================================ */
(function () {
  "use strict";

  var PURPOSE = "Omniverse Compute (OMC) — airdrop entry";
  var ENDPOINT = "/api/airdrop";

  var state = { online: null, checking: null };

  function normalize(a) { return String(a || "").trim().toLowerCase(); }

  function dayKeyUTC8(date) {
    var ms = (date instanceof Date ? date.getTime() : Number(date)) + 8 * 3600 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  function nonce() {
    var hex = "0123456789abcdef";
    var out = "";
    for (var i = 0; i < 16; i++) out += hex[Math.floor(Math.random() * 16)];
    return out;
  }

  /* Must stay byte-identical to website/api/_lib/entry-message.js */
  function buildMessage(address, day, referrer, n) {
    return [
      PURPOSE,
      "",
      "Address: " + normalize(address),
      "Day: " + day + " (UTC+8)",
      "Referrer: " + (referrer ? normalize(referrer) : "none"),
      "Nonce: " + n,
      "",
      "Signing this message registers one airdrop entry for the day above.",
      "It costs no gas and grants no spending rights."
    ].join("\n");
  }

  function json(res) {
    return res.json().catch(function () { return {}; });
  }

  /* One probe per page load: is the ledger actually wired up? */
  function probe() {
    if (state.online !== null) return Promise.resolve(state.online);
    if (state.checking) return state.checking;
    state.checking = fetch(ENDPOINT + "/summary", { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) { state.online = false; return false; }
        return json(res).then(function (b) { state.online = !!b.ok; return state.online; });
      })
      .catch(function () { state.online = false; return false; })
      .then(function (v) { state.checking = null; return v; });
    return state.checking;
  }

  function isOnline() { return state.online === true; }
  function isOffline() { return state.online === false; }

  function summary(address) {
    var addr = normalize(address);
    if (!addr) return Promise.resolve(null);
    return fetch(ENDPOINT + "/summary?address=" + encodeURIComponent(addr), {
      headers: { Accept: "application/json" }
    })
      .then(function (res) {
        if (res.status === 503) { state.online = false; return null; }
        if (!res.ok) return null;
        state.online = true;
        return json(res);
      })
      .catch(function () { state.online = false; return null; });
  }

  /* Invite code from referral.js, kept alongside the entry so a code can be
     resolved to a wallet later without a second registration. */
  function ownCode() {
    try {
      var r = window.OMCReferral;
      if (r && typeof r.myCode === "function") return r.myCode() || "";
    } catch (e) {}
    return "";
  }

  function register() {
    var wallet = window.OMCWallet;
    var address = wallet ? wallet.address() : "";
    if (!address) return Promise.resolve({ ok: false, code: "NO_WALLET" });

    var provider = wallet.provider ? wallet.provider() : null;
    if (!provider) return Promise.resolve({ ok: false, code: "NO_PROVIDER" });

    /* An inviter address is only present on ?ref=0x… links; the short-code
       system is carried in `code` instead. */
    var refParam = "";
    try {
      var m = /[?&]ref=([^&#]+)/.exec(location.search);
      if (m) refParam = normalize(decodeURIComponent(m[1]));
    } catch (e) {}
    var referrer = /^0x[0-9a-f]{40}$/.test(refParam) && refParam !== normalize(address)
      ? refParam
      : null;

    var day = dayKeyUTC8(new Date());
    var message = buildMessage(address, day, referrer, nonce());

    return provider
      .request({ method: "personal_sign", params: [message, address] })
      .then(function (signature) {
        var body = { address: normalize(address), message: message, signature: signature };
        if (referrer) body.referrer = referrer;
        var code = ownCode();
        if (code) body.code = code;
        return fetch(ENDPOINT + "/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body)
        });
      })
      .then(function (res) {
        if (res.status === 503) { state.online = false; return { ok: false, code: "UNAVAILABLE" }; }
        state.online = true;
        return json(res).then(function (b) {
          if (b && b.ok) {
            b.entries = b.entries || {};
            return b;
          }
          return { ok: false, code: (b && b.code) || "SERVER_ERROR", entries: b && b.entries };
        });
      })
      .catch(function (err) {
        /* Wallet-side rejection (user pressed cancel) vs transport failure. */
        var code = err && (err.code === 4001 || err.code === "ACTION_REJECTED")
          ? "USER_REJECTED"
          : "NETWORK";
        return { ok: false, code: code };
      });
  }

  window.OMCAirdrop = {
    probe: probe,
    isOnline: isOnline,
    isOffline: isOffline,
    summary: summary,
    register: register,
    buildMessage: buildMessage,
    dayKeyUTC8: dayKeyUTC8
  };
})();
