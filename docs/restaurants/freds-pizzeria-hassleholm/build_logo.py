# Ritar Freds Pizzerias logga som rena vektorbanor, så att den ser likadan ut överallt.
# Märket: en tomatröd pizza där en bit är uttagen, och ett vitt F vars tomma hörn möter den saknade biten.
# Ordbilden: FREDS i bred Archivo Black, PIZZERIA spärrat under, lika bred.
import math
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).parents[3]
FONT = ROOT / "sites/node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2"
OUT = ROOT / "sites/freds/public/img"

RED = "#e3262e"
INK = "#141416"
CREAM = "#f5f3ef"
GREY = "#9d9a95"

_fonts = {}


def font(wght, wdth):
    key = (wght, wdth)
    if key not in _fonts:
        _fonts[key] = instancer.instantiateVariableFont(TTFont(FONT), {"wght": wght, "wdth": wdth})
    return _fonts[key]


def text_path(text, wght, wdth, size, tracking=0.0):
    """Banor för texten med baslinjen på y=0, och textens faktiska ruta."""
    f = font(wght, wdth)
    glyphs, cmap = f.getGlyphSet(), f.getBestCmap()
    scale = size / f["head"].unitsPerEm
    x, pieces, box = 0.0, [], None
    for i, char in enumerate(text):
        name = cmap[ord(char)]
        pen, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        glyphs[name].draw(TransformPen(bounds, (scale, 0, 0, -scale, x, 0)))
        if bounds.bounds:
            b = bounds.bounds
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        pieces.append(pen.getCommands())
        x += glyphs[name].width * scale + (tracking if i < len(text) - 1 else 0)
    return " ".join(pieces), box


def fit(text, wght, wdth, width, tracking_em=0.0):
    """Skalar texten så att den blir exakt `width` bred (med spärrning i em)."""
    _, box = text_path(text, wght, wdth, 100, tracking_em * 100)
    size = 100 * width / (box[2] - box[0])
    return text_path(text, wght, wdth, size, tracking_em * size)


# ---------- Märket (512 × 512) ----------
# En tomatröd skiva med ett vitt F, där mittarmen är en pizzabit med kanten utåt.
C, R = 256.0, 236.0


def arc_pt(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def slice_path(ax, ay, r, half):
    # Biten pekar med spetsen mot stammen och har kanten (en båge) till höger
    x1, y1 = arc_pt(ax, ay, r, -half)
    x2, y2 = arc_pt(ax, ay, r, half)
    return f"M{ax:.2f} {ay:.2f} L{x1:.2f} {y1:.2f} A{r} {r} 0 0 1 {x2:.2f} {y2:.2f} Z"


def crust_arc(ax, ay, r, half):
    x1, y1 = arc_pt(ax, ay, r, -half)
    x2, y2 = arc_pt(ax, ay, r, half)
    return f"M{x1:.2f} {y1:.2f} A{r} {r} 0 0 1 {x2:.2f} {y2:.2f}"


def mark(fill=RED, letter=CREAM):
    # F:ets mått, i samma proportioner som Archivo Black i bred stil
    top, bottom = 128.0, 384.0
    stem_l, stem_w = 150.0, 80.0
    arm_r, arm_h = 372.0, 70.0
    stem = f"M{stem_l} {top} H{arm_r} V{top + arm_h} H{stem_l + stem_w} V{bottom} H{stem_l} Z"
    # Biten: spetsen sitter i stammen, så att den läses som F:ets mittarm
    ax, ay = stem_l + stem_w - 34, 272.0
    r, half = 178.0, 22.0
    piece = slice_path(ax, ay, r, half)
    crust = crust_arc(ax, ay, r - 20, half - 4)
    dots = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rr}" fill="{fill}"/>' for x, y, rr in
                   [(ax + 96, ay - 17, 12), (ax + 124, ay + 25, 10)])
    return (f'<circle cx="{C}" cy="{C}" r="{R}" fill="{fill}"/>'
            f'<circle cx="{C}" cy="{C}" r="{R - 20}" fill="none" stroke="{letter}" stroke-opacity="0.32" stroke-width="5"/>'
            f'<path d="{stem}" fill="{letter}"/><path d="{piece}" fill="{letter}"/>'
            f'<path d="{crust}" fill="none" stroke="{fill}" stroke-width="7" stroke-linecap="round"/>{dots}')


# ---------- Ordbilden ----------
WORD_W = 620.0


def wordmark(main, sub, with_city=False):
    big, b = fit("FREDS", 900, 125, WORD_W)
    small, s = fit("PIZZERIA", 700, 100, WORD_W, tracking_em=0.34)
    gap = 22
    y_big = -b[1]
    y_small = (b[3] - b[1]) + gap - s[1]
    height = (b[3] - b[1]) + gap + (s[3] - s[1])
    out = (f'<path transform="translate({-b[0]:.2f} {y_big:.2f})" fill="{main}" d="{big}"/>'
           f'<path transform="translate({-s[0]:.2f} {y_small:.2f})" fill="{sub}" d="{small}"/>')
    if with_city:
        city, c = fit("HÄSSLEHOLM", 600, 100, WORD_W * 0.5, tracking_em=0.3)
        y_city = height + 30 - c[1]
        cx = (WORD_W - (c[2] - c[0])) / 2 - c[0]
        out += f'<path transform="translate({cx:.2f} {y_city:.2f})" fill="{sub}" d="{city}"/>'
        height += 30 + (c[3] - c[1])
    return out, height


def svg(w, h, body, bg=None):
    rect = f'<rect width="{w:.0f}" height="{h:.0f}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">{rect}{body}</svg>\n'


def horizontal(main, sub):
    word, wh = wordmark(main, sub)
    size = wh * 1.32
    pad = 2
    s = size / 512
    body = (f'<g transform="translate({pad} {pad}) scale({s:.4f})">{mark()}</g>'
            f'<g transform="translate({pad + size + size * 0.22:.2f} {pad + (size - wh) / 2:.2f})">{word}</g>')
    return svg(pad * 2 + size * 1.22 + WORD_W, pad * 2 + size, body)


def stacked(main, sub, bg=None, side=None):
    word, wh = wordmark(main, sub, with_city=True)
    m = 300
    gap = 56
    width = side or WORD_W + 8
    height = side or m + gap + wh + 8
    top = (height - (m + gap + wh)) / 2
    body = (f'<g transform="translate({(width - m) / 2:.2f} {top:.2f}) scale({m / 512:.4f})">{mark()}</g>'
            f'<g transform="translate({(width - WORD_W) / 2:.2f} {top + m + gap:.2f})">{word}</g>')
    return svg(width, height, body, bg)


def icon(bg, scale=0.8):
    off = 512 * (1 - scale) / 2
    return svg(512, 512, f'<g transform="translate({off:.1f} {off:.1f}) scale({scale})">{mark()}</g>', bg)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "logo-mark.svg").write_text(svg(512, 512, mark()))
    (OUT / "logo.svg").write_text(horizontal(CREAM, GREY))          # mörk bakgrund
    (OUT / "logo-dark.svg").write_text(horizontal(INK, "#66676c"))  # ljus bakgrund
    (OUT / "logo-stacked.svg").write_text(stacked(CREAM, GREY))
    (OUT / "logo-square.svg").write_text(stacked(CREAM, GREY, bg=INK, side=1000))
    (OUT / "icon.svg").write_text(icon(INK))
    print("klart")
