"""Give every <img> the attributes that affect layout stability and crawling.

  width/height   reserves the box so the page does not reflow when the image
                 lands — the header logo is the one image inside the first
                 viewport on every page, so it is the visible CLS offender.
                 The values are the rendered 36x36, not the 512x512 source,
                 so a CSS-less render still looks right.
  loading        eager for the header logo (it is above the fold on every
                 page), lazy for the footer logo and everything below the fold.
                 Lazy-loading a 36px logo is not a win by itself; the point is
                 that the browser stops treating it as a render dependency.
  decoding=async keeps image decode off the main thread.

Idempotent: re-running matches both the before and after shape.
"""
import os
import re
import sys

WEB = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NAV = '<img class="logo" src="assets/img/logo.png" alt="OMC" width="36" height="36" loading="eager" decoding="async" />'
FOOT = '<img class="logo" src="assets/img/logo.png" alt="OMC" width="36" height="36" loading="lazy" decoding="async" />'
OLD = '<img class="logo" src="assets/img/logo.png" alt="OMC" />'

EXTRA = {
    '<img class="wlt-logo" src="assets/img/wallets/binance-web3.svg" alt="Binance Web3 Wallet" width="40" height="40" />':
        '<img class="wlt-logo" src="assets/img/wallets/binance-web3.svg" alt="Binance Web3 Wallet" width="40" height="40" loading="lazy" decoding="async" />',
    '<img id="aiThumb" class="ai-thumb" alt="Preview" hidden />':
        '<img id="aiThumb" class="ai-thumb" alt="Preview" hidden loading="lazy" decoding="async" />',
    '<img id="aiBefore" alt="Original" />':
        '<img id="aiBefore" alt="Original" loading="lazy" decoding="async" />',
    '<img id="aiAfter" alt="Upscaled" />':
        '<img id="aiAfter" alt="Upscaled" loading="lazy" decoding="async" />',
    '<img id="aiJPreview" class="ai-jpreview" alt="preview" />':
        '<img id="aiJPreview" class="ai-jpreview" alt="Preview" loading="lazy" decoding="async" />',
}

changed = []
for name in sorted(os.listdir(WEB)):
    if not name.endswith(".html"):
        continue
    p = os.path.join(WEB, name)
    with open(p, "r", encoding="utf-8") as f:
        s = f.read()
    out = s
    if OLD in out:
        out = out.replace(OLD, NAV, 1)          # first is the header brand
        out = out.replace(OLD, FOOT, 1)         # second is the footer brand
    for a, b in EXTRA.items():
        out = out.replace(a, b)
    if out != s:
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(out)
        changed.append(name)

print("changed %d files" % len(changed))
for c in changed:
    print("  " + c)
