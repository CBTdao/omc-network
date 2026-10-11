#!/usr/bin/env python3
"""Inject the on-chain contract block into every page footer.

Why: directory/listing review (CoinGecko, CMC, wallet dApp zones) looks for a
contract address published by the project itself. Right now the addresses live
only inside /stake and /compute, which a crawler that reads the home page never
reaches. This puts the network, the three deployed contracts and their BscScan
links on every page.

Shape of the injected block
---------------------------
It is inserted as a SIBLING of `.footer-grid`, never inside it:
`verify-site.js` asserts `.footer-grid > div` has exactly 5 children, so the
existing column count is frozen. The block also carries no `data-i18n` element
that wraps a child element — `i18n.js` applies translations with
`el.innerHTML = value`, so a wrapper with children would be wiped on a
language switch.

The stylesheet for the block ships as its own file rather than as an append to
`style.css`, because `vercel.json` serves `/assets/(.*)` with
`max-age=31536000, immutable` — appending to `style.css` would leave every
returning visitor on the old sheet for up to a year, with the block unstyled.
A brand-new file has no cache entry to fight.

Idempotent: re-running is a no-op, keyed on the `omc:contracts-block` marker
and on the stylesheet link.

    python add-footer-contracts.py [--dir <website dir>]
"""
import argparse
import os
import sys

NEW_LINK = '  <link rel="stylesheet" href="assets/css/footer-chain.css" />\n'
LINK_ANCHOR = '  <link rel="stylesheet" href="assets/css/style.css" />\n'

# The footer used to send "Tokenomics" to an anchor inside the whitepaper.
# There is a dedicated page now; point the link at it (the whitepaper anchor
# stays where it is, so anything else linking to #sec7 still resolves).
OLD_TKM = '<a href="/whitepaper#sec7" data-i18n="f.tokenomics">'
NEW_TKM = '<a href="/tokenomics" data-i18n="f.tokenomics">'

BLOCK = """      <!-- omc:contracts-block — network + deployed contracts, published for verification -->
      <div class="footer-chain">
        <div class="fc-head">
          <span class="fc-title" data-i18n="footer.chain_t">On-chain contracts</span>
          <span class="fc-badge" data-i18n="footer.chain_verified">BscScan verified</span>
        </div>
        <div class="fc-rows">
          <div class="fc-row">
            <span class="fc-k" data-i18n="footer.chain_net">Network</span>
            <span class="fc-v fc-plain" data-i18n="footer.chain_netv">BNB Smart Chain &middot; Testnet (chainId 97)</span>
          </div>
          <div class="fc-row">
            <span class="fc-k" data-i18n="footer.chain_token">OMC token (tOMC)</span>
            <a class="fc-v" href="https://testnet.bscscan.com/token/0xBEB21E40FB50A0F4ba9287C2058DC7851e450671" target="_blank" rel="noopener"><code>0xBEB21E40FB50A0F4ba9287C2058DC7851e450671</code></a>
          </div>
          <div class="fc-row">
            <span class="fc-k" data-i18n="footer.chain_staking">Staking (OMCStaking)</span>
            <a class="fc-v" href="https://testnet.bscscan.com/address/0xa70B8506a1a614Fd83D0C70d73Da1E21fdcf1fB6" target="_blank" rel="noopener"><code>0xa70B8506a1a614Fd83D0C70d73Da1E21fdcf1fB6</code></a>
          </div>
          <div class="fc-row">
            <span class="fc-k" data-i18n="footer.chain_market">Compute Market (OMCComputeMarket)</span>
            <a class="fc-v" href="https://testnet.bscscan.com/address/0x7664f1e73c2CBCbaFE636a653C173378C369C40A" target="_blank" rel="noopener"><code>0x7664f1e73c2CBCbaFE636a653C173378C369C40A</code></a>
          </div>
          <div class="fc-row">
            <span class="fc-k" data-i18n="footer.chain_sec">Security</span>
            <a class="fc-v fc-plain" href="https://github.com/CBTdao/omc-network/blob/main/SECURITY.md" target="_blank" rel="noopener" data-i18n="footer.chain_seclink">Automated security testing &mdash; not an audit &rarr;</a>
          </div>
        </div>
        <p class="fc-note" data-i18n="footer.chain_note">Testnet contracts, published for verification. Testnet tokens have no monetary value and are not sold or listed anywhere.</p>
      </div>

"""

MARKER = "omc:contracts-block"
ANCHOR = '      <div class="footer-bottom">'


def patch(path):
    with open(path, "r", encoding="utf-8", newline="") as fh:
        src = fh.read()
    notes = []
    nl = "\r\n" if "\r\n" in src else "\n"

    # 1. stylesheet link
    if "assets/css/footer-chain.css" not in src:
        anchor = LINK_ANCHOR if nl == "\n" else LINK_ANCHOR.replace("\n", "\r\n")
        if src.count(anchor) != 1:
            return "SKIP: %d stylesheet anchors" % src.count(anchor)
        new = NEW_LINK if nl == "\n" else NEW_LINK.replace("\n", "\r\n")
        src = src.replace(anchor, anchor + new)
        notes.append("link")

    # 2. footer block
    if MARKER not in src:
        if src.count(ANCHOR) != 1:
            return "SKIP: %d footer-bottom anchors" % src.count(ANCHOR)
        block = BLOCK if nl == "\n" else BLOCK.replace("\n", "\r\n")
        src = src.replace(ANCHOR, block + ANCHOR)
        notes.append("block")

    # 3. footer Tokenomics link -> /tokenomics
    if OLD_TKM in src:
        src = src.replace(OLD_TKM, NEW_TKM)
        notes.append("tkm-link")

    if not notes:
        return "already present"
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(src)
    return "patched (" + "+".join(notes) + ")"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    args = ap.parse_args()
    root = os.path.abspath(args.dir)

    css = os.path.join(root, "assets", "css", "footer-chain.css")
    print("stylesheet %s" % ("present" if os.path.exists(css) else "MISSING — create it first"))

    pages = sorted(f for f in os.listdir(root) if f.endswith(".html"))
    if not pages:
        print("no html files in " + root)
        return 1
    changed = 0
    for p in pages:
        status = patch(os.path.join(root, p))
        if status.startswith("patched"):
            changed += 1
        print("%-18s %s" % (p, status))
    print("\n%d file(s) patched, %d already up to date" % (changed, len(pages) - changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
