// OMC X 线程数据（纯文字版，对应 docs/marketing/x-threads-2026-11-08.md）
// 每条线程是一个字符串数组，每个元素 = 一推。脚本会按顺序逐推回复，串成线程。
// 图片行（🖼️）已省略：Free 档 API 不支持传图，需手动配图或跳过。

export const threads = [
  // 线程 1 — AI 数据中心的隐藏水账是肉眼所见的 12 倍
  [
    "🧵 Everyone talks about AI's power bill. Nobody talks about its water bill.\n\nWe ran the numbers on US data centers. The result is absurd.",
    "The headline number: US data centers used ~66 billion liters of water on-site in 2023.\n\nSounds like a lot. It's the tiny number.",
    "Because generating the electricity for those data centers used ~800 billion liters at the power plant.\n\nThat's a 12x multiplier nobody puts on the slide.",
    "\"Closed-loop cooling\" gets cited as the fix. But closed-loop only closes the on-site loop.\n\nThe 92% of the water — the part at the power plant — was never in the loop to begin with.",
    "So every \"we're water-neutral\" claim that only counts the campus is counting the 8% and waving at the 92%.\n\nThe physics don't care about the press release.",
    "Why we even care: OMC is a decentralized GPU network. Compute that's physically distributed inherits the grid it sits on — including this water math.\n\nYou can't route around it by building a bigger campus.",
    "The real lever is using the GPUs you already have, where the power already exists, instead of stacking idle capacity in one drought-prone county.\n\nThat's a market-design problem. We're building the marketplace for it.",
    "Full breakdown with sources on our forum → forum.omc.network/posts/water-footprint-power-plant-2026\n\nIf you build, deploy, or invest in AI infra, this number should be in your model."
  ],

  // 线程 2 — 一个 GW 级 AI 园区要的是一支电工大军
  [
    "🧵 The bottleneck on AI scale-up isn't GPUs.\n\nIt's electricians.",
    "A single gigawatt of data-center capacity pulls a large skilled-trades workforce behind it: electricians, pipefitters, cooling specialists.\n\nChips ship in boxes. Trades don't.",
    "And the lead times for transformers and switchgear now rival the GPU wait.\n\nYou can have the silicon. You still can't turn the lights on without the gear — and the people who install it.",
    "\"We secured 100k H100s\" headlines always quietly omit the 18-month electrical build behind them.\n\nThe atoms of a GW site: concrete, copper, and craftspeople.",
    "Decentralization flips the constraint. Spread the load across existing sites that already have power and people, and the bottleneck stops being one county's labor queue.",
    "It's also why a GPU marketplace that lets idle capacity earn — anywhere the power already exists — is structurally cheaper than centralization.\n\nThe constraint is geography + trades, not silicon.",
    "We wrote the whole thing up, with the labor math, on the forum.",
    "Read it → forum.omc.network/posts/workers-per-megawatt-labor-queue-2026\n\nThe next AI \"capacity crunch\" is going to be a hiring crunch."
  ],

  // 线程 3 — 800V 正在让 54V 母线排退休
  [
    "🧵 Data centers are quietly rewriting their power math.\n\nThe 54V busbar — the standard for a decade — is being retired by 800V.\n\nHere's the arithmetic.",
    "High-density racks now pull so much per-GPU wattage that the last meter of delivery becomes the bottleneck.\n\nNot the chip. The copper feeding it.",
    "Busway losses and conversion stages scale with per-GPU power. At old densities it was noise. At AI densities it's a real, paid-for tax on every watt.",
    "800V DC cuts the conversion stages between the grid and the GPU. Fewer stages = less loss = more of the watt you paid for reaches the silicon.",
    "\"Build cost\" for an AI rack is now a power-delivery problem, not just an electrical one.\n\nThe last meter decides margins.",
    "OMC nodes plug into this reality instead of pretending it's someone else's problem. Compute that prices delivery honestly beats compute that hides it.",
    "Full rack-power breakdown, with the loss curves, on the forum.",
    "Read → forum.omc.network/posts/800vdc-rack-power-arithmetic-2026\n\nThe rack you deploy in 2027 will speak 800V."
  ],

  // 线程 4 — 智能体不会用信用卡：机器和机器之间怎么付钱？
  [
    "🧵 Your AI agent can book a flight, write code, and query a model.\n\nIt cannot open a credit card.\n\nSo how do agents pay each other?",
    "The entire agent economy assumes machines can transact. Today they can't — they borrow a human's payment rail and hope.\n\nThat's not a market. That's a hack with a timeout.",
    "Machine-to-machine (M2M) payments need three things: an address that isn't a person, a settlement that's instant, and a unit both machines agree on.\n\nCrypto is the only stack that has all three natively.",
    "OMC is built around this. A job is escrowed, computed, verified, and settled — machine to machine, no human in the loop per transaction.",
    "\"Verified\" is the part everyone skips. An agent will happily pay for garbage output. Per-job verification is what makes M2M payments safe to automate at scale.",
    "This is the unglamorous plumbing that the agent economy runs on. No verification, no trust, no economy — just expensive mistakes at machine speed.",
    "We're shipping the settlement + verification layer now, not \"researching it for 2028.\"",
    "Start here → omc.network/compute\n\nThe agents are coming. The rails aren't ready. We're building them."
  ],

  // 线程 5 — 推理按结果计费，不按 GPU 小时
  [
    "🧵 You don't pay a taxi by the hour if it gets lost.\n\nSo why do we bill AI inference by GPU-hour?",
    "GPU-hour pricing charges you for the machine's time, not the answer. Idle spin-up, retries, a model thinking itself in circles — all on your tab.",
    "\"Result billing\" flips it: you pay for verified output, not for silicon sitting warm.\n\nIf the job fails verification, you don't pay for the attempt.",
    "This matters because inference — not training — is where AI spend is heading. Always-on agents call models millions of times. Hourly pricing explodes at that volume.",
    "Per-job verification is what makes result billing possible. You can only bill for results you can prove.",
    "OMC does exactly this: escrow the job, a node runs it, verification passes, payment releases. No output, no charge.",
    "It's also why decentralized beats a single vendor here — competition on verified results, not on who locks you into their hour.",
    "Try it → omc.network/compute\n\nStop paying for the machine's existential crisis. Pay for the result."
  ],

  // 线程 6 — Vitalik 说去中心化计算属于 d/acc 工具箱
  [
    "🧵 Vitalik, Nov 2024: open, verifiable, decentralized computing is \"defensive technology worth building\" — including markets that route idle GPUs to real work.\n\nWe read that and built it.",
    "\"d/acc\" argues the future should be defended by open, decentralized tech — not concentrated by default. Compute is exhibit A.\n\nWho runs the GPUs decides who can be censored off them.",
    "Today inference and training concentration is historic. A handful of clouds = a handful of switches someone can flip.\n\nDecentralized capacity is the antidote, if it actually verifies.",
    "That \"if\" is the whole game. Idle GPUs routed to real work only matter if the work is proven. Otherwise it's a botnet with a nicer landing page.",
    "OMC's architecture is verification-first: escrow, compute, prove, settle. The d/acc case for compute only works with the verification step in.",
    "We're not waiting for a foundation to bless it. The testnet is live, the contracts are open, the verification is on-chain.",
    "Disagree with our implementation? The repo is public. Fork it, break it, improve it.",
    "Read the analysis → forum.omc.network/posts/depin-2026-who-actually-has-users\n\n(Industry commentary, not investment advice.)"
  ],

  // 线程 7 — 免费加入、0 成本、2027 年 1 月 1 日解锁
  [
    "🧵 OMC's airdrop is live. 20,000,000 OMC. 1,000,000 slots. 20 OMC each.\n\nFree to join. Here's exactly how to grab one.",
    "No purchase. No presale. Three social tasks + one wallet signature. That's the whole gate.",
    "Each wallet can bank up to 5 entries. Five friends' wallets = five more shots. First come, first served.",
    "Claiming opens Jan 1, 2027 with mainnet + staking. The OMC you stack during the campaign becomes claimable and stakeable the same day it exists.",
    "The 0.01 BNB fee per claim isn't a toll — it funds development and filters bots. One human, one claim path, on-chain.",
    "1,000,000 slots won't last forever. The early crowd is small right now. That's the window.",
    "This is the community's 2% — reserved, not sold. If you're reading this, you're early.",
    "Register now → omc.network/airdrop\n\nSet it up once. Let it ride."
  ],

  // 线程 8 — 抗量子不是等底层链：链下流量已用 ML-DSA
  [
    "🧵 \"Is your chain quantum-resistant?\" is the wrong question.\n\nThe right one: what are you signing today that a quantum computer could forge tomorrow?",
    "Most \"post-quantum\" talk waits for the base layer to upgrade. Meanwhile every signature you emit now is frozen in history, harvestable for a future break.",
    "OMC doesn't wait. The off-chain traffic we issue — job auth, settlement proofs — is already signed with ML-DSA (Dilithium), the NIST-standard lattice scheme.",
    "ML-DSA is the algorithm NIST picked to replace ECDSA against Shor's algorithm. We adopted it where we control the signing, now.",
    "On-chain migration follows the base layer's schedule — that part isn't ours to flip alone. But the traffic we generate is already quantum-safe.",
    "This is the honest version: we're not claiming a \"quantum-resistant coin.\" We're closing the signature gap we actually own, today.",
    "Defense in depth beats a press-release roadmap. Do the part you control, ship it, talk about the rest honestly.",
    "Technical writeup → omc.network/docs/post-quantum-roadmap\n\n(We are not claiming the token itself is quantum-resistant — the on-chain migration tracks the base layer.)"
  ],

  // 线程 9 — AI 需求从训练转向 always-on 推理
  [
    "🧵 The AI build-out was sold as a training story.\n\nThe money is quietly becoming an inference story. And the buyer is a bot.",
    "Training is a few gigantic jobs. Inference is billions of tiny ones, always on, from agents that never sleep.\n\nDifferent shape. Different economics.",
    "When the buyer is an agent calling a model millions of times a day, per-GPU-hour pricing isn't just expensive — it's the wrong unit entirely.",
    "You need: instant settlement, machine addresses, and billing per verified result. Human-in-the-loop payments can't keep up with machine tempo.",
    "OMC is built for that tempo. Escrow → compute → verify → settle, machine to machine, no per-transaction human.",
    "The shift from \"train a model\" to \"run a million agents\" is the demand curve decentralized compute is positioned for — if it verifies at scale.",
    "We're not betting the future. We're building the rail the future needs and shipping it this cycle.",
    "Why this is our thesis → forum.omc.network"
  ],

  // 线程 10 — 开源了整条链
  [
    "🧵 Most \"decentralized\" projects show you a dashboard.\n\nWe showed you the source. The whole chain is open.",
    "Website source, whitepaper, contribution guide, MIT license — all public on GitHub.",
    "Run a node: the testnet is live on BNB Chain Testnet, contract verified on BscScan, four-step onboarding on the site.",
    "Verify a contract yourself: the deployed bytecode matches the reviewed source. We published how.",
    "Open source isn't a marketing word here. It's the only way \"decentralized\" means anything.",
    "Found a bug? Open an issue. We caught our own \"burn that wasn't burning\" and fixed it on-chain — publicly.",
    "If you can't read it, you can't trust it. So we made it readable.",
    "Star it → github.com/CBTdao/omc-network\n\nDon't trust the dashboard. Read the chain."
  ]
];
