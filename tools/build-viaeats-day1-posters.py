from pathlib import Path
import importlib.util

from PIL import Image


ROOT = Path('/Users/jalle/testa')
EXPORTS = ROOT / 'Logotyp' / 'exports'
GENERATOR = ROOT / 'tools' / 'build-viaeats-brand-assets.py'

spec = importlib.util.spec_from_file_location('viaeats_brand_generator', GENERATOR)
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


DAY1_SPECS = [
    ('01-listen', 'original', 'dag 1 · en fråga till lund', 'lund,\nkan vi börja\nom?', 'vad har fått dig att\ntappa lusten att beställa?', 'berätta utan namn.', generator.NAVY, generator.ORANGE, 'symbol-left'),
    ('02-what-went-wrong', 'navy', 'dag 1 · vi vill förstå', 'det borde inte\nvara så svårt.', 'vad vill du aldrig\nuppleva igen?', 'skriv en sak.', generator.CREAM, generator.ORANGE, 'symbol-left'),
    ('03-redesign', 'orange', 'dag 1 · hjälp oss bygga rätt', 'om du fick\nändra en sak…', 'vad skulle göra din\nnästa beställning bättre?', 'vi lyssnar.', generator.NAVY, generator.ORANGE, 'symbol-left'),
    ('04-simple', 'swap', 'dag 1 · lund, hjälp oss', 'maten är viktig.\nupplevelsen också.', 'vad saknas när du\nbeställer hemifrån?', 'säg det som det är.', generator.NAVY, generator.ORANGE, 'symbol-left'),
    ('05-real-question', 'navy-alt', 'dag 1 · ingen pitch', 'ingen pitch.\nbara en fråga.', 'vad har fått dig att\nsluta beställa mat\nhemifrån?', 'berätta utan namn.', generator.CREAM, generator.ORANGE, 'symbol-left'),
]


def main() -> None:
    mark = Image.open(EXPORTS / 'smiley-orange-transparent.png').convert('RGBA')
    for slug, key, day_label, headline, body, cta, text_color, accent, layout in DAY1_SPECS:
        for format_name, size in [('square', (1080, 1080)), ('portrait', (1080, 1350))]:
            background = Image.open(EXPORTS / f'text-safe-pattern-{key}-{format_name}.png').convert('RGBA')
            generator.make_campaign_poster(
                background,
                size,
                f'facebook-day01-{slug}-{format_name}.png',
                day_label,
                headline,
                body,
                cta,
                text_color,
                accent,
                mark,
                layout,
            )
            print(f'created facebook-day01-{slug}-{format_name}.png')


if __name__ == '__main__':
    main()
