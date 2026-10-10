# -*- coding: utf-8 -*-
"""
Update the airdrop participation caps across all 7 dictionaries.

Changed 2026-10-10 by user decision:
  - per-wallet cap:  10 entries -> 5 entries
  - daily cap:        2 entries -> 1 entry
  - per-entry value: 20 OMC (unchanged)
  - gas per entry:   0.01 BNB (unchanged)

Keys touched: ad.sub, ad.chip_wallet, rules.r3, rules.r4, nw2.d
Also patches the static defaults inside airdrop.html.
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
LANG = os.path.join(SITE, "assets", "js", "lang")

PATCH = {
    "ad.sub": {
        "en": "2% of the total 1B supply is reserved for the community — <b>1,000,000 entries × 20 OMC each</b>. Complete three simple social tasks, connect your wallet, and participate up to 5 times.",
        "zh": "总量 10 亿的 2% 预留给社区——<b>1,000,000 次参与机会 × 每次 20 OMC</b>。完成三步社交任务、连接钱包，即可参与最多 5 次。",
        "ja": "総供給10億の2%がコミュニティに予約されています——<b>1,000,000 回の参加 × 各20 OMC</b>。3つのソーシャルタスクを完了し、ウォレットを接続して最大5回参加できます。",
        "es": "El 2% del suministro total de 1B está reservado para la comunidad — <b>1,000,000 participaciones × 20 OMC cada una</b>. Completa tres tareas sociales simples, conecta tu wallet y participa hasta 5 veces.",
        "ko": "총 공급 10억의 2%가 커뮤니티에 예약되어 있습니다 — <b>1,000,000회 참여 × 회당 20 OMC</b>. 세 가지 소셜 태스크를 완료하고 지갑을 연결하면 최대 5회 참여할 수 있습니다.",
        "pt": "2% da oferta total de 1B está reservada para a comunidade — <b>1.000.000 participações × 20 OMC cada</b>. Complete três tarefas sociais simples, conecte sua carteira e participe até 5 vezes.",
        "fr": "2 % de l'offre totale de 1 milliard est réservé à la communauté — <b>1 000 000 participations × 20 OMC chacune</b>. Accomplissez trois tâches sociales simples, connectez votre portefeuille et participez jusqu'à 5 fois.",
    },
    "ad.chip_wallet": {
        "en": "♻️ Per Wallet <b>up to 5 entries</b>",
        "zh": "♻️ 单钱包 <b>最多 5 次</b>",
        "ja": "♻️ ウォレット毎 <b>最大5回</b>",
        "es": "♻️ Por Wallet <b>hasta 5 participaciones</b>",
        "ko": "♻️ 지갑당 <b>최대 5회</b>",
        "pt": "♻️ Por Carteira <b>até 5 participações</b>",
        "fr": "♻️ Par portefeuille <b>jusqu'à 5 participations</b>",
    },
    "rules.r3": {
        "en": "· Per-wallet cap: <b>up to 5 entries</b> in total = <b>100 OMC</b>, exactly the tier-2 staking minimum.",
        "zh": "· 单钱包上限：<b>最多参与 5 次</b>，合计 <b>100 OMC</b>——恰好等于质押第 2 档的门槛。",
        "ja": "· ウォレット毎の上限：<b>合計5回まで</b>＝<b>100 OMC</b>。ステーキングのティア2の最低額とちょうど一致します。",
        "es": "· Límite por wallet: <b>hasta 5 participaciones</b> en total = <b>100 OMC</b>, exactamente el mínimo de stake del nivel 2.",
        "ko": "· 지갑당 한도: <b>최대 5회</b>, 합계 <b>100 OMC</b> — 스테이킹 티어 2 최소 금액과 정확히 일치합니다.",
        "pt": "· Limite por carteira: <b>até 5 participações</b> no total = <b>100 OMC</b>, exatamente o mínimo de stake do nível 2.",
        "fr": "· Plafond par portefeuille : <b>jusqu'à 5 participations</b> au total = <b>100 OMC</b>, soit exactement le minimum de staking du palier 2.",
    },
    "rules.r4": {
        "en": "· Daily cap: <b>1 entry per calendar day</b> (resets at 00:00 UTC+8).",
        "zh": "· 每日上限：<b>每个自然日 1 次</b>（每日 00:00 UTC+8 重置）。",
        "ja": "· 日次上限：<b>1暦日あたり1回</b>（00:00 UTC+8 にリセット）。",
        "es": "· Límite diario: <b>1 participación por día natural</b> (se restablece a las 00:00 UTC+8).",
        "ko": "· 일일 한도: <b>1일 1회</b> (00:00 UTC+8 리셋).",
        "pt": "· Limite diário: <b>1 participação por dia natural</b> (reinicia às 00:00 UTC+8).",
        "fr": "· Plafond quotidien : <b>1 participation par jour calendaire</b> (réinitialisation à 00h00 UTC+8).",
    },
    "nw2.d": {
        "en": "20,000,000 OMC — 2% of the fixed supply — is reserved for the community: 1,000,000 entries × 20 OMC. Up to 5 entries per wallet and 1 per day (resets 00:00 UTC+8). A wallet that maxes out the airdrop holds 100 OMC, exactly the tier-2 staking minimum. The accumulated amount becomes claimable in a single claim when the claim window opens at TGE.",
        "zh": "2% 固定供应量 —— 20,000,000 枚 OMC 专用于社区：共 1,000,000 份，每份 20 OMC。单钱包最多 5 份，每日最多 1 份（UTC+8 零点重置）。领满空投的钱包持有 100 OMC，恰好等于质押第 2 档门槛。领取窗口在主网 TGE 开启时，可一次性领取全部累计代币。",
        "ja": "固定供給の 2% にあたる 20,000,000 OMC をコミュニティに用意：1,000,000 口 × 20 OMC。ウォレットあたり最大 5 口、1日あたり最大 1 口（UTC+8 の 0:00 にリセット）。エアドロップを満額受け取ったウォレットは 100 OMC を保有し、これはステーキングのティア2最低額と一致します。請求ウィンドウが TGE で開くと、累計分を一括で受け取れます。",
        "es": "20.000.000 OMC — el 2% del suministro fijo — se reservan para la comunidad: 1.000.000 de entradas × 20 OMC. Hasta 5 entradas por cartera y 1 al día (reinicio a las 00:00 UTC+8). Una cartera que agota el airdrop tiene 100 OMC, exactamente el mínimo de stake del nivel 2. El total acumulado se podrá reclamar en un único reclamo cuando la ventana de claim abra en el TGE.",
        "ko": "고정 공급량의 2%인 20,000,000 OMC를 커뮤니티에 배정합니다: 1,000,000개 × 20 OMC. 지갑당 최대 5개, 하루 최대 1개(UTC+8 00:00 초기화). 에어드랍을 최대로 받은 지갑은 100 OMC를 보유하며, 이는 스테이킹 티어 2 최소 금액과 정확히 일치합니다. 청구 창이 TGE에 열리면 누적 수량을 한 번에 수령할 수 있습니다.",
        "pt": "20.000.000 OMC — 2% do fornecimento fixo — estão reservados para a comunidade: 1.000.000 de entradas × 20 OMC. Até 5 entradas por carteira e 1 por dia (redefine 00:00 UTC+8). Uma carteira que esgota o airdrop tem 100 OMC, exatamente o mínimo de stake do nível 2. O total acumulado pode ser resgatado em um único resgate quando a janela de claim abrir no TGE.",
        "fr": "20 000 000 OMC — 2 % de l'offre fixe — sont réservés à la communauté : 1 000 000 d'entrées × 20 OMC. Jusqu'à 5 entrées par portefeuille et 1 par jour (réinitialisation à 00:00 UTC+8). Un portefeuille qui épuise l'airdrop détient 100 OMC, soit exactement le minimum de staking du palier 2. Le cumul est réclamable en une seule fois lorsque la fenêtre de claim ouvre au TGE.",
    },
}

# static defaults inside airdrop.html, per language-agnostic markup
HTML_REPL = [
    ('<b id="claimsTotal">0 / 10</b>', '<b id="claimsTotal">0 / 5</b>'),
    ('<b id="claimsToday">0 / 2</b>', '<b id="claimsToday">0 / 1</b>'),
]


def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def patch_key(path, key, value):
    with io.open(path, encoding="utf-8") as fh:
        src = fh.read()
    pat = re.compile(r'^(  "' + re.escape(key) + r'": )"(?:[^"\\]|\\.)*"(,?)$', re.M)
    m = pat.search(src)
    if not m:
        return "MISSING"
    src = src[:m.start()] + '%s"%s"%s' % (m.group(1), esc(value), m.group(2)) + src[m.end():]
    with io.open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(src)
    return "ok"


def main():
    n, bad = 0, []
    for key, per_lang in PATCH.items():
        for lang, value in per_lang.items():
            r = patch_key(os.path.join(LANG, lang + ".js"), key, value)
            if r == "ok":
                n += 1
            else:
                bad.append("%s / %s -> %s" % (lang, key, r))
    print("dictionary keys patched: %d" % n)

    hp = os.path.join(SITE, "airdrop.html")
    with io.open(hp, encoding="utf-8") as fh:
        h = fh.read()
    for a, b in HTML_REPL:
        if a in h:
            h = h.replace(a, b)
            print("html default replaced:", a)
        elif b in h:
            print("html default already current:", b)
        else:
            bad.append("html default not found: " + a)
    with io.open(hp, "w", encoding="utf-8", newline="") as fh:
        fh.write(h)

    if bad:
        print("PROBLEMS:")
        for x in bad:
            print("  " + x)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
