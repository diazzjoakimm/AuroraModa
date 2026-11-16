/* Catálogo minorista / mayorista. Lee las publicaciones que se cargan desde el panel de index.html. */
(() => {
  'use strict';
  const KEY = 'aurora_moda_posts_v1', WA = '5491149754536', NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = n => Number(n) > 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) : 'Consultar';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  let posts = [];
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(d)) posts = d.filter(p => p && p.title && Array.isArray(p.images) && p.images.length && String(p.images[0]).startsWith('data:image/'));
  } catch (_) {}

  const DEMO = {
    minorista: ['Vincha de seda', 'Vincha trenzada', 'Vincha con moño', 'Vincha de perlas', 'Vincha ancha', 'Vincha de terciopelo', 'Hebillas y pinzas', 'Colitas y scrunchies'].map(t => ({ t })),
    mayorista: [['Pack vinchas de seda', 12], ['Pack vinchas trenzadas', 12], ['Pack vinchas con moño', 12], ['Pack scrunchies', 24], ['Pack hebillas y pinzas', 24], ['Pack vinchas de terciopelo', 12]].map(([t, m]) => ({ t, m }))
  };
  const COPY = {
    minorista: ['Catálogo', 'Vinchas y accesorios elegidos con criterio. Toca una pieza para ver sus fotos y detalles.'],
    mayorista: ['Catálogo mayorista', 'Packs y compra por cantidad para revendedoras. Consultanos por precios y mínimos.']
  };
  const priceText = (p, wholesale) => wholesale ? `${fmt(p.price)} c/u` : fmt(p.price);

  let line = location.hash === '#mayorista' ? 'mayorista' : 'minorista';

  function card(title, price, min, media, onOpen) {
    const c = el('article', 'card');
    c.append(media, el('div', 'card__body'));
    const body = c.lastChild, left = el('div');
    left.append(el('h3', 'card__title', title));
    if (min) left.append(el('span', 'card__min', min));
    body.append(left, el('p', 'card__price', price));
    if (onOpen) {
      c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', 'Ver ' + title);
      c.addEventListener('click', onOpen);
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } });
    } else c.classList.add('card--demo');
    return c;
  }

  function render() {
    const wholesale = line === 'mayorista';
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.line === line)));
    $('#cat-title').textContent = COPY[line][0];
    $('#cat-lead').textContent = COPY[line][1];
    document.title = COPY[line][0] + ' — Aurora Moda';
    const grid = $('#grid'); grid.replaceChildren();
    const list = posts.filter(p => (p.line === 'mayorista') === wholesale).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (list.length) {
      list.forEach(p => {
        const media = el('div', 'card__media');
        const img = el('img', 'card__img'); img.src = p.images[0]; img.alt = p.title; img.loading = 'lazy';
        media.append(img);
        grid.append(card(p.title, priceText(p, wholesale), wholesale && p.minQty ? `Mínimo ${p.minQty} unidades` : '', media, () => openProduct(p)));
      });
    } else {
      DEMO[line].forEach(d => {
        const media = el('div', 'card__media');
        const svg = document.createElementNS(NS, 'svg'), use = document.createElementNS(NS, 'use');
        svg.setAttribute('class', 'card__vincha'); svg.setAttribute('aria-hidden', 'true');
        use.setAttribute('href', '#icon-vincha'); svg.append(use); media.append(svg);
        grid.append(card(d.t, 'Consultar', d.m ? `Mínimo ${d.m} unidades` : '', media, null));
      });
    }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 });
    $$('.card', grid).forEach((c, i) => { c.style.setProperty('--i', i % 4); io.observe(c); });
  }

  /* --- Detalle --- */
  const modal = $('#product-modal');
  const setOpen = open => { modal.classList.toggle('is-open', open); modal.setAttribute('aria-hidden', String(!open)); document.body.classList.toggle('is-locked', open); };
  let imgs = [], cur = 0;
  function show(i) {
    cur = (i + imgs.length) % imgs.length;
    $('#product-main').src = imgs[cur];
    $$('.product__thumb').forEach((x, n) => x.classList.toggle('is-active', n === cur));
    $('.product__main').classList.remove('is-zoom');
  }
  function openProduct(p) {
    const wholesale = p.line === 'mayorista', main = $('#product-main'), thumbs = $('#product-thumbs');
    $('#product-title').textContent = p.title;
    $('#product-price').textContent = wholesale ? `${fmt(p.price)} por unidad${p.minQty ? ` · mínimo ${p.minQty} unidades` : ''}` : fmt(p.price);
    $('#product-desc').textContent = p.description || ''; $('#product-desc').hidden = !p.description;
    $('#product-inquire span').textContent = wholesale ? 'Consultar compra mayorista' : 'Consultar por WhatsApp';
    $('#product-inquire').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(`Hola Aurora! Quiero consultar por: ${p.title}${wholesale ? ' (mayorista)' : ''}`);
    imgs = p.images; cur = 0; $('.product__main').classList.remove('is-zoom');
    main.style.opacity = 1; main.src = p.images[0]; main.alt = p.title;
    thumbs.replaceChildren(); thumbs.hidden = p.images.length < 2;
    p.images.forEach((src, i) => {
      const b = el('button', 'product__thumb' + (i ? '' : ' is-active')); b.type = 'button'; b.setAttribute('aria-label', 'Ver foto ' + (i + 1));
      const im = el('img'); im.src = src; im.alt = ''; b.append(im);
      b.addEventListener('click', () => show(i));
      thumbs.append(b);
    });
    setOpen(true);
  }
  modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

  $$('.tab').forEach(t => t.addEventListener('click', () => { line = t.dataset.line; history.replaceState(null, '', line === 'mayorista' ? '#mayorista' : location.pathname); render(); }));
  window.addEventListener('hashchange', () => { line = location.hash === '#mayorista' ? 'mayorista' : 'minorista'; render(); });
  /* Zoom de la foto (clic / toque) y deslizar para cambiar de foto en el celular */
  const box = $('.product__main'), mainImg = $('#product-main'); let sx = null;
  box.addEventListener('click', () => box.classList.toggle('is-zoom'));
  box.addEventListener('pointermove', e => {
    if (!box.classList.contains('is-zoom')) return;
    const r = box.getBoundingClientRect();
    mainImg.style.transformOrigin = `${(e.clientX - r.left) / r.width * 100}% ${(e.clientY - r.top) / r.height * 100}%`;
  });
  box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', e => {
    if (sx == null || box.classList.contains('is-zoom')) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 45 && imgs.length > 1) show(cur + (dx < 0 ? 1 : -1));
  });
  render();
})();
