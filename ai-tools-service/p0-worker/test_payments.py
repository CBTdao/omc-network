#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""payments.py 单测：RPC 全部 mock，不联网、不碰真实账本。

运行（在 ai-tools-service/ 目录下）：
    python -m unittest discover -s p0-worker -p "test_*.py" -v
"""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def _repo_root():
    d = HERE
    for _ in range(6):
        if os.path.isfile(os.path.join(d, "contracts", "params.json")):
            return d
        d = os.path.dirname(d)
    return os.path.dirname(os.path.dirname(HERE))


ROOT = _repo_root()  # omc-network/

import payments as P  # noqa: E402

TREASURY = "0x838EDFBA183A8BcA3AF5a48Eb3Df7e68A9464b0A"
PAYER = "0x1111111111111111111111111111111111111111"
TX = "0x" + "ab" * 32
PRICE = 15_000_000_000_000
MIN_TOPUP = 1_000_000_000_000_000


def cfg(**over):
    c = {
        "scope": "ai-tools-only",
        "enabled": True,
        "treasury": TREASURY,
        "chain_id": 56,
        "rpcs": ["http://127.0.0.1:1"],
        "rpc_timeout_s": 1,
        "confirmations": 3,
        "price_wei": PRICE,
        "min_topup_wei": MIN_TOPUP,
    }
    c.update(over)
    return c


def fake_rpc(*, to=TREASURY, value=MIN_TOPUP, block=0x60, head=0x64,
             status=1, chain_id=56, found=True, receipt=True, payer=PAYER):
    """构造一个按 method 分派的假 RPC。"""
    def _call(method, params, _cfg):
        if method == "eth_chainId":
            return hex(chain_id)
        if method == "eth_blockNumber":
            return hex(head)
        if method == "eth_getTransactionByHash":
            if not found:
                return None
            return {
                "hash": params[0], "from": payer, "to": to,
                "value": hex(value), "blockNumber": hex(block),
            }
        if method == "eth_getTransactionReceipt":
            if not receipt:
                return None
            return {"status": hex(status)}
        raise AssertionError("unexpected RPC method: " + method)
    return _call


class Harness(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.ledger = P.Ledger(path=os.path.join(self.tmp.name, "credits.json"))
        self.pay = P.Payments(cfg=cfg(), ledger=self.ledger)

    def redeem_ok(self, rpc=None):
        with mock.patch.object(P, "rpc_call", side_effect=rpc or fake_rpc()):
            return self.pay.redeem(TX)


class TestConfigScope(unittest.TestCase):
    """账户隔离护栏：工具账户绝不能变成空投手续费账户。"""

    @staticmethod
    def _find(obj, key):
        if isinstance(obj, dict):
            if key in obj:
                return obj[key]
            for v in obj.values():
                r = TestConfigScope._find(v, key)
                if r is not None:
                    return r
        elif isinstance(obj, list):
            for v in obj:
                r = TestConfigScope._find(v, key)
                if r is not None:
                    return r
        return None

    def test_real_config_scope_is_tools_only(self):
        with open(os.path.join(HERE, "payments.json"), encoding="utf-8") as f:
            real = json.load(f)
        self.assertEqual(real["scope"], "ai-tools-only")
        self.assertTrue(real["treasury"].startswith("0x"))

    def test_tool_address_is_not_the_airdrop_treasury(self):
        with open(os.path.join(HERE, "payments.json"), encoding="utf-8") as f:
            real = json.load(f)
        params_path = os.path.join(ROOT, "contracts", "params.json")
        with open(params_path, encoding="utf-8") as f:
            params = json.load(f)
        airdrop_addr = self._find(params, "treasuryAddress")
        # 将来空投地址定下来后，这条会强制检查两者不同
        self.assertNotEqual(real["treasury"].lower(), (airdrop_addr or "").lower())

    def test_load_config_rejects_wrong_scope(self):
        c = cfg(scope="treasury")
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(c, f)
            path = f.name
        self.addCleanup(lambda: os.unlink(path))
        with self.assertRaisesRegex(ValueError, "ai-tools-only"):
            P.load_config(path=path)


class TestVerifyTopup(Harness):
    def test_valid_topup_credits(self):
        with mock.patch.object(P, "rpc_call", side_effect=fake_rpc()):
            payer, value, credits = P.verify_topup(TX, cfg())
        self.assertEqual(payer, PAYER)
        self.assertEqual(value, MIN_TOPUP)
        self.assertEqual(credits, MIN_TOPUP // PRICE)

    def test_bad_hash_format(self):
        with self.assertRaises(P.PaymentError):
            P.verify_topup("0x123", cfg())

    def test_wrong_recipient(self):
        with mock.patch.object(P, "rpc_call", side_effect=fake_rpc(to=PAYER)):
            with self.assertRaisesRegex(P.PaymentError, "收款地址不匹配"):
                P.verify_topup(TX, cfg())

    def test_underpay(self):
        with mock.patch.object(P, "rpc_call", side_effect=fake_rpc(value=PRICE)):
            with self.assertRaisesRegex(P.PaymentError, "充值金额不足"):
                P.verify_topup(TX, cfg())

    def test_failed_tx(self):
        with mock.patch.object(P, "rpc_call", side_effect=fake_rpc(status=0)):
            with self.assertRaisesRegex(P.PaymentError, "执行失败"):
                P.verify_topup(TX, cfg())

    def test_missing_receipt(self):
        with mock.patch.object(P, "rpc_call", side_effect=fake_rpc(receipt=False)):
            with self.assertRaisesRegex(P.PaymentError, "还没被打包"):
                P.verify_topup(TX, cfg())

    def test_insufficient_confirmations(self):
        with mock.patch.object(P, "rpc_call", side_effect=fake_rpc(block=0x63, head=0x64)):
            with self.assertRaisesRegex(P.PaymentError, "确认数不足"):
                P.verify_topup(TX, cfg())

    def test_wrong_chain(self):
        with mock.patch.object(P, "rpc_call", side_effect=fake_rpc(chain_id=97)):
            with self.assertRaisesRegex(P.PaymentError, "链 ID 不匹配"):
                P.verify_topup(TX, cfg())

    def test_tx_not_found(self):
        with mock.patch.object(P, "rpc_call", side_effect=fake_rpc(found=False)):
            with self.assertRaisesRegex(P.PaymentError, "找不到这笔交易"):
                P.verify_topup(TX, cfg())


class TestRedeemAndCredits(Harness):
    def test_redeem_returns_token_and_balance(self):
        r = self.redeem_ok()
        self.assertTrue(r["token"])
        self.assertEqual(r["credits"], MIN_TOPUP // PRICE)
        self.assertEqual(r["balance"], r["credits"])

    def test_replay_rejected(self):
        self.redeem_ok()
        # 第二次连 RPC 都不该打
        with mock.patch.object(P, "rpc_call", side_effect=AssertionError("should not call RPC")):
            with self.assertRaisesRegex(P.PaymentError, "已经兑换过"):
                self.pay.redeem(TX)

    def test_redeem_failure_does_not_burn_tx(self):
        with mock.patch.object(P, "rpc_call", side_effect=fake_rpc(to=PAYER)):
            with self.assertRaises(P.PaymentError):
                self.pay.redeem(TX)
        self.assertNotIn(TX, self.ledger.data["used_tx"])
        r = self.redeem_ok()
        self.assertEqual(r["balance"], r["credits"])

    def test_debit_exhaustion_and_refund(self):
        r = self.redeem_ok()
        tok = r["token"]
        total = r["credits"]
        for i in range(total):
            self.assertEqual(self.pay.debit(tok), total - i - 1)
        with self.assertRaisesRegex(P.PaymentError, "额度已用完"):
            self.pay.debit(tok)
        self.assertEqual(self.pay.refund(tok), 1)
        self.assertEqual(self.pay.balance(tok)["balance"], 1)

    def test_invalid_token(self):
        with self.assertRaisesRegex(P.PaymentError, "访问凭证无效"):
            self.pay.balance("bogus")
        with self.assertRaisesRegex(P.PaymentError, "缺少访问凭证"):
            self.pay.debit("")

    def test_ledger_persists_across_restart(self):
        r = self.redeem_ok()
        reloaded = P.Payments(cfg=cfg(), ledger=P.Ledger(path=self.ledger.path))
        self.assertEqual(reloaded.balance(r["token"])["balance"], r["credits"])
        with mock.patch.object(P, "rpc_call", side_effect=AssertionError("should not call RPC")):
            with self.assertRaisesRegex(P.PaymentError, "已经兑换过"):
                reloaded.redeem(TX)

    def test_public_config_exposes_scope_not_secrets(self):
        pub = self.pay.public_config()
        self.assertEqual(pub["scope"], "ai-tools-only")
        self.assertEqual(pub["treasury"], TREASURY)
        self.assertNotIn("rpcs", pub)


if __name__ == "__main__":
    unittest.main(verbosity=2)
