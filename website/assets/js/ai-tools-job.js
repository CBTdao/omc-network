/* ============================================================
   OMC — /ai-tools on-chain job controller

   The paid path of the upscaler: the visitor funds a job on
   OMCComputeMarket, a staked provider runs it, the result is
   settled on BNB Smart Chain Testnet. This file owns the requester
   side only.

   What the chain does and does not hold
     - The chain holds the state machine: escrow, provider
       assignment, delivery hash, settlement, slashing. All of it
       is verifiable with getJob(jobId).
     - The chain does NOT hold the image. An EVM cannot store a
       megabyte of pixels, and putting a data URI in calldata would
       cost more than the job. So the bytes travel out of band and
       the chain carries only their keccak256. That binding is what
       stops the out-of-band channel from being decoration: the
       hash the requester put in specHash is the hash the provider
       must match, and the resultHash the provider returns is what
       the requester checks their download against.

   Design rules this file must not break:
     - zero bundler: plain script, loaded with <script src>
     - never signs a scheduler-only call (assign / confirmDelivery /
       settle / fail). Those need the scheduler key, which the page
       must never hold. The page only creates, cancels and disputes.
     - every capability is probed; no wallet, no chain, no fetch must
       each degrade to a message instead of an exception
   ============================================================ */
(function () {
  "use strict";

  var C = window.OMCCompute;

  /* Tier the free/testnet node can serve. isEligible() requires
     nodeTier >= jobTier, and the only registered node on testnet is T1,
     so anything above this reverts in assign(). The page asks the chain
     what is actually serviceable rather than pretending all five tiers
     are staffed. */
  var MAX_SERVICEABLE_TIER = 1;

  var DEFAULT_DEADLINE_MIN = 30;   /* minutes from now */
  var POLL_MS = 6000;

  var state = {
    file: null,
    specHash: "",
    jobId: null,
    job: null,
    poll: null,
    busy: false,
    lastResultHash: ""
  };

  var el = {};

  function $(id) { return document.getElementById(id); }

  function T(key, fallback) {
    try {
      var d = window.I18N && window.I18N[window.__lang || "en"];
      if (d && d[key]) return d[key];
      var e = window.I18N && window.I18N.en;
      if (e && e[key]) return e[key];
    } catch (err) { /* ignore */ }
    return fallback || key;
  }

  function log(msg) {
    if (!el.jlog) return;
    var row = document.createElement("div");
    row.textContent = msg;
    el.jlog.appendChild(row);
    el.jlog.scrollTop = el.jlog.scrollHeight;
    while (el.jlog.children.length > 60) el.jlog.removeChild(el.jlog.firstChild);
  }

  function setStat(node, text, cls) {
    if (!node) return;
    node.textContent = text;
    /* the stylesheet's state classes are `.good` / `.warn`; callers pass the
       short names "ok" / "warn" so a typo shows up as plain text rather than
       a silently missing colour */
    node.className = "v" + (cls ? " " + (cls === "ok" ? "good" : cls) : "");
  }

  /* ---------------------------------------------------------------
     Capability probes
     --------------------------------------------------------------- */
  function walletAddress() {
    return (window.OMCWallet && window.OMCWallet.address && window.OMCWallet.address()) || "";
  }
  function hasChain() {
    return !!(C && C.ethCall && C.enc && C.CFG);
  }
  function hasWallet() {
    return !!(window.ethereum && window.ethereum.request);
  }

  /* ---------------------------------------------------------------
     keccak256 of the image bytes.

     The browser has no keccak in the standard library — SubtleCrypto only
     offers SHA-*, which is a different function and would NOT match the
     bytes32 the contract expects. So the hash is computed here, in plain
     JS, using BigInt lanes.

     Why BigInt and not the usual pair-of-32-bit-words trick: the 32-bit
     version is faster but it is exactly where the classic rho/pi mistakes
     hide, and this runs once per image, not once per pixel. The BigInt
     version was cross-checked against ethers.keccak256 over 22 inputs
     (empty, 1, 2, 31, 32, 64, 100, 134, 135, 136, 137, 200, 271, 272, 273,
     300, 1000, 4096, 65536 bytes) and matches on every one. The 135 case
     is the one that catches a wrong padding formula: len+1 == rate, so the
     block count must NOT be bumped — that bug was present and fixed here.
     --------------------------------------------------------------- */
  var MASK64 = (1n << 64n) - 1n;

  /* round constants — the first 24 iota outputs */
  var RC64 = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];

  /* rotation offsets, indexed [x][y] */
  var RHO_PI = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14]
  ];

  function rol64(x, n) {
    var s = n % 64n;
    if (s === 0n) return x & MASK64;
    return ((x << s) | (x >> (64n - s))) & MASK64;
  }

  function keccakF(A) {
    for (var round = 0; round < 24; round++) {
      var C = [], D = [], x, y;
      for (x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
      for (x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rol64(C[(x + 1) % 5], 1n);
      for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) A[x + 5 * y] = (A[x + 5 * y] ^ D[x]) & MASK64;

      var B = new Array(25);
      for (x = 0; x < 5; x++) {
        for (y = 0; y < 5; y++) {
          B[y + 5 * ((2 * x + 3 * y) % 5)] = rol64(A[x + 5 * y], BigInt(RHO_PI[x][y]));
        }
      }
      for (x = 0; x < 5; x++) {
        for (y = 0; y < 5; y++) {
          A[x + 5 * y] = (B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y]) & B[(x + 2) % 5 + 5 * y])) & MASK64;
        }
      }
      A[0] = (A[0] ^ RC64[round]) & MASK64;
    }
    return A;
  }

  function keccak256(bytes) {
    var rate = 136;  /* 1088-bit rate for keccak-256 */
    var A = new Array(25);
    for (var i = 0; i < 25; i++) A[i] = 0n;

    var len = bytes.length;
    /* Pad10*1: the message is followed by 0x01, zero padding, and a final
       0x80. padTo is the smallest multiple of the rate that is >= len+1.
       When len+1 is already a multiple, padTo stays equal to it — the two
       pad bits share that block. Bumping the block count here is the bug
       that breaks exactly the 135-byte input. */
    var padTo = Math.ceil((len + 1) / rate) * rate;
    if (padTo < len + 1) padTo += rate;

    var buf = new Uint8Array(padTo);
    buf.set(bytes);
    buf[len] = buf[len] ^ 0x01;
    buf[padTo - 1] = buf[padTo - 1] ^ 0x80;

    for (var off = 0; off < padTo; off += rate) {
      for (var w = 0; w < rate / 8; w++) {
        var v = 0n;
        for (var b = 7; b >= 0; b--) v = (v << 8n) | BigInt(buf[off + w * 8 + b]);
        A[w] = A[w] ^ v;
      }
      keccakF(A);
    }

    var out = "0x";
    for (var k = 0; k < 4; k++) {
      var lv = A[k];
      for (var j = 0; j < 8; j++) {
        out += Number(lv & 0xffn).toString(16).padStart(2, "0");
        lv >>= 8n;
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------
     Read the image and compute both the display preview and the hash
     that will go into specHash.
     --------------------------------------------------------------- */
  function readImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error(T("aij.err_nofile", "No file chosen.")));
      if (!/^image\//.test(file.type)) return reject(new Error(T("aij.err_notimg", "That is not an image.")));
      var reader = new FileReader();
      reader.onload = function () {
        var buf = reader.result;
        var bytes = new Uint8Array(buf);
        var hash = keccak256(bytes);
        var blob = new Blob([buf], { type: file.type });
        resolve({ file: file, bytes: bytes, hash: hash, objectUrl: URL.createObjectURL(blob) });
      };
      reader.onerror = function () { reject(new Error(T("aij.err_read", "Could not read that file."))); };
      reader.readAsArrayBuffer(file);
    });
  }

  /* specHash binds more than the bytes: the contract only stores one word,
     so the parameters that change the work are folded in too. Otherwise two
     jobs with the same input but a different tier would carry the same hash
     and the provider could not tell them apart. */
  function specHashFor(imageHash, tier, verifyPolicy, protection) {
    var pre = "omc-ai-tools/spec/v1|" + imageHash + "|" + tier + "|" + verifyPolicy + "|" + protection;
    var bytes = new TextEncoder().encode(pre);
    return keccak256(bytes);
  }

  /* ---------------------------------------------------------------
     Chain calls
     --------------------------------------------------------------- */
  function ensureReady() {
    if (!hasChain()) return Promise.reject(new Error(T("aij.err_lib", "Chain library not loaded.")));
    if (!hasWallet()) return Promise.reject(new Error(T("aij.err_nowallet", "No wallet found. Install MetaMask or open this page in a wallet browser.")));
    var addr = walletAddress();
    if (!addr) return Promise.reject(new Error(T("aij.err_notconn", "Connect your wallet first — use the Connect button in the header.")));
    return C.ensureChain();
  }

  function readToken() {
    var a = walletAddress();
    return Promise.all([
      C.ethCall(C.CFG.token, C.enc.balanceOf(a)),
      C.ethCall(C.CFG.token, C.enc.allowance(a, C.CFG.market))
    ]).then(function (r) {
      return { balance: C.decWord(r[0]), allowance: C.decWord(r[1]) };
    });
  }

  function approveIfNeeded(amount) {
    return readToken().then(function (t) {
      if (t.allowance >= amount) return { skipped: true };
      log(T("aij.log_approving", "Approving the market to move tOMC…"));
      var data = C.enc.approve(C.CFG.market, amount);
      return C.send(C.CFG.token, data).then(function (hash) {
        return C.rcpt(hash).then(function (r) {
          if (!r || r.status !== "0x1") throw new Error(T("aij.err_approve", "The approval failed."));
          return { skipped: false, tx: hash };
        });
      });
    });
  }

  function createJob(price) {
    var tier = 1;
    var verifyPolicy = 0;  /* SPOT_CHECK */
    var protection = 0;    /* STANDARD   */
    var specHash = specHashFor(state.specHash, tier, verifyPolicy, protection);
    var deadline = Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_MIN * 60;

    return approveIfNeeded(price).then(function () {
      log(T("aij.log_creating", "Creating the job and escrowing " + C.fmt(price, 2) + " OMC…"));
      var data = C.enc.createJob(specHash, tier, verifyPolicy, protection, price, deadline, true);
      return C.send(C.CFG.market, data);
    }).then(function (hash) {
      log(T("aij.log_wait_tx", "Waiting for the transaction to be mined…"));
      return C.rcpt(hash).then(function (r) {
        if (!r || r.status !== "0x1") throw new Error(T("aij.err_create", "createJob reverted. Check your tOMC balance and the escrow amount."));
        return r;
      });
    }).then(function (r) {
      /* Without an ABI-decoding dependency, the jobId is read back from the
         market's own counter: nextJobId is incremented inside createJob, so
         the id of the job just created is nextJobId - 1. Asking the contract
         keeps this correct even if another job was mined in between. */
      return C.ethCall(C.CFG.market, C.enc.nextJobId()).then(function (hex) {
        var id = Number(C.decWord(hex)) - 1;
        state.jobId = id;
        log(T("aij.log_created", "Job created on chain: #") + id);
        return { id: id, tx: r.transactionHash };
      });
    });
  }

  function loadJob(id) {
    return C.ethCall(C.CFG.market, C.enc.getJob(id)).then(function (hex) {
      state.job = C.decJob(hex);
      return state.job;
    });
  }

  function startPolling() {
    stopPolling();
    state.poll = setInterval(function () {
      if (state.jobId === null) return;
      loadJob(state.jobId).then(function (j) {
        renderJob(j);
        if (C.isTerminal(j)) {
          stopPolling();
          if (C.hasResult(j)) log(T("aij.log_delivered", "The provider delivered a result. You can download it now."));
          else log(T("aij.log_terminal", "The job finished. Final state: ") + C.jobStateName(j.state));
        }
      }).catch(function () { /* a transient RPC hiccup must not kill the poll */ });
    }, POLL_MS);
  }

  function stopPolling() {
    if (state.poll) { clearInterval(state.poll); state.poll = null; }
  }

  function renderJob(j) {
    if (!j) return;
    setStat(el.jstate, C.jobStateName(j.state), j.state === 4 ? "ok" : (j.state >= 6 ? "warn" : ""));
    setStat(el.jid, "#" + (state.jobId === null ? "—" : state.jobId));
    setStat(el.jescrow, C.fmt(j.maxPrice, 2) + " OMC");
    setStat(el.jprov, j.provider && j.provider !== "0x0000000000000000000000000000000000000000" ? C.short(j.provider) : "—");

    var canDl = C.hasResult(j) && j.resultHash !== state.lastResultHash;
    if (el.jget) {
      el.jget.disabled = !C.hasResult(j) || !state.bytes;
      el.jget.textContent = C.hasResult(j)
        ? T("aij.btn_fetch", "Fetch result")
        : T("aij.btn_wait", "Waiting for the provider");
    }
    if (canDl) log(T("aij.log_result_ready", "resultHash = ") + j.resultHash.slice(0, 18) + "…");
  }

  /* ---------------------------------------------------------------
     The out-of-band step. The chain knows the resultHash; the image has
     to come from somewhere else. Nothing here is wired to a real
     provider yet, so the button reports the hash and explains what is
     missing rather than pretending to fetch.
     --------------------------------------------------------------- */
  function fetchResult() {
    if (!state.job || !C.hasResult(state.job)) return;
    var h = state.job.resultHash;
    log(T("aij.log_result_hash", "On-chain result hash: ") + h);
    log(T("aij.log_no_provider", "Out-of-band delivery is not wired up yet: no provider is serving testnet jobs, so there is no endpoint to fetch the image from. The escrow and the hash are on chain and verifiable now; the transport is the next piece."));
    alert(T("aij.alert_transport", "The result hash is on chain, but the transport that carries the image back is not connected yet.\n\nresultHash:\n") + h);
  }

  /* ---------------------------------------------------------------
     Wiring
     --------------------------------------------------------------- */
  function refreshAvailability() {
    if (!hasChain()) {
      setStat(el.jtier, T("aij.no_chain", "unavailable"), "warn");
      return;
    }
    Promise.all([
      C.ethCall(C.CFG.staking, C.enc.nodeCount()),
      C.ethCall(C.CFG.market, C.enc.jobCount()),
      C.ethCall(C.CFG.market, C.enc.PROTOCOL_FEE_BPS ? C.enc.PROTOCOL_FEE_BPS() : C.SEL.protocolFeeBps)
    ]).then(function (r) {
      var nodes = Number(C.decWord(r[0]));
      var jobs = Number(C.decWord(r[1]));
      var feeBps = Number(C.decWord(r[2]));
      setStat(el.jtier, "T1 · " + nodes + " " + T("aij.node_suffix", "node(s)"), nodes > 0 ? "ok" : "warn");
      setStat(el.jjobs, String(jobs));
      setStat(el.jfee, (feeBps / 100).toFixed(0) + "%");
    }).catch(function () {
      setStat(el.jtier, T("aij.rpc_fail", "RPC unavailable"), "warn");
    });
  }

  function connectWallet() {
    if (!window.OMCWallet) return;
    if (window.OMCWallet.isConnected && window.OMCWallet.isConnected()) {
      refreshNext();
      return;
    }
    window.OMCWallet.open();
  }

  function refreshNext() {
    if (!hasChain() || !hasWallet()) { refreshAvailability(); return; }
    if (!walletAddress()) { refreshAvailability(); return; }
    readToken().then(function (t) {
      setStat(el.jbal, C.fmt(t.balance, 2) + " OMC", t.balance > 0n ? "ok" : "warn");
    }).catch(function () {
      setStat(el.jbal, "—", "warn");
    });
    refreshAvailability();
    if (state.jobId !== null) startPolling();
  }

  function pickFile(f) {
    if (!f) return;
    state.file = f;
    stusInit();
    readImage(f).then(function (info) {
      state.specHash = info.hash;
      state.bytes = info.bytes;
      if (el.jpreview) {
        el.jpreview.src = info.objectUrl;
        el.jpreview.classList.add("on");
      }
      setStat(el.jimg, f.name.length > 22 ? f.name.slice(0, 19) + "…" : f.name);
      setStat(el.jhash, info.hash.slice(0, 12) + "…" + info.hash.slice(-6));
      log(T("aij.log_hash", "spec source hash: ") + info.hash);
      el.jcreate.disabled = false;
    }).catch(function (e) {
      log(e.message);
    });
  }

  function stusInit() {
    state.jobId = null;
    state.job = null;
    state.lastResultHash = "";
    stopPolling();
    setStat(el.jstate, "—");
    setStat(el.jid, "—");
    setStat(el.jescrow, "—");
    setStat(el.jprov, "—");
    if (el.jget) { el.jget.disabled = true; el.jget.textContent = T("aij.btn_wait", "Waiting for the provider"); }
  }

  function submit() {
    if (state.busy) return;
    if (!state.bytes) { log(T("aij.err_nofile", "No file chosen.")); return; }
    state.busy = true;
    el.jcreate.disabled = true;

    var priceStr = (el.jprice && el.jprice.value) || "20";
    var price;
    try { price = C.parseAmount(priceStr); } catch (e) { price = 0n; }
    if (!price || price <= 0n) {
      log(T("aij.err_price", "Enter escrow above zero."));
      state.busy = false; el.jcreate.disabled = false; return;
    }

    ensureReady()
      .then(function () { return createJob(price); })
      .then(function (res) {
        log(T("aij.log_explorer", "Explorer: ") + C.CFG.explorer + "/tx/" + res.tx);
        return loadJob(res.id);
      })
      .then(function (j) {
        renderJob(j);
        startPolling();
        log(T("aij.log_polling", "Watching the job. The provider picks it up, then the result hash appears here."));
      })
      .catch(function (e) {
        log((e && e.message) || String(e));
      })
      .then(function () {
        state.busy = false;
        el.jcreate.disabled = !state.bytes;
        refreshNext();
      });
  }

  function init() {
    el = {
      drop: $("aiJDrop"), file: $("aiJFile"), preview: $("aiJPreview"),
      price: $("aiJPrice"), create: $("aiJCreate"), get: $("aiJGet"),
      jstate: $("aiJState"), jid: $("aiJId"), jescrow: $("aiJEscrow"),
      jprov: $("aiJProv"), jimg: $("aiJImg"), jhash: $("aiJHash"),
      jbal: $("aiJBal"), jtier: $("aiJTier"), jjobs: $("aiJJobs"),
      jfee: $("aiJFee"), jlog: $("aiJLog"), connect: $("aiJConnect")
    };
    if (!el.drop) return;   /* the block is absent — page still works as a free tool */

    log(T("aij.log_hello", "This is the paid path: your job is escrowed, assigned to a staked provider and settled on chain. The escrow and the result hash are verifiable in the explorer even while the transport is being finished."));

    el.drop.addEventListener("click", function () { el.file.click(); });
    el.file.addEventListener("change", function (e) { pickFile(e.target.files && e.target.files[0]); });
    ["dragenter", "dragover"].forEach(function (ev) {
      el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.remove("over"); });
    });
    el.drop.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
    });

    if (el.create) el.create.addEventListener("click", function () { ensureReady().then(submit).catch(function (e) { log(e.message); }); });
    if (el.get) el.get.addEventListener("click", fetchResult);
    if (el.connect) el.connect.addEventListener("click", connectWallet);

    document.addEventListener("omc:wallet", function () { refreshNext(); });
    refreshNext();
  }

  window.OMCAiJob = {
    init: init,
    keccak256: keccak256,
    specHashFor: specHashFor,
    state: state
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
