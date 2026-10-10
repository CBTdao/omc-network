# -*- coding: utf-8 -*-
"""把主网/TGE 提前到 2026 年底，使「TGE = 主网上线 = 空投领取 = 质押开启」同日。

背景：用户决策「空投领取与主网质押同时开启」，而质押所需的 OMC 主要来自
空投。若主网留在 2027 Q2–Q3，空投参与期 12-31 结束后将出现 6–9 个月空档，
参与者流失、且「同时开启」的说法不成立。

新时间线（与空投参与期 2026-11-01 → 2026-12-31 衔接）：
  Phase 1  2026 Q4             收尾（测试网 + 空投）
  Phase 2  2026 Q4 – 2027 Q1   主网 / TGE / 领取 / 质押 同时开启
  Phase 3  2027 Q2 起           TEE、ZK、DAO

用法：python tools/retime-mainnet-2026.py   （在 website/ 目录下运行）
"""
import io
import os
import re
import sys

LANGS = ["en", "zh", "ja", "es", "ko", "pt", "fr"]

# (键, {语言: 新值})
KEYS = {
    "ph1.tag": {
        "en": "Phase 1 · 2026 Q4 · In progress",
        "zh": "第 1 阶段 · 2026 Q4 · 进行中",
        "ja": "フェーズ 1 · 2026 Q4 · 進行中",
        "es": "Fase 1 · 2026 Q4 · En curso",
        "ko": "1단계 · 2026 Q4 · 진행 중",
        "pt": "Fase 1 · 2026 Q4 · Em andamento",
        "fr": "Phase 1 · 2026 T4 · En cours",
    },
    "ph2.tag": {
        "en": "Phase 2 · 2026 Q4 – 2027 Q1 · Planned",
        "zh": "第 2 阶段 · 2026 Q4 – 2027 Q1 · 计划中",
        "ja": "フェーズ 2 · 2026 Q4 – 2027 Q1 · 計画",
        "es": "Fase 2 · 2026 Q4 – 2027 Q1 · Planificada",
        "ko": "2단계 · 2026 Q4 – 2027 Q1 · 계획",
        "pt": "Fase 2 · 2026 Q4 – 2027 Q1 · Planejada",
        "fr": "Phase 2 · 2026 T4 – 2027 T1 · Prévue",
    },
    "ph3.tag": {
        "en": "Phase 3 · 2027 Q2 –",
        "zh": "第 3 阶段 · 2027 Q2 起",
        "ja": "フェーズ 3 · 2027 Q2 以降",
        "es": "Fase 3 · 2027 Q2 –",
        "ko": "3단계 · 2027 Q2 –",
        "pt": "Fase 3 · 2027 Q2 –",
        "fr": "Phase 3 · 2027 T2 –",
    },
    "tn.status_mainnet": {
        "en": "Mainnet: 2026 Q4 – 2027 Q1",
        "zh": "主网：2026 Q4 – 2027 Q1",
        "ja": "メインネット：2026 Q4 – 2027 Q1",
        "es": "Mainnet: 2026 Q4 – 2027 Q1",
        "ko": "메인넷: 2026 Q4 – 2027 Q1",
        "pt": "Mainnet: 2026 Q4 – 2027 Q1",
        "fr": "Mainnet : 2026 T4 – 2027 T1",
    },
    "calc.omc.badge": {
        "en": "TBA · mainnet 2026 Q4 – 2027 Q1",
        "zh": "待定 · 主网 2026 Q4 – 2027 Q1",
        "ja": "未定 · メインネット 2026 Q4 – 2027 Q1",
        "es": "Por definir · mainnet 2026 Q4 – 2027 Q1",
        "ko": "미정 · 메인넷 2026 Q4 – 2027 Q1",
        "pt": "A definir · mainnet 2026 Q4 – 2027 Q1",
        "fr": "À définir · mainnet 2026 T4 – 2027 T1",
    },
    "calc.omcdiff.note": {
        "en": "Design commitments reflect OMC whitepaper v3.0 and are stated as intent, not as shipped functionality. OMC is in testnet; mainnet — and with it the airdrop claim window and staking — opens in 2026 Q4 – 2027 Q1. Nothing here is a price commitment, a service-level commitment or an offer to sell compute.",
        "zh": "设计承诺反映 OMC 白皮书 v3.0，属意向陈述而非已上线功能。OMC 目前处于测试网；主网——连同空投领取窗口与质押——将在 2026 Q4 – 2027 Q1 开启。此处不构成价格承诺、服务级别承诺或算力出售要约。",
        "ja": "設計上のコミットメントは OMC ホワイトペーパー v3.0 を反映したもので、意向の表明であり出荷済み機能ではありません。OMC は現在テストネットです。メインネット — それに伴うエアドロップ受領ウィンドウとステーキング — は 2026 Q4 – 2027 Q1 に開始します。ここには価格約束・SLA・計算資源の販売申し出は含まれません。",
        "es": "Los compromisos de diseño reflejan el whitepaper de OMC v3.0 y se declaran como intención, no como funcionalidad entregada. OMC está en testnet; la mainnet —y con ella la ventana de reclamo del airdrop y el staking— se abre en 2026 Q4 – 2027 Q1. Nada de esto es un compromiso de precio, un compromiso de nivel de servicio ni una oferta de venta de cómputo.",
        "ko": "설계 약속은 OMC 백서 v3.0을 반영한 의도 표명이며 출시된 기능이 아닙니다. OMC는 현재 테스트넷입니다. 메인넷 — 그에 따른 에어드롭 수령 창구와 스테이킹 — 은 2026 Q4 – 2027 Q1에 열립니다. 여기에는 가격 약속, 서비스 수준 약속, 컴퓨팅 판매 제안이 포함되지 않습니다.",
        "pt": "Os compromissos de design refletem o whitepaper da OMC v3.0 e são declarados como intenção, não como funcionalidade entregue. A OMC está em testnet; a mainnet — e com ela a janela de resgate do airdrop e o staking — abre em 2026 Q4 – 2027 Q1. Nada aqui é um compromisso de preço, um compromisso de nível de serviço ou uma oferta de venda de computação.",
        "fr": "Les engagements de conception reflètent le whitepaper OMC v3.0 et sont énoncés comme une intention, non comme une fonctionnalité livrée. OMC est en testnet ; le mainnet — et avec lui la fenêtre de réclamation de l'airdrop et le staking — ouvre en 2026 T4 – 2027 T1. Rien ici ne constitue un engagement de prix, un engagement de niveau de service ou une offre de vente de calcul.",
    },
    "nw5.t": {
        "en": "Roadmap updated: mainnet moves to 2026 Q4 – 2027 Q1",
        "zh": "路线图更新：主网调整为 2026 Q4 – 2027 Q1",
        "ja": "ロードマップ更新：メインネットは 2026 Q4 – 2027 Q1 へ",
        "es": "Hoja de ruta actualizada: la mainnet pasa a 2026 Q4 – 2027 Q1",
        "ko": "로드맵 업데이트: 메인넷이 2026 Q4 – 2027 Q1로 변경",
        "pt": "Roteiro atualizado: a mainnet passa para 2026 Q4 – 2027 Q1",
        "fr": "Feuille de route mise à jour : le mainnet passe à 2026 T4 – 2027 T1",
    },
    "nw5.d": {
        "en": "Phase 1 covers L2 contract deployment, the open-source node client, the public testnet and the 2% community airdrop. Mainnet — together with the airdrop claim window and staking — opens in 2026 Q4 – 2027 Q1, so the OMC a wallet accumulates during the campaign becomes claimable and stakeable at the same moment. The ZK-ML framework and full DAO governance follow from 2027 Q2.",
        "zh": "第 1 阶段涵盖 L2 合约部署、开源节点客户端、公开测试网与 2% 社区空投。主网——连同空投领取窗口与质押——将在 2026 Q4 – 2027 Q1 开启，因此参与期累积的 OMC 在同一时点即可领取并质押。ZK-ML 框架与完整 DAO 治理自 2027 Q2 起推进。",
        "ja": "フェーズ 1 は L2 コントラクトのデプロイ、オープンソースのノードクライアント、公開テストネット、2% のコミュニティ・エアドロップを対象とします。メインネット — エアドロップ受領ウィンドウとステーキングを含めて — は 2026 Q4 – 2027 Q1 に開始するため、キャンペーン中に貯まった OMC は同じ時点で受領・ステーク可能になります。ZK-ML フレームワークと完全な DAO ガバナンスは 2027 Q2 以降です。",
        "es": "La Fase 1 abarca el despliegue de contratos L2, el cliente de nodo de código abierto, la testnet pública y el airdrop comunitario del 2%. La mainnet — junto con la ventana de reclamo del airdrop y el staking — se abre en 2026 Q4 – 2027 Q1, de modo que el OMC acumulado durante la campaña puede reclamarse y stakearse en el mismo momento. El framework ZK-ML y la gobernanza DAO completa llegan a partir de 2027 Q2.",
        "ko": "1단계는 L2 컨트랙트 배포, 오픈소스 노드 클라이언트, 공개 테스트넷, 2% 커뮤니티 에어드롭을 포함합니다. 메인넷 — 에어드롭 수령 창구와 스테이킹을 포함하여 — 은 2026 Q4 – 2027 Q1에 열리므로, 캠페인 기간에 쌓은 OMC를 같은 시점에 수령하고 스테이킹할 수 있습니다. ZK-ML 프레임워크와 완전한 DAO 거버넌스는 2027 Q2부터 이어집니다.",
        "pt": "A Fase 1 abrange a implantação de contratos L2, o cliente de nó de código aberto, a testnet pública e o airdrop comunitário de 2%. A mainnet — junto com a janela de resgate do airdrop e o staking — abre em 2026 Q4 – 2027 Q1, de modo que o OMC acumulado durante a campanha pode ser resgatado e stakado no mesmo momento. O framework ZK-ML e a governança DAO completa vêm a partir de 2027 Q2.",
        "fr": "La phase 1 couvre le déploiement des contrats L2, le client de nœud open source, le testnet public et l'airdrop communautaire de 2 %. Le mainnet — avec la fenêtre de réclamation de l'airdrop et le staking — ouvre en 2026 T4 – 2027 T1, de sorte que les OMC accumulés pendant la campagne deviennent réclamables et stakables au même moment. Le framework ZK-ML et la gouvernance DAO complète suivent à partir de 2027 T2.",
    },
}

