// Installed web app: register the service worker (offline pages, faster repeat visits)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

// Mobile/secondary menu
const menuToggle = document.querySelector('[data-menu-toggle]');
const menu = document.getElementById('menu');
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!open));
  menuToggle.setAttribute('aria-label', open ? 'Menu' : 'Close menu');
  menu.hidden = open;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.hidden) menuToggle.click();
});

// Header search: opens a bar that searches the shop (a plain GET form, so it works without JS)
const searchToggle = document.querySelector('[data-search-toggle]');
const searchPanel = document.getElementById('site-search');
if (searchToggle && searchPanel) {
  const searchInput = searchPanel.querySelector('input');
  const setSearch = (open) => {
    searchToggle.setAttribute('aria-expanded', String(open));
    searchToggle.setAttribute('aria-label', open ? 'Close search' : 'Search');
    searchPanel.hidden = !open;
    if (open) {
      if (!menu.hidden) menuToggle.click();
      searchInput.focus();
    }
  };
  searchToggle.addEventListener('click', () => setSearch(searchPanel.hidden));
  searchInput.value = new URLSearchParams(location.search).get('q') || '';
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !searchPanel.hidden) { setSearch(false); searchToggle.focus(); }
  });
  menuToggle.addEventListener('click', () => { if (!searchPanel.hidden) setSearch(false); });
}

// Film dialog
const film = document.querySelector('.film');
const filmOpen = document.querySelector('[data-film-open]');
if (film && filmOpen) {
  const video = film.querySelector('video');
  filmOpen.addEventListener('click', () => {
    film.showModal();
    video.play().catch(() => {});
  });
  film.querySelector('[data-film-close]').addEventListener('click', () => film.close());
  film.addEventListener('click', (e) => { if (e.target === film) film.close(); });
  film.addEventListener('close', () => video.pause());
}

// Feature callouts highlight their pin on the photo
const pins = document.querySelectorAll('.pin');
document.querySelectorAll('.callout').forEach((item) => {
  const pin = [...pins].find((p) => p.dataset.pin === item.dataset.pin);
  item.addEventListener('mouseenter', () => pin.classList.add('is-active'));
  item.addEventListener('mouseleave', () => pin.classList.remove('is-active'));
});

// Reveal once on first scroll into view: 8px rise + fade.
// Items that arrive together are staggered in reading order (row by row, left to right).
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    const arriving = entries.filter((e) => e.isIntersecting).map((e) => ({ el: e.target, box: e.boundingClientRect }));
    arriving.sort((a, b) => (Math.round(a.box.top / 24) - Math.round(b.box.top / 24)) || (a.box.left - b.box.left));
    arriving.forEach(({ el }, i) => {
      el.style.transitionDelay = `${Math.min(i, 6) * 70}ms`;
      el.classList.add('is-in');
      io.unobserve(el);
      // Hand transitions back to hover states once the reveal has played
      setTimeout(() => { el.style.transitionDelay = ''; }, 1400);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('is-in'));
}

// Gallery tally counts up the first time it is seen
const counters = document.querySelectorAll('[data-count-to]');
if (counters.length && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const countUp = (el) => {
    const target = Number(el.dataset.countTo);
    const start = performance.now();
    const duration = 1100;
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      el.textContent = Math.round(target * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(tick);
    };
    el.textContent = '0';
    requestAnimationFrame(tick);
  };
  const countIo = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      countUp(entry.target);
      countIo.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  counters.forEach((el) => countIo.observe(el));
}

