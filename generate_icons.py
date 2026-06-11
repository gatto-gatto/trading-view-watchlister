#!/usr/bin/env python3
"""Generate the extension's PNG icons using only the standard library.

Draws a blue rounded square with a 3-bar mini chart and a green "+" badge.
Run:  python3 generate_icons.py
"""
import struct
import zlib
import os

BLUE = (41, 98, 255, 255)      # #2962FF  (TradingView blue)
WHITE = (255, 255, 255, 255)
GREEN = (0, 200, 83, 255)       # #00C853
CLEAR = (0, 0, 0, 0)


def blend(dst, src):
    sa = src[3] / 255.0
    if sa >= 1:
        return src
    if sa <= 0:
        return dst
    da = dst[3] / 255.0
    out_a = sa + da * (1 - sa)
    if out_a == 0:
        return CLEAR
    r = (src[0] * sa + dst[0] * da * (1 - sa)) / out_a
    g = (src[1] * sa + dst[1] * da * (1 - sa)) / out_a
    b = (src[2] * sa + dst[2] * da * (1 - sa)) / out_a
    return (round(r), round(g), round(b), round(out_a * 255))


def make_icon(S):
    px = [[CLEAR for _ in range(S)] for _ in range(S)]

    def setp(x, y, color):
        if 0 <= x < S and 0 <= y < S:
            px[y][x] = blend(px[y][x], color)

    def rounded_rect(x0, y0, x1, y1, rad, color):
        for y in range(y0, y1):
            for x in range(x0, x1):
                dx = dy = 0
                if x < x0 + rad:
                    dx = (x0 + rad) - x
                elif x >= x1 - rad:
                    dx = x - (x1 - rad - 1)
                if y < y0 + rad:
                    dy = (y0 + rad) - y
                elif y >= y1 - rad:
                    dy = y - (y1 - rad - 1)
                if dx and dy and (dx * dx + dy * dy) > rad * rad:
                    continue
                setp(x, y, color)

    def rect(x0, y0, x1, y1, color):
        for y in range(int(y0), int(y1)):
            for x in range(int(x0), int(x1)):
                setp(x, y, color)

    def disc(cx, cy, r, color):
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    setp(x, y, color)

    # Background
    rounded_rect(0, 0, S, S, max(1, round(0.22 * S)), BLUE)

    # Three white bars (a tiny bar chart)
    base = 0.78 * S
    bar_w = 0.13 * S
    xs = [0.24 * S, 0.43 * S, 0.62 * S]
    tops = [0.52 * S, 0.36 * S, 0.46 * S]
    for x, top in zip(xs, tops):
        rect(x, top, x + bar_w, base, WHITE)

    # Green "+" badge, top-right
    cx, cy, r = 0.74 * S, 0.27 * S, 0.20 * S
    disc(cx, cy, r, GREEN)
    arm = 0.085 * S
    length = 0.13 * S
    rect(cx - length, cy - arm, cx + length, cy + arm, WHITE)   # horizontal
    rect(cx - arm, cy - length, cx + arm, cy + length, WHITE)   # vertical

    return px


def write_png(path, px):
    S = len(px)
    raw = bytearray()
    for row in px:
        raw.append(0)  # filter type 0
        for (r, g, b, a) in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    ihdr = struct.pack(">IIBBBBB", S, S, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
    os.makedirs(here, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(os.path.join(here, f"icon{size}.png"), make_icon(size))
        print(f"wrote icons/icon{size}.png")
