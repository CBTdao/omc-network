# AI 抓取优先：分析、现状与更新规程

2026-11-02 · 适用于 omc.network 及其子站（top / forum / game）

---

## 一、目标变了，衡量标准也变了

搜索引擎的目标是**被排到前面**；AI 的目标是**被引用、且被引用对**。

这带来三个后果，决定了后面所有取舍：

1. **AI 的产物是段落，不是页面。** 检索器按 H2 把页面切块再喂给模型，模型引用的是那一块。所以数字和它的限定语必须落在同一块里，否则会被单独摘出来。
2. **AI 的回答寿命比网页长。** 一个被写错的数字会在回答里活几个月，再被二手文章抄走。网页改了就改了，回答不会自己更新。
3. **否定句在切块里活不下来。** "There is no presale" 被切出来的那半块，很可能只剩 "presale"。这是当前文案里**最真实的隐患**，比关键词密度重要得多。

所以「AI 抓取优先」不等于 SEO 加料，方向几乎是反的：**删形容词，留数字，把每一段写成能独立成立的句子。**

---

## 二、三个真实风险（按严重程度）

### 1. 被复述错（最严重）

最可能被写错的三个事实，以及它们现在的写法：

| 事实 | 错误复述会长成 | 现在是否防住 |
|---|---|---|
| 0.01 BNB/份 | 「OMC 空投要花钱买」「paid airdrop」 | 基本防住：`airdrop.json` 三字段 + 禁词测试；但**否定式表述仍散在各处** |
| 20 OMC/份 | 「20 美元」「20 USDT」 | 防住：全部写作 `20 OMC`，且喂给 `airdrop.json` |
| TGE 2027-01-01 | 「已上线」「已发币」 | 部分防住：多处写 scheduled；但**没有机器可读的 `status: pre-launch`** 字段供抓取方判断 |

### 2. 被旧数字污染（不可控，只能标注）

站内一致性已经解决（`params.json` 单一来源 + 测试）。站外不可控：聚合站的缓存、AI 的训练数据、别人的旧文章里都躺着旧值。

唯一有效的办法是**让版本号跟着事实一起走**，而不是只跟页面走：
- `params.json` 现在有 `version: 8`、`updatedAt`
- 但**没有任何页面把这个版本号显示出来**，所以 AI 引用时不知道自己在引哪一版
- 建议：关键页脚注一行 `Facts v8 · 2026-10-30`。旧值一旦和新值并排出现，读者/模型就能判断哪个过期

### 3. 压根没被抓（实测已发生）

- Bing 抓到的只有 `/`、`/tokenomics`、`/whitepaper`、`/ai-tools`、`/testnet`——**全是旧页面**
- `/airdrop`、`/news`、公告页、`/stake`、`/compute`：**从未抓取**
- 34 条 `game.omc.network` URL：11-01 才拿到属性归属，抓取数仍为 0

这不是 SEO 问题，是新域名的抓取预算问题。对 AI 渠道同样成立：**没被抓 = 不在候选集 = 不可能被引用。**

---

## 三、现状盘点（实测，不是估计）

### 已经做对的

| 项 | 状态 |
|---|---|
| `robots.txt` 显式放行 13 个 AI agent（GPTBot / OAI-SearchBot / ChatGPT-User / PerplexityBot / Perplexity-User / ClaudeBot / Claude-User / anthropic-ai / Google-Extended / Applebot-Extended / Bingbot / DuckDuckBot / CCBot） | ✅ |
| `/llms.txt` — 65 行 / 6.5 KB，中英双语 URL 全列，空投事实前置 | ✅ 体量刚好在模型上下文里 |
| `/airdrop.json` — 机器可读，`Access-Control-Allow-Origin: *`，1 小时缓存 | ✅ |
| 静态 HTML，正文不依赖 JS | ✅ 15 页全部达标（`/news` 已静态化） |
| 中英双语静态镜像（不同 URL，各自 canonical） | ✅ 14 / 14 内容页 + 公告页（batch 2 补齐；404 页不需要镜像） |
| JSON-LD：`/airdrop` 有 5 块（Organization / WebPage / Breadcrumb / **FAQPage** / **HowTo**） | ✅ 全站最好的一页 |
| `/press` 有 `dateModified`、更正政策、可引用格式 | ✅ 唯一有新鲜度信号的页 |

### 缺的，按杠杆排序

