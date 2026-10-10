# -*- coding: utf-8 -*-
"""补上阶梯表的"硬件"列，并消除「3090/4090 属最高档」与「最高档遥不可及」的矛盾。

新增键：
  stk.th_hw  —— 阶梯表列头「Hardware」
  stk.hw1..hw5 —— 五档各自的硬件描述（与白皮书 §7.5 的硬件分类口径一致）

修订键：
  node.sub   —— 原说 "RTX 3090 / 4090 recommended for full-tier tasks"，
                "full-tier" 会让人以为消费级卡能进最高档；改为说明它们落在
                消费级档、足以跑通测试网。
  faq2.a     —— 原说 3090/4090 "land in the top hardware tiers"，与白皮书
                §7.5 把消费级卡归为最低倍率档直接冲突；改为准确表述。

用法：python tools/add-tier-hardware-col.py   （在 website/ 目录下运行）
"""
import io
import os
import re
import sys

LANGS = ["en", "zh", "ja", "es", "ko", "pt", "fr"]

TH_HW = {
    "en": "Hardware",
    "zh": "硬件",
    "ja": "ハードウェア",
    "es": "Hardware",
    "ko": "하드웨어",
    "pt": "Hardware",
    "fr": "Matériel",
}

HW = {
    "en": [
        "Consumer GPU, up to 24 GB VRAM (RTX 3090 / 4090 class)",
        "Workstation / professional GPU (RTX A6000, L40S class)",
        "Data-center GPU, 80 GB class (A100 / H100 single card)",
        "Multi-GPU data-center node (2–8 accelerators)",
        "Cluster-scale deployment (multi-node)",
    ],
    "zh": [
        "消费级显卡，24 GB 显存以内（RTX 3090 / 4090 级别）",
        "工作站 / 专业显卡（RTX A6000、L40S 级别）",
        "数据中心显卡，80 GB 级（A100 / H100 单卡）",
        "多卡数据中心节点（2–8 张加速卡）",
        "集群级部署（多节点）",
    ],
    "ja": [
        "コンシューマ GPU、VRAM 24 GB 以下（RTX 3090 / 4090 クラス）",
        "ワークステーション / プロフェッショナル GPU（RTX A6000、L40S クラス）",
        "データセンター GPU、80 GB クラス（A100 / H100 単体）",
        "マルチ GPU データセンター・ノード（アクセラレータ 2〜8 基）",
        "クラスタ規模のデプロイ（マルチノード）",
    ],
    "es": [
        "GPU de consumo, hasta 24 GB de VRAM (clase RTX 3090 / 4090)",
        "GPU de estación de trabajo / profesional (clase RTX A6000, L40S)",
        "GPU de centro de datos, clase 80 GB (A100 / H100 individual)",
        "Nodo de centro de datos multi-GPU (2–8 aceleradores)",
        "Despliegue a escala de clúster (multinodo)",
    ],
    "ko": [
        "소비자용 GPU, VRAM 24 GB 이하 (RTX 3090 / 4090 급)",
        "워크스테이션 / 전문가용 GPU (RTX A6000, L40S 급)",
        "데이터센터 GPU, 80 GB 급 (A100 / H100 단일 카드)",
        "멀티 GPU 데이터센터 노드 (가속기 2~8개)",
        "클러스터 규모 배포 (멀티 노드)",
    ],
    "pt": [
        "GPU de consumo, até 24 GB de VRAM (classe RTX 3090 / 4090)",
        "GPU de estação de trabalho / profissional (classe RTX A6000, L40S)",
        "GPU de data center, classe 80 GB (A100 / H100 avulsa)",
        "Nó de data center multi-GPU (2–8 aceleradores)",
        "Implantação em escala de cluster (multinó)",
    ],
    "fr": [
        "GPU grand public, jusqu'à 24 Go de VRAM (classe RTX 3090 / 4090)",
        "GPU station de travail / professionnel (classe RTX A6000, L40S)",
        "GPU de centre de données, classe 80 Go (A100 / H100 seule)",
        "Nœud de centre de données multi-GPU (2 à 8 accélérateurs)",
        "Déploiement à l'échelle du cluster (multi-nœuds)",
    ],
}

NODE_SUB = {
    "en": "Consumer GPUs are enough for the testnet — an RTX 3090 / 4090 lands in tier 1 (under 24 GB VRAM), which is all the faucet needs to cover.",
    "zh": "消费级显卡足以跑测试网——RTX 3090 / 4090 属于第 1 档（24 GB 显存以内），水龙头代币即可覆盖。",
    "ja": "テストネットならコンシューマ GPU で十分です — RTX 3090 / 4090 は階層 1（VRAM 24 GB 以下）に該当し、フォーセットで賄えます。",
    "es": "Una GPU de consumo basta para la testnet: una RTX 3090 / 4090 entra en el nivel 1 (menos de 24 GB de VRAM), que el faucet cubre de sobra.",
    "ko": "테스트넷에는 소비자용 GPU로 충분합니다 — RTX 3090 / 4090은 1등급(VRAM 24 GB 이하)에 해당하며 파우셋으로 충분히 감당됩니다.",
    "pt": "Uma GPU de consumo basta para a testnet — uma RTX 3090 / 4090 fica no nível 1 (menos de 24 GB de VRAM), que o faucet cobre com folga.",
    "fr": "Un GPU grand public suffit pour la testnet — une RTX 3090 / 4090 relève du palier 1 (moins de 24 Go de VRAM), ce que le faucet couvre largement.",
}

