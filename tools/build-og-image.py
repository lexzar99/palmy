#!/usr/bin/env python3
"""Bygger delningsbilden (Open Graph) för viaeats.se.

Skriver apps/web/app/opengraph-image.png, som Next.js serverar som og:image och
twitter:image till Facebook, X, iMessage, WhatsApp och LinkedIn.

All text sätts lokalt med Baloo 2 ur varumärkespaketet i Logotyp/ — aldrig med
systemfont. Palett och regler enligt Logotyp/VIAEATS_BRAND_GUIDE.md.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'Logotyp' / 'Baloo2-VariableFont_wght.ttf'
WORDMARK = ROOT / 'Logotyp' / 'exports' / 'wordmark-viaeats-cream.png'
SMILEY = ROOT / 'Logotyp' / 'exports' / 'smiley-orange-transparent.png'
DST = ROOT / 'apps' / 'web' / 'app' / 'opengraph-image.png'

W, H = 1200, 630
SS = 2  # ritas i dubbel upplösning och skalas ner för mjuka kanter

NAVY = (10, 35, 64, 255)
NAVY_SOFT = (18, 52, 92, 255)
ORANGE = (240, 79, 26, 255)
ORANGE_LIGHT = (255, 162, 77, 255)
CREAM = (254, 247, 240, 255)


def font(size: int, weight: str = 'ExtraBold') -> ImageFont.FreeTypeFont:
    face = ImageFont.truetype(str(FONT), size * SS)
    face.set_variation_by_name(weight)
    return face


def glow(img: Image.Image, center, radius: int, color, alpha: float) -> None:
    """Mjuk radiell ljusning som ger djup utan att smutsa ner ytan."""
    small = (img.width // 8, img.height // 8)
    layer = Image.new('RGBA', small, (0, 0, 0, 0))
    cx, cy, r = center[0] * SS / 8, center[1] * SS / 8, radius * SS / 8
    ImageDraw.Draw(layer).ellipse([cx - r, cy - r, cx + r, cy + r],
                                 fill=(*color[:3], int(255 * alpha)))
    layer = layer.filter(ImageFilter.GaussianBlur(r * 0.55))
    img.alpha_composite(layer.resize(img.size, Image.BICUBIC))


def paste(img: Image.Image, path: Path, center, height: int) -> None:
    art = Image.open(path).convert('RGBA')
    art = art.crop(art.split()[3].getbbox())
    h = height * SS
    art = art.resize((max(1, round(art.width * h / art.height)), h), Image.LANCZOS)
    img.alpha_composite(art, (round(center[0] * SS - art.width / 2),
                              round(center[1] * SS - art.height / 2)))


def tracked(draw: ImageDraw.ImageDraw, xy, text: str, face, fill, gap: int) -> None:
    x, y = xy[0] * SS, xy[1] * SS
    for ch in text:
        draw.text((x, y), ch, font=face, fill=fill, anchor='lm')
        x += draw.textlength(ch, font=face) + gap * SS


def main() -> None:
    img = Image.new('RGBA', (W * SS, H * SS), NAVY)
    glow(img, (905, 300), 400, NAVY_SOFT, 0.60)
    glow(img, (905, 300), 230, ORANGE, 0.12)

    # Smileyn får gå ut över högerkanten — ordmärket behåller sin luft.
    paste(img, SMILEY, (1010, 318), 430)
    paste(img, WORDMARK, (86 + 251, 196 + 56), 112)

    d = ImageDraw.Draw(img)
    d.text((86 * SS, 372 * SS), 'Mat från lokala favoriter', font=font(46, 'Medium'),
           fill=(*CREAM[:3], 235), anchor='lm')
    tracked(d, (86, 444), 'LUND · VIAEATS.SE', font(25, 'Bold'), ORANGE_LIGHT, 6)

    img.convert('RGB').resize((W, H), Image.LANCZOS).save(DST, optimize=True)
    print(f'{DST.relative_to(ROOT)}  {W}x{H}  {DST.stat().st_size // 1024} kB')


if __name__ == '__main__':
    main()
