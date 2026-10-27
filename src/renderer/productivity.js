'use strict';
(() => {
  const { api, el, init, debounce, hms, star, t } = W;
  const H = window.Heat;
  const card = document.getElementById('card');

  const CELL = 11;
  const GAP = 3;
  const MAX_WEEKS = 53;
  const TIP_ROWS = 5;
  const MONTH = W.MONTHS_SHORT;
  const LABELED = [1, 3, 5];

  let st = null;
  let data = { days: {}, goalMin: 180, today: H.ymd(new Date()), connected: false };
  let g = null;
  let cellEls = new Map();
  let todayKey = H.ymd(new Date());
  let hover = null;
  let firstDay = 1;

  const E = {};
  E.days = el('div', { className: 'wds' });
  E.months = el('div', { className: 'months' });
  E.cells = el('div', { className: 'cells' });
  E.area = el('div', { className: 'area' }, E.months, E.cells);
  E.legend = el('div', { className: 'legend' }, t('Less'), ...[0, 1, 2, 3, 4].map((l) => el('div', { className: `c l${l}` })), t('More'));
  E.tip = el('div', { className: 'tip hidden' });
  card.append(el('div', { className: 'plot' }, E.days, E.area), E.legend);
  document.body.append(E.tip);

  const liveSec = () => (st && st.seg ? Math.max(0, (Date.now() - st.seg.start) / 1000) : 0);
  function dayData(key) {
    if (key === todayKey && st && st.day && st.day.key === todayKey) {
      const subjects = { ...st.day.bySubject };
      if (st.seg) subjects[st.seg.subject] = (subjects[st.seg.subject] || 0) + liveSec();
      const total = Object.values(subjects).reduce((a, b) => a + b, 0);
      return { total, subjects, pomodoros: st.day.pomodoros };
    }
    return data.days[key] || null;
  }
  const effectiveDays = () => {
    const out = { ...data.days };
    const t = dayData(todayKey);
    if (t && t.total > 0) out[todayKey] = t; else delete out[todayKey];
    return out;
  };
  const subjColor = (name) => {
    const s = st && st.settings.subjects.find((x) => x.name === name);
    if (s) return s.color;
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return `hsl(${h % 360} 55% 58%)`;
  };

  function metrics() {
    const avail = Math.max(CELL, E.area.clientWidth);
    const weeks = H.weeksFor(avail + GAP, CELL + GAP, 8, MAX_WEEKS);
    const pitch = weeks === MAX_WEEKS ? CELL + GAP : (avail + GAP) / weeks;
    return { weeks, pitch };
  }

  function build() {
    E.days.replaceChildren(...[0, 1, 2, 3, 4, 5, 6].filter((r) => LABELED.includes((firstDay + r) % 7))
      .map((r) => el('span', { style: `grid-row:${r + 1}` }, W.WEEKDAYS_SHORT[(firstDay + r) % 7])));
    const m = metrics();
    g = H.grid(todayKey, m.weeks, firstDay);
    E.cells.style.setProperty('--weeks', m.weeks);
    cellEls = new Map();
    const nodes = [];
    for (const col of g.cols) {
      for (const c of col) {
        const node = el('div', { className: 'c', dataset: { key: c.key } });
        cellEls.set(c.key, node);
        nodes.push(node);
      }
    }
    E.cells.replaceChildren(...nodes);
    stretch(m.pitch);
    paint();
  }

  function stretch(pitch) {
    g.pitch = pitch;
    E.cells.style.setProperty('--col', `${(pitch - GAP).toFixed(2)}px`);
    E.months.replaceChildren(...H.monthLabels(g).map(({ col, month }) => el('span', { style: `left:${(col * pitch).toFixed(1)}px` }, MONTH[month])));
  }

  function paint() {
    if (!g) return;
    const days = effectiveDays();
    for (const [key, node] of cellEls) {
      const l = H.level((days[key] && days[key].total) || 0, data.goalMin);
      node.className = `c l${l}${key > todayKey ? ' f' : ''}${key === todayKey ? ' now' : ''}`;
    }
    if (hover) showTip(hover.key, hover.node);
  }

  function dateTitle(key) {
    const d = H.parse(key);
    return W.longDate(d, d.getFullYear() !== new Date().getFullYear());
  }

  function placeTip(r) {
    const M = 6;
    const tw = E.tip.offsetWidth;
    const th = E.tip.offsetHeight;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const cx = clamp(r.left + r.width / 2 - tw / 2, M, window.innerWidth - tw - M);
    const cy = clamp(r.top + r.height / 2 - th / 2, M, window.innerHeight - th - M);
    const fits = ([x, y]) => x >= M && y >= M && x + tw <= window.innerWidth - M && y + th <= window.innerHeight - M;
    const [x, y] = [[cx, r.top - th - M], [cx, r.bottom + M], [r.right + M, cy], [r.left - tw - M, cy]].find(fits) || [cx, cy];
    E.tip.style.left = `${Math.round(x)}px`;
    E.tip.style.top = `${Math.round(y)}px`;
  }

  function showTip(key, node) {
    const d = dayData(key);
    const rows = d ? Object.entries(d.subjects || {}).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]) : [];
    const kids = [el('div', { className: 'd' }, dateTitle(key))];
    if (!d || !(d.total > 0)) {
      kids.push(el('div', { className: 'm' }, t('No activity')));
    } else {
      kids.push(el('div', { className: 't' }, el('b', {}, hms(d.total)), d.pomodoros ? [' · ', star(), ` ${d.pomodoros}`] : null));
      const shown = rows.length > TIP_ROWS ? TIP_ROWS - 1 : rows.length;
      for (const [name, sec] of rows.slice(0, shown)) {
        kids.push(el('div', { className: 's' }, el('i', { style: `background:${subjColor(name)}` }), el('span', { className: 'n' }, name), el('span', { className: 'v' }, hms(sec))));
      }
      if (rows.length > shown) kids.push(el('div', { className: 'm' }, t('and {n} more', { n: rows.length - shown })));
    }
    E.tip.replaceChildren(...kids);
    E.tip.classList.remove('hidden');
    placeTip(node.getBoundingClientRect());
  }
  const hideTip = () => { hover = null; E.tip.classList.add('hidden'); };

  E.cells.addEventListener('mouseover', (e) => {
    const node = e.target.closest('.c');
    if (!node || node.classList.contains('f')) return hideTip();
    hover = { key: node.dataset.key, node };
    showTip(hover.key, node);
  });
  E.cells.addEventListener('mouseleave', hideTip);
  window.addEventListener('blur', hideTip);

  let toastTimer = null;
  function toast(text) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const box = el('div', { className: 'toast' }, text);
    document.body.append(box);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.remove(), 2200);
  }

  E.cells.addEventListener('click', async (e) => {
    const node = e.target.closest('.c');
    if (!node || node.classList.contains('f')) return;
    const ok = await api.productivity.openDay(node.dataset.key);
    if (ok === true || (ok && !ok.error)) return;
    toast(data.connected ? t('No log for this day') : t('Connect Obsidian to open the log'));
  });

  async function load() {
    if (!g) return;
    const r = await api.productivity.range(g.from, g.to);
    if (r && r.days) { data = r; paint(); }
  }
  const reload = debounce(load, 400);

  function relayout() {
    const key = H.ymd(new Date());
    const m = metrics();
    if (key !== todayKey || !g || m.weeks !== g.cols.length) {
      todayKey = key;
      build();
      reload();
    } else if (Math.abs(m.pitch - g.pitch) > 0.05) {
      stretch(m.pitch);
    }
  }

  init({
    menu: () => [
      { id: 'o', label: t('Open Today\'s Log'), enabled: data.connected, run: () => api.productivity.openDay(todayKey) },
      { id: 'r', label: t('Refresh'), run: load },
      { id: 's', label: t('Goal Settings…'), run: () => api.settings.open('pomodoro') },
    ],
    widthOnly: true,
  });

  api.calendarPrefs.on((p) => {
    if (p && p.firstDay !== firstDay) { firstDay = p.firstDay; build(); load(); }
  });
  api.pomodoro.on((s) => { st = s; paint(); });
  api.productivity.on(() => reload());
  let frame = 0;
  new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(relayout); }).observe(E.area);
  setInterval(() => {
    if (document.hidden) return;
    if (H.ymd(new Date()) !== todayKey) relayout(); else if (st && st.seg) paint();
  }, 15000);

  (async () => {
    st = await api.pomodoro.state();
    try { const p = await api.calendarPrefs.get(); if (p && !p.error) firstDay = p.firstDay; } catch { }
    build();
    await load();
  })();
})();
