#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
OMC AI Tools · P0/T1 · 本地推理 HTTP 服务（带按次付费额度）

零框架：只用 Python 标准库 http.server。目的 —— 让前端单页能调用本地
Real-ESRGAN 推理，并验证「充值 → 付款 → 出图 → 下载」这条真实收入链路。

为什么不用 Flask/FastAPI：减少一层依赖就少一个装不上的可能。
真正的 worker 版本（接市场合约、轮询任务）会另写。

支付：`payments.py`（零新依赖，只读链、不持私钥）。`payments.json` 的
`enabled: false` 时本服务退回 P0 的免费内测模式。注意：一旦配置要求收费，
支付模块加载失败会**直接启动失败**，绝不静默退回免费（否则等于白送算力）。

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

_PAY_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "payments.json")


def _payments_requested():
    """配置是否要求收费。刻意不依赖 payments 模块——它加载失败时也要能判断。"""
    override = os.environ.get("OMC_PAY_ENABLED")
    if override is not None:
        return override.strip().lower() in ("1", "true", "yes")
    try:
        path = os.environ.get("OMC_PAY_CONFIG") or _PAY_CONFIG_PATH
        with open(path, "r", encoding="utf-8") as f:
            return bool(json.load(f).get("enabled", True))
    except Exception:
        return False


def _init_payments():
    """加载支付模块；配置要求收费却加载失败时 fail-fast，不静默白送算力。"""
    requested = _payments_requested()
    try:
        import payments as _P
        return _P, _P.Payments()
    except Exception as e:
        if requested:
            raise RuntimeError(
                "payments.json 已启用收费，但支付模块加载失败；拒绝静默退回免费模式：%s" % e
            ) from e
        sys.stderr.write("[warn] 支付模块未启用，退回免费模式：%s\n" % e)
        return None, None


P, PAY = _init_payments()

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
    server_version = "OMCUpscaler/0.2"

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

    def _read_json(self):
        n = int(self.headers.get("Content-Length", "0"))
        if n <= 0 or n > 40 * 1024 * 1024:
            raise ValueError("请求体为空或过大")
        return json.loads(self.rfile.read(n).decode("utf-8"))

    @property
    def pay_on(self):
        return PAY is not None and PAY.enabled

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ---- GET ----
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
                    "payments": self.pay_on,
                })
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, 500)
        elif p == "/api/config":
            if self.pay_on:
                self._send_json({"ok": True, **PAY.public_config()})
            else:
                self._send_json({"ok": True, "enabled": False})
        else:
            self._send_json({"error": "not found"}, 404)

    # ---- POST ----
    def do_POST(self):
        p = self.path.split("?")[0]
        if p == "/api/redeem":
            return self._redeem()
        if p == "/api/balance":
            return self._balance()
        if p != "/api/upscale":
            self._send_json({"error": "not found"}, 404)
            return

        try:
            payload = self._read_json()
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

        # ---- 支付门禁：先扣 1 次额度，推理失败自动退回 ----
        token = payload.get("token") or ""
        left = None
        if self.pay_on:
            if not token:
                self._send_json({"error": "请先充值并兑换访问凭证", "code": "PAYMENT_REQUIRED"}, 402)
                return
            try:
                left = PAY.debit(token)
            except P.PaymentError as e:
                self._send_json({"error": str(e), "code": "PAYMENT_REQUIRED"}, 402)
                return

        try:
            src = decode_image(img_b64)
            t0 = time.time()
            out = U.upscale(src, get_session(), scale=4, tile_size=tile, pad=pad)
            infer_ms = int((time.time() - t0) * 1000)
        except Exception as e:
            traceback.print_exc()
            if self.pay_on:
                try:
                    PAY.refund(token)
                except Exception:
                    traceback.print_exc()
            self._send_json({"error": str(e)}, 500)
            return

        result = {
            "ok": True,
            "image": encode_png_b64(out),
            "in_w": src.shape[1], "in_h": src.shape[0],
            "out_w": out.shape[1], "out_h": out.shape[0],
            "scale": 4,
            "infer_ms": infer_ms,
            "provider": get_session().get_providers()[0],
        }
        if left is not None:
            result["balance"] = left
        self._send_json(result)

    # ---- 支付端点 ----
    def _redeem(self):
        if not self.pay_on:
            self._send_json({"error": "支付未启用"}, 403)
            return
        try:
            payload = self._read_json()
        except Exception as e:
            self._send_json({"error": "请求体解析失败: %s" % e}, 400)
            return
        try:
            r = PAY.redeem(payload.get("tx_hash", ""))
            self._send_json({"ok": True, **r})
        except P.PaymentError as e:
            self._send_json({"error": str(e)}, 400)
        except Exception:
            traceback.print_exc()
            self._send_json({"error": "链上验证暂不可用，请稍后重试"}, 502)

    def _balance(self):
        if not self.pay_on:
            self._send_json({"error": "支付未启用"}, 403)
            return
        try:
            payload = self._read_json()
        except Exception as e:
            self._send_json({"error": "请求体解析失败: %s" % e}, 400)
            return
        try:
            self._send_json({"ok": True, **PAY.balance(payload.get("token", ""))})
        except P.PaymentError as e:
            self._send_json({"error": str(e)}, 400)


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

    pay_on = PAY is not None and PAY.enabled
    print("支付 = %s" % ("开启 · AI 工具专用账户 %s" % PAY.public_config()["treasury"]
                         if pay_on else "关闭（免费内测）"))
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print("OMC AI Tools 已启动: http://%s:%d" % (args.host, args.port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n停止")
    return 0


if __name__ == "__main__":
    sys.exit(main())
