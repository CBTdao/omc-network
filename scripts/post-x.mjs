// OMC X 发帖脚本（支持 OAuth 2.0 Bearer 与 OAuth 1.0a 两种）
// 推荐用 OAuth 2.0：只给一个令牌，最简单。
//
// 用法 A（OAuth 2.0，推荐）：
//   X_BEARER_TOKEN=xxxx node scripts/post-x.mjs 1
// 用法 B（OAuth 1.0a，旧方式）：
//   X_API_KEY=... X_API_SECRET=... X_ACCESS_TOKEN=... X_ACCESS_TOKEN_SECRET=... node scripts/post-x.mjs 1
//
//   末尾数字 = 线程序号（1-10）；"all" = 全部（注意频率限制，建议分批）
// 不会把任何密钥写进文件；凭据从环境变量读取。

import crypto from "node:crypto";
import { threads } from "./x-threads.data.mjs";

function enc(s) {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function oauth1Header(method, url, creds) {
  const params = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const paramStr = Object.keys(params)
    .sort()
    .map((k) => enc(k) + "=" + enc(params[k]))
    .join("&");
  const base = method + "&" + enc(url) + "&" + enc(paramStr);
  const key = enc(creds.apiSecret) + "&" + enc(creds.accessTokenSecret);
  const sig = crypto.createHmac("sha1", key).update(base).digest("base64");
  params.oauth_signature = sig;
  return (
    "OAuth " +
    Object.keys(params)
      .sort()
      .map((k) => enc(k) + '="' + enc(params[k]) + '"')
      .join(", ")
  );
}

async function api(method, url, body, creds) {
  const headers = {};
  if (creds.mode === "oauth2") {
    headers["Authorization"] = "Bearer " + creds.token;
  } else {
    headers["Authorization"] = oauth1Header(method, url, creds);
  }
  const opts = { method, headers };
  if (body) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error("HTTP " + res.status + ": " + JSON.stringify(json));
    err.status = res.status;
    throw err;
  }
  return json;
}

async function postThread(tweets, creds) {
  let prevId = null;
  const ids = [];
  for (let i = 0; i < tweets.length; i++) {
    const text = tweets[i];
    if (text.length > 280) {
      console.warn(`  ⚠️ 第 ${i + 1} 推 ${text.length} 字符(>280)，跳过`);
      continue;
    }
    const body = { text };
    if (prevId) body.reply = { in_reply_to_tweet_id: prevId };
    const json = await api("POST", "https://api.x.com/2/tweets", body, creds);
    prevId = json.data.id;
    ids.push(prevId);
    console.log(`  ✓ ${i + 1}/${tweets.length} 已发 id=${prevId}`);
    if (i < tweets.length - 1) await new Promise((r) => setTimeout(r, 2500));
  }
  return ids;
}

async function main() {
  let creds;
  let modeLabel;
  if (process.env.X_BEARER_TOKEN) {
    creds = { mode: "oauth2", token: process.env.X_BEARER_TOKEN };
    modeLabel = "OAuth 2.0 Bearer";
  } else {
    creds = {
      mode: "oauth1",
      apiKey: process.env.X_API_KEY,
      apiSecret: process.env.X_API_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
    };
    modeLabel = "OAuth 1.0a";
    if (!creds.apiKey || !creds.apiSecret || !creds.accessToken || !creds.accessTokenSecret) {
      console.error("缺少凭据。请设置 X_BEARER_TOKEN（推荐），或 X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET。");
      process.exit(1);
    }
  }

  let me;
  try {
    me = await api("GET", "https://api.x.com/2/users/me", null, creds);
    console.log(`[${modeLabel}] 账号身份: @` + (me.data?.username || me.data?.id));
  } catch (e) {
    console.error("鉴权失败:", e.message);
    if (creds.mode === "oauth2") {
      console.error("→ 检查：令牌是否复制完整？生成时是否勾选了 tweet.read / tweet.write / users.read？");
    } else {
      console.error("→ OAuth 1.0a 配对失败。建议改用 OAuth 2.0：在门户 OAuth 2.0 板块点 Generate 生成一个令牌，再设 X_BEARER_TOKEN。");
    }
    process.exit(1);
  }

  const arg = process.argv[2] || "1";
  let toPost = [];
  if (arg === "all") {
    toPost = threads.map((t, i) => ({ i, t }));
  } else {
    const n = parseInt(arg, 10);
    if (isNaN(n) || n < 1 || n > threads.length) {
      console.error("线程序号无效（1-" + threads.length + " 或 all）");
      process.exit(1);
    }
    toPost = [{ i: n - 1, t: threads[n - 1] }];
  }

  for (const { i, t } of toPost) {
    console.log(`\n=== 线程 ${i + 1}（${t.length} 推） ===`);
    const ids = await postThread(t, creds);
    if (ids.length) {
      console.log("线程首推: https://x.com/" + me.data.username + "/status/" + ids[0]);
    }
    if (toPost.length > 1) await new Promise((r) => setTimeout(r, 5000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
