#!/usr/bin/env python3
"""Gör om text till SVG-banor med Baloo 2.

Varför inte @font-face: renderaren i sharp hittar inte inbäddade typsnitt
tillförlitligt och faller tillbaka på systemfont. Banor ger exakt rätt
bokstavsformer varje gång, oavsett vilka typsnitt maskinen har.
"""
import json
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

_cache = {}


def load(path):
    if path not in _cache:
        font = TTFont(path)
        _cache[path] = (font, font.getGlyphSet(), font["head"].unitsPerEm, font.getBestCmap())
    return _cache[path]


def render(text, font_path, size):
    font, glyphs, upem, cmap = load(font_path)
    scale = size / upem
    hmtx = font["hmtx"]
    kern = {}
    x = 0.0
    parts = []
    prev = None
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            x += size * 0.35
            prev = None
            continue
        if prev is not None:
            x += kern.get((prev, name), 0) * scale
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        d = pen.getCommands()
        if d:
            parts.append(f'<path d="{d}" transform="translate({x:.2f} 0) scale({scale:.6f} {-scale:.6f})"/>')
        x += hmtx[name][0] * scale
        prev = name
    return {"svg": "".join(parts), "width": x}


if __name__ == "__main__":
    request = json.loads(sys.stdin.read())
    print(json.dumps([render(item["text"], item["font"], item["size"]) for item in request]))
