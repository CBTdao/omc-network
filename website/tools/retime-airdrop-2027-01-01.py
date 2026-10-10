#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Airdrop retime to 2027-01-01 with claim-as-you-go (2026-10-10, user decision):

  - Participation opens 2027-01-01 (was 2026-11-01) — the same day as
    mainnet TGE and staking.
  - Participation runs to 2027-04-01.
  - Claim opens on day one too: participants claim as they go and can
    stake the same day (replaces "accumulate first, claim at the end").

Touch points per language:
  date-only:  ad.chip_start, js.hint_not_started, js.toast_not_started,
              tk.before, nw2.t
  new model:  claim.accum_note, claim.btn_claim_all_locked, claim.end_note,
              js.hint_ended, nw2.d (tail sentence)
"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANG = os.path.join(ROOT, "assets", "js", "lang")

# --- full-sentence replacements (new claim model) -------------------------
SENTENCES = {
    "en": [
        ("Display only during the campaign — the claim window opens at TGE, together with staking.",
         "Claim is open the whole campaign — claim as you go; staking opens the same day the campaign does (Jan 1, 2027)."),
        ("Claim opens at TGE, with staking",
         "Claim opens Jan 1, 2027"),
        ("⏳ Participation closes Jan 1, 2027 (UTC+8). The claim window opens at TGE, when mainnet and staking also open — the accumulated OMC becomes withdrawable in a single claim on this page, and can be staked the same day.",
         "⏳ Participation runs Jan 1 – Apr 1, 2027 (UTC+8). Claim and staking open on day one, together with mainnet — claim as you go and stake the same day."),
        ("Participation has closed. The claim window opens at TGE, together with mainnet and staking.",
         "Participation has closed. Accumulated OMC stays claimable on this page."),
        ("The claim window opens at TGE, at the same moment as mainnet and staking — so the OMC earned during the campaign can be staked the day it is claimed.",
         "The campaign opens on Jan 1, 2027 — the same day as mainnet and staking — and entries are claimable immediately, so OMC can be staked the day it is earned."),
    ],
    "zh": [
        ("活动期间仅作展示——领取窗口在 TGE 开启，与质押同步。",
         "整个活动期间均可领取——随做随领；质押与活动同日（2027年1月1日）开启。"),
        ("领取随 TGE 与质押同步开启",
         "领取于 2027年1月1日 开启"),
        ("⏳ 参与于 2027-01-01（UTC+8）截止。领取窗口在 TGE 开启，届时主网与质押同步上线——累积的 OMC 可在本页一次性领取，并可在当天质押。",
         "⏳ 参与期为 2027-01-01 → 2027-04-01（UTC+8）。领取与质押在首日（1 月 1 日）随主网一同开启——随做随领，当天即可质押。"),
        ("参与已结束。领取窗口将在 TGE 开启，与主网、质押同步。",
         "参与已结束。累积的 OMC 仍可在本页领取。"),
        ("领取窗口在 TGE 开启，与主网、质押同一时点——活动期间赚到的 OMC，领取当天即可质押。",
         "活动于 2027年1月1日 与主网、质押同日开启——参与后即可立即领取，赚到的 OMC 当天就能质押。"),
    ],
    "ja": [
        ("キャンペーン中の表示のみ — 受領ウィンドウは TGE に、ステーキングと同時に開きます。",
         "キャンペーン期間中はいつでも受領可能 — 随時受領でき、ステーキングはキャンペーン初日（2027年1月1日）に開始します。"),
        ("受領は TGE にステーキングと同時に開始",
         "受領は 2027年1月1日 に開始"),
        ("⏳ 参加受付は 2027-01-01（UTC+8）まで。受領ウィンドウは TGE に開き、同時にメインネットとステーキングも開始します — 貯まった OMC はこのページで一括受領でき、当日中にステークできます。",
         "⏳ 参加期間は 2027-01-01 → 2027-04-01（UTC+8）。受領とステーキングは初日（1月1日）にメインネットと同時に開始します — 随時受領でき、当日中にステークできます。"),
        ("参加受付は終了しました。受領ウィンドウは TGE に、メインネットとステーキングと同時に開きます。",
         "参加受付は終了しました。貯まった OMC はこのページで引き続き受領できます。"),
        ("受領ウィンドウは TGE に、メインネットとステーキングと同じ時点で開きます — キャンペーン中に得た OMC は受領当日にステークできます。",
         "キャンペーンは 2027年1月1日 にメインネット・ステーキングと同時に開始し、参加直後からすぐ受領できます — 得た OMC は当日ステークできます。"),
    ],
    "es": [
        ("Solo visualización durante la campaña: la ventana de reclamo abre en el TGE, junto con el staking.",
         "El reclamo está abierto toda la campaña — reclama a medida que participas; el staking abre el mismo día (1 de enero de 2027)."),
        ("El reclamo abre en el TGE, con el staking",
         "El reclamo abre el 1 de enero de 2027"),
        ("⏳ La participación cierra el 1 de enero de 2027 (UTC+8). La ventana de reclamo abre en el TGE, cuando también abren la mainnet y el staking: el OMC acumulado se puede reclamar en un solo paso en esta página y stakear ese mismo día.",
         "⏳ La participación va del 1 de enero al 1 de abril de 2027 (UTC+8). El reclamo y el staking abren el primer día, junto con la mainnet — reclama a medida que participas y stakea el mismo día."),
        ("La participación ha cerrado. La ventana de reclamo abre en el TGE, junto con la mainnet y el staking.",
         "La participación ha cerrado. El OMC acumulado sigue reclamable en esta página."),
        ("La ventana de reclamo abre en el TGE, en el mismo momento que la mainnet y el staking: los OMC ganados durante la campaña pueden stakearse el día que se reclaman.",
         "La campaña abre el 1 de enero de 2027, el mismo día que la mainnet y el staking, y cada entrada se puede reclamar de inmediato: los OMC se pueden stakear el día que se ganan."),
    ],
    "ko": [
        ("캠페인 기간에는 표시 전용 — 수령 창구는 TGE에 스테이킹과 동시에 열립니다.",
         "캠페인 기간 내내 수령 가능 — 참여하는 대로 수령할 수 있으며, 스테이킹은 캠페인 첫날(2027년 1월 1일)에 열립니다."),
        ("수령은 TGE에 스테이킹과 함께 열립니다",
         "수령은 2027년 1월 1일에 열립니다"),
        ("⏳ 참여는 2027-01-01(UTC+8)에 마감됩니다. 수령 창구는 TGE에 열리며, 이때 메인넷과 스테이킹도 함께 시작됩니다 — 누적된 OMC는 이 페이지에서 한 번에 수령하고 당일 스테이킹할 수 있습니다.",
         "⏳ 참여 기간은 2027-01-01 → 2027-04-01(UTC+8)입니다. 수령과 스테이킹은 첫날(1월 1일) 메인넷과 함께 열립니다 — 참여하는 대로 수령하고 당일 스테이킹할 수 있습니다."),
        ("참여가 마감되었습니다. 수령 창구는 TGE에 메인넷·스테이킹과 함께 열립니다.",
         "참여가 마감되었습니다. 누적된 OMC는 이 페이지에서 계속 수령할 수 있습니다."),
        ("수령 창구는 TGE에 메인넷·스테이킹과 동시에 열립니다 — 캠페인 기간에 얻은 OMC는 수령 당일 스테이킹할 수 있습니다.",
         "캠페인은 2027년 1월 1일에 메인넷·스테이킹과 같은 날 열리며, 참여 즉시 수령할 수 있습니다 — 얻은 OMC는 당일 스테이킹할 수 있습니다."),
    ],
    "pt": [
        ("Apenas exibição durante a campanha — a janela de resgate abre no TGE, junto com o staking.",
         "O resgate está aberto durante toda a campanha — resgate conforme participa; o staking abre no mesmo dia (1 de janeiro de 2027)."),
        ("O resgate abre no TGE, com o staking",
         "O resgate abre em 1 de janeiro de 2027"),
        ("⏳ A participação encerra em 1 de janeiro de 2027 (UTC+8). A janela de resgate abre no TGE, quando a mainnet e o staking também abrem — o OMC acumulado pode ser resgatado em um único passo nesta página e stakado no mesmo dia.",
         "⏳ A participação vai de 1 de janeiro a 1 de abril de 2027 (UTC+8). O resgate e o staking abrem no primeiro dia, junto com a mainnet — resgate conforme participa e stake no mesmo dia."),
        ("A participação encerrou. A janela de resgate abre no TGE, junto com a mainnet e o staking.",
         "A participação encerrou. O OMC acumulado continua resgatável nesta página."),
        ("A janela de resgate abre no TGE, no mesmo momento que a mainnet e o staking — os OMC ganhos durante a campanha podem ser stakados no dia em que são resgatados.",
         "A campanha abre em 1 de janeiro de 2027, no mesmo dia que a mainnet e o staking, e cada entrada pode ser resgatada imediatamente — os OMC podem ser stakados no dia em que são ganhos."),
    ],
    "fr": [
        ("Affichage uniquement pendant la campagne — la fenêtre de réclamation ouvre au TGE, en même temps que le staking.",
         "La réclamation est ouverte toute la campagne — réclamez au fur et à mesure ; le staking ouvre le premier jour (1er janvier 2027)."),
        ("La réclamation ouvre au TGE, avec le staking",
         "La réclamation ouvre le 1er janvier 2027"),
        ("⏳ La participation se clôt le 1er janvier 2027 (UTC+8). La fenêtre de réclamation ouvre au TGE, en même temps que le mainnet et le staking — les OMC accumulés sont réclamables en une seule fois sur cette page et stakables le jour même.",
         "⏳ La participation va du 1er janvier au 1er avril 2027 (UTC+8). La réclamation et le staking ouvrent le premier jour, avec le mainnet — réclamez au fur et à mesure et stakez le jour même."),
        ("La participation est close. La fenêtre de réclamation ouvre au TGE, avec le mainnet et le staking.",
         "La participation est close. Les OMC accumulés restent réclamables sur cette page."),
        ("La fenêtre de réclamation ouvre au TGE, au même moment que le mainnet et le staking — les OMC gagnés pendant la campagne sont stakables le jour de leur réclamation.",
         "La campagne ouvre le 1er janvier 2027, le même jour que le mainnet et le staking, et chaque entrée est immédiatement réclamable — les OMC sont stakables le jour où ils sont gagnés."),
    ],
}

