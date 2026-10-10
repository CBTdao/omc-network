#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Add ph2.l4 = "Airdrop claim + staking open (same day as mainnet)" to the
home-page roadmap Phase 2 list, in all 7 languages.

Rationale: the whitepaper now makes "TGE = mainnet = staking = airdrop claim
on 2027-01-01" an explicit, load-bearing promise. The home roadmap listed
only "Mainnet launch / Compute mining / HF+Blender", so the single most
important user-facing fact (you can claim and stake on day one) was missing.
"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANG = os.path.join(ROOT, "assets", "js", "lang")

# anchor line -> new key line inserted right after it
NEW = {
    "en": '"ph2.l4": "Airdrop claim window and staking open the same day as mainnet",',
    "zh": '"ph2.l4": "空投领取窗口与质押在主网上线同一天开启",',
    "ja": '"ph2.l4": "エアドロップ受領とステーキングはメインネットと同日に開始",',
    "es": '"ph2.l4": "La ventana de reclamo del airdrop y el staking abren el mismo día que la mainnet",',
    "ko": '"ph2.l4": "에어드롭 수령 창구와 스테이킹이 메인넷과 같은 날 열림",',
    "pt": '"ph2.l4": "A janela de resgate do airdrop e o staking abrem no mesmo dia da mainnet",',
    "fr": '"ph2.l4": "La fenêtre de réclamation de l\'airdrop et le staking ouvrent le même jour que le mainnet",',
}

# The anchor differs slightly per language in indentation, but ph2.l3 is unique.
LINE_RE = '"ph2.l3":'


def main():
    for code, newline in NEW.items():
        path = os.path.join(LANG, code + ".js")
        with io.open(path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
        out = []
        done = False
        for line in lines:
            out.append(line)
            if not done and LINE_RE in line:
                # copy the anchor line's leading whitespace
                indent = line[: len(line) - len(line.lstrip())]
                out.append(indent + newline + "\n")
                done = True
        with io.open(path, "w", encoding="utf-8") as fh:
            fh.writelines(out)
        print("  [%s] %s" % (code, "inserted" if done else "ANCHOR MISS"))
    print("done")


if __name__ == "__main__":
    main()
