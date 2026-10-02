/* ============================================================
   Omniverse Compute (OMC) — i18n engine
   Dictionaries: assets/js/lang/{en,zh,ja,es,ko,pt,fr}.js
   ============================================================ */

(function () {
  var SUPPORTED = ["en", "zh", "ja", "es", "ko", "pt", "fr"];
  var LS_KEY = "omc_lang";

  function currentLang() {
    var saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch (e) {}
    return saved && SUPPORTED.indexOf(saved) !== -1 ? saved : "en";
  }

  function dict(lang) {
    return (window.I18N && window.I18N[lang]) || (window.I18N && window.I18N.en) || {};
  }

  function apply(lang) {
    var d = dict(lang);
    var fallback = dict("en");

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      var v = d[k] !== undefined ? d[k] : fallback[k];
      if (v !== undefined) el.innerHTML = v;
    });

    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-ph");
      var v = d[k] !== undefined ? d[k] : fallback[k];
      if (v !== undefined) el.setAttribute("placeholder", v);
    });

    document.documentElement.lang = lang;

    try { localStorage.setItem(LS_KEY, lang); } catch (e) {}

    document.dispatchEvent(new CustomEvent("i18n:changed", { detail: { lang: lang } }));
  }

  /* Translate with {param} substitution — used by main.js for dynamic strings */
  function t(key, params) {
    var lang = currentLang();
    var d = dict(lang);
    var s = d[key] !== undefined ? d[key] : (dict("en")[key] !== undefined ? dict("en")[key] : key);
    if (params) {
      Object.keys(params).forEach(function (p) {
        s = s.split("{" + p + "}").join(params[p]);
      });
    }
    return s;
  }

  function init() {
    var sel = document.getElementById("langSelect");

    /* First visit: auto-detect browser language */
    if (!currentLang() || !localStorage.getItem(LS_KEY)) {
      var nav = (navigator.language || "en").slice(0, 2).toLowerCase();
      var auto = SUPPORTED.indexOf(nav) !== -1 ? nav : "en";
      try { localStorage.setItem(LS_KEY, auto); } catch (e) {}
    }

    var lang = currentLang();
    if (sel) {
      sel.value = lang;
      sel.addEventListener("change", function () { apply(sel.value); });
    }
    apply(lang);
  }

  window.i18nT = t;
  window.i18nApply = apply;
  window.i18nCurrent = currentLang;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