# --- date-only substring replacements -------------------------------------
DATES = {
    "en": [("Nov 1, 2026", "Jan 1, 2027"), ("November 1, 2026", "January 1, 2027")],
    "zh": [("2026年11月1日", "2027年1月1日"), ("2026 年 11 月 1 日", "2027 年 1 月 1 日")],
    "ja": [("2026年11月1日", "2027年1月1日")],
    "es": [("1 nov 2026", "1 ene 2027"), ("1 de noviembre de 2026", "1 de enero de 2027")],
    "ko": [("2026년 11월 1일", "2027년 1월 1일")],
    "pt": [("1 de nov de 2026", "1 de jan de 2027"),
           ("1º de novembro de 2026", "1º de janeiro de 2027"),
           ("1 de novembro de 2026", "1 de janeiro de 2027")],
    "fr": [("1er nov. 2026", "1er janv. 2027"), ("1 nov. 2026", "1 janv. 2027"),
           ("1er novembre 2026", "1er janvier 2027")],
}


def main():
    total, missed = 0, 0
    for code in SENTENCES:
        path = os.path.join(LANG, code + ".js")
        with io.open(path, "r", encoding="utf-8") as fh:
            txt = fh.read()
        hits = 0
        for old, new in SENTENCES[code]:
            if old not in txt:
                print("  [%s] SENT MISS: %s" % (code, old[:60]))
                missed += 1
                continue
            txt = txt.replace(old, new)
            hits += 1
        for old, new in DATES[code]:
            n = txt.count(old)
            if n == 0:
                print("  [%s] DATE MISS: %s" % (code, old))
                missed += 1
                continue
            txt = txt.replace(old, new)
            hits += n
        with io.open(path, "w", encoding="utf-8") as fh:
            fh.write(txt)
        print("  [%s] %d replacements" % (code, hits))
        total += hits
    print("done: %d replacements, %d misses" % (total, missed))


if __name__ == "__main__":
    main()
