# -*- coding: utf-8 -*-
"""把空投文案里的「TGE (mainnet launch)」改为明确时点，并写明与质押同时开启。

背景：决策「空投领取与主网质押同时开启」——TGE = 主网上线 = 领取窗口开启
= 质押开启，四者同一时点（2026 Q4 – 2027 Q1）。质押所需的 OMC 主要来自
空投，因此两者必须同时，否则参与者拿不到质押所需的币。

修订键：
  claim.end_note            参与结束说明
  rules.r6                  规则第 6 条
  claim.accum_note          累计额说明
  claim.btn_claim_all_locked 按钮文案
  js.hint_ended             结束提示
  nw2.d                     新闻条目正文

用法：python tools/unify-tge-staking-timing.py   （在 website/ 目录下运行）
"""
import io
import os
import re
import sys

LANGS = ["en", "zh", "ja", "es", "ko", "pt", "fr"]

KEYS = {
    "claim.end_note": {
        "en": "⏳ Participation closes Dec 31, 2026 (UTC+8). The claim window opens at TGE, when mainnet and staking also open — the accumulated OMC becomes withdrawable in a single claim on this page, and can be staked the same day.",
        "zh": "⏳ 参与于 2026-12-31（UTC+8）截止。领取窗口在 TGE 开启，届时主网与质押同步上线——累积的 OMC 可在本页一次性领取，并可在当天质押。",
        "ja": "⏳ 参加受付は 2026-12-31（UTC+8）まで。受領ウィンドウは TGE に開き、同時にメインネットとステーキングも開始します — 貯まった OMC はこのページで一括受領でき、当日中にステークできます。",
        "es": "⏳ La participación cierra el 31 de diciembre de 2026 (UTC+8). La ventana de reclamo abre en el TGE, cuando también abren la mainnet y el staking: el OMC acumulado se puede reclamar en un solo paso en esta página y stakear ese mismo día.",
        "ko": "⏳ 참여는 2026-12-31(UTC+8)에 마감됩니다. 수령 창구는 TGE에 열리며, 이때 메인넷과 스테이킹도 함께 시작됩니다 — 누적된 OMC는 이 페이지에서 한 번에 수령하고 당일 스테이킹할 수 있습니다.",
        "pt": "⏳ A participação encerra em 31 de dezembro de 2026 (UTC+8). A janela de resgate abre no TGE, quando a mainnet e o staking também abrem — o OMC acumulado pode ser resgatado em um único passo nesta página e stakado no mesmo dia.",
        "fr": "⏳ La participation se clôt le 31 décembre 2026 (UTC+8). La fenêtre de réclamation ouvre au TGE, en même temps que le mainnet et le staking — les OMC accumulés sont réclamables en une seule fois sur cette page et stakables le jour même.",
    },
    "rules.r6": {
        "en": "· The campaign only <b>displays your accumulated amount</b>; the <b>claim window opens at TGE</b>, together with mainnet and staking — the whole amount is withdrawable in <b>one claim on this page</b> and can be staked immediately.",
        "zh": "· 活动期间<b>仅展示累计额度</b>；<b>领取窗口在 TGE 开启</b>，与主网、质押同步——全部额度可在<b>本页一次性领取</b>，并可立即质押。",
        "ja": "· キャンペーン中は<b>累計額の表示のみ</b>を行います。<b>受領ウィンドウは TGE に開き</b>、メインネットとステーキングと同時です — 全額を<b>このページで一括受領</b>でき、そのままステークできます。",
        "es": "· Durante la campaña solo se <b>muestra tu importe acumulado</b>; la <b>ventana de reclamo abre en el TGE</b>, junto con la mainnet y el staking — el importe completo se retira en <b>un solo reclamo en esta página</b> y puede stakearse de inmediato.",
        "ko": "· 캠페인 기간에는 <b>누적 금액만 표시</b>됩니다. <b>수령 창구는 TGE에 열리며</b> 메인넷·스테이킹과 동시입니다 — 전액을 <b>이 페이지에서 한 번에 수령</b>하고 즉시 스테이킹할 수 있습니다.",
        "pt": "· Durante a campanha, apenas <b>exibimos o valor acumulado</b>; a <b>janela de resgate abre no TGE</b>, junto com a mainnet e o staking — o valor total é sacado em <b>um único resgate nesta página</b> e pode ser stakado imediatamente.",
        "fr": "· Pendant la campagne, seul le <b>montant accumulé est affiché</b> ; la <b>fenêtre de réclamation ouvre au TGE</b>, en même temps que le mainnet et le staking — le montant total est retirable en <b>une seule réclamation sur cette page</b> et stakable immédiatement.",
    },
    "claim.accum_note": {
        "en": "Display only during the campaign — the claim window opens at TGE, together with staking.",
        "zh": "活动期间仅作展示——领取窗口在 TGE 开启，与质押同步。",
        "ja": "キャンペーン中の表示のみ — 受領ウィンドウは TGE に、ステーキングと同時に開きます。",
        "es": "Solo visualización durante la campaña: la ventana de reclamo abre en el TGE, junto con el staking.",
        "ko": "캠페인 기간에는 표시 전용 — 수령 창구는 TGE에 스테이킹과 동시에 열립니다.",
        "pt": "Apenas exibição durante a campanha — a janela de resgate abre no TGE, junto com o staking.",
        "fr": "Affichage uniquement pendant la campagne — la fenêtre de réclamation ouvre au TGE, en même temps que le staking.",
    },
    "claim.btn_claim_all_locked": {
        "en": "Claim opens at TGE, with staking",
        "zh": "领取随 TGE 与质押同步开启",
        "ja": "受領は TGE にステーキングと同時に開始",
        "es": "El reclamo abre en el TGE, con el staking",
        "ko": "수령은 TGE에 스테이킹과 함께 열립니다",
        "pt": "O resgate abre no TGE, com o staking",
        "fr": "La réclamation ouvre au TGE, avec le staking",
    },
    "js.hint_ended": {
        "en": "Participation has closed. The claim window opens at TGE, together with mainnet and staking.",
        "zh": "参与已结束。领取窗口将在 TGE 开启，与主网、质押同步。",
        "ja": "参加受付は終了しました。受領ウィンドウは TGE に、メインネットとステーキングと同時に開きます。",
        "es": "La participación ha cerrado. La ventana de reclamo abre en el TGE, junto con la mainnet y el staking.",
        "ko": "참여가 마감되었습니다. 수령 창구는 TGE에 메인넷·스테이킹과 함께 열립니다.",
        "pt": "A participação encerrou. A janela de resgate abre no TGE, junto com a mainnet e o staking.",
        "fr": "La participation est close. La fenêtre de réclamation ouvre au TGE, avec le mainnet et le staking.",
    },
    "nw2.d": {
        "en": "20,000,000 OMC — 2% of the fixed supply — is reserved for the community: 1,000,000 entries × 20 OMC. Up to 5 entries per wallet and 1 per day (resets 00:00 UTC+8). A wallet that maxes out the airdrop holds 100 OMC, exactly the tier-2 staking minimum. The claim window opens at TGE, at the same moment as mainnet and staking — so the OMC earned during the campaign can be staked the day it is claimed.",
        "zh": "2%（20,000,000 OMC）的固定供应预留给社区：1,000,000 次 × 每次 20 OMC。每个钱包最多 5 次、每天 1 次（UTC+8 零点重置）。领满空投的钱包持有 100 OMC，恰好等于质押第 2 档门槛。领取窗口在 TGE 开启，与主网、质押同一时点——活动期间赚到的 OMC，领取当天即可质押。",
        "ja": "固定供应の 2%（20,000,000 OMC）をコミュニティに確保：1,000,000 回 × 20 OMC。ウォレットあたり最大 5 回、1 日 1 回（UTC+8 0 時リセット）。満額受け取ったウォレットは 100 OMC を保有し、これはステーキング階層 2 の最低額と一致します。受領ウィンドウは TGE に、メインネットとステーキングと同じ時点で開きます — キャンペーン中に得た OMC は受領当日にステークできます。",
        "es": "20,000,000 OMC — el 2% del suministro fijo — está reservado para la comunidad: 1,000,000 entradas × 20 OMC. Hasta 5 entradas por cartera y 1 al día (se reinicia a las 00:00 UTC+8). Una cartera que agota el airdrop tiene 100 OMC, exactamente el mínimo del nivel 2 de staking. La ventana de reclamo abre en el TGE, en el mismo momento que la mainnet y el staking: los OMC ganados durante la campaña pueden stakearse el día que se reclaman.",
        "ko": "고정 공급의 2%(20,000,000 OMC)가 커뮤니티에 배정됩니다: 1,000,000회 × 20 OMC. 지갑당 최대 5회, 하루 1회(UTC+8 00:00 초기화). 에어드롭을 최대로 받은 지갑은 100 OMC를 보유하며, 이는 스테이킹 2등급 최소 금액과 정확히 일치합니다. 수령 창구는 TGE에 메인넷·스테이킹과 동시에 열립니다 — 캠페인 기간에 얻은 OMC는 수령 당일 스테이킹할 수 있습니다.",
        "pt": "20,000,000 OMC — 2% do suprimento fixo — está reservado para a comunidade: 1.000.000 entradas × 20 OMC. Até 5 entradas por carteira e 1 por dia (reinicia às 00:00 UTC+8). Uma carteira que esgota o airdrop tem 100 OMC, exatamente o mínimo do nível 2 de staking. A janela de resgate abre no TGE, no mesmo momento que a mainnet e o staking — os OMC ganhos durante a campanha podem ser stakados no dia em que são resgatados.",
        "fr": "20 000 000 d'OMC — 2 % de l'offre fixe — sont réservés à la communauté : 1 000 000 d'entrées × 20 OMC. Jusqu'à 5 entrées par portefeuille et 1 par jour (réinitialisation à 00:00 UTC+8). Un portefeuille qui épuise l'airdrop détient 100 OMC, exactement le minimum du palier 2 de staking. La fenêtre de réclamation ouvre au TGE, au même moment que le mainnet et le staking — les OMC gagnés pendant la campagne sont stakables le jour de leur réclamation.",
    },
}


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
        print("[%s] %d keys" % (lang, len(KEYS)))
    print("done")


if __name__ == "__main__":
    main()
