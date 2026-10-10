# -*- coding: utf-8 -*-
"""标注测试网质押阶梯为例外，避免与白皮书 7.5 的主网 USD+TWAP 公式冲突。

新增/更新的键：
  nstep3.d        —— 不再暗示"按档位比例"，改为"达到该档位门槛"
  node.stake_note —— testnet 页新增：测试网固定阶梯 vs 主网 §7.5 公式
  stk.tier_scope  —— /stake 页阶梯表上方新增：测试网专用声明

用法：python tools/add-tier-scope-note.py   （在 website/ 目录下运行）
"""
import io
import os
import re
import sys

LANGS = ["en", "zh", "ja", "es", "ko", "pt", "fr"]

NSTEP3_D = {
    "en": 'Stake tOMC to clear your hardware tier\'s minimum and register your node heartbeat.',
    "zh": '质押 tOMC 达到所选硬件的档位门槛，并注册节点心跳。',
    "ja": 'tOMC をステークしてハードウェア階層の最低額を満たし、ノードのハートビートを登録します。',
    "es": 'Deposita tOMC para alcanzar el mínimo de tu nivel de hardware y registra el latido de tu nodo.',
    "ko": 'tOMC를 스테이킹해 하드웨어 등급 최소 요건을 충족하고 노드 하트비트를 등록하세요.',
    "pt": 'Faça stake de tOMC para atingir o mínimo do seu nível de hardware e registre o heartbeat do nó.',
    "fr": 'Stakez des tOMC pour atteindre le minimum de votre palier matériel et enregistrez le battement de votre nœud.',
}

STAKE_NOTE = {
    "en": '<b>Testnet staking is a fixed ladder.</b> Here the minimum stake is a flat published ladder — 20 / 100 / 500 / 1000 / 5000 tOMC for tiers 1–5 — so the testnet can be exercised with faucet tokens alone. On mainnet the minimum follows Whitepaper §7.5: a USD base deposit × tier multiplier ÷ OMC TWAP, so it does not drift with token volatility. The ladder is a testnet convenience, not the mainnet rule.',
    "zh": '<b>测试网质押是一条固定阶梯。</b>此处最低质押额是公开的固定阶梯——1–5 档分别为 20 / 100 / 500 / 1000 / 5000 tOMC——因此仅用水龙头代币就能完整跑通测试网。主网的最低质押额遵循白皮书 §7.5：美元基准押金 × 档位倍数 ÷ OMC TWAP，使其不随代币波动而漂移。该阶梯是测试网的便利设计，不是主网规则。',
    "ja": '<b>テストネットのステーキングは固定ラダーです。</b>ここでの最低ステーク額は公開された固定ラダー（階層 1〜5 で 20 / 100 / 500 / 1000 / 5000 tOMC）で、フォーセットのトークンだけでテストネットを一通り試せます。メインネットの最低額はホワイトペーパー §7.5 に従い、米ドル基準のデポジット × 階層倍率 ÷ OMC TWAP で算出されるため、トークン価格の変動でドリフトしません。この固定ラダーはテストネットの便宜上の設計であり、メインネットのルールではありません。',
    "es": '<b>El staking en la testnet es una escala fija.</b> Aquí el mínimo es una escala publicada y plana — 20 / 100 / 500 / 1000 / 5000 tOMC para los niveles 1–5 — de modo que la testnet puede probarse solo con tokens del faucet. En la mainnet el mínimo sigue el Whitepaper §7.5: un depósito base en USD × multiplicador de nivel ÷ OMC TWAP, para que no se desvíe con la volatilidad del token. La escala fija es una comodidad de la testnet, no la regla de la mainnet.',
    "ko": '<b>테스트넷 스테이킹은 고정 사다리입니다.</b> 여기서 최소 스테이킹은 공개된 고정 사다리로, 1~5등급이 20 / 100 / 500 / 1000 / 5000 tOMC이며, 파우셋 토큰만으로 테스트넷 전체를 실습할 수 있습니다. 메인넷의 최소 금액은 백서 §7.5를 따릅니다 — USD 기준 예치금 × 등급 배수 ÷ OMC TWAP — 따라서 토큰 변동성에 따라 흔들리지 않습니다. 이 고정 사다리는 테스트넷 편의를 위한 것이며 메인넷 규칙이 아닙니다.',
    "pt": '<b>O staking na testnet é uma escada fixa.</b> Aqui o mínimo é uma escada publicada e plana — 20 / 100 / 500 / 1000 / 5000 tOMC para os níveis 1–5 — de modo que a testnet pode ser exercitada apenas com tokens do faucet. Na mainnet o mínimo segue o Whitepaper §7.5: um depósito base em USD × multiplicador de nível ÷ OMC TWAP, para não se desviar com a volatilidade do token. A escada fixa é uma conveniência da testnet, não a regra da mainnet.',
    "fr": "<b>Le staking sur la testnet est une échelle fixe.</b> Ici, le minimum est une échelle publiée et plate — 20 / 100 / 500 / 1000 / 5000 tOMC pour les paliers 1 à 5 — de sorte que la testnet peut être testée avec les seuls jetons du faucet. Sur le mainnet, le minimum suit le Whitepaper §7.5 : un dépôt de base en USD × multiplicateur de palier ÷ OMC TWAP, afin qu'il ne dérive pas avec la volatilité du jeton. L'échelle fixe est une commodité de testnet, et non la règle du mainnet.",
}

