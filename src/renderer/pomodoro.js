'use strict';
(() => {
  const { api, el, icon, star, ask, init, hms, human, t } = W;
  const card = document.getElementById('card');

  const SAY = { work: t('Work'), short: t('Short Break'), long: t('Long Break') };

  let st = null;
  let view = 'timer';
  let T = null;
  let S = null;
  let viewBtn = null;
  let top = null;
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

  const companionKind = () => {
    const k = st && st.settings.companion;
    return window.Companion.KINDS.includes(k) ? k : 'off';
  };
  let builtCompanion = null;

  function destroyTimer() {
    if (!T) return;
    if (T.pal) T.pal.destroy();
    T = null;
  }

  const companionStage = () => (st.phase === 'work' ? 3 * Math.min(1, Math.max(0, 1 - remaining() / (st.durationMs || 1))) : 3);

  const companionState = () => {
    if (st.status === 'paused') return 'sleep';
    if (st.status !== 'running') return 'idle';
    return st.phase === 'work' ? 'work' : 'rest';
  };

  function buildTimer() {
    destroyTimer();
    T = {};
    builtCompanion = companionKind();
    const kind = companionKind();
    T.t = el('div', { className: 't' });
    T.s = el('div', { className: 's' });
    T.pal = kind === 'off' ? null : window.Companion.create(kind);
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
    T.memo = {};
    body.classList.toggle('nopal', !T.pal);
    body.replaceChildren(...[
      T.pal && el('div', { className: 'stage' }, T.pal.node),
      el('div', { className: 'clock' }, T.t, T.s),
      el('div', { className: 'ctl' },
        el('button', { className: 'sm', 'data-nodrag': true, html: icon('reset'), title: t('Reset timer'), onClick: () => cmd('reset') }),
        T.go,
        el('button', { className: 'sm', 'data-nodrag': true, html: icon('skip'), title: t('Next phase (work → break → work)'), onClick: () => cmd('skip') }),
        T.end),
      T.foot,
    ].filter(Boolean));
  }

  function paintTimer() {
    const phase = st.phase;
    const col = color(phase);
    const rem = remaining();
    const m = T.memo;
    const put = (key, value, apply) => {
      if (m[key] === value) return;
      m[key] = value;
      apply(value);
    };
    const clock = fmt(rem);
    put('t', clock, (v) => { T.t.textContent = v; });
    put('s', st.status === 'paused' ? `${t('Paused')} · ${SAY[phase]}` : st.status === 'running' ? SAY[phase] : phase === 'work' ? t('Ready to work') : SAY[phase], (v) => { T.s.textContent = v; });
    if (T.pal) T.pal.set(companionState(), companionStage());
    put('col', col, (v) => { T.go.style.background = v; });
    const key = st.status === 'running' ? 'pause' : 'play';
    if (T.goKey !== key) {
      T.goKey = key;
      T.go.innerHTML = icon(key);
      T.go.title = key === 'pause' ? t('Pause') : st.status === 'paused' ? t('Resume') : t('Start');
    }
    put('end', !st.session, (v) => { T.end.disabled = v; });
    put('dot', subjColor(st.subject), (v) => { T.dot.style.background = v; });
    put('name', st.subject, (v) => { T.name.textContent = v; });
    const n = st.settings.longEvery;
    if (T.dotsN !== n) {
      T.dotsN = n;
      T.dots.replaceChildren(...Array.from({ length: n }, () => el('i')));
      m.cycle = -1;
    }
    put('wcol', color('work'), (v) => { T.foot.style.setProperty('--c', v); });
    put('cycle', st.cycle, (c) => { [...T.dots.children].forEach((d, i) => d.classList.toggle('on', i < c)); });
    put('today', t('today {time}', { time: hms(todayTotals().total) }), (v) => { T.today.textContent = v; });
    put('title', st.status === 'running' ? `${clock} — ${SAY[phase]}` : t('Pomodoro'), (v) => { document.title = v; });
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

  function buildTop() {
    if (view === 'timer') {
      viewBtn = el('button', { className: 'icon-btn', 'data-nodrag': true, title: t('Summary for today'), html: icon('list'), onClick: toggleView });
      top.replaceChildren(T.subj, viewBtn);
    } else {
      viewBtn = el('button', { className: 'icon-btn', 'data-nodrag': true, title: t('Back to timer'), html: icon('chevL'), onClick: toggleView });
      top.replaceChildren(viewBtn, el('div', { className: 'ttl' }, t('Summary for today')));
    }
    top.classList.toggle('sumtop', view === 'summary');
  }

  function shell() {
    top = el('div', { className: 'top' });
    body = el('div', { className: 'body' });
    card.replaceChildren(top, body);
    if (view === 'timer') buildTimer(); else buildSummary();
    buildTop();
    paint();
  }

  let beat = 0;

  function arm() {
    clearTimeout(beat);
    beat = 0;
    if (!st || document.hidden || (st.status !== 'running' && !st.seg)) return;
    const rem = view === 'timer' && st.status === 'running' ? remaining() : 0;
    const wait = rem > 0 ? rem - (Math.ceil(rem / 1000) - 1) * 1000 : 1000;
    beat = setTimeout(paint, Math.max(40, Math.min(1000, wait)));
  }

  function paint() {
    if (!st || !body) return;
    if (view === 'timer' && builtCompanion !== companionKind()) { buildTimer(); buildTop(); }
    if (view === 'timer') paintTimer(); else paintSummary();
    arm();
  }

  function toggleView() {
    view = view === 'timer' ? 'summary' : 'timer';
    api.state.set({ view });
    if (view === 'timer') buildTimer();
    else {
      destroyTimer();
      body.classList.remove('nopal');
      buildSummary();
    }
    buildTop();
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
      {
        id: 'pal', label: t('Companion'),
        submenu: [
          ...[['lotus', 'Lotus'], ['star', 'Star'], ['off', 'Off']].map(([id, label]) => (
            { id: `pal:${id}`, label: t(label), type: 'radio', checked: companionKind() === id, run: () => cmd('setSettings', { companion: id }) })),
        ],
      },
      { type: 'separator' },
      { id: 'set', label: t('Pomodoro Settings…'), run: () => api.settings.open('pomodoro') },
    ],
  });

  api.pomodoro.on((s) => { st = s; paint(); });
  api.pomodoro.onSessionEnd((sum) => { if (sum.reason === 'ended') showResult(sum); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) paint(); });

  (async () => {
    const saved = (await api.state.get()) || {};
    if (saved.view === 'summary') view = 'summary';
    st = await api.pomodoro.state();
    shell();
  })();
})();
