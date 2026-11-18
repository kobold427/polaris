'use strict';
(() => {
  const { api, el, t, parseYmd } = W;
  const { parseInput } = window.TaskInput;
  const cap = document.getElementById('cap');
  document.title = t(document.title);

  let kind = 'task';
  let busy = false;
  let doneTimer = null;

  const seg = W.el('div', { className: 'seg' },
    ['task', 'note'].map((k) => el('button', { dataset: { v: k }, onClick: () => setKind(k), 'data-nodrag': true }, k === 'task' ? t('Task') : t('Note'))));
  const input = el('input', { type: 'text', maxlength: '500', spellcheck: 'false', autocomplete: 'off' });
  const line = el('div', { className: 'line' });
  cap.append(el('div', { className: 'top' }, el('div', { className: 'ttl' }, t('Quick Capture')), seg), input, line);

  const hint = () => el('span', {}, t('Enter to add'), ' · ', el('kbd', {}, 'Tab'), ' ', t('to switch'), ' · ', el('kbd', {}, 'Esc'), ' ', t('to close'));

  function draw(extra) {
    for (const b of seg.children) b.classList.toggle('on', b.dataset.v === kind);
    input.placeholder = kind === 'task' ? t('New task… @tomorrow') : t('Quick note…');
    let left = null;
    if (kind === 'task') {
      const p = parseInput(input.value);
      if (p.due) left = el('span', { className: 'due' }, t('Due {date}', { date: W.longDate(parseYmd(p.due)) }));
    }
    line.replaceChildren(extra || left || el('span', {}), extra ? '' : hint());
  }

  function setKind(k) { kind = k; draw(); input.focus(); }

  function reset() {
    clearTimeout(doneTimer);
    busy = false;
    cap.classList.remove('busy');
    input.value = '';
    draw();
    input.focus();
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    cap.classList.add('busy');
    let res = null;
    try { res = await api.capture.submit({ kind, text }); } catch { res = null; }
    busy = false;
    cap.classList.remove('busy');
    if (res && res.ok) {
      input.value = '';
      draw(el('span', { className: 'ok' }, kind === 'task' ? t('Added to Tasks') : t('Added to Note')));
      doneTimer = setTimeout(() => api.capture.close(), 650);
    } else {
      draw(el('span', { className: 'bad' }, t('Could not save. Try again.')));
    }
  }

  input.addEventListener('input', () => draw());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); api.capture.close(); }
    else if (e.key === 'Tab') { e.preventDefault(); setKind(kind === 'task' ? 'note' : 'task'); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.capture.close(); });

  api.capture.onShown(reset);
  api.capture.state().then((s) => { if (s && s.kind === 'note') kind = 'note'; draw(); input.focus(); });
})();
