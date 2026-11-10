#!/usr/bin/env python3
"""Generate derived image assets for the Woobee site.

    python3 tools/make-assets.py

Needs Pillow (pip install pillow). Writes:
  favicon.ico, favicon.svg, apple-touch-icon.png   from assets/woobee-mark.svg
  assets/og/<page>.jpg                              1200x630 social preview images
  assets/r/<path>-<width>.jpg + assets/r/manifest.json
                                                    smaller copies for srcset; build.mjs reads the manifest
Re-run after adding or replacing a photo, then run `node build.mjs`.
"""
import json
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
BONE, INK = (246, 243, 238), (27, 29, 31)
WIDTHS = [480, 800, 1200, 1600]
OG = {  # page -> (source photo, focal point x, y)
    'home': ('hero-ridge.jpg', .62, .5),
    'shop': ('promo-summit.jpg', .66, .4),
    'about': ('gallery-ridge.jpg', .5, .62),
    'journal': ('gallery-falls.jpg', .35, .4),
}


def mark_subpaths():
    """Polygons of the mountain mark (the SVG uses only M/L/H/Z commands)."""
    svg = (ASSETS / 'woobee-mark.svg').read_text()
    view = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
    paths = []
    for d in re.findall(r'<path d="([^"]+)"', svg):
        subs, cur, x, y = [], [], 0.0, 0.0
        for cmd, args in re.findall(r'([MLHZ])([^MLHZ]*)', d):
            nums = [float(n) for n in re.findall(r'-?\d*\.?\d+', args)]
            if cmd == 'M':
                if cur: subs.append(cur)
                x, y = nums[0], nums[1]; cur = [(x, y)]
                for i in range(2, len(nums), 2): x, y = nums[i], nums[i + 1]; cur.append((x, y))
            elif cmd == 'L':
                for i in range(0, len(nums), 2): x, y = nums[i], nums[i + 1]; cur.append((x, y))
            elif cmd == 'H':
                for n in nums: x = n; cur.append((x, y))
            elif cmd == 'Z':
                if cur: subs.append(cur); cur = []
        if cur: subs.append(cur)
        paths.append(subs)
    return view, paths


def icon(size, pad=.14):
    """Ink mark centred on a bone square, rendered at 4x then downsampled."""
    scale = 4
    big = size * scale
    (vx, vy, vw, vh), paths = mark_subpaths()
    k = big * (1 - 2 * pad) / vw
    ox, oy = big * pad - vx * k, (big - vh * k) / 2 - vy * k
    shape = Image.new('1', (big, big), 0)
    for subs in paths:  # sub-paths inside one path cut holes (even-odd)
        layer = Image.new('1', (big, big), 0)
        for poly in subs:
            piece = Image.new('1', (big, big), 0)
            ImageDraw.Draw(piece).polygon([(ox + px * k, oy + py * k) for px, py in poly], fill=1)
            layer = ImageChops.logical_xor(layer, piece)
        shape = ImageChops.logical_or(shape, layer)
    img = Image.new('RGB', (big, big), BONE)
    img.paste(Image.new('RGB', (big, big), INK), mask=shape.convert('L'))
    return img.resize((size, size), Image.LANCZOS)


def favicons():
    (vx, vy, vw, vh), _ = mark_subpaths()
    side = vw / (1 - 2 * .14)
    paths = ''.join(f'<path d="{d}"/>' for d in re.findall(r'<path d="([^"]+)"', (ASSETS / 'woobee-mark.svg').read_text()))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx - (side - vw) / 2:.1f} {vy - (side - vh) / 2:.1f} {side:.1f} {side:.1f}">'
           f'<rect x="{vx - (side - vw) / 2:.1f}" y="{vy - (side - vh) / 2:.1f}" width="{side:.1f}" height="{side:.1f}" fill="#F6F3EE"/>'
           f'<g fill="#1B1D1F">{paths}</g></svg>\n')
    (ROOT / 'favicon.svg').write_text(svg)
    icon(180, pad=.16).save(ROOT / 'apple-touch-icon.png', optimize=True)
    icon(64).save(ROOT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    print('favicons: favicon.svg, favicon.ico, apple-touch-icon.png')


def og_images():
    out = ASSETS / 'og'
    out.mkdir(exist_ok=True)
    for page, (name, fx, fy) in OG.items():
        im = Image.open(ASSETS / name).convert('RGB')
        k = max(1200 / im.width, 630 / im.height)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        x = round((im.width - 1200) * fx); y = round((im.height - 630) * fy)
        im.crop((x, y, x + 1200, y + 630)).save(out / f'{page}.jpg', quality=82, optimize=True, progressive=True)
    print(f'og images: {", ".join(OG)}')


def responsive():
    out_root = ASSETS / 'r'
    manifest = {}
    photos = [p for p in ASSETS.rglob('*.jpg') if out_root not in p.parents and 'og' not in p.parts and 'film' not in p.parts]
    for photo in sorted(photos):
        rel = photo.relative_to(ROOT).as_posix()
        im = Image.open(photo).convert('RGB')
        widths = [w for w in WIDTHS if w < im.width * .9]
        manifest[rel] = {'width': im.width, 'variants': {}}
        for w in widths:
            target = out_root / photo.relative_to(ASSETS).with_suffix('')
            dest = target.parent / f'{target.name}-{w}.jpg'
            dest.parent.mkdir(parents=True, exist_ok=True)
            im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(dest, quality=80, optimize=True, progressive=True)
            manifest[rel]['variants'][w] = dest.relative_to(ROOT).as_posix()
    (out_root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    total = sum(len(v['variants']) for v in manifest.values())
    print(f'responsive: {total} variants for {len(manifest)} photos')


if __name__ == '__main__':
    favicons()
    og_images()
    responsive()
