"""Guard: every heading whose level was normalised must still be styled.

seo-heading-levels2.py tags a moved heading with `as-hN` (the level it used to
have) and duplicates the matching stylesheet rules. If a page grows a section
that no rule covers, the browser falls back to the user-agent size for the new
level and the section silently changes weight. jsdom cannot catch that — it
loads no stylesheets — so this walks the real markup and the real CSS:

  for each <hX class="as-hN">, collect its ancestor classes, then look for a
  rule whose selector ends in hX.as-hN and whose ancestor part is fully
  contained in that class set.

Exit code 1 when a heading is unstyled.
"""
import os
import re
import sys

WEB = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS_FILES = ["assets/css/style.css", "assets/css/stake.css", "assets/css/referral.css",
             "assets/css/wallet-support.css", "assets/css/headings.css",
             "assets/css/footer-chain.css", "assets/css/ai-tools.css", "assets/css/compute.css"]

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
        "param", "source", "track", "wbr"}


def rules():
    """[(ancestors:set, tag:str, marker:str)] from every stylesheet."""
    out = []
    for rel in CSS_FILES:
        p = os.path.join(WEB, rel)
        if not os.path.exists(p):
            continue
        with open(p, "r", encoding="utf-8") as f:
            css = f.read()
        for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
            for part in m.group(1).split(","):
                part = part.strip()
                mm = re.search(r"\bh([1-6])\.as-h([1-6])\b", part)
                if not mm:
                    continue
                head_part = part[:mm.start()] + part[mm.end():]
                anc = set(re.findall(r"\.([A-Za-z0-9_-]+)", head_part))
                out.append((anc, "h" + mm.group(1), "as-h" + mm.group(2)))
    return out


RULES = rules()
problems, checked = [], 0

for name in sorted(os.listdir(WEB)):
    if not name.endswith(".html"):
        continue
    with open(os.path.join(WEB, name), "r", encoding="utf-8") as f:
        src = f.read()

    # single pass over tags, keeping a stack of open elements that carry classes
    stack, classes_of = [], {}
    pos = 0
    for m in re.finditer(r"<(/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>", src):
        closing, tag, attrs = m.group(1), m.group(2).lower(), m.group(3)
        if tag in ("script", "style") and not closing:
            end = src.find("</%s>" % tag, m.end())
            if end != -1:
                pos = end + len(tag) + 3
            continue
        if m.start() < pos:
            continue
        if closing:
            if stack and stack[-1][0] == tag:
                stack.pop()
            continue
        if tag in VOID or attrs.rstrip().endswith("/"):
            continue
        stack.append((tag, attrs))
        cm = re.search(r'class="([^"]*)"', attrs)
        mk = re.search(r"\bas-h([1-6])\b", cm.group(1) if cm else "")
        if mk and tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            checked += 1
            anc = set()
            for t, a in stack[:-1]:
                c = re.search(r'class="([^"]*)"', a)
                if c:
                    anc.update(c.group(1).split())
            ok = any(t == tag and mkr == "as-h" + mk.group(1) and a.issubset(anc)
                     for a, t, mkr in RULES)
            if not ok:
                problems.append("%s: <%s class=%s> has no matching rule (ancestors: %s)"
                                % (name, tag, mk.group(0), " ".join(sorted(anc)) or "-"))

print("moved headings checked: %d" % checked)
print("styled: %d" % (checked - len(problems)))
if problems:
    print("UNSTYLED:")
    for p in problems:
        print("  ! " + p)
    sys.exit(1)
print("ok — every normalised heading keeps its original typography")
