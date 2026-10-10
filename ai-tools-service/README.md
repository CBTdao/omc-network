# OMC AI Tools · P0

验证件：本地 GPU 跑通「上传 → 超分 → 下载」，不接钱包、不上链。

## 快速开始

```bash
cd omc-ai-tools
.venv/Scripts/python.exe p0-worker/server.py --port 8787
# 浏览器打开 http://127.0.0.1:8787
```

单图命令行：

```bash
.venv/Scripts/python.exe p0-worker/upscale.py <input.png> <output.png> --tile 256 --pad 16
```

## 目录

| 路径 | 说明 |
|---|---|
| `p0-worker/upscale.py` | 推理核心。CUDA DLL 注入 + tiling 切块/拼接 |
| `p0-worker/server.py` | 本地 HTTP 服务（零框架，仅标准库） |
| `p0-web/index.html` | 前端单页（拖拽上传 / 对比滑块 / 下载） |
| `models/real_esrgan_x4.onnx` | Real-ESRGAN x4plus ONNX，BSD-3-Clause，64 MB |
| `testdata/` `output/` | 测试图与实测产出 |

## 环境约束（重要）

本机 GPU = GTX 1050 / 4GB / compute 6.1，驱动 536.40 (CUDA 12.2)。
因此依赖版本被**锁定**，不要随意升级：

- `onnxruntime-gpu == 1.22.0`（1.31 要 CUDA 13，装不上）
- `nvidia-cudnn-cu12 == 9.1.0.70`（9.27 需要 CUDA 12.9 driver API，会崩）
- `nvidia-cublas-cu12` / `cuda-runtime` / `cuda-nvrtc` / `cufft` / `nvjitlink` 均 cu12

**换机器时**：`upscale.py` 的 `_inject_cuda_dlls()` 里路径是按 `.venv/Lib/site-packages/nvidia/<lib>/bin` 推的，
若虚拟环境位置变了需要同步改。

## 实测性能（tile=256, pad=16）

| 输入 | 输出 | 推理 |
|---|---|---|
| 150×90 | 600×360 | 0.55 s |
| 320×200 | 1280×800 | 2.08 s |
| 640×400 | 2560×1600 | 7.72 s |
| 1024×640 | 4096×2560 | 20.6 s |

GPU vs CPU 提速约 **20×**（760×456 整图：343.5 s → 17.0 s）。

## 已知限制

- 4GB 显存：tile 上限建议 256；512 接近爆显存
- Pascal（compute 6.1）不支持 FP16 加速，速度上限就在这儿
- 大图（>1200 万像素）会很慢，前端应限制长边 ≤1280px

## 下一步（P1）

1. worker 侧：注册进 BSC 测试网 OMCStaking（质押 ≥20 tOMC）+ 轮询 `OMCComputeMarket` 接单
2. 前端：接 `OMCWallet`，`createJob` → escrow 扣 OMC → 节点接单 → `settle()`
3. 目标：`jobCount ≥ 10` 全部真实链上结算
