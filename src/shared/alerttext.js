'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AlertText = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const pad = (n) => String(n).padStart(2, '0');
  const hms = (sec) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };

  function of(info, t) {
    const i = info || {};
    const tr = typeof t === 'function' ? t : (k, p) => (p ? k.replace(/\{(\w+)\}/g, (m, key) => (key in p ? String(p[key]) : m)) : k);
    if (i.kind === 'work-end') {
      const long = i.next === 'long';
      return {
        title: tr('Pomodoro complete'),
        body: i.autoStart
          ? tr(long ? '{subject}: long break started' : '{subject}: short break started', { subject: i.subject })
          : tr(long ? '{subject}: time for a long break' : '{subject}: time for a short break', { subject: i.subject }),
        extra: i.weeklyGoal ? tr('Weekly goal reached 🎉') : '',
        action: i.autoStart ? null : tr(long ? 'Start Long Break' : 'Start Short Break'),
      };
    }
    if (i.kind === 'break-end') {
      return {
        title: tr('Break is over'),
        body: i.autoStart ? tr('Work started') : tr('Time to get back to work'),
        extra: '',
        action: i.autoStart ? null : tr('Start Work'),
      };
    }
    if (i.kind === 'session') {
      const rows = Object.entries(i.bySubject || {}).sort((a, b) => b[1] - a[1]).map(([n, s]) => `${n} — ${hms(s)}`);
      return {
        title: tr('Session complete: {time}', { time: hms(i.focusSec) }),
        body: [tr('Pomodoros: {n}', { n: i.pomodoros || 0 }), ...rows].join('\n'),
        extra: '',
        action: null,
      };
    }
    return { title: '', body: '', extra: '', action: null };
  }

  return { of, hms };
}));
