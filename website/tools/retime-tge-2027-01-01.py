#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Retime the whole OMC timeline to the 2027-01-01 TGE.

Decision (2026-10-10, user):
  - TGE = mainnet launch = staking opens = airdrop CLAIM window opens,
    all on 2027-01-01.
  - Participation window extended to 2027-01-01 as well, so the campaign
    closes exactly when the claim window opens.
  - Copy keeps quarter-level wording "2027 Q1"; the concrete Jan 1 date is
    stated wherever a real date (not a quarter) is discussed.

Keys touched per language (7 x 7 = up to 49 replacements):
  ph2.tag, tn.status_mainnet, calc.omc.badge, calc.omcdiff.note,
  nw5.t, nw5.d, claim.end_note

NOTE: French uses T4/T1, not Q4/Q1.
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANG = os.path.join(ROOT, "assets", "js", "lang")

R = {
    "en": [
        ("Phase 2 · 2026 Q4 – 2027 Q1 · Planned", "Phase 2 · 2027 Q1 · Planned"),
        ("Mainnet: 2026 Q4 – 2027 Q1", "Mainnet: 2027 Q1 · Jan 1"),
        ("TBA · mainnet 2026 Q4 – 2027 Q1", "TBA · mainnet 2027 Q1"),
        ("opens in 2026 Q4 – 2027 Q1. Nothing here is a price commitment",
         "opens in 2027 Q1 (January 1). Nothing here is a price commitment"),
        ("Roadmap updated: mainnet moves to 2026 Q4 – 2027 Q1",
         "Roadmap updated: mainnet moves to 2027 Q1 (January 1)"),
        ("opens in 2026 Q4 – 2027 Q1, so the OMC",
         "opens in 2027 Q1 (January 1), so the OMC"),
        ("Participation closes Dec 31, 2026 (UTC+8)", "Participation closes Jan 1, 2027 (UTC+8)"),
    ],
    "zh": [
        ("第 2 阶段 · 2026 Q4 – 2027 Q1 · 计划中", "第 2 阶段 · 2027 Q1 · 计划中"),
        ("主网：2026 Q4 – 2027 Q1", "主网：2027 Q1 · 1 月 1 日"),
        ("待定 · 主网 2026 Q4 – 2027 Q1", "待定 · 主网 2027 Q1"),
        ("主网——连同空投领取与质押——将于 2026 Q4 – 2027 Q1 上线",
         "主网——连同空投领取与质押——将于 2027 Q1（1 月 1 日）上线"),
        ("路线图更新：主网调整为 2026 Q4 – 2027 Q1", "路线图更新：主网定于 2027 Q1（1 月 1 日）"),
        ("参与于 2026-12-31（UTC+8）截止", "参与于 2027-01-01（UTC+8）截止"),
    ],
    "ja": [
        ("フェーズ 2 · 2026 Q4 – 2027 Q1 · 計画", "フェーズ 2 · 2027 Q1 · 計画"),
        ("メインネット：2026 Q4 – 2027 Q1", "メインネット：2027 Q1 · 1月1日"),
        ("未定 · メインネット 2026 Q4 – 2027 Q1", "未定 · メインネット 2027 Q1"),
        ("メインネットは 2026 Q4 – 2027 Q1 へ", "メインネットは 2027 Q1（1月1日）へ"),
        ("参加受付は 2026-12-31（UTC+8）まで", "参加受付は 2027-01-01（UTC+8）まで"),
    ],
    "es": [
        ("Fase 2 · 2026 Q4 – 2027 Q1 · Planificada", "Fase 2 · 2027 Q1 · Planificada"),
        ("Mainnet: 2026 Q4 – 2027 Q1", "Mainnet: 2027 Q1 · 1 de enero"),
        ("Por definir · mainnet 2026 Q4 – 2027 Q1", "Por definir · mainnet 2027 Q1"),
        ("la mainnet pasa a 2026 Q4 – 2027 Q1", "la mainnet pasa a 2027 Q1 (1 de enero)"),
        ("La participación cierra el 31 de diciembre de 2026 (UTC+8)",
         "La participación cierra el 1 de enero de 2027 (UTC+8)"),
    ],
    "ko": [
        ("2단계 · 2026 Q4 – 2027 Q1 · 계획", "2단계 · 2027 Q1 · 계획"),
        ("메인넷: 2026 Q4 – 2027 Q1", "메인넷: 2027 Q1 · 1월 1일"),
        ("미정 · 메인넷 2026 Q4 – 2027 Q1", "미정 · 메인넷 2027 Q1"),
        ("메인넷이 2026 Q4 – 2027 Q1로 변경", "메인넷이 2027 Q1(1월 1일)로 변경"),
        ("참여는 2026-12-31(UTC+8)에 마감됩니다", "참여는 2027-01-01(UTC+8)에 마감됩니다"),
    ],
    "pt": [
        ("Fase 2 · 2026 Q4 – 2027 Q1 · Planejada", "Fase 2 · 2027 Q1 · Planejada"),
        ("Mainnet: 2026 Q4 – 2027 Q1", "Mainnet: 2027 Q1 · 1 de janeiro"),
        ("A definir · mainnet 2026 Q4 – 2027 Q1", "A definir · mainnet 2027 Q1"),
        ("a mainnet passa para 2026 Q4 – 2027 Q1", "a mainnet passa para 2027 Q1 (1 de janeiro)"),
        ("A participação encerra em 31 de dezembro de 2026 (UTC+8)",
         "A participação encerra em 1 de janeiro de 2027 (UTC+8)"),
    ],
    "fr": [
        ("Phase 2 · 2026 T4 – 2027 T1 · Prévue", "Phase 2 · 2027 T1 · Prévue"),
        ("Mainnet : 2026 T4 – 2027 T1", "Mainnet : 2027 T1 · 1er janvier"),
        ("À définir · mainnet 2026 T4 – 2027 T1", "À définir · mainnet 2027 T1"),
        ("le mainnet passe à 2026 T4 – 2027 T1", "le mainnet passe à 2027 T1 (1er janvier)"),
        ("La participation se clôt le 31 décembre 2026 (UTC+8)",
         "La participation se clôt le 1er janvier 2027 (UTC+8)"),
    ],
}


def main():
    total = 0
    missed = 0
    for code, pairs in R.items():
        path = os.path.join(LANG, code + ".js")
        with io.open(path, "r", encoding="utf-8") as fh:
            txt = fh.read()
        hits = 0
        for old, new in pairs:
            if old not in txt:
                print("  [%s] MISS: %s" % (code, old[:70]))
                missed += 1
                continue
            txt = txt.replace(old, new)
            hits += 1
        with io.open(path, "w", encoding="utf-8") as fh:
            fh.write(txt)
        print("  [%s] %d/%d pairs applied" % (code, hits, len(pairs)))
        total += hits
    print("done: %d replacements, %d misses" % (total, missed))


if __name__ == "__main__":
    main()