| # | 缺口 | 影响 | 成本 |
|---|---|---|---|
| 1 | **没有 `llms-full.txt`** | AI 现在只能读 6.5 KB 摘要；15 页去重正文实测 **120,556 字符 / 约 3.3 万 token**，一次抓完要 15 次请求，多数 agent 不会做 | 1 次生成脚本 |
| 2 | **全站只有 `/press` 有 `dateModified`** | 抓取方无法判断新鲜度；旧页面和新页面在模型眼里等价 | 脚本注入 |
| 3 | **`/news` 对不跑 JS 的爬虫只有 1 条** | `/news` 是唯一的新鲜度面，等于关着 | 构建时烤进 HTML |
| 4 | ~~**中文只覆盖 9/15 页**~~ | 豆包/元宝/Kimi/DeepSeek 抓中文；whitepaper/about/calculator 缺失 | ✅ 已补（13 页镜像 + 2 页只需词条） |
| 5 | ~~**`Organization` 没有 `alternateName`**~~（原只有 `/zh/press` 有） | 「OMC」在全球金融里是 Open Market Committee；中文「泛宇宙算力」和英文实体在 AI 眼里可能是两个 | ✅ 全站生效（见第六节） |
| 6 | **没有 feed（RSS/Atom）** | 聚合站与部分 agent 依赖 feed 发现更新 | 1 次生成 |
| 7 | **关键事实只出现在 6 页** | `/stake`、`/compute`、`/index` 只说结论不带数字，被单独检索时答不出数 | 文案小改 |

---

## 四、以后的更新规程（核心）

**每次改站，按这个顺序，不要跳步：**

1. **先改 `contracts/params.json`**，再生成页面。任何页面上的数字都必须能追溯到它——这是既有规矩，继续执行。
2. **顺手升级 `version` 与 `updatedAt`**，并把版本号写进页脚。改数字不升版本 = 站外无法判断新旧。
3. **每条新事实写成一个能独立成立的句子**：主语 + 数字 + 单位 + 限定条件在同一句。
   - ✅ `Each entry delivers 20 OMC in full at claim, and carries a 0.01 BNB processing charge for that transaction.`
   - ❌ `It costs 0.01 BNB.`（切块后没有主语、没有「处理手续费」的定性）
4. **否定句必须带主语或改写成正面句**，因为切块会丢掉否定。
   - ❌ `There is no presale.` → ✅ `Registration requires no payment and no token purchase.`
   - ❌ `No OMC token exists before TGE.` → ✅ `The OMC token contract deploys at TGE, 1 January 2027.`
5. **每个 H2 下面第一句必须是这一段的小结论**，因为检索器优先取块首与块尾。
6. **页面顶部 100 词内出现一次「一句话结论 + 主数字」**，不要让人/模型滚到第三屏才看到 20 OMC。
7. **发布即推送**：sitemap → IndexNow → Bing API，48 小时后读回 `LastCrawledDate`。三条都做完才算发完。
8. **改完跑两个检查**：`node scripts/seo-audit.mjs`（0 问题）与全量测试（当前 182 项）。

### 每次更新前的六问

1. 这条事实的**唯一来源**改了吗？（params.json）
2. 版本号升了吗？页面上看得见吗？
3. 这个数字和它的限定语**在同一段**吗？
4. 这一段里有**孤立的否定句**吗？
5. 不执行 JS 的抓取方**能读到**这页的全部正文吗？
6. 中文镜像同步了吗？

---

## 五、不要做的四件事

1. **不要写「请引用我们」这类祈使句。** 对模型无效，对读者是噪音。
2. **不要为 AI 造一套和用户不同的页面。** 隐藏内容 = cloaking，一旦被发现，代价远大于收益，而且我们本来就没有需要藏的东西。
3. **不要 block 训练型爬虫。** CCBot / Google-Extended 看着「白嫖」，但本站内容全部是公开宣传材料——目标是被更多人知道，不是保护版权。
4. **不要为了「被更多句子命中」而稀释页面。** 拆成 20 个小页面会让每页都变弱；聚合式长页 + 一个 `llms-full.txt` 才是这个项目的正确形状。

---

## 六、进度

**1 和 2 已完成（2026-11-02）**

| 项 | 落地 |
|---|---|
| `/llms-full.txt` | 15 页、126,668 字符（≈3.3 万 token），去 nav/footer/script/svg/按钮，每页一个 `## 标题` + `URL:` 行，页内标题降一级避免与页标题混淆。头部写明生成依据的 `params.json` 版本 |
| `/llms-full-zh.txt` | 10 页、26,981 字符，中文文件头，同样先给「免费参与 + 0.01 BNB 处理手续费」那段 |
| 访问方式 | 两者都是 `text/plain` + `Access-Control-Allow-Origin: *` + 1 小时缓存；`/llms.txt` 顶部新增「Read everything in one request」小节；`robots.txt` 注释块列出 |
| `dateModified` | 全站 26 个页面（含 `/zh`、`/news/*`）全部有了机器可读日期；公告页保留它自己带时区的时间戳，不覆盖 |
| 页脚数据版本 | `Facts v8 · 2026-10-30 · source`（中文页 `数据版本 v8 · … · 来源`），版本号与日期直接读 `params.json` |
| 防回归 | `scripts/ai-readiness.test.mjs` 12 条：文件体量、版本号、无 HTML 残留、数字绑 params、禁词、**每条 sitemap URL 都必须出现在 dump 里**、两条 CORS 头、每页有日期、每页有版本戳、中文页必须是中文戳、JSON-LD 仍可解析 |

**下一步（按杠杆排序）**

