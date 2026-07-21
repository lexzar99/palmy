from __future__ import annotations

from pathlib import Path
import shutil
import zipfile

from PIL import Image, ImageDraw, ImageFont


ROOT = Path('/Users/jalle/testa')
LOGO = ROOT / 'Logotyp'
EXPORTS = LOGO / 'exports'
FONT_PATH = LOGO / 'Baloo2-VariableFont_wght.ttf'
NAVY = '#0A2340'
ORANGE = '#F04F1A'
CREAM = '#FEF7F0'


STANDARD_FILES = [
    'lockup-navy.png',
    'lockup-orange.png',
    'lockup-white.png',
    'logo-orange-smiley-2line-transparent.png',
    'logo-orange-smiley-only-transparent.png',
    'round-smiley-orange-on-cream.png',
    'social-square-viaeats-smiley-2line.png',
    'wordmark-viaeats-2line-navy.png',
    'wordmark-viaeats-2line-orange.png',
    'wordmark-viaeats-navy.png',
    'wordmark-viaeats-orange.png',
    'wordmark-viaeats-white.png',
]

ORANGE_COVER_FILES = [
    'lockup-cream.png',
    'lockup-navy.png',
    'lockup-white.png',
    'round-smiley-navy-on-cream.png',
    'smiley-cream-transparent.png',
    'smiley-navy-transparent.png',
    'smiley-white-transparent.png',
    'social-square-viaeats-smiley-2line-alt.png',
    'wordmark-viaeats-2line-cream.png',
    'wordmark-viaeats-2line-navy.png',
    'wordmark-viaeats-2line-white.png',
    'wordmark-viaeats-cream.png',
    'wordmark-viaeats-navy.png',
    'wordmark-viaeats-white.png',
]


def copy_package(name: str, files: list[str], note: str) -> Path:
    destination = LOGO / name
    destination.mkdir(parents=True, exist_ok=True)
    for filename in files:
        shutil.copy2(EXPORTS / filename, destination / filename)
    (destination / 'README.txt').write_text(note.strip() + '\n', encoding='utf-8')
    return destination


def horizontal_lockup(symbol_name: str, wordmark_name: str, destination: Path, compact: bool = False) -> None:
    canvas = Image.new('RGBA', (2400, 700), (0, 0, 0, 0))
    symbol = Image.open(symbol_name).convert('RGBA')
    symbol.thumbnail((520 if compact else 470, 520 if compact else 470), Image.Resampling.LANCZOS)
    wordmark = Image.open(wordmark_name).convert('RGBA')
    wordmark.thumbnail((1450 if compact else 1320, 330), Image.Resampling.LANCZOS)
    symbol_x = 80
    symbol_y = (canvas.height - symbol.height) // 2
    gap = 45 if compact else 110
    word_x = symbol_x + symbol.width + gap
    word_y = (canvas.height - wordmark.height) // 2
    canvas.alpha_composite(symbol, (symbol_x, symbol_y))
    canvas.alpha_composite(wordmark, (word_x, word_y))
    bbox = canvas.getbbox()
    canvas.crop((max(0, bbox[0] - 40), max(0, bbox[1] - 40), min(canvas.width, bbox[2] + 40), min(canvas.height, bbox[3] + 40))).save(destination, 'PNG', optimize=True)


