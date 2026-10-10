#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pass 2 of the 2027-01-01 TGE retime.

Pass 1 handled ph2.tag / tn.status_mainnet / calc.omc.badge / nw5.t /
claim.end_note in all 7 languages, plus nw5.d + calc.omcdiff.note only where
the English-shaped phrase "opens in 2026 Q4 - 2027 Q1" appeared.

This pass cleans up the *remaining* occurrences of the old window in
  - nw5.d            (es, ko, pt, zh)
  - calc.omcdiff.note (zh, ja, es, ko, pt, fr)
by targeting the language-specific date substrings directly.

Strategy: for each file, replace every remaining occurrence of the old
"2026 Q4 - 2027 Q1" / "2026 T4 - 2027 T1" date phrase with the new one,
EXCEPT inside ph1.tag (Phase 1 = 2026 Q4, which is still correct).

We do that by splitting on the ph1.tag line and leaving it untouched.
"""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANG = os.path.join(ROOT, "assets", "js", "lang")

# language -> list of (old_phrase, new_phrase)
DATES = {
    "en": [("2026 Q4 – 2027 Q1", "2027 Q1 (January 1)")],
    "zh": [("2026 Q4 – 2027 Q1", "2027 Q1（1 月 1 日）")],
    "ja": [("2026 Q4 – 2027 Q1", "2027 Q1（1月1日）")],
    "es": [("2026 Q4 – 2027 Q1", "2027 Q1 (1 de enero)")],
    "ko": [("2026 Q4 – 2027 Q1", "2027 Q1(1월 1일)")],
    "pt": [("2026 Q4 – 2027 Q1", "2027 Q1 (1 de janeiro)")],
    "fr": [("2026 T4 – 2027 T1", "2027 T1 (1er janvier)")],
}

# The ph1.tag line must NOT be touched: Phase 1 legitimately sits in 2026 Q4.
KEEP = re.compile(r'^\s*"ph1\.tag"')


def main():
    total = 0
    for code, pairs in DATES.items():
        path = os.path.join(LANG, code + ".js")
        with io.open(path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
        hits = 0
        for i, line in enumerate(lines):
            if KEEP.match(line):
                continue
            for old, new in pairs:
                if old in line:
                    line = line.replace(old, new)
                    hits += 1
            lines[i] = line
        with io.open(path, "w", encoding="utf-8") as fh:
            fh.writelines(lines)
        print("  [%s] %d date phrases replaced" % (code, hits))
        total += hits
    print("done: %d replacements" % total)


if __name__ == "__main__":
    main()
