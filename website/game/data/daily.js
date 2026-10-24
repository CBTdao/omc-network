// 每日选题算法（游戏端与 SEO 页面生成端共用，避免两边算出不同的题）
//
// 两条硬规则：
// 1) 「今天」按 UTC 计算。构建机在 UTC+8，玩家分布在全球，若用本地时区，
//    同一天里不同玩家会拿到不同的题，和每日页写的答案对不上。UTC 是唯一共识。
// 2) 洗牌用 mulberry32 + 标准 Fisher-Yates。原来 `(seed >>> (i%24)) % (i+1)`
//    分布不均，6 题里固定有一两道长期霸榜/长期缺席。
(function (root) {
  function pad(n) { return String(n).padStart(2, '0'); }

  // UTC 日期键：YYYY-MM-DD
  function fmt(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function today() { return fmt(new Date()); }

  // FNV-1a：把任意字符串变成 32 位种子
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // mulberry32：小而够用的确定性 PRNG，返回 [0,1)
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 由日期决定的稳定选题：同一天，任何人、任何设备、构建期与运行期，结果一致
  function dailySet(P, day) {
    if (!P || !P.length) return [];
    var rand = rng(hash(String(day)));
    var arr = P.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr.slice(0, Math.min(5, arr.length));
  }

  // 这一题的 AI 图是否放左边。同一题同一天，客户端与答案页必须一致。
  function flip(id, day) { return hash(String(id) + '|' + String(day)) % 2 === 1; }

  root.__AOR_DAILY__ = { hash: hash, rng: rng, dailySet: dailySet, today: today, fmt: fmt, flip: flip };
})(typeof window !== 'undefined' ? window : globalThis);
