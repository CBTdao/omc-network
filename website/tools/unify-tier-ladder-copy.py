# -*- coding: utf-8 -*-
"""测试网 = 主网：把「测试网例外」措辞改为「统一规则」。

背景：此前把测试网 5 档标为"测试网便利、主网按白皮书 §7.5 USD+TWAP"，
现决策为**测试网即主网规则**，白皮书 §7.5 已改为同一套固定 5 档。
因此这两个键必须改写，不能再出现「仅测试网」「主网另有公式」的表述。

修订键：
  stk.tier_scope  —— 阶梯表上方说明：改为"这是全站统一的质押阶梯"
  node.stake_note —— testnet 页说明：同上
  stk.h_stake_sub —— "A tier is a hardware class" 保留，但补"全站统一"
  stk.tier_note   —— 补硬件对应，去掉"测试网"暗示

用法：python tools/unify-tier-ladder-copy.py   （在 website/ 目录下运行）
"""
import io
import os
import re
import sys

LANGS = ["en", "zh", "ja", "es", "ko", "pt", "fr"]

TIER_SCOPE = {
    "en": 'This is the staking ladder for the whole protocol — the same five tiers, at the same OMC minimums, on testnet and on mainnet. The table is read live from the contract, so it cannot drift from what is deployed.',
    "zh": '这是全协议统一的质押阶梯——测试网与主网使用同样的五档、同样的 OMC 门槛。表格实时读取合约，因此不会与已部署的规则脱节。',
    "ja": 'これはプロトコル全体で共通のステーキング・ラダーです — テストネットとメインネットで同じ 5 階層・同じ最低 OMC 額を使用します。表はコントラクトから直接読み取るため、デプロイ内容と乖離しません。',
    "es": 'Esta es la escala de staking de todo el protocolo: los mismos cinco niveles y los mismos mínimos en OMC, tanto en la testnet como en la mainnet. La tabla se lee en vivo del contrato, así que no puede desviarse de lo desplegado.',
    "ko": '이것은 프로토콜 전체의 스테이킹 사다리입니다 — 테스트넷과 메인넷에서 동일한 5개 등급, 동일한 OMC 최소 금액을 사용합니다. 표는 컨트랙트에서 실시간으로 읽어오므로 배포된 내용과 어긋날 수 없습니다.',
    "pt": 'Esta é a escada de staking de todo o protocolo — os mesmos cinco níveis e os mesmos mínimos em OMC, tanto na testnet quanto na mainnet. A tabela é lida ao vivo do contrato, então não pode divergir do que está implantado.',
    "fr": "Ceci est l'échelle de staking de l'ensemble du protocole — les mêmes cinq paliers et les mêmes minimums en OMC, sur la testnet comme sur le mainnet. Le tableau est lu en direct depuis le contrat, il ne peut donc pas diverger de ce qui est déployé.",
}

STAKE_NOTE = {
    "en": '<b>One staking ladder, testnet and mainnet.</b> The five tiers and their minimums — 20 / 100 / 500 / 1000 / 5000 tOMC — are the rules the protocol will run at launch, not a testnet stand-in. Registering a node here positions you for the same tier after mainnet.',
    "zh": '<b>一套质押阶梯，测试网与主网通用。</b>五档及其门槛——20 / 100 / 500 / 1000 / 5000 tOMC——即协议上线时采用的规则，并非测试网的替代品。在此注册节点，等于为主网的同档位做好了准备。',
    "ja": '<b>ステーキング・ラダーはテストネットとメインネットで共通です。</b>5 つの階層と最低額（20 / 100 / 500 / 1000 / 5000 tOMC）は、ローンチ時にプロトコルが採用するルールであり、テストネット用の代替ではありません。ここでノードを登録すれば、メインネット後も同じ階層の位置づけが保たれます。',
    "es": '<b>Una sola escala de staking, testnet y mainnet.</b> Los cinco niveles y sus mínimos — 20 / 100 / 500 / 1000 / 5000 tOMC — son las reglas con las que operará el protocolo en su lanzamiento, no un sustituto de la testnet. Registrar un nodo aquí te posiciona para el mismo nivel tras la mainnet.',
    "ko": '<b>테스트넷과 메인넷이 공유하는 하나의 스테이킹 사다리.</b> 5개 등급과 최소 금액(20 / 100 / 500 / 1000 / 5000 tOMC)은 출시 시 프로토콜이 채택할 규칙이며, 테스트넷용 대체물이 아닙니다. 여기서 노드를 등록하면 메인넷 이후에도 동일한 등급이 유지됩니다.',
    "pt": '<b>Uma única escada de staking, testnet e mainnet.</b> Os cinco níveis e seus mínimos — 20 / 100 / 500 / 1000 / 5000 tOMC — são as regras com que o protocolo vai operar no lançamento, não um substituto de testnet. Registrar um nó aqui posiciona você para o mesmo nível após a mainnet.',
    "fr": "<b>Une seule échelle de staking, testnet et mainnet.</b> Les cinq paliers et leurs minimums — 20 / 100 / 500 / 1000 / 5000 tOMC — sont les règles que le protocole appliquera au lancement, et non un substitut de testnet. Enregistrer un nœud ici vous positionne pour le même palier après le mainnet.",
}

