#!/usr/bin/env python
"""Generate the share cards used when the airdrop is posted outside the site.

A text post gets read once and buried. A card gets forwarded into groups where
nobody will click a link first, so the card has to carry the whole proposition
on its own: what it is, how much, how to get it, when, and the fee.

The fee is on the card deliberately. Hiding it produces a screenshot that says
"free" next to a step that charges 0.01 BNB, and that screenshot is what gets
quoted back as a scam accusation. Stating it as a processing charge, in the
same frame as the free tokens, is the version that survives being forwarded.

Text is drawn with system fonts and never wrapped automatically: each line is
measured and either shrunk or split at a chosen point, so a longer Chinese
string cannot silently run off the edge.

    python website/tools/build_share_card.py

They land in website/assets/img/press/ rather than docs/: the press kit links to
them, so they have to be publicly downloadable, and one copy cannot drift from
the other.
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PARAMS = json.load(open(os.path.join(ROOT, "contracts", "params.json"), encoding="utf-8"))
OUT = os.path.join(ROOT, "website", "assets", "img", "press")

A = PARAMS["airdrop"]
POOL = A["pool"]
PER = A["perEntry"]
SLOTS = A["poolSlots"]
FEE = A["claimCost"]["feeBnb"]
MAX = A["claimCost"]["maxChargeBnb"]
CLAIM_OPENS = A["claimOpens"]  # 2027-01-01

ZH_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
ZH_BODY = r"C:\Windows\Fonts\msyh.ttc"
EN_BOLD = r"C:\Windows\Fonts\arialbd.ttf"
EN_BODY = r"C:\Windows\Fonts\arial.ttf"

TOP = (110, 92, 240)
BOTTOM = (76, 58, 196)
WHITE = (255, 255, 255)
DIM = (226, 221, 255)
ACCENT = (255, 226, 122)


def font(path, size):
    return ImageFont.truetype(path, size)


def gradient(size, top=TOP, bottom=BOTTOM):
    """Diagonal gradient. Built small and resized: per-pixel on a 1200x630 canvas
    is 750k Python loop iterations for a result indistinguishable from this."""
    w, h = 240, 126
    small = Image.new("RGB", (w, h))
    px = small.load()
    for y in range(h):
        for x in range(w):
            t = (x / (w - 1) * 0.45) + (y / (h - 1) * 0.55)
            px[x, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return small.resize(size, Image.BICUBIC)


def fit(draw, text, path, size, max_width, min_size=18):
    """Shrink until it fits. Chinese strings are wide and have no spaces to
    break on, so shrinking is safer than wrapping."""
    while size > min_size:
        f = font(path, size)
        if draw.textlength(text, font=f) <= max_width:
            return f
        size -= 2
    return font(path, min_size)


def card(size, blocks, footer, badge="OMC"):
    img = gradient(size)
    d = ImageDraw.Draw(img)
    w, h = size
    pad = int(w * 0.075)
    max_w = w - pad * 2

    # Measure first, then centre the block in the space between the top edge and
    # the footer. Drawing top-down and hoping leaves a lake of empty gradient in
    # the lower half on the square card, which reads as an unfinished image.
    fitted = []
    for kind, text, spec in blocks:
        if kind == "rule":
            fitted.append(("rule", "", 26))
            continue
        path, size_px, color = spec
        f = fit(d, text, path, size_px, max_w)
        fitted.append((kind, (text, f, color), int(f.size * 1.42)))

    f_foot = fit(d, footer, ZH_BODY if _is_cjk(footer) else EN_BODY, int(h * 0.038),
                 max_w - int(h * 0.18))
    block_h = sum(x[2] for x in fitted)
    top = int(h * 0.08)
    avail = h - pad - int(f_foot.size * 1.1) - top - int(h * 0.06)
    y = top + max(0, (avail - block_h) // 2)

    for kind, payload, adv in fitted:
        if kind == "rule":
            d.rounded_rectangle([pad, y, pad + 64, y + 6], radius=3, fill=ACCENT)
            y += adv
            continue
        text, f, color = payload
        d.text((pad, y), text, font=f, fill=color)
        y += adv

    fy = h - pad - int(f_foot.size * 1.1)
    d.text((pad, fy), footer, font=f_foot, fill=DIM)

    bx, by = w - pad - int(h * 0.13), h - pad - int(h * 0.13)
    d.rounded_rectangle([bx, by, bx + int(h * 0.13), by + int(h * 0.13)],
                        radius=int(h * 0.028), outline=WHITE, width=3)
    f_b = font(EN_BOLD, int(h * 0.045))
    tw = d.textlength(badge, font=f_b)
    d.text((bx + (int(h * 0.13) - tw) / 2, by + int(h * 0.13) * 0.34), badge, font=f_b, fill=WHITE)

    return img


def _is_cjk(s):
    return any("\u4e00" <= c <= "\u9fff" for c in s)


def zh_landscape():
    size = (1200, 630)
    blocks = [
        ("t", "免费空投 · 20,000,000 OMC", (ZH_BOLD, 60, WHITE)),
        ("rule", "", None),
        ("t", f"{SLOTS:,} 份 × 每份 {PER} OMC", (ZH_BOLD, 46, WHITE)),
        ("t", "先到先得 · 无抽签 · 无白名单", (ZH_BODY, 34, DIM)),
        ("t", "满额 200 OMC ≈ 一台 GPU 节点保证金的 30%", (ZH_BODY, 30, DIM)),
        ("t", "关注 X · 转发评论 · 加入 Telegram", (ZH_BODY, 32, DIM)),
        ("t", "登记免费 · 领取时 0.01 BNB/份 处理手续费", (ZH_BODY, 28, ACCENT)),
        ("t", "BNB Chain 上的去中心化 GPU 算力网络 · 泛宇宙算力", (ZH_BODY, 26, DIM)),
    ]
    return card(size, blocks, "omc.network/airdrop　　领取 2027.01.01 开启")


def zh_square():
    size = (1080, 1080)
    blocks = [
        ("t", "免费空投", (ZH_BOLD, 96, ACCENT)),
        ("t", "20,000,000", (ZH_BOLD, 120, WHITE)),
        ("t", "OMC", (ZH_BOLD, 60, WHITE)),
        ("rule", "", None),
        ("t", "100 万份 × 每份 20 OMC", (ZH_BOLD, 44, WHITE)),
        ("t", "先到先得，完成任务即可登记", (ZH_BODY, 34, DIM)),
        ("t", "满额 200 OMC ≈ 节点保证金 30%", (ZH_BODY, 30, DIM)),
        ("t", "登记免费", (ZH_BODY, 30, DIM)),
        ("t", "领取时 0.01 BNB/份 处理手续费", (ZH_BODY, 30, ACCENT)),
        ("t", "BNB Chain · 去中心化 GPU 算力网络", (ZH_BODY, 28, DIM)),
    ]
    return card(size, blocks, "omc.network/airdrop", badge="OMC")


def en_landscape():
    size = (1200, 630)
    blocks = [
        ("t", "FREE AIRDROP · 20,000,000 OMC", (EN_BOLD, 56, WHITE)),
        ("rule", "", None),
        ("t", f"{SLOTS:,} slots × {PER} OMC each", (EN_BOLD, 44, WHITE)),
        ("t", "First come, first served. No lottery, no snapshot.", (EN_BODY, 32, DIM)),
        ("t", "A full 200 OMC claim ≈ 30% of a tier-1 GPU node bond", (EN_BODY, 30, DIM)),
        ("t", "Follow · Retweet · Join Telegram", (EN_BODY, 32, DIM)),
        ("t", "Free to register. 0.01 BNB per entry at claim.", (EN_BODY, 28, ACCENT)),
        ("t", "Decentralized GPU compute on BNB Chain", (EN_BODY, 26, DIM)),
    ]
    return card(size, blocks, "omc.network/airdrop    claim opens 1 Jan 2027")


def main():
    os.makedirs(OUT, exist_ok=True)
    files = {
        "omc-airdrop-zh-1200x630.png": zh_landscape(),
        "omc-airdrop-zh-1080x1080.png": zh_square(),
        "omc-airdrop-en-1200x630.png": en_landscape(),
    }
    for name, img in files.items():
        path = os.path.join(OUT, name)
        img.save(path, optimize=True)
        print(f"{name}  {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
