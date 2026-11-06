#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
OMC AI Tools · T1 · 支付与额度（prepaid credits）

账户边界（重要）
----------------
这个模块只服务「AI 工具付费」这一条资金管道。收款地址写在 payments.json 的
`treasury`，它与空投手续费是**完全隔离**的两个账户：

    空投手续费 : 用户调用未来的 claim() 合约，合约内收 0.01 BNB/份并按 60/40 分账。
                 收款方 contracts/params.json -> airdrop.claimCost.treasuryAddress = null，
                 真合约与多签 Safe 一起部署时才确定。
    AI 工具付费 : 用户直接转一笔 BNB 到 payments.json 的 treasury，
                 本模块读链验证交易哈希后发放额度。

`scope` 字段固定为 "ai-tools-only"，test_payments.py 有一条用例会阻止两个
地址被误填成同一个。任何时候都不要把这个地址当成空投合约或国库地址。

为什么不是「每单付一次链上」
----------------------------
BSC 一笔转账的 gas 约 0.0001–0.0005 BNB，而一张超分图定价 $0.01 级别，
gas 比商品本身贵 7–30 倍。所以采用：

    链上充值一次 → 服务端验证交易 → 链下按次扣额度

用户付一次款，之后每次出图扣 1 credit，无需再上链。

安全边界
--------
- 本模块**没有任何私钥**，只通过公共 RPC **读**链。它不会、也不能转移资金。
- treasury 地址只作为「交易的 to 必须等于它」的验证目标。
- 每笔交易哈希只能兑换一次（防重放）；交易必须成功且有足够确认数。
- 额度与 token 存本地 JSON，原子写；不记录任何用户图片。

测试：
    python -m unittest discover -s p0-worker -p "test_*.py"   （RPC 全部 mock，不联网）
