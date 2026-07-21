from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
EXPORTS = ROOT / 'exports'
OUT = EXPORTS / 'teaser-no-frame'
FONT_PATH = ROOT / 'Baloo2-VariableFont_wght.ttf'
NAVY = '#0A2340'
ORANGE = '#F04F1A'
CREAM = '#FEF7F0'


POSTS = [
    ('01-vad-stor-dig-mest', 'original', 'LUND', 'vad stör dig\nmest?', 'när du beställer mat', 'Berätta en sak'),
    ('02-lund-nytt-satt', 'orange-alt', 'LUND', 'snart\nny matapp.', 'Vad måste\nbli bättre?', 'Skriv en sak'),
    ('03-snart-inte-annu', 'navy-alt', 'LUND', 'snart.\ninte ännu.', 'vi bygger något\nför maten nära dig', 'Följ resan'),
    ('04-ska-kannas-enkelt', 'swap', 'BESTÄLLA', 'ska kännas\nenkelt.', 'från första trycket\ntill dörren', 'Vad saknas?'),
    ('05-samlar-samsta-historier', 'navy', 'LUND', 'vi samlar\nde sämsta\nhistorierna.', 'utan namn.\nför att bygga bättre.', 'Berätta din'),
]


def brand_font(size: int, weight: str = 'ExtraBold') -> ImageFont.FreeTypeFont:
    result = ImageFont.truetype(str(FONT_PATH), size=size)
    try:
        result.set_variation_by_name(weight)
    except (AttributeError, OSError):
        pass
    return result


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int, start: int, minimum: int = 42) -> ImageFont.FreeTypeFont:
    for size in range(start, minimum - 1, -2):
        candidate = brand_font(size)
        box = draw.multiline_textbbox((0, 0), text, font=candidate, spacing=-4)
        if box[2] - box[0] <= max_width:
            return candidate
    return brand_font(minimum)


def make_post(slug: str, theme: str, eyebrow: str, headline: str, body: str, cta: str) -> Path:
    source = Image.open(EXPORTS / f'background-pattern-{theme}-square.png').convert('RGBA')
    canvas = source.resize((1080, 1080), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(canvas)

    dark_theme = theme in {'navy', 'navy-alt'}
    headline_color = CREAM if dark_theme else NAVY
    body_color = CREAM if theme in {'navy', 'navy-alt', 'orange-alt'} else NAVY
    pill_color = ORANGE if dark_theme else NAVY
    pill_text = NAVY if dark_theme else CREAM

    mark_name = 'smiley-cream-transparent.png' if theme in {'navy', 'navy-alt', 'orange-alt'} else 'smiley-orange-transparent.png'
    mark = Image.open(EXPORTS / mark_name).convert('RGBA')
    mark.thumbnail((345, 345), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, (665, 55))

    draw.text((78, 170), eyebrow, font=brand_font(112), fill=headline_color)
    headline_font = fit_font(draw, headline, 720, 90)
    draw.multiline_text((78, 330), headline, font=headline_font, fill=headline_color, spacing=-5)

    body_y = 650 if headline.count('\n') < 2 else 700
    body_font = fit_font(draw, body, 650, 62, 44)
    draw.multiline_text((78, body_y), body, font=body_font, fill=body_color, spacing=2)

    pill = (78, 890, 590, 970)
    draw.rounded_rectangle(pill, radius=40, fill=pill_color)
    draw.text(((pill[0] + pill[2]) // 2, (pill[1] + pill[3]) // 2 + 2), cta, font=brand_font(36), fill=pill_text, anchor='mm')

    destination = OUT / f'fb-teaser-{slug}.png'
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert('RGB').save(destination, 'PNG', optimize=True)
    return destination


def contact_sheet(paths: list[Path]) -> None:
    thumb = 300
    gap = 24
    sheet = Image.new('RGB', (thumb * len(paths) + gap * (len(paths) + 1), thumb + 2 * gap), CREAM)
    for index, path in enumerate(paths):
        image = Image.open(path).convert('RGB').resize((thumb, thumb), Image.Resampling.LANCZOS)
        sheet.paste(image, (gap + index * (thumb + gap), gap))
    sheet.save(OUT / 'fb-teaser-contact-sheet-5.png', 'PNG', optimize=True)


def main() -> None:
    paths = [make_post(*post) for post in POSTS]
    contact_sheet(paths)
    for path in paths:
        print(f'created {path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
