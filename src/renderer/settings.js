'use strict';
(() => {
  const { api, el, icon, debounce, t } = W;
  const A = window.Appearance;

  const PHASE_COLORS = ['#0a84ff', '#64d2ff', '#bf5af2', '#30d158', '#ffd60a', '#ff453a', '#ff375f', '#8e8e93'];
  const DEFAULT_ACCENT = '#0a84ff';
  const PHASES = [['work', t('Work')], ['short', t('Short break')], ['long', t('Long break')]];

  const group = (title, ...rows) => [el('h3', {}, title), el('div', { className: 'grp' }, ...rows.flat())];
  const row = (label, control) => el('div', { className: 'row' }, el('div', { className: 'lbl' }, label), control ? el('div', { className: 'ctl' }, control) : null);

  function segmented(options, onPick) {
    const root = el('div', { className: 'seg' }, options.map(([value, label]) => el('button', { dataset: { v: value }, onClick: () => onPick(value) }, label)));
    root.set = (value) => { for (const b of root.children) b.classList.toggle('on', b.dataset.v === String(value)); };
    return root;
  }

  function toggle(onChange) {
    const button = el('button', { className: 'sw', role: 'switch', onClick: () => { const on = !button.classList.contains('on'); button.set(on); onChange(on); } });
    button.set = (on) => { button.classList.toggle('on', !!on); button.setAttribute('aria-checked', String(!!on)); };
    return button;
  }

  function numberField(min, max, onCommit) {
    const input = el('input', { className: 'num', type: 'number', min, max });
    let current = null;
    const commit = () => {
      if (input.value === '') { input.value = String(current); return; }
      const value = Math.min(max, Math.max(min, Math.round(Number(input.value))));
      input.value = String(value);
      if (value !== current) { current = value; onCommit(value); }
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    input.set = (value) => { current = value; if (document.activeElement !== input) input.value = String(value); };
    return input;
  }

  function slider(min, max, onInput) {
    const input = el('input', { type: 'range', min, max, step: 1 });
    const label = el('span', { className: 'val' });
    input.addEventListener('input', () => { label.textContent = input.value; onInput(Number(input.value)); });
    const box = el('div', { className: 'ctl', style: 'gap:10px' }, input, label);
    box.set = (value, disabled) => {
      if (document.activeElement !== input) input.value = String(value);
      label.textContent = String(value);
      input.disabled = !!disabled;
    };
    return box;
  }

  function colorPicker(presets, onPick) {
    const custom = el('input', { type: 'color', title: t('Custom color') });
    custom.addEventListener('input', debounce(() => onPick(custom.value), 120));
    const swatches = el('div', { className: 'sw-presets' }, presets.map(({ value, color }) => el('button', {
      title: color, style: `background:${color}`, dataset: { value }, onClick: () => onPick(value),
    })));
    return {
      nodes: [swatches, custom],
      set(value, shown) {
        for (const b of swatches.children) b.classList.toggle('on', b.dataset.value.toLowerCase() === value.toLowerCase());
        if (custom.value !== shown) custom.value = shown;
      },
    };
  }

  const look = { cfg: A.emptyConfig(), scope: 'all', widgets: [], grid: { snap: true, show: true }, theme: 'system' };
  const L = {};
  const patchLook = (patch) => api.appearance.set(look.scope, patch);

  function buildLook() {
    L.scope = el('select', { onChange: () => { look.scope = L.scope.value; syncLook(); } });
    L.reset = el('button', { className: 'btn', onClick: () => api.appearance.reset(look.scope) });
    L.mode = segmented(Object.entries(A.MODES).map(([k, label]) => [k, t(label)]), (mode) => patchLook({ mode }));
    L.tint = slider(0, 100, debounce((tint) => patchLook({ tint }), 40));
    L.scheme = segmented(Object.entries(A.SCHEMES).map(([k, label]) => [k, t(label)]), (scheme) => patchLook({ scheme }));
    L.accent = colorPicker(A.ACCENT_PRESETS.map((value) => ({ value, color: value || DEFAULT_ACCENT })), (accent) => patchLook({ accent }));
    L.theme = segmented([['system', t('Match System')], ['light', t('Light')], ['dark', t('Dark')]], (theme) => { look.theme = theme; api.theme.set(theme); syncLook(); });
    L.snap = toggle((snap) => api.grid.set({ snap }).then((g) => { if (g) look.grid = g; }));
    L.show = toggle((show) => api.grid.set({ show }).then((g) => { if (g) look.grid = g; }));
    document.getElementById('look').replaceChildren(
      ...group(t('Apply to'), row(t('Widget'), [L.scope, L.reset])),
      ...group(t('Style'),
        row(t('Mode'), L.mode),
        row(t('Opacity'), L.tint),
        row(t('Panel color'), L.scheme),
        row(t('Accent color'), L.accent.nodes)),
      ...group(t('Theme'), row(t('Color scheme'), L.theme)),
      ...group(t('Grid'), row(t('Snap to grid'), L.snap), row(t('Show grid'), L.show)),
    );
  }

  function syncLook() {
    const options = [['all', t('All widgets')], ...look.widgets.map((w) => [w.key, t(w.title)])];
    if (L.scope.options.length !== options.length) {
      L.scope.replaceChildren(...options.map(([value, label]) => el('option', { value }, label)));
    }
    for (const [i, [value, label]] of options.entries()) {
      L.scope.options[i].textContent = value !== 'all' && look.cfg.widgets[value] ? `${label} •` : label;
    }
    L.scope.value = look.scope;
    const own = look.scope === 'all' || !!look.cfg.widgets[look.scope];
    const eff = A.effective(look.cfg, look.scope);
    L.reset.disabled = !own;
    L.reset.textContent = look.scope === 'all' ? t('Reset All') : t('Use Shared');
    L.mode.set(eff.mode);
    L.tint.set(eff.tint, false);
    L.scheme.set(eff.scheme);
    L.accent.set(eff.accent, eff.accent || DEFAULT_ACCENT);
    L.theme.set(look.theme);
    L.snap.set(look.grid.snap);
    L.show.set(look.grid.show);
  }

  const P = {};
  let pomo = null;
  let obsidian = { connected: false };
  let subjectsKey = '';
  const pomoCmd = (name, arg) => api.pomodoro.cmd(name, arg).then((s) => { if (s && s.phase) { pomo = s; syncPomo(); } });
  const setAlerts = (alerts) => pomoCmd('setSettings', { alerts });

  const FILE_PROBLEMS = {
    missing: () => t('The file was not found — the bell will play instead.'),
    type: () => t('This file type is not supported.'),
    size: () => t('The file is larger than 6 MB.'),
    empty: () => t('The file is empty.'),
  };
  const fileProblem = (reason) => (FILE_PROBLEMS[reason] ? FILE_PROBLEMS[reason]() : '');

  async function chooseSoundFile() {
    const res = await api.alerts.chooseSound();
    P.pickNote = res && !res.ok && !res.canceled ? fileProblem(res.reason) : '';
    P.fileCheck = null;
    pomo = await api.pomodoro.state();
    syncPomo();
  }

  function buildPomo() {
    P.pickNote = '';
    P.checkNote = '';
    P.fileCheck = null;

    P.durations = {};
    const durationRow = ([phase, label]) => {
      const max = { work: 180, short: 60, long: 120 }[phase];
      P.durations[phase] = numberField(1, max, (v) => pomoCmd('setSettings', { durations: { [phase]: v } }));
      return row(label, [P.durations[phase], t('min')]);
    };
    P.every = numberField(2, 12, (v) => pomoCmd('setSettings', { longEvery: v }));
    P.auto = toggle((v) => pomoCmd('setSettings', { autoStart: v }));
    P.idle = numberField(5, 240, (v) => pomoCmd('setSettings', { idleEndMin: v }));

    P.sound = toggle((sound) => setAlerts({ sound }));
    P.tone = el('select', { title: t('Sound') },
      window.Tones.TONES.map((tone) => el('option', { value: tone.id }, t(tone.name))),
      el('option', { value: 'custom' }, t('Your own file…')));
    P.tone.addEventListener('change', () => (P.tone.value === 'custom' ? chooseSoundFile() : setAlerts({ tone: P.tone.value })));
    P.play = el('button', { className: 'btn small', onClick: () => api.alerts.test('sound') }, t('Play'));
    P.volume = slider(0, 100, debounce((volume) => setAlerts({ volume }), 150));
    P.fileName = el('span', { className: 'status' }, el('i'), el('span'));
    P.fileError = el('small', { className: 'err' });
    P.fileRow = el('div', { className: 'row' },
      el('div', { className: 'lbl' }, t('Your sound file'), P.fileError),
      el('div', { className: 'ctl' }, P.fileName, el('button', { className: 'btn small', onClick: chooseSoundFile }, t('Choose…'))));
    P.banner = toggle((banner) => setAlerts({ banner }));
    P.bannerPreview = el('button', { className: 'btn small', onClick: () => api.alerts.test('banner') }, t('Preview'));
    P.toast = toggle((toast) => setAlerts({ toast }));

    P.colors = Object.fromEntries(PHASES.map(([phase]) => [phase, colorPicker(PHASE_COLORS.map((c) => ({ value: c, color: c })), (c) => pomoCmd('setSettings', { colors: { [phase]: c } }))]));

    P.subjects = el('div');
    P.newSubject = el('input', { className: 'txt', style: 'width:100%', placeholder: t('New subject, e.g. Physics') });
    const addSubject = () => {
      const name = P.newSubject.value.trim();
      if (!name) return;
      P.newSubject.value = '';
      pomoCmd('addSubject', { name });
    };
    P.newSubject.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSubject(); });

    P.dailyGoal = numberField(10, 1440, (v) => pomoCmd('setSettings', { goalMin: v }));
    P.weeklyGoal = numberField(0, 168, (v) => pomoCmd('setSettings', { weeklyGoalMin: v * 60 }));
    P.vault = el('span', { className: 'status' }, el('i'), el('span'));
    P.folder = el('input', { className: 'txt', spellcheck: 'false' });
    P.folder.addEventListener('change', () => pomoCmd('setSettings', { logFolder: P.folder.value }));
    P.folder.addEventListener('keydown', (e) => { if (e.key === 'Enter') P.folder.blur(); });

    document.getElementById('pomo').replaceChildren(
      ...group(t('Timer'),
        PHASES.map(durationRow),
        row(t('Long break after'), [P.every, t('pomodoros')]),
        row(t('Start next phase automatically'), P.auto),
        row(t('End session after idle time'), [P.idle, t('min')])),
      ...group(t('Alerts'),
        row(t('Play a sound when a phase ends'), P.sound),
        row(t('Sound'), [P.tone, P.play]),
        P.fileRow,
        row(t('Volume'), P.volume),
        row(t('Show a banner on top of other windows'), [P.bannerPreview, P.banner]),
        row(t('Also show a Windows notification'), P.toast)),
      ...group(t('Phase colors'), PHASES.map(([phase, label]) => row(label, P.colors[phase].nodes))),
      ...group(t('Subjects'), P.subjects, el('div', { className: 'row' }, P.newSubject, el('button', { className: 'btn primary', onClick: addSubject }, t('Add')))),
      ...group(t('Productivity'),
        row(t('Daily goal'), [P.dailyGoal, t('min')]),
        row(t('Weekly goal'), [P.weeklyGoal, t('h')])),
      ...group(t('Obsidian log'),
        row(t('Connection'), P.vault),
        row(t('Folder in vault'), P.folder)),
    );
  }

  function syncPomo() {
    if (!pomo) return;
    const s = pomo.settings;
    for (const [phase, input] of Object.entries(P.durations)) input.set(s.durations[phase]);
    P.every.set(s.longEvery);
    P.auto.set(s.autoStart);
    P.idle.set(s.idleEndMin);
    for (const [phase, picker] of Object.entries(P.colors)) picker.set(s.colors[phase], s.colors[phase]);
    P.dailyGoal.set(s.goalMin);
    P.weeklyGoal.set(Math.round(s.weeklyGoalMin / 60));
    syncAlerts(s.alerts);
    if (document.activeElement !== P.folder) P.folder.value = s.logFolder;
    P.vault.classList.toggle('ok', obsidian.connected);
    P.vault.lastChild.textContent = obsidian.connected ? t('Vault “{name}”', { name: obsidian.vaultName }) : t('Not connected');
    renderSubjects();
  }

  function syncAlerts(a) {
    P.sound.set(a.sound);
    P.tone.value = a.tone;
    P.tone.disabled = !a.sound;
    P.play.disabled = !a.sound;
    P.volume.set(a.volume, !a.sound);
    P.banner.set(a.banner);
    P.bannerPreview.disabled = !a.banner;
    P.toast.set(a.toast);
    const custom = a.tone === 'custom';
    P.fileRow.hidden = !custom;
    if (!custom) return;
    P.fileName.lastChild.textContent = a.file.split(/[\\/]/).pop();
    if (!P.fileCheck || P.fileCheck.file !== a.file) {
      const file = a.file;
      P.fileCheck = { file, result: null };
      P.checkNote = '';
      api.alerts.checkSound().then((result) => {
        if (!P.fileCheck || P.fileCheck.file !== file) return;
        P.fileCheck.result = result;
        P.checkNote = result && result.ok ? '' : fileProblem(result && result.reason);
        syncAlerts(pomo.settings.alerts);
      });
    }
    P.fileName.classList.toggle('ok', !P.fileCheck.result || P.fileCheck.result.ok);
    const note = P.pickNote || P.checkNote;
    P.fileError.textContent = note;
    P.fileError.hidden = !note;
  }

  function renderSubjects() {
    const s = pomo.settings;
    const key = JSON.stringify([s.subjects, s.subject]);
    if (key === subjectsKey) return;
    const focused = document.activeElement;
    if (P.subjects.contains(focused) && focused.type === 'text') return;
    subjectsKey = key;
    P.subjects.replaceChildren(...s.subjects.map((subject) => {
      const color = el('input', { type: 'color', value: subject.color });
      color.addEventListener('input', debounce(() => pomoCmd('updateSubject', { name: subject.name, patch: { color: color.value } }), 120));
      const name = el('input', { className: 'name', type: 'text', value: subject.name, maxlength: 40, spellcheck: 'false' });
      name.addEventListener('change', () => {
        const value = name.value.trim();
        if (value && value !== subject.name && !s.subjects.some((x) => x.name === value)) pomoCmd('updateSubject', { name: subject.name, patch: { name: value } });
        else name.value = subject.name;
      });
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') name.blur();
        if (e.key === 'Escape') { name.value = subject.name; name.blur(); }
      });
      const current = el('div', { className: 'cur' }, subject.name === s.subject ? t('current') : el('button', { onClick: () => pomoCmd('setSubject', subject.name) }, t('select')));
      const remove = el('button', { className: 'del', title: t('Delete subject'), html: icon('x'), disabled: s.subjects.length <= 1, onClick: () => pomoCmd('removeSubject', subject.name) });
      return el('div', { className: 'row subj' }, color, name, current, remove);
    }));
  }

  const G = {};
  let behavior = { raiseOnDesktop: true };
  let calendar = { firstDay: 1 };
  let language = { setting: 'en', lang: 'en' };

  function buildGeneral() {
    G.language = segmented([['auto', t('Auto')], ['en', 'English'], ['ru', 'Русский']], async (setting) => {
      if (setting === language.setting) return;
      G.language.set(setting);
      const url = new URL(location.href);
      url.searchParams.set('tab', 'general');
      history.replaceState(null, '', url);
      const res = await api.language.set(setting);
      if (res && res.setting) language = res;
    });
    G.raise = toggle((raiseOnDesktop) => api.behavior.set({ raiseOnDesktop }).then((b) => { if (b && !b.error) behavior = b; }));
    G.firstDay = segmented([[1, t('Mon')], [0, t('Sun')], [6, t('Sat')]], (v) => api.calendarPrefs.set({ firstDay: Number(v) }).then((c) => { if (c && !c.error) { calendar = c; syncGeneral(); } }));
    const log = el('button', { className: 'btn', onClick: () => api.diag.openLog() }, t('Open Log Folder'));
    const copy = el('button', { className: 'btn', onClick: async () => {
      await api.diag.copy();
      copy.textContent = t('Copied');
      setTimeout(() => { copy.textContent = t('Copy Diagnostics'); }, 1600);
    } }, t('Copy Diagnostics'));
    document.getElementById('general').replaceChildren(
      ...group(t('Language'), row(t('Interface language'), G.language)),
      ...group(t('Desktop'), row(t('Keep widgets visible on “Show desktop”'), G.raise)),
      ...group(t('Calendar'), row(t('Week starts on'), G.firstDay)),
      el('div', { className: 'actions' }, log, copy),
    );
  }

  function syncGeneral() {
    G.language.set(language.setting);
    G.raise.set(behavior.raiseOnDesktop);
    G.firstDay.set(calendar.firstDay);
  }

  const TABS = [['general', t('General')], ['look', t('Appearance')], ['pomo', t('Pomodoro')]];
  const TAB_ALIASES = { pomodoro: 'pomo' };
  function showTab(name) {
    const key = TAB_ALIASES[name] || (TABS.some(([k]) => k === name) ? name : 'look');
    for (const b of document.getElementById('tabs').children) b.classList.toggle('on', b.dataset.v === key);
    for (const [id] of TABS) document.getElementById(id).hidden = id !== key;
    document.title = `${t('Settings')} — ${TABS.find(([k]) => k === key)[1]}`;
  }
  const tabs = segmented(TABS, showTab);
  tabs.id = 'tabs';
  document.querySelector('header .seg').replaceWith(tabs);

  buildLook();
  buildPomo();
  buildGeneral();
  showTab(new URLSearchParams(location.search).get('tab'));
  api.settings.onTab(showTab);

  api.appearance.on((cfg) => { look.cfg = A.config(cfg); syncLook(); });
  api.theme.on((theme) => { look.theme = theme; syncLook(); });
  api.calendarPrefs.on((c) => { calendar = c; syncGeneral(); });
  api.pomodoro.on((s) => { pomo = s; syncPomo(); });
  api.obsidian.onStatus((s) => { obsidian = s; syncPomo(); });

  (async () => {
    let cfg;
    [cfg, look.widgets, look.grid, look.theme, pomo, obsidian, behavior, calendar, language] = await Promise.all([
      api.appearance.get(), api.widgets.list(), api.grid.get(), api.theme.get(), api.pomodoro.state(), api.obsidian.status(),
      api.behavior.get(), api.calendarPrefs.get(), api.language.get(),
    ]);
    look.cfg = A.config(cfg);
    syncLook();
    syncPomo();
    syncGeneral();
  })();
})();
