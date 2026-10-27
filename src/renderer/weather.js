'use strict';
(() => {
  const { api, el, ask, parseYmd, init, WEEKDAYS_SHORT, t } = W;
  const card = document.getElementById('card');
  let snap = { settings: {}, data: null, error: null, loading: false };

  const KIND = (code) => {
    if (code === 0) return 'clear';
    if (code === 1) return 'mostly';
    if (code === 2) return 'partly';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 51 && code <= 57)) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloud';
  };
  const TEXT = {
    clear: 'Clear', mostly: 'Mostly Clear', partly: 'Partly Cloudy', cloud: 'Cloudy', fog: 'Fog',
    drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm',
  };

  const SUN = (cx, cy, r) => {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const x1 = cx + Math.cos(a) * (r + 3); const y1 = cy + Math.sin(a) * (r + 3);
      const x2 = cx + Math.cos(a) * (r + 7); const y2 = cy + Math.sin(a) * (r + 7);
      rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }
    return `<g stroke="#ffd60a" stroke-width="2.4" stroke-linecap="round">${rays}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffd60a"/>`;
  };
  const MOON = (cx, cy, r) => `<path d="M${cx + r * 0.5} ${cy - r}a${r} ${r} 0 1 0 ${r * 0.9} ${r * 1.4} ${r * 0.8} ${r * 0.8} 0 0 1 -${r * 0.9} -${r * 1.4}z" fill="#c9d3e6"/>`;
  const CLOUD = (dx = 0, dy = 0, fill = '#f4f5f8') => `<g transform="translate(${dx} ${dy})"><path d="M14 36a8 8 0 0 1-.8-15.96A10.5 10.5 0 0 1 33.6 17.6 8.7 8.7 0 0 1 34.5 36z" fill="${fill}" stroke="rgba(120,125,140,.55)" stroke-width="1.2" stroke-linejoin="round"/></g>`;
  const DARKCLOUD = (dy = 0) => CLOUD(0, dy, '#aeb4c2');

  function wxIcon(code, day = true) {
    const k = KIND(code);
    let body = '';
    switch (k) {
      case 'clear': body = day ? SUN(24, 24, 9) : MOON(24, 24, 11); break;
      case 'mostly': body = (day ? SUN(31, 17, 7) : MOON(30, 17, 8)) + CLOUD(-2, 2); break;
      case 'partly': body = (day ? SUN(31, 16, 7) : MOON(30, 16, 8)) + CLOUD(0, 2); break;
      case 'cloud': body = CLOUD(0, -2, '#dfe2e9'); break;
      case 'fog': body = CLOUD(0, -6, '#dfe2e9') + '<g stroke="#9aa1b1" stroke-width="2.4" stroke-linecap="round"><path d="M10 34h28M14 40h22"/></g>'; break;
      case 'drizzle': body = DARKCLOUD(-5) + '<g stroke="#5ac8fa" stroke-width="2.4" stroke-linecap="round"><path d="M17 36l-1.5 4M25 36l-1.5 4M33 36l-1.5 4"/></g>'; break;
      case 'rain': body = DARKCLOUD(-5) + '<g stroke="#2f9bff" stroke-width="2.8" stroke-linecap="round"><path d="M16 35l-2.5 7M24 35l-2.5 7M32 35l-2.5 7"/></g>'; break;
      case 'snow': body = CLOUD(0, -5, '#e4e7ee') + '<g fill="#8fd3ff"><circle cx="16" cy="38" r="2.2"/><circle cx="25" cy="41" r="2.2"/><circle cx="33" cy="37" r="2.2"/></g>'; break;
      case 'storm': body = DARKCLOUD(-5) + '<path d="M26 31l-6 8h5l-2 7 8-10h-5z" fill="#ffd60a" stroke="#d9b000" stroke-width=".8" stroke-linejoin="round"/>'; break;
      default: body = CLOUD();
    }
    return `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
  }
  window.__wxIcon = wxIcon;

  const deg = (n) => `${Math.round(n)}°`.replace('-', '−');
  const html = (s) => el('span', { html: s, style: 'display:contents' });

  function empty(title, msg, btn) {
    return el('div', { className: 'empty' },
      el('div', { className: 'big' }, title), msg ? el('div', {}, msg) : null,
      btn ? el('button', { className: 'primary', onClick: btn.run }, btn.label) : null);
  }

  function pickPlace(places) {
    return new Promise((resolve) => {
      const done = (v) => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); done(null); return; }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const btns = [...list.querySelectorAll('button')];
        const i = btns.indexOf(document.activeElement);
        const next = btns[Math.max(0, Math.min(btns.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (next) next.focus();
      };
      const list = el('div', { className: 'places scroll' }, places.map((p) => el('button', { className: 'place', onClick: () => done(p) },
        el('b', {}, p.name), el('small', {}, [p.region, p.country].filter(Boolean).join(' · ')))));
      const back = el('div', { className: 'modal-back', onPointerdown: (e) => e.stopPropagation() },
        el('div', { className: 'modal picker' },
          el('div', { className: 'modal-title' }, t('Choose a place')),
          list,
          el('div', { className: 'modal-btns' }, el('button', { onClick: () => done(null) }, t('Cancel')))));
      document.addEventListener('keydown', onKey, true);
      document.body.append(back);
      setTimeout(() => { const first = list.querySelector('button'); if (first && back.isConnected) first.focus(); }, 80);
    });
  }

  const busy = (on) => { snap = { ...snap, loading: on }; render(); };

  async function changeCity() {
    let q = snap.settings.city || '';
    let note = '';
    for (;;) {
      const v = await ask({ title: t('City'), label: t('e.g. Moscow'), value: q, ok: t('Find'), note });
      if (!v) return;
      q = v;
      busy(true);
      const res = await api.weather.search(v);
      busy(false);
      if (!res || res.error) { note = t('Search failed. Check your internet connection.'); continue; }
      if (!res.places.length) { note = t('Nothing found for “{q}”. Check the spelling.', { q: v }); continue; }
      const place = res.places.length === 1 ? res.places[0] : await pickPlace(res.places);
      if (!place) return;
      busy(true);
      const set = await api.weather.setPlace(place);
      if (set && set.settings) snap = set;
      busy(false);
      return;
    }
  }

  async function setUnits(u) {
    if ((snap.data && snap.data.units) === u) return;
    busy(true);
    const r = await api.weather.setUnits(u);
    if (r && r.settings) snap = r;
    render();
  }

  const unitsOf = () => (snap.data && snap.data.units) || snap.settings.units || 'metric';
  const num = (v) => (v == null ? '—' : String(Math.round(v)));
  const pct = (v) => (v == null ? '—' : `${Math.round(v)}%`);

  const ICON_WIND = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5h7.2a2 2 0 1 0-2-2M2 9.5h10a2.2 2.2 0 1 1-2.2 2.2M2 12.5h4"/></svg>';
  const ICON_DROP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2s4.2 4.3 4.2 7.2a4.2 4.2 0 0 1-8.4 0C3.8 6.5 8 2.2 8 2.2Z"/></svg>';
  const ICON_RAIN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 9.2a2.9 2.9 0 0 1-.2-5.8 3.8 3.8 0 0 1 7.2 1.1 2.4 2.4 0 0 1-.4 4.7z"/><path d="M5.5 11.5 5 13.5M8.5 11.5 8 13.5M11.5 11.5 11 13.5"/></svg>';

  function detail(svg, label, value, tip) {
    return el('div', { className: 'c', title: tip || label }, html(svg), el('div', {}, el('small', {}, label), el('b', {}, value)));
  }

  function render() {
    const { data, error, loading, settings } = snap;
    if (!settings.city) {
      card.replaceChildren(empty(t('Weather'), t('Choose a city to see the forecast'), { label: t('Choose City'), run: changeCity }));
      return;
    }
    if (!data) {
      card.replaceChildren(error
        ? empty(t(error), null, { label: t('Another City'), run: changeCity })
        : empty(settings.name || settings.city, loading ? t('Loading…') : t('No data')));
      return;
    }
    const n = data.now;
    const today = data.daily[0];
    const name = data.name || settings.city;
    const hours = data.hourly.map((h, i) => el('div', { className: 'h' },
      el('span', {}, i === 0 ? t('Now') : String(h.hour).padStart(2, '0')), html(wxIcon(h.code, h.day)), el('b', {}, deg(h.temp))));

    const mins = data.daily.map((d) => d.min);
    const maxs = data.daily.map((d) => d.max);
    const lo = Math.min(...mins);
    const hi = Math.max(...maxs);
    const span = Math.max(1, hi - lo);
    const days = data.daily.slice(0, 6).map((d, i) => {
      const dt = parseYmd(d.date);
      const left = ((d.min - lo) / span) * 100;
      const width = Math.max(6, ((d.max - d.min) / span) * 100);
      const bar = el('div', { className: 'bar' }, el('i', { style: `left:${left}%;width:${Math.min(width, 100 - left)}%` }));
      return el('div', { className: 'd' },
        el('span', { className: 'n' }, i === 0 ? t('Today') : WEEKDAYS_SHORT[dt.getDay()]),
        html(wxIcon(d.code, true)), el('span', { className: 'lo' }, deg(d.min)), bar, el('span', {}, deg(d.max)));
    });

    const upd = new Date(data.updated);
    const time = `${String(upd.getHours()).padStart(2, '0')}:${String(upd.getMinutes()).padStart(2, '0')}`;
    card.replaceChildren(...[
      el('div', { className: 'now' },
        el('div', { className: 'l' },
          el('div', { className: 'city', title: name }, name, loading ? el('span', { className: 'busy' }) : null),
          el('div', { className: 'temp' }, deg(n.temp))),
        el('div', { className: 'r' },
          html(wxIcon(n.code, n.day)),
          el('div', { className: 'cond' }, t(TEXT[KIND(n.code)])),
          el('div', { className: 'hl' }, `${t('H:{n}', { n: deg(today.max) })}  ${t('L:{n}', { n: deg(today.min) })}`),
          el('div', { className: 'hl' }, t('Feels like {n}', { n: deg(n.feels) })))),
      error ? el('div', { className: 'err' }, t(error)) : null,
      el('div', { className: 'details' },
        detail(ICON_WIND, t('Wind'), n.wind == null ? '—' : `${num(n.wind)} ${t(data.windUnit || 'km/h')}`),
        detail(ICON_DROP, t('Humidity'), pct(n.humidity)),
        detail(ICON_RAIN, t('Precip.'), pct(n.pop), t('Chance of precipitation'))),
      el('div', { className: 'hours' }, hours),
      el('div', { className: 'days scroll' }, days),
      el('div', { className: 'foot' },
        el('button', { 'data-nodrag': true, onClick: () => api.openExternal('https://open-meteo.com/') }, t('Data: Open-Meteo')),
        el('span', {}, t('updated {time}', { time }))),
    ].filter(Boolean));
  }

  init({
    menu: () => {
      const u = unitsOf();
      return [
        { id: 'city', label: t('Change City…'), run: changeCity },
        { id: 'refresh', label: t('Refresh'), run: async () => { const r = await api.weather.refresh(); if (r && r.settings) { snap = r; render(); } } },
        { type: 'separator' },
        { id: 'u:metric', label: t('Metric (°C, km/h)'), type: 'radio', checked: u === 'metric', run: () => setUnits('metric') },
        { id: 'u:imperial', label: t('Imperial (°F, mph)'), type: 'radio', checked: u === 'imperial', run: () => setUnits('imperial') },
        { type: 'separator' },
        { id: 'src', label: t('Data Source: Open-Meteo (CC BY 4.0)'), run: () => api.openExternal('https://open-meteo.com/') },
      ];
    },
  });
  api.weather.on((s) => { snap = s; render(); });
  api.weather.get().then((s) => { if (s && s.settings) snap = s; render(); });
})();