# 静态 HTML 默认值（属性内联，非 i18n 运行时）
HTML_SUBS = [
    ("calculator.html", "TBA · mainnet Q2–Q3 2027", "TBA · mainnet 2026 Q4 – 2027 Q1"),
    ("calculator.html",
     "OMC is in testnet; mainnet is targeted for Q2–Q3 2027. Nothing here is a price commitment",
     "OMC is in testnet; mainnet opens in 2026 Q4 – 2027 Q1. Nothing here is a price commitment"),
    ("calculator.html",
     "The mainnet is targeted for Q2–Q3 2027, and until rates are set",
     "The mainnet opens in 2026 Q4 – 2027 Q1, and until rates are set"),
    ("calculator.html",
     "Mainnet — when the network can accept paying jobs and providers can earn — is targeted for Q2–Q3 2027.",
     "Mainnet — when the network can accept paying jobs and providers can earn — opens in 2026 Q4 – 2027 Q1."),
    ("index.html", "Phase 1 · Q4 2026 – Q1 2027 · In progress", "Phase 1 · 2026 Q4 · In progress"),
    ("index.html", "Phase 2 · Q2–Q3 2027 · Planned", "Phase 2 · 2026 Q4 – 2027 Q1 · Planned"),
    ("index.html", "Phase 3 · 2027 Q4 –", "Phase 3 · 2027 Q2 –"),
    ("testnet.html", "Mainnet: Q2–Q3 2027", "Mainnet: 2026 Q4 – 2027 Q1"),
]


def js_escape(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    for lang in LANGS:
        path = os.path.join(base, "assets", "js", "lang", "%s.js" % lang)
        with io.open(path, "r", encoding="utf-8") as fh:
            src = fh.read()
        for key, table in KEYS.items():
            pat = re.compile(r'(\s*"%s":\s*)".*?"(,?\s*\n)' % re.escape(key), re.S)
            if not pat.search(src):
                print("[%s] MISSING %s" % (lang, key))
                sys.exit(1)
            src = pat.sub(lambda m: m.group(1) + '"%s"' % js_escape(table[lang]) + m.group(2), src, count=1)
        with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(src)
        print("[lang:%s] %d keys" % (lang, len(KEYS)))

    for fname, old, new in HTML_SUBS:
        path = os.path.join(base, fname)
        with io.open(path, "r", encoding="utf-8") as fh:
            src = fh.read()
        if old not in src:
            print("[%s] MISSING literal: %r" % (fname, old[:60]))
            sys.exit(1)
        src = src.replace(old, new)
        with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(src)
        print("[%s] sub ok" % fname)
    print("done")


if __name__ == "__main__":
    main()
