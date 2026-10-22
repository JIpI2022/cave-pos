#!/usr/bin/env python3
"""
Genere les icones PNG de la PWA (verre de vin stylise) sans dependance externe.

Usage :  python3 scripts/generate-icons.py
Sortie : public/icons/icon-192.png, icon-512.png, maskable-512.png

Le script ecrit directement le format PNG (zlib + CRC32), ce qui evite
d'installer Pillow. Relancez-le si vous changez les couleurs de marque.
"""
import math
import struct
import zlib
from pathlib import Path

BG = (15, 23, 42)        # slate-900 : fond
GLASS = (245, 205, 214)  # wine-200 : verre
WINE = (186, 43, 85)     # wine-600 : liquide
SS = 3                   # super-echantillonnage (anticrenelage)


def shape_color(x: float, y: float, scale: float):
    """Couleur du verre au point normalise (x, y), ou None si transparent au motif."""
    # Recentrage/mise a l'echelle pour la zone sure des icones « maskable »
    x = 0.5 + (x - 0.5) / scale
    y = 0.5 + (y - 0.5) / scale
    if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
        return None

    # --- Pied ---
    if 0.745 <= y <= 0.800 and abs(x - 0.5) <= 0.175:
        return GLASS
    # --- Tige ---
    if 0.480 <= y < 0.745 and abs(x - 0.5) <= 0.028:
        return GLASS

    # --- Calice : demi-ellipse qui se resserre vers le bas ---
    if 0.150 <= y <= 0.500:
        t = (y - 0.150) / 0.350
        half = 0.215 * math.sqrt(max(0.0, 1.0 - t * t * 0.96))
        if abs(x - 0.5) <= half:
            inner = half - 0.022            # epaisseur de la paroi
            if abs(x - 0.5) > inner and y < 0.490:
                return GLASS                # paroi du verre
            return WINE if y >= 0.275 else GLASS  # vin dans le fond du calice
    return None


def render(size: int, scale: float) -> bytes:
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / size
                    y = (py + (sy + 0.5) / SS) / size
                    color = shape_color(x, y, scale) or BG
                    for i in range(3):
                        acc[i] += color[i]
            n = SS * SS
            row += bytes((acc[0] // n, acc[1] // n, acc[2] // n, 255))
        rows.append(bytes(row))

    raw = b''.join(b'\x00' + r for r in rows)   # filtre 0 par ligne

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (struct.pack('>I', len(data)) + kind + data
                + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF))

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def main() -> None:
    out = Path(__file__).resolve().parent.parent / 'public' / 'icons'
    out.mkdir(parents=True, exist_ok=True)
    for name, size, scale in [
        ('icon-192.png', 192, 1.0),
        ('icon-512.png', 512, 1.0),
        # « maskable » : le motif est reduit pour tenir dans la zone sure (80 %)
        ('maskable-512.png', 512, 0.78),
    ]:
        (out / name).write_bytes(render(size, scale))
        print(f'  {name} ({size}x{size})')


if __name__ == '__main__':
    main()
