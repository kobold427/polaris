'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TaskInput = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const DAYS = {
    mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0,
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
    пн: 1, вт: 2, ср: 3, чт: 4, пт: 5, сб: 6, вс: 0,
  };

  function fromMonthDay(mon, day, year, base) {
    if (day < 1 || day > 31 || mon < 1 || mon > 12) return null;
    const ok = (y) => { const d = new Date(y, mon - 1, day); return d.getMonth() === mon - 1 && d.getDate() === day; };
    if (year) return ok(year) ? `${year}-${pad(mon)}-${pad(day)}` : null;
    for (let y = base.getFullYear(); y <= base.getFullYear() + 8; y++) {
      if (ok(y) && new Date(y, mon - 1, day) >= base) return `${y}-${pad(mon)}-${pad(day)}`;
    }
    return null;
  }

  function dueFromToken(tok, now = new Date()) {
    const t = tok.toLowerCase();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const plus = (n) => ymd(new Date(base.getFullYear(), base.getMonth(), base.getDate() + n));
    if (t === 'сегодня' || t === 'today') return plus(0);
    if (t === 'завтра' || t === 'tomorrow') return plus(1);
    if (t === 'послезавтра') return plus(2);
    let m = t.match(/^\+(\d{1,3})[дd]?$/);
    if (m) return plus(Number(m[1]));
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return fromMonthDay(Number(m[2]), Number(m[3]), Number(m[1]), base);
    m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
    if (m) return fromMonthDay(Number(m[1]), Number(m[2]), m[3] && Number(m[3]), base);
    m = t.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
    if (m) return fromMonthDay(Number(m[2]), Number(m[1]), m[3] && Number(m[3]), base);
    if (Object.prototype.hasOwnProperty.call(DAYS, t)) {
      const diff = ((DAYS[t] - base.getDay() + 7) % 7) || 7;
      return plus(diff);
    }
    return null;
  }

  function parseInput(text, now) {
    const s = String(text == null ? '' : text);
    const m = s.match(/^(.*\S)\s+@(\S+)\s*$/);
    if (m) {
      const due = dueFromToken(m[2], now);
      if (due) return { title: m[1].trim(), due };
    }
    return { title: s.trim(), due: null };
  }

  return { parseInput, dueFromToken };
}));
