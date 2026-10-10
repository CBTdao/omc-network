#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
OMC AI Tools · P0 · Real-ESRGAN ONNX 推理核心

零 PyTorch 依赖：仅 onnxruntime + numpy + opencv。
模型：Real-ESRGAN x4plus（RRDBNet 23-block），BSD-3-Clause，与上游权重 1:1 导出。

关键设计
--------
1. Tile 切块推理：GTX 1050 只有 4GB 显存，整图 4x 超分会爆。按 tile 切、带 pad 重叠、
   再按 pad 裁掉边缘拼回，避免接缝。
2. 输入归一化：模型吃 [1,3,h,w] f32 RGB [0,1]（非 0-255、非 BGR）。
3. 输出 clamp 后转 uint8。

用法：
    python upscale.py <input> <output> [--scale 4] [--tile 256] [--pad 16]
"""

import argparse
import os
import sys
import time

# --- CUDA DLL 自动注入（必须在 import onnxruntime 之前）---------------------------
# pip 装的 nvidia-*-cu12 包把 DLL 放在 site-packages/nvidia/<lib>/bin。
# 只用 PATH 不够稳（Windows 不会沿 PATH 解析 DLL 的依赖链），
# 必须用 os.add_dll_directory 注册每个目录，让依赖链能互相找到。
def _inject_cuda_dlls():
    here = os.path.dirname(os.path.abspath(__file__))          # .../omc-ai-tools/p0-worker
    root = os.path.dirname(here)                                # .../omc-ai-tools
    site = os.path.join(root, ".venv", "Lib", "site-packages")
    nvidia = os.path.join(site, "nvidia")
    subs = ["cudnn/bin", "cublas/bin", "cuda_runtime/bin", "cuda_nvrtc/bin",
            "cufft/bin", "nvjitlink/bin"]
    found = []
    for s in subs:
        d = os.path.join(nvidia, s.replace("/", os.sep))
        if os.path.isdir(d):
            found.append(d)
    for d in found:
        try:
            os.add_dll_directory(d)
        except Exception:
            pass
    if found:
        os.environ["PATH"] = ";".join(found) + ";" + os.environ.get("PATH", "")
    return found


_CUDA_DIRS = _inject_cuda_dlls()

import cv2
import numpy as np
import onnxruntime as ort


MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "real_esrgan_x4.onnx")


def load_session(model_path: str, threads: int = 0) -> ort.InferenceSession:
    """建 ONNX 会话。默认让 onnxruntime 自选 provider（当前是 CPU）。"""
    if not os.path.isfile(model_path):
        raise FileNotFoundError("模型不存在: %s" % model_path)

    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    if threads > 0:
        so.intra_op_num_threads = threads

    providers = ort.get_available_providers()
    # 有 CUDA 就用 CUDA，否则回落 CPU
    prefer = [p for p in ("CUDAExecutionProvider", "CoreMLExecutionProvider") if p in providers]
    prefer.append("CPUExecutionProvider")

    sess = ort.InferenceSession(model_path, sess_options=so, providers=prefer)

    # 若请求了 CUDA 但实际落在 CPU，明确告警（避免"以为在跑 GPU"）
    actual = sess.get_providers()[0]
    if prefer[0] == "CUDAExecutionProvider" and actual != "CUDAExecutionProvider":
        print("[warn] CUDAExecutionProvider 不可用，已回落 %s" % actual, file=sys.stderr)
    return sess


def run_tile(session: ort.InferenceSession, tile_rgb: np.ndarray) -> np.ndarray:
    """对单块跑推理。输入 HxWx3 uint8 RGB，返回 4H x 4W x 3 float32 [0,1]。"""
    inp = tile_rgb.astype(np.float32) / 255.0          # H,W,3
    inp = np.transpose(inp, (2, 0, 1))[None, ...]      # 1,3,H,W
    inp = np.ascontiguousarray(inp)

    name = session.get_inputs()[0].name
    out = session.run(None, {name: inp})[0]            # 1,3,4H,4W
    out = np.transpose(out[0], (1, 2, 0))              # 4H,4W,3
    return out


def upscale(img_bgr: np.ndarray, session: ort.InferenceSession,
            scale: int = 4, tile_size: int = 256, pad: int = 16) -> np.ndarray:
    """
    分块超分主函数。
    img_bgr: cv2 读入的 BGR uint8
    """
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h, w = img_rgb.shape[:2]

    # 小图直接整张跑，省掉拼接开销
    if h <= tile_size and w <= tile_size:
        out = run_tile(session, img_rgb)
        out_u8 = np.clip(out * 255.0, 0, 255).astype(np.uint8)
        return cv2.cvtColor(out_u8, cv2.COLOR_RGB2BGR)

    stride = tile_size - pad * 2
    if stride <= 0:
        raise ValueError("tile_size 必须大于 2*pad")

    out_h, out_w = h * scale, w * scale
    canvas = np.zeros((out_h, out_w, 3), dtype=np.float32)
    weight = np.zeros((out_h, out_w, 1), dtype=np.float32)
    # 生成覆盖全图的 tile 起点（最后一格贴边）
    def starts(total, step):
        pts = list(range(0, max(total - step, 0) + 1, step))
        if not pts or pts[-1] + step < total:
            pts.append(max(total - step, 0))
        return pts

    ys = starts(h, stride)
    xs = starts(w, stride)
    n_tiles = len(ys) * len(xs)
    done = 0

    for yi, y in enumerate(ys):
        for xi, x in enumerate(xs):
            y0, y1 = y, min(y + tile_size, h)
            x0, x1 = x, min(x + tile_size, w)

            # 只在「这一侧确实有相邻 tile」时才裁掉 pad。
            # 旧写法对每个 tile 的四条边都裁 pad，导致整图最外圈 pad*scale 像素
            # 没有任何 tile 覆盖，weight=0 -> 除零保护成 1 -> 那圈是黑的。
            first_y, last_y = (yi == 0), (yi == len(ys) - 1)
            first_x, last_x = (xi == 0), (xi == len(xs) - 1)

            t_t = 0 if first_y else pad
            t_l = 0 if first_x else pad
            t_b = 0 if last_y else (tile_size - (y1 - y0) + pad)
            t_rr = 0 if last_x else (tile_size - (x1 - x0) + pad)

            tile = img_rgb[y0:y1, x0:x1]
            out = run_tile(session, tile)                    # 4Ht,4Wt,3

            oy0, oy1 = t_t * scale, out.shape[0] - t_b * scale
            ox0, ox1 = t_l * scale, out.shape[1] - t_rr * scale
            if oy1 <= oy0:
                oy0, oy1 = 0, out.shape[0]
            if ox1 <= ox0:
                ox0, ox1 = 0, out.shape[1]
            core = out[oy0:oy1, ox0:ox1]

            gy0, gx0 = y0 * scale + oy0, x0 * scale + ox0
            gh, gw = core.shape[:2]

            # 羽化权重：只有存在重叠的边才做渐变，贴图边是平的
            f_y0 = gh if first_y else max(1, pad * scale)
            f_y1 = gh if last_y else max(1, pad * scale)
            f_x0 = gw if first_x else max(1, pad * scale)
            f_x1 = gw if last_x else max(1, pad * scale)
            ry = np.arange(gh, dtype=np.float32)[:, None]
            rx = np.arange(gw, dtype=np.float32)[None, :]
            wy = np.minimum(1.0, ry / f_y0) if not first_y else np.ones((gh, 1), np.float32)
            wy = np.minimum(wy, (np.minimum(1.0, (gh - 1 - ry) / f_y1) if not last_y else np.ones((gh, 1), np.float32)))
            wx = np.minimum(1.0, rx / f_x0) if not first_x else np.ones((1, gw), np.float32)
            wx = np.minimum(wx, (np.minimum(1.0, (gw - 1 - rx) / f_x1) if not last_x else np.ones((1, gw), np.float32)))
            w2d = np.maximum(1e-4, wy * wx)[:, :, None]

            canvas[gy0:gy0 + gh, gx0:gx0 + gw] += core * w2d
            weight[gy0:gy0 + gh, gx0:gx0 + gw] += w2d

            done += 1
            print("  tile %d/%d  (%d,%d)  core=%dx%d" % (done, n_tiles, x, y, gw, gh),
                  flush=True)

    weight[weight == 0] = 1.0
    merged = canvas / weight
    merged_u8 = np.clip(merged * 255.0, 0, 255).astype(np.uint8)
    return cv2.cvtColor(merged_u8, cv2.COLOR_RGB2BGR)


def main():
    ap = argparse.ArgumentParser(description="OMC P0 Real-ESRGAN 超分")
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--tile", type=int, default=256)
    ap.add_argument("--pad", type=int, default=16)
    ap.add_argument("--model", default=MODEL_PATH)
    ap.add_argument("--threads", type=int, default=0)
    args = ap.parse_args()

    if args.scale != 4:
        print("[warn] 该 ONNX 为 x4 模型，--scale 仅用于输出命名，实际倍数固定 4")

    src = cv2.imread(args.input, cv2.IMREAD_COLOR)
    if src is None:
        print("[error] 无法读取图片: %s" % args.input)
        return 1
    print("输入: %s  尺寸=%dx%d" % (args.input, src.shape[1], src.shape[0]))

    t0 = time.time()
    sess = load_session(args.model, args.threads)
    print("provider: %s" % sess.get_providers()[0])
    t_load = time.time() - t0

    t1 = time.time()
    out = upscale(src, sess, args.scale, args.tile, args.pad)
    t_infer = time.time() - t1

    cv2.imwrite(args.output, out)
    print("输出: %s  尺寸=%dx%d" % (args.output, out.shape[1], out.shape[0]))
    print("加载耗时: %.2fs   推理耗时: %.2fs" % (t_load, t_infer))
    return 0


if __name__ == "__main__":
    sys.exit(main())