TIER_NOTE = {
    "en": "Tier 1 = 20 tOMC (one airdrop entry), tier 2 = 100 tOMC (a maxed-out airdrop) — a wallet that maxes out the community airdrop reaches tier 2 without buying anything. Tiers 3-5 span 500 / 1000 / 5000 tOMC and are priced for data-center accelerators and cluster-scale deployments.",
    "zh": "第 1 档 = 20 tOMC（一次空投领取），第 2 档 = 100 tOMC（领满空投）——领满社区空投即可无需购买直达第 2 档。第 3–5 档为 500 / 1000 / 5000 tOMC，对应数据中心加速卡与集群级部署。",
    "ja": "階層 1 = 20 tOMC（エアドロップ 1 回分）、階層 2 = 100 tOMC（エアドロップ満額）— コミュニティ・エアドロップを満額受け取れば、購入なしで階層 2 に到達できます。階層 3〜5 は 500 / 1000 / 5000 tOMC で、データセンター向けアクセラレータとクラスタ規模のデプロイを想定した価格設定です。",
    "es": "Nivel 1 = 20 tOMC (una entrada del airdrop), nivel 2 = 100 tOMC (el airdrop completo) — una cartera que agota el airdrop comunitario alcanza el nivel 2 sin comprar nada. Los niveles 3-5 abarcan 500 / 1000 / 5000 tOMC y están tarifados para aceleradores de centro de datos y despliegues a escala de clúster.",
    "ko": "1등급 = 20 tOMC(에어드롭 1회분), 2등급 = 100 tOMC(에어드롭 최대치) — 커뮤니티 에어드롭을 최대로 받으면 구매 없이 2등급에 도달합니다. 3~5등급은 500 / 1000 / 5000 tOMC이며 데이터센터 가속기와 클러스터 규모 배포를 기준으로 책정됩니다.",
    "pt": "Nível 1 = 20 tOMC (uma entrada do airdrop), nível 2 = 100 tOMC (o airdrop completo) — uma carteira que esgota o airdrop da comunidade alcança o nível 2 sem comprar nada. Os níveis 3-5 cobrem 500 / 1000 / 5000 tOMC e são precificados para aceleradores de data center e implantações em escala de cluster.",
    "fr": "Palier 1 = 20 tOMC (une entrée d'airdrop), palier 2 = 100 tOMC (airdrop complet) — un portefeuille qui épuise l'airdrop communautaire atteint le palier 2 sans rien acheter. Les paliers 3 à 5 couvrent 500 / 1000 / 5000 tOMC et sont tarifés pour des accélérateurs de centre de données et des déploiements à l'échelle du cluster.",
}

H_STAKE_SUB = {
    "en": "A tier is a hardware class. Each tier has its own fixed OMC minimum, published as a ladder and used identically on testnet and mainnet — you cannot reach a higher tier with less stake.",
    "zh": "档位即硬件等级。每一档有各自固定的 OMC 门槛，以阶梯形式公布，测试网与主网完全一致——质押不足就无法进入更高档位。",
    "ja": "階層とはハードウェアのクラスです。各階層には固有の固定 OMC 最低額があり、ラダーとして公開され、テストネットとメインネットで同一に運用されます — ステークが不足すれば上位階層には入れません。",
    "es": "Un nivel es una clase de hardware. Cada nivel tiene su propio mínimo fijo en OMC, publicado como una escala y aplicado de forma idéntica en testnet y mainnet: no puedes alcanzar un nivel superior con menos stake.",
    "ko": "등급은 하드웨어 등급입니다. 각 등급에는 고유한 고정 OMC 최소 금액이 있으며, 사다리로 공개되어 테스트넷과 메인넷에서 동일하게 적용됩니다 — 스테이킹이 부족하면 상위 등급에 도달할 수 없습니다.",
    "pt": "Um nível é uma classe de hardware. Cada nível tem seu próprio mínimo fixo em OMC, publicado como uma escada e aplicado de forma idêntica na testnet e na mainnet — você não alcança um nível superior com menos stake.",
    "fr": "Un palier est une classe de matériel. Chaque palier a son propre minimum fixe en OMC, publié sous forme d'échelle et appliqué à l'identique sur la testnet et le mainnet — vous ne pouvez pas atteindre un palier supérieur avec moins de stake.",
}


def js_escape(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def set_key(src, key, value, lang):
    pat = re.compile(r'(\s*"%s":\s*)".*?"(,?\s*\n)' % re.escape(key), re.S)
    if not pat.search(src):
        print("[%s] MISSING %s" % (lang, key))
        sys.exit(1)
    return pat.sub(lambda m: m.group(1) + '"%s"' % js_escape(value) + m.group(2), src, count=1)


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for lang in LANGS:
        path = os.path.join(base, "assets", "js", "lang", "%s.js" % lang)
        with io.open(path, "r", encoding="utf-8") as fh:
            src = fh.read()
        src = set_key(src, "stk.tier_scope", TIER_SCOPE[lang], lang)
        src = set_key(src, "node.stake_note", STAKE_NOTE[lang], lang)
        src = set_key(src, "stk.tier_note", TIER_NOTE[lang], lang)
        src = set_key(src, "stk.h_stake_sub", H_STAKE_SUB[lang], lang)
        with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(src)
        print("[%s] ok" % lang)
    print("done")


if __name__ == "__main__":
    main()
