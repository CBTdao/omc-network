# -*- coding: utf-8 -*-
"""Stamp every page with when it changed, which facts it carries, and who it is.

Three additions, all aimed at the same problem: an answer engine cannot tell a
page from three weeks ago from a page from an hour ago, because nothing on the
page says so. `dateModified` gives a retriever a machine-readable date; the
footer line gives a reader (and a model reading the rendered text) the version
of the numbers they are looking at, so an old quote can be recognised as old;
the identity stamp gives every page's Organization the same @id and both of its
names, so 47 pages describe one entity rather than 47 lookalikes.

    dateModified   injected into the page's WebPage (or WebSite) JSON-LD block.
    facts version  "Facts v8 · 2026-10-30 · source" appended to the footer.
    identity       @id + alternateName + disambiguatingDescription on every
                   Organization node.

Where the date comes from, and why not `now`: the file's last git commit, unless
the file differs from HEAD once our own stamps are removed -- in which case the
page genuinely changed today and today is used. That makes the value honest
(it is when the page last changed, not when the script last ran) and idempotent
(running twice without an edit does not push the date forward).

Why the identity stamp is a script and not 47 hand edits: every page carries its
own copy of the Organization block, written by hand or by a builder, and the
copies had already drifted (some list two sameAs profiles, some three; only
/press had alternateName). A per-page fix re-drifts on the next regeneration.

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

# The identity keys, with whatever separator precedes them: the insertion goes
# at the front of the object, so the key after it keeps its own comma. Removing
# the leading one too is what makes "did this page change?" a fair comparison.
IDENTITY_KEY = re.compile(
    r',?\s*"(?:@id|alternateName|disambiguatingDescription)"\s*:\s*'
    r'(?:"(?:[^"\\]|\\.)*"|\[[^\]]*\])'
)

ORG_TYPE = re.compile(r'"@type"\s*:\s*"Organization"')
ORG_ID = "https://omc.network/#organization"

# One entity, two names, and an acronym that means something else in English:
# "OMC" is the Federal Open Market Committee everywhere in finance writing. A
# retriever that only ever saw "OMC" has no reason to map it onto the Chinese
# name it saw on another page, so both names travel on every page. The @id is
# the other half: without it a model reads 47 unrelated organizations that
# happen to share a logo.
ALT_EN = ["泛宇宙算力", "OMC"]
ALT_ZH = ["Omniverse Compute", "OMC"]

# One entity, one set of external profiles. A model that sees a GitHub org, an
# X account and a Telegram group on some pages and none on others reads two
# different projects; carrying the same list everywhere is what makes the
# acronym resolvable to one organisation across the whole domain.
SAME_AS = [
    "https://github.com/CBTdao",
    "https://x.com/Omniverse_Depin",
    "https://t.me/OmniverseCompute",
    "https://dev.to/omniverse_depin",
]

DESC_EN = (
    "Omniverse Compute (OMC) is an independent BNB Chain DePIN project building "
    "a decentralised GPU compute network that rents out idle GPUs. The name is "
    "distinct from NVIDIA's Omniverse 3D platform, from the Federal Open Market "
    "Committee (FOMC) and from any central bank."
)
DESC_ZH = (
    "泛宇宙算力（OMC）是 BNB Chain 上一个独立的 DePIN 项目，做的是出租闲置 GPU 的"
    "去中心化算力网络；该名称与 NVIDIA 的 Omniverse 3D 平台、美联储公开市场委员会"
    "（FOMC）及任何中央银行的机构无关。"
)

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


def identity_pages():
    """Pages that publish the Organization but are built by someone else.

    The game sub-site's daily pages are generated separately and carry their own
    editorial dates, so they are not stamped with a facts version. They do print
    the same Organization block, and an entity that is 33 pages on one host and
    anonymous on another is exactly the ambiguity this pass exists to remove.
    """
    out = sorted((WEB / "game").rglob("*.html"))
    return [p for p in out if "node_modules" not in p.parts]


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
    text = IDENTITY_KEY.sub("", text)
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


def json_objects(text):
    """Every balanced {...} span in text, string- and escape-aware.

    A regex cannot find the end of a JSON object that contains braces inside
    strings, and re-serialising a whole block to edit one node would rewrite the
    formatting of every page and bury the real change in the diff. So: find the
    spans by hand, edit the one node, leave the bytes around it alone.
    """
    spans, stack = [], []
    i, n, in_str = 0, len(text), False
    while i < n:
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c == "{":
            stack.append(i)
        elif c == "}" and stack:
            spans.append((stack.pop(), i))
        i += 1
    return spans


def org_nodes(body):
    """The Organization objects in one JSON-LD block: [(span, nested), ...]."""
    spans = json_objects(body)
    limits = sorted(spans)
    out = []
    for span in spans:
        s, e = span
        try:
            node = json.loads(body[s:e + 1])
        except json.JSONDecodeError:
            continue
        if not isinstance(node, dict):
            continue
        kind = node.get("@type")
        kinds = kind if isinstance(kind, list) else [kind]
        if "Organization" not in kinds:
            continue
        # Nested = sits inside another object, e.g. a NewsArticle's publisher or
        # a WebPage's `about`. Same entity, but three extra keys in a publisher
        # node is noise; @id and the names are the part that helps.
        nested = any(s2 < s and e < e2 for s2, e2 in limits)
        out.append((span, nested))
    return out


def _key_re(key):
    return re.compile(r'("%s"\s*:\s*)("(?:[^"\\]|\\.)*"|\[[^\]]*\])' % re.escape(key))


def enrich_node(body, alt, desc, add_desc):
    """Add or correct @id / alternateName / disambiguatingDescription."""
    pretty = re.match(r"\{\s*\r?\n([ \t]+)", body)
    indent = pretty.group(1) if pretty else ""
    sep = ", " if pretty else ","
    colon = ": " if pretty else ":"

    def lit(value):
        if isinstance(value, str):
            return json.dumps(value, ensure_ascii=False)
        return json.dumps(value, ensure_ascii=False, separators=(sep, colon))

    pairs = [("@id", ORG_ID), ("alternateName", alt), ("sameAs", SAME_AS)]
    if add_desc:
        pairs.append(("disambiguatingDescription", desc))

    missing = []
    for key, value in pairs:
        rx = _key_re(key)
        if rx.search(body):
            # Replace, not skip: an existing "alternateName": "泛宇宙算力" is a
            # correct name in a form that omits the acronym, and leaving it
            # alone is how the copies drifted apart in the first place.
            body = rx.sub(lambda m, v=lit(value): m.group(1) + v, body, count=1)
        else:
            missing.append(f'"{key}"{colon}{lit(value)}')
    if missing:
        if pretty:
            fill = (",\n" + indent).join(missing)
            return "{" + "\n" + indent + fill + "," + body[1:]
        return "{" + ",".join(missing) + "," + body[1:]
    return body


def canonical_name(body):
    """Promote a bare "OMC" name to the full name.

    Two nodes with the same @id must not disagree about the primary name: the
    game sub-site calls the publisher "OMC", the main site calls it "Omniverse
    Compute", and "OMC" is the string that is ambiguous in the first place. The
    acronym is not lost — it is in alternateName, which is where an alias goes.
    """
    rx = _key_re("name")

    def fix(m):
        if m.group(2) == '"OMC"':
            return m.group(1) + json.dumps("Omniverse Compute", ensure_ascii=False)
        return m.group(0)

    return rx.sub(fix, body, count=1)


def stamp_identity(text, is_zh):
    alt = ALT_ZH if is_zh else ALT_EN
    desc = DESC_ZH if is_zh else DESC_EN
    for m in reversed(list(LD.finditer(text))):
        body = m.group(2)
        if not ORG_TYPE.search(body):
            continue
        new_body = body
        # Right to left, so an edit never invalidates a span still to come.
        for (s, e), nested in reversed(org_nodes(body)):
            node = canonical_name(new_body[s:e + 1])
            fixed = enrich_node(node, alt, desc, not nested)
            if fixed != new_body[s:e + 1]:
                new_body = new_body[:s] + fixed + new_body[e + 1:]
        if new_body != body:
            text = text[: m.start(2)] + new_body + text[m.end(2):]
    return text


def identity_problems(text, is_zh):
    alt = ALT_ZH if is_zh else ALT_EN
    out = []
    for m in LD.finditer(text):
        body = m.group(2)
        if not ORG_TYPE.search(body):
            continue
        for (s, e), nested in org_nodes(body):
            try:
                node = json.loads(body[s:e + 1])
            except json.JSONDecodeError:
                out.append("Organization node is not valid JSON")
                continue
            if node.get("@id") != ORG_ID:
                out.append("Organization has no canonical @id")
            names = node.get("alternateName")
            names = names if isinstance(names, list) else [names]
            for want in alt:
                if want not in names:
                    out.append(f"Organization alternateName is missing {want}")
            if not nested and not node.get("disambiguatingDescription"):
                out.append("Organization has no disambiguatingDescription")
    return out


def main(argv):
    check = "--check" in argv
    written, missing = 0, []
    stamped = set(pages())
    for p in sorted(stamped | set(identity_pages())):
        text = p.read_text(encoding="utf-8")
        # Everything under website/zh/ is Chinese, including zh/news/.
        is_zh = str(p.relative_to(WEB)).replace("\\", "/").startswith("zh/")
        new = stamp_identity(text, is_zh)
        ok_ld = ok_footer = True

        if p in stamped:
            iso = page_date(p, text) if not check else None
            new, ok_ld = stamp_ld(new, iso or "1970-01-01")
            new, ok_footer = stamp_footer(new if not check else text, is_zh)

        if check:
            # Dedupe: a page with two Organization nodes (author and publisher)
            # would otherwise print the same sentence twice.
            problems = list(dict.fromkeys(identity_problems(text, is_zh)))
            if p not in stamped:
                # Identity-only pages (the game sub-site) get no date or version
                # stamp: their editorial dates are written by their own builder.
                if problems:
                    missing.append((p, problems))
                continue
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
