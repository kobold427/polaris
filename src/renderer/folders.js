'use strict';
(() => {
  const { api, el, icon, init, ensureFolderDefs, folderSvg, t: tr } = W;
  const card = document.getElementById('card');
  let items = [];
  let tags = {};
  const TAGS = [['red', 'Red', '#ff453a'], ['orange', 'Orange', '#ff9f0a'], ['yellow', 'Yellow', '#ffd60a'], ['green', 'Green', '#30d158'], ['blue', 'Blue', '#0a84ff'], ['purple', 'Purple', '#bf5af2'], ['gray', 'Gray', '#98989d']];
  const tagColor = (k) => { const t = TAGS.find((x) => x[0] === k); return t ? t[2] : null; };
  const iconCache = new Map();

  const baseName = (p) => {
    const s = p.replace(/[\\/]+$/, '');
    const n = s.split(/[\\/]/).pop();
    return n || p;
  };
  const persist = () => api.state.set({ items: items.map((i) => i.path), tags });

  async function describe(path) {
    const info = (await api.pathInfo(path)) || {};
    return { path, dir: !!info.dir, missing: !!info.missing };
  }

  async function add(paths) {
    let changed = false;
    for (const p of paths) {
      if (!p || items.some((i) => i.path.toLowerCase() === p.toLowerCase())) continue;
      items.push(await describe(p));
      changed = true;
    }
    if (changed) { persist(); render(); }
  }

  async function iconFor(path) {
    if (!iconCache.has(path)) iconCache.set(path, api.fileIcon(path).catch(() => null));
    return iconCache.get(path);
  }

  function tile(it) {
    const ic = el('div', { className: 'ic' });
    if (it.dir) ic.innerHTML = folderSvg();
    else {
      ic.append(el('span', { html: '<svg viewBox="0 0 44 44" width="36" height="36"><path d="M10 4h16l9 9v26a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#f2f2f7" stroke="#c7c7cc"/><path d="M26 4v9h9" fill="#d1d1d6"/></svg>' }));
      iconFor(it.path).then((url) => { if (url) { ic.replaceChildren(el('img', { className: 'file', src: url, alt: '' })); } });
    }
    return el('div', {
      className: `it${it.missing ? ' missing' : ''}`, title: it.missing ? `${it.path}\n${tr('(not found)')}` : it.path,
      onClick: () => api.openPath(it.path),
      onContextmenu: async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const cur = tags[it.path] || null;
        const id = await api.menu([
          { id: 'open', label: tr('Open') },
          { label: tr('Label'), submenu: [
            { id: 'tag:none', label: tr('None'), type: 'radio', checked: !cur },
            ...TAGS.map(([k, label]) => ({ id: `tag:${k}`, label: tr(label), type: 'radio', checked: cur === k })),
          ] },
          { id: 'rm', label: tr('Remove from Widget') },
          { type: 'separator' }, { id: '__hide', label: tr('Hide Widget') },
        ]);
        if (id === 'open') api.openPath(it.path);
        if (id === 'rm') { items = items.filter((x) => x !== it); delete tags[it.path]; persist(); render(); }
        if (id && id.startsWith('tag:')) { const k = id.slice(4); if (k === 'none') delete tags[it.path]; else tags[it.path] = k; persist(); render(); }
      },
    }, ic, el('div', { className: 'nm' }, ...(tagColor(tags[it.path]) ? [el('i', { className: 'dot', style: `background:${tagColor(tags[it.path])}` })] : []), baseName(it.path)));
  }

  function render() {
    const grid = el('div', { className: 'grid scroll' });
    if (!items.length) grid.append(el('div', { className: 'empty' }, tr('Drop folders or files here\nor click +')));
    for (const it of items) grid.append(tile(it));
    card.replaceChildren(
      el('div', { className: 'head' },
        el('div', { className: 'ttl' }, tr('Folders')),
        el('button', {
          className: 'icon-btn', html: icon('plus'), title: tr('Add folder'),
          onClick: async () => { const p = await api.pickFolder(); if (p) add([p]); },
        })),
      grid);
  }

  document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('over'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('over'); });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('over');
    const paths = [...e.dataTransfer.files].map((f) => { try { return api.pathForFile(f); } catch { return null; } }).filter(Boolean);
    add(paths);
  });

  init({ menu: () => [{ id: 'add', label: tr('Add Folder…'), run: async () => { const p = await api.pickFolder(); if (p) add([p]); } }] });
  ensureFolderDefs();
  (async () => {
    const st = (await api.state.get()) || {};
    tags = st.tags && typeof st.tags === 'object' ? { ...st.tags } : {};
    items = await Promise.all((st.items || []).map(describe));
    render();
  })();
})();
