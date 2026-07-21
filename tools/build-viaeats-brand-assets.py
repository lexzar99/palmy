from __future__ import annotations

from pathlib import Path
import math
import shutil

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path('/Users/jalle/testa')
LOGO = ROOT / 'Logotyp'
EXPORTS = LOGO / 'exports'
ASSET_SOURCE = Path('/Users/jalle/Downloads/ChatGPT Image Jul 13, 2026, 07_12_42 AM.png')
FONT_PATH = LOGO / 'Baloo2-VariableFont_wght.ttf'
BG_SQUARE = Path('/Users/jalle/.codex/generated_images/019f5963-a7bb-73d2-b3d8-833ddde2e652/exec-fd61ce00-5f63-4440-b2bf-afb013911d49.png')
BG_SQUARE_ALT = Path('/Users/jalle/.codex/generated_images/019f5963-a7bb-73d2-b3d8-833ddde2e652/exec-1bd46c4c-80e9-42c1-8e84-15bac17aba50.png')
BG_WIDE = Path('/Users/jalle/.codex/generated_images/019f5963-a7bb-73d2-b3d8-833ddde2e652/exec-93f91db8-7d53-4495-83e0-b63716bb6039.png')

ORANGE = '#F04F1A'
NAVY = '#0A2340'
CREAM = '#FEF7F0'
SLATE = '#5A6472'
ORANGE_LIGHT = '#FFA24D'


def font(size: int, variation: str = 'ExtraBold') -> ImageFont.FreeTypeFont:
    face = ImageFont.truetype(str(FONT_PATH), size)
    # Baloo 2 is a variable font. Select the same heavy cut every time so the
    # wordmark keeps its weight and geometry across every exported size.
    face.set_variation_by_name(variation)
    return face


def rounded_canvas(size: tuple[int, int], color: str, radius: int = 0) -> Image.Image:
    image = Image.new('RGBA', size, color)
    if radius <= 0:
        return image
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    image.putalpha(mask)
    return image


def enclosed_holes(mask: np.ndarray) -> np.ndarray:
    """Return non-mask regions enclosed by the exact red silhouette."""
    non_mask = ~mask
    outside = np.zeros(mask.shape, dtype=bool)
    stack = []
    height, width = mask.shape
    for x in range(width):
        if non_mask[0, x]: stack.append((0, x))
        if non_mask[height - 1, x]: stack.append((height - 1, x))
    for y in range(height):
        if non_mask[y, 0]: stack.append((y, 0))
        if non_mask[y, width - 1]: stack.append((y, width - 1))
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= height or x < 0 or x >= width or outside[y, x] or not non_mask[y, x]:
            continue
        outside[y, x] = True
        stack.extend(((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)))
    return non_mask & ~outside


def extract_symbol(include_delivery: bool = True) -> Image.Image:
    """Extract the exact red mark + white smile/car/bag from the supplied checkerboard PNG."""
    source = Image.open(ASSET_SOURCE).convert('RGB')
    data = np.asarray(source)
    red = (data[:, :, 0] > 150) & (data[:, :, 0] > data[:, :, 1] * 1.35) & (data[:, :, 0] > data[:, :, 2] * 1.35)

    # The supplied file has a printed checkerboard outside the mark. The white
    # smile and delivery pictograms are kept only in the lower interior band,
    # so the checkerboard and bite marks cannot become opaque.
    yy, xx = np.mgrid[0:data.shape[0], 0:data.shape[1]]
    circle = ((xx - 640) / 480) ** 2 + ((yy - 610) / 480) ** 2 <= 1.02
    feature_band = (
        (yy > 790) & (yy < 1025)
        if include_delivery
        else (yy > 790) & (yy < 920)
    )
    white_features = (
        (data.min(axis=2) > 220)
        & circle
        & feature_band
        & (xx > 430)
        & (xx < 850)
    )
    # When the delivery pictograms are removed, their white pixels must become
    # orange body pixels rather than transparent holes in the circle.
    delivery_holes = enclosed_holes(red) & (yy >= 920) & (yy < 1110)
    visible = red | white_features | (delivery_holes if not include_delivery else False)

    # Tighten the crop to the actual mark while keeping a small safety margin.
    ys, xs = np.where(visible)
    left, top, right, bottom = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    pad = 12
    left, top = max(0, left - pad), max(0, top - pad)
    right, bottom = min(source.width, right + pad), min(source.height, bottom + pad)
    cropped = source.crop((left, top, right, bottom))
    crop_visible = Image.fromarray((visible[top:bottom, left:right] * 255).astype('uint8'), 'L')
    crop_features = white_features[top:bottom, left:right]
    crop_visible = crop_visible.filter(ImageFilter.GaussianBlur(0.7))

    rgba = Image.new('RGBA', cropped.size, (0, 0, 0, 0))
    pixels = rgba.load()
    orange = tuple(int(ORANGE[i:i + 2], 16) for i in (1, 3, 5))
    for y in range(cropped.height):
        for x in range(cropped.width):
            if not crop_visible.getpixel((x, y)):
                continue
            r, g, b = cropped.getpixel((x, y))
            is_red = r > 150 and r > g * 1.35 and r > b * 1.35
            fill = (255, 255, 255) if crop_features[y, x] else orange
            pixels[x, y] = (*fill, crop_visible.getpixel((x, y)))
    return rgba