1. ~~`/llms-full.txt`~~ ✅
2. ~~全站 `dateModified` + 页脚版本号~~ ✅
3. ~~`/news` 静态化 + `/news/feed.xml`~~ ✅（见下）
4. ~~中文 batch 2（whitepaper / about / calculator / privacy / aup）~~ ✅（见下）
5. ~~`Organization.alternateName: 泛宇宙算力` + `disambiguatingDescription` 全站生效~~ ✅（见下）

**3 已完成（2026-11-02）**：17 条动态全部在构建期渲染进 `news.html` / `zh/news.html`（原来不跑 JS 只读到 1 条），并发布 `/news/feed.xml` 与 `/zh/news/feed.xml`（RSS 2.0，最新在前，完整摘要，绝对链接）。`lastBuildDate` 取最新一条的日期而不是构建时刻——否则每跑一次生成器都像更新过，读者会学会忽略这个文件。`build_news.py --check` 校验 HTML 与两份 feed 是否过期；`scripts/news-static.test.mjs` 13 条守「静态顺序 = 数据文件顺序」「两种语言条目一致」「中文日期真的是中文」「zh feed 不链不存在的页面」。副作用：`llms-full.txt` 从 126,668 涨到 133,106 字符，因为新闻段现在带着全部 17 条。

**4 已完成（2026-11-02）**：whitepaper / about / calculator / privacy / aup 五页有了中文镜像，`/zh/` 从 9 页扩到 14 页，`llms-full-zh.txt` 从 26,981 涨到 **55,948 字符（15 页，与英文版一一对应）**。这五页和 batch 1 不是同一套机制：batch 1 的英文都在 `data-i18n` 键后面，batch 2 的英文散在内联标记里（`<strong>`、`<a>`、`<code>`），逐文本节点翻译会把强调位置拆坏，所以改用**块级、位置化**的翻译表——`zh-batch2/<page>.txt` 的第 N 行对应页面第 N 个可译块，`zh_extract.py --compile` 编成 `zh-batch2.json` 并给每块记 `sha1[:10]` 指纹。英文被改动时构建报 `CHANGED block #N` 并停下，而不是让下面每一句静默错位一行；`.txt` 跳行由「该行没有汉字且不等于英文块」兜住。

两个刻意的取舍：

- 表里存的是**译文**不是英文原文，因为英文已经在 HTML 里，再抄一份会让文件翻倍并开始腐化；代价是位置语义，所以必须有指纹。
- 白皮书引用的英文来源标题保留英文，用 `<em lang="en">` 标注——这是「引文不是我漏译」的机器可读写法，测试统计残留英文前会先剥掉 `lang="en"` 的元素。目录里 13 条锚点文字不在块表内（`<a>` 不是块元素），走手写映射，且必须与正文标题逐字一致。

配套：sitemap 25 → **30 条**（15 对 hreflang 成对补齐），SEO 审计 65 页 **0 problems / 0 warnings**；`scripts/zh-pages.test.mjs` 增到 8 条，新增一条守「`.txt` 与 `.json` 一致、指纹数匹配、每张表都有对应中文页」。

**构建顺序（写进 README 了，别打乱）**：`build_zh.py` → `build_announcement.py` / `build_press.py` → `build_news.py` → `build_llms_full.py` → `inject_facts.py`。前三个会重建页面，后两个是盖章，必须最后跑。

**5 已完成（2026-11-02）**：`inject_facts.py` 多了第三遍盖章——身份。每个 `Organization` 节点现在都有 `@id: https://omc.network/#organization`、`alternateName: ["泛宇宙算力","OMC"]`（中文页反过来，`["Omniverse Compute","OMC"]`）和一段 `disambiguatingDescription`。中文页写中文、英文页写英文。

三件事值得记下来：

- **只加 `alternateName` 不够，`@id` 才是关键。** 没有 `@id`，模型看到的是 47 个恰好共用一张 logo 的不同组织；有了同一个 `@id`，63 个节点解析成一个实体。两手一起做才有用。
- **原来的副本已经漂了。** 同样一段 `Organization`，有的页 `sameAs` 两个链接、有的三个；只有 `/press` 有 `alternateName`。逐页手改会在下一次重新生成时再漂一次，所以做成脚本，`--check` 进测试。
- **`name: "OMC"` 本身就是要修的东西。** 游戏子站 32 个页面把发布方写成 `name: "OMC"`——正是那个歧义字符串。脚本把它提升成 `Omniverse Compute`，缩写留在 `alternateName` 里，别名的位置在别名。

嵌套节点（`NewsArticle.publisher` 这类）只给 `@id` 和两个名字，不给描述：一页一份描述足够解决实体，publisher 里塞三个额外字段只是噪音。`scripts/entity-identity.test.mjs` 5 条守：全站同 `@id`、每个节点都带两个名字、没有节点只叫缩写、描述与页面语言一致、sitemap 里每条 URL 都有页面说明发布者。

**判断这套有没有用的标准**：一个月后，去问 ChatGPT / Perplexity「OMC 空投怎么参与、要不要花钱」，看它答的是 20 OMC 免费参与 + 0.01 BNB 处理手续费，还是「付费空投」。答错了，说明是引用源不够硬，不是文案不够多。