"""

import json
import os
import secrets
import threading
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "payments.json")
DEFAULT_LEDGER = os.path.join(HERE, ".credits.json")


class PaymentError(Exception):
    """可安全展示给用户的支付错误。"""


# ---------------------------------------------------------------- 配置
def load_config(path=None):
    """读配置，并允许环境变量覆盖（测试 / 测试网切换用）。"""
    p = path or os.environ.get("OMC_PAY_CONFIG") or CONFIG_PATH
    with open(p, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    # 整数金额一律用 wei 字符串或数字，转成 int，避免浮点误差
    for k in ("price_wei", "min_topup_wei", "chain_id", "confirmations", "rpc_timeout_s"):
        cfg[k] = int(cfg[k])

    if os.environ.get("OMC_PAY_TREASURY"):
        cfg["treasury"] = os.environ["OMC_PAY_TREASURY"]
    if os.environ.get("OMC_PAY_CHAIN_ID"):
        cfg["chain_id"] = int(os.environ["OMC_PAY_CHAIN_ID"])
    if os.environ.get("OMC_PAY_RPC"):
        cfg["rpcs"] = [u.strip() for u in os.environ["OMC_PAY_RPC"].split(",") if u.strip()]
    if os.environ.get("OMC_PAY_ENABLED"):
        cfg["enabled"] = os.environ["OMC_PAY_ENABLED"].strip().lower() in ("1", "true", "yes")
    if os.environ.get("OMC_PAY_MIN_CONFIRMATIONS"):
        cfg["confirmations"] = int(os.environ["OMC_PAY_MIN_CONFIRMATIONS"])

    if cfg.get("scope") != "ai-tools-only":
        raise ValueError("scope 必须为 'ai-tools-only'（本账户只收 AI 工具的钱）")
    if cfg["price_wei"] <= 0:
        raise ValueError("price_wei 必须 > 0")
    if cfg["min_topup_wei"] < cfg["price_wei"]:
        raise ValueError("min_topup_wei 必须 >= price_wei")
    if not cfg["treasury"].startswith("0x") or len(cfg["treasury"]) != 42:
        raise ValueError("treasury 地址格式不对")
    return cfg


# ---------------------------------------------------------------- RPC
def rpc_call(method, params, cfg):
    """向公共 RPC 列表依次发 JSON-RPC，返回 result。全部失败抛 PaymentError。

    抽成模块级函数是为了单测里能整体 mock，不碰网络。
    """
    body = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": method, "params": params
    }).encode("utf-8")
    last = None
    for url in cfg["rpcs"]:
        try:
            req = urllib.request.Request(
                url, data=body,
                headers={"Content-Type": "application/json", "User-Agent": "OMC-Tools/1.0"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=cfg["rpc_timeout_s"]) as r:
                payload = json.loads(r.read().decode("utf-8"))
            if "error" in payload:
                last = PaymentError(str(payload["error"]))
                continue
            return payload.get("result")
        except Exception as e:  # noqa: BLE001 - 换下一个节点
            last = e
            continue
    raise PaymentError("RPC 暂不可用，请稍后重试（%s）" % (last,))


def _hex_int(v):
    if v is None:
        return None
    if isinstance(v, int):
        return v
    return int(v, 16)


def verify_topup(tx_hash, cfg):
    """验证一笔充值交易。返回 (payer_lower, value_wei, credits)。

    校验项：hash 格式 / 链 ID / 交易存在 / to == treasury / value >= 下限 /
    交易成功 / 确认数。任一不过抛 PaymentError。
    """
    if not isinstance(tx_hash, str) or not tx_hash.startswith("0x") or len(tx_hash) != 66:
        raise PaymentError("交易哈希格式不对（应为 0x + 64 位十六进制）")
    try:
        int(tx_hash, 16)
    except ValueError:
        raise PaymentError("交易哈希不是合法十六进制")

    # 链校验：防止把别的链 / 测试网的交易拿来兑主网额度
    cid = _hex_int(rpc_call("eth_chainId", [], cfg))
    if cid is None or cid != cfg["chain_id"]:
        raise PaymentError("链 ID 不匹配（RPC=%s，期望 %s）" % (cid, cfg["chain_id"]))

    tx = rpc_call("eth_getTransactionByHash", [tx_hash], cfg)
    if not tx:
        raise PaymentError("找不到这笔交易，或尚未广播上链")

    to = (tx.get("to") or "").lower()
    if to != cfg["treasury"].lower():
        raise PaymentError("收款地址不匹配：这笔钱没有转给本工具账户")

    payer = (tx.get("from") or "").lower()
    if not payer:
        raise PaymentError("交易缺少 from 字段")
    value = _hex_int(tx.get("value"))
    if value is None or value < cfg["min_topup_wei"]:
        raise PaymentError("充值金额不足（最低 %s wei）" % cfg["min_topup_wei"])

    receipt = rpc_call("eth_getTransactionReceipt", [tx_hash], cfg)
    if not receipt:
        raise PaymentError("交易还没被打包，请等确认后再兑换")
    status = _hex_int(receipt.get("status"))
    if status != 1:
        raise PaymentError("这笔交易执行失败（status=%s）" % status)

    block = _hex_int(tx.get("blockNumber"))
    head = _hex_int(rpc_call("eth_blockNumber", [], cfg))
    if block is None or head is None:
        raise PaymentError("拿不到区块高度，请稍后重试")
    conf = head - block + 1
    if conf < cfg["confirmations"]:
        raise PaymentError("确认数不足（%d/%d），请稍后再兑换" % (conf, cfg["confirmations"]))

    credits = value // cfg["price_wei"]
    if credits <= 0:
        raise PaymentError("充值金额不够换 1 次额度")
    return payer, value, credits


# ---------------------------------------------------------------- 账本
class Ledger:
    """本地额度账本。单文件 JSON + 原子替换 + 进程内锁。"""

    def __init__(self, path=None):
        self.path = path or os.environ.get("OMC_PAY_LEDGER") or DEFAULT_LEDGER
        self.lock = threading.RLock()
        self.data = {"used_tx": {}, "tokens": {}, "accounts": {}}
        if os.path.isfile(self.path):
            with open(self.path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            for k in self.data:
                if isinstance(loaded.get(k), dict):
                    self.data[k] = loaded[k]

    def _flush(self):
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.path)


class Payments:
    def __init__(self, cfg=None, ledger=None):
        self.cfg = cfg or load_config()
        self.ledger = ledger or Ledger()

    @property
    def enabled(self):
        return bool(self.cfg.get("enabled", True))

    def public_config(self):
        """给前端的字段——只暴露必要信息，不暴露账本路径 / RPC 列表等内部细节。"""
        return {
            "enabled": self.enabled,
            "scope": self.cfg.get("scope"),
            "scope_note": self.cfg.get("scope_note", ""),
            "treasury": self.cfg["treasury"],
            "chain_id": self.cfg["chain_id"],
            "price_wei": self.cfg["price_wei"],
            "price_bnb": self.cfg["price_wei"] / 1e18,
            "min_topup_wei": self.cfg["min_topup_wei"],
            "min_topup_bnb": self.cfg["min_topup_wei"] / 1e18,
            "confirmations": self.cfg["confirmations"],
        }

    def _payer_of(self, token):
        if not isinstance(token, str) or not token:
            raise PaymentError("缺少访问凭证，请先充值")
        payer = self.ledger.data["tokens"].get(token)
        if not payer:
            raise PaymentError("访问凭证无效，请重新兑换")
        return payer

    def redeem(self, tx_hash):
        """兑换一笔充值。成功返回 {token, payer, credits, balance}。"""
        tx_hash = (tx_hash or "").strip()
        with self.ledger.lock:
            if tx_hash in self.ledger.data["used_tx"]:
                raise PaymentError("这笔交易已经兑换过了")

        # 链上验证放在锁外（网络 IO 慢），进入锁后再复查一次防并发重放
        payer, value, credits = verify_topup(tx_hash, self.cfg)

        with self.ledger.lock:
            if tx_hash in self.ledger.data["used_tx"]:
                raise PaymentError("这笔交易已经兑换过了")
            token = secrets.token_urlsafe(24)
            self.ledger.data["used_tx"][tx_hash] = {
                "payer": payer, "value_wei": value, "credits": credits, "at": int(time.time())
            }
            self.ledger.data["tokens"][token] = payer
            acc = self.ledger.data["accounts"].get(payer, 0) + credits
            self.ledger.data["accounts"][payer] = acc
            self.ledger._flush()
        return {"token": token, "payer": payer, "credits": credits, "balance": acc}

    def balance(self, token):
        with self.ledger.lock:
            payer = self._payer_of(token)
            return {"balance": self.ledger.data["accounts"].get(payer, 0), "payer": payer}

    def debit(self, token):
        """扣 1 次额度，成功返回剩余次数。额度不足抛 PaymentError。"""
        with self.ledger.lock:
            payer = self._payer_of(token)
            left = self.ledger.data["accounts"].get(payer, 0)
            if left <= 0:
                raise PaymentError("额度已用完，请充值")
            self.ledger.data["accounts"][payer] = left - 1
            self.ledger._flush()
            return left - 1

    def refund(self, token):
        """推理失败时退回 1 次额度（只用于 debit 之后、出图之前的失败）。"""
        with self.ledger.lock:
            payer = self._payer_of(token)
            self.ledger.data["accounts"][payer] = self.ledger.data["accounts"].get(payer, 0) + 1
            self.ledger._flush()
            return self.ledger.data["accounts"][payer]
