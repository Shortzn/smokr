#!/usr/bin/env python3
"""Erzeugt die App-Icons (dunkles Feld, grüner Kartenpunkt mit weißem Ring, Rauchfaden)."""
import math, os, struct, zlib
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "icons")
BG, GREEN, WHITE = (31, 36, 33), (18, 121, 92), (246, 244, 239)

def png(path, size):
    rows = []
    cx, cy = size * 0.5, size * 0.6
    r_out, r_in = size * 0.25, size * 0.19
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            px = BG
            d = math.hypot(x + .5 - cx, y + .5 - cy)
            if d <= r_in: px = GREEN
            elif d <= r_out: px = WHITE
            # Rauchfaden über dem Punkt (Sinuskurve)
            t = (cy - r_out - (y + .5)) / (size * 0.28)
            if 0 <= t <= 1:
                sx = cx + math.sin(t * math.pi * 2.2) * size * 0.06 * (0.4 + t)
                if abs(x + .5 - sx) <= size * 0.022 * (1 - t * 0.5): px = WHITE
            row += bytes(px)
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b""))

os.makedirs(OUT, exist_ok=True)
for s in (180, 192, 512):
    png(os.path.join(OUT, f"icon-{s}.png"), s)
print("ok")
