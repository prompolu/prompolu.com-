#!/usr/bin/env python3
"""Genere ar/studio-clair.hdr : l'eclairage du configurateur coulissant.

Variante claire de studio-hdr.py (meme format, Radiance RGBE compresse
RLE) pour les baies coulissantes, faites de montants verticaux :
  - cyclo gris chaud lumineux et sol clair : une face verticale vue d'en
    haut reflete le sol, qui ne doit pas etre sombre (sinon le RAL 9006
    et l'anodise paraissent noirs) ;
  - boite a lumiere au zenith ;
  - six bandes verticales tout autour : reflets longs sur les montants
    quel que soit l'angle de vue ;
  - lumiere d'appoint basse pour deboucher les faces vues d'en haut.

    python3 ar/studio-clair-hdr.py   # reecrit ar/studio-clair.hdr
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
    """Studio clair pour l'apercu : cyclo gris chaud lumineux, sol clair,
    boite a lumiere au zenith, bandes verticales tout autour (reflets
    longs sur les montants quel que soit l'angle), lumiere d'appoint
    basse pour deboucher les faces vues d'en haut."""
    k = max(v, 0) / 90
    sky = (0.78 + 0.5 * k, 0.76 + 0.5 * k, 0.72 + 0.52 * k)
    g = 0.46 - 0.12 * smooth(0, 90, -v)
    ground = (g * 1.06, g, g * 0.92)
    t = smooth(-4, 4, v)
    r, g, b = (ground[i] + (sky[i] - ground[i]) * t for i in range(3))
    key = box(u, v, 150, 230, 50, 82, 3.0) * 8.0
    strips = 0.0
    for c, gain in ((80, 5.0), (276, 4.0), (20, 2.6), (200, 2.6), (120, 2.0), (330, 2.0)):
        strips += box(u, v, c - 8, c + 8, 4, 50, 1.5) * gain
    fill = box(u, v, 0, 360, -30, -8, 6.0) * 0.35
    add = key + strips + fill
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
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'studio-clair.hdr')
    data = bytearray(b'#?RADIANCE\n# PROMPOLU studio clair\nFORMAT=32-bit_rle_rgbe\n\n')
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
