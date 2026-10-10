# -*- coding: utf-8 -*-
"""
Patch the airdrop claim-window wording across all 7 language files.

The white paper says the community airdrop (2%) is "100% at TGE", but the
site copy said "withdrawable after the airdrop ends (Dec 31, 2026)" -- which
contradicts it and breaks the airdrop -> staking hand-off. New rule:

  - participation window: 2026-11-01 .. 2026-12-31
  - claim window OPENS at TGE (mainnet), not on Dec 31
  - during the campaign the page only displays the accumulated amount
"""
import io, os, re, sys

LANG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "js", "lang")

# key -> { lang: new value }
PATCH = {
    "claim.accum_note": {
        "en": "Display only during the campaign — the claim window opens at TGE.",
        "zh": "活动期间仅作展示——领取窗口在主网 TGE 时开启。",
        "ja": "キャンペーン期間中は表示のみ——請求ウィンドウは TGE で開きます。",
        "es": "Solo visualización durante la campaña — la ventana de claim se abre en el TGE.",
        "ko": "캠페인 기간 중에는 표시 전용 — 청구 창은 TGE에 열립니다.",
        "pt": "Somente exibição durante a campanha — a janela de claim abre no TGE.",
        "fr": "Affichage uniquement pendant la campagne — la fenêtre de claim ouvre au TGE.",
    },
    "claim.btn_claim_all_locked": {
        "en": "Claim opens at TGE",
        "zh": "领取窗口将在 TGE 开启",
        "ja": "請求は TGE で解錠",
        "es": "El claim abre en el TGE",
        "ko": "TGE에 청구 개방",
        "pt": "O claim abre no TGE",
        "fr": "Claim ouvert au TGE",
    },
    "claim.end_note": {
        "en": "⏳ Participation closes Dec 31, 2026 (UTC+8). The claim window opens at TGE (mainnet launch), when the accumulated OMC becomes withdrawable in a single claim on this page.",
        "zh": "⏳ 参与期于 2026 年 12 月 31 日（UTC+8）结束。领取窗口在主网 TGE 时开启，届时可在本页面一次性领取全部累计 OMC。",
        "ja": "⏳ 参加受付は2026年12月31日（UTC+8）まで。請求ウィンドウは TGE（メインネット公開）で開き、本ページで累積 OMC を一括請求できます。",
        "es": "⏳ La participación cierra el 31 de diciembre de 2026 (UTC+8). La ventana de claim abre en el TGE (lanzamiento de la mainnet), cuando el OMC acumulado podrá retirarse en un solo claim en esta página.",
        "ko": "⏳ 참여는 2026년 12월 31일(UTC+8)에 마감됩니다. 청구 창은 TGE(메인넷 출시)에 열리며, 이때 본 페이지에서 누적 OMC를 한 번에 청구할 수 있습니다.",
        "pt": "⏳ A participação encerra em 31 de dezembro de 2026 (UTC+8). A janela de claim abre no TGE (lançamento da mainnet), quando o OMC acumulado poderá ser retirado em um único claim nesta página.",
        "fr": "⏳ La participation ferme le 31 décembre 2026 (UTC+8). La fenêtre de claim ouvre au TGE (lancement du mainnet), où les OMC cumulés deviennent retirables en un seul claim sur cette page.",
    },
    "rules.r6": {
        "en": "· The campaign only <b>displays your accumulated amount</b>; the <b>claim window opens at TGE</b> (mainnet launch), when the whole amount is withdrawable in <b>one claim on this page</b>.",
        "zh": "· 活动期间仅<b>展示累计数量</b>；<b>领取窗口在主网 TGE 时开启</b>，届时可在本页面<b>一次性领取</b>全部累计代币。",
        "ja": "· キャンペーン中は<b>累積額のみ表示</b>；<b>請求ウィンドウは TGE（メインネット公開）で開き</b>、本ページで<b>一括請求</b>できます。",
        "es": "· La campaña solo <b>muestra tu monto acumulado</b>; la <b>ventana de claim abre en el TGE</b> (lanzamiento de la mainnet), cuando se retira todo en <b>un solo claim en esta página</b>.",
        "ko": "· 캠페인 중에는 <b>누적 수량만 표시</b>되며, <b>청구 창은 TGE(메인넷 출시)에 열립니다</b>. 이때 본 페이지에서 <b>한 번에 청구</b>할 수 있습니다.",
        "pt": "· A campanha apenas <b>exibe o valor acumulado</b>; a <b>janela de claim abre no TGE</b> (lançamento da mainnet), quando tudo é retirado em <b>um único claim nesta página</b>.",
        "fr": "· La campagne <b>affiche uniquement votre montant cumulé</b> ; la <b>fenêtre de claim ouvre au TGE</b> (lancement du mainnet), où tout est retirable en <b>un seul claim sur cette page</b>.",
    },
    "js.hint_ended": {
        "en": "⌛ Participation has closed. The claim window opens at TGE — watch the news page.",
        "zh": "⌛ 参与期已结束。领取窗口将在主网 TGE 时开启，请关注新闻页。",
        "ja": "⌛ 参加受付は終了しました。請求ウィンドウは TGE で開きます——ニュースページをご確認ください。",
        "es": "⌛ La participación ha cerrado. La ventana de claim abre en el TGE — consulta la página de noticias.",
        "ko": "⌛ 참여가 마감되었습니다. 청구 창은 TGE에 열립니다 — 뉴스 페이지를 확인하세요.",
        "pt": "⌛ A participação encerrou. A janela de claim abre no TGE — acompanhe a página de notícias.",
        "fr": "⌛ La participation est fermée. La fenêtre de claim ouvre au TGE — suivez la page actualités.",
    },
}


def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def patch(path, key, value):
    with io.open(path, encoding="utf-8") as fh:
        src = fh.read()
    pat = re.compile(r'^(  "' + re.escape(key) + r'": )"(?:[^"\\]|\\.)*"(,?)$', re.M)
    m = pat.search(src)
    if not m:
        return "MISSING"
    new = '%s"%s"%s' % (m.group(1), esc(value), m.group(2))
    src = src[:m.start()] + new + src[m.end():]
    with io.open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(src)
    return "ok"


def main():
    total = 0
    problems = []
    for key, per_lang in PATCH.items():
        for lang, value in per_lang.items():
            p = os.path.join(LANG, lang + ".js")
            r = patch(p, key, value)
            if r == "ok":
                total += 1
            else:
                problems.append("%s / %s -> %s" % (lang, key, r))
    print("patched: %d" % total)
    if problems:
        print("PROBLEMS:")
        for x in problems:
            print("  " + x)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
