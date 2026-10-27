'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const md = require('./markdown');
const Cal = require('./shared/cal');

const DEFAULTS = {
  tasksFile: 'Desktop Widgets/Tasks.md',
  noteFile: 'Desktop Widgets/Quick Note.md',
  noteMode: 'file',
  locale: 'en',
};

class DiskFile {
  constructor(abs) { this.abs = abs; }
  async read() {
    try {
      const t = await fsp.readFile(this.abs, 'utf8');
      return t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t;
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
  async write(text) {
    await fsp.mkdir(path.dirname(this.abs), { recursive: true });
    await fsp.writeFile(this.abs, text, 'utf8');
  }
}

class MemFile {
  constructor(store, key) { this.store = store; this.key = key; this.abs = null; }
  async read() { const v = this.store.get(this.key, null); return typeof v === 'string' ? v : null; }
  async write(text) { this.store.set(this.key, text); }
}

function detectVaults(configPath) {
  const candidates = configPath ? [configPath] : [
    process.env.APPDATA && path.join(process.env.APPDATA, 'obsidian', 'obsidian.json'),
    path.join(os.homedir(), '.config', 'obsidian', 'obsidian.json'),
    path.join(os.homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      const vaults = Object.entries(j.vaults || {})
        .map(([id, v]) => ({ id, path: v.path, name: path.basename(v.path || ''), open: !!v.open, ts: v.ts || 0 }))
        .filter((v) => v.path && fs.existsSync(v.path))
        .sort((a, b) => b.ts - a.ts);
      if (vaults.length) return vaults;
    } catch { }
  }
  return [];
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function readDailySettings(vaultPath) {
  const pn = readJson(path.join(vaultPath, '.obsidian', 'plugins', 'periodic-notes', 'data.json'));
  if (pn && pn.daily && pn.daily.enabled) {
    return { format: pn.daily.format || 'YYYY-MM-DD', folder: pn.daily.folder || '', template: pn.daily.template || '' };
  }
  const core = readJson(path.join(vaultPath, '.obsidian', 'daily-notes.json'));
  if (core) return { format: core.format || 'YYYY-MM-DD', folder: core.folder || '', template: core.template || '' };
  return { format: 'YYYY-MM-DD', folder: '', template: '' };
}

function toDate(v) {
  if (v instanceof Date) return v;
  const [y, m, d] = String(v).split('-').map(Number);
  return new Date(y, m - 1, d);
}

class ObsidianSync extends EventEmitter {
  constructor(store, opts = {}) {
    super();
    this.store = store;
    this.opts = opts;
    this.vault = null;
    this.error = null;
    this.queue = Promise.resolve();
    this.seen = new Map();
    this.cache = new Map();
    this.index = new Map();
    this.watched = new Set();
    this.scanning = false;
    this.rescan = false;
    this.lastDay = md.ymd(new Date());
    this.timers = [];
  }

  get cfg() { return { ...DEFAULTS, ...(this.store.get('obsidian', {}) || {}) }; }
  saveCfg(patch) { this.store.set('obsidian', { ...(this.store.get('obsidian', {}) || {}), ...patch }); }

  status() {
    const c = this.cfg;
    return {
      connected: !!this.vault,
      vaultName: this.vault ? this.vault.name : null,
      vaultPath: this.vault ? this.vault.path : null,
      tasksFile: c.tasksFile,
      noteFile: c.noteMode === 'daily' ? '(daily note)' : c.noteFile,
      noteMode: c.noteMode,
      error: this.error,
    };
  }

  start() {
    const c = this.store.get('obsidian', {}) || {};
    if (c.vaultPath && fs.existsSync(c.vaultPath)) {
      this.connect(c.vaultPath, c.vaultId, { silent: true }).catch((e) => { this.error = e.message; });
    }
    this.timers.push(setInterval(() => this._tick(), 30000));
    this.timers.push(setInterval(() => this.scan(), this.opts.scanIntervalMs || 120000));
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    clearTimeout(this._dirtyTimer);
    this._unwatchAll();
  }

  async connect(vaultPath, vaultId, { silent = false } = {}) {
    if (!fs.existsSync(vaultPath) || !fs.statSync(vaultPath).isDirectory()) throw new Error('Vault folder not found');
    const known = detectVaults(this.opts.obsidianConfigPath).find((v) => path.resolve(v.path) === path.resolve(vaultPath));
    const prevLocalTasks = this.store.get('localTasksMd', null);
    this.vault = { path: path.resolve(vaultPath), id: vaultId || (known && known.id) || null, name: path.basename(vaultPath) };
    this.error = null;
    this.saveCfg({ vaultPath: this.vault.path, vaultId: this.vault.id });
    if (!silent && typeof prevLocalTasks === 'string' && prevLocalTasks.trim()) {
      const f = new DiskFile(this.abs(this.cfg.tasksFile));
      if ((await f.read()) === null) await f.write(prevLocalTasks);
    }
    this._rewatch();
    this._watchVault();
    this.scan();
    this.emit('status', this.status());
    this.emit('tasks');
    this.emit('note');
  }

  disconnect() {
    this._unwatchAll();
    this.vault = null;
    this.cache.clear();
    this.index.clear();
    this.saveCfg({ vaultPath: null, vaultId: null });
    this.emit('status', this.status());
    this.emit('tasks');
    this.emit('note');
    this.emit('index');
  }

  setOption(patch) {
    this.saveCfg(patch);
    this._rewatch();
    this.emit('status', this.status());
    this.emit('tasks');
    this.emit('note');
    this.scan();
  }

  abs(rel) {
    const p = path.resolve(this.vault.path, ...String(rel).split('/'));
    if (p !== this.vault.path && !p.startsWith(this.vault.path + path.sep)) throw new Error('Path is outside the vault');
    return p;
  }
  relOf(abs) { return path.relative(this.vault.path, abs).split(path.sep).join('/'); }

  dailySettings() {
    const now = Date.now();
    if (!this._ds || now - this._ds.t > 3000 || this._ds.vault !== this.vault.path) {
      this._ds = { t: now, vault: this.vault.path, v: readDailySettings(this.vault.path) };
    }
    return this._ds.v;
  }

  dailyRel(date) {
    const s = this.dailySettings();
    const name = md.formatMoment(toDate(date), s.format, this.cfg.locale) + '.md';
    const folder = s.folder ? s.folder.replace(/^\/+|\/+$/g, '') + '/' : '';
    return folder + name;
  }

  tasksFileObj() { return this.vault ? new DiskFile(this.abs(this.cfg.tasksFile)) : new MemFile(this.store, 'localTasksMd'); }

  noteFileObj() {
    if (!this.vault) return new MemFile(this.store, 'localNoteMd');
    if (this.cfg.noteMode === 'daily') return new DiskFile(this.abs(this.dailyRel(new Date())));
    return new DiskFile(this.abs(this.cfg.noteFile));
  }

  _serial(fn) {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => {});
    return p;
  }

  async _write(file, text) {
    await file.write(text);
    if (file.abs) this.seen.set(file.abs, text);
    if (this.vault && file.abs) this._queueReindex(file.abs);
  }

  _pub(t) {
    return {
      line: t.line, raw: t.raw, done: t.done, cancelled: t.cancelled, title: t.title, due: t.due,
      scheduled: t.scheduled, doneDate: t.doneDate, recurring: t.recurring,
    };
  }

  async listTasks() {
    const f = this.tasksFileObj();
    const text = await f.read();
    if (f.abs) this.seen.set(f.abs, text === null ? '' : text);
    return { connected: !!this.vault, exists: text !== null, tasks: md.parseTasks(text || '').tasks.map((t) => this._pub(t)) };
  }

  async _mutateTasks(file, fn) {
    return this._serial(async () => {
      const text = (await file.read()) || '';
      const res = fn(text);
      if (res === null) return { conflict: true };
      if (res !== text) await this._write(file, res);
      return { conflict: false };
    });
  }

  async _afterTaskChange(res) {
    this.emit('tasks');
    this.emit('index');
    const list = await this.listTasks();
    return { ...list, conflict: res.conflict };
  }

  async addTask({ title, due }) {
    if (!title || !title.trim()) return this.listTasks();
    const res = await this._mutateTasks(this.tasksFileObj(), (t) => md.appendTask(t, title, due || null));
    return this._afterTaskChange(res);
  }

  async _op(ref, op, file = this.tasksFileObj()) {
    const res = await this._mutateTasks(file, (text) => {
      const { lines } = md.splitLines(text);
      const idx = md.locate(lines, ref.line, ref.raw);
      if (idx < 0) return null;
      return op(text, idx);
    });
    return this._afterTaskChange(res);
  }

  toggleTask(ref) { return this._op(ref, (t, i) => md.toggleLine(t, i, md.ymd(new Date()))); }
  editTask(ref, title) { return this._op(ref, (t, i) => (title.trim() ? md.editLine(t, i, title) : md.removeLine(t, i))); }
  removeTask(ref) { return this._op(ref, (t, i) => md.removeLine(t, i)); }

  async toggleAt({ file, line, raw }) {
    if (!this.vault) return this._op({ line, raw }, (t, i) => md.toggleLine(t, i, md.ymd(new Date())));
    if (!file) return { conflict: true };
    const f = new DiskFile(this.abs(file));
    const res = await this._mutateTasks(f, (text) => {
      const { lines } = md.splitLines(text);
      const idx = md.locate(lines, line, raw);
      return idx < 0 ? null : md.toggleLine(text, idx, md.ymd(new Date()));
    });
    this.emit('tasks');
    this.emit('index');
    return res;
  }

  async readNote() {
    const f = this.noteFileObj();
    const text = await f.read();
    if (f.abs) this.seen.set(f.abs, text === null ? '' : text);
    return {
      connected: !!this.vault, exists: text !== null, text: text || '',
      file: this.vault ? this.relOf(f.abs) : null, mode: this.cfg.noteMode,
    };
  }

  async writeNote(text) {
    return this._serial(async () => {
      const f = this.noteFileObj();
      if (f.abs && this.cfg.noteMode === 'daily' && (await f.read()) === null) await this._ensureDailyFile(new Date());
      await this._write(f, text);
      this.emit('index');
      return { ok: true };
    });
  }

  async appendToNote(text) {
    const line = String(text == null ? '' : text).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    if (!line) return { ok: false, empty: true };
    return this._serial(async () => {
      const f = this.noteFileObj();
      if (f.abs && this.cfg.noteMode === 'daily' && (await f.read()) === null) await this._ensureDailyFile(new Date());
      const cur = (await f.read()) || '';
      const eol = cur.includes('\r\n') ? '\r\n' : '\n';
      const sep = cur === '' || /\r?\n$/.test(cur) ? '' : eol;
      await this._write(f, `${cur}${sep}- ${line}${eol}`);
      this.emit('note');
      this.emit('index');
      return { ok: true };
    });
  }

  _template(rel) {
    if (!rel) return '';
    for (const cand of [rel, rel + '.md']) {
      try { return fs.readFileSync(this.abs(cand), 'utf8'); } catch { }
    }
    return '';
  }

  async _ensureDailyFile(date) {
    const rel = this.dailyRel(date);
    const f = new DiskFile(this.abs(rel));
    if ((await f.read()) !== null) return rel;
    const s = this.dailySettings();
    const d = toDate(date);
    const locale = this.cfg.locale;
    const title = path.basename(rel, '.md');
    const body = this._template(s.template)
      .replace(/{{\s*date(?::([^}]+?))?\s*}}/gi, (_, fmt) => md.formatMoment(d, fmt || 'YYYY-MM-DD', locale))
      .replace(/{{\s*time(?::([^}]+?))?\s*}}/gi, (_, fmt) => md.formatMoment(new Date(), fmt || 'HH:mm', locale))
      .replace(/{{\s*title\s*}}/gi, title);
    await f.write(body);
    this.seen.set(f.abs, body);
    return rel;
  }

