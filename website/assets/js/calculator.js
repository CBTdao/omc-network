/* ============================================================
   OMC — GPU cloud cost calculator (calculator.html)

   RATES: USD per GPU-hour, ON-DEMAND LIST PRICES, US regions
   (AWS us-east-1 / Google Cloud us-central1 / Azure East US),
   observed September 2026.

   Basis: hyperscaler capacity is sold in 8-GPU machine shapes, so the
   comparable per-GPU figure is the node price divided by eight.
   `node` holds the published node price; `rate` holds node / 8.

   >>> Keep this table in sync with the reference table in calculator.html <<<

   OMC publishes no network rate. Any OMC figure shown in the UI is
   computed from a rate the VISITOR typed, and is labelled as such.
   ============================================================ */

(function () {
  "use strict";

  var RATES = {
    H100: {
      spec: { aws: "p5.48xlarge", gcp: "a3-highgpu-8g", azure: "ND96isr H100 v5" },
      node: { aws: 55.04, gcp: 88.49, azure: 98.32 },
      rate: { aws: 6.88, gcp: 11.06, azure: 12.29 }
    },
    H200: {
      spec: { aws: "p5en.48xlarge", gcp: "a3-ultragpu-8g", azure: "ND96isr H200 v5" },
      node: { aws: 63.30, gcp: 84.81, azure: 110.24 },
      rate: { aws: 7.91, gcp: 10.60, azure: 13.78 }
    }
  };

  var PROVIDERS = ["aws", "gcp", "azure"];

  var state = { gpu: "H100", count: 8, hours: 730, hypo: null };

  function $(id) { return document.getElementById(id); }

  function money(n, dec) {
    if (!isFinite(n)) return "—";
    return "$" + n.toLocaleString("en-US", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  }

  function multiples(x) {
    /* 1.79 -> "1.79 ", 2.00 -> "2" */
    return String(Number(x.toFixed(2)));
  }

  function clampCount(v) {
    v = Math.round(Number(v));
    if (!isFinite(v) || v < 1) v = 1;
    return Math.min(512, v);
  }

  function clampHours(v) {
    v = Math.round(Number(v));
    if (!isFinite(v) || v < 1) v = 1;
    return Math.min(730, v);
  }

  function renderCards() {
    var t = RATES[state.gpu] || RATES.H100;
    var cards = document.querySelectorAll("#calcCards .calc-card");

    Array.prototype.forEach.call(cards, function (card) {
      var p = card.getAttribute("data-prov");
      var perHr = t.rate[p];
      if (perHr === undefined) return;

      var specEl = card.querySelector(".cc-spec");
      if (specEl) specEl.textContent = t.spec[p];

      var m = card.querySelector('[data-role="month"]');
      if (m) m.textContent = money(perHr * state.count * state.hours, 0);

      var h = card.querySelector('[data-role="hour"]');
      if (h) h.textContent = money(perHr, 2);
    });
  }

  function renderSpread() {
    var t = RATES[state.gpu] || RATES.H100;
    var vals = [];
    PROVIDERS.forEach(function (p) { if (t.rate[p] !== undefined) vals.push(t.rate[p]); });
    if (!vals.length) return;

    var lo = Math.min.apply(null, vals);
    var hi = Math.max.apply(null, vals);
    var el = $("spreadX");
    if (el) el.textContent = multiples(hi / lo) + "×";
  }

  function renderHypo() {
    var t = RATES[state.gpu] || RATES.H100;
    var box = $("coOut");
    var monthEl = $("coMonth");
    var deltaEl = $("coDelta");
    if (!box || !monthEl || !deltaEl) return;

    var r = state.hypo;
    if (r === null || !isFinite(r) || r <= 0) { box.hidden = true; return; }

    var hypoMonth = r * state.count * state.hours;
    var awsMonth = t.rate.aws * state.count * state.hours;
    var delta = (1 - hypoMonth / awsMonth) * 100;

    monthEl.textContent = money(hypoMonth, 0);
    deltaEl.textContent = (delta >= 0 ? "−" : "+") + Math.abs(delta).toFixed(0) + "%";
    deltaEl.className = "co-delta " + (delta >= 0 ? "good" : "bad");
    box.hidden = false;
  }

  function render() {
    renderCards();
    renderSpread();
    renderHypo();
  }

  function markActive(group, match) {
    if (!group) return;
    Array.prototype.forEach.call(group.querySelectorAll("button"), function (b) {
      b.classList.toggle("active", match(b));
    });
  }

  function init() {
    /* GPU model */
    var segGpu = $("segGpu");
    if (segGpu) {
      segGpu.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("button[data-gpu]") : null;
        if (!b) return;
        state.gpu = b.getAttribute("data-gpu");
        markActive(segGpu, function (x) { return x === b; });
        render();
      });
    }

    /* GPU count */
    var inCount = $("inCount");
    function setCount(v) {
      state.count = clampCount(v);
      if (inCount) inCount.value = String(state.count);
      render();
    }
    var bMinus = $("btnMinus"), bPlus = $("btnPlus");
    if (bMinus) bMinus.addEventListener("click", function () { setCount(state.count - 1); });
    if (bPlus) bPlus.addEventListener("click", function () { setCount(state.count + 1); });
    if (inCount) {
      inCount.addEventListener("input", function () { setCount(inCount.value); });
      inCount.addEventListener("change", function () { setCount(inCount.value); });
    }

    /* Hours per month */
    var segHours = $("segHours"), inHours = $("inHours"), outHours = $("outHours");
    function setHours(v) {
      state.hours = clampHours(v);
      if (inHours) inHours.value = String(state.hours);
      if (outHours) outHours.textContent = String(state.hours);
      markActive(segHours, function (x) {
        return Number(x.getAttribute("data-hours")) === state.hours;
      });
      render();
    }
    if (segHours) {
      segHours.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("button[data-hours]") : null;
        if (!b) return;
        setHours(b.getAttribute("data-hours"));
      });
    }
    if (inHours) inHours.addEventListener("input", function () { setHours(inHours.value); });

    /* Hypothetical OMC rate */
    var inHypo = $("inHypo");
    if (inHypo) {
      inHypo.addEventListener("input", function () {
        var raw = inHypo.value.trim();
        state.hypo = raw === "" ? null : Number(raw);
        renderHypo();
      });
    }

    /* count input may have been pre-filled by the browser */
    if (inCount && inCount.value) state.count = clampCount(inCount.value);
    if (inHours && inHours.value) state.hours = clampHours(inHours.value);

    render();

    /* re-render after a language switch (numbers and labels are separate nodes) */
    document.addEventListener("i18n:changed", render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
