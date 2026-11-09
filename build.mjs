#!/usr/bin/env node
// Builds the site pages (index, shop, about, journal) from src/.
//   node build.mjs          build once
//   node build.mjs --watch  rebuild on every change to src/, styles.css or main.js
//
// src/layout.html          page shell (head, sprite, header, footer, scripts)
// src/pages/*.html         front matter + the page's <main> content
// src/partials/*.html      shared blocks, pulled in with <!-- include: name -->
// src/data/products.json   product catalogue; renders the tiles and category tabs
//
// Includes keep the indentation of the comment line. `<!-- include: name if flag -->`
// is dropped when the page's front matter sets that flag to false.
import { readFileSync, writeFileSync, readdirSync, watch } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
// Production origin, e.g. https://woobee.my (no trailing slash). When set, pages get a canonical
// link and og:url, and og:image becomes absolute (social sites need absolute image URLs).
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const SRC = join(ROOT, 'src');
const read = (path) => readFileSync(path, 'utf8');

const NAV = ['home', 'shop', 'about', 'journal'];
// Store currency. Prices in src/data/products.json are in this currency.
const CURRENCY = { code: 'USD', format: (amount) => `US$${Number(amount).toFixed(2)}` };
const SWATCHES = {
  copper: ['Copper', '#C0632F'],
  black: ['Black', '#1E1F21'],
  stone: ['Stone', '#8E8A84'],
  moss: ['Moss', '#4F5B3A'],
  sand: ['Sand', '#CDBEA8'],
};
const CATEGORIES = [
  ['all', 'All'],
  ['backpacks', 'Backpacks'],
  ['shoulder-bags', 'Shoulder bags'],
  ['hip-packs', 'Hip packs'],
  ['accessories', 'Accessories'],
];

const escape = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

// Short content hash so browsers pick up CSS/JS changes without manual ?v= bumps
const version = (file) => createHash('sha1').update(read(join(ROOT, file))).digest('hex').slice(0, 8);

function parsePage(text, file) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    meta[key.trim()] = value === 'true' ? true : value === 'false' ? false : value;
  }
  for (const key of ['title', 'description', 'nav']) {
    if (!meta[key]) throw new Error(`${file}: front matter needs "${key}"`);
  }
  if (!NAV.includes(meta.nav)) throw new Error(`${file}: nav must be one of ${NAV.join(', ')}`);
  return { meta, content: text.slice(match[0].length).replace(/\n+$/, '') };
}

// Smaller copies of each photo (made by tools/make-assets.py). Each <img src="assets/…jpg"> gets a
// srcset from them; set data-sizes="…" on the img to describe its rendered width (default 100vw).
function responsiveImages(html) {
  let manifest;
  try { manifest = JSON.parse(read(join(ROOT, 'assets/r/manifest.json'))); } catch { return html; }
  return html.replace(/<img ([^>]*?)src="(assets\/[^"]+\.jpg)"([^>]*)>/g, (tag, before, src, after) => {
    const attrs = `${before}${after}`;
    const sizesMatch = attrs.match(/(?:^|\s)data-sizes="([^"]+)"/);
    const sizes = sizesMatch ? sizesMatch[1] : '100vw';
    const rest = (s) => s.replace(/(^|\s)data-sizes="[^"]+"\s?/, '$1');
    const entry = manifest[src];
    if (!entry || !Object.keys(entry.variants).length) return `<img ${rest(before)}src="${src}"${rest(after)}>`;
    const srcset = [...Object.entries(entry.variants).map(([w, file]) => `${file} ${w}w`), `${src} ${entry.width}w`].join(', ');
    return `<img ${rest(before)}src="${src}" srcset="${srcset}" sizes="${sizes}"${rest(after)}>`;
  });
}

function fill(text, vars, source) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`${source}: unknown placeholder {{${key}}}`);
    return vars[key];
  });
}

// ---------- generated partials ----------
function productTile(p, order) {
  const colourNames = p.colours.map((c) => SWATCHES[c][0]).join(', ');
  const swatches = p.colours.map((c, i) => {
    const [label, hex] = SWATCHES[c];
    return `        <li class="swatch${i === 0 ? ' is-current' : ''}" style="--c:${hex}"><span class="sr-only">${label}${i === 0 ? ' (shown)' : ''}</span></li>`;
  });
  const badge = p.badge ? `\n      <span class="badge">${escape(p.badge)}</span>` : '';
  return `<li class="product reveal" data-colours="${p.colours.join(' ')}" data-category="${p.category}" data-price="${p.price}" data-capacity="${p.capacity}" data-order="${order}">
  <article class="tile">
    <div class="tile__media">
      <img data-sizes="(min-width: 1024px) 23vw, 50vw" src="assets/products/${p.slug}.jpg" alt="${escape(p.alt)}" width="600" height="750" loading="lazy">${badge}
      <button class="tile__add" type="button" data-add="${escape(p.name)}">
        <svg class="icon" aria-hidden="true"><use href="#i-bag-plus"/></svg>
        <span class="tile__add-label">Quick add</span>
        <span class="sr-only"> ${escape(p.name)}</span>
      </button>
    </div>
    <div class="tile__body">
      <h3 class="tile__name"><a href="/shop/${p.slug}">${escape(p.name)}</a></h3>
      <p class="tile__type">${escape(p.type)}</p>
      <p class="tile__price"><data value="${p.price}">${CURRENCY.format(p.price)}</data></p>
      <div class="tile__foot">
        <ul class="swatches" aria-label="Colours: ${colourNames}">
${swatches.join('\n')}
        </ul>
        <button class="tile__save" type="button" aria-pressed="false" data-save="${p.slug}">
          <svg class="icon" aria-hidden="true"><use href="#i-bookmark"/></svg>
          <span class="sr-only">Save ${escape(p.name)}</span>
        </button>
      </div>
    </div>
  </article>
</li>`;
}