def recolor_symbol(base: Image.Image, body: str, detail: str = CREAM, width: int = 1088) -> Image.Image:
    ratio = base.height / base.width
    height = round(width * ratio)
    resized = base.resize((width, height), Image.Resampling.LANCZOS)
    array = np.asarray(resized).copy()
    body_rgb = tuple(int(body[i:i + 2], 16) for i in (1, 3, 5))
    detail_rgb = tuple(int(detail[i:i + 2], 16) for i in (1, 3, 5))
    alpha = array[:, :, 3]
    visible = alpha > 0
    # The extracted mark has white details and a colored body. Recolor based on
    # brightness, preserving the exact silhouette and proportions.
    bright = (array[:, :, 0] > 210) & (array[:, :, 1] > 210) & (array[:, :, 2] > 210)
    body_mask = visible & ~bright
    detail_mask = visible & bright
    array[body_mask, :3] = body_rgb
    array[detail_mask, :3] = detail_rgb
    return Image.fromarray(array, 'RGBA')


def paste_center(canvas: Image.Image, layer: Image.Image, center: tuple[int, int], scale: float = 1.0) -> None:
    if scale != 1.0:
        layer = layer.resize((round(layer.width * scale), round(layer.height * scale)), Image.Resampling.LANCZOS)
    x = round(center[0] - layer.width / 2)
    y = round(center[1] - layer.height / 2)
    canvas.alpha_composite(layer, (x, y))


def draw_wordmark(canvas: Image.Image, xy: tuple[int, int], size: int, color: str = NAVY, anchor: str = 'mm') -> None:
    draw = ImageDraw.Draw(canvas)
    draw.text(xy, 'viaeats', font=font(size), fill=color, anchor=anchor)


