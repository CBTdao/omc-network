"""Remove skipped heading levels without changing how anything looks.

Every page except the whitepaper jumped a level: content sections were written
as <h3> directly under <h1>, and the four footer column headings were <h5>
under an <h2>. Crawlers read that as "this section has no parent", which is
exactly the signal a well-structured page should not send.

How it works
  1. Walk the headings in document order and give each one a level that is at
     most one deeper than the heading before it. The mapping is sticky: the
     first <h3> decides the level for every later <h3>, so identical widgets
     (the four footer columns) stay identical instead of stair-stepping.
     Already-contiguous pages — the whitepaper's h1/h2/h3/h4 and both game
     builds — come out untouched.
  2. Every heading that moved down keeps a marker class naming where it came
     from (<h2 class="as-h3">), so step 3 can restore its typography.
  3. For each stylesheet rule that targets an old level (".card h3",
     ".f-col h5", ...), emit the same declarations under a selector that also
     matches the moved heading (".card h2.as-h3"). Specificity beats both the
     old rule and whatever the new level would otherwise inherit.

Idempotent: after a run the levels are contiguous, so step 1 has nothing left
to move, and the duplicated selectors are skipped on a second pass.
"""
import os
import re
import sys

WEB = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS_FILES = ["assets/css/style.css", "assets/css/stake.css", "assets/css/referral.css",
             "assets/css/wallet-support.css"]

HEAD = re.compile(r"<h([1-6])((?:[^>]*?))>")


def build_mapping(src):
    """document-order mapping old level -> new level, sticky per old level."""
    mapping, prev = {}, 0
    for m in HEAD.finditer(src):
        old = int(m.group(1))
        if old in mapping:
            prev = mapping[old]
            continue
        new = min(old, prev + 1) if prev else old
        mapping[old] = new
        prev = new
    return mapping


def transform(src):
    mapping = build_mapping(src)
    if all(k == v for k, v in mapping.items()):
        return src, {}
    moved = {}

    def open_tag(m):
        old = int(m.group(1))
        new = mapping[old]
        attrs = m.group(2)
        if new == old:
            return m.group(0)
        moved.setdefault(old, [new, 0])
        moved[old][1] += 1
        marker = "as-h%d" % old
        if re.search(r'\bclass="([^"]*)"', attrs):
            attrs = re.sub(r'\bclass="([^"]*)"',
                           lambda c: 'class="%s %s"' % (marker, c.group(1)), attrs, count=1)
        else:
            attrs = ' class="%s"%s' % (marker, attrs)
        return "<h%d%s>" % (new, attrs)

    out = HEAD.sub(open_tag, src)
    for old, new in sorted(mapping.items(), reverse=True):
        if old != new:
            out = out.replace("</h%d>" % old, "</h%d>" % new)
    return out, moved


report = {}
for name in sorted(os.listdir(WEB)):
    if not name.endswith(".html"):
        continue
    p = os.path.join(WEB, name)
    with open(p, "r", encoding="utf-8") as f:
        s = f.read()
    out, moved = transform(s)
    if out != s:
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(out)
        report[name] = moved

print("HTML rewritten:")
for k, v in report.items():
    print("  %-24s %s" % (k, ", ".join("h%d→h%d x%d" % (o, *v[o]) for o in sorted(v))))
if not report:
    print("  (nothing to do)")

print("\nCSS rules extended:")
for rel in CSS_FILES:
    p = os.path.join(WEB, rel)
    if not os.path.exists(p):
        continue
    with open(p, "r", encoding="utf-8") as f:
        css = f.read()
    out = css
    for m in list(re.finditer(r"([^{}]+)\{([^{}]*)\}", css)):
        sel, decls = m.group(1).strip(), m.group(2)
        if not sel or "@" in sel:
            continue
        parts = [x.strip() for x in sel.split(",")]
        added = []
        for part in parts:
            mm = re.search(r"\bh([3-6])\b", part)
            if not mm:
                continue
            old = int(mm.group(1))
            for new in range(1, old):
                dup = part[:mm.start()] + "h%d.as-h%d" % (new, old) + part[mm.end():]
                if dup not in parts and dup not in added:
                    added.append(dup)
        if added:
            lead = re.match(r"\s*", m.group(0)).group(0)
            new_rule = "%s%s,\n%s {%s}" % (lead, sel, ",\n".join(added), decls)
            out = out.replace(m.group(0), new_rule, 1)
            print("  %s: %s" % (rel, ", ".join(added)))
    if out != css:
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(out)
