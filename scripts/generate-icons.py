#!/usr/bin/env python3
"""
Genere les icones PNG de la PWA a partir du logo (une couronne) sans
dependance externe : le format PNG est ecrit directement (zlib + CRC32).

Usage :  python3 scripts/generate-icons.py
Sortie : public/icons/icon-192.png, icon-512.png, maskable-512.png

Relancez-le si vous changez les couleurs de marque ci-dessous.
"""
import math
import struct
import zlib
from pathlib import Path

FOND = (28, 25, 23)        # pierre-900
COURONNE = (218, 160, 62)  # ambre-400
PIERRE = (28, 25, 23)      # creux dans la couronne, couleur du fond
SS = 3                     # super-echantillonnage (anticrenelage)

# Couronne en coordonnees normalisees (0..1), reprise du SVG (viewBox 64).
COURONNE_POINTS = [(x / 64, y / 64) for x, y in
                   [(12, 44), (7, 18), (20, 29), (32, 10), (44, 29), (57, 18), (52, 44)]]
BANDEAU = (11 / 64, 48 / 64, 53 / 64, 56 / 64)   # x1, y1, x2, y2
JOYAUX = [(20 / 64, 36 / 64, 2.6 / 64), (32 / 64, 33 / 64, 3 / 64), (44 / 64, 36 / 64, 2.6 / 64)]


def dans_polygone(x: float, y: float, points) -> bool:
    """Test d'appartenance par lancer de rayon."""
    dedans = False
    n = len(points)
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) / (y2 - y1) * (x2 - x1)
            if x < xi:
                dedans = not dedans
    return dedans


def couleur(x: float, y: float, echelle: float):
    """Couleur du logo au point normalise, ou None pour le fond."""
    x = 0.5 + (x - 0.5) / echelle
    y = 0.5 + (y - 0.5) / echelle
    if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
        return None

    for cx, cy, r in JOYAUX:
        if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            return PIERRE

    if dans_polygone(x, y, COURONNE_POINTS):
        return COURONNE

    bx1, by1, bx2, by2 = BANDEAU
    if by1 <= y <= by2:
        rayon = (by2 - by1) / 2
        cy = (by1 + by2) / 2
        if bx1 + rayon <= x <= bx2 - rayon:
            return COURONNE
        for cx in (bx1 + rayon, bx2 - rayon):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rayon * rayon:
                return COURONNE
    return None


def rendre(taille: int, echelle: float) -> bytes:
    lignes = []
    for py in range(taille):
        ligne = bytearray()
        for px in range(taille):
            cumul = [0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / taille
                    y = (py + (sy + 0.5) / SS) / taille
                    c = couleur(x, y, echelle) or FOND
                    for i in range(3):
                        cumul[i] += c[i]
            n = SS * SS
            ligne += bytes((cumul[0] // n, cumul[1] // n, cumul[2] // n, 255))
        lignes.append(bytes(ligne))

    brut = b''.join(b'\x00' + l for l in lignes)

    def bloc(genre: bytes, data: bytes) -> bytes:
        return (struct.pack('>I', len(data)) + genre + data
                + struct.pack('>I', zlib.crc32(genre + data) & 0xFFFFFFFF))

    return (b'\x89PNG\r\n\x1a\n'
            + bloc(b'IHDR', struct.pack('>IIBBBBB', taille, taille, 8, 6, 0, 0, 0))
            + bloc(b'IDAT', zlib.compress(brut, 9))
            + bloc(b'IEND', b''))


def main() -> None:
    sortie = Path(__file__).resolve().parent.parent / 'public' / 'icons'
    sortie.mkdir(parents=True, exist_ok=True)
    for nom, taille, echelle in [
        ('icon-192.png', 192, 0.78),
        ('icon-512.png', 512, 0.78),
        # « maskable » : motif reduit pour tenir dans la zone sure
        ('maskable-512.png', 512, 0.60),
    ]:
        (sortie / nom).write_bytes(rendre(taille, echelle))
        print(f'  {nom} ({taille}x{taille})')


if __name__ == '__main__':
    main()
