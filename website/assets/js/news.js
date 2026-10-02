/* ============================================================
   Omniverse Compute (OMC) — News page renderer
   Reads window.OMC_NEWS (assets/data/news.js) and the i18n
   dictionaries, renders the feed, the filter chips and the
   sidebar "latest" card. Re-renders on language change.
   ============================================================ */

(function () {
  var list = document.getElementById("newsList");
  if (!list) return;

  var LANGS = { en: "en-US", zh: "zh-CN", ja: "ja-JP", es: "es-ES", ko: "ko-KR", pt: "pt-BR", fr: "fr-FR" };
  var KIND_KEY = { dev: "nw.dev", airdrop: "nw.airdrop", eco: "nw.eco", gov: "nw.gov" };
  var active = "all";

  function T(k, p) { return window.i18nT ? window.i18nT(k, p) : k; }
  function lang() { return window.i18nCurrent ? window.i18nCurrent() : "en"; }

  function fmt(iso, opts) {
    var d = new Date(iso + "T00:00:00Z");
    try {
      return new Intl.DateTimeFormat(LANGS[lang()] || "en-US", opts).format(d);
    } catch (e) { return iso; }
  }
  function dateLabel(iso) {
    return fmt(iso, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  }
  function monthLabel(iso) {
    return fmt(iso, { month: "short", timeZone: "UTC" });
  }

  function posts() {
    var arr = (window.OMC_NEWS || []).slice();
    arr.sort(function (a, b) {
      if (!!b.pin !== !!a.pin) return b.pin ? 1 : -1;
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
    return arr;
  }

  function card(p) {
    var ext = p.href.indexOf("http") === 0;
    return [
      '<article class="news-item' + (p.pin ? " pinned" : "") + '" data-kind="' + p.kind + '">',
      '  <div class="ni-date"><b>' + new Date(p.date + "T00:00:00Z").getUTCDate() + "</b>" +
      "<span>" + monthLabel(p.date) + "</span></div>",
      '  <div class="ni-body">',
      '    <div class="ni-meta">',
      '      <span class="ni-tag k-' + p.kind + '">' + T(KIND_KEY[p.kind] || "nw.dev") + "</span>",
      '      <span class="ni-time">' + dateLabel(p.date) + "</span>",
      p.pin ? '      <span class="ni-pin">📌 ' + T("nw.pin") + "</span>" : "",
      "    </div>",
      "    <h3>" + T(p.t) + "</h3>",
      "    <p>" + T(p.d) + "</p>",
      '    <a class="ni-link" href="' + p.href + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" +
      T("nw.open") + "</a>",
      "  </div>",
      "</article>"
    ].join("");
  }

  function render() {
    var all = posts();
    var arr = active === "all" ? all : all.filter(function (p) { return p.kind === active; });

    list.innerHTML = arr.length
      ? arr.map(card).join("")
      : '<div class="news-empty">' + T("nw.empty") + "</div>";

    var cnt = document.getElementById("newsCount");
    if (cnt) cnt.textContent = T("nw.count", { n: arr.length });

    var latest = document.getElementById("newsLatest");
    if (latest && all.length) {
      var p = all[0];
      latest.innerHTML =
        '<a href="' + p.href + '"' + (p.href.indexOf("http") === 0 ? ' target="_blank" rel="noopener"' : "") + ">" +
        '<span class="nl-date">' + dateLabel(p.date) + "</span>" +
        "<b>" + T(p.t) + "</b></a>";
    }

    document.querySelectorAll("#newsFilters .nf").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-kind") === active);
    });
  }

  document.querySelectorAll("#newsFilters .nf").forEach(function (b) {
    b.addEventListener("click", function () {
      active = b.getAttribute("data-kind");
      render();
    });
  });

  document.addEventListener("i18n:changed", render);
  render();
})();
