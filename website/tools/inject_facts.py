# -*- coding: utf-8 -*-
"""Stamp every page with when it changed and which facts it carries.

Two additions, both aimed at the same problem: an answer engine cannot tell a
page from three weeks ago from a page from an hour ago, because nothing on the
page says so. `dateModified` gives a retriever a machine-readable date; the
footer line gives a reader (and a model reading the rendered text) the version
of the numbers they are looking at, so an old quote can be recognised as old.

    dateModified   injected into the page's WebPage (or WebSite) JSON-LD block.
    facts version  "Facts v8 · 2026-10-30 · source" appended to the footer.

Where the date comes from, and why not `now`: the file's last git commit, unless
the file differs from HEAD once our own stamps are removed -- in which case the
page genuinely changed today and today is used. That makes the value honest
(it is when the page last changed, not when the script last ran) and idempotent
(running twice without an edit does not push the date forward).

Run last, after build_zh.py / build_press.py / build_announcement.py, because
those regenerate pages and would overwrite the stamps. Running it twice is safe.

    python website/tools/inject_facts.py            # write
    python website/tools/inject_facts.py --check    # report only, exit 1 if any
                                                    # page is missing a stamp
"""
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
WEB = ROOT / "website"
PARAMS = json.loads((ROOT / "contracts" / "params.json").read_text(encoding="utf-8"))
VERSION = PARAMS["version"]
FACTS_DATE = PARAMS["updatedAt"]

LD = re.compile(r'(<script type="application/ld\+json">)([\s\S]*?)(</script>)')
COPYRIGHT = re.compile(r'(© 2026 Omniverse Compute · omc\.network)(</div>)')
FACTS_SPAN = re.compile(r'<br\s*/?>\s*<span class="facts-v">[\s\S]*?</span>')
FACTS_ONLY = re.compile(r'<span class="facts-v">[\s\S]*?</span>')
DATE_KEY = re.compile(r'"dateModified"\s*:\s*"[^"]*"')
EDITORIAL_DATE = re.compile(r'"dateModified"\s*:\s*"\d{4}-\d{2}-\d{2}T')

# Nodes that describe the page itself, in preference order. NewsArticle and
# Article are deliberately absent: those carry an editorial dateModified written
# by hand with a time and a timezone, and a script that rewrites them would make
# every article look edited whenever the footer changed. The gap being filled
# here is the evergreens, which had no date at all.
PAGE_LEVEL = ("WebPage", "AboutPage", "CollectionPage", "ItemPage", "WebApplication", "SoftwareApplication", "WebSite")


def pages():
    out = [p for p in sorted(WEB.glob("*.html"))]
    out += sorted((WEB / "news").glob("*.html"))
    out += sorted((WEB / "zh").glob("*.html"))
    out += sorted((WEB / "zh" / "news").glob("*.html"))
    return out


def rel(path):
    return str(path.relative_to(ROOT)).replace("\\", "/")


def head_of(path):
    """The committed version of the file, or None if it is untracked."""
    r = subprocess.run(["git", "show", f"HEAD:{rel(path)}"], cwd=ROOT, capture_output=True)
    if r.returncode != 0:
        return None
    return r.stdout.decode("utf-8", "replace")


def last_commit_date(path):
    r = subprocess.run(
        ["git", "log", "-1", "--format=%cd", "--date=short", "--", rel(path)],
        cwd=ROOT,
        capture_output=True,
    )
    value = r.stdout.decode("utf-8", "replace").strip()
    return value or None


def strip_stamps(text):
    """Remove what this script writes, so a rerun compares like with like."""
    text = DATE_KEY.sub('"dateModified": ""', text)
    text = FACTS_SPAN.sub("", text)
    return text


def page_date(path, current):
    head = head_of(path)
    if head is None:
        return date.today().isoformat()
    if strip_stamps(current) != strip_stamps(head):
        return date.today().isoformat()
    return last_commit_date(path) or date.today().isoformat()


