'use strict';
(() => {
  const api = window.api;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

  const lang = api.lang === 'ru' ? 'ru' : 'en';
  const LOCALE = lang === 'ru' ? 'ru-RU' : 'en-US';
  const t = (key, params) => window.I18n.t(lang, key, params);
  const tn = (n, one, other, params) => window.I18n.tn(lang, n, one, other, params);
  document.documentElement.lang = lang;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtPart = (opts, d) => new Intl.DateTimeFormat(LOCALE, opts).format(d);
  const MONTHS = Array.from({ length: 12 }, (_, i) => cap(fmtPart({ month: 'long' }, new Date(2021, i, 1))));
  const MONTHS_SHORT = Array.from({ length: 12 }, (_, i) => cap(fmtPart({ month: 'short' }, new Date(2021, i, 1)).replace(/\.$/, '')));
  const WEEKDAYS_LONG = Array.from({ length: 7 }, (_, i) => cap(fmtPart({ weekday: 'long' }, new Date(2021, 7, 1 + i))));
  const WEEKDAYS_SHORT = Array.from({ length: 7 }, (_, i) => cap(fmtPart({ weekday: 'short' }, new Date(2021, 7, 1 + i)).replace(/\.$/, '')));
  const longDate = (d, withYear = false) => cap(fmtPart({ weekday: 'long', month: 'long', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }, d));
  const shortDate = (d) => fmtPart({ month: 'short', day: 'numeric' }, d).replace(/\.$/, '');

  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'className') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
    return node;
  }

  const ICONS = {
    chevL: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
    chevR: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
    x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
    check: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 6.3 2.4 2.4 4.6-5.4"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.4"/><rect x="13.5" y="5" width="4" height="14" rx="1.4"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4 4.5v4h4"/></svg>',
    skip: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6.2v11.6a.9.9 0 0 0 1.4.75l8.3-5.8a.9.9 0 0 0 0-1.5L7.4 5.45A.9.9 0 0 0 6 6.2Z"/><rect x="17" y="5.5" width="2.4" height="13" rx="1.2"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="6.5" width="11" height="11" rx="2.4"/></svg>',
    list: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.6" cy="4" r=".6" fill="currentColor"/><circle cx="2.6" cy="8" r=".6" fill="currentColor"/><circle cx="2.6" cy="12" r=".6" fill="currentColor"/></svg>',
    chevD: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg>',
    gear: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/></svg>',
    note: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5h6l3 3v8H4z"/><path d="M10 2.5v3h3"/></svg>',
  };
  const icon = (name) => ICONS[name];

  const star = () => el('img', { className: 'star', src: 'star.png', alt: '', draggable: 'false' });

  function ensureFolderDefs() {
    if (document.getElementById('folder-defs')) return;
    const svg = el('div', {
      id: 'folder-defs', style: 'position:absolute;width:0;height:0;overflow:hidden',
      html: '<svg width="0" height="0"><defs>' +
        '<linearGradient id="fg-back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--folder-back-1)"/><stop offset="1" style="stop-color:var(--folder-back-2)"/></linearGradient>' +
        '<linearGradient id="fg-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--folder-front-1)"/><stop offset="1" style="stop-color:var(--folder-front-2)"/></linearGradient>' +
        '</defs></svg>',
    });
    document.body.append(svg);
  }
  const folderSvg = () => '<svg viewBox="0 0 44 44"><path d="M3 9.5a3.5 3.5 0 0 1 3.5-3.5h8.3c1 0 1.9.4 2.5 1.1l1.6 1.9H37.5A3.5 3.5 0 0 1 41 12.5V34a3.5 3.5 0 0 1-3.5 3.5h-31A3.5 3.5 0 0 1 3 34z" fill="url(#fg-back)"/>' +
    '<rect x="1.5" y="12" width="41" height="26" rx="4.5" fill="url(#fg-front)"/><path d="M6 12.5h32" stroke="#fff" stroke-opacity=".38" stroke-width="1" stroke-linecap="round"/></svg>';

  const Q = 8;
  const look = { cfg: null, wall: null, geom: null, surface: null, scheme: null, vars: [], images: new Map(), rasters: new Map(), frame: 0 };

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const systemScheme = () => (mq.matches ? 'dark' : 'light');
  document.documentElement.dataset.scheme = systemScheme();
  mq.addEventListener('change', () => { if (!look.surface) document.documentElement.dataset.scheme = systemScheme(); });

  const hexToRgb = (hex) => (window.Color.isHex(hex) ? window.Color.toRgb(hex) : null);

  function wallEntry() {
    const wall = look.wall;
    const geom = look.geom;
    if (!wall || !wall.displays.length) return null;
    return (geom && wall.displays.find((e) => e.key === geom.display.key)) || wall.displays[0];
  }
  const imageOf = (entry) => (entry && entry.image ? look.wall.images[entry.image] : null);

  function loadImage(id, info) {
    let rec = look.images.get(id);
    if (!rec) {
      const img = new Image();
      rec = { img, ready: false };
      img.onload = () => { rec.ready = true; look.rasters.clear(); schedule(); };
      img.src = info.dataUrl;
      look.images.set(id, rec);
    }
    return rec;
  }

  function raster(entry, display) {
    const info = imageOf(entry);
    if (!info) return null;
    const rec = loadImage(entry.image, info);
    if (!rec.ready) return null;
    const span = look.wall.span;
    const key = `${entry.image}|${entry.style}|${display.key}|${display.w}x${display.h}|${span ? `${span.w}x${span.h}` : ''}`;
    let cached = look.rasters.get(key);
    if (cached) return cached;
    const w = Math.max(1, Math.ceil(display.w / Q));
    const h = Math.max(1, Math.ceil(display.h / Q));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = entry.color || '#000';
    ctx.fillRect(0, 0, w, h);
    const place = window.WallLayout.layout({ img: info, style: entry.style, display, win: { x: display.x, y: display.y }, span });
    if (!place.repeat) ctx.drawImage(rec.img, place.x / Q, place.y / Q, place.w / Q, place.h / Q);
    else if (place.w < Q * 2 || place.h < Q * 2) ctx.drawImage(rec.img, 0, 0, w, h);
    else for (let y = place.y; y < display.h; y += place.h) for (let x = place.x; x < display.w; x += place.w) ctx.drawImage(rec.img, x / Q, y / Q, place.w / Q, place.h / Q);
    cached = { w, h, data: ctx.getImageData(0, 0, w, h).data };
    if (look.rasters.size > 8) look.rasters.delete(look.rasters.keys().next().value);
    look.rasters.set(key, cached);
    return cached;
  }

  function underColor() {
    const entry = wallEntry();
    const geom = look.geom;
    if (!entry) return null;
    const plain = hexToRgb(entry.color);
    if (!entry.image) return plain;
    if (!geom) return null;
    const pixels = raster(entry, geom.display);
    if (!pixels) return null;
    const rect = { x: (geom.bounds[0] - geom.display.x) / Q, y: (geom.bounds[1] - geom.display.y) / Q, w: geom.bounds[2] / Q, h: geom.bounds[3] / Q };
    return window.WallLayout.averageRect(pixels.data, pixels.w, pixels.h, rect) || plain;
  }

  function setRootVars(vars) {
    const style = document.documentElement.style;
    for (const name of look.vars) if (!(name in vars)) style.removeProperty(name);
    for (const [name, value] of Object.entries(vars)) style.setProperty(name, value);
    look.vars = Object.keys(vars);
  }

  function applyAppearance() {
    const A = window.Appearance;
    if (!look.cfg) return;
    const eff = A.effective(look.cfg, api.key);
    const panel = A.panelVisible(eff, api.key);
    const tint = eff.tint / 100;
    const scheme = A.pickScheme({
      wall: underColor(), tint: panel ? tint : 0, mode: eff.mode, setting: eff.scheme,
      prefer: panel ? systemScheme() : 'dark', current: look.scheme,
    });
    look.scheme = scheme;
    document.documentElement.dataset.scheme = scheme;
    setRootVars(A.accentVars(eff.accent, scheme));
    look.surface.style.setProperty('--tint-a', String(tint));
    look.surface.style.setProperty('--tint-rgb', A.panelRgb(eff.mode, scheme).join(', '));
    document.body.dataset.widget = api.key;
    document.body.dataset.mode = eff.mode;
    document.body.dataset.lowtint = tint < 0.4 ? '1' : '0';
  }

  function schedule() {
    if (look.frame) return;
    look.frame = requestAnimationFrame(() => { look.frame = 0; applyAppearance(); });
  }

  function initAppearance() {
    look.surface = el('div', { className: 'surface' });
    document.body.prepend(look.surface);
    api.appearance.get().then((cfg) => { look.cfg = cfg; applyAppearance(); });
    api.appearance.on((cfg) => { look.cfg = cfg; applyAppearance(); });
    const setWall = (wall) => {
      look.wall = wall;
      for (const id of [...look.images.keys()]) if (!(id in wall.images)) look.images.delete(id);
      look.rasters.clear();
      applyAppearance();
    };
    api.backdrop.get().then(setWall);
    api.backdrop.on(setWall);
    api.win.getBounds().then((geom) => { if (geom && geom.bounds) { look.geom = geom; applyAppearance(); } });
    api.win.onBounds((geom) => { look.geom = geom; schedule(); });
    mq.addEventListener('change', applyAppearance);
  }

  let locked = false;
  const setLocked = (v) => { locked = !!v; document.body.dataset.locked = String(locked); };

  function init({ menu, widthOnly = false } = {}) {
    window.I18n.translateDom(document.body, lang);
    document.title = t(document.title);
    initAppearance();
    api.locked.get().then(setLocked);
    api.locked.on(setLocked);

    if (widthOnly) document.body.dataset.resize = 'x';
    for (const edge of widthOnly ? ['L', 'R'] : ['L', 'R', 'T', 'B', 'LT', 'RT', 'LB', 'RB']) {
      const z = el('div', { className: `rz ${edge.toLowerCase()}` });
      z.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || locked) return;
        e.preventDefault();
        z.setPointerCapture(e.pointerId);
        api.drag.start('resize', edge);
      });
      z.addEventListener('pointerup', () => api.drag.end());
      z.addEventListener('lostpointercapture', () => api.drag.end());
      document.body.append(z);
    }

    let down = null;
    let dragging = false;
    let suppress = false;
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || locked) return;
      if (e.target.closest('input, textarea, select, [contenteditable="true"], [data-nodrag], .rz, .modal')) return;
      down = { x: e.clientX, y: e.clientY };
    }, true);
    document.addEventListener('pointermove', (e) => {
      if (!down || dragging) return;
      if (!(e.buttons & 1)) { down = null; return; }
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) < 5) return;
      dragging = true;
      api.drag.start('move');
    }, true);
    const finish = () => {
      if (dragging) { api.drag.end(); suppress = true; setTimeout(() => { suppress = false; }, 0); }
      dragging = false;
      down = null;
    };
    for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, finish, true);
    window.addEventListener('blur', finish);
    document.addEventListener('click', (e) => { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true);

    document.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      const field = e.target.closest('input, textarea');
      let items;
      if (field) {
        items = [{ role: 'cut', label: t('Cut') }, { role: 'copy', label: t('Copy') }, { role: 'paste', label: t('Paste') }, { role: 'selectAll', label: t('Select All') }];
      } else {
        items = (menu ? menu(e) : []).filter(Boolean);
        if (items.length) items.push({ type: 'separator' });
        items.push(
          { id: '__look', label: t('Appearance & Settings…'), run: () => api.settings.open('look') },
          { id: '__hide', label: t('Hide Widget') },
          { id: '__lock', label: locked ? t('Unlock Position') : t('Lock Position') },
        );
      }
      const plain = items.map(({ run, ...rest }) => rest);
      const id = await api.menu(plain);
      const picked = id && items.find((i) => i.id === id);
      if (picked && picked.run) picked.run();
    });
  }

  function ask({ title, label = '', value = '', type = 'text', min, max, ok = t('OK'), note = '' }) {
    return new Promise((resolve) => {
      const input = el('input', { type, value: String(value), min, max, placeholder: label });
      const done = (v) => { back.remove(); resolve(v); };
      const submit = () => {
        const v = input.value.trim();
        if (!v) return done(null);
        done(type === 'number' ? Number(v) : v);
      };
      const back = el('div', { className: 'modal-back', onPointerdown: (e) => e.stopPropagation() },
        el('div', { className: 'modal' },
          el('div', { className: 'modal-title' }, title),
          input,
          note ? el('div', { className: 'modal-note' }, note) : null,
          el('div', { className: 'modal-btns' },
            el('button', { onClick: () => done(null) }, t('Cancel')),
            el('button', { className: 'primary', onClick: submit }, ok))));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') done(null);
      });
      document.body.append(back);
      input.focus();
      input.select();
    });
  }

  const hms = (sec) => {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  const human = (sec) => {
    const m = Math.round(sec / 60);
    if (sec > 0 && m < 1) return t('< 1 min');
    if (m < 60) return t('{n} min', { n: m });
    return m % 60 ? t('{h} h {m} min', { h: Math.floor(m / 60), m: m % 60 }) : t('{h} h', { h: Math.floor(m / 60) });
  };

  const debounce = (fn, ms) => {
    let timer = null;
    let lastArgs = null;
    const run = () => {
      timer = null;
      fn(...lastArgs);
    };
    const debounced = (...args) => {
      lastArgs = args;
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };
    debounced.flush = () => {
      if (timer === null) return;
      clearTimeout(timer);
      run();
    };
    return debounced;
  };

  function relDate(dateStr) {
    const today = ymd(new Date());
    const d = parseYmd(dateStr);
    const diff = Math.round((d - parseYmd(today)) / 86400000);
    let text = shortDate(d);
    if (diff === 0) text = t('Today');
    else if (diff === 1) text = t('Tomorrow');
    else if (diff === -1) text = t('Yesterday');
    return { text, diff, overdue: diff < 0 };
  }

  window.W = {
    api, el, icon, star, ymd, parseYmd, pad, init, ask, debounce, relDate, hms, human, longDate, shortDate, ensureFolderDefs, folderSvg,
    MONTHS, MONTHS_SHORT, WEEKDAYS_LONG, WEEKDAYS_SHORT, t, tn, lang, LOCALE,
  };
})();