FAQ2_A = {
    "en": "Any CUDA or ROCm GPU works on the testnet. Score weighting favors TFLOPS and VRAM, so an RTX 3090 / 4090 lands in tier 1 on the ladder — it clears the lowest minimum, not a higher one. Higher tiers are priced for workstation and data-center accelerators; NVLink-connected rigs get priority for multi-GPU jobs.",
    "zh": "测试网上任何 CUDA 或 ROCm 显卡都能跑。评分权重偏向算力与显存，因此 RTX 3090 / 4090 落在阶梯的第 1 档——它满足的是最低门槛，而非更高档位。更高档位的定价对应工作站与数据中心加速卡；NVLink 互联的机器在多卡任务中优先。",
    "ja": "テストネットでは CUDA / ROCm 対応 GPU ならどれでも動作します。スコアは TFLOPS と VRAM を重視するため、RTX 3090 / 4090 はラダーの階層 1 に該当します — 満たすのは最低額であり、上位階層ではありません。上位階層はワークステーション／データセンター向けアクセラレータを想定した価格設定です。NVLink 接続のマシンはマルチ GPU タスクで優先されます。",
    "es": "Cualquier GPU CUDA o ROCm funciona en la testnet. La puntuación prioriza TFLOPS y VRAM, así que una RTX 3090 / 4090 cae en el nivel 1 de la escala: cumple el mínimo más bajo, no uno superior. Los niveles superiores están tarifados para aceleradores de estación de trabajo y de centro de datos; los equipos con NVLink tienen prioridad en tareas multi-GPU.",
    "ko": "테스트넷에서는 CUDA 또는 ROCm GPU면 모두 동작합니다. 점수는 TFLOPS와 VRAM에 가중치를 두므로 RTX 3090 / 4090은 사다리의 1등급에 해당합니다 — 충족하는 것은 최저 요건이며 상위 등급이 아닙니다. 상위 등급은 워크스테이션 및 데이터센터 가속기를 기준으로 책정됩니다. NVLink로 연결된 장비는 멀티 GPU 작업에서 우선권을 받습니다.",
    "pt": "Qualquer GPU CUDA ou ROCm funciona na testnet. A pontuação prioriza TFLOPS e VRAM, então uma RTX 3090 / 4090 fica no nível 1 da escada — ela cumpre o mínimo mais baixo, não um nível superior. Os níveis superiores são precificados para aceleradores de estação de trabalho e de data center; máquinas com NVLink têm prioridade em tarefas multi-GPU.",
    "fr": "Tout GPU CUDA ou ROCm fonctionne sur la testnet. La notation privilégie les TFLOPS et la VRAM, donc une RTX 3090 / 4090 relève du palier 1 de l'échelle — elle satisfait le minimum le plus bas, pas un palier supérieur. Les paliers supérieurs sont tarifés pour des accélérateurs de station de travail et de centre de données ; les machines reliées en NVLink sont prioritaires pour les tâches multi-GPU.",
}


def js_escape(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def set_key(src, key, value, anchor_key, lang, required=True):
    """replace key in place if present; else insert right after anchor_key."""
    pat = re.compile(r'(\s*"%s":\s*)".*?"(,?\s*\n)' % re.escape(key), re.S)
    if pat.search(src):
        return pat.sub(lambda m: m.group(1) + '"%s"' % js_escape(value) + m.group(2), src, count=1)
    if not required:
        return src
    pat_anchor = re.compile(r'(\s*"%s":\s*".*?"(?:,\s*\n))' % re.escape(anchor_key), re.S)
    m = pat_anchor.search(src)
    if not m:
        print("[%s] MISSING anchor %s for key %s" % (lang, anchor_key, key))
        sys.exit(1)
    entry = '  "%s": "%s",\n' % (key, js_escape(value))
    return src[: m.end(1)] + entry + src[m.end(1):]


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for lang in LANGS:
        path = os.path.join(base, "assets", "js", "lang", "%s.js" % lang)
        with io.open(path, "r", encoding="utf-8") as fh:
            src = fh.read()

        # column header, anchored on the existing tier/min headers
        src = set_key(src, "stk.th_hw", TH_HW[lang], "stk.th_tier", lang)

        # five hardware rows, chained off the column header
        anchor = "stk.th_hw"
        for i, desc in enumerate(HW[lang], start=1):
            src = set_key(src, "stk.hw%d" % i, desc, anchor, lang)
            anchor = "stk.hw%d" % i

        # fix the tier-ambiguity copy
        src = set_key(src, "node.sub", NODE_SUB[lang], "node.sub", lang)
        src = set_key(src, "faq2.a", FAQ2_A[lang], "faq2.a", lang)

        with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(src)
        print("[%s] ok" % lang)
    print("done")


if __name__ == "__main__":
    main()