def draw_wordmark_inside(symbol: Image.Image, size: int = 195, color: str = CREAM, y_ratio: float = 0.45) -> Image.Image:
    """Place the real Baloo 2 wordmark inside the orange circle."""
    result = symbol.copy()
    draw_wordmark(result, (result.width // 2, round(result.height * y_ratio)), size, color)
    return result


def draw_wordmark_inside_two_lines(symbol: Image.Image, size: int = 220, color: str = CREAM) -> Image.Image:
    """Place the exact lower-case name on two optically centered Baloo 2 lines."""
    result = symbol.copy()
    draw = ImageDraw.Draw(result)
    center_x = result.width // 2
    draw.text((center_x, round(result.height * 0.34)), 'via', font=font(size), fill=color, anchor='mm')
    draw.text((center_x, round(result.height * 0.52)), 'eats', font=font(size), fill=color, anchor='mm')
    return result


def make_wordmark_only(text_color: str, two_lines: bool = False) -> Image.Image:
    """Transparent wordmark asset for placing on photos or custom designs."""
    size = (1600, 900 if two_lines else 520)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    if two_lines:
        draw.text((size[0] // 2, 300), 'via', font=font(250), fill=text_color, anchor='mm')
        draw.text((size[0] // 2, 610), 'eats', font=font(250), fill=text_color, anchor='mm')
    else:
        draw.text((size[0] // 2, size[1] // 2), 'viaeats', font=font(240), fill=text_color, anchor='mm')
    return canvas


def make_cover_icon(background: Image.Image, mark: Image.Image, name: str, mark_scale: float = 0.60) -> None:
    """Create a rounded app icon using one of the beige mixed-color plates."""
    icon = background.resize((1024, 1024), Image.Resampling.LANCZOS).convert('RGBA')
    paste_center(icon, mark, (512, 512), mark_scale)
    icon.putalpha(Image.new('L', icon.size, 255))
    mask = Image.new('L', icon.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 1023, 1023), radius=190, fill=255)
    icon.putalpha(mask)
    save(icon, name)


def make_social_badge(background: Image.Image, mark: Image.Image, size: tuple[int, int], name: str, mark_scale: float = 0.42) -> None:
    canvas = background.resize(size, Image.Resampling.LANCZOS).convert('RGBA')
    paste_center(canvas, mark, (size[0] // 2, size[1] // 2), mark_scale)
    save(canvas, name)


def make_theme_background(size: tuple[int, int], base: str, style: str, accents: tuple[str, str, str]) -> Image.Image:
    """Create a clean cover plate from the fixed viaeats color system."""
    width, height = size
    canvas = Image.new('RGBA', size, base)
    draw = ImageDraw.Draw(canvas)
    a, b, c = accents
    if style == 'corners':
        draw.ellipse((-0.30 * width, -0.42 * height, 0.36 * width, 0.34 * height), fill=a)
        draw.ellipse((0.73 * width, -0.22 * height, 1.30 * width, 0.34 * height), fill=b)
        draw.ellipse((-0.25 * width, 0.76 * height, 0.34 * width, 1.34 * height), fill=c)
        draw.ellipse((0.74 * width, 0.73 * height, 1.30 * width, 1.32 * height), fill=a)
        line_width = max(5, round(min(width, height) * 0.012))
        draw.arc((-0.14 * width, -0.17 * height, 0.46 * width, 0.43 * height), 10, 170, fill=b, width=line_width)
        draw.arc((0.60 * width, 0.62 * height, 1.16 * width, 1.18 * height), 190, 350, fill=b, width=line_width)
    else:
        band = max(28, round(min(width, height) * 0.085))
        draw.polygon([(-0.15 * width, 0.10 * height), (0.05 * width, -0.08 * height), (0.43 * width, 1.08 * height), (0.23 * width, 1.14 * height)], fill=a)
        draw.polygon([(0.05 * width, -0.08 * height), (0.13 * width, -0.08 * height), (0.51 * width, 1.08 * height), (0.43 * width, 1.08 * height)], fill=b)
        draw.polygon([(0.77 * width, -0.10 * height), (1.15 * width, 0.18 * height), (0.83 * width, 1.14 * height), (0.60 * width, 1.08 * height)], fill=c)
        draw.polygon([(1.15 * width, 0.18 * height), (1.22 * width, 0.24 * height), (0.90 * width, 1.14 * height), (0.83 * width, 1.14 * height)], fill=b)
        draw.arc((-0.34 * width, 0.62 * height, 0.34 * width, 1.30 * height), 265, 55, fill=b, width=band)
        draw.arc((0.66 * width, -0.30 * height, 1.34 * width, 0.38 * height), 85, 235, fill=a, width=band)
    return canvas


def make_theme_cover(background: Image.Image, mark: Image.Image, size: tuple[int, int], name: str, mark_scale: float) -> None:
    canvas = background.resize(size, Image.Resampling.LANCZOS).convert('RGBA')
    paste_center(canvas, mark, (size[0] // 2, size[1] // 2), mark_scale)
    save(canvas, name)


def make_text_safe_background(background: Image.Image, size: tuple[int, int], name: str, panel: str, accent: str) -> None:
    """Create an empty patterned background with a deliberate copy-safe panel."""
    canvas = background.resize(size, Image.Resampling.LANCZOS).convert('RGBA')
    width, height = size
    if height > width * 1.35:
        box = (round(width * 0.10), round(height * 0.16), round(width * 0.90), round(height * 0.84))
    elif width > height * 1.35:
        box = (round(width * 0.13), round(height * 0.20), round(width * 0.87), round(height * 0.80))
    else:
        box = (round(width * 0.10), round(height * 0.10), round(width * 0.90), round(height * 0.90))
    panel_rgb = tuple(int(panel[i:i + 2], 16) for i in (1, 3, 5))
    accent_rgb = tuple(int(accent[i:i + 2], 16) for i in (1, 3, 5))
    overlay = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    radius = round(min(width, height) * 0.045)
    draw.rounded_rectangle(box, radius=radius, fill=(*panel_rgb, 238), outline=(*accent_rgb, 175), width=max(3, round(min(width, height) * 0.004)))
    canvas.alpha_composite(overlay)
    save(canvas, name)


def recolor_pattern(source: Image.Image, main: str, navy: str, orange: str, shadow: str) -> Image.Image:
    """Keep the original soft pattern and texture while swapping its palette."""
    array = np.asarray(source.convert('RGB')).astype(np.float32)
    red, green, blue = array[:, :, 0], array[:, :, 1], array[:, :, 2]
    dark_mask = (red < 120) & (green < 130) & (blue < 160)
    orange_mask = (~dark_mask) & (red > 140) & (green < 160) & (blue < 135)
    light_mask = ~(dark_mask | orange_mask)
    light_value = array.mean(axis=2)
    shadow_mask = light_mask & (light_value < 238.5)
    main_mask = light_mask & ~shadow_mask
    result = array.copy()

    def tint(mask: np.ndarray, source_color: str, target_color: str) -> None:
        src = np.array(tuple(int(source_color[i:i + 2], 16) for i in (1, 3, 5)), dtype=np.float32)
        target = np.array(tuple(int(target_color[i:i + 2], 16) for i in (1, 3, 5)), dtype=np.float32)
        variation = (array - src) * 0.08
        result[mask] = np.clip(target + variation[mask], 0, 255)

    tint(dark_mask, NAVY, navy)
    tint(orange_mask, ORANGE, orange)
    tint(shadow_mask, '#F5E6D2', shadow)
    tint(main_mask, CREAM, main)
    return Image.fromarray(result.astype('uint8'), 'RGB').convert('RGBA')


def draw_quote(canvas: Image.Image, text: str, xy: tuple[int, int], size: int, color: str) -> None:
    ImageDraw.Draw(canvas).multiline_text(
        xy,
        text,
        font=font(size),
        fill=color,
        anchor='mm',
        align='center',
        spacing=round(size * 0.04),
    )


def make_quote_cover(background: Image.Image, mark: Image.Image, size: tuple[int, int], name: str, quote: str, text_color: str, mark_scale: float = 0.36) -> None:
    """Create a wide campaign cover with a local Baloo 2 slogan."""
    canvas = background.resize(size, Image.Resampling.LANCZOS).convert('RGBA')
    paste_center(canvas, mark, (round(size[0] * 0.28), round(size[1] * 0.50)), mark_scale)
    draw_quote(canvas, quote, (round(size[0] * 0.72), round(size[1] * 0.50)), max(52, round(size[0] * 0.045)), text_color)
    save(canvas, name)


def fit_text(draw: ImageDraw.ImageDraw, text: str, box: tuple[int, int, int, int], max_size: int, min_size: int, color: str, align: str = 'left', spacing_factor: float = 0.10) -> tuple[ImageFont.FreeTypeFont, tuple[int, int, int, int]]:
    """Fit Baloo 2 text into a box and fail loudly if it cannot fit."""
    left, top, right, bottom = box
    for size in range(max_size, min_size - 1, -2):
        face = font(size)
        spacing = round(size * spacing_factor)
        bbox = draw.multiline_textbbox((0, 0), text, font=face, spacing=spacing, align=align)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        if text_width <= right - left and text_height <= bottom - top:
            if align == 'center':
                x = left + ((right - left) - text_width) // 2 - bbox[0]
            else:
                x = left - bbox[0]
            y = top + ((bottom - top) - text_height) // 2 - bbox[1]
            draw.multiline_text((x, y), text, font=face, fill=color, spacing=spacing, align=align)
            placed = (x + bbox[0], y + bbox[1], x + bbox[2], y + bbox[3])
            if placed[0] < left or placed[1] < top or placed[2] > right or placed[3] > bottom:
                raise ValueError(f'Text escaped its safe box: {text!r}')
            return face, placed
    raise ValueError(f'Baloo 2 text does not fit safe box: {text!r}')


def make_campaign_poster(background: Image.Image, size: tuple[int, int], name: str, day_label: str, headline: str, body: str, cta: str, text_color: str, accent: str, mark: Image.Image, layout: str = 'left') -> None:
    """Create a poster with measured Baloo 2 text and no wordmark copy."""
    canvas = background.resize(size, Image.Resampling.LANCZOS).convert('RGBA')
    width, height = size
    draw = ImageDraw.Draw(canvas)
    panel = (round(width * 0.14), round(height * 0.16), round(width * 0.86), round(height * 0.84))
    x0, y0, x1, y1 = panel
    accent_rgb = tuple(int(accent[i:i + 2], 16) for i in (1, 3, 5))
    label_box = (x0 + round(width * 0.04), y0 + round(height * 0.035), x1 - round(width * 0.04), y0 + round(height * 0.12))
    text_left = x0 + round(width * 0.26)
    headline_box = (text_left, y0 + round(height * 0.16), x1 - round(width * 0.05), y0 + round(height * 0.45))
    body_box = (text_left, y0 + round(height * 0.48), x1 - round(width * 0.05), y0 + round(height * 0.69))
    cta_box = (text_left, y1 - round(height * 0.12), x1 - round(width * 0.05), y1 - round(height * 0.035))
    fit_text(draw, day_label, label_box, max(24, round(width * 0.028)), max(18, round(width * 0.018)), accent, spacing_factor=0)

    if layout == 'symbol-left':
        # The mark is a visual signpost only: no via/eats wordmark is included.
        paste_center(canvas, mark, (x0 + round(width * 0.14), y0 + round(height * 0.44)), 0.24 if width >= 1200 else 0.28)
        fit_text(draw, headline, headline_box, max(48, round(width * 0.062)), max(30, round(width * 0.030)), text_color, spacing_factor=0.04)
        fit_text(draw, body, body_box, max(31, round(width * 0.034)), max(23, round(width * 0.024)), text_color, spacing_factor=0.12)
        fit_text(draw, cta, cta_box, max(29, round(width * 0.031)), max(22, round(width * 0.022)), accent, spacing_factor=0)
    elif layout == 'center':
        anchor_x = (x0 + x1) // 2
        draw.multiline_text((anchor_x, y0 + round(height * 0.15)), headline, font=font(headline_size), fill=text_color, anchor='ma', align='center', spacing=round(headline_size * 0.04))
        draw.multiline_text((anchor_x, y0 + round(height * 0.43)), body, font=font(body_size), fill=text_color, anchor='ma', align='center', spacing=round(body_size * 0.12))
        cta_box = (x0 + round(width * 0.12), y1 - round(height * 0.13), x1 - round(width * 0.12), y1 - round(height * 0.055))
        draw.rounded_rectangle(cta_box, radius=round(height * 0.035), fill=accent)
        draw.text(((cta_box[0] + cta_box[2]) // 2, (cta_box[1] + cta_box[3]) // 2), cta, font=font(cta_size), fill=text_color, anchor='mm')
    elif layout == 'question':
        draw.text((x1 - round(width * 0.02), y0 + round(height * 0.03)), '?', font=font(round(width * 0.30)), fill=accent, anchor='ra')
        draw.multiline_text((x0 + round(width * 0.03), y0 + round(height * 0.12)), headline, font=font(headline_size), fill=text_color, anchor='la', align='left', spacing=round(headline_size * 0.04))
        draw.multiline_text((x0 + round(width * 0.03), y0 + round(height * 0.48)), body, font=font(body_size), fill=text_color, anchor='la', align='left', spacing=round(body_size * 0.12))
        draw.text((x0 + round(width * 0.03), y1 - round(height * 0.065)), cta, font=font(cta_size), fill=accent, anchor='ls')
    else:
        draw.multiline_text((x0 + round(width * 0.04), y0 + round(height * 0.12)), headline, font=font(headline_size), fill=text_color, anchor='la', align='left', spacing=round(headline_size * 0.04))
        draw.multiline_text((x0 + round(width * 0.04), y0 + round(height * 0.48)), body, font=font(body_size), fill=text_color, anchor='la', align='left', spacing=round(body_size * 0.12))
        draw.text((x0 + round(width * 0.04), y1 - round(height * 0.065)), cta, font=font(cta_size), fill=accent, anchor='ls')

    save(canvas, name)


def save(image: Image.Image, name: str) -> None:
    image.convert('RGBA').save(EXPORTS / name, 'PNG', optimize=True)


def build() -> None:
    EXPORTS.mkdir(parents=True, exist_ok=True)
    # Remove superseded exports so the download folder cannot mix old layouts
    # with the curated smiley-only and two-line asset families.
    stale_exports = [
        'app-icon-beige.png', 'app-icon-orange.png', 'app-icon-navy.png', 'app-icon-beige-wordmark.png',
        'app-icon-cover-smiley-name.png', 'app-icon-cover-smiley-name-alt.png', 'app-icon-cover-smiley-name-soft.png',
        'app-icon-beige-smiley-name.png', 'app-icon-navy-smiley-name.png', 'app-icon-orange-smiley-name.png',
        'logo-orange-inmark-smiley-only.png',
        'social-square-viaeats-smiley.png', 'social-square-viaeats-smiley-alt.png',
        'social-portrait-viaeats-smiley.png', 'social-wide-viaeats-smiley.png',
        'social-square-logo.png', 'social-portrait-logo.png', 'social-story-logo.png', 'social-wide-cover.png',
        'cover-facebook.png', 'cover-linkedin.png', 'cover-x.png',
        # Superseded geometric/ribbon family. The current family is made only
        # from the original soft organic pattern with a changed palette.
        'background-navy-corners.png', 'background-navy-ribbons.png',
        'background-orange-corners.png', 'background-orange-ribbons.png',
        'background-cream-corners.png', 'background-cream-ribbons.png',
    ]
    stale_exports.extend(
        f'{family}-{variant}-{format_name}.png'
        for family in ('cover', 'cover-clean')
        for variant in ('navy-corners', 'navy-ribbons', 'orange-corners', 'orange-ribbons', 'cream-corners', 'cream-ribbons')
        for format_name in ('wide', 'square', 'portrait')
    )
    for name in stale_exports:
        (EXPORTS / name).unlink(missing_ok=True)
    base = extract_symbol(include_delivery=True)
    base_smiley_only = extract_symbol(include_delivery=False)
    symbols = {
        'orange': recolor_symbol(base, ORANGE, CREAM),
        'navy': recolor_symbol(base, NAVY, CREAM),
        'cream': recolor_symbol(base, CREAM, ORANGE),
        'white': recolor_symbol(base, '#FFFFFF', ORANGE),
    }
    smiley_symbols = {
        'orange': recolor_symbol(base_smiley_only, ORANGE, CREAM),
        'navy': recolor_symbol(base_smiley_only, NAVY, CREAM),
        'cream': recolor_symbol(base_smiley_only, CREAM, ORANGE),
        'white': recolor_symbol(base_smiley_only, '#FFFFFF', ORANGE),
    }

    # Canonical symbols keep the import paths used by the web/admin app stable.
    for name, image in symbols.items():
        image.save(LOGO / f'sym-{name}.png', 'PNG', optimize=True)

    # Orange in-mark variants: the name is always rendered locally in Baloo 2.
    inmark_smiley_two_line = draw_wordmark_inside_two_lines(smiley_symbols['orange'])
    save(inmark_smiley_two_line, 'logo-orange-inmark-smiley-2line.png')
    save(smiley_symbols['orange'], 'logo-orange-smiley-only-transparent.png')
    save(inmark_smiley_two_line, 'logo-orange-smiley-2line-transparent.png')
    for name, color in [('cream', CREAM), ('navy', NAVY), ('orange', ORANGE), ('white', '#FFFFFF')]:
        save(make_wordmark_only(color), f'wordmark-viaeats-{name}.png')
        save(make_wordmark_only(color, two_lines=True), f'wordmark-viaeats-2line-{name}.png')

    # Transparent smiley-only masters in every brand color. These contain the
    # exact round mark with bite and smile, never the car or bag.
    for name, image in smiley_symbols.items():
        save(image, f'smiley-{name}-transparent.png')

    # Round marks on contrasting solid canvases for product, partner and print.
    for name, background, mark in [
        ('round-smiley-orange-on-cream.png', CREAM, smiley_symbols['orange']),
        ('round-smiley-orange-on-navy.png', NAVY, smiley_symbols['orange']),
        ('round-smiley-cream-on-orange.png', ORANGE, smiley_symbols['cream']),
        ('round-smiley-cream-on-navy.png', NAVY, smiley_symbols['cream']),
        ('round-smiley-navy-on-cream.png', CREAM, smiley_symbols['navy']),
        ('round-smiley-white-on-navy.png', NAVY, smiley_symbols['white']),
    ]:
        plate = rounded_canvas((1024, 1024), background, 190)
        paste_center(plate, mark, (512, 512), 0.78)
        save(plate, name)

    # Full lockups: exact extracted mark plus real Baloo 2 wordmark, never AI text.
    for name, symbol in symbols.items():
        lock = rounded_canvas((1600, 1100), CREAM, 100)
        body = NAVY if name in {'orange', 'cream'} else CREAM
        if name == 'navy':
            lock = rounded_canvas((1600, 1100), NAVY, 100)
        elif name == 'white':
            lock = rounded_canvas((1600, 1100), NAVY, 100)
        paste_center(lock, symbol, (800, 390), 0.34)
        draw_wordmark(lock, (800, 835), 190, body)
        save(lock, f'lockup-{name}.png')

    # Compact partner/header master referenced by the HTML library and guide.
    horizontal = rounded_canvas((2000, 720), CREAM, 80)
    paste_center(horizontal, symbols['orange'], (380, 360), 0.28)
    draw_wordmark(horizontal, (1180, 325), 190, NAVY)
    ImageDraw.Draw(horizontal).text(
        (1180, 475),
        'Maten du älskar, hem till dörren.',
        font=font(44),
        fill=SLATE,
        anchor='mm',
    )
    save(horizontal, 'lockup-horizontal-beige.png')

    # Keep the user-provided original pattern as the canonical source. Do not
    # overwrite it with an alternate generated background on every build.
    source_square = EXPORTS / 'background-square-abstract.png'
    if not source_square.exists() and BG_SQUARE.exists(): shutil.copy2(BG_SQUARE, source_square)
    if BG_SQUARE_ALT.exists(): shutil.copy2(BG_SQUARE_ALT, EXPORTS / 'background-square-abstract-alt.png')
    if BG_WIDE.exists(): shutil.copy2(BG_WIDE, EXPORTS / 'background-wide-abstract.png')

    # Social and marketing formats. The logo remains the exact local master.
    square_bg = Image.open(source_square).convert('RGBA') if source_square.exists() else rounded_canvas((1080, 1080), CREAM)
    square_bg_alt = Image.open(EXPORTS / 'background-square-abstract-alt.png').convert('RGBA') if (EXPORTS / 'background-square-abstract-alt.png').exists() else square_bg
    wide_bg = Image.open(EXPORTS / 'background-wide-abstract.png').convert('RGBA') if (EXPORTS / 'background-wide-abstract.png').exists() else rounded_canvas((1980, 1080), CREAM)

    # Reuse the original soft organic pattern exactly. Only the palette changes.
    pattern_specs = {
        'original': (CREAM, NAVY, ORANGE, '#F5E6D2', smiley_symbols['orange']),
        'swap': (CREAM, ORANGE, NAVY, '#F5E6D2', smiley_symbols['orange']),
        'navy': (NAVY, ORANGE, CREAM, '#193A5B', smiley_symbols['orange']),
        'navy-alt': (NAVY, CREAM, ORANGE, '#193A5B', smiley_symbols['cream']),
        'orange': (ORANGE, CREAM, NAVY, ORANGE_LIGHT, smiley_symbols['cream']),
        'orange-alt': (ORANGE, NAVY, CREAM, ORANGE_LIGHT, smiley_symbols['cream']),
    }
    pattern_backgrounds = {}
    for key, (main_color, navy_color, orange_color, shadow_color, mark) in pattern_specs.items():
        square_pattern = recolor_pattern(square_bg, main_color, navy_color, orange_color, shadow_color)
        # Use the same square composition for every format; only the canvas
        # ratio changes so the soft corner pattern stays recognizable.
        wide_pattern = square_pattern.resize((1920, 1080), Image.Resampling.LANCZOS)
        portrait_pattern = square_pattern.resize((1080, 1350), Image.Resampling.LANCZOS)
        story_pattern = square_pattern.resize((1080, 1920), Image.Resampling.LANCZOS)
        pattern_backgrounds[key] = wide_pattern
        save(square_pattern, f'background-pattern-{key}-square.png')
        save(wide_pattern, f'background-pattern-{key}-wide.png')
        save(portrait_pattern, f'background-pattern-{key}-portrait.png')
        save(story_pattern, f'background-pattern-{key}-story.png')
        make_theme_cover(wide_pattern, mark, (1920, 1080), f'cover-pattern-{key}-wide.png', 0.54)
        make_theme_cover(square_pattern, mark, (1080, 1080), f'cover-pattern-{key}-square.png', 0.60)
        make_theme_cover(square_pattern, mark, (1080, 1350), f'cover-pattern-{key}-portrait.png', 0.58)
        make_theme_cover(story_pattern, mark, (1080, 1920), f'cover-pattern-{key}-story.png', 0.52)
        # Logo-only covers: the smiley and via/eats two-line name are inside
        # the round mark, with no slogan or text beside it.
        make_theme_cover(wide_pattern, inmark_smiley_two_line, (1920, 1080), f'cover-logo-2line-pattern-{key}-wide.png', 0.50)
        make_theme_cover(square_pattern, inmark_smiley_two_line, (1080, 1080), f'cover-logo-2line-pattern-{key}-square.png', 0.62)
        make_theme_cover(square_pattern, inmark_smiley_two_line, (1080, 1350), f'cover-logo-2line-pattern-{key}-portrait.png', 0.58)
        make_theme_cover(story_pattern, inmark_smiley_two_line, (1080, 1920), f'cover-logo-2line-pattern-{key}-story.png', 0.48)

        # Clean versions intentionally contain no logo, copy or slogan.
        save(wide_pattern, f'cover-clean-pattern-{key}-wide.png')
        save(square_pattern, f'cover-clean-pattern-{key}-square.png')
        save(portrait_pattern, f'cover-clean-pattern-{key}-portrait.png')
        save(story_pattern, f'cover-clean-pattern-{key}-story.png')

        # Empty copy-safe plates. These preserve the same pattern, but add a
        # subtle panel so text can be placed without fighting the corner art.
        safe_panel = NAVY if key in {'navy', 'navy-alt'} else CREAM
        safe_accent = ORANGE if key in {'original', 'navy', 'orange'} else (NAVY if key == 'swap' else CREAM)
        for format_name, image, dimensions in (
            ('wide', wide_pattern, (1920, 1080)),
            ('square', square_pattern, (1080, 1080)),
            ('portrait', portrait_pattern, (1080, 1350)),
            ('story', story_pattern, (1080, 1920)),
        ):
            make_text_safe_background(image, dimensions, f'text-safe-pattern-{key}-{format_name}.png', safe_panel, safe_accent)

    # The wide logo-only social export should use the same canonical pattern
    # family as the covers, not the older alternate wide background.
    wide_bg = pattern_backgrounds['original']

    # Day 1 teaser set: five distinct, low-pressure community prompts. The
    # copy avoids competitor names and unverified claims; each post asks for
    # one concrete experience Lund residents can share.
    day1_specs = [
        ('01-listen', 'original', 'dag 1 · en fråga till lund', 'lundabor,\nkan vi börja\nom?', 'vad har fått dig att\ntappa lusten att beställa?', 'berätta utan namn.', NAVY, ORANGE, smiley_symbols['orange'], 'symbol-left'),
        ('02-what-went-wrong', 'navy', 'dag 1 · vi vill förstå', 'det borde inte\nvara så svårt.', 'vad vill du aldrig\nuppleva igen?', 'skriv en sak.', CREAM, ORANGE, smiley_symbols['orange'], 'symbol-left'),
        ('03-redesign', 'orange', 'dag 1 · hjälp oss bygga rätt', 'om du fick\nändra en sak…', 'vad skulle göra din\nnästa beställning bättre?', 'vi lyssnar.', NAVY, ORANGE, smiley_symbols['orange'], 'symbol-left'),
        ('04-simple', 'swap', 'dag 1 · lund, hjälp oss', 'maten är viktig.\nupplevelsen också.', 'vad saknas när du\nbeställer hemifrån?', 'säg det som det är.', NAVY, ORANGE, smiley_symbols['orange'], 'symbol-left'),
        ('05-real-question', 'navy-alt', 'dag 1 · ingen pitch', 'ingen pitch.\nbara en fråga.', 'vad har fått dig att\nsluta beställa mat\nhemifrån?', 'berätta utan namn.', CREAM, ORANGE, smiley_symbols['orange'], 'symbol-left'),
    ]
    for slug, key, day_label, headline, body, cta, text_color, accent, mark, layout in day1_specs:
        for format_name, size in [('square', (1080, 1080)), ('portrait', (1080, 1350))]:
            background = Image.open(EXPORTS / f'text-safe-pattern-{key}-{format_name}.png').convert('RGBA')
            make_campaign_poster(
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

    # Short, reusable Swedish slogans. They are rendered with the bundled
    # Baloo 2 font, not generated as raster text by an image model.
    quote_specs = [
        ('quote-navy-mat-fran-stan.png', 'navy', 'Mat från stan.\nHem till dig.', CREAM),
        ('quote-navy-din-stad.png', 'navy-alt', 'Din stad.\nDin mat.\nDitt tempo.', CREAM),
        ('quote-orange-gott-pa-vag.png', 'orange', 'Gott på väg.', CREAM),
        ('quote-orange-smaker.png', 'orange-alt', 'Fler smaker.\nMindre krångel.', CREAM),
        ('quote-cream-favoriter.png', 'original', 'Hela stans\nfavoriter.', NAVY),
        ('quote-cream-langtar.png', 'swap', 'Maten du\nlängtar efter.', NAVY),
        ('quote-navy-smak.png', 'navy', 'Smak som\nkommer hem.', CREAM),
        ('quote-cream-svepning.png', 'swap', 'En svepning från\ndin nästa favorit.', NAVY),
    ]
    for name, key, quote, text_color in quote_specs:
        mark = pattern_specs[key][4]
        make_quote_cover(pattern_backgrounds[key], mark, (1920, 1080), name, quote, text_color, 0.32)
        square_quote_bg = recolor_pattern(square_bg, *pattern_specs[key][:4])
        make_quote_cover(square_quote_bg, mark, (1080, 1080), name.replace('.png', '-square.png'), quote, text_color, 0.45)

    # Two-line name variants use a larger mark and tighter margins so the
    # wordmark remains visible at small app-icon sizes.
    make_cover_icon(square_bg, inmark_smiley_two_line, 'app-icon-cover-smiley-2line.png', 0.80)
    make_cover_icon(square_bg_alt, inmark_smiley_two_line, 'app-icon-cover-smiley-2line-alt.png', 0.80)
    make_cover_icon(square_bg, inmark_smiley_two_line, 'app-icon-cover-smiley-2line-tight.png', 0.86)

    # Beige and navy app-icon variants with the two-line logo family.
    beige_two_line = rounded_canvas((1024, 1024), CREAM, 190)
    paste_center(beige_two_line, inmark_smiley_two_line, (512, 512), 0.80)
    save(beige_two_line, 'app-icon-beige-smiley-2line.png')
    navy_two_line = rounded_canvas((1024, 1024), NAVY, 190)
    paste_center(navy_two_line, inmark_smiley_two_line, (512, 512), 0.80)
    save(navy_two_line, 'app-icon-navy-smiley-2line.png')
    # Centered social badges contain only the logo, with no copy beside it.
    make_social_badge(square_bg, inmark_smiley_two_line, (1080, 1080), 'social-square-viaeats-smiley-2line.png', 0.76)
    make_social_badge(square_bg_alt, inmark_smiley_two_line, (1080, 1080), 'social-square-viaeats-smiley-2line-alt.png', 0.76)
    make_social_badge(square_bg, inmark_smiley_two_line, (1080, 1350), 'social-portrait-viaeats-smiley-2line.png', 0.76)
    make_social_badge(wide_bg, inmark_smiley_two_line, (1920, 1080), 'social-wide-viaeats-smiley-2line.png', 0.68)

    # No older side-copy covers are generated anymore; use the quote assets
    # above when a slogan is actually wanted.


if __name__ == '__main__':
    build()
