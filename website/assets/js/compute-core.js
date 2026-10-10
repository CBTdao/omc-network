/* ============================================================
   Omniverse Compute (OMC) — AI Compute Station client
   Dependency-free. Same approach as stake-core.js: hand-written ABI
   encoding/decoding, the injected EIP-1193 wallet for writes and a
   read-only HTTPS RPC for reads. No bundler, no ethers.js, no CDN.

   The station is the requester side of the network: it reads the
   staking ladder straight out of OMCStaking (so the two pages can
   never disagree) and quotes, escrows and settles jobs through
   OMCComputeMarket.

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
    market: "0x5795393f33F6E27797499b1C61422ACeF0555709",
    deployBlock: 135890000
  };

  /* Function selectors — keccak256(signature)[0..4].
     Generated 2026-10-10 with ethers.keccak256 against the compiled ABI.
     Regenerate with contracts/tools/compile.js after ANY ABI change: a
     stale selector silently reverts on write and returns garbage on read. */
  var SEL = {
    /* ERC-20 */
    balanceOf: "0x70a08231",
    allowance: "0xdd62ed3e",
    approve: "0x095ea7b3",
    /* test token faucet */
    faucetRemaining: "0x94ea409c",
    claimFaucet: "0x4fe15335",
    /* staking — read through, never duplicated */
    minStakeForTier: "0x128285cf",
    nodeSummary: "0xfd371224",
    nodeCount: "0x6da49b83",
    stakingStats: "0x5cba5713",
    /* market */
    createJob: "0x31c27fd5",
    cancelJob: "0x1dffa3dc",
    dispute: "0x86d6282c",
    getJob: "0xbf22c457",
    jobCount: "0x4c5d8a0f",
    isEligible: "0xbfcbd230",
    providerStanding: "0xd65354fd",
    marketStats: "0x5cba5713",
    protocolFeeBps: "0xbe378228",
    disputeWindow: "0xf585dc57"
  };

  /* published, contract-level constants — read back at runtime by loadParams() */
  var PARAMS = {
    protocolFeeBps: 300, // 3%   [whitepaper 7.1]
    disputeWindow: 172800, // 48h  [whitepaper 5]
    omcFeeDiscountBps: 1000 // 10% off the fee when paying in OMC [7.1]
  };

  /* ============================================================
     tiny ABI codec — every hex string here is WITHOUT a 0x prefix once
     it leaves `ethCall`, and every index is a 64-char word offset.
     ============================================================ */

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

  /* bytes32 argument: the hash is already 32 bytes, pass the payload through */
  function bytes32Arg(h) {
    var b = (h || "").replace(/^0x/, "");
    while (b.length < 64) b += "0";
    return b.slice(0, 64);
  }

  function decodeUintAt(hex, i) { return BigInt("0x" + hex.slice(i * 64, (i + 1) * 64)); }
  function decodeBoolAt(hex, i) { return decodeUintAt(hex, i) !== 0n; }
  function decodeAddrAt(hex, i) {
    var w = hex.slice(i * 64, (i + 1) * 64);
    return "0x" + w.slice(24);
  }
  /* a single static return value */
  function decWord(hex) {
    if (!hex || hex.length < 64) return 0n;
    return decodeUintAt(hex, 0);
  }

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

  /* A job is a plain eth_sendTransaction from the wallet the visitor is
     already signed in with. Nothing is delegated, nothing signed blind. */
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
    faucetRemaining: function () { return SEL.faucetRemaining; },
    claimFaucet: function () { return SEL.claimFaucet; },

    minStakeForTier: function (t) { return SEL.minStakeForTier + numArg(BigInt(t)); },
    nodeSummary: function (a) { return SEL.nodeSummary + addrArg(a); },
    nodeCount: function () { return SEL.nodeCount; },
    stakingStats: function () { return SEL.stakingStats; },

    /* createJob(bytes32,uint8,uint8,uint8,uint256,uint64,bool) — all static */
    createJob: function (specHash, tier, verifyPolicy, protection, maxPrice, deadline, paidInOMC) {
      return SEL.createJob +
        bytes32Arg(specHash) +
        word(BigInt(tier)) +
        word(BigInt(verifyPolicy)) +
        word(BigInt(protection)) +
        word(BigInt(maxPrice)) +
        word(BigInt(deadline)) +
        word(paidInOMC ? 1n : 0n);
    },
    cancelJob: function (id) { return SEL.cancelJob + numArg(BigInt(id)); },
    dispute: function (id) { return SEL.dispute + numArg(BigInt(id)); },
    getJob: function (id) { return SEL.getJob + numArg(BigInt(id)); },
    jobCount: function () { return SEL.jobCount; },
    isEligible: function (a, t) { return SEL.isEligible + addrArg(a) + numArg(BigInt(t)); },
    providerStanding: function (a, t, r) {
      return SEL.providerStanding + addrArg(a) + numArg(BigInt(t)) + numArg(BigInt(r));
    },
    marketStats: function () { return SEL.marketStats; },
    protocolFeeBps: function () { return SEL.protocolFeeBps; },
    disputeWindow: function () { return SEL.disputeWindow; }
  };

  /* ---------------- decoders ---------------- */

  /* getJob(uint256) returns the Job struct: 8 static words after the head */
  function decJob(hex) {
    if (!hex || hex.length < 64 * 16) return null;
    /* the tuple is returned inline; `state` and the two enums are uint8 */
    return {
      requester: decodeAddrAt(hex, 0),
      provider: decodeAddrAt(hex, 1),
      hardwareTier: Number(decodeUintAt(hex, 2)),
      verifyPolicy: Number(decodeUintAt(hex, 3)),
      protection: Number(decodeUintAt(hex, 4)),
      state: Number(decodeUintAt(hex, 5)),
      maxPrice: decodeUintAt(hex, 6),
      paid: decodeUintAt(hex, 7),
      feePaid: decodeUintAt(hex, 8),
      createdAt: decodeUintAt(hex, 9),
      deadline: decodeUintAt(hex, 10),
      deliveredAt: decodeUintAt(hex, 11),
      paidInOMC: decodeBoolAt(hex, 12),
      specHash: "0x" + hex.slice(13 * 64, 14 * 64),
      resultHash: "0x" + hex.slice(14 * 64, 15 * 64)
    };
  }

  /* providerStanding(address,uint8,uint8) -> (bool,uint256,uint256,uint256) */
  function decStanding(hex) {
    if (!hex || hex.length < 64 * 4) return null;
    return {
      eligible: decodeBoolAt(hex, 0),
      stake: decodeUintAt(hex, 1),
      requiredStake: decodeUintAt(hex, 2),
      worstCasePenalty: decodeUintAt(hex, 3)
    };
  }

  /* protocolStats() on the market: 9 uint256 words */
  function decMarketStats(hex) {
    if (!hex || hex.length < 64 * 9) return null;
    return {
      jobsTotal: decodeUintAt(hex, 0),
      jobsSettled: decodeUintAt(hex, 1),
      jobsFailed: decodeUintAt(hex, 2),
      escrowedNow: decodeUintAt(hex, 3),
      settledVolume: decodeUintAt(hex, 4),
      feesCollected: decodeUintAt(hex, 5),
      feesBurned: decodeUintAt(hex, 6),
      slashPaidToRequesters: decodeUintAt(hex, 7),
      assignedNow: decodeUintAt(hex, 8)
    };
  }

  /* OMCStaking.protocolStats(): 8 uint256 words — only the first four matter here */
  function decStakingStats(hex) {
    if (!hex || hex.length < 64 * 8) return null;
    return {
      totalStake: decodeUintAt(hex, 0),
      emissionPerSecond: decodeUintAt(hex, 1),
      rewardLiquidity: decodeUintAt(hex, 2),
      accruedNotPaid: decodeUintAt(hex, 3),
      nodes: decodeUintAt(hex, 4),
      totalSlashed: decodeUintAt(hex, 5),
      totalWorkUnits: decodeUintAt(hex, 6)
    };
  }

  /* ---------------- formatting ---------------- */

  var DEC = 18;

  function fmt(wei, dp) {
    if (wei === null || wei === undefined) return "—";
    var neg = wei < 0n;
    var v = neg ? -wei : wei;
    var s = v.toString();
    while (s.length <= DEC) s = "0" + s;
    var whole = s.slice(0, s.length - DEC) || "0";
    var frac = s.slice(s.length - DEC);
    if (dp === 0) {
      frac = "";
    } else {
      var d = dp === undefined ? 4 : dp;
      frac = frac.slice(0, d);
      while (frac.length && frac[frac.length - 1] === "0") frac = frac.slice(0, -1);
      if (frac) frac = "." + frac;
    }
    var out = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + frac;
    return (neg ? "-" : "") + out;
  }

  function parseAmount(str) {
    if (str === null || str === undefined) return null;
    var t = String(str).trim().replace(/,/g, "");
    if (!t) return null;
    if (!/^\d*\.?\d*$/.test(t)) return null;
    var parts = t.split(".");
    var whole = parts[0] || "0";
    var frac = (parts[1] || "").slice(0, DEC);
    while (frac.length < DEC) frac += "0";
    try { return BigInt(whole + frac); } catch (e) { return null; }
  }

  function fmtDuration(sec) {
    var s = Number(sec);
    if (!isFinite(s) || s <= 0) return "—";
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + m + "m";
    return m + "m";
  }

  /* ============================================================
     QUOTING — the station's own arithmetic, on top of on-chain data
     ============================================================ */

  /* Verification multipliers from whitepaper 5 ("Cost to requester").
     These are structure, not a published price: nothing here produces a
     dollar figure. See the note rendered on the page. */
  var VERIFY_MULT = {
    0: { lo: 1.05, hi: 1.1 }, // spot-check: base × (1 + a), a = 5–10%
    1: { lo: 2.0, hi: 3.0 }, // full redundancy
    2: { lo: 1.5, hi: 2.0 } // TEE premium (indicative band only)
  };

  var PROTECT_MULT = { 0: 1.0, 1: 1.0, 2: 1.0 };

  /* Work out what a job costs in OMC, given a reference rate in tOMC per
     GPU-hour set by the visitor. Returns the full breakdown so the page can
     show where every part of the number comes from. */
  function quote(opts) {
    var rate = opts.rate; // tOMC per GPU-hour, a string the visitor typed
    var hours = Number(opts.hours) || 0;
    var verify = opts.verifyPolicy || 0;
    var protect = opts.protection || 0;
    var paidInOMC = !!opts.paidInOMC;

    var r = parseFloat(String(rate).replace(/,/g, ""));
    if (!isFinite(r) || r <= 0) return { ok: false, reason: "rate" };
    if (hours <= 0) return { ok: false, reason: "hours" };

    var mult = VERIFY_MULT[verify] || VERIFY_MULT[0];
    var pm = PROTECT_MULT[protect] || 1;
    var base = r * hours * pm;
    var low = base * mult.lo;
    var high = base * mult.hi;

    /* protocol fee 3% on the settled amount [7.1]; paying in OMC takes 10%
       off the fee, not off the principle */
    var feeRate = PARAMS.protocolFeeBps / 10000;
    if (paidInOMC) feeRate *= 1 - PARAMS.omcFeeDiscountBps / 10000;

    function withFee(x) { return x * (1 + feeRate); }

    return {
      ok: true,
      rate: r,
      hours: hours,
      cpuLow: low,
      cpuHigh: high,
      totalLow: withFee(low),
      totalHigh: withFee(high),
      feeRate: feeRate,
      multLo: mult.lo,
      multHi: mult.hi
    };
  }

  /* ---------------- aggregate load ---------------- */

  /* Structural 5-tier ladder, used only when the staking contract cannot be
     reached (offline, RPC down, node still booting). It is a *display* fallback
     so the page never renders an empty tier picker — it is NOT the source of
     truth. minStakeForTier() on OMCStaking remains the single definition; the
     regression suite asserts this file never hard-codes a ladder as data. */
  var FALLBACK_LADDER = [
    { tier: 1, min: 20n },
    { tier: 2, min: 100n },
    { tier: 3, min: 500n },
    { tier: 4, min: 1000n },
    { tier: 5, min: 5000n }
  ];

  function loadLadder() {
    var out = [];
    var jobs = [];
    for (var t = 1; t <= 5; t++) {
      (function (tier) {
        jobs.push(
          ethCall(CFG.staking, enc.minStakeForTier(tier)).then(function (hex) {
            out.push({ tier: tier, min: decWord(hex) });
          })
        );
      })(t);
    }
    return Promise.all(jobs)
      .then(function () {
        out.sort(function (a, b) { return a.tier - b.tier; });
        return out;
      })
      .catch(function () {
        /* chain unreachable — fall back to the structural table and flag it */
        return FALLBACK_LADDER.map(function (r) {
          return { tier: r.tier, min: r.min };
        });
      });
  }

  function loadNetwork() {
    return Promise.all([
      ethCall(CFG.staking, enc.stakingStats()),
      ethCall(CFG.market, enc.marketStats())
    ]).then(function (r) {
      return { staking: decStakingStats(r[0]), market: decMarketStats(r[1]) };
    });
  }

  function loadParams() {
    return Promise.all([
      ethCall(CFG.market, enc.protocolFeeBps()),
      ethCall(CFG.market, enc.disputeWindow())
    ]).then(function (r) {
      PARAMS.protocolFeeBps = Number(decWord(r[0]));
      PARAMS.disputeWindow = Number(decWord(r[1]));
      return PARAMS;
    }).catch(function () { return PARAMS; });
  }

  window.OMCCompute = {
    CFG: CFG,
    SEL: SEL,
    PARAMS: PARAMS,
    VERIFY_MULT: VERIFY_MULT,
    enc: enc,
    quote: quote,
    rpc: rpc,
    ethCall: ethCall,
    send: send,
    rcpt: rcpt,
    ensureChain: ensureChain,
    decJob: decJob,
    decStanding: decStanding,
    decMarketStats: decMarketStats,
    decStakingStats: decStakingStats,
    decWord: decWord,
    fmt: fmt,
    fmtDuration: fmtDuration,
    parseAmount: parseAmount,
    short: short,
    isAddr: isAddr,
    provider: provider,
    loadLadder: loadLadder,
    loadNetwork: loadNetwork,
    loadParams: loadParams
  };
})();