def badge_lockup(badge_name: str, wordmark_name: str, destination: Path) -> None:
    canvas = Image.new('RGBA', (2400, 700), (0, 0, 0, 0))
    badge = Image.open(badge_name).convert('RGBA')
    badge.thumbnail((530, 530), Image.Resampling.LANCZOS)
    wordmark = Image.open(wordmark_name).convert('RGBA')
    wordmark.thumbnail((1350, 330), Image.Resampling.LANCZOS)
    canvas.alpha_composite(badge, (60, (700 - badge.height) // 2))
    canvas.alpha_composite(wordmark, (650, (700 - wordmark.height) // 2))
    bbox = canvas.getbbox()
    canvas.crop((max(0, bbox[0] - 35), max(0, bbox[1] - 35), min(canvas.width, bbox[2] + 35), min(canvas.height, bbox[3] + 35))).save(destination, 'PNG', optimize=True)


def build_horizontal_package() -> Path:
    destination = LOGO / 'viaeats-order-terminal-horizontal-lockups'
    destination.mkdir(parents=True, exist_ok=True)
    balanced = [
        ('01-symbol-white-wordmark-white-balanced.png', LOGO / 'sym-white.png', EXPORTS / 'wordmark-viaeats-white.png'),
        ('02-symbol-cream-wordmark-cream-balanced.png', LOGO / 'sym-cream.png', EXPORTS / 'wordmark-viaeats-cream.png'),
        ('03-symbol-navy-wordmark-navy-balanced.png', LOGO / 'sym-navy.png', EXPORTS / 'wordmark-viaeats-navy.png'),
    ]
    compact = [
        ('04-symbol-white-wordmark-white-compact.png', LOGO / 'sym-white.png', EXPORTS / 'wordmark-viaeats-white.png'),
        ('05-symbol-cream-wordmark-cream-compact.png', LOGO / 'sym-cream.png', EXPORTS / 'wordmark-viaeats-cream.png'),
        ('06-symbol-navy-wordmark-navy-compact.png', LOGO / 'sym-navy.png', EXPORTS / 'wordmark-viaeats-navy.png'),
    ]
    smileys = [
        ('07-smiley-white-wordmark-white.png', EXPORTS / 'smiley-white-transparent.png', EXPORTS / 'wordmark-viaeats-white.png'),
        ('08-smiley-cream-wordmark-cream.png', EXPORTS / 'smiley-cream-transparent.png', EXPORTS / 'wordmark-viaeats-cream.png'),
        ('09-smiley-navy-wordmark-navy.png', EXPORTS / 'smiley-navy-transparent.png', EXPORTS / 'wordmark-viaeats-navy.png'),
    ]
    for filename, symbol, wordmark in balanced:
        horizontal_lockup(str(symbol), str(wordmark), destination / filename)
    for filename, symbol, wordmark in compact:
        horizontal_lockup(str(symbol), str(wordmark), destination / filename, compact=True)
    for filename, symbol, wordmark in smileys:
        horizontal_lockup(str(symbol), str(wordmark), destination / filename, compact=True)

    badge_lockup(str(EXPORTS / 'round-smiley-cream-on-navy.png'), str(EXPORTS / 'wordmark-viaeats-navy.png'), destination / '10-round-cream-badge-wordmark-navy.png')
    badge_lockup(str(EXPORTS / 'round-smiley-navy-on-cream.png'), str(EXPORTS / 'wordmark-viaeats-white.png'), destination / '11-round-navy-badge-wordmark-white.png')
    badge_lockup(str(EXPORTS / 'round-smiley-navy-on-cream.png'), str(EXPORTS / 'wordmark-viaeats-cream.png'), destination / '12-round-navy-badge-wordmark-cream.png')

    for number, color in [(13, 'white'), (14, 'cream'), (15, 'navy')]:
        horizontal_lockup(
            str(LOGO / f'sym-{color}.png'),
            str(EXPORTS / f'wordmark-viaeats-2line-{color}.png'),
            destination / f'{number:02d}-symbol-{color}-wordmark-2line-{color}.png',
            compact=True,
        )

    (destination / 'README.txt').write_text(
        'ViaEats horisontella lockups för orderterminal, partnersidor och headers.\n'
        'PNG-filerna har transparent bakgrund. Välj färg efter underlaget och behåll friytan.\n',
        encoding='utf-8',
    )
    make_preview(destination)
    return destination


def make_preview(directory: Path) -> None:
    canvas = Image.new('RGB', (1800, 1200), ORANGE)
    picks = [
        directory / '01-symbol-white-wordmark-white-balanced.png',
        directory / '02-symbol-cream-wordmark-cream-balanced.png',
        directory / '11-round-navy-badge-wordmark-white.png',
    ]
    y = 90
    for path in picks:
        image = Image.open(path).convert('RGBA')
        image.thumbnail((1500, 280), Image.Resampling.LANCZOS)
        canvas.paste(image, ((1800 - image.width) // 2, y), image)
        y += 360
    canvas.save(directory / 'preview-on-orange-cover.jpg', 'JPEG', quality=92, optimize=True)


def zip_package(directory: Path) -> None:
    archive = directory.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for path in sorted(directory.rglob('*')):
            if path.is_file():
                bundle.write(path, directory.name / path.relative_to(directory))


def main() -> None:
    standard = copy_package(
        'viaeats-order-terminal-logos',
        STANDARD_FILES,
        'ViaEats logopaket för orderterminalen. PNG-filerna kommer från det centrala exports-biblioteket.',
    )
    orange_cover = copy_package(
        'viaeats-order-terminal-logos-orange-cover',
        ORANGE_COVER_FILES,
        'ViaEats logopaket för orange omslag och mörka/ljusa terminalytor. PNG med transparent bakgrund där filnamnet anger det.',
    )
    horizontal = build_horizontal_package()
    for package in (standard, orange_cover, horizontal):
        zip_package(package)
        print(f'created {package.name} and {package.name}.zip')


if __name__ == '__main__':
    main()
