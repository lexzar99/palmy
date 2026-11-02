# Ritar Ramis Grills tillfälliga logga som rena vektorbanor, så att den ser likadan ut överallt.
# Ordet RAMIS i kraftig kursiv, med en såsrand som samma slinga som i skrollen.
import math
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).parents[3]
FONT = ROOT / "sites/node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-italic.woff2"
OUT = ROOT / "sites/ramis/public/img"

def text_path(text, wght, wdth, size, tracking=0):
    font = TTFont(FONT)
    font = instancer.instantiateVariableFont(font, {"wght": wght, "wdth": wdth})
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    x, pieces, box = 0, [], None
    for char in text:
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        bounds = BoundsPen(glyphs)
        glyphs[name].draw(TransformPen(bounds, (scale, 0, 0, -scale, x, 0)))
        if bounds.bounds:
            b = bounds.bounds
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        pieces.append(pen.getCommands())
        x += glyphs[name].width * scale + tracking
    return " ".join(pieces), box

big, b = text_path("RAMIS", 900, 125, 200)
small, s = text_path("GRILL", 800, 125, 58, tracking=20)
W = round(b[2] - b[0] + 56)
dx = (W - (b[2] - b[0])) / 2 - b[0]
dy = 30 - b[1]
base = 30 + (b[3] - b[1])
wave = " ".join(f"{'M' if i == 0 else 'L'}{W * 0.08 + i * W * 0.0042:.1f} {base + 34 + 13 * math.sin(i / 200 * math.pi * 9):.1f}" for i in range(201))
sx = (W - (s[2] - s[0])) / 2 - s[0]
sy = base + 78 - s[1]
H = sy + s[3] + 26

def logo(body, sauce, grill):
    return f'<g><path transform="translate({dx:.1f} {dy:.1f})" fill="{body}" d="{big}"/>' \
           f'<path d="{wave}" fill="none" stroke="{sauce}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>' \
           f'<path transform="translate({sx:.1f} {sy:.1f})" fill="{grill}" d="{small}"/></g>'

def svg(body, sauce, grill):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H:.0f}" width="{W}" height="{H:.0f}">{logo(body, sauce, grill)}</svg>\n'

(OUT / "logo.svg").write_text(svg("#0e4a36", "#e3321b", "#0e4a36"))
(OUT / "logo-light.svg").write_text(svg("#fff3dc", "#ffb81c", "#fff3dc"))
scale = 0.8
tx, ty = (W - W * scale) / 2, (W - H * scale) / 2
(OUT / "logo-square.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}" width="{W}" height="{W}"><rect width="{W}" height="{W}" fill="#0e4a36"/>'
    f'<g transform="translate({tx:.1f} {ty:.1f}) scale({scale})">{logo("#fff3dc", "#ffb81c", "#fff3dc")}</g></svg>\n')
print(W, round(H))
