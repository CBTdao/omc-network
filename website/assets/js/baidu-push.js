/* Baidu automatic link push (自动推送).
   Docs: https://ziyuan.baidu.com/college/documentinfo?id=2492
   Every rendered page tells Baidu "this URL is live", which shortens crawl
   discovery for a site that is not ICP-filed and therefore has no push quota
   until the site is verified in Baidu Search Resource Platform.
   The script is a no-op outside mainland China and when loaded twice. */
(function () {
  var bp = document.createElement("script");
  var protocol = location.protocol === "https:" ? "https:" : "http:";
  bp.src = protocol + "//push.zhanzhang.baidu.com/push.js";
  var first = document.getElementsByTagName("script")[0];
  if (first && first.parentNode) first.parentNode.insertBefore(bp, first);
})();