function categoryFilters(products) {
  return CATEGORIES.map(([key, label]) => {
    const count = products.filter((p) => key === 'all' || p.category === key).length;
    return `<button class="filter" type="button" data-filter="${key}" aria-pressed="${key === 'all'}">${label} <span class="filter__count">${count}</span></button>`;
  }).join('\n');
}

// ---------- build ----------
function build() {
  const started = Date.now();
  const products = JSON.parse(read(join(SRC, 'data/products.json')));
  for (const p of products) {
    for (const c of p.colours) if (!SWATCHES[c]) throw new Error(`products.json: ${p.slug} has unknown colour "${c}"`);
    if (!CATEGORIES.some(([key]) => key === p.category)) throw new Error(`products.json: ${p.slug} has unknown category "${p.category}"`);
  }
  const generated = {
    'product-tiles': () => products.map(productTile).join('\n'),
    'category-filters': () => categoryFilters(products),
  };
  const layout = read(join(SRC, 'layout.html'));
  const shared = { cssVersion: version('styles.css'), jsVersion: version('main.js') };

  function partial(name, vars) {
    if (generated[name]) return generated[name]();
    const file = join(SRC, 'partials', `${name}.html`);
    let text;
    try { text = read(file); } catch { throw new Error(`unknown include "${name}" (no src/partials/${name}.html)`); }
    return fill(text.replace(/\n+$/, ''), vars, `partials/${name}.html`);
  }

  function expand(text, vars, depth = 0) {
    if (depth > 8) throw new Error('includes nested too deeply (is a partial including itself?)');
    const lines = text.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i].match(/^(\s*)<!-- include: ([\w-]+)(?: if (\w+))? -->\s*$/);
      if (!m) { out.push(lines[i]); continue; }
      const [, indent, name, flag] = m;
      if (flag && !vars[flag]) {
        if (lines[i + 1] === '') i += 1; // drop the spacer line too
        continue;
      }
      const body = expand(partial(name, vars), vars, depth + 1);
      out.push(...body.split('\n').map((line) => (line ? indent + line : line)));
    }
    return out.join('\n');
  }

  const pages = readdirSync(join(SRC, 'pages')).filter((f) => f.endsWith('.html'));
  for (const file of pages) {
    const { meta, content } = parsePage(read(join(SRC, 'pages', file)), `pages/${file}`);
    const page = file === 'index.html' ? '/' : `/${file}`;
    const ogImage = meta.ogImage || 'assets/og/home.jpg';
    const vars = {
      ...shared,
      ...meta,
      siteUrl: SITE_URL,
      pageUrl: `${SITE_URL}${page}`,
      ogImage: SITE_URL ? `${SITE_URL}/${ogImage}` : ogImage,
      ogImageAlt: meta.ogImageAlt || meta.title,
      film: meta.film !== false,
      newsletter: meta.newsletter !== false,
      footerTopModifier: meta.newsletter === false ? ' footer__top--compact' : '',
    };
    for (const key of NAV) vars[`current.${key}`] = meta.nav === key ? ' aria-current="page"' : '';
    const shell = fill(layout.replace('{{content}}', '\u0000CONTENT\u0000'), vars, 'layout.html');
    const html = responsiveImages(expand(shell.replace('\u0000CONTENT\u0000', () => content), vars));
    writeFileSync(join(ROOT, file), `${html.replace(/\n+$/, '')}\n`);
  }
  console.log(`Built ${pages.map((f) => basename(f, '.html')).join(', ')} in ${Date.now() - started} ms (css ${shared.cssVersion}, js ${shared.jsVersion})`);
}

function safeBuild() {
  try { build(); } catch (err) { console.error(`Build failed: ${err.message}`); process.exitCode = 1; }
}

safeBuild();

if (process.argv.includes('--watch')) {
  let timer;
  const rebuild = (_, file) => {
    if (file && /(^|\/)\./.test(file)) return; // ignore .DS_Store and friends
    clearTimeout(timer);
    timer = setTimeout(() => { process.exitCode = 0; safeBuild(); }, 80);
  };
  watch(SRC, { recursive: true }, rebuild);
  watch(join(ROOT, 'styles.css'), rebuild);
  watch(join(ROOT, 'main.js'), rebuild);
  console.log('Watching src/, styles.css and main.js. Ctrl+C to stop.');
}
