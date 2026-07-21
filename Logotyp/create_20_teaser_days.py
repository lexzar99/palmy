from __future__ import annotations

from pathlib import Path
import shutil
import zipfile

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
EXPORTS = ROOT / 'exports'
OUT = EXPORTS / 'teaser-20-days-v2'
LEGACY_OUT = EXPORTS / 'teaser-20-days'
FONT_PATH = ROOT / 'Baloo2-VariableFont_wght.ttf'
NAVY = '#0A2340'
ORANGE = '#F04F1A'
CREAM = '#FEF7F0'


DAYS = [
    ('01-vad-stor-dig-mest', 'vad stör dig\nmest?', 'berätta en sak om matleverans'),
    ('02-lund-snart-ny-matapp', 'lund får snart\nen ny matapp.', 'vad måste bli bättre?'),
    ('03-snart-inte-annu', 'snart.\ninte ännu.', 'vi bygger med lund'),
    ('04-tre-tryck-sen-mat', 'tre tryck.\nsen mat.', 'mindre krångel på vägen'),
    ('05-poang-pa-maten', 'poäng på\nmaten.', 'beställningar ska ge något tillbaka'),
    ('06-lokal-pa-riktigt', 'lokal på\nriktigt.', 'mat och restauranger nära dig'),
    ('07-mindre-krangel-mer-mat', 'mindre krångel.\nmer mat.', 'så enkelt borde det vara'),
    ('08-deals-som-kanns', 'deals som\nkänns.', 'tydliga erbjudanden utan gissningar'),
    ('09-favoriter-nara-dig', 'favoriter\nnära dig.', 'lund först'),
    ('10-support-ska-svara', 'support ska\nsvara.', 'när du faktiskt behöver hjälp'),
    ('11-hungrig-snart-enklare', 'hungrig?\nsnart enklare.', 'färre steg till maten'),
    ('12-inga-gissningar', 'inga\ngissningar.', 'följ maten hela vägen'),
    ('13-lund-forst-sen-vidare', 'lund först.\nsen vidare.', 'vi börjar där vi känner staden'),
    ('14-battre-lunch-kvall', 'bättre lunch.\nbättre kväll.', 'samma enkla väg till maten'),
    ('15-vi-testar-ni-avgor', 'vi testar.\nni avgör.', 'byggt med feedback från lund'),
    ('16-maten-ar-pa-vag', 'maten är\npå väg.', 'och du ska kunna se det'),
    ('17-student-jobb-hemma', 'student. jobb.\nhemma.', 'mat för hela lunds vardag'),
    ('18-nytt-namn-i-lund', 'ett nytt namn\ni lund.', 'viaeats kommer snart'),
    ('19-farre-steg-fler-val', 'färre steg.\nfler val.', 'nästan dags'),
    ('20-dag-ett-kommer-snart', 'dag ett\nkommer snart.', 'följ viaeats i lund'),
]
THEMES = ['original', 'orange-alt', 'navy-alt', 'swap', 'navy', 'orange']


def brand_font(size: int, weight: str = 'ExtraBold') -> ImageFont.FreeTypeFont:
    result = ImageFont.truetype(str(FONT_PATH), size=size)
    try:
        result.set_variation_by_name(weight)
    except (AttributeError, OSError):
        pass
    return result


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int, start: int, minimum: int = 46) -> ImageFont.FreeTypeFont:
    for size in range(start, minimum - 1, -2):
        candidate = brand_font(size)
        box = draw.multiline_textbbox((0, 0), text, font=candidate, spacing=-5)
        if box[2] - box[0] <= max_width:
            return candidate
    return brand_font(minimum)


def make_day(day: int, slug: str, headline: str, body: str) -> Path:
    theme = THEMES[(day - 1) % len(THEMES)]
    canvas = Image.open(EXPORTS / f'background-pattern-{theme}-square.png').convert('RGBA').resize((1080, 1080), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(canvas)
    dark = theme in {'navy', 'navy-alt'}
    text_color = CREAM if dark else NAVY
    accent = ORANGE if dark else ORANGE

    draw.rounded_rectangle((70, 68, 248, 125), radius=28, fill=accent if dark else NAVY)
    draw.text((159, 98), f'DAG {day:02d}', font=brand_font(29), fill=NAVY if dark else CREAM, anchor='mm')

    mark_name = 'smiley-cream-transparent.png' if dark else 'smiley-orange-transparent.png'
    mark = Image.open(EXPORTS / mark_name).convert('RGBA')
    mark.thumbnail((300, 300), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, (710, 76))

    headline_font = fit_font(draw, headline, 820, 108)
    draw.multiline_text((70, 305), headline, font=headline_font, fill=text_color, spacing=-6)
    body_font = fit_font(draw, body, 760, 48, 36)
    draw.multiline_text((73, 695), body, font=body_font, fill=text_color, spacing=2)

    draw.text((72, 968), 'viaeats · lund', font=brand_font(38), fill=accent if dark else NAVY)
    destination = OUT / f'{slug}.png'
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert('RGB').save(destination, 'PNG', optimize=True)
    return destination


def make_contact_sheet(paths: list[Path], destination: Path, columns: int) -> None:
    thumb = 240
    gap = 20
    rows = (len(paths) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * thumb + (columns + 1) * gap, rows * thumb + (rows + 1) * gap), CREAM)
    for index, path in enumerate(paths):
        image = Image.open(path).convert('RGB').resize((thumb, thumb), Image.Resampling.LANCZOS)
        x = gap + (index % columns) * (thumb + gap)
        y = gap + (index // columns) * (thumb + gap)
        sheet.paste(image, (x, y))
    sheet.save(destination, 'PNG', optimize=True)


def write_plan() -> None:
    lines = ['# ViaEats · teaserplan för 20 dagar', '', 'En kvadratisk teaser per dag inför lanseringen i Lund.', '']
    for day, (slug, headline, body) in enumerate(DAYS, start=1):
        lines.append(f'- Dag {day:02d}: **{headline.replace(chr(10), " ")}** — {body} (`{slug}.png`)')
    (OUT / 'teaserplan-20-dagar.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')


def make_archives() -> None:
    if LEGACY_OUT.exists():
        shutil.rmtree(LEGACY_OUT)
    shutil.copytree(OUT, LEGACY_OUT)
    archive = ROOT / 'teaser-20-days-v2.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for path in sorted(OUT.rglob('*')):
            if path.is_file():
                bundle.write(path, Path(OUT.name) / path.relative_to(OUT))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    paths = [make_day(day, *post) for day, post in enumerate(DAYS, start=1)]
    write_plan()
    for start in range(0, 20, 5):
        make_contact_sheet(paths[start:start + 5], OUT / f'contact-sheet-{start + 1:02d}-{start + 5:02d}.png', columns=5)
    make_contact_sheet(paths, OUT / 'contact-sheet-20.png', columns=5)
    make_archives()
    print(f'created {len(paths)} teasers in {OUT}')


if __name__ == '__main__':
    main()