// ---------- Collection: filter, sort, save, quick add ----------
// Runs on any page with a product grid. The shop page adds colour and size chips,
// a phone Refine panel and URL state; the home page only has category tabs.
const grid = document.getElementById('product-grid');
if (grid) {
  const listing = grid.closest('section');
  const shopStatus = document.getElementById('shop-status');
  const filterButtons = [...document.querySelectorAll('.filter')];
  const colourChips = [...document.querySelectorAll('[data-colour]')];
  const sizeChips = [...document.querySelectorAll('[data-size]')];
  const clearButtons = [...document.querySelectorAll('[data-clear-filters]')];
  const emptyState = document.querySelector('[data-empty]');
  const refine = document.getElementById('refine');
  const refineToggle = document.querySelector('.refine-toggle');
  const refineCount = document.querySelector('[data-refine-count]');
  const sortSelect = document.getElementById('sort');
  const products = [...grid.querySelectorAll('.product')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncUrl = listing.hasAttribute('data-shop');

  const state = { category: 'all', colours: new Set(), sizes: new Set(), sort: 'featured', q: '' };
  const sizeOf = (p) => {
    const litres = +p.dataset.capacity;
    return litres < 10 ? 'small' : litres <= 25 ? 'medium' : 'large';
  };
  const matches = (p, category = state.category) =>
    (category === 'all' || p.dataset.category === category)
    && (!state.colours.size || (p.dataset.colours || '').split(' ').some((c) => state.colours.has(c)))
    && (!state.sizes.size || state.sizes.has(sizeOf(p)))
    && (!state.q || searchText(p).includes(state.q));
  const buttonLabel = (el) => el.firstChild.textContent.trim() || el.textContent.trim();
  function searchText(p) {
    const body = p.querySelector('.tile__body');
    return `${body.textContent} ${p.dataset.category.replace('-', ' ')} ${p.dataset.colours}`.toLowerCase();
  }

  function describe() {
    const parts = [];
    const cat = filterButtons.find((b) => b.dataset.filter === state.category);
    if (state.category !== 'all' && cat) parts.push(buttonLabel(cat));
    if (state.colours.size) parts.push(colourChips.filter((c) => state.colours.has(c.dataset.colour)).map((c) => c.textContent.trim()).join(' or '));
    if (state.sizes.size) parts.push(`${sizeChips.filter((c) => state.sizes.has(c.dataset.size)).map(buttonLabel).join(' or ')} size`);
    if (state.q) parts.push(`“${state.q}”`);
    return parts;
  }

  function syncLocation() {
    if (!syncUrl) return;
    const params = new URLSearchParams();
    if (state.category !== 'all') params.set('category', state.category);
    if (state.colours.size) params.set('colour', [...state.colours].join(','));
    if (state.sizes.size) params.set('size', [...state.sizes].join(','));
    if (state.sort !== 'featured') params.set('sort', state.sort);
    if (state.q) params.set('q', state.q);
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }

  function render({ animate = true } = {}) {
    filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === state.category)));
    colourChips.forEach((c) => c.setAttribute('aria-pressed', String(state.colours.has(c.dataset.colour))));
    sizeChips.forEach((c) => c.setAttribute('aria-pressed', String(state.sizes.has(c.dataset.size))));
    // Category counts reflect the colour and size filters, so a tab never promises bags it won't show
    filterButtons.forEach((b) => {
      b.querySelector('.filter__count').textContent = products.filter((p) => matches(p, b.dataset.filter)).length;
    });

    let shown = 0;
    products.forEach((p) => {
      const match = matches(p);
      const wasHidden = p.hidden;
      p.hidden = !match;
      if (!match) return;
      shown += 1;
      if (wasHidden && animate && !reduceMotion.matches) {
        p.classList.remove('is-entering');
        void p.offsetWidth;
        p.classList.add('is-entering');
      }
    });

    const refined = state.colours.size + state.sizes.size;
    const anyFilter = refined > 0 || state.category !== 'all' || Boolean(state.q);
    clearButtons.forEach((b) => { if (!b.closest('[data-empty]')) b.hidden = !anyFilter; });
    if (refineCount) { refineCount.hidden = !refined; refineCount.textContent = refined; }
    if (emptyState) emptyState.hidden = shown > 0;

    const parts = describe();
    shopStatus.textContent = shown === products.length && !parts.length
      ? `Showing all ${shown} products`
      : `Showing ${shown} of ${products.length} products${parts.length ? `: ${parts.join(', ')}` : ''}`;
    syncLocation();
  }

  const SORTS = {
    featured: (p) => +p.dataset.order,
    'price-asc': (p) => +p.dataset.price,
    'price-desc': (p) => -p.dataset.price,
    'capacity-desc': (p) => -p.dataset.capacity,
  };
  function applySort(mode) {
    state.sort = SORTS[mode] ? mode : 'featured';
    const key = SORTS[state.sort];
    [...products].sort((a, b) => key(a) - key(b) || a.dataset.order - b.dataset.order)
      .forEach((p) => grid.appendChild(p));
  }

  function clearAll() {
    state.category = 'all';
    state.colours.clear();
    state.sizes.clear();
    state.q = '';
    const headerSearch = document.getElementById('site-search-input');
    if (headerSearch) headerSearch.value = '';
    render();
  }

  // Deep links: shop.html?category=backpacks&colour=copper,black&size=large&sort=price-asc
  if (syncUrl) {
    const params = new URLSearchParams(location.search);
    const valid = (list, key) => (params.get(key) || '').split(',').filter((v) => list.some((el) => el.dataset[key === 'colour' ? 'colour' : 'size'] === v));
    if (filterButtons.some((b) => b.dataset.filter === params.get('category'))) state.category = params.get('category');
    valid(colourChips, 'colour').forEach((c) => state.colours.add(c));
    valid(sizeChips, 'size').forEach((c) => state.sizes.add(c));
    state.q = (params.get('q') || '').trim().toLowerCase();
    if ([...sortSelect.options].some((o) => o.value === params.get('sort'))) {
      sortSelect.value = params.get('sort');
      applySort(sortSelect.value);
    }
  }
  render({ animate: false });

  filterButtons.forEach((b) => b.addEventListener('click', () => { state.category = b.dataset.filter; render(); }));
  const toggleIn = (set, value) => (set.has(value) ? set.delete(value) : set.add(value));
  colourChips.forEach((c) => c.addEventListener('click', () => { toggleIn(state.colours, c.dataset.colour); render(); }));
  sizeChips.forEach((c) => c.addEventListener('click', () => { toggleIn(state.sizes, c.dataset.size); render(); }));
  clearButtons.forEach((b) => b.addEventListener('click', clearAll));
  sortSelect.addEventListener('change', () => { applySort(sortSelect.value); syncLocation(); });

  if (refine && refineToggle) {
    refineToggle.addEventListener('click', () => {
      const open = refineToggle.getAttribute('aria-expanded') !== 'true';
      refineToggle.setAttribute('aria-expanded', String(open));
      refine.classList.toggle('is-open', open);
    });
  }

  // Links that set a category (hero CTA, footer): filter in place when they point at this page
  document.querySelectorAll('[data-filter-link]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const url = new URL(link.href, location.href);
      if (url.pathname !== location.pathname) return;
      if (!url.hash) {
        e.preventDefault();
        listing.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      }
      state.category = link.dataset.filterLink;
      render();
    });
  });

  // Saved items persist per viewer; the page works the same without storage
  const SAVED_KEY = 'woobee:saved';
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(SAVED_KEY)) || []; } catch (e) { saved = []; }
  document.querySelectorAll('[data-save]').forEach((btn) => {
    const name = btn.querySelector('.sr-only');
    const set = (on) => {
      btn.setAttribute('aria-pressed', String(on));
      name.textContent = name.textContent.replace(/^(Save|Saved)/, on ? 'Saved' : 'Save');
    };
    set(saved.includes(btn.dataset.save));
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      set(on);
      saved = on ? [...new Set([...saved, btn.dataset.save])] : saved.filter((x) => x !== btn.dataset.save);
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); } catch (e) { /* storage unavailable */ }
    });
  });

  // Quick add updates the cart badge and announces the change
  const cartLink = document.querySelector('.cart');
  const cartBadge = cartLink.querySelector('.cart__badge');
  let cartCount = 0;
  document.querySelectorAll('[data-add]').forEach((btn) => {
    const label = btn.querySelector('.tile__add-label');
    btn.addEventListener('click', () => {
      cartCount += 1;
      cartBadge.textContent = cartCount;
      cartBadge.dataset.count = cartCount;
      cartLink.setAttribute('aria-label', `Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`);
      shopStatus.textContent = `${btn.dataset.add} added to your cart`;
      btn.classList.add('is-added');
      label.textContent = 'Added';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.classList.remove('is-added'); label.textContent = 'Quick add'; }, 1600);
    });
  });
}

