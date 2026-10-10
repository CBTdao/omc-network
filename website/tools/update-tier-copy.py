# -*- coding: utf-8 -*-
"""
The staking ladder changed from `base × tier` (100/200/300/400/500) to the
published ladder 20 / 100 / 500 / 1000 / 5000. Copy that still describes a
formula must go.

Keys touched:
  stk.h_stake_sub   - "minimum deposit is fixed for each tier" -> ladder wording
  stk.tier_note     - "Tier minimum = tier number × base deposit." -> ladder
  stk.h_tiers_sub   - "Base deposit is read live..." -> "minimums are read live"
"""
import io, os, re, sys

LANG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "js", "lang")

PATCH = {
    "stk.h_stake_sub": {
        "en": "A tier is a hardware class. Each tier has its own fixed minimum stake, published as a ladder — you cannot reach a higher tier with less stake.",
        "zh": "档位代表硬件等级。每一档有各自固定的最低质押额，以阶梯形式公布——无法用更少的质押进入更高的档位。",
        "ja": "ティアはハードウェアの等級です。各ティアには固有の固定最低ステーク額があり、ラダーとして公開されています。少ないステークで上のティアには到達できません。",
        "es": "Un nivel es una clase de hardware. Cada nivel tiene su propio mínimo de stake fijo, publicado como una escala: no puedes alcanzar un nivel superior con menos stake.",
        "ko": "티어는 하드웨어 등급입니다. 각 티어에는 고유한 고정 최소 스테이크가 있으며 사다리 형태로 공개됩니다. 더 적은 스테이크로 상위 티어에 도달할 수 없습니다.",
        "pt": "Um nível é uma classe de hardware. Cada nível tem seu próprio mínimo de stake fixo, publicado como uma escada — não há como alcançar um nível superior com menos stake.",
        "fr": "Un palier correspond à une classe de matériel. Chaque palier a son propre minimum de staking fixe, publié sous forme d'échelle : impossible d'atteindre un palier supérieur avec moins de stake.",
    },
    "stk.tier_note": {
        "en": "Tier 1 = 20 tOMC (one airdrop entry), tier 2 = 100 tOMC (a maxed-out airdrop). Tiers 3-5 require OMC from mining or the market.",
        "zh": "第 1 档 = 20 tOMC（一次空投）；第 2 档 = 100 tOMC（空投领满）。第 3–5 档需要挖矿或市场获得 OMC。",
        "ja": "ティア1 = 20 tOMC（エアドロップ1回分）、ティア2 = 100 tOMC（エアドロップ満額）。ティア3〜5 はマイニングまたは市場で OMC を用意する必要があります。",
        "es": "Nivel 1 = 20 tOMC (una entrada de airdrop), nivel 2 = 100 tOMC (airdrop al máximo). Los niveles 3-5 requieren OMC de minería o del mercado.",
        "ko": "티어 1 = 20 tOMC(에어드랍 1회분), 티어 2 = 100 tOMC(에어드랍 최대). 티어 3~5는 채굴 또는 시장에서 OMC를 확보해야 합니다.",
        "pt": "Nível 1 = 20 tOMC (uma entrada de airdrop), nível 2 = 100 tOMC (airdrop no máximo). Os níveis 3-5 exigem OMC de mineração ou do mercado.",
        "fr": "Palier 1 = 20 tOMC (une entrée d'airdrop), palier 2 = 100 tOMC (airdrop au maximum). Les paliers 3 à 5 exigent des OMC issus du minage ou du marché.",
    },
    "stk.h_tiers_sub": {
        "en": "Every tier minimum is read live from the contract, so this table can never drift from the code.",
        "zh": "每档最低质押额都实时读自合约，因此这张表不可能与代码脱节。",
        "ja": "各ティアの最低額はコントラクトからライブで読むため、この表がコードとずれることはありません。",
        "es": "Cada mínimo de nivel se lee en vivo del contrato, así que esta tabla nunca puede desviarse del código.",
        "ko": "각 티어 최소값은 컨트랙트에서 실시간으로 읽으므로 이 표가 코드와 어긋날 수 없습니다.",
        "pt": "Cada mínimo de nível é lido ao vivo do contrato, então esta tabela nunca pode divergir do código.",
        "fr": "Chaque minimum de palier est lu en direct dans le contrat : ce tableau ne peut pas diverger du code.",
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
    src = src[:m.start()] + '%s"%s"%s' % (m.group(1), esc(value), m.group(2)) + src[m.end():]
    with io.open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(src)
    return "ok"


def main():
    n, bad = 0, []
    for key, per_lang in PATCH.items():
        for lang, value in per_lang.items():
            r = patch(os.path.join(LANG, lang + ".js"), key, value)
            if r == "ok":
                n += 1
            else:
                bad.append("%s / %s -> %s" % (lang, key, r))
    print("keys patched: %d" % n)
    if bad:
        print("PROBLEMS:")
        for x in bad:
            print("  " + x)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
