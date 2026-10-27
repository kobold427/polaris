'use strict';
(() => {
  const { api, el, icon, star, ask, init, hms, human, t } = W;
  const card = document.getElementById('card');

  const LABEL = { work: t('Work'), short: t('Break'), long: t('Long Break') };
  const SAY = { work: t('Work'), short: t('Short Break'), long: t('Long Break') };
  const R = 88;
  const C = 2 * Math.PI * R;

  let st = null;
  let view = 'timer';
  let T = null;
  let S = null;
  let seg = null;
  let viewBtn = null;
  let body = null;

  const color = (phase) => (st ? st.settings.colors[phase] : '#0a84ff');
  const subjColor = (name) => {
    const s = st && st.settings.subjects.find((x) => x.name === name);
    if (s) return s.color;
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return `hsl(${h % 360} 55% 58%)`;
  };
  const liveSec = () => (st && st.seg ? Math.max(0, (Date.now() - st.seg.start) / 1000) : 0);
  const remaining = () => (st.status === 'running' ? Math.max(0, st.endAt - Date.now()) : st.remainingMs);
  const fmt = (ms) => {
    const s = Math.ceil(ms / 1000);
    return s >= 3600 ? hms(s) : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  function todayTotals() {
    const by = { ...st.day.bySubject };
    if (st.seg) by[st.seg.subject] = (by[st.seg.subject] || 0) + liveSec();
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    return { by, total };
  }

  function buildTimer() {
    T = {};
    T.t = el('div', { className: 't' });
    T.s = el('div', { className: 's' });
    const ring = el('div', {
      className: 'ring',
      html: `<svg viewBox="0 0 200 200"><circle class="track" cx="100" cy="100" r="${R}" fill="none" stroke-width="9"/><circle class="bar" cx="100" cy="100" r="${R}" fill="none" stroke-width="9" transform="rotate(-90 100 100)" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>`,
    });
    T.bar = ring.querySelector('.bar');
    ring.append(el('div', { className: 'mid' }, T.t, T.s));
    T.dot = el('i');
    T.name = el('span');
    T.subj = el('button', { className: 'subj', 'data-nodrag': true, title: t('Change subject'), onClick: subjectMenu },
      T.dot, T.name, el('span', { html: icon('chevD') }));
    T.go = el('button', { className: 'go', 'data-nodrag': true, onClick: () => cmd('toggle') });
    T.end = el('button', { className: 'sm', 'data-nodrag': true, html: icon('stop'), title: t('End session (the summary is written to the log)'), onClick: () => cmd('end') });
    T.dots = el('span', { className: 'dots' });
    T.today = el('button', { 'data-nodrag': true, title: t('Summary for today'), onClick: toggleView });
    T.foot = el('div', { className: 'foot' }, T.dots, T.today);
    T.goKey = '';
    T.dotsN = -1;
    body.replaceChildren(
      ring, T.subj,
      el('div', { className: 'ctl' },
        el('button', { className: 'sm', 'data-nodrag': true, html: icon('reset'), title: t('Reset timer'), onClick: () => cmd('reset') }),
        T.go,
        el('button', { className: 'sm', 'data-nodrag': true, html: icon('skip'), title: t('Skip to next phase'), onClick: () => cmd('skip') }),
        T.end),
      T.foot);
  }

  function paintTimer() {
    const phase = st.phase;
    const col = color(phase);
    const rem = remaining();
    const total = st.durationMs || 1;
    T.t.textContent = fmt(rem);
    T.s.textContent = st.status === 'paused' ? t('Paused') : st.status === 'running' ? SAY[phase] : phase === 'work' ? t('Ready to work') : SAY[phase];
    T.bar.style.stroke = col;
    T.bar.style.strokeDashoffset = String(C * (1 - Math.min(1, Math.max(0, rem / total))));
    T.go.style.background = col;
    const key = st.status === 'running' ? 'pause' : 'play';
    if (T.goKey !== key) {
      T.goKey = key;
      T.go.innerHTML = icon(key);
      T.go.title = key === 'pause' ? t('Pause') : st.status === 'paused' ? t('Resume') : t('Start');
    }
    T.end.disabled = !st.session;
    T.dot.style.background = subjColor(st.subject);
    T.name.textContent = st.subject;
    const n = st.settings.longEvery;
    if (T.dotsN !== n) {
      T.dotsN = n;
      T.dots.replaceChildren(...Array.from({ length: n }, () => el('i')));
    }
    T.foot.style.setProperty('--c', color('work'));
    [...T.dots.children].forEach((d, i) => d.classList.toggle('on', i < st.cycle));
    T.today.textContent = t('today {time}', { time: hms(todayTotals().total) });
    document.title = st.status === 'running' ? `${fmt(rem)} — ${SAY[phase]}` : t('Pomodoro');
  }

  function buildSummary() {
    S = {};
    S.total = el('b');
    S.sub = el('span');
    S.rows = el('div', { className: 'rows scroll' });
    S.info = el('span');
    S.end = el('button', { 'data-nodrag': true, onClick: () => cmd('end') }, t('End'));
    S.key = '';
    S.wkV = el('span');
    S.wkBar = el('u');
    S.wk = el('div', { className: 'wk', title: t('Weekly goal — set in Pomodoro settings') },
      el('div', { className: 't' }, el('span', {}, t('This week')), S.wkV), el('div', { className: 'b' }, S.wkBar));
    body.replaceChildren(el('div', { className: 'sum' },
      el('div', { className: 'hd' }, S.total, S.sub),
      S.wk,
      S.rows,
      el('div', { className: 'ses' }, S.info, S.end)));
  }

  function paintSummary() {
    const { by, total } = todayTotals();
    const rows = Object.entries(by).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
    S.total.textContent = hms(total);
    S.sub.replaceChildren(t('today · {n}', { n: st.day.pomodoros }), ' ', star());
    const s = st.session;
    if (s) S.info.replaceChildren(t('Session: {time}', { time: hms(s.focusSec + liveSec()) }), ' · ', star(), ` ${s.pomodoros}`);
    else S.info.textContent = t('No active session');
    S.end.disabled = !s;
    paintWeek();
    const key = rows.map(([n, v]) => `${n}:${Math.round(v)}`).join('|') + '#' + st.settings.subjects.map((x) => x.color).join();
    if (key === S.key) return;
    S.key = key;
    const top = S.rows.scrollTop;
    const max = rows.length ? rows[0][1] : 1;
    if (!rows.length) {
      S.rows.replaceChildren(el('div', { className: 'none' }, t('Nothing tracked today yet.'), el('br'), t('Start the timer.')));
      return;
    }
    S.rows.replaceChildren(...rows.map(([name, sec]) => el('div', { className: 'row' },
      el('div', { className: 'l' }, el('i', { style: `background:${subjColor(name)}` }), el('span', { className: 'n' }, name), el('span', { className: 'v' }, hms(sec))),
      el('div', { className: 'b' }, el('u', { style: `width:${Math.max(2, (sec / max) * 100)}%;background:${subjColor(name)}` })))));
    S.rows.scrollTop = top;
  }

  function paintWeek() {
    const w = st.week || { doneSec: 0, goalMin: 0 };
    const done = w.doneSec + liveSec();
    const goal = (w.goalMin || 0) * 60;
    S.wkV.textContent = goal > 0 ? `${human(done)} / ${human(goal)}` : human(done);
    S.wk.classList.toggle('nogoal', goal <= 0);
    S.wk.classList.toggle('reached', goal > 0 && done >= goal);
    S.wkBar.style.width = goal > 0 ? `${Math.min(100, (done / goal) * 100).toFixed(1)}%` : '0%';
    S.wkBar.style.background = goal > 0 && done >= goal ? 'var(--green)' : color('work');
  }

  function shell() {
    seg = el('div', { className: 'seg' }, ['work', 'short', 'long'].map((k) => el('button', { 'data-nodrag': true, dataset: { phase: k }, onClick: () => cmd('setPhase', k) }, LABEL[k])));
    viewBtn = el('button', { className: 'icon-btn', 'data-nodrag': true, title: t('Summary for today'), html: icon('list'), onClick: toggleView });
    body = el('div', { className: 'body' });
    card.replaceChildren(el('div', { className: 'top' }, seg, viewBtn), body);
    if (view === 'timer') buildTimer(); else buildSummary();
    paint();
  }

  function paint() {
    if (!st || !body) return;
    for (const b of seg.children) b.classList.toggle('on', b.dataset.phase === st.phase);
    viewBtn.style.color = view === 'summary' ? 'var(--accent)' : '';
    viewBtn.title = view === 'summary' ? t('Timer') : t('Summary for today');
    if (view === 'timer') paintTimer(); else paintSummary();
  }

  function toggleView() {
    view = view === 'timer' ? 'summary' : 'timer';
    api.state.set({ view });
    if (view === 'timer') buildTimer(); else buildSummary();
    paint();
  }

  async function cmd(name, arg) {
    const s = await api.pomodoro.cmd(name, arg);
    if (s && s.phase) { st = s; paint(); }
  }

  async function subjectMenu() {
    const items = st.settings.subjects.map((s, i) => ({ id: `s:${i}`, label: s.name, type: 'radio', checked: s.name === st.subject }));
    items.push({ type: 'separator' }, { id: 'new', label: t('New Subject…') }, { id: 'manage', label: t('Manage Subjects…') });
    const id = await api.menu(items);
    if (!id) return;
    if (id === 'new') await newSubject();
    else if (id === 'manage') api.settings.open('pomodoro');
    else if (id.startsWith('s:')) cmd('setSubject', st.settings.subjects[Number(id.slice(2))].name);
  }

  async function newSubject() {
    const name = await ask({ title: t('What are you focusing on?'), label: t('e.g. Physics'), ok: t('Add') });
    if (name) cmd('addSubject', { name });
  }

  function showResult(sum) {
    const old = document.querySelector('.result');
    if (old) old.remove();
    const rows = Object.entries(sum.bySubject).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    const close = () => back.remove();
    const back = el('div', { className: 'result', onClick: (e) => { if (e.target === back) close(); } },
      el('div', { className: 'box' },
        el('h4', {}, t('Session summary')),
        el('div', { className: 'big' }, hms(sum.focusSec)),
        el('div', { className: 'meta' }, star(), ` ${sum.pomodoros} · `, t('breaks {time}', { time: human(sum.breakSec) })),
        ...rows.map(([name, sec]) => el('div', { className: 'row' },
          el('div', { className: 'l' }, el('i', { style: `background:${subjColor(name)}` }), el('span', { className: 'n' }, name), el('span', { className: 'v' }, human(sec))),
          el('div', { className: 'b' }, el('u', { style: `width:${Math.max(2, (sec / max) * 100)}%;background:${subjColor(name)}` })))),
        el('button', { className: 'ok', 'data-nodrag': true, onClick: close }, t('Done'))));
    document.body.append(back);
    setTimeout(() => { if (back.isConnected) close(); }, 20000);
  }

  init({
    menu: () => [
      { id: 'sw', label: t('Subject…'), run: subjectMenu },
      { id: 'end', label: t('End Session'), enabled: !!(st && st.session), run: () => cmd('end') },
      { id: 'sum', label: view === 'timer' ? t('Show Summary') : t('Show Timer'), run: toggleView },
      { type: 'separator' },
      { id: 'set', label: t('Pomodoro Settings…'), run: () => api.settings.open('pomodoro') },
    ],
  });

  api.pomodoro.on((s) => { st = s; paint(); });
  api.pomodoro.onSessionEnd((sum) => { if (sum.reason === 'ended') showResult(sum); });
  setInterval(() => { if (st && !document.hidden) paint(); }, 250);

  (async () => {
    const saved = (await api.state.get()) || {};
    if (saved.view === 'summary') view = 'summary';
    st = await api.pomodoro.state();
    shell();
  })();
})();
