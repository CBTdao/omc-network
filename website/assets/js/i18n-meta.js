/* ============================================================
   Omniverse Compute (OMC) — head metadata i18n

   Why a separate file
   -------------------
   /assets/* is served with `Cache-Control: immutable` for a year, so the
   i18n engine itself must never be edited in place — a returning visitor
   would keep the old engine and silently lose the new behaviour. This is a
   NEW file, so it reaches everyone as soon as it deploys.

   What it does
   ------------
   i18n.js swaps text nodes via [data-i18n]. Head metadata cannot use that:
   <meta> carries its value in the `content` attribute. This file applies
   [data-i18n-content] to that attribute, then re-applies whenever the
   language changes (i18n.js dispatches `i18n:changed`).

   A crawler never runs this and never carries a stored language, so what
   Google and the social scrapers read is always the static English head —
   which is the point: the head a bot sees stays stable, while a visitor who
   explicitly picked Chinese gets a head that matches the page they are on.
   ============================================================ */

(function () {
  var DEFAULT_LANG = (typeof window.i18nDefault === "string" && window.i18nDefault) || "en";

  function dict(lang) {
    return (window.I18N && window.I18N[lang]) || (window.I18N && window.I18N[DEFAULT_LANG]) || {};
  }

  function apply() {
    var lang = window.i18nCurrent ? window.i18nCurrent() : DEFAULT_LANG;
    var d = dict(lang);
    var fallback = dict(DEFAULT_LANG);
    var nodes = document.querySelectorAll("[data-i18n-content]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var k = el.getAttribute("data-i18n-content");
      var v = d[k] !== undefined ? d[k] : fallback[k];
      if (v !== undefined) el.setAttribute("content", v);
    }
  }

  window.i18nApplyMeta = apply;
  document.addEventListener("i18n:changed", apply);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
})();
