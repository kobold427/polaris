'use strict';
(() => {
  const { api, el, icon, ymd, parseYmd, init, MONTHS, WEEKDAYS_SHORT, t, tn, shortDate } = W;
  const { Cal } = window;
  const ob = api.obsidian;
  const card = document.getElementById('card');

  const now0 = new Date();
  let view = { y: now0.getFullYear(), m: now0.getMonth() + 1 };
  let selected = ymd(now0);
  let data = { connected: false, daily: {}, tasks: {} };
  let today = ymd(now0);
  let prefs = { firstDay: 1, weekNumbers: false };

  async function load() {
    try {
      const d = await ob.calendar.month(view.y, view.m, prefs.firstDay);
      if (d && d.daily) data = d;
    } catch (e) { console.warn(e); }
    render();
  }

  function shift(n) {
    const d = new Date(view.y, view.m - 1 + n, 1);
    view = { y: d.getFullYear(), m: d.getMonth() + 1 };
    load();
  }
  function goToday() {
    const d = new Date();
    view = { y: d.getFullYear(), m: d.getMonth() + 1 };
    selected = ymd(d);
    load();
  }

  const cells = () => Cal.cells(view.y, view.m, prefs.firstDay);

  function cell(d) {
    const key = ymd(d);
    const tasks = data.tasks[key] || [];
    const openCount = tasks.filter((t) => !t.done).length;
    const cls = ['cell'];
    if (d.getMonth() !== view.m - 1) cls.push('out');
    if (Cal.isWeekend(d)) cls.push('we');
    if (key === today) cls.push('now');
    if (key === selected) cls.push('sel');
    const dots = el('div', { className: 'dots' });
    if (data.daily[key]) dots.append(el('i', { className: 'n' }));
    if (openCount) dots.append(el('i', { className: 't' }));
    else if (tasks.length) dots.append(el('i', { className: 'd' }));
    return el('div', {
      className: cls.join(' '), dataset: { date: key },
      title: tasks.length ? tn(tasks.length, '{n} task', '{n} tasks') : '',
      onClick: () => { selected = key; if (d.getMonth() !== view.m - 1) { view = { y: d.getFullYear(), m: d.getMonth() + 1 }; load(); } else render(); },
      onDblclick: () => { if (data.connected) ob.calendar.openDaily(key); },
    }, el('b', {}, String(d.getDate())), dots);
  }

  async function quickAdd(input) {
    const title = input.value.trim();
    if (!title) return;
    input.value = '';
    const key = selected;
    await ob.tasks.add({ title, due: key });
    await load();
    const again = card.querySelector('.qa input');
    if (again) again.focus();
  }

  function panel() {
    const d = parseYmd(selected);
    const tasks = data.tasks[selected] || [];
    const label = W.longDate(d);
    const head = el('div', { className: 'ph' }, el('div', { className: 'd' }, label));
    if (data.connected) {
      head.append(el('button', { className: 'open', onClick: () => ob.calendar.openDaily(selected) }, data.daily[selected] ? t('Daily Note') : t('Create Note')));
    }
    const list = el('div', { className: 'tl scroll' });
    if (!tasks.length) {
      list.append(el('div', { className: 'none' }, data.connected ? t('No tasks on this date') : t('No tasks on this date. Connect Obsidian from the tray menu to see daily notes and tasks from your whole vault.')));
    } else {
      for (const task of tasks) {
        const ref = { file: task.file, line: task.line, raw: task.raw };
        list.append(el('div', { className: `it${task.done ? ' done' : ''}` },
          el('button', {
            className: `chk${task.done ? ' on' : ''}`, html: icon('check'), 'data-nodrag': true,
            onClick: async () => { await ob.calendar.toggleAt(ref); load(); },
          }),
          el('div', { className: 'tt', title: task.file || '', onDblclick: () => { if (task.file) ob.calendar.openFile(task.file); } }, task.title)));
      }
    }
    const input = el('input', { type: 'text', placeholder: t('Add task for {date}', { date: shortDate(d) }), maxlength: '200', 'data-nodrag': true });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') quickAdd(input); });
    const add = el('div', { className: 'qa' }, input, el('button', { html: icon('plus'), title: t('Add'), 'data-nodrag': true, onClick: () => quickAdd(input) }));
    return el('div', { className: 'panel' }, head, list, add);
  }

  function render() {
    const keepScroll = card.querySelector('.tl') ? card.querySelector('.tl').scrollTop : 0;
    const typing = card.querySelector('.qa input');
    const draft = typing ? { value: typing.value, focus: document.activeElement === typing, pos: typing.selectionStart } : null;
    const rows = Array.from({ length: 6 }, (_, r) => r);
    const all = cells();
    const grid = [];
    for (const r of rows) {
      if (prefs.weekNumbers) grid.push(el('div', { className: 'wn', title: t('Week {n}', { n: Cal.rowWeek(all[r * 7], prefs.firstDay) }) }, String(Cal.rowWeek(all[r * 7], prefs.firstDay))));
      for (let c = 0; c < 7; c++) grid.push(cell(all[r * 7 + c]));
    }
    card.classList.toggle('wk', prefs.weekNumbers);
    card.replaceChildren(
      el('div', { className: 'head' },
        el('div', { className: 'ttl' }, el('em', {}, MONTHS[view.m - 1]), el('span', {}, String(view.y))),
        el('button', { className: 'icon-btn', html: icon('chevL'), title: t('Previous month'), onClick: () => shift(-1) }),
        el('button', { className: 'today', onClick: goToday }, t('Today')),
        el('button', { className: 'icon-btn', html: icon('chevR'), title: t('Next month'), onClick: () => shift(1) })),
      el('div', { className: 'wd' },
        prefs.weekNumbers ? el('div', { className: 'wn', title: t('Week number') }, t('Wk')) : null,
        Cal.weekdayOrder(prefs.firstDay).map((dow) => el('div', { className: dow === 0 || dow === 6 ? 'we' : '' }, WEEKDAYS_SHORT[dow]))),
      el('div', { className: 'grid' }, grid),
      panel());
    const tl = card.querySelector('.tl');
    if (tl) tl.scrollTop = keepScroll;
    if (draft && (draft.value || draft.focus)) {
      const input = card.querySelector('.qa input');
      input.value = draft.value;
      if (draft.focus) { input.focus(); input.setSelectionRange(draft.pos, draft.pos); }
    }
  }

  const setPrefs = async (patch) => {
    const p = await api.calendarPrefs.set(patch);
    if (p && !p.error) { prefs = p; load(); }
  };

  init({
    menu: () => [
      { id: 'today', label: t('Today'), run: goToday },
      data.connected ? { id: 'daily', label: t('Open Selected Day in Obsidian'), run: () => ob.calendar.openDaily(selected) } : null,
      { type: 'separator' },
      { id: 'fd:1', label: t('Week Starts on Monday'), type: 'radio', checked: prefs.firstDay === 1, run: () => setPrefs({ firstDay: 1 }) },
      { id: 'fd:0', label: t('Week Starts on Sunday'), type: 'radio', checked: prefs.firstDay === 0, run: () => setPrefs({ firstDay: 0 }) },
      { id: 'fd:6', label: t('Week Starts on Saturday'), type: 'radio', checked: prefs.firstDay === 6, run: () => setPrefs({ firstDay: 6 }) },
      { type: 'separator' },
      { id: 'wk', label: t('Show Week Numbers'), type: 'checkbox', checked: prefs.weekNumbers, run: () => setPrefs({ weekNumbers: !prefs.weekNumbers }) },
      { type: 'separator' },
      { id: 'ob', label: t('Obsidian Settings…'), run: () => ob.configMenu() },
    ],
  });
  let lastWheel = 0;
  let lastShift = 0;
  card.addEventListener('wheel', (e) => {
    if (e.target.closest('.tl') || !e.deltaY) return;
    const t = performance.now();
    const gap = t - lastWheel;
    lastWheel = t;
    const notch = Math.abs(e.deltaY) >= 50;
    if (notch ? t - lastShift >= 150 : gap >= 150) { lastShift = t; shift(e.deltaY > 0 ? 1 : -1); }
  }, { passive: true });

  ob.calendar.on(load);
  ob.onStatus(load);
  api.calendarPrefs.on((p) => { prefs = p; load(); });
  setInterval(() => {
    const t = ymd(new Date());
    if (t !== today) { today = t; load(); }
  }, 30 * 1000);
  api.calendarPrefs.get().then((p) => { if (p && !p.error) prefs = p; }).finally(load);
})();
