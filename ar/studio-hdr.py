#!/usr/bin/env python3
"""Genere ar/studio.hdr : l'eclairage « studio photo » du configurateur 3D.

Panorama equirectangulaire HDR (Radiance RGBE, compresse RLE) :
  - ciel clair, legerement chaud, plus lumineux au zenith ;
  - une grande boite a lumiere au-dessus (lumiere principale) ;
  - deux bandes verticales de part et d'autre (reflets longs sur les
    montants, les cadres et le verre — c'est ce qui fait « aluminium ») ;
  - un sol gris chaud et sombre, pour que le verre ait un horizon.
Le dessin ne varie qu'en hauteur hors des boites a lumiere : chaque ligne
est faite de longues plages identiques, que le RLE compresse tres bien.

    python3 ar/studio-hdr.py        # reecrit ar/studio.hdr
"""
import math
import os

W, H = 1024, 512


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def box(u, v, u0, u1, v0, v1, soft):
    """1 dans le rectangle [u0,u1] x [v0,v1] (en degres), bords adoucis."""
    du = min(u - u0, u1 - u) if u0 <= u1 else -1
    dv = min(v - v0, v1 - v)
    return smooth(-soft, soft, du) * smooth(-soft, soft, dv)


def radiance(u, v):
    """u : azimut en degres [0,360), v : elevation en degres [-90,90]."""
    k = max(v, 0) / 90
    sky = (0.62 + 0.55 * k, 0.60 + 0.55 * k, 0.56 + 0.58 * k)
    g = 0.20 - 0.10 * smooth(0, 90, -v)
    ground = (g * 1.10, g, g * 0.90)
    # transition douce a l'horizon
    t = smooth(-3, 3, v)
    r, g, b = (ground[i] + (sky[i] - ground[i]) * t for i in range(3))

    # lumiere principale, au-dessus et un peu devant
    key = box(u, v, 150, 230, 52, 82, 2.5) * 9.0
    # bandes verticales gauche / droite
    left = box(u, v, 72, 92, 6, 48, 1.5) * 5.0
    right = box(u, v, 268, 284, 6, 48, 1.5) * 3.6
    # contre-jour discret derriere
    rim = box(u, v, 340, 360, 10, 30, 2.0) * 2.2 + box(u, v, 0, 20, 10, 30, 2.0) * 2.2
    add = key + left + right + rim
    return (r + add, g + add * 0.98, b + add * 0.95)


def rgbe(r, g, b):
    m = max(r, g, b)
    if m < 1e-32:
        return (0, 0, 0, 0)
    e = math.frexp(m)[1]
    s = 256.0 / (2.0 ** e)
    return (int(r * s), int(g * s), int(b * s), e + 128)


def rle(chan):
    out = bytearray()
    i, n = 0, len(chan)
    while i < n:
        run = 1
        while i + run < n and run < 127 and chan[i + run] == chan[i]:
            run += 1
        if run > 2:
            out += bytes((128 + run, chan[i]))
            i += run
            continue
        j = i
        while j < n and j - i < 128:
            if j + 2 < n and chan[j] == chan[j + 1] == chan[j + 2]:
                break
            j += 1
        out += bytes((j - i,)) + bytes(chan[i:j])
        i = j
    return out


def main():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'studio.hdr')
    data = bytearray(b'#?RADIANCE\n# PROMPOLU studio\nFORMAT=32-bit_rle_rgbe\n\n')
    data += f'-Y {H} +X {W}\n'.encode()
    for y in range(H):
        v = 90 - (y + 0.5) * 180 / H
        px = [rgbe(*radiance((x + 0.5) * 360 / W, v)) for x in range(W)]
        data += bytes((2, 2, W >> 8, W & 255))
        for c in range(4):
            data += rle([p[c] for p in px])
    with open(path, 'wb') as f:
        f.write(data)
    print(path, len(data), 'octets')


if __name__ == '__main__':
    main()
