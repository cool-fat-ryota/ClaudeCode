#!/usr/bin/env python3
"""あわ貯金のアプリアイコンを生成する。

依存ライブラリなし。空・泡・コインを数式で描いて PNG を書き出す。
  python3 tools/make-icons.py
"""
import math
import struct
import zlib
import os

SKY_TOP = (166, 228, 255)
SKY_BOTTOM = (255, 216, 236)
GRASS = (126, 217, 141)
GRASS_DARK = (89, 196, 115)
COIN_1 = (255, 232, 136)
COIN_2 = (255, 190, 46)
COIN_3 = (207, 134, 8)
COIN_EDGE = (110, 64, 6)
COIN_INK = (138, 90, 8)
WHITE = (255, 255, 255)
PINK = (255, 175, 214)


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def over(dst, src, alpha):
    if alpha <= 0:
        return dst
    if alpha > 1:
        alpha = 1.0
    return tuple(dst[i] * (1 - alpha) + src[i] * alpha for i in range(3))


def edge(distance, radius, soft):
    """半径 radius の内側で 1、外側で 0 になる係数（境界をなめらかにする）"""
    return max(0.0, min(1.0, (radius - distance) / soft))


def seg_distance(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    length = vx * vx + vy * vy
    t = 0.0 if length == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / length))
    return math.hypot(px - (ax + vx * t), py - (ay + vy * t))


def draw(size, scale=1.0, grass=True):
    soft = 1.4 / size
    bubble_cx, bubble_cy = 0.5, 0.5 + (0.40 - 0.5) * scale
    bubble_r = 0.28 * scale
    coin_cx, coin_cy = 0.5, 0.5 + 0.28 * scale
    coin_r = 0.165 * scale
    # コインの ¥ を構成する線分（コイン中心からの相対位置）
    strokes = [
        (-0.42, -0.46, 0.0, 0.02), (0.42, -0.46, 0.0, 0.02),
        (0.0, 0.0, 0.0, 0.50),
        (-0.30, 0.16, 0.30, 0.16), (-0.30, 0.34, 0.30, 0.34),
    ]
    stroke_w = 0.085 * coin_r

    def pixel(ix, iy):
        x = (ix + 0.5) / size
        y = (iy + 0.5) / size
        c = lerp(SKY_TOP, SKY_BOTTOM, y)

        if grass:
            c = over(c, GRASS_DARK, edge(abs(y - 0.91), 0.09, soft))
            c = over(c, GRASS, edge(abs(y - 0.828), 0.008, soft))

        # 泡
        d = math.hypot(x - bubble_cx, y - bubble_cy)
        inside = edge(d, bubble_r, soft)
        if inside > 0:
            c = over(c, WHITE, 0.30 * inside)
            tint = edge(math.hypot(x - (bubble_cx + bubble_r * 0.35),
                                   y - (bubble_cy + bubble_r * 0.4)), bubble_r * 0.8, soft)
            c = over(c, PINK, 0.18 * tint * inside)
        rim = edge(abs(d - bubble_r + bubble_r * 0.045), bubble_r * 0.045, soft)
        c = over(c, WHITE, 0.92 * rim)
        c = over(c, WHITE, 0.95 * edge(math.hypot(x - (bubble_cx - bubble_r * 0.38),
                                                  y - (bubble_cy - bubble_r * 0.42)), bubble_r * 0.17, soft))

        # コイン
        cd = math.hypot(x - coin_cx, y - coin_cy)
        coin = edge(cd, coin_r, soft)
        if coin > 0:
            gd = math.hypot(x - (coin_cx - coin_r * 0.28), y - (coin_cy - coin_r * 0.3)) / (coin_r * 1.5)
            gd = min(1.0, gd)
            face = lerp(COIN_1, COIN_2, min(1.0, gd / 0.62)) if gd < 0.62 else lerp(COIN_2, COIN_3, (gd - 0.62) / 0.38)
            c = over(c, face, coin)
            mark = 0.0
            for ax, ay, bx, by in strokes:
                dist = seg_distance(x, y, coin_cx + ax * coin_r, coin_cy + ay * coin_r,
                                    coin_cx + bx * coin_r, coin_cy + by * coin_r)
                mark = max(mark, edge(dist, stroke_w, soft))
            c = over(c, COIN_INK, mark * coin)
        c = over(c, COIN_EDGE, 0.9 * edge(abs(cd - coin_r + coin_r * 0.06), coin_r * 0.06, soft))

        return tuple(max(0, min(255, int(round(v)))) for v in c)

    return pixel


def write_png(path, size, pixel):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw += bytes(pixel(x, y))

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(path, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')
    os.makedirs(out, exist_ok=True)
    write_png(os.path.join(out, 'icon-192.png'), 192, draw(192))
    write_png(os.path.join(out, 'icon-512.png'), 512, draw(512))
    # マスク可能アイコンは端を切られるので、中身を内側に寄せて背景で埋める
    write_png(os.path.join(out, 'maskable-512.png'), 512, draw(512, scale=0.66, grass=False))
    write_png(os.path.join(out, 'apple-touch-180.png'), 180, draw(180, scale=0.9))
    write_png(os.path.join(out, 'favicon-32.png'), 32, draw(32, scale=1.12, grass=False))