TIER_SCOPE = {
    "en": 'These amounts are the <b>testnet</b> ladder. On mainnet the minimum follows Whitepaper §7.5 — a USD base deposit × tier multiplier ÷ OMC TWAP — so it does not drift with token volatility. The fixed ladder is a testnet convenience.',
    "zh": '表中的金额是<b>测试网</b>阶梯。主网的最低质押额遵循白皮书 §7.5——美元基准押金 × 档位倍数 ÷ OMC TWAP——使其不随代币波动而漂移。固定阶梯是测试网的便利设计。',
    "ja": '表内の金額は<b>テストネット</b>のラダーです。メインネットの最低額はホワイトペーパー §7.5（米ドル基準デポジット × 階層倍率 ÷ OMC TWAP）に従うため、トークン価格の変動でドリフトしません。この固定ラダーはテストネットの便宜上の設計です。',
    "es": 'Estos importes son la escala de la <b>testnet</b>. En la mainnet el mínimo sigue el Whitepaper §7.5 — un depósito base en USD × multiplicador de nivel ÷ OMC TWAP — para que no se desvíe con la volatilidad del token. La escala fija es una comodidad de la testnet.',
    "ko": '이 금액은 <b>테스트넷</b> 사다리입니다. 메인넷의 최소 금액은 백서 §7.5 — USD 기준 예치금 × 등급 배수 ÷ OMC TWAP — 를 따르므로 토큰 변동성에 흔들리지 않습니다. 이 고정 사다리는 테스트넷 편의를 위한 것입니다.',
    "pt": 'Estes valores são a escada da <b>testnet</b>. Na mainnet o mínimo segue o Whitepaper §7.5 — um depósito base em USD × multiplicador de nível ÷ OMC TWAP — para não se desviar com a volatilidade do token. A escada fixa é uma conveniência da testnet.',
    "fr": "Ces montants sont l'échelle de la <b>testnet</b>. Sur le mainnet, le minimum suit le Whitepaper §7.5 — un dépôt de base en USD × multiplicateur de palier ÷ OMC TWAP — afin qu'il ne dérive pas avec la volatilité du jeton. L'échelle fixe est une commodité de testnet.",
}


def js_escape(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    touched = 0
    for lang in LANGS:
        path = os.path.join(base, "assets", "js", "lang", "%s.js" % lang)
        with io.open(path, "r", encoding="utf-8") as fh:
            src = fh.read()

        # 1. replace nstep3.d in place (it already exists)
        pat_nstep = re.compile(r'(\s*"nstep3\.d":\s*)".*?"(,?\s*\n)', re.S)
        if not pat_nstep.search(src):
            print("[%s] MISSING nstep3.d" % lang)
            sys.exit(1)
        src = pat_nstep.sub(lambda m: m.group(1) + '"%s"' % js_escape(NSTEP3_D[lang]) + m.group(2), src, count=1)

        # 2. insert / update node.stake_note right after node.note
        pat_node = re.compile(r'(\s*"node\.note":\s*".*?"(?:,\s*\n))', re.S)
        m = pat_node.search(src)
        if not m:
            print("[%s] MISSING node.note anchor" % lang)
            sys.exit(1)
        entry = '  "node.stake_note": "%s",\n' % js_escape(STAKE_NOTE[lang])
        if '"node.stake_note"' in src:
            src = re.sub(r'\s*"node\.stake_note":\s*".*?"(,\s*\n)', "\n" + entry.rstrip("\n") + "\\1", src, count=1, flags=re.S)
        else:
            src = src[: m.end(1)] + entry + src[m.end(1):]

        # 3. insert / update stk.tier_scope right after stk.h_tiers_sub
        pat_sub = re.compile(r'(\s*"stk\.h_tiers_sub":\s*".*?"(?:,\s*\n))', re.S)
        m2 = pat_sub.search(src)
        if not m2:
            print("[%s] MISSING stk.h_tiers_sub anchor" % lang)
            sys.exit(1)
        entry2 = '  "stk.tier_scope": "%s",\n' % js_escape(TIER_SCOPE[lang])
        if '"stk.tier_scope"' in src:
            src = re.sub(r'\s*"stk\.tier_scope":\s*".*?"(,\s*\n)', "\n" + entry2.rstrip("\n") + "\\1", src, count=1, flags=re.S)
        else:
            src = src[: m2.end(1)] + entry2 + src[m2.end(1):]

        with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(src)
        touched += 1
        print("[%s] ok" % lang)
    print("touched %d files" % touched)


if __name__ == "__main__":
    main()
