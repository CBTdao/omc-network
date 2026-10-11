/* ============================================================
   Omniverse Compute (OMC) — Binance Web3 Wallet SDK (web-side utilities)

   Why this file exists
   --------------------
   Binance's dApp Zone self-listing rule is: "Binance will only list the DApps
   that have completed the Binance Web3 wallet integration (including Binance
   Logo exposure) and pass all items in the self-test checklist."

   The SDK that integration refers to has THREE shapes, and only one of them
   applies to a build with no bundler:

     1. The Provider API — `window.binancew3w.ethereum`, a plain EIP-1193
        provider. No package, no script tag. wallet.js already resolves it
        first, ahead of window.ethereum / window.BinanceChain.
     2. Framework connectors — @binance/w3w-rainbow-connector-v2,
        @binance/w3w-blocknative-connector, @binance/w3w-wagmi-connector-v2,
        and @binance/w3w-ethereum-provider. All npm packages that need a
        bundler and a React/wagmi tree. Not applicable here, and not needed:
        the self-test checks behaviour, not which package produced it.
     3. The utility helpers in @binance/w3w-utils — `isInBinance`,
        `isExtensionInstalled`, `getDeeplink`. Small, pure, dependency-free.
        THIS is the part the site was missing, and it is the part that decides
        whether a visitor on a desktop browser can reach the wallet at all.

   So this file ports group 3. It is a faithful port, not an approximation:
   the deeplink template and the appId below are copied from
   @binance/w3w-utils@1.1.8 src/deeplink.ts, because a deeplink that is
   *nearly* right silently fails to open the App and cannot be debugged from
   the browser.

   No network access, no third-party script, no storage. Loaded before
   wallet.js on the pages that connect a wallet.
   ============================================================ */

(function () {
  /* Verbatim from @binance/w3w-utils@1.1.8 (src/deeplink.ts). The appId is the
     Binance dApp-browser mini-program id every dApp shares; it is not a
     per-project credential and not a secret. */
  var DEEPLINK_BASE = "bnc://app.binance.com/mp/app";
  var DEEPLINK_APP_ID = "yFK5FCqYprrXDiVFbhyRx7";
  var DEEPLINK_START_PAGE = "/pages/browser/index";
  var UNIVERSAL_LINK = "https://app.binance.com/en/download?_dp=";

  /* The upstream helper calls window.btoa directly, which throws on any
     character outside Latin-1. Every URL we hand it is ASCII, so the common
     path produces byte-identical output to upstream; the fallback only turns
     the throw into a correct UTF-8 encoding instead of a page error. */
  function b64(s) {
    try {
      return window.btoa(s);
    } catch (e) {
      var bytes = new TextEncoder().encode(s), bin = "";
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return window.btoa(bin);
    }
  }

  /* Official check, plus the injection the Binance App actually performs.
     Upstream tests only `window.ethereum.isBinance`, which is set by the
     browser extension; inside the App the wallet arrives at
     `window.binancew3w.ethereum`, so the upstream form alone reports `false`
     in the exact environment the dApp Zone reviewer tests in. */
  function isInBinance() {
    try {
      if (window.ethereum && window.ethereum.isBinance === true) return true;
      if (window.binancew3w && window.binancew3w.ethereum) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  /* Verbatim from the upstream source, including its return type: the whole
     optional chain is compared to `true`, so the result is a real boolean.
     Writing this with `&&` instead short-circuits to `undefined` on a plain
     browser, and any caller that branches on the value then takes the wrong
     path. */
  function isExtensionInstalled() {
    try {
      return !!(window.binancew3w && window.binancew3w.isExtension === true);
    } catch (e) {
      return false;
    }
  }

  /* getDeeplink(url, chainId) -> { bnc, http }
     `bnc` is the custom scheme; `http` is the universal link that falls back
     to the download page when the App is not installed. Both encode the same
     payload, so either can be used as the button's href. */
  function getDeepLink(url, chainId) {
    var cid = chainId || 56;
    var startPagePath = b64(DEEPLINK_START_PAGE);
    var startPageQuery = b64("url=" + url + "&defaultChainId=" + cid);
    var bnc = DEEPLINK_BASE + "?appId=" + DEEPLINK_APP_ID +
      "&startPagePath=" + startPagePath +
      "&startPageQuery=" + startPageQuery;
    return { http: UNIVERSAL_LINK + b64(bnc), bnc: bnc };
  }

  /* Hand off to the Binance App. Must run inside a user gesture: browsers
     block a custom-scheme navigation they did not see a click for. Returns
     the link that was used so a caller can log or test it. */
  function openInBinanceApp(url, chainId) {
    var target = url || window.location.href;
    var links = getDeepLink(target, chainId);
    window.location.href = links.http;
    return links;
  }

  window.OMCBinance = {
    appId: DEEPLINK_APP_ID,
    isInBinance: isInBinance,
    isExtensionInstalled: isExtensionInstalled,
    getDeepLink: getDeepLink,
    openInBinanceApp: openInBinanceApp
  };

  /* -------- deep-link entry inside the wallet band --------
     Only meaningful when we are NOT already inside the Binance App: inside it
     the provider is injected and the link would bounce the user out of the
     page they are already on. The entry ships with the `hidden` attribute, so
     a visitor who never gets the script never sees a dead control.

     The anchor gets a real href (rather than a JS navigation) so the target is
     visible on hover, middle-click and "copy link" all behave normally, and
     the navigation is unambiguously user-initiated — browsers block a custom
     scheme they did not see a click for. */
  function wireDeepLink() {
    var box = document.getElementById("wltOpenInApp");
    if (!box) return;
    if (isInBinance()) return;
    var a = box.querySelector("a");
    if (a) a.setAttribute("href", getDeepLink(window.location.href, 97).http);
    box.hidden = false;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireDeepLink);
  else wireDeepLink();
})();
