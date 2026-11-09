# Woobee site

Static pages for the Woobee store: `index.html`, `shop.html`, `about.html` and `journal.html`. Styles live in `styles.css`, behaviour in `main.js`, images in `assets/`.

## Editing pages

The four root `.html` files are **generated**. Edit the sources in `src/`, then rebuild:

```bash
node build.mjs
```

Or rebuild automatically while you work:

```bash
node build.mjs --watch
```

No install step is needed. Node 18+ works for a one-off build; `--watch` on Linux needs Node 20+.

Set the live domain so pages get a canonical link and absolute social-preview URLs:

```bash
SITE_URL=https://example.com node build.mjs
```

| Change | Edit |
| --- | --- |
| Nav bar, mobile menu | `src/partials/header.html` |
| Footer, footer newsletter | `src/partials/footer.html`, `src/partials/footer-newsletter.html` |
| Icons (SVG sprite) | `src/partials/sprite.html` |
| Value strip (home + shop) | `src/partials/values.html` |
| Film dialog | `src/partials/film.html` |
| Products, prices (USD), colours, badges | `src/data/products.json` |
| Page title, description, page content | `src/pages/<page>.html` |
| `<head>`, page shell | `src/layout.html` |

### Page front matter

Each file in `src/pages/` starts with:

```
---
title: Shop backpacks and bags — Woobee
description: …
nav: shop            # home | shop | about | journal — sets the active nav link
film: true           # include the film dialog
newsletter: true     # include the newsletter form in the footer
ogImage: assets/og/shop.jpg       # social preview image (1200×630)
ogImageAlt: …                     # its alt text
---
```

### Includes

Put `<!-- include: name -->` on its own line to pull in `src/partials/name.html` at that indentation. `<!-- include: name if flag -->` is skipped when the page sets that flag to `false`. Two includes are generated from `products.json`: `product-tiles` and `category-filters`.

The build adds a content hash to `styles.css?v=…` and `main.js?v=…`, so browsers always load the latest CSS and JS. Each photo also gets a `srcset` of smaller copies; add `data-sizes="…"` to an `<img>` in `src/` to tell the browser how wide it renders (default `100vw`).

## Images, favicons and social previews

Derived images are generated, not hand-made:

```bash
python3 tools/make-assets.py
```

It needs Pillow (`pip install pillow`) and writes `favicon.ico`, `favicon.svg`, `apple-touch-icon.png` (from `assets/woobee-mark.svg`), `assets/og/*.jpg` (1200×630 previews) and `assets/r/` (smaller photo sizes plus `manifest.json`). Re-run it after adding or replacing a photo, then rebuild.

The "Watch the film" dialog on Shop and About plays `assets/woobee-film.mp4`, which is git-ignored (it is a local link to a large source file). Host the final film elsewhere and point `src/partials/film.html` at it.

## Previewing

Serve the folder with any static server, for example:

```bash
python3 -m http.server 4173
```
