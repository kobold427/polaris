'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Cal = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const normFirstDay = (v) => (v === 0 || v === 6 ? v : 1);

  function gridStart(year, month, firstDay = 1) {
    const fd = normFirstDay(firstDay);
    const first = new Date(year, month - 1, 1);
    return new Date(year, month - 1, 1 - ((first.getDay() - fd + 7) % 7));
  }

  function cells(year, month, firstDay = 1) {
    const s = gridStart(year, month, firstDay);
    return Array.from({ length: 42 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i));
  }

  const weekdayOrder = (firstDay = 1) => Array.from({ length: 7 }, (_, i) => (normFirstDay(firstDay) + i) % 7);

  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  }

  function rowWeek(rowStart, firstDay = 1) {
    const off = (4 - normFirstDay(firstDay) + 7) % 7;
    return isoWeek(new Date(rowStart.getFullYear(), rowStart.getMonth(), rowStart.getDate() + off));
  }

  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

  return { normFirstDay, gridStart, cells, weekdayOrder, isoWeek, rowWeek, isWeekend };
}));