// ---------- Journal: topic tabs + search ----------
const journal = document.querySelector('[data-journal]');
if (journal) {
  const posts = [...journal.querySelectorAll('.post')];
  const tabs = [...journal.querySelectorAll('[data-topic]')].filter((el) => el.tagName === 'BUTTON');
  const search = document.getElementById('journal-search');
  const statusEl = document.getElementById('journal-status');
  const empty = journal.querySelector('[data-journal-empty]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { topic: 'all', q: '' };
  const text = (post) => post.querySelector('.post__body').textContent.toLowerCase();
  const matches = (post, topic = state.topic) =>
    (topic === 'all' || post.dataset.topic === topic) && (!state.q || text(post).includes(state.q));

  function render({ animate = true } = {}) {
    tabs.forEach((t) => {
      t.setAttribute('aria-pressed', String(t.dataset.topic === state.topic));
      t.querySelector('.filter__count').textContent = posts.filter((p) => matches(p, t.dataset.topic)).length;
    });
    let shown = 0;
    posts.forEach((p) => {
      const match = matches(p);
      const wasHidden = p.hidden;
      p.hidden = !match;
      if (!match) return;
      shown += 1;
      if (wasHidden && animate && !reduceMotion.matches) {
        p.classList.remove('is-entering');
        void p.offsetWidth;
        p.classList.add('is-entering');
      }
    });
    empty.hidden = shown > 0;
    const tab = tabs.find((t) => t.dataset.topic === state.topic);
    const bits = [];
    if (state.topic !== 'all') bits.push(tab.firstChild.textContent.trim());
    if (state.q) bits.push(`“${search.value.trim()}”`);
    statusEl.textContent = !bits.length
      ? `Showing all ${posts.length} stories`
      : `Showing ${shown} of ${posts.length} stories: ${bits.join(', ')}`;

    const params = new URLSearchParams();
    if (state.topic !== 'all') params.set('topic', state.topic);
    if (state.q) params.set('q', search.value.trim());
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }

  const params = new URLSearchParams(location.search);
  if (tabs.some((t) => t.dataset.topic === params.get('topic'))) state.topic = params.get('topic');
  if (params.get('q')) { search.value = params.get('q'); state.q = search.value.trim().toLowerCase(); }
  render({ animate: false });

  tabs.forEach((t) => t.addEventListener('click', () => { state.topic = t.dataset.topic; render(); }));
  let typing;
  search.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.q = search.value.trim().toLowerCase(); render(); }, 150);
  });
  journal.querySelector('[data-journal-clear]').addEventListener('click', () => {
    state.topic = 'all'; state.q = ''; search.value = '';
    render();
    search.focus();
  });
}

// ---------- Footer ----------
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

// Newsletter form (absent on pages that drop it, such as the 404 page)
const newsletter = document.querySelector('.newsletter');
if (newsletter) {
  const email = newsletter.querySelector('input[type="email"]');
  const msg = document.getElementById('newsletter-msg');
  newsletter.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = email.value.trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    email.setAttribute('aria-invalid', String(!valid));
    msg.classList.toggle('is-error', !valid);
    if (!valid) {
      msg.textContent = value ? 'Check the email address, it looks incomplete.' : 'Enter your email address to subscribe.';
      email.focus();
      return;
    }
    msg.textContent = `Thanks. We'll send the next one to ${value}.`;
    newsletter.reset();
  });
  email.addEventListener('input', () => {
    if (email.getAttribute('aria-invalid') === 'true') {
      email.removeAttribute('aria-invalid');
      msg.textContent = '';
      msg.classList.remove('is-error');
    }
  });
}
