# /ai-tools 浏览器端超分 · 技术方案（Task #153）

> 2026-10-10 · 决定：把超分做成 **挂在 omc.network 上的纯静态页面**，模型在**用户自己的浏览器**里跑。

## 一、为什么是浏览器本地推理（而不是调 API）

| 方案 | 真跑模型 | 不碰"表演模式"红线 | 无 key 泄露 | "只是一个网页" |
|---|---|---|---|---|
| 页面 + 外部 API | ✅ | ❌ 链上无 job，OMC 只是装饰 | ❌ key 必须写进 JS | ❌ 需 serverless 中转 |
| **浏览器本地推理** | ✅ | ✅ 算力在用户设备，不产生中心化依赖 | ✅ 无 key | ✅ 纯静态 |

**结论：唯一同时满足四个约束的方案。**

## 二、技术栈

- **推理引擎**：`onnxruntime-web`（WASM + WebGPU 双 EP），**CDN 引 `ort.min.js`**
  - 注意：主站零依赖约束是「**零 bundler**」，不是「零 CDN」。AdSense 已经在 head 里引外域脚本，回归断言 `no third-party JS beyond the AdSense tag` 需**同步放开 ort 域名**。
- **模型**：Real-ESRGAN x4plus ONNX，64 MB
  - 放 `assets/models/real_esrgan_x4.onnx`，`fetch()` 拉取，`ArrayBuffer` 喂给 `ort.InferenceSession`
  - **64 MB 首屏代价**：不能自动下载。默认**折叠在「准备模型」按钮后**，点一次才拉，拉完缓存进 Cache Storage / IndexedDB。
- **执行提供者优先级**：`webgpu` → `wasm`（带 SIMD + threads）
  - WebGPU 不可用（Safari 旧版 / 无核显）→ 静默降级 wasm，**必须在 UI 明示当前在跑哪个 EP**，不能让用户以为在用 GPU。
  - 用 `navigator.gpu.requestAdapter()` 探测，不用 UA 猜。

## 三、与主站规范的兼容性

| 约束 | 处理 |
|---|---|
| 规范 URL 无扩展名无尾斜杠 | `/ai-tools`（新页 `ai-tools.html`） |
| 零 bundler | 手写 `assets/js/ai-tools.js`，`<script src>` 直引，不打包 |
| 7 语言 parity | 新增 `ai.*` 键块，插在 `window.I18N.<lang>` 闭括号前 |
| 导航 8 项 | 新增第 9 项 `nav.aitools` → 需改 **12 个 html**（11 页 + 新页） |
| 反炒作基调 | 页面**无收益承诺**、**无 APR/APY**、明确「在你自己的设备上跑，无上传」 |
| 定价纪律 | 本页**不出现任何价格**（免费工具层，收费用 /compute 的 createJob） |

### 导航顺序（新）

```
home · news · wp · calc · compute · aitools · testnet · stake · airdrop
```

`NAV_ORDER` / `NAV_LABEL` / `NAV_PAGES` 三处 + 每个 html 的 nav 块都要同步。
`NAV_PAGES` 从 10 → 11，`sitemap` locCount 断言 `NAV_PAGES.length + 1` 从 11 → 12 自动跟随。

## 四、页面结构（三段式，不调链、不接钱包）

1. **Hero** —— 一句话说清：在你自己浏览器里跑超分，图片不上传。
2. **工具区** —— 拖拽上传 / 对比滑块 / 下载。参数只有一个「切块大小」（显存小的机器可调小）。
   - 状态条必须显示：EP（WebGPU / WASM）、模型状态、耗时、输出尺寸。
   - 未准备模型时按钮显示「准备模型（64 MB）」，下载中给进度。
3. **诚实说明区** —— 三张卡：① 图不上传（本地推理，隐私）② 慢是正常的（设备差异，附参考耗时）③ 这是 P0（免费工具层，收费走 /compute 的链上结算）。

## 五、降级与失败路径（必须实现）

| 情况 | 行为 |
|---|---|
| `crossOriginIsolated` 为 false（线程不可用） | wasm 单线程跑，提示更慢 |
| WebGPU 不可用 | 落 wasm，UI 明示 |
| 模型下载失败（离线/弱网） | 保留「重试」，不静默失败 |
| 输入图超大（> 4096px 长边） | 前端拦下并提示，避免爆显存/卡死 |
| 推理中刷新 | 无状态，用户重来 |

## 六、回归新增断言（Task #157）

- `/ai-tools` 出现在 sitemap + llms.txt
- `NAV_PAGES` 含 `ai-tools`，`NAV_ORDER` 含 `aitools`
- 页面有 `ai.*` 键且 7 语言 parity
- 页面**不含** `APR|APY|yield of|returns of <数字>`
- 页面**不含** `upload(ed)? to (our|the) server`（隐私声明必须说"不上传"）
- 外域脚本白名单 = `adsbygoogle` + `onnxruntime`（jsdelivr/unpkg）
- 控件存在：`aiDrop` / `aiFile` / `aiGo` / `aiDl` / `aiPrep` / `aiEp` / `aiStat`
