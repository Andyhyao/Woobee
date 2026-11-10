# Woobee site

Static pages for the Woobee store: `index.html`, `shop.html`, `about.html`, `journal.html` and a `404.html`. Styles live in `styles.css`, behaviour in `main.js`, images in `assets/`.

## Editing pages

The root `.html` files are **generated**. Edit the sources in `src/`, then rebuild:

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
nav: shop            # home | shop | about | journal | none — sets the active nav link
film: true           # include the film dialog
newsletter: true     # include the newsletter form in the footer
ogImage: assets/og/shop.jpg       # social preview image (1200×630)
ogImageAlt: …                     # its alt text
noindex: true        # optional: keep the page out of search results
rootRelative: true   # optional: /styles.css instead of styles.css, for pages served at any URL (404)
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

It needs Pillow (`pip install pillow`) and writes `favicon.ico`, `favicon.svg`, `apple-touch-icon.png` and the app icons in `assets/icons/` (all from `assets/woobee-mark.svg`), `assets/og/*.jpg` (1200×630 previews) and `assets/r/` (smaller photo sizes plus `manifest.json`). Re-run it after adding or replacing a photo, then rebuild.

The "Watch the film" dialog on Shop and About plays `assets/film/woobee-film.mp4` (1440×1080, H.264, about 6 MB, silent, loops) with `woobee-film-poster.jpg` as its poster. To swap it, export a web copy at 1080p or below (on a Mac: `avconvert -s source.mp4 -p PresetAppleM4V1080pHD -o film.m4v`), keep it under about 10 MB, and replace both files.

## Previewing

Serve the folder with any static server, for example:

```bash
python3 -m http.server 4173
```

## Deploying to Vercel

The repo is ready to import as-is. `vercel.json` tells Vercel to run `node build.mjs --out dist` and serve `dist/`, so nothing needs to be built or committed by hand.

1. Push the repo to GitHub, GitLab or Bitbucket.
2. In Vercel: **Add New → Project**, import the repo. Leave the framework preset as **Other**; the build command and output folder come from `vercel.json`.
3. Optional: under **Settings → Environment Variables**, set `SITE_URL` to your custom domain (for example `https://woobee.com`). Without it, production builds use the project's Vercel domain automatically.

Or deploy from this folder with the Vercel CLI: `vercel` for a preview, `vercel --prod` for production. `.vercelignore` keeps local-only files out of the upload.

To check the deploy folder locally:

```bash
node build.mjs --out dist
python3 tools/serve-dist.py
```

`tools/serve-dist.py` serves `dist/` on http://localhost:4174 the way Vercel does, including `404.html` for unknown URLs.

`dist/` contains only what the browser needs: the pages, `styles.css`, `main.js`, favicons, `assets/` (minus build inputs), `robots.txt`, and `sitemap.xml` once a domain is known. The build warns about missing files and links to pages that don't exist yet; Vercel serves `404.html` for those. `vercel.json` also sets basic security headers, long caching for the hashed CSS/JS, and a week of caching for images (replace a photo under a new file name, or expect up to a week of stale copies).

## Installable web app (iPhone and Android)

The site installs to a phone's home screen and opens full screen like an app:

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu → **Install app** (or the install prompt).

What makes it work:

| File | Role |
| --- | --- |
| `manifest.webmanifest` | Name, colours, `standalone` display, icons, Shop/Journal shortcuts |
| `assets/icons/icon-*.png` | Home-screen icons (generated by `tools/make-assets.py`) |
| `src/layout.html` | `apple-mobile-web-app-*` tags, manifest link, Apple touch icon |
| `src/sw.js` → `sw.js` | Service worker: pages network-first with an offline fallback, other files cache-first |

The build writes `sw.js` with a cache name hashed from every page, CSS, JS and asset, so each deploy that changes anything replaces the old cache. Service workers only run on HTTPS or `localhost`, and only for pages someone has already opened, so offline browsing covers pages and photos they have seen.
