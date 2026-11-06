#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""server.py 的 HTTP 端点冒烟测试。

CV / ONNX 模型全部用 stub 替换，不加载真实模型，也不联网。
验证：配置暴露、无凭证拦截、兑换、余额、按次扣减、推理失败退款、免费模式降级。

运行：与 test_payments.py 一起被 discover 收走
    python -m unittest discover -s p0-worker -p "test_*.py" -v
"""

import http.client
import json
import os
import sys
import tempfile
import threading
import types
import unittest
from http.server import ThreadingHTTPServer
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# ---- 在 import server 之前，把外部重依赖换成 stub --------------------------
_cv2 = types.ModuleType("cv2")
_cv2.IMREAD_COLOR = 1
_cv2.imdecode = lambda *a, **k: None
_cv2.imencode = lambda *a, **k: (False, None)
sys.modules["cv2"] = _cv2

_np = types.ModuleType("numpy")
_np.ndarray = type("ndarray", (), {})
_np.uint8 = "uint8"
_np.frombuffer = lambda *a, **k: None
sys.modules["numpy"] = _np

_up = types.ModuleType("upscale")
_up.MODEL_PATH = "stub-model.onnx"
_up.load_session = lambda p: None
_up.upscale = lambda *a, **k: None
sys.modules["upscale"] = _up

import server as S          # noqa: E402
import payments as P        # noqa: E402
import test_payments as T   # noqa: E402  复用 cfg / fake_rpc / 常量


class FakeSession:
    def get_providers(self):
        return ["StubExecutionProvider"]


class FakeImg:
    """server 会读 src / out 的 shape 填回包字段。"""
    def __init__(self, h=100, w=200):
        self.shape = (h, w, 3)


class Harness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), S.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        ledger = P.Ledger(path=os.path.join(self.tmp.name, "credits.json"))
        self.pay = P.Payments(cfg=T.cfg(), ledger=ledger)
        self._orig_pay, S.PAY = S.PAY, self.pay
        self.addCleanup(lambda: setattr(S, "PAY", self._orig_pay))

        # 推理链路全 stub：decode 返回假 ndarray，upscale 原样返回，encode 返回假 dataURL
        self.sess_patch = mock.patch.object(S, "get_session", return_value=FakeSession())
        self.sess_patch.start()
        self.addCleanup(self.sess_patch.stop)
        self.decode_patch = mock.patch.object(S, "decode_image", return_value=FakeImg())
        self.decode_patch.start()
        self.addCleanup(self.decode_patch.stop)
        self.encode_patch = mock.patch.object(S, "encode_png_b64", return_value="data:image/png;base64,STUB")
        self.encode_patch.start()
        self.addCleanup(self.encode_patch.stop)
        self.upscale_patch = mock.patch.object(S.U, "upscale", return_value=FakeImg(400, 800))
        self.upscale_patch.start()
        self.addCleanup(self.upscale_patch.stop)

    # ---- HTTP 小工具 ----
    def req(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        payload = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json"} if body is not None else {}
        conn.request(method, path, body=payload, headers=headers)
        r = conn.getresponse()
        data = json.loads(r.read().decode("utf-8"))
        conn.close()
        return r.status, data

    def redeem(self):
        with mock.patch.object(P, "rpc_call", side_effect=T.fake_rpc()):
            code, j = self.req("POST", "/api/redeem", {"tx_hash": T.TX})
        self.assertEqual(code, 200, j)
        return j["token"]

    # ---- 用例 ----
    def test_config_exposes_scope_and_no_secrets(self):
        code, j = self.req("GET", "/api/config")
        self.assertEqual(code, 200)
        self.assertEqual(j["scope"], "ai-tools-only")
        self.assertEqual(j["treasury"], T.TREASURY)
        self.assertNotIn("rpcs", j)

    def test_upscale_without_token_is_rejected_402(self):
        code, j = self.req("POST", "/api/upscale", {"image": "data:image/png;base64,AAAA"})
        self.assertEqual(code, 402)
        self.assertEqual(j["code"], "PAYMENT_REQUIRED")

    def test_full_paid_flow_debits_one_credit(self):
        tok = self.redeem()
        _, bal = self.req("POST", "/api/balance", {"token": tok})
        self.assertEqual(bal["balance"], 66)
        code, j = self.req("POST", "/api/upscale", {"image": "data:image/png;base64,AAAA", "token": tok})
        self.assertEqual(code, 200, j)
        self.assertTrue(j["ok"])
        self.assertEqual(j["balance"], 65)
        self.assertEqual(j["image"], "data:image/png;base64,STUB")
        _, bal2 = self.req("POST", "/api/balance", {"token": tok})
        self.assertEqual(bal2["balance"], 65)

    def test_inference_failure_refunds_credit(self):
        tok = self.redeem()
        with mock.patch.object(S.U, "upscale", side_effect=RuntimeError("GPU OOM")):
            code, j = self.req("POST", "/api/upscale", {"image": "data:image/png;base64,AAAA", "token": tok})
        self.assertEqual(code, 500)
        _, bal = self.req("POST", "/api/balance", {"token": tok})
        self.assertEqual(bal["balance"], 66, "推理失败必须退回额度")

    def test_exhausted_credit_returns_402(self):
        tok = self.redeem()
        self.pay.ledger.data["accounts"][T.PAYER] = 0
        self.pay.ledger._flush()
        code, j = self.req("POST", "/api/upscale", {"image": "data:image/png;base64,AAAA", "token": tok})
        self.assertEqual(code, 402)
        self.assertIn("额度已用完", j["error"])

    def test_redeem_rejects_wrong_recipient(self):
        with mock.patch.object(P, "rpc_call", side_effect=T.fake_rpc(to=T.PAYER)):
            code, j = self.req("POST", "/api/redeem", {"tx_hash": T.TX})
        self.assertEqual(code, 400)
        self.assertIn("收款地址不匹配", j["error"])

    def test_free_mode_fallback(self):
        """enabled=False 时退回 P0 免费内测，不要求凭证。"""
        free = P.Payments(cfg=T.cfg(enabled=False),
                          ledger=P.Ledger(path=os.path.join(self.tmp.name, "free.json")))
        S.PAY = free
        code, j = self.req("GET", "/api/config")
        self.assertEqual(j["enabled"], False)
        code, j = self.req("POST", "/api/upscale", {"image": "data:image/png;base64,AAAA"})
        self.assertEqual(code, 200, j)
        self.assertTrue(j["ok"])
        self.assertNotIn("balance", j)


if __name__ == "__main__":
    unittest.main(verbosity=2)
