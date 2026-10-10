/* ============================================================
   Omniverse Compute (OMC) — staking client
   Dependency-free. Talks to BNB Smart Chain Testnet over the
   user's injected EIP-1193 wallet (eth_sendTransaction) and a
   read-only HTTPS RPC (eth_call / eth_getBalance).

   There is no bundler, no ethers.js, no CDN: the ABI encoding and
   decoding below is written out by hand. That keeps the site a
   static, dependency-free build — and it means the only thing a
   visitor has to trust is the contract address printed on screen.

   Addresses come from contracts/deployments/bsc-testnet.json.
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- configuration ---------------- */

  var CFG = {
    chainId: 97,
    chainHex: "0x61",
    chainName: "BNB Smart Chain Testnet",
    rpc: "https://data-seed-prebsc-1-s1.binance.org:8545/",
    rpcFallback: [
      "https://data-seed-prebsc-1-s1.binance.org:8545/",
      "https://bsc-testnet-rpc.publicnode.com",
      "https://endpoints.omniatech.io/v1/bsc/testnet/public"
    ],
    explorer: "https://testnet.bscscan.com",
    token: "0x8B6a8A46cB2779688212f033e6a4Fc8e604363f6",
    staking: "0xA49537fA46172693c553E9A1824CdF7CA810AAFc",
    deployBlock: 135890000,
    /* Legacy points-only contract — no transfer/stake support. Kept read-only. */
    legacy: "0x3C7EDae9da38b72Db7AE98921eF0759d19dE7Cc5"
  };

  /* Function selectors — keccak256(signature)[0..4].
     Generated 2026-10-10 with ethers.keccak256 against the live ABI and
     cross-checked by calling each one on-chain. Regenerate with
     contracts/tools/compile.js after ANY ABI change — a stale selector
     silently reverts, it does not fail loudly. */
  var SEL = {
    /* ERC-20 (only the four calls this page needs) */
    balanceOf: "0x70a08231",
    allowance: "0xdd62ed3e",
    approve: "0x095ea7b3",
    /* test token */
    claimFaucet: "0x4fe15335",
    faucetReadyAt: "0xc8f4bbc7",
    faucetRemaining: "0x94ea409c",
    faucetAmount: "0x76697640",
    /* staking */
    stake: "0x10087fb1",
    unstake: "0x2e17de78",
    registerNode: "0x9a7389ca",
    heartbeat: "0x3defb962",
    claim: "0x4e71d92d",
    deregister: "0xaff5edb1",
    /* read-only */
    tierBaseDeposit: "0x8af4898c",   /* deprecated mirror; the ladder is authoritative */
    tierMinStake: "0x500f1240",
    minStakeForTier: "0x128285cf",
    emissionPerSecond: "0xd1164400",
    workUnitReward: "0x9a0d9917",
    heartbeatInterval: "0x561a4fac",
    heartbeatGrace: "0x618f1eba",
    tierCount: "0x36331c8f",
    token: "0xfc0c546a",
    endpoint: "0x10616114",
    nodeSummary: "0xfd371224",
    protocolStats: "0x5cba5713"
  };

  /* ---------------- tiny ABI codec ---------------- */

  function pad64(hex) {
    while (hex.length < 64) hex = "0" + hex;
    return hex;
  }
  function hexOf(n) {
    if (typeof n === "bigint") return n.toString(16);
    if (typeof n === "string" && n.slice(0, 2) === "0x") return BigInt(n).toString(16);
    return BigInt(n).toString(16);
  }
  function word(v) { return pad64(hexOf(v)); }
  function isAddr(a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ""); }
  function addrArg(a) { return word(BigInt(a.toLowerCase())); }
  function numArg(v) { return word(v); }

  /* dynamic string -> head is an offset; tail is len + right-padded data */
  function stringArg(s) {
    var bytes = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    var len = word(BigInt(bytes.length));
    var parts = "";
    for (var j = 0; j < bytes.length; j += 32) {
      var chunk = "";
      for (var k = 0; k < 32; k++) chunk += (j + k < bytes.length ? bytes[j + k].toString(16).padStart(2, "0") : "00");
      parts += chunk;
    }
    if (!parts) parts = pad64("");
    return { len: len, data: parts };
  }

  function decodeUint(hex32) { return BigInt("0x" + hex32.slice(-64)); }
  function decodeUintAt(hex, i) { return BigInt("0x" + hex.slice(i * 64, (i + 1) * 64)); }
  function decodeBoolAt(hex, i) { return decodeUintAt(hex, i) !== 0n; }

  /* ---------------- RPC ---------------- */

  var rpcIdx = 0;

  function rpcPost(method, params, url) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: method, params: params })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error.message || "rpc error");
      return j.result;
    });
  }

  function rpc(method, params) {
    var url = CFG.rpcFallback[rpcIdx % CFG.rpcFallback.length];
    return rpcPost(method, params, url).catch(function (e) {
      rpcIdx++;
      var alt = CFG.rpcFallback[rpcIdx % CFG.rpcFallback.length];
      if (alt === url) throw e;
      return rpcPost(method, params, alt);
    });
  }

  function ethCall(to, data) {
    return rpc("eth_call", [{ to: to, data: data }, "latest"]).then(function (hex) {
      return (hex || "0x").slice(2);
    });
  }

  /* ---------------- wallet ---------------- */

  function provider() {
    var eth = window.ethereum;
    if (!eth) return null;
    if (Array.isArray(eth.providers) && eth.providers.length) {
      var hit = null;
      eth.providers.forEach(function (p) {
        if (!hit && p && (p.isMetaMask || p.isOKExWallet || p.isBinance || p.isBitKeep || p.isRabby)) hit = p;
      });
      return hit || eth.providers[0];
    }
    return eth;
  }

  function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }

  function ensureChain() {
    var p = provider();
    if (!p) return Promise.reject(new Error("NO_WALLET"));
    return p.request({ method: "eth_chainId" }).then(function (id) {
      if (String(id).toLowerCase() === CFG.chainHex) return true;
      return p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CFG.chainHex }]
      }).catch(function (e) {
        if (e && (e.code === 4902 || /Unrecognized chain/i.test(e.message || ""))) {
          return p.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: CFG.chainHex,
              chainName: CFG.chainName,
              nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
              rpcUrls: [CFG.rpc],
              blockExplorerUrls: [CFG.explorer]
            }]
          });
        }
        throw e;
      });
    });
  }

  /* The site never asks for a signature here: a stake is a plain
     eth_sendTransaction from the wallet the visitor is already signed in
     with. Nothing is delegated, nothing is approved on the user's behalf. */
  function send(to, data, gasHint) {
    var p = provider();
    if (!p) return Promise.reject(new Error("NO_WALLET"));
    var from = window.OMCWallet && window.OMCWallet.address();
    if (!from) return Promise.reject(new Error("NOT_CONNECTED"));

    return ensureChain().then(function () {
      return p.request({
        method: "eth_sendTransaction",
        params: [{
          from: from,
          to: to,
          data: data,
          value: "0x0",
          gas: gasHint ? "0x" + BigInt(gasHint).toString(16) : undefined
        }]
      });
    });
  }

  function rcpt(hash) {
    return new Promise(function (resolve, reject) {
      var tries = 0;
      (function poll() {
        rpc("eth_getTransactionReceipt", [hash]).then(function (r) {
          if (r) return resolve(r);
          if (++tries > 120) return reject(new Error("TIMEOUT"));
          setTimeout(poll, 1500);
        }).catch(reject);
      })();
    });
  }

  /* ---------------- encoders ---------------- */

  var enc = {
    balanceOf: function (a) { return SEL.balanceOf + addrArg(a); },
    allowance: function (o, s) { return SEL.allowance + addrArg(o) + addrArg(s); },
    approve: function (s, v) { return SEL.approve + addrArg(s) + numArg(v); },
    claimFaucet: function () { return SEL.claimFaucet; },
    faucetReadyAt: function (a) { return SEL.faucetReadyAt + addrArg(a); },
    faucetRemaining: function () { return SEL.faucetRemaining; },
    faucetAmount: function () { return SEL.faucetAmount; },
    stake: function (amount, tier) {
      /* stake(uint256,uint8) — both are static, so they sit inline */
      return SEL.stake + word(BigInt(amount)) + word(BigInt(tier));
    },
    unstake: function (amount) { return SEL.unstake + word(BigInt(amount)); },
    registerNode: function (tier, ep) {
      /* registerNode(uint8,string) — head: tier + offset, tail: string */
      var s = stringArg(ep);
      return SEL.registerNode + word(BigInt(tier)) + word(64n) + s.len + s.data;
    },
    heartbeat: function () { return SEL.heartbeat; },
    claim: function () { return SEL.claim; },
    deregister: function () { return SEL.deregister; },
    tierBaseDeposit: function () { return SEL.tierBaseDeposit; },
    minStakeForTier: function (t) { return SEL.minStakeForTier + numArg(BigInt(t)); },
    tierMinStake: function (i) { return SEL.tierMinStake + numArg(BigInt(i)); },
    emissionPerSecond: function () { return SEL.emissionPerSecond; },
    workUnitReward: function () { return SEL.workUnitReward; },
    heartbeatInterval: function () { return SEL.heartbeatInterval; },
    heartbeatGrace: function () { return SEL.heartbeatGrace; },
    tierCount: function () { return SEL.tierCount; },
    token: function () { return SEL.token; },
    endpoint: function (a) { return SEL.endpoint + addrArg(a); },
    nodeSummary: function (a) { return SEL.nodeSummary + addrArg(a); },
    protocolStats: function () { return SEL.protocolStats; }
  };

  /* ---------------- decoders ---------------- */

  function decNodeSummary(hex) {
    if (!hex || hex.length < 64 * 13) return null;
    return {
      tier: Number(decodeUintAt(hex, 0)),
      registered: decodeBoolAt(hex, 1),
      earning: decodeBoolAt(hex, 2),
      overdue: decodeBoolAt(hex, 3),
      stake: decodeUintAt(hex, 4),
      pending: decodeUintAt(hex, 5),
      minStake: decodeUintAt(hex, 6),
      lastHeartbeat: decodeUintAt(hex, 7),
      deadline: decodeUintAt(hex, 8),
      missedHeartbeats: decodeUintAt(hex, 9),
      slashedTotal: decodeUintAt(hex, 10),
      workUnits: decodeUintAt(hex, 11),
      registeredAt: decodeUintAt(hex, 12)
    };
  }

  /* a single static return value (uint256 / bool / address-as-uint) */
  function decWord(hex) {
    if (!hex || hex.length < 64) return 0n;
    return decodeUintAt(hex, 0);
  }

  /* the dynamic string a view returns as the *first* value: head word = byte
     offset, then length, then the right-padded UTF-8 body */
  function decString(hex) {
    if (!hex || hex.length < 128) return "";
    /* `hex` is prefix-less throughout this module (see decodeUintAt), so every
       offset is a plain multiple of 64 characters. Layout of ABI-encoded
       `string`: [offset word][length word][right-padded body]. */
    try {
      var offWord = Number(decodeUintAt(hex, 0)); /* byte offset to the length word */
      if (!isFinite(offWord) || offWord % 32 !== 0) return "";
      var lenWord = offWord / 32;
      var len = Number(decodeUintAt(hex, lenWord));
      if (!isFinite(len) || len <= 0 || len > 8192) return "";
      var start = (lenWord + 1) * 64;
      if (start + len * 2 > hex.length) return "";
      var body = hex.slice(start, start + len * 2);
      var out = "";
      for (var i = 0; i < body.length; i += 2) out += String.fromCharCode(parseInt(body.substr(i, 2), 16));
      try { return decodeURIComponent(escape(out)); } catch (e) { return out; }
    } catch (e) { return ""; }
  }

  function decProtocolStats(hex) {
    if (!hex || hex.length < 64 * 8) return null;
    return {
      totalStake: decodeUintAt(hex, 0),
      emissionPerSecond: decodeUintAt(hex, 1),
      rewardLiquidity: decodeUintAt(hex, 2),
      accruedNotPaid: decodeUintAt(hex, 3),
      nodes: decodeUintAt(hex, 4),
      totalSlashed: decodeUintAt(hex, 5),
      totalWorkUnits: decodeUintAt(hex, 6),
      tierBaseDeposit: decodeUintAt(hex, 7)
    };
  }

  /* ---------------- formatting ---------------- */

  function fmt(v, dp) {
    var s = BigInt(v === undefined || v === null ? 0 : v).toString();
    var neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    while (s.length < 19) s = "0" + s;
    var whole = s.slice(0, s.length - 18);
    var frac = s.slice(s.length - 18).slice(0, dp === undefined ? 4 : dp).replace(/0+$/, "");
    whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + whole + (frac ? "." + frac : "");
  }

  function fmtDuration(sec) {
    sec = Number(sec);
    if (!isFinite(sec) || sec <= 0) return "0s";
    var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600);
    var m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    if (d) return d + "d " + h + "h";
    if (h) return h + "h " + m + "m";
    if (m) return m + "m " + s + "s";
    return s + "s";
  }

  function parseAmount(str) {
    var t = String(str || "").trim().replace(/,/g, "");
    if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
    var parts = t.split(".");
    var whole = parts[0] || "0";
    var frac = (parts[1] || "").slice(0, 18);
    while (frac.length < 18) frac += "0";
    try { return BigInt(whole + frac); } catch (e) { return null; }
  }

  function toHexWei(v) { return "0x" + BigInt(v).toString(16); }

  window.OMCStake = {
    CFG: CFG,
    SEL: SEL,
    enc: enc,
    rpc: rpc,
    ethCall: ethCall,
    send: send,
    rcpt: rcpt,
    ensureChain: ensureChain,
    decNodeSummary: decNodeSummary,
    decProtocolStats: decProtocolStats,
    decWord: decWord,
    decString: decString,
    fmt: fmt,
    fmtDuration: fmtDuration,
    parseAmount: parseAmount,
    short: short,
    isAddr: isAddr,
    provider: provider
  };
})();
