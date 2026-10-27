'use strict';
(() => {
  const { api, el, icon, ask, relDate, debounce, parseYmd, t: tr, tn } = W;
  const ob = api.obsidian;

  let tab = 'tasks';
  let status = { connected: false };
  let list = { connected: false, exists: false, tasks: [] };
  let doneOpen = false;
  let editing = null;
  let pending = false;

  const $ = (id) => document.getElementById(id);
  const card = $('card');

  const { parseInput } = window.TaskInput;
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
        el('div', { id: 'chipHost' })),
      el('div', { className: 'pane', id: 'pane' }),
      el('div', { className: 'toast', id: 'toast' }));
    drawChip();
  }
  function drawChip() { const h = $('chipHost'); if (h) h.replaceChildren(chip()); }

  function setTab(t) {
    tab = t;
    api.state.set({ tab: t });
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === t);
    if (t === 'tasks') { renderTasks(); refreshTasks(); } else { renderNote(); }
  }

  async function refreshTasks() {
    if (editing) { pending = true; return; }
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
    return el('div', { className: `row${t.done ? ' done' : ''}${t.cancelled ? ' cancelled' : ''}` },
      chk, el('div', { className: 'main' }, title, meta.length ? el('div', { className: 'meta' }, meta) : null), del);
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
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      const p = parseInput(input.value);
      input.value = '';
      apply(await ob.tasks.add(p));
      const again = $('pane') && $('pane').querySelector('.add input');
      if (again) again.focus();
    });
    const keep = $('items') ? $('items').scrollTop : 0;
    const draft = pane.querySelector('.add input') ? pane.querySelector('.add input').value : '';
    pane.replaceChildren(body, el('div', { className: 'add' }, el('span', { html: icon('plus') }), input));
    body.scrollTop = keep;
    if (draft) input.value = draft;
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
    note = { ...note, mode: res.mode, file: res.file, connected: res.connected };
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
      foot.replaceChildren(el('span', { className: 'file muted' }, tr('Stored locally')), el('button', { className: 'chip', onClick: () => ob.configMenu() }, el('span', {}, tr('Connect Obsidian'))));
    } else {
      foot.replaceChildren(
        el('button', { className: 'file', title: tr('Open in Obsidian'), onClick: () => note.file && ob.calendar.openFile(note.file) }, note.file || ''),
        el('div', { className: 'seg' },
          el('button', { className: note.mode === 'file' ? 'on' : '', onClick: () => setMode('file') }, tr('File')),
          el('button', { className: note.mode === 'daily' ? 'on' : '', onClick: () => setMode('daily') }, tr('Today'))));
    }
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
      menu: () => [{ id: 'ob', label: tr('Obsidian Settings…'), run: () => ob.configMenu() }],
    });
    status = (await ob.status()) || status;
    const st = (await api.state.get()) || {};
    doneOpen = !!st.doneOpen;
    shell();
    const first = await ob.tasks.list();
    if (first && first.tasks) list = first;
    setTab(st.tab === 'note' ? 'note' : 'tasks');
  })();
})();
