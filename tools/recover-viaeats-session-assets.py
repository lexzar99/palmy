from __future__ import annotations

import base64
import json
from pathlib import Path

from PIL import Image


ROOT = Path('/Users/jalle/testa')


def recover_image(session: Path, line_number: int, image_index: int, output: Path) -> None:
    """Recover an image embedded in a historical Codex tool result."""
    with session.open('r', encoding='utf-8', errors='replace') as stream:
        for current_line, raw in enumerate(stream, start=1):
            if current_line != line_number:
                continue
            payload = json.loads(raw)['payload']
            blocks = payload.get('output') or payload.get('content') or []
            images = [block for block in blocks if block.get('type') in {'input_image', 'image_url'}]
            data_url = images[image_index]['image_url']
            _, encoded = data_url.split(',', 1)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(base64.b64decode(encoded))
            return
    raise RuntimeError(f'No line {line_number} in {session}')


def main() -> None:
    recover_image(
        Path('/Users/jalle/.codex/sessions/2026/07/15/rollout-2026-07-15T19-43-17-019f66e0-3608-71c1-9a3e-23a74dcdfe4f.jsonl'),
        6493,
        3,
        ROOT / 'Logotyp/exports/teaser-no-frame/fb-teaser-02-lund-nytt-satt.png',
    )
    teaser_dir = ROOT / 'Logotyp/exports/teaser-no-frame'
    paths = sorted(teaser_dir.glob('fb-teaser-[0-9][0-9]-*.png'))
    thumb, gap = 300, 24
    sheet = Image.new('RGB', (thumb * len(paths) + gap * (len(paths) + 1), thumb + 2 * gap), '#FEF7F0')
    for index, path in enumerate(paths):
        image = Image.open(path).convert('RGB').resize((thumb, thumb), Image.Resampling.LANCZOS)
        sheet.paste(image, (gap + index * (thumb + gap), gap))
    sheet.save(teaser_dir / 'fb-teaser-contact-sheet-5.png', 'PNG', optimize=True)


if __name__ == '__main__':
    main()