  uriFor(rel) {
    const vault = this.vault.id || this.vault.name;
    return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(rel.replace(/\.md$/i, ''))}`;
  }

  async openFile(rel) {
    if (!this.vault) return false;
    this.abs(rel);
    if (this.opts.openExternal) await this.opts.openExternal(this.uriFor(rel));
    return true;
  }

  async openDaily(date) {
    if (!this.vault) return false;
    const rel = await this._serial(() => this._ensureDailyFile(date));
    this.emit('index');
    return this.openFile(rel);
  }

  monthData(year, month, firstDay = 1) {
    const daily = {};
    const tasks = {};
    let local = null;
    if (!this.vault) {
      local = new Map();
      const text = this.store.get('localTasksMd', null);
      for (const it of md.dateTasks(typeof text === 'string' ? text : '')) {
        if (!local.has(it.date)) local.set(it.date, []);
        local.get(it.date).push({ file: null, line: it.line, raw: it.raw, title: it.title, done: it.done });
      }
    }
    for (const d of Cal.cells(year, month, firstDay)) {
      const key = md.ymd(d);
      if (this.vault) {
        try { if (fs.existsSync(this.abs(this.dailyRel(d)))) daily[key] = true; } catch { }
      }
      const list = local ? local.get(key) : this.index.get(key);
      if (list) tasks[key] = list;
    }
    return { connected: !!this.vault, daily, tasks };
  }

  _rebuildIndex() {
    this.index.clear();
    for (const [rel, c] of this.cache) {
      for (const it of c.items) {
        if (!this.index.has(it.date)) this.index.set(it.date, []);
        this.index.get(it.date).push({ file: rel, line: it.line, raw: it.raw, title: it.title, done: it.done });
      }
    }
  }

  _queueReindex(abs) {
    if (!this._dirty) this._dirty = new Set();
    this._dirty.add(abs);
    clearTimeout(this._dirtyTimer);
    this._dirtyTimer = setTimeout(async () => {
      const list = [...this._dirty];
      this._dirty.clear();
      if (!this.vault) return;
      for (const a of list) await this._reindexFile(a);
      this._rebuildIndex();
      this.emit('index');
    }, 300);
  }

  async _reindexFile(abs) {
    let rel;
    try { rel = this.relOf(abs); } catch { return; }
    if (!rel || rel.startsWith('..') || !/\.md$/i.test(rel)) return;
    if (rel.split('/').some((p) => p.startsWith('.') || p === 'node_modules')) return;
    try {
      const st = await fsp.stat(abs);
      if (!st.isFile() || st.size > 2e6) { this.cache.delete(rel); return; }
      const text = await fsp.readFile(abs, 'utf8');
      this.cache.set(rel, { mtimeMs: st.mtimeMs, size: st.size, items: md.dateTasks(text) });
    } catch { this.cache.delete(rel); }
  }

  async scan() {
    if (!this.vault) return;
    if (this.scanning) { this.rescan = true; return; }
    this.scanning = true;
    try {
      const seen = new Set();
      await this._walk(this.vault.path, '', async (abs, rel, st) => {
        seen.add(rel);
        const c = this.cache.get(rel);
        if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return;
        let text = '';
        try { text = await fsp.readFile(abs, 'utf8'); } catch { return; }
        this.cache.set(rel, { mtimeMs: st.mtimeMs, size: st.size, items: md.dateTasks(text) });
      });
      for (const k of [...this.cache.keys()]) if (!seen.has(k)) this.cache.delete(k);
      this._rebuildIndex();
      this.emit('index');
    } catch (e) {
      this.error = e.message;
    } finally {
      this.scanning = false;
      if (this.rescan) { this.rescan = false; setTimeout(() => this.scan(), 500); }
    }
  }

  async _walk(dirAbs, relBase, onFile) {
    let entries;
    try { entries = await fsp.readdir(dirAbs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const abs = path.join(dirAbs, e.name);
      if (e.isDirectory()) await this._walk(abs, relBase + e.name + '/', onFile);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        let st;
        try { st = await fsp.stat(abs); } catch { continue; }
        if (st.size > 2e6) continue;
        await onFile(abs, relBase + e.name, st);
      }
    }
  }

  _watchTargets() {
    if (!this.vault) return [];
    const out = [];
    try { out.push({ abs: this.abs(this.cfg.tasksFile), kind: 'tasks' }); } catch { }
    try {
      const note = this.cfg.noteMode === 'daily' ? this.dailyRel(new Date()) : this.cfg.noteFile;
      out.push({ abs: this.abs(note), kind: 'note' });
    } catch { }
    return out;
  }

  _rewatch() {
    this._unwatchFiles();
    for (const { abs, kind } of this._watchTargets()) {
      this.watched.add(abs);
      fs.watchFile(abs, { interval: 1000, persistent: false }, () => this._changed(abs, kind));
    }
  }

  _unwatchFiles() {
    for (const abs of this.watched) fs.unwatchFile(abs);
    this.watched.clear();
  }

  _watchVault() {
    this._unwatchVault();
    try {
      this.vaultWatcher = fs.watch(this.vault.path, { recursive: true, persistent: false }, (_ev, name) => {
        if (name && /\.md$/i.test(name) && this.vault) this._queueReindex(path.join(this.vault.path, String(name)));
      });
      this.vaultWatcher.on('error', () => this._unwatchVault());
    } catch { }
  }

  _unwatchVault() {
    if (this.vaultWatcher) { try { this.vaultWatcher.close(); } catch { } this.vaultWatcher = null; }
  }

  _unwatchAll() {
    this._unwatchFiles();
    this._unwatchVault();
  }

  async _changed(abs, kind) {
    let text;
    try { text = await new DiskFile(abs).read(); } catch { return; }
    const val = text === null ? '' : text;
    if (this.seen.get(abs) === val) return;
    this.seen.set(abs, val);
    this.emit(kind);
    this._queueReindex(abs);
  }

  _tick() {
    const today = md.ymd(new Date());
    if (today !== this.lastDay) {
      this.lastDay = today;
      if (this.vault) { this._rewatch(); this.emit('note'); }
      this.emit('index');
    }
  }
}

module.exports = { ObsidianSync, DiskFile, MemFile, detectVaults, readDailySettings, DEFAULTS };
