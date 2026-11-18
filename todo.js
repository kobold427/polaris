'use strict';
(() => {
  const { api, el, icon, relDate, debounce, parseYmd, t: tr } = W;
  const ob = api.obsidian;

  let tab = 'tasks';
  let status = { connected: false };
  let list = { connected: false, exists: false, tasks: [] };
  let doneOpen = false;
  let editing = null;
  let pending = false;
  let sortDir = null;
  let dragging = false;

  const $ = (id) => document.getElementById(id);
  const card = $('card');

  const { parseInput } = window.TaskInput;
  const RU = W.lang === 'ru';
  const COMMANDS = [
    [RU ? '@сегодня' : '@today', 'today'],
    [RU ? '@завтра' : '@tomorrow', 'tomorrow'],
    ...(RU ? [['@послезавтра', 'the day after tomorrow']] : []),
    ['@+3', 'in 3 days (any number)'],
    [RU ? '@пт' : '@fri', RU ? 'next weekday: пн, вт, ср, чт, пт, сб, вс' : 'next weekday: mon … sun'],
    ['@20.11', 'date: day.month or day.month.year'],
    ['@11/20', 'date: month/day'],
    ['@2026-11-20', 'exact date'],
  ];
  const SORT_ICONS = {
    asc: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 13V3M2.2 5.3 4.5 3l2.3 2.3M9 4h5M9 8h3.5M9 12h2"/></svg>',
    desc: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3v10M2.2 10.7 4.5 13l2.3-2.3M9 4h2M9 8h3.5M9 12h5"/></svg>',
  };
  const GRIP_ICON = '<svg viewBox="0 0 10 16" fill="currentColor"><circle cx="3" cy="4" r="1.2"/><circle cx="7" cy="4" r="1.2"/><circle cx="3" cy="8" r="1.2"/><circle cx="7" cy="8" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg>';
  window.__parseInput = parseInput;

  let toastTimer = null;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const apply = (res) => {
    if (res && res.error) { toast(tr('Could not write to the file')); return; }
    if (res && res.tasks) list = res;
    if (res && res.conflict) toast(tr('The line changed in Obsidian — list refreshed'));
    renderTasks();
  };

  function chip() {
    const c = el('button', { className: 'chip', title: tr('Obsidian settings'), onClick: () => ob.configMenu() }, el('i'), el('span'));
    c.className = `chip ${status.error ? 'err' : status.connected ? 'ok' : ''}`;
    c.querySelector('span').textContent = status.error ? tr('Error') : status.connected ? status.vaultName : tr('Local');
    if (status.error) c.title = status.error;
    return c;
  }

  function shell() {
    card.replaceChildren(
      el('div', { className: 'top' },
        el('div', { className: 'seg', id: 'tabs' },
          el('button', { dataset: { tab: 'tasks' }, onClick: () => setTab('tasks') }, tr('Tasks')),
          el('button', { dataset: { tab: 'note' }, onClick: () => setTab('note') }, tr('Note'))),
        el('div', { className: 'sp' }),
        el('div', { id: 'sortHost' }),
        el('div', { id: 'chipHost' })),
      el('div', { className: 'pane', id: 'pane' }),
      el('div', { className: 'toast', id: 'toast' }));
    drawChip();
  }
  function drawChip() { const h = $('chipHost'); if (h) h.replaceChildren(chip()); }

  function drawSort() {
    const host = $('sortHost');
    if (!host) return;
    if (tab !== 'tasks') { host.replaceChildren(); return; }
    const next = sortDir === 'asc' ? 'desc' : 'asc';
    const btn = el('button', {
      className: 'icon-btn sortbtn', html: SORT_ICONS[sortDir || 'asc'], 'data-nodrag': true,
      title: next === 'asc' ? tr('Sort by creation time: oldest first') : tr('Sort by creation time: newest first'),
      onClick: () => sortBy(next),
    });
    host.replaceChildren(btn);
  }

  async function sortBy(dir) {
    sortDir = dir === 'desc' ? 'desc' : 'asc';
    api.state.set({ sortDir });
    drawSort();
    const res = await ob.tasks.sort(sortDir);
    apply(res);
    if (!res || !res.error) toast(sortDir === 'asc' ? tr('Sorted: oldest first') : tr('Sorted: newest first'));
  }

  function setTab(t) {
    tab = t;
    api.state.set({ tab: t });
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === t);
    drawSort();
    if (t === 'tasks') { renderTasks(); refreshTasks(); } else { renderNote(); }
  }

  async function refreshTasks() {
    if (editing || dragging) { pending = true; return; }
    const res = await ob.tasks.list();
    if (res && res.tasks) { list = res; if (tab === 'tasks') renderTasks(); }
  }

  function row(t) {
    const ref = { line: t.line, raw: t.raw };
    const locked = t.recurring && !t.done && !t.cancelled;
    const chk = el('button', {
      className: `chk${t.done ? ' on' : ''}${locked ? ' locked' : ''}`, html: icon('check'), 'data-nodrag': true,
      title: locked ? tr('Recurring task: complete it in Obsidian (the next one is created there)') : '',
      onClick: async () => {
        if (locked) { if (status.connected) ob.calendar.openFile(status.tasksFile); return; }
        apply(await ob.tasks.toggle(ref));
      },
    });
    const title = el('div', { className: 'title', onDblclick: () => startEdit(t, title, ref) }, t.title);
    const meta = [];
    if (t.due) {
      const r = relDate(t.due);
      meta.push(el('span', { className: `due${r.overdue && !t.done ? ' overdue' : r.diff === 0 ? ' today' : ''}` }, r.text));
    }
    if (t.recurring) meta.push(el('span', {}, tr('↻ repeats')));
    const del = el('button', { className: 'icon-btn del', html: icon('x'), title: tr('Delete'), onClick: async () => apply(await ob.tasks.remove(ref)) });
    const open = !t.done && !t.cancelled;
    const node = el('div', { className: `row${t.done ? ' done' : ''}${t.cancelled ? ' cancelled' : ''}${open ? ' open' : ''}`, 'data-nodrag': open ? true : null });
    node.task = t;
    if (open) {
      node.append(el('div', { className: 'grip', html: GRIP_ICON, title: tr('Drag to reorder') }));
      node.addEventListener('pointerdown', (e) => armReorder(e, node));
    }
    node.append(chk, el('div', { className: 'main' }, title, meta.length ? el('div', { className: 'meta' }, meta) : null), del);
    return node;
  }

  function armReorder(e, node) {
    if (e.button !== 0 || e.target.closest('.chk, .del, input, textarea')) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const id = e.pointerId;
    const off = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', off);
      document.removeEventListener('pointercancel', off);
    };
    const onMove = (ev) => {
      if (ev.pointerId !== id) return;
      if (!(ev.buttons & 1)) { off(); return; }
      if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return;
      off();
      startReorder(ev, node);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', off);
    document.addEventListener('pointercancel', off);
  }

  function startReorder(e, node) {
    e.preventDefault();
    const items = $('items');
    const rows = [...items.querySelectorAll('.row.open')];
    if (rows.length < 2) return;
    dragging = true;
    node.setPointerCapture(e.pointerId);
    node.classList.add('dragging');
    let target = null;
    let scrollTimer = null;
    const mark = () => {
      for (const r of rows) r.classList.remove('drop-before', 'drop-after');
      if (target) target.row.classList.add(target.after ? 'drop-after' : 'drop-before');
    };
    const locate = (y) => {
      const first = rows[0].getBoundingClientRect();
      const last = rows[rows.length - 1].getBoundingClientRect();
      if (y < first.top) return rows[0] === node ? null : { row: rows[0], after: false };
      if (y >= last.bottom) return rows[rows.length - 1] === node ? null : { row: rows[rows.length - 1], after: true };
      for (const r of rows) {
        const b = r.getBoundingClientRect();
        if (y >= b.top && y < b.bottom) return r === node ? null : { row: r, after: y > b.top + b.height / 2 };
      }
      return null;
    };
    const move = (ev) => {
      target = locate(ev.clientY);
      mark();
      const box = items.getBoundingClientRect();
      clearInterval(scrollTimer);
      const edge = ev.clientY < box.top + 24 ? -6 : ev.clientY > box.bottom - 24 ? 6 : 0;
      if (edge) scrollTimer = setInterval(() => { items.scrollTop += edge; }, 16);
    };
    const end = async (commit) => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('lostpointercapture', onLost);
      clearInterval(scrollTimer);
      node.classList.remove('dragging');
      const goal = target;
      target = null;
      mark();
      dragging = false;
      if (commit && goal) {
        const from = node.task;
        const to = goal.row.task;
        apply(await ob.tasks.move({ line: from.line, raw: from.raw }, { line: to.line, raw: to.raw }, goal.after));
      }
      if (pending) { pending = false; refreshTasks(); }
    };
    const onUp = () => end(true);
    const onLost = () => end(false);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('lostpointercapture', onLost);
    move(e);
  }

  function hintsFor(input) {
    const m = /(?:^|\s)(@\S*)$/.exec(input.value);
    return m ? m[1].toLowerCase() : null;
  }

  function insertCommand(input, token) {
    const v = input.value;
    const m = /(?:^|\s)(@\S*)$/.exec(v);
    input.value = m ? v.slice(0, v.length - m[1].length) + token : `${v.replace(/\s+$/, '')}${v.trim() ? ' ' : ''}${token}`;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function drawHints(input, pop, force) {
    const partial = hintsFor(input);
    if (!force && partial === null) { pop.classList.add('hidden'); return; }
    const numeric = /^@[+\d]/;
    const shown = COMMANDS.filter(([token]) => !partial || partial === '@' || token.toLowerCase().startsWith(partial) || (numeric.test(partial) && numeric.test(token)));
    const parsed = parseInput(input.value);
    const preview = parsed.due ? el('div', { className: 'pv' }, tr('Due: {date}', { date: W.longDate(parseYmd(parsed.due)) })) : null;
    const items = (shown.length ? shown : COMMANDS).map(([token, desc]) => el('button', {
      className: 'cmd', 'data-nodrag': true,
      onPointerdown: (e) => e.preventDefault(),
      onClick: () => { insertCommand(input, token); drawHints(input, pop, false); },
    }, el('b', {}, token), el('span', {}, tr(desc))));
    pop.replaceChildren(...[
      el('div', { className: 'ttl' }, tr('Due date commands')),
      preview,
      ...items,
      el('div', { className: 'foot-hint' }, tr('Write the command at the end of the task, e.g. “Buy milk @tomorrow”.')),
    ].filter(Boolean));
    pop.classList.remove('hidden');
  }

  function startEdit(t, titleEl, ref) {
    editing = ref;
    const input = el('input', { className: 'edit', value: t.title });
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = async (save) => {
      if (finished) return;
      finished = true;
      editing = null;
      const v = input.value.trim();
      if (save && v && v !== t.title.trim()) apply(await ob.tasks.edit(ref, v));
      else if (pending) { pending = false; refreshTasks(); } else renderTasks();
      pending = false;
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }

  function renderTasks() {
    const pane = $('pane');
    if (!pane || tab !== 'tasks') return;
    const open = list.tasks.filter((t) => !t.done && !t.cancelled);
    const closed = list.tasks.filter((t) => t.done || t.cancelled);
    const body = el('div', { className: 'list scroll', id: 'items' });
    if (!list.tasks.length) {
      body.append(el('div', { className: 'empty' }, list.connected ? tr('No tasks yet.\nAdd the first one — it will appear in Obsidian.') : tr('No tasks yet.')));
      body.firstChild.style.whiteSpace = 'pre-line';
    } else {
      if (!open.length) body.append(el('div', { className: 'empty' }, tr('All done 🎉')));
      for (const t of open) body.append(row(t));
      if (closed.length) {
        body.append(el('div', { className: `sec${doneOpen ? ' open' : ''}` },
          el('button', { onClick: () => { doneOpen = !doneOpen; api.state.set({ doneOpen }); renderTasks(); } },
            el('span', { html: icon('chevR') }), tr('Completed · {n}', { n: closed.length }))));
        if (doneOpen) for (const t of closed) body.append(row(t));
      }
    }
    const input = el('input', { placeholder: tr('New task… @tomorrow'), 'data-nodrag': true });
    const pop = el('div', { className: 'hints hidden', id: 'hints' });
    let pinned = false;
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') { pinned = false; pop.classList.add('hidden'); return; }
      if (e.key !== 'Enter' || !input.value.trim()) return;
      const p = parseInput(input.value);
      input.value = '';
      pinned = false;
      pop.classList.add('hidden');
      apply(await ob.tasks.add(p));
      const again = $('pane') && $('pane').querySelector('.add input');
      if (again) again.focus();
    });
    input.addEventListener('input', () => drawHints(input, pop, pinned));
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) { pinned = false; pop.classList.add('hidden'); } }, 120));
    const help = el('button', {
      className: 'icon-btn help', 'data-nodrag': true, title: tr('Due date commands'),
      onPointerdown: (e) => e.preventDefault(),
      onClick: () => {
        pinned = pop.classList.contains('hidden');
        if (pinned) { drawHints(input, pop, true); input.focus(); } else pop.classList.add('hidden');
      },
    }, '?');
    const keep = $('items') ? $('items').scrollTop : 0;
    const prevInput = pane.querySelector('.add input');
    const draft = prevInput ? prevInput.value : '';
    const hadFocus = prevInput && document.activeElement === prevInput;
    pane.replaceChildren(body, pop, el('div', { className: 'add' }, el('span', { html: icon('plus') }), input, help));
    body.scrollTop = keep;
    if (draft) input.value = draft;
    if (hadFocus) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }

  let note = { text: '', saved: '', mode: 'file', file: null, connected: false };
  let area = null;
  let conflictText = null;
  const save = debounce(async () => {
    if (!area) return;
    const text = area.value;
    const res = await ob.note.write(text);
    if (res && res.ok) note.saved = text; else toast(tr('Could not save the note'));
  }, 600);

  async function loadNote({ force = false } = {}) {
    const res = await ob.note.read();
    if (!res || res.error) return;
    const modeChanged = res.mode !== note.mode || res.file !== note.file || res.connected !== note.connected;
    const dirty = area && area.value !== note.saved;
    note = { ...note, mode: res.mode, file: res.file, path: res.path, connected: res.connected };
    if (!area || force || modeChanged || !dirty) {
      conflictText = null;
      note.saved = res.text;
      if (area && area.value !== res.text) {
        const pos = area.selectionStart;
        area.value = res.text;
        if (document.activeElement === area) area.setSelectionRange(Math.min(pos, res.text.length), Math.min(pos, res.text.length));
      }
    } else if (res.text !== area.value && res.text !== note.saved) {
      conflictText = res.text;
    }
    if (tab === 'note') drawNoteChrome();
    return res;
  }

  function drawNoteChrome() {
    const host = $('noteChrome');
    if (!host) return;
    const parts = [];
    if (conflictText !== null) {
      parts.push(el('div', { className: 'banner' },
        el('b', {}, tr('The file was changed in Obsidian.')),
        el('button', { onClick: () => { area.value = conflictText; note.saved = conflictText; conflictText = null; drawNoteChrome(); } }, tr('Use Obsidian version')),
        el('button', { onClick: () => { conflictText = null; drawNoteChrome(); save(); } }, tr('Keep mine'))));
    }
    host.replaceChildren(...parts);
    const foot = $('noteFoot');
    if (!foot) return;
    if (!note.connected) {
      foot.replaceChildren(
        el('button', { className: 'file', title: note.path ? `${note.path}\n${tr('Click to open in the default editor')}` : '', onClick: () => ob.note.openLocal() }, note.file || tr('Stored locally')),
        el('div', { className: 'seg' },
          el('button', { title: tr('Open another .txt file'), onClick: () => switchLocal(() => ob.note.pickLocal()) }, tr('File…')),
          el('button', { title: tr('Create a new note in the storage folder'), onClick: () => switchLocal(() => ob.note.newLocal()) }, tr('New'))));
    } else {
      foot.replaceChildren(
        el('button', { className: 'file', title: tr('Open in Obsidian'), onClick: () => note.file && ob.calendar.openFile(note.file) }, note.file || ''),
        el('div', { className: 'seg' },
          el('button', { className: note.mode === 'file' ? 'on' : '', onClick: () => setMode('file') }, tr('File')),
          el('button', { className: note.mode === 'daily' ? 'on' : '', onClick: () => setMode('daily') }, tr('Today'))));
    }
  }

  async function switchLocal(run) {
    if (area && area.value !== note.saved) { await ob.note.write(area.value); note.saved = area.value; }
    const res = await run();
    if (res && res.error) { toast(tr('Could not open the file')); return; }
    await loadNote({ force: true });
    if (area) area.focus();
  }

  async function setMode(mode) {
    if (area && area.value !== note.saved) { await ob.note.write(area.value); note.saved = area.value; }
    await ob.note.setMode(mode);
    await loadNote({ force: true });
  }

  function renderNote() {
    const pane = $('pane');
    if (!pane) return;
    area = el('textarea', { className: 'note scroll', placeholder: tr('Quick note…'), spellcheck: 'false', 'data-nodrag': true });
    area.value = note.text || note.saved || '';
    area.addEventListener('input', save);
    area.addEventListener('blur', () => { if (area && area.value !== note.saved) { save(); save.flush(); } });
    pane.replaceChildren(el('div', { id: 'noteChrome' }), area, el('div', { className: 'foot', id: 'noteFoot' }));
    loadNote({ force: true }).then(drawNoteChrome);
  }

  window.addEventListener('pagehide', () => save.flush());
  ob.tasks.on(() => { if (tab === 'tasks') refreshTasks(); else ob.tasks.list().then((r) => { if (r && r.tasks) list = r; }); });
  ob.note.on(() => { if (tab === 'note') loadNote(); });
  ob.onStatus((s) => { status = s; drawChip(); refreshTasks(); if (tab === 'note') loadNote({ force: true }); });

  (async () => {
    W.init({
      menu: () => [
        ...(tab === 'tasks' ? [
          { id: 'sort:asc', label: tr('Sort by Creation Time: Oldest First'), run: () => sortBy('asc') },
          { id: 'sort:desc', label: tr('Sort by Creation Time: Newest First'), run: () => sortBy('desc') },
          { type: 'separator' },
        ] : []),
        { id: 'ob', label: tr('Obsidian Settings…'), run: () => ob.configMenu() },
        ...(status.connected ? [] : [{ id: 'local', label: tr('Open Storage Folder'), run: () => api.local.openFolder() }]),
      ],
    });
    status = (await ob.status()) || status;
    const st = (await api.state.get()) || {};
    doneOpen = !!st.doneOpen;
    sortDir = st.sortDir === 'desc' || st.sortDir === 'asc' ? st.sortDir : null;
    shell();
    const first = await ob.tasks.list();
    if (first && first.tasks) list = first;
    setTab(st.tab === 'note' ? 'note' : 'tasks');
  })();
})();
