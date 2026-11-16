/* =========================================================
   AURORA MODA — app.js
   JavaScript vanilla, sin dependencias.
   Índice:
   1. Configuración (editar aquí)
   2. Utilidades
   3. Almacenamiento (localStorage) y datos
   4. Modales
   5. Animaciones: loader, scroll, reveal, cursor, magnético
   6. Navegación
   7. Catálogo público y detalle de producto
   8. Autenticación del panel
   9. Panel de administración (CRUD de publicaciones)
   10. Contacto y redes
   11. Inicio
   ========================================================= */
(() => {
  'use strict';

  /* =======================================================
     1. CONFIGURACIÓN — todo lo editable está en este bloque
     ======================================================= */
  const CONFIG = {
    // Único correo autorizado para entrar al panel de administración
    adminEmail: 'silviasantamaria76@gmail.com',

    // PLACEHOLDER: correo público de contacto (opcional).
    // Si lo completas, el formulario de contacto abre el correo del visitante hacia esta dirección.
    // Si queda vacío, el formulario copia el mensaje y abre el chat de Instagram.
    contactEmail: '',

    // Redes sociales. Las que tengan "url" vacía NO se muestran.
    // PLACEHOLDER: completa las url cuando tengas las cuentas.
    socials: [
      { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/auroramoda.ok', icon: 'icon-instagram' },
      { id: 'tiktok',    label: 'TikTok',    url: 'https://www.tiktok.com/@auroramoda.ok',    icon: 'icon-tiktok' },
      { id: 'facebook',  label: 'Facebook',  url: '' /* PLACEHOLDER: https://facebook.com/TU-CUENTA */ },
      { id: 'whatsapp',  label: 'WhatsApp',  url: 'https://wa.me/5491149754536', icon: 'icon-whatsapp' },
      { id: 'pinterest', label: 'Pinterest', url: '' /* PLACEHOLDER: https://pinterest.com/TU-CUENTA */ }
    ],

    limits: {
      maxImages: 8,            // fotos por publicación
      maxImageSide: 1000,      // px del lado más largo (se reducen para ahorrar espacio)
      jpegQuality: 0.75,
      storageBudgetChars: 4500000 // referencia aproximada del cupo de localStorage
    },

    security: {
      maxAttempts: 5,          // intentos fallidos antes de bloquear
      lockSeconds: 60,         // duración del bloqueo
      sessionMinutes: 60       // duración de la sesión de administración
    }
  };

  /* =======================================================
     2. UTILIDADES
     ======================================================= */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** Crea un elemento DOM de forma segura (nunca interpreta HTML de usuario). */
  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [key, val] of Object.entries(props)) {
      if (val == null || val === false) continue;
      if (key === 'class') node.className = val;
      else if (key === 'text') node.textContent = val;
      else if (key.startsWith('on') && typeof val === 'function') node.addEventListener(key.slice(2), val);
      else node.setAttribute(key, val === true ? '' : val);
    }
    kids.flat().forEach(kid => {
      if (kid == null || kid === false) return;
      node.append(kid.nodeType ? kid : document.createTextNode(kid));
    });
    return node;
  }

  /** Icono SVG que referencia el sprite del index.html */
  function svgIcon(id, cls = 'icon') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.append(use);
    return svg;
  }

  /** Almacenamiento resistente a modo privado / bloqueos: cae a memoria si falla. */
  function safeStorage(type) {
    try {
      const s = window[type];
      s.setItem('__aurora_test', '1');
      s.removeItem('__aurora_test');
      return s;
    } catch (_) {
      const mem = new Map();
      return {
        getItem: k => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => { mem.set(k, String(v)); },
        removeItem: k => { mem.delete(k); }
      };
    }
  }
  const ls = safeStorage('localStorage');
  const ss = safeStorage('sessionStorage');

  const readJSON = (store, key) => { try { return JSON.parse(store.getItem(key)); } catch (_) { return null; } };

  const priceFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const fmtPrice = n => (Number(n) > 0 ? priceFmt.format(n) : 'Consultar');
  const fmtDate  = ts => new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

  /** Aviso flotante */
  function toast(message, type = 'info') {
    const node = el('div', { class: `toast toast--${type}`, role: 'status', text: message });
    $('#toasts').append(node);
    requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-in')));
    setTimeout(() => {
      node.classList.remove('is-in');
      setTimeout(() => node.remove(), 800);
    }, 3800);
  }

  /* =======================================================
     3. ALMACENAMIENTO Y DATOS
     ======================================================= */
  const Store = {
    KEY: 'aurora_moda_posts_v1',

    read() {
      const data = readJSON(ls, this.KEY);
      return Array.isArray(data) ? data.map(sanitizePost).filter(Boolean) : [];
    },

    /** Devuelve false si el navegador rechaza la escritura (cupo lleno). */
    write(list) {
      try { ls.setItem(this.KEY, JSON.stringify(list)); return true; }
      catch (_) { return false; }
    },

    usedChars() { return (ls.getItem(this.KEY) || '').length; }
  };

  /** Valida y normaliza una publicación (también protege contra datos importados dañados). */
  function sanitizePost(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title || '').trim().slice(0, 120);
    const price = Number(raw.price);
    const images = (Array.isArray(raw.images) ? raw.images : [])
      .filter(src => typeof src === 'string' && src.startsWith('data:image/'))
      .slice(0, CONFIG.limits.maxImages);
    if (!title || !isFinite(price) || price < 0 || !images.length) return null;
    const now = Date.now();
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : uid(),
      title,
      price,
      description: String(raw.description || '').trim().slice(0, 3000),
      line: raw.line === 'mayorista' ? 'mayorista' : 'minorista',
      minQty: Math.max(0, Math.floor(Number(raw.minQty) || 0)),
      images,
      createdAt: Number(raw.createdAt) || now,
      updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || now
    };
  }

  const state = { posts: Store.read() };
  const sortedPosts = () => [...state.posts].sort((a, b) => b.createdAt - a.createdAt);

  /* =======================================================
     4. MODALES (y capas como el panel de administración)
     ======================================================= */
  const modalStack = [];

  function openModal(node) {
    if (!node || node.classList.contains('is-open')) return;
    node._returnFocus = document.activeElement;
    node.classList.add('is-open');
    node.setAttribute('aria-hidden', 'false');
    modalStack.push(node);
    document.body.classList.add('is-locked');
    setTimeout(() => {
      const target = $('[data-autofocus]', node) ||
        $('input:not([type=hidden]):not([type=file]):not([hidden]), textarea, button:not([data-close])', node);
      if (target) target.focus({ preventScroll: true });
    }, 150);
  }

  function closeModal(node) {
    if (!node || !node.classList.contains('is-open')) return;
    node.classList.remove('is-open');
    node.setAttribute('aria-hidden', 'true');
    const i = modalStack.indexOf(node);
    if (i > -1) modalStack.splice(i, 1);
    if (!modalStack.length) document.body.classList.remove('is-locked');
    const back = node._returnFocus;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
    node.dispatchEvent(new CustomEvent('modal:closed'));
  }

  function initModals() {
    // Cualquier elemento con data-close cierra su modal / panel
    document.addEventListener('click', e => {
      const trigger = e.target.closest('[data-close]');
      if (trigger) closeModal(trigger.closest('.modal, .admin'));
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (modalStack.length) closeModal(modalStack[modalStack.length - 1]);
        else if (document.body.classList.contains('nav-open')) setNav(false);
        return;
      }
      // Trampa de foco dentro de la capa superior
      if (e.key === 'Tab' && modalStack.length) {
        const top = modalStack[modalStack.length - 1];
        const focusables = $$('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', top)
          .filter(n => n.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /** Diálogo de confirmación que devuelve una promesa<boolean>. */
  function confirmDialog({ title, text, ok = 'Eliminar' }) {
    return new Promise(resolve => {
      const modal = $('#confirm-modal');
      const okBtn = $('#confirm-ok');
      $('#confirm-title').textContent = title;
      $('#confirm-text').textContent = text;
      $('#confirm-ok-label').textContent = ok;
      let accepted = false;
      const onOk = () => { accepted = true; closeModal(modal); };
      const onClosed = () => {
        okBtn.removeEventListener('click', onOk);
        modal.removeEventListener('modal:closed', onClosed);
        resolve(accepted);
      };
      okBtn.addEventListener('click', onOk);
      modal.addEventListener('modal:closed', onClosed);
      openModal(modal);
    });
  }

  /* =======================================================
     5. ANIMACIONES
     ======================================================= */

  /* --- Loader de entrada --- */
  function initLoader() {
    const loader = $('#loader');
    const counter = $('#loader-count');
    const MIN_TIME = 1800;
    const start = performance.now();
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      loader.classList.add('is-done');
      document.body.classList.remove('is-loading');
      setTimeout(() => document.body.classList.add('is-ready'), reduceMotion ? 0 : 600); // dispara la animación del hero
      setTimeout(() => loader.remove(), 1800);
    };

    if (reduceMotion) { finish(); return; }

    // Contador 000 → 100
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / MIN_TIME);
      const eased = 1 - Math.pow(1 - p, 3);
      counter.textContent = String(Math.round(eased * 100)).padStart(3, '0');
      if (p < 1 && !finished) requestAnimationFrame(tick);
    };
    tick();

    const whenReady = () => setTimeout(finish, Math.max(0, MIN_TIME - (performance.now() - start)));
    if (document.readyState === 'complete') whenReady();
    else window.addEventListener('load', whenReady, { once: true });
    setTimeout(finish, 5500); // seguridad: nunca dejar el loader colgado
  }

  /* --- Reveal al hacer scroll --- */
  let revealObserver = null;

  function initReveal() {
    $$('[data-reveal]').forEach(node => {
      const d = Number(node.dataset.delay || 0);
      if (d) node.style.setProperty('--d', (d * 0.12) + 's');
    });
    if (!('IntersectionObserver' in window)) {
      $$('[data-reveal]').forEach(n => n.classList.add('is-visible'));
      return;
    }
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal]').forEach(n => revealObserver.observe(n));
  }

  /** Registra un elemento creado dinámicamente para el reveal. */
  function reveal(node) {
    if (revealObserver) revealObserver.observe(node);
    else node.classList.add('is-visible');
  }

  /* --- Scroll: header, barra de progreso y parallax del hero --- */
  function initScrollEffects() {
    const header = $('#header');
    const bar = $('#progress');
    const hero = $('#inicio'), inner = $('.hero__inner'), sign = $('#hero-sign');
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 40);
      const root = document.documentElement;
      const max = root.scrollHeight - root.clientHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      if (y < window.innerHeight * 1.3) { const s = Math.min(1, y / window.innerHeight).toFixed(3); inner.style.setProperty('--scroll', s); if (sign) sign.style.setProperty('--z', (1 + s * .45).toFixed(3)); }
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* --- Cursor personalizado (solo con mouse) --- */
  function initCursor() {
    if (reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const cursor = $('#cursor');
    document.documentElement.classList.add('has-cursor');
    let tx = -100, ty = -100, x = -100, y = -100;

    window.addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    const loop = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      cursor.style.transform = `translate3d(${x - cursor.offsetWidth / 2}px, ${y - cursor.offsetHeight / 2}px, 0)`;
      requestAnimationFrame(loop);
    };
    loop();

    const interactive = 'a, button, [role="button"], input, textarea, label, .dropzone, .card';
    document.addEventListener('mouseover', e => cursor.classList.toggle('is-hover', !!e.target.closest(interactive)));
    document.addEventListener('mouseleave', () => { cursor.style.opacity = 0; });
    document.addEventListener('mouseenter', () => { cursor.style.opacity = ''; });
  }

  /* --- Botones "magnéticos" --- */
  function initMagnetic() {
    if (reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    $$('[data-magnetic]').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = `translate(${dx * 0.14}px, ${dy * 0.22}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  /* --- Marquesina: duplica el grupo para un bucle continuo --- */
  function initMarquee() {
    const track = $('.marquee__track');
    const group = $('.marquee__group');
    if (track && group) track.append(group.cloneNode(true));
  }

  /* --- Cartel del hero: péndulo amortiguado, como el letrero de una puerta --- */
  function initSign() {
    const sign = $('#hero-sign'), hero = $('#inicio');
    if (!sign || reduceMotion) return;
    let a = 0, v = 0, last = 0, lastX = null, next = 0, running = false;
    const kick = p => { v += p; if (!running) start(); };
    const frame = t => {
      const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
      v += (-6 * a - .32 * v) * dt;               // resorte + roce
      a = Math.max(-20, Math.min(20, a + v * dt));
      sign.style.setProperty('--sway', a.toFixed(3) + 'deg');
      if (t > next) { kick((Math.random() < .5 ? -1 : 1) * (11 + Math.random() * 8)); next = t + 6000 + Math.random() * 5000; }
      if (running) requestAnimationFrame(frame);
    };
    const start = () => { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); };
    new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); else running = false; }).observe(hero);
    hero.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse' && lastX !== null) kick(Math.max(-25, Math.min(25, (e.clientX - lastX) * .07)));
      lastX = e.clientX;
    }, { passive: true });
    hero.addEventListener('pointerdown', () => kick((Math.random() < .5 ? -1 : 1) * 24), { passive: true });
    let lastG = null;
    const tilt = e => {
      if (e.gamma == null || hero.getBoundingClientRect().bottom < 0) return;
      if (lastG !== null) kick(Math.max(-30, Math.min(30, (e.gamma - lastG) * .9)));
      lastG = e.gamma;
    };
    const enableTilt = () => window.addEventListener('deviceorientation', tilt, { passive: true });
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      hero.addEventListener('pointerdown', () => DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') enableTilt(); }).catch(() => {}), { once: true });
    } else if (window.matchMedia('(pointer: coarse)').matches) enableTilt();
    setTimeout(() => { kick(40); next = performance.now() + 7000; }, 2400); // la "puerta" se abre al terminar el loader
  }

  /* =======================================================
     6. NAVEGACIÓN
     ======================================================= */
  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    const burger = $('#burger');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  }

  function initNav() {
    $('#burger').addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
    $$('.nav__link, .brand').forEach(a => a.addEventListener('click', () => setNav(false)));
    window.addEventListener('resize', () => { if (window.innerWidth > 860) setNav(false); });

    // Resalta la sección visible en el menú
    if (!('IntersectionObserver' in window)) return;
    const links = new Map($$('.nav__link').map(a => [a.dataset.section, a]));
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        links.forEach(a => a.removeAttribute('aria-current'));
        const active = links.get(entry.target.id);
        if (active) active.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((_, id) => { const sec = document.getElementById(id); if (sec) spy.observe(sec); });
  }

  /* =======================================================
     7. CATÁLOGO PÚBLICO Y DETALLE
     ======================================================= */
  function buildCard(post, index) {
    const media = el('div', { class: 'card__media' },
      el('img', { class: 'card__img', src: post.images[0], alt: post.title, loading: 'lazy', decoding: 'async' }),
      post.images[1] && el('img', { class: 'card__img card__img--alt', src: post.images[1], alt: '', 'aria-hidden': 'true', loading: 'lazy', decoding: 'async' }),
      el('span', { class: 'card__cta', text: 'Ver detalle' })
    );
    const card = el('article', {
      class: 'card', tabindex: '0', role: 'button', 'aria-label': `Ver ${post.title}`,
      'data-reveal': 'up', style: `--d:${(index % 4) * 0.1}s`
    },
      media,
      el('div', { class: 'card__body' },
        el('h3', { class: 'card__title', text: post.title }),
        el('p', { class: 'card__price', text: fmtPrice(post.price) })
      )
    );
    card.addEventListener('click', () => openProduct(post.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProduct(post.id); }
    });
    return card;
  }

  function renderCatalog() {
    const grid = $('#catalog-grid');
    if (!grid) return;
    const empty = $('#catalog-empty');
    const list = sortedPosts();
    grid.replaceChildren();
    grid.hidden = list.length === 0;
    empty.hidden = list.length > 0;
    list.forEach((post, i) => {
      const card = buildCard(post, i);
      grid.append(card);
      reveal(card);
    });
  }

  function instagramHandle() {
    const ig = CONFIG.socials.find(s => s.id === 'instagram' && s.url);
    if (!ig) return null;
    try { return new URL(ig.url).pathname.split('/').filter(Boolean)[0] || null; } catch (_) { return null; }
  }

  function openProduct(id) {
    const post = state.posts.find(p => p.id === id);
    if (!post) return;
    const main = $('#product-main');
    const thumbs = $('#product-thumbs');

    $('#product-title').textContent = post.title;
    $('#product-price').textContent = fmtPrice(post.price);
    $('#product-desc').textContent = post.description || '';
    $('#product-desc').hidden = !post.description;

    main.style.opacity = 1;
    main.src = post.images[0];
    main.alt = post.title;

    thumbs.replaceChildren();
    thumbs.hidden = post.images.length < 2;
    post.images.forEach((src, i) => {
      const btn = el('button', {
        type: 'button', class: 'product__thumb' + (i === 0 ? ' is-active' : ''), 'aria-label': `Ver foto ${i + 1}`,
        onclick: () => {
          $$('.product__thumb', thumbs).forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          main.style.opacity = 0;
          setTimeout(() => { main.src = src; main.style.opacity = 1; }, 260);
        }
      }, el('img', { src, alt: '' }));
      thumbs.append(btn);
    });

    // Botón de consulta → mensaje directo de Instagram (si hay cuenta configurada)
    const inquire = $('#product-inquire');
    const handle = instagramHandle();
    inquire.hidden = !handle;
    if (handle) inquire.href = `https://ig.me/m/${handle}`;

    openModal($('#product-modal'));
  }

  /* =======================================================
     8. AUTENTICACIÓN DEL PANEL
     IMPORTANTE: es un login del lado del cliente. Sirve para ocultar el panel
     a visitantes comunes, pero NO es seguridad real (cualquiera con acceso al
     navegador y conocimientos técnicos puede saltárselo). Para seguridad real
     hace falta un backend. La contraseña nunca se guarda en texto plano:
     se almacena como hash PBKDF2 con sal aleatoria.
     ======================================================= */
  function fallbackHash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }

  const Auth = {
    KEYS: { cred: 'aurora_moda_admin_cred_v1', session: 'aurora_moda_session_v1', fails: 'aurora_moda_fails_v1' },

    isAdminEmail: email => String(email).trim().toLowerCase() === CONFIG.adminEmail.toLowerCase(),
    hasPassword() { const c = readJSON(ls, this.KEYS.cred); return !!(c && c.hash && c.salt); },

    randomHex(n = 16) {
      const bytes = new Uint8Array(n);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
      else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
      return toHex(bytes);
    },

    async derive(password, salt) {
      if (window.crypto && crypto.subtle) {
        try {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
          const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
          return 'p1:' + toHex(new Uint8Array(bits));
        } catch (_) { /* cae al hash de respaldo */ }
      }
      return 'f1:' + fallbackHash(salt + '::' + password);
    },

    async setPassword(password) {
      const salt = this.randomHex(16);
      ls.setItem(this.KEYS.cred, JSON.stringify({ salt, hash: await this.derive(password, salt) }));
    },

    async verify(password) {
      const c = readJSON(ls, this.KEYS.cred);
      if (!c) return false;
      return (await this.derive(password, c.salt)) === c.hash;
    },

    // --- Bloqueo tras intentos fallidos ---
    lockRemaining() {
      const f = readJSON(ls, this.KEYS.fails) || { count: 0, until: 0 };
      return Math.max(0, Math.ceil((f.until - Date.now()) / 1000));
    },
    registerFail() {
      const f = readJSON(ls, this.KEYS.fails) || { count: 0, until: 0 };
      f.count = (f.count || 0) + 1;
      if (f.count >= CONFIG.security.maxAttempts) { f.until = Date.now() + CONFIG.security.lockSeconds * 1000; f.count = 0; }
      ls.setItem(this.KEYS.fails, JSON.stringify(f));
    },
    clearFails() { ls.removeItem(this.KEYS.fails); },

    // --- Sesión (se pierde al cerrar la pestaña) ---
    start() { ss.setItem(this.KEYS.session, JSON.stringify({ exp: Date.now() + CONFIG.security.sessionMinutes * 60000 })); },
    end() { ss.removeItem(this.KEYS.session); },
    isLogged() { const s = readJSON(ss, this.KEYS.session); return !!(s && s.exp > Date.now()); }
  };

  function initLogin() {
    const modal = $('#login-modal');
    const form = $('#login-form');
    const errorBox = $('#login-error');
    let setupMode = false;

    const showError = msg => { errorBox.textContent = msg; };
    const shake = () => {
      const dialog = $('.modal__dialog', modal);
      dialog.classList.remove('is-shake'); void dialog.offsetWidth; dialog.classList.add('is-shake');
    };

    window.openLogin = () => {
      setupMode = !Auth.hasPassword();
      form.reset();
      showError('');
      $('#login-confirm-wrap').hidden = !setupMode;
      $('#login-pass').autocomplete = setupMode ? 'new-password' : 'current-password';
      $('#login-submit-label').textContent = setupMode ? 'Crear contraseña y entrar' : 'Ingresar';
      $('#login-hint').textContent = setupMode
        ? 'Primer acceso: ingresa el correo autorizado y crea una contraseña (mínimo 8 caracteres).'
        : 'Ingresa con el correo autorizado y tu contraseña.';
      openModal(modal);
    };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const wait = Auth.lockRemaining();
      if (wait > 0) { showError(`Demasiados intentos. Espera ${wait} s.`); shake(); return; }

      const email = $('#login-email').value;
      const pass = $('#login-pass').value;
      if (!email.trim() || !pass) { showError('Completa el correo y la contraseña.'); return; }

      const submitBtn = $('button[type=submit]', form);
      submitBtn.disabled = true;
      try {
        if (setupMode) {
          if (!Auth.isAdminEmail(email)) { Auth.registerFail(); showError('Este correo no está autorizado.'); shake(); return; }
          if (pass.length < 8) { showError('La contraseña debe tener al menos 8 caracteres.'); return; }
          if (pass !== $('#login-confirm').value) { showError('Las contraseñas no coinciden.'); return; }
          await Auth.setPassword(pass);
        } else {
          const ok = Auth.isAdminEmail(email) && await Auth.verify(pass);
          if (!ok) { Auth.registerFail(); showError('Correo o contraseña incorrectos.'); shake(); return; }
        }
        Auth.clearFails();
        Auth.start();
        closeModal(modal);
        openAdmin();
      } finally {
        submitBtn.disabled = false;
      }
    });

    // Accesos al login / panel
    const entry = e => { e.preventDefault(); openAdmin(); };
    $('#admin-open').addEventListener('click', entry);
    $('#footer-admin').addEventListener('click', entry);
  }

  /* =======================================================
     9. PANEL DE ADMINISTRACIÓN
     ======================================================= */
  const admin = { editingId: null, images: [] };

  function requireSession() {
    if (Auth.isLogged()) return true;
    toast('Tu sesión expiró. Vuelve a ingresar.', 'error');
    closeModal($('#admin'));
    window.openLogin();
    return false;
  }

  function openAdmin() {
    if (!Auth.isLogged()) { window.openLogin(); return; }
    resetForm();
    renderAdminList();
    openModal($('#admin'));
  }

  /* --- Imágenes: lectura y optimización --- */
  const readFile = file => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const loadImage = src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  /** Redimensiona y comprime a JPEG para ahorrar espacio en localStorage. */
  async function processImage(file) {
    const img = await loadImage(await readFile(file));
    const scale = Math.min(1, CONFIG.limits.maxImageSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';               // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', CONFIG.limits.jpegQuality);
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length) { toast('Selecciona archivos de imagen.', 'error'); return; }
    const room = CONFIG.limits.maxImages - admin.images.length;
    if (room <= 0) { toast(`Máximo ${CONFIG.limits.maxImages} fotos por publicación.`, 'error'); return; }
    if (files.length > room) toast(`Solo se agregaron ${room} foto(s): el máximo es ${CONFIG.limits.maxImages}.`);

    const zone = $('#dropzone');
    zone.classList.add('is-busy');
    let failed = 0;
    for (const file of files.slice(0, room)) {
      try { admin.images.push(await processImage(file)); renderThumbs(); }
      catch (_) { failed++; }
    }
    zone.classList.remove('is-busy');
    if (failed) toast(`No se pudo leer ${failed} imagen(es). Prueba con JPG o PNG.`, 'error');
  }

  function renderThumbs() {
    const box = $('#thumbs');
    box.replaceChildren();
    admin.images.forEach((src, i) => {
      box.append(el('div', { class: 'thumb' },
        el('img', { src, alt: `Foto ${i + 1}` }),
        i === 0 && el('span', { class: 'thumb__badge', text: 'Portada' }),
        el('div', { class: 'thumb__actions' },
          i > 0 && el('button', {
            type: 'button', class: 'thumb__btn', title: 'Usar como portada', 'aria-label': 'Usar como portada', text: '★',
            onclick: () => { const [img] = admin.images.splice(i, 1); admin.images.unshift(img); renderThumbs(); }
          }),
          el('button', {
            type: 'button', class: 'thumb__btn', title: 'Quitar foto', 'aria-label': 'Quitar foto', text: '✕',
            onclick: () => { admin.images.splice(i, 1); renderThumbs(); }
          })
        )
      ));
    });
    $('#drop-count').textContent = `${admin.images.length}/${CONFIG.limits.maxImages}`;
  }

  function toggleMin() { $('#min-wrap').hidden = $('#post-line').value !== 'mayorista'; }

  /* --- Formulario --- */
  function resetForm() {
    admin.editingId = null;
    admin.images = [];
    $('#post-form').reset();
    $('#post-id').value = '';
    toggleMin();
    $('#form-title').textContent = 'Nueva publicación';
    $('#form-submit-label').textContent = 'Publicar';
    $('#form-cancel').hidden = true;
    $('#form-error').textContent = '';
    renderThumbs();
  }

  function editPost(id) {
    const post = state.posts.find(p => p.id === id);
    if (!post) return;
    admin.editingId = id;
    admin.images = [...post.images];
    $('#post-id').value = id;
    $('#post-title').value = post.title;
    $('#post-price').value = post.price;
    $('#post-desc').value = post.description;
    $('#post-line').value = post.line || 'minorista';
    $('#post-min').value = post.minQty || '';
    toggleMin();
    $('#form-title').textContent = 'Editar publicación';
    $('#form-submit-label').textContent = 'Guardar cambios';
    $('#form-cancel').hidden = false;
    $('#form-error').textContent = '';
    renderThumbs();
    $('#post-form').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    $('#post-title').focus({ preventScroll: true });
  }

  function savePost(e) {
    e.preventDefault();
    if (!requireSession()) return;

    const errorBox = $('#form-error');
    const title = $('#post-title').value.trim();
    const priceRaw = $('#post-price').value;
    const price = Number(priceRaw);
    const description = $('#post-desc').value.trim();
    const line = $('#post-line').value === 'mayorista' ? 'mayorista' : 'minorista';
    const minQty = line === 'mayorista' ? Math.max(0, Math.floor(Number($('#post-min').value) || 0)) : 0;

    if (!title) { errorBox.textContent = 'Escribe un título.'; return; }
    if (priceRaw === '' || !isFinite(price) || price < 0) { errorBox.textContent = 'Ingresa un precio válido (0 o más).'; return; }
    if (!admin.images.length) { errorBox.textContent = 'Sube al menos una foto.'; return; }
    errorBox.textContent = '';

    const previous = state.posts;
    const now = Date.now();
    if (admin.editingId) {
      state.posts = state.posts.map(p => p.id === admin.editingId
        ? { ...p, title, price, line, minQty, description, images: [...admin.images], updatedAt: now }
        : p);
    } else {
      state.posts = [...state.posts, { id: uid(), title, price, line, minQty, description, images: [...admin.images], createdAt: now, updatedAt: now }];
    }

    if (!Store.write(state.posts)) {
      state.posts = previous; // revertir: no hubo espacio
      errorBox.textContent = 'No hay espacio suficiente en el navegador. Quita fotos o elimina publicaciones antiguas.';
      toast('No se pudo guardar: almacenamiento lleno.', 'error');
      return;
    }

    const wasEditing = !!admin.editingId;
    renderCatalog();
    resetForm();
    renderAdminList();
    toast(wasEditing ? 'Cambios guardados.' : 'Publicación creada.');
  }

  async function deletePost(id) {
    const post = state.posts.find(p => p.id === id);
    if (!post || !requireSession()) return;
    const ok = await confirmDialog({
      title: 'Eliminar publicación',
      text: `Se eliminará «${post.title}». Esta acción no se puede deshacer.`
    });
    if (!ok) return;
    const previous = state.posts;
    state.posts = state.posts.filter(p => p.id !== id);
    if (!Store.write(state.posts)) { state.posts = previous; toast('No se pudo eliminar.', 'error'); return; }
    if (admin.editingId === id) resetForm();
    renderCatalog();
    renderAdminList();
    toast('Publicación eliminada.');
  }

  /* --- Listado --- */
  function renderAdminList() {
    const list = sortedPosts();
    const ul = $('#admin-list');
    ul.replaceChildren();
    $('#admin-count').textContent = list.length;
    $('#admin-empty').hidden = list.length > 0;

    list.forEach((post, i) => {
      const photos = `${post.images.length} foto${post.images.length === 1 ? '' : 's'}`;
      ul.append(el('li', { class: 'row', style: `--i:${i}` },
        el('img', { class: 'row__thumb', src: post.images[0], alt: '' }),
        el('div', { class: 'row__info' },
          el('h4', { class: 'row__title', text: post.title }),
          el('p', { class: 'row__meta', text: `${post.line === 'mayorista' ? 'Mayorista · ' : ''}${fmtPrice(post.price)} · ${photos} · ${fmtDate(post.updatedAt)}` })
        ),
        el('div', { class: 'row__actions' },
          el('button', { type: 'button', class: 'link-btn', text: 'Editar', onclick: () => editPost(post.id) }),
          el('button', { type: 'button', class: 'link-btn link-btn--danger', text: 'Eliminar', onclick: () => deletePost(post.id) })
        )
      ));
    });
    updateMeter();
  }

  function updateMeter() {
    const ratio = Math.min(1, Store.usedChars() / CONFIG.limits.storageBudgetChars);
    $('#meter-bar').style.transform = `scaleX(${ratio})`;
    const pct = Math.round(ratio * 100);
    $('#meter-text').textContent = pct >= 85
      ? `Almacenamiento casi lleno (${pct}%). Exporta una copia y elimina publicaciones antiguas.`
      : `Almacenamiento usado: ${pct}% (aprox.)`;
  }

  /* --- Exportar / importar copia de seguridad --- */
  function exportData() {
    const payload = { app: 'aurora-moda', version: 1, exportedAt: new Date().toISOString(), posts: state.posts };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: `aurora-moda-catalogo-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Copia de seguridad descargada.');
  }

  async function importData(file) {
    if (!file || !requireSession()) return;
    let incoming;
    try {
      const data = JSON.parse(await file.text());
      const rawList = Array.isArray(data) ? data : data.posts;
      incoming = (Array.isArray(rawList) ? rawList : []).map(sanitizePost).filter(Boolean);
    } catch (_) { toast('El archivo no es una copia válida.', 'error'); return; }
    if (!incoming.length) { toast('El archivo no contiene publicaciones válidas.', 'error'); return; }

    const ok = await confirmDialog({
      title: 'Importar publicaciones',
      text: `Se importarán ${incoming.length} publicación(es). Si ya existen con el mismo identificador, se reemplazarán.`,
      ok: 'Importar'
    });
    if (!ok) return;

    const previous = state.posts;
    const map = new Map(state.posts.map(p => [p.id, p]));
    incoming.forEach(p => map.set(p.id, p));
    state.posts = Array.from(map.values());
    if (!Store.write(state.posts)) { state.posts = previous; toast('No hay espacio suficiente para importar.', 'error'); return; }
    renderCatalog();
    renderAdminList();
    toast('Importación completada.');
  }

  /* --- Cambiar contraseña --- */
  function initPasswordChange() {
    const modal = $('#password-modal');
    const form = $('#password-form');
    const errorBox = $('#pw-error');

    $('#admin-password').addEventListener('click', () => { form.reset(); errorBox.textContent = ''; openModal(modal); });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!requireSession()) return;
      const current = $('#pw-current').value, next = $('#pw-new').value, again = $('#pw-confirm').value;
      if (!(await Auth.verify(current))) { errorBox.textContent = 'La contraseña actual no es correcta.'; return; }
      if (next.length < 8) { errorBox.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
      if (next !== again) { errorBox.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
      await Auth.setPassword(next);
      closeModal(modal);
      toast('Contraseña actualizada.');
    });
  }

  function initAdminPanel() {
    const zone = $('#dropzone');
    const fileInput = $('#post-files');

    // Zona de arrastrar y soltar
    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(t => zone.addEventListener(t, e => { e.preventDefault(); zone.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(t => zone.addEventListener(t, e => { e.preventDefault(); zone.classList.remove('is-over'); }));
    zone.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

    $('#post-form').addEventListener('submit', savePost);
    $('#post-line').addEventListener('change', toggleMin);
    $('#form-cancel').addEventListener('click', resetForm);
    $('#admin-export').addEventListener('click', () => { if (requireSession()) exportData(); });
    $('#admin-import-file').addEventListener('change', e => { importData(e.target.files[0]); e.target.value = ''; });
    $('#admin-logout').addEventListener('click', () => {
      Auth.end();
      closeModal($('#admin'));
      toast('Sesión cerrada.');
    });

    initPasswordChange();
  }

  /* =======================================================
     10. CONTACTO Y REDES
     ======================================================= */
  function handleOf(url) {
    try {
      const part = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
      return part ? '@' + part.replace(/^@/, '') : new URL(url).hostname.replace(/^www\./, '');
    } catch (_) { return url; }
  }

  function renderSocials() {
    const active = CONFIG.socials.filter(s => s.url);

    // Footer: botones redondos con icono (o con texto si la red no tiene icono)
    const footer = $('#footer-socials');
    footer.replaceChildren();
    active.forEach(s => {
      footer.append(el('li', {},
        el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': s.label, title: s.label },
          s.icon ? svgIcon(s.icon) : s.label)
      ));
    });

    // Contacto: filas grandes
    const channels = $('#contact-channels');
    channels.replaceChildren();
    const rows = active.map(s => ({ icon: s.icon, label: s.label, value: s.id === 'whatsapp' ? '+54 9 11 4975-4536' : handleOf(s.url), href: s.url, external: true }));
    if (CONFIG.contactEmail) rows.push({ icon: null, label: 'Correo', value: CONFIG.contactEmail, href: `mailto:${CONFIG.contactEmail}`, external: false });
    rows.forEach(r => {
      channels.append(el('li', {},
        el('a', { class: 'channel', href: r.href, target: r.external ? '_blank' : null, rel: r.external ? 'noopener noreferrer' : null },
          r.icon ? svgIcon(r.icon) : el('span'),
          el('span', {}, el('span', { class: 'channel__label', text: r.label }), el('span', { class: 'channel__value', text: r.value })),
          svgIcon('icon-arrow')
        )
      ));
    });
  }

  function initContactForm() {
    const form = $('#contact-form');
    const errorBox = $('#contact-error');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#contact-name').value.trim();
      const reach = $('#contact-reach').value.trim();
      const message = $('#contact-message').value.trim();
      if (!name || !message) { errorBox.textContent = 'Completa tu nombre y el mensaje.'; return; }
      errorBox.textContent = '';

      const subject = `Consulta desde la web — ${name}`;
      const body = `${message}\n\n— ${name}${reach ? ` (${reach})` : ''}`;

      if (CONFIG.contactEmail) {
        window.location.href = `mailto:${CONFIG.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        toast('Abriendo tu aplicación de correo…');
      } else {
        // Sin correo configurado: el mensaje se envía por WhatsApp
        window.open(`https://wa.me/5491149754536?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
        toast('Abriendo WhatsApp…');
      }
      form.reset();
    });
  }

  /* =======================================================
     11. INICIO
     ======================================================= */
  function init() {
    $('#year').textContent = new Date().getFullYear();

    initLoader();
    initModals();
    initReveal();
    initScrollEffects();
    initCursor();
    initMagnetic();
    initMarquee();
    initSign();
    initNav();

    renderSocials();
    renderCatalog();
    initContactForm();
    initLogin();
    initAdminPanel();

    // Acceso directo: tudominio.com/#admin
    if (window.location.hash === '#admin') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setTimeout(openAdmin, 2600);
    }
  }

  init();
})();