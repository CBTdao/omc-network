# X Developer 账号开通教程（OAuth 2.0 Bearer，用于 API 自动发帖）

> ⚠️ 关键事实（2026-11 实测 + 多源核实）：**X API 自 2026-02-06 起已彻底取消免费档**。新开发者一律走 **pay-per-use（按量付费）**，没有任何免费写额度。写操作按条扣费：纯文本推文 **$0.015/条**，含 URL 链接的推文 **$0.20/条**（贵 13 倍），summoned reply **$0.010/条**。旧的 Basic($200/月)/Pro($5000/月) 套餐已关闭新注册、存量用户在 2026-06/09 被强制迁移到 pay-per-use。**结论：经 API 发推=必花钱，但不用订月费，直接给项目充值 credits 即可按条扣。** 真正的「免费」只有两条：① 在 x.com 网站上手动发；② 用 x.com 自带的免费原生定时发布（web/桌面端，单条 ≤280 字符，可排到 18 个月后）。本教程用 **OAuth 2.0 Bearer**：只需一个令牌，且已实测认证通过（`@Omniverse_Depin` 识别成功）。

> 前提：你已有一个正常的 X 账号，且**最好已绑定手机号**（未验证手机号经常开不了 API）。

## 步骤

1. **打开开发者门户**
   浏览器访问 https://developer.x.com ，用你的 X 账号登录。

2. **接受协议 + 填基础信息**
   首次会让你接受《开发者协议》，并填姓名、用途简述（写 "posting project updates for my crypto/compute project" 之类即可）。
   提交后进入 Dashboard。

3. **创建 Project（项目）**
   Dashboard 里点 **Create Project**，起个名字（如 `OMC`），选用途（选 "Building a tool for myself" 或个人项目），绑一个 App 名。

4. **在 Project 下创建 App（应用）**
   项目里点 **Add App**，给 App 起名（如 `omc-poster`）。创建后进入 App 设置页。

5. **配置身份认证（关键）**
   进 App 的 **Settings → User authentication settings**（身份认证设置）：
   - **App permissions**：选 **Read and Write**（要发帖至少得 Read+Write；纯 Read 发不了）。
   - **Type of App**：选 **Web App**（下面 Website URL 和 Callback URL 是必填，填个占位即可，如 `https://omc.network` 和 `https://omc.network/callback`）。
   - 保存。保存后会生成 **Consumer Keys**：`API Key` 和 `API Key Secret`。

6. **生成 OAuth 2.0 访问令牌（推荐，只要一个值）**
   在 App 设置页滚到 **OAuth 2.0 Keys** 板块，找到 "Access Token" 一行，点 **Generate**：
   - 弹窗里勾选 `tweet.read`、`tweet.write`、`users.read`（后两个是发帖必需），可顺手勾 `offline.access`（令牌不易过期）。
   - 点底部 **Generate**，页面给出 **Access Token**（一长串）和 Refresh Token。
   - **复制 Access Token 那整串**发我（Refresh Token 自己存好备用）。
   （这是 OAuth 2.0 Bearer，绑定到你这个 X 账号，脚本用它发帖，无需 Consumer Key/Secret。）

7. **保存令牌到本地**
   你只需要这一条 **Access Token**（一长串）。
   存到本地一个 `.env` 文件（或随便一个本地记事本），**绝对不要提交到 GitHub / 不要贴到任何公开地方**。
   这条令牌等同于你账号的发帖密码，泄露 = 别人能用你号发帖。

## 拿到后怎么用

把 **Access Token** 那一条发给我，我运行 `scripts/post-x.mjs`（已支持 OAuth 2.0 Bearer），
按 `docs/marketing/x-threads-post-ready.md` 把线程发出去。

> 已实测：OAuth 2.0 认证成功（`@Omniverse_Depin` 已识别），但发帖返回 **HTTP 402 credits depleted**——
> 即项目还没有充值 credits（pay-per-use 额度为空）。**不是代码问题、也不是账号/权限问题**——X 从 2026-02 起任何写操作都按条扣费，额度空了就 402。
> 解决：去 Developer Console → 该项目 Billing 里充值 credits（先充 $5–10 足够发完这 10 条线程），充值后重跑 `scripts/post-x.mjs` 即可。
> 想零成本则按 `x-threads-post-ready.md` **手动在 x.com 上发**（免费）。

## 注意事项 / 坑

- **没有免费 API 档**：2026-02-06 起 X 取消全部免费档，新开发者统一 pay-per-use。x.com 网站上手动发免费；经 API 发推（POST /2/tweets）按条扣费（$0.015 无链接 / $0.20 含链接 / $0.010 summoned reply），额度空了返回 402 credits depleted。**无需订月费**，直接给项目充值 credits 即可。
- **成本实测估算（我们这 10 条线程 ≈ 80 推）**：若纯文本约 $1.2；若多数带链接约 $16；混合约 $8–16。比旧时代的 $100/月 Basic 订阅便宜得多——千万别去订月费套餐，直接 pay-per-use 充值最划算。
- **OAuth 1.0a 很脆**：那套 4 值（API Key/Secret + Access Token/Secret）只要任一项重新生成，另一半就作废，必须全部重新对齐。推荐用 OAuth 2.0 Bearer（只一个令牌）。
- **手机号验证**：主 X 账号没绑手机号的话，API 申请常被拒，先去 X 设置里绑好。
- **密钥安全**：Access Token 能以你身份发帖，务必本地保管，仓库 `.gitignore` 已忽略 `.env`，切勿提交 GitHub 或公开。
- **媒体上传**：免费/低档经 API 传图常受限；线程先发纯文字，要配图手动补，或用付费档。
- **速率**：付费档也有速率上限，10 条线程（~80 推）建议分几天或错峰发，别一分钟内砸完。
