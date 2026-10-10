#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
OMC AI Tools · P0 · 本地推理 HTTP 服务

零框架：只用 Python 标准库 http.server。目的只有一个 —— 让前端单页能调用本地
Real-ESRGAN 推理，验证「上传→处理→下载」这条链路。

为什么不用 Flask/FastAPI：P0 是验证件，减少一层依赖就少一个装不上的可能。
真正的 worker 版本（接市场合约、轮询任务）会另写，这个只服务本机前端。

启动：
    .venv/Scripts/python.exe p0-worker/server.py --port 8787
"""

import argparse
import base64
import io
import json
import os
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import upscale as U  # noqa: E402

# ---- 全局模型会话（惰性加载，进程内复用）------------------------------------
_SESSION = None
_SESSION_LOCK = threading.Lock()
_LOAD_MS = 0


def get_session():
    global _SESSION, _LOAD_MS
    if _SESSION is None:
        with _SESSION_LOCK:
            if _SESSION is None:
                t = time.time()
                _SESSION = U.load_session(U.MODEL_PATH)
                _LOAD_MS = int((time.time() - t) * 1000)
    return _SESSION


def decode_image(b64: str) -> np.ndarray:
    """data:image/...;base64,xxxx 或纯 base64 → BGR ndarray"""
    if "," in b64 and b64.strip().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("无法解码图片")
    return img


def encode_png_b64(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise ValueError("PNG 编码失败")
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


class Handler(BaseHTTPRequestHandler):
    server_version = "OMCUpscaler/0.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    # ---- 工具 ----
    def _send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, ctype):
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError:
            self._send_json({"error": "not found"}, 404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ---- 路由 ----
    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/", "/index.html"):
            web = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "p0-web", "index.html")
            self._send_file(web, "text/html; charset=utf-8")
        elif p == "/api/health":
            try:
                s = get_session()
                self._send_json({
                    "ok": True,
                    "provider": s.get_providers()[0],
                    "model": os.path.basename(U.MODEL_PATH),
                    "load_ms": _LOAD_MS,
                })
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, 500)
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        p = self.path.split("?")[0]
        if p != "/api/upscale":
            self._send_json({"error": "not found"}, 404)
            return

        try:
            n = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception as e:
            self._send_json({"error": "请求体解析失败: %s" % e}, 400)
            return

        img_b64 = payload.get("image")
        if not img_b64:
            self._send_json({"error": "缺少 image 字段"}, 400)
            return

        tile = int(payload.get("tile", 256))
        pad = int(payload.get("pad", 16))
        tile = max(64, min(512, tile))       # 4GB 显存安全区
        pad = max(4, min(32, pad))
        if tile <= pad * 2:
            self._send_json({"error": "tile 必须大于 2*pad"}, 400)
            return

        try:
            src = decode_image(img_b64)
            t0 = time.time()
            out = U.upscale(src, get_session(), scale=4, tile_size=tile, pad=pad)
            infer_ms = int((time.time() - t0) * 1000)
        except Exception as e:
            traceback.print_exc()
            self._send_json({"error": str(e)}, 500)
            return

        self._send_json({
            "ok": True,
            "image": encode_png_b64(out),
            "in_w": src.shape[1], "in_h": src.shape[0],
            "out_w": out.shape[1], "out_h": out.shape[0],
            "scale": 4,
            "infer_ms": infer_ms,
            "provider": get_session().get_providers()[0],
        })


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    print("预热模型 ...")
    try:
        s = get_session()
        print("provider = %s  (加载 %d ms)" % (s.get_providers()[0], _LOAD_MS))
    except Exception as e:
        print("[error] 模型加载失败:", e)
        return 1

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print("OMC AI Tools P0 已启动: http://%s:%d" % (args.host, args.port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n停止")
    return 0


if __name__ == "__main__":
    sys.exit(main())
