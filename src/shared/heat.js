'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Heat = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (key, n) => { const d = parse(key); d.setDate(d.getDate() + n); return ymd(d); };
  const dow = (key, firstDay = 1) => (parse(key).getDay() - firstDay + 7) % 7;

  function level(sec, goalMin) {
    if (!(sec > 0)) return 0;
    const r = sec / (Math.max(1, goalMin) * 60);
    if (r < 0.25) return 1;
    if (r < 0.5) return 2;
    if (r < 1) return 3;
    return 4;
  }

  function weeksFor(width, pitch = 12, min = 8, max = 53) {
    const n = Math.floor(width / pitch);
    return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  }

  function grid(todayKey, weeks, firstDay = 1) {
    const start = addDays(todayKey, -dow(todayKey, firstDay) - (weeks - 1) * 7);
    const cols = [];
    for (let c = 0; c < weeks; c++) {
      const col = [];
      for (let r = 0; r < 7; r++) {
        const key = addDays(start, c * 7 + r);
        col.push({ key, future: key > todayKey });
      }
      cols.push(col);
    }
    return { start, cols, from: start, to: todayKey };
  }

  function monthLabels(g, minGap = 3) {
    const out = [];
    let prev = -1;
    g.cols.forEach((col, i) => {
      const m = parse(col[0].key).getMonth();
      if (m === prev) return;
      prev = m;
      const last = out[out.length - 1];
      if (last && i - last.col < minGap) {
        if (out.length === 1) out[0] = { col: i, month: m };
        return;
      }
      out.push({ col: i, month: m });
    });
    return out;
  }

  const weekStart = (todayKey, firstDay = 1) => addDays(todayKey, -dow(todayKey, firstDay));

  return { ymd, parse, addDays, dow, level, weeksFor, grid, monthLabels, weekStart };
}));