def stamp_ld(text, iso_date):
    """Put dateModified on the page-level node, leaving every other block alone."""
    # An editorial date — full timestamp, with a time and a timezone — means a
    # human already answered this question for the page, and a second, coarser
    # answer next to it would only disagree with the first. Leave it.
    if EDITORIAL_DATE.search(text):
        return text, True

    target = None
    rank = len(PAGE_LEVEL)
    for m in LD.finditer(text):
        try:
            node = json.loads(m.group(2))
        except json.JSONDecodeError:
            continue
        if not isinstance(node, dict):
            continue
        kind = node.get("@type")
        if kind in PAGE_LEVEL and PAGE_LEVEL.index(kind) < rank:
            rank = PAGE_LEVEL.index(kind)
            target = m
        if rank == 0:
            break
    if target is None:
        return text, False

    body = target.group(2)
    if DATE_KEY.search(body):
        new_body = DATE_KEY.sub(f'"dateModified": "{iso_date}"', body, count=1)
    else:
        # Append as the last key rather than re-serialising: a re-serialise would
        # rewrite the formatting of every block on every page and bury the real
        # change in the diff.
        close = body.rstrip().rfind("}")
        if close == -1:
            return text, False
        head, tail = body[:close], body[close:]
        stripped = head.rstrip()
        comma = "" if stripped.endswith("{") else ","
        new_body = f'{stripped}{comma}\n  "dateModified": "{iso_date}"\n{tail}'
    return text[: target.start(2)] + new_body + text[target.end(2):], True


def stamp_footer(text, is_zh):
    label = "数据版本" if is_zh else "Facts"
    href = "https://github.com/CBTdao/omc-network/blob/main/contracts/params.json"
    src = "来源" if is_zh else "source"
    body = (
        f'<span class="facts-v">{label} v{VERSION} · {FACTS_DATE} · '
        f'<a href="{href}" target="_blank" rel="noopener">{src}</a></span>'
    )
    if FACTS_ONLY.search(text):
        # Replace only the span: the <br /> in front of it is already there.
        return FACTS_ONLY.sub(body, text, count=1), True
    if COPYRIGHT.search(text):
        return COPYRIGHT.sub(lambda m: m.group(1) + "<br />" + body + m.group(2), text, count=1), True
    return text, False


def main(argv):
    check = "--check" in argv
    written, missing = 0, []
    for p in pages():
        text = p.read_text(encoding="utf-8")
        # Everything under website/zh/ is Chinese, including zh/news/.
        is_zh = str(p.relative_to(WEB)).replace("\\", "/").startswith("zh/")
        iso = page_date(p, text) if not check else None
        new, ok_ld = stamp_ld(text, iso or "1970-01-01")
        new, ok_footer = stamp_footer(new if not check else text, is_zh)

        if check:
            problems = []
            if not re.search(r'"dateModified"\s*:\s*"\d{4}-\d{2}-\d{2}', text):
                problems.append("no dateModified")
            stamp = FACTS_ONLY.search(text)
            if not stamp:
                problems.append("no facts version")
            else:
                body = stamp.group(0)
                if f"v{VERSION}" not in body:
                    problems.append(f"facts version is not v{VERSION}")
                # build_zh.py copies the English footer verbatim and only
                # translates data-i18n nodes, so a rebuilt Chinese page carries
                # "Facts v8" until this script fixes it. Checking the language
                # is what catches that; checking for a version string does not.
                if is_zh and "数据版本" not in body:
                    problems.append("Chinese page carries the English stamp")
                if not is_zh and "数据版本" in body:
                    problems.append("English page carries the Chinese stamp")
            if problems:
                missing.append((p, problems))
            continue

        if not ok_ld or not ok_footer:
            missing.append((p, ["could not stamp: " + ("ld-json" if not ok_ld else "footer")]))
        if new != text:
            p.write_text(new, encoding="utf-8")
            written += 1

    if check:
        for p, problems in missing:
            print(f"  {rel(p)}: {', '.join(problems)}")
        print(f"{len(missing)} page(s) out of date" if missing else "all pages stamped")
        return 1 if missing else 0

    print(f"stamped {written} page(s)")
    for p, problems in missing:
        print(f"  WARN {rel(p)}: {', '.join(problems)}")
    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
