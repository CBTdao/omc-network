# 全球收录：外部引荐操作清单

2026-11-08 · 配套 `OMC-全球收录调研与行动建议-2026-11-08.md`

站内部分已落地：`build_sitemap.py` 自动重建 sitemap、覆盖度守卫、`node scripts/publish.mjs` 一键重建+验收+推送、三个主题支柱页、实体消歧、`robots.txt` 放行检索类爬虫。这份文档只列**需要在站外、由人手动完成**的动作，按零预算、个人开发者可执行的顺序排列。没有一项需要企业资质或付费投放。

> 一步可选操作：`scripts/publish.yml` 是 GitHub Actions 版本，把它复制成 `.github/workflows/publish.yml` 就能让每次 push 到 main 自动跑完整链并推 IndexNow。当前部署 PAT 没有 `workflow` scope，GitHub 会拒绝由它创建该目录下的文件；在 GitHub 网页上新建该文件（用账号完整权限）即可，不需要换 token。启用前用 `node scripts/publish.mjs` 效果相同。

---

## 一、先做这三件（Google Search Console，10 分钟）

本站已通过 DNS TXT 验证（`google-site-verification=eWG5…`），所以不需要再加验证文件或 meta。

1. **提交 / 重新提交 sitemap**：`https://omc.network/sitemap.xml`。现在由 `build_sitemap.py` 自动重建，`lastmod` 取页面真实 `dateModified`，每次内容发布都会变。
2. **把两份 RSS 也作为 sitemap 提交**：`https://omc.network/news/feed.xml` 与 `https://omc.network/zh/news/feed.xml`。Google 官方 2026-10 确认 RSS 可以在 GSC 当 sitemap 提交；`llms.txt` 不行。
3. **对 6 个新主题页用「请求编入索引」**：`/agent-economy`、`/verifiable-compute`、`/post-quantum` 及对应 `/zh/` 三个。界面按钮实测约 10–15 URL/天，同一 URL 重复请求无效，点一次就够。

> 别用 `site:omc.network` 数收录量。Google 官方说返回数是估算、不必然包含全部已索引 URL。看 GSC「索引 → 页面」，按 sitemap 过滤，重点看 `Crawled – currently not indexed` 的原因。

**Bing 侧**：`https://www.bing.com/webmasters` 里看 Sitemap Index Coverage 与 IndexNow Insights；本机 `node scripts/bing-submit.mjs --status` 能读到每个 URL 的 `LastCrawledDate`，这是唯一能证明"真的被抓过"的数据。

---

## 二、现在就能申请的免费入口

| 入口 | 地址 | 门槛 / 动作 |
|---|---|---|
| BNB Chain Kickstart | `bnbchain.org` 意向表 | 一份表单，Building / Growth 两阶段；官方周报「Live Projects This Week」是引用源。免费，入选不等于背书 |
| DappRadar | `dappradar.com` Developer Dashboard | 免费提交，填测试网合约地址、250×250 logo（≤150KB）、≤5 标签，可 claim 已有页 |
| GitHub awesome-list | 对应仓库提 PR | 找 DePIN / BNB Chain / GPU compute 类清单，按模板加一行 |
| Trust Wallet assets | `trustwallet/assets` 提 PR | 代币图标与元数据，需主网合约地址 |
| token list | Uniswap / PancakeSwap token list 仓库 | 同上，GitHub PR |
| dev.to | `dev.to/omniverse_depin`（已有账号，2 篇） | 把三个支柱页改写成技术长文，文末带原文链接；这是已有渠道，成本最低 |
| Hacker News | Show HN | 新号 14 天考察、禁拉票、硬广秒 ban。等有一份原创数据报告再发 |
| r/BNBChain / r/CryptoMoonShots | Reddit | 先养 karma、披露与项目关系；r/CryptoCurrency 需 60+ 天账号 / 100+ karma 且 AutoMod 屏蔽代币名 |
| DeFiLlama | `docs.llama.fi/list-your-project` → GitHub PR | fork → 写 adapter → `yarn test` → PR，合并后 ≤24h 上榜。技术门槛最高，可信度也最高 |

**顺序建议**：BNB Chain Kickstart → DappRadar → dev.to 三篇 → GitHub PR → 有原创数据后 Show HN。前四项一天能做完，且都是后续聚合站的数据上游。

---

## 三、代币上线后再补

这些入口要求真实交易或已验证的主网合约，现在提交会被退回，先记着：

- **CoinGecko**：官网底部 Request Form → New Coin/Token Listing。收录免费，Regular Pass ≤5 天，Fast Pass 24h / $1,000（不必买）。**任何人索要 listing 费都是骗局**。
- **CoinMarketCap**：在线表单是唯一入口，免费队列按行业热度排、可能数月——越早交越好。DEXScan 会按合约自动出页。
- **BscScan** `bscscan.com/tokenupdate`：需登录且合约已 Verify & Publish。
- **CryptoRank / Coinpaprika / DEX Screener**：审批较宽松，与 CG/CMC 同步补。

---

## 四、内容与社区的正确用法

外部引荐的目的不是"传权重"——X、Reddit、LinkedIn 的外链默认 nofollow。目的是**让记者、聚合站和答案引擎看见**。

- 三个支柱页已经是「定义句 → 参数表 → Q&A」结构，适合整段引用。把 `/agent-economy`、`/verifiable-compute`、`/post-quantum` 改写成 dev.to 技术长文，每篇挂回原文链接。
- forum 子站的「12 网络 DePIN 对比追踪」「每兆瓦人力」「GPU 云定价」升级成带方法、带日期、带原始数据的报告页，用一份原创数字去 pitch 编辑部（Cointelegraph `editorial@cointelegraph.com`、CoinDesk `/contact`）。第三方 earned media 是 AI 答案引擎引用相关性最高的信号。
- 社群动作以 discovery 为目标，24 小时内别跨 sub 群发同一链接，会触发全站 spam 过滤。

---

## 五、明确不做

- **付费通稿**：Chainwire $1,399 起、PR Newswire 400 词约 $1,070 + 年费、Cointelegraph PR $5–15k。ICODA 实测 28 份通稿中 71% 为 nofollow，115 个落地页无一被 AI 引用；Google 把「新闻稿中含优化锚文本的链接」列为 Link spam。
- **买外链 / PBN / 批量 AI 站群 / 伪造媒体报道**：Google 2025-12 spam policies 明列违规，2025-08 spam update 由 SpamBrain 常驻执行，恢复需数周至数月。
- **刷 CMC 社区**：会直接取消资格。
- **继续往 `llms.txt` / `llms-full.txt` 加投入**：Google 明确不采用，Semrush 日志零请求，Ahrefs 13.7 万域中 97% 当月零请求。现有的保留作 hedge 即可。

---

## 六、验收节奏

1. 发布后 48 小时：`node scripts/bing-submit.mjs --status` 里新 URL 出现非空的 `LastCrawledDate`。
2. 每 7 天：GSC「索引 → 页面」按 sitemap 过滤，看 Indexed 数量与排除原因。
3. 每 30 天：GA4 按 referrer（`chatgpt.com` / `perplexity.ai` / `claude.ai`）看答案引擎带来的会话；手工用 20–50 个买家问题 × 4 个引擎记「可见率」。
4. 先修推送，再谈排名。`node scripts/publish.mjs` 已经把「发得出、推送得到」变成一条命令，复制 `scripts/publish.yml` 到 `.github/workflows/` 后变成全自动。剩下的是持续产出可被整段引用的原创内容。
