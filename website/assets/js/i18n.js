/* ============================================================
   Omniverse Compute (OMC) — i18n engine
   Dictionaries: assets/js/lang/{en,zh,ja,es,ko,pt,fr}.js

   Language policy
   ---------------
   English is the ONE and ONLY default, for every visitor, from every
   region. There is deliberately NO navigator.language / geo detection.
   The only thing that can override the default is an explicit pick in
   the language switcher — and that pick is the only value ever written
   to storage, so a stale default can never get "stuck" on a visitor.
   ============================================================ */

(function () {
  var SUPPORTED = ["en", "zh", "ja", "es", "ko", "pt", "fr"];
  var LS_KEY = "omc_lang";
  var LS_RESET_KEY = "omc_lang_reset";

  /* Bump when the default-language policy changes: every visitor is
     re-judged once, ignoring whatever was stored before. */
  var LANG_VERSION = "2";

  /* Hard default — not configurable, not detected. */
  var DEFAULT_LANG = "en";

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* One-off migration. Earlier builds resolved the language from the browser
     and persisted it, so some visitors still carry a stale non-English value.
     Drop it once, then re-judge from scratch. After this runs, a visitor only
     ever sees a non-English page if they picked that language themselves. */
  function migrate() {
    if (read(LS_RESET_KEY) === LANG_VERSION) return;
    drop(LS_KEY);
    store(LS_RESET_KEY, LANG_VERSION);
  }

  /* A valid language the visitor explicitly chose, or null. */
  function savedLang() {
    var saved = read(LS_KEY);
    return saved && SUPPORTED.indexOf(saved) !== -1 ? saved : null;
  }

  function currentLang() {
    return savedLang() || DEFAULT_LANG;
  }

  function dict(lang) {
    return (window.I18N && window.I18N[lang]) || (window.I18N && window.I18N[DEFAULT_LANG]) || {};
  }

  /* persist = true only for an explicit user switch. */
  function apply(lang, persist) {
    if (SUPPORTED.indexOf(lang) === -1) lang = DEFAULT_LANG;

    var d = dict(lang);
    var fallback = dict(DEFAULT_LANG);

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

    /* Only an explicit choice is remembered. The English default is never
       written, so it cannot turn into a stale stored preference later. */
    if (persist) store(LS_KEY, lang);

    document.dispatchEvent(new CustomEvent("i18n:changed", { detail: { lang: lang } }));
  }

  /* Translate with {param} substitution — used by main.js for dynamic strings */
  function t(key, params) {
    var lang = currentLang();
    var d = dict(lang);
    var s = d[key] !== undefined ? d[key] : (dict(DEFAULT_LANG)[key] !== undefined ? dict(DEFAULT_LANG)[key] : key);
    if (params) {
      Object.keys(params).forEach(function (p) {
        s = s.split("{" + p + "}").join(params[p]);
      });
    }
    return s;
  }

  function init() {
    migrate();

    var sel = document.getElementById("langSelect");
    var lang = currentLang();

    if (sel) {
      sel.value = lang;
      sel.addEventListener("change", function () { apply(sel.value, true); });
    }
    apply(lang);
  }

  window.i18nT = t;
  window.i18nApply = apply;
  window.i18nCurrent = currentLang;
  window.i18nDefault = DEFAULT_LANG;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
