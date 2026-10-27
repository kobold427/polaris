'use strict';
const path = require('path');
const { BrowserWindow, screen } = require('electron');
const geo = require('./geometry');
const pin = require('./winpin');
const { DesktopKeeper } = require('./deskkeeper');
const { webPreferences, FRAMELESS, lockNavigation } = require('./window-kit');

const DEFS = {
  calendar: { title: 'Calendar', size: [320, 420], min: [270, 300] },
  weather: { title: 'Weather', size: [320, 240], min: [250, 150] },
  todo: { title: 'Tasks', size: [320, 340], min: [260, 240] },
  pomodoro: { title: 'Pomodoro', size: [320, 360], min: [260, 300] },
  productivity: { title: 'Productivity', size: [320, 160], min: [240, 160], widthOnly: true },
  folders: { title: 'Folders', size: [320, 200], min: [210, 150] },
};
const ORDER = Object.keys(DEFS);

class WidgetManager {
  constructor({ store, rendererDir, preload, getLang = () => 'en', dev = false, overlay = null }) {
    Object.assign(this, { store, rendererDir, preload, getLang, dev, overlay });
    this.wins = new Map();
    this.crashes = [];
    this.keyByWc = new Map();
    this.bounds = new Map();
    this.drag = null;
    this.dragTimer = null;
    this.settling = null;
  }

  enabled(key) { return this.store.get('visible', {})[key] !== false; }
  isLocked() { return !!this.store.get('locked', false); }
  keyOf(webContents) { return this.keyByWc.get(webContents.id); }
  behaviorCfg() {
    const b = this.store.get('behavior', {}) || {};
    return { raiseOnDesktop: b.raiseOnDesktop !== false };
  }

  gridCfg() {
    const g = this.store.get('grid', {}) || {};
    return { snap: g.snap !== false, show: g.show !== false, pitch: geo.GRID };
  }

  workAreaAt(point) {
    const w = screen.getDisplayNearestPoint({ x: Math.round(point.x), y: Math.round(point.y) }).workArea;
    return [w.x + geo.MARGIN, w.y + geo.MARGIN, w.x + w.width - geo.MARGIN, w.y + w.height - geo.MARGIN];
  }

  rectOf(b) { return [b[0], b[1], b[0] + b[2], b[1] + b[3]]; }

  blockers(exceptKey) {
    const out = [];
    for (const k of ORDER) {
      const b = this.bounds.get(k);
      if (k !== exceptKey && b && this.enabled(k)) out.push(geo.inflate(this.rectOf(b)));
    }
    return out;
  }

  restoreBounds(key, b) {
    if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite)) return null;
    const r = b.map(Math.round);
    if (DEFS[key].widthOnly) r[3] = DEFS[key].size[1];
    return r;
  }

  layoutValid(skipMissing = false) {
    for (const k of ORDER) {
      if (!this.enabled(k)) continue;
      const b = this.bounds.get(k);
      if (!b) { if (skipMissing) continue; return false; }
      if (b[2] < DEFS[k].min[0] || b[3] < DEFS[k].min[1]) return false;
      const r = this.rectOf(b);
      const area = this.workAreaAt({ x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 });
      if (!geo.rectValid(r, area, this.blockers(k), 2)) return false;
    }
    return true;
  }

  displaySig() {
    return screen.getAllDisplays()
      .map((d) => { const r = d.bounds || d.workArea; return `${r.x},${r.y},${r.width}x${r.height}@${d.scaleFactor || 1}`; })
      .sort().join('|');
  }

  saveBounds() {
    const o = {};
    for (const [k, b] of this.bounds) if (b) o[k] = b;
    this.store.set('bounds', o);
    if (!this.sig) this.sig = this.displaySig();
    const all = { ...(this.store.get('layouts', {}) || {}) };
    delete all[this.sig];
    all[this.sig] = o;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 8))) delete all[k];
    this.store.set('layouts', all);
  }

  adopt(saved) {
    const prev = new Map(this.bounds);
    for (const k of ORDER) this.bounds.set(k, this.restoreBounds(k, saved[k]));
    if (!this.layoutValid(true)) { this.bounds = prev; return false; }
    for (const k of ORDER) if (this.enabled(k) && !this.bounds.get(k)) this.ensureFree(k);
    for (const k of ORDER) { const b = this.bounds.get(k); if (this.enabled(k) && b) this.applyBounds(k, b); }
    this.saveBounds();
    return true;
  }

  onDisplaysChanged() {
    const sig = this.displaySig();
    if (sig !== this.sig) {
      this.sig = sig;
      const saved = (this.store.get('layouts', {}) || {})[sig];
      if (saved && this.adopt(saved)) return;
    }
    if (!this.layoutValid()) this.resetLayout(true);
    else { this.saveBounds(); this.sendAllBounds(); }
  }

  start() {
    this.sig = this.displaySig();
    const saved = (this.store.get('layouts', {}) || {})[this.sig] || this.store.get('bounds', {});
    for (const k of ORDER) this.bounds.set(k, this.restoreBounds(k, saved[k]));
    const keys = ORDER.filter((k) => this.enabled(k));
    const placed = keys.filter((k) => this.bounds.get(k));
    if (!placed.length || !this.layoutValid(true)) this.resetLayout(false);
    else for (const k of keys) if (!this.bounds.get(k)) this.ensureFree(k);
    for (const k of keys) this.create(k);
    let t = null;
    const recheck = () => {
      clearTimeout(t);
      t = setTimeout(() => this.onDisplaysChanged(), 1000);
    };
    for (const ev of ['display-metrics-changed', 'display-removed', 'display-added']) screen.on(ev, recheck);
    this.keeper = new DesktopKeeper({
      windows: () => [...this.wins.values()],
      foreground: () => pin.foreground(),
      isOurs: (hwnd) => [...this.wins.values()].some((w) => !w.isDestroyed() && pin.handleOf(w) === hwnd),
      raise: (w) => pin.raise(w),
      lower: (w) => { if (!w.isFocused()) pin.lower(w); },
      enabled: () => this.behaviorCfg().raiseOnDesktop,
      busy: () => !!this.drag || !!this.settling,
      log: (m) => console.info(m),
    });
    if (pin.canWatchDesktop && pin.canWatchDesktop()) this.keeper.start();
  }

  create(key) {
    const def = DEFS[key];
    const b = this.bounds.get(key) || [0, 0, ...def.size];
    const win = new BrowserWindow({
      ...FRAMELESS, x: b[0], y: b[1], width: b[2], height: b[3],
      ...(process.platform === 'win32' ? { type: 'toolbar' } : {}),
      title: `Polaris — ${def.title}`,
      webPreferences: webPreferences(this.preload, { backgroundThrottling: false }),
    });
    const wcId = win.webContents.id;
    this.wins.set(key, win);
    this.keyByWc.set(wcId, key);
    lockNavigation(win.webContents);
    win.webContents.on('did-finish-load', () => this.sendBounds(key));
    this.watchHealth(win, key);
    win.once('ready-to-show', () => { win.showInactive(); pin.lower(win); });
    win.on('blur', () => { if (this.drag) this.endDrag(); if (!(this.keeper && this.keeper.raised)) pin.lower(win); });
    win.on('closed', () => { this.wins.delete(key); this.keyByWc.delete(wcId); });
    this.load(win, key);
    if (this.dev) win.webContents.openDevTools({ mode: 'detach' });
    return win;
  }

  watchHealth(win, key) {
    const wc = win.webContents;
    const tag = `[renderer:${key}]`;
    wc.on('console-message', ({ level, message, lineNumber, sourceId }) => {
      if (level === 'error') console.warn(`${tag} ${message} (${path.basename(sourceId)}:${lineNumber})`);
    });
    wc.on('render-process-gone', (_event, { reason, exitCode }) => {
      console.error(`${tag} process gone: ${reason} (exit code ${exitCode})`);
      if (this.disposed || win.isDestroyed() || reason === 'clean-exit') return;
      const now = Date.now();
      this.crashes = this.crashes.filter((t) => now - t < 60 * 1000);
      this.crashes.push(now);
      if (this.crashes.length > 3) {
        console.error('Too many renderer crashes within a minute; not reloading');
        return;
      }
      setTimeout(() => { if (!this.disposed && !win.isDestroyed()) win.reload(); }, 500);
    });
    wc.on('unresponsive', () => console.warn(`${tag} unresponsive`));
    wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (isMainFrame) console.error(`${tag} failed to load (${code} ${description}) ${url}`);
    });
    win.on('minimize', () => setImmediate(() => {
      if (win.isDestroyed() || this.disposed) return;
      win.restore();
      win.showInactive();
      pin.lower(win);
    }));
  }

  boundsPayload(key) {
    const b = this.bounds.get(key);
    if (!b) return null;
    const d = screen.getDisplayNearestPoint({ x: Math.round(b[0] + b[2] / 2), y: Math.round(b[1] + b[3] / 2) });
    const db = d.bounds || d.workArea;
    return { bounds: b.slice(), display: { key: `${db.x},${db.y},${db.width},${db.height}`, x: db.x, y: db.y, w: db.width, h: db.height, scale: d.scaleFactor || 1 } };
  }

  sendBounds(key) {
    const win = this.wins.get(key);
    const p = this.boundsPayload(key);
    if (win && p && !win.isDestroyed()) win.webContents.send('win:bounds', p);
  }

  sendAllBounds() { for (const k of this.wins.keys()) this.sendBounds(k); }

  applyBounds(key, b) {
    this.bounds.set(key, b);
    const win = this.wins.get(key);
    if (win && !win.isDestroyed()) win.setBounds({ x: b[0], y: b[1], width: b[2], height: b[3] });
    this.sendBounds(key);
  }

  startDrag(key, mode, edges) {
    if (this.drag || !key || this.isLocked()) return;
    this.finishSettle();
    const b = this.bounds.get(key);
    if (!b || !this.wins.has(key)) return;
    const sides = DEFS[key].widthOnly ? String(edges || '').replace(/[TB]/g, '') : String(edges || '');
    if (mode === 'resize' && !sides) return;
    this.drag = { key, mode, edges: sides, start: b.slice(), c0: screen.getCursorScreenPoint(), land: null };
    this.dragTimer = setInterval(() => this.tickDrag(), 8);
    this.updateOverlay(true);
    if (mode === 'move') { const win = this.wins.get(key); if (win && !win.isDestroyed()) win.moveTop(); }
  }

  updateOverlay(show) {
    const d = this.drag;
    if (!this.overlay || !d) return;
    const g = this.gridCfg();
    if (!g.show) return;
    const b = this.bounds.get(d.key);
    const center = { x: b[0] + b[2] / 2, y: b[1] + b[3] / 2 };
    const disp = screen.getDisplayNearestPoint({ x: Math.round(center.x), y: Math.round(center.y) });
    const area = this.workAreaAt(center);
    const ghost = d.mode === 'move' && d.land && d.land.some((v, i) => v !== b[i]) ? this.rectOf(d.land) : null;
    const payload = { pitch: g.pitch, snap: g.snap, area, active: this.rectOf(b), ghost, key: d.key };
    if (show) this.overlay.show(disp, payload); else this.overlay.update(disp, payload);
  }

  tickDrag() {
    const d = this.drag;
    if (!d) return;
    const win = this.wins.get(d.key);
    if (!win || win.isDestroyed()) { this.endDrag(); return; }
    const c = screen.getCursorScreenPoint();
    const dx = c.x - d.c0.x;
    const dy = c.y - d.c0.y;
    if (Math.abs(dx) + Math.abs(dy) >= 3) d.moved = true;
    const [sx, sy, sw, sh] = d.start;
    const cur = this.bounds.get(d.key);
    const g = this.gridCfg();
    const blockers = this.blockers(d.key);
    let nb;
    let land = d.land;
    if (d.mode === 'move') {
      const area = this.workAreaAt(c);
      const x = Math.min(area[2] - sw, Math.max(area[0], sx + dx));
      const y = Math.min(area[3] - sh, Math.max(area[1], sy + dy));
      nb = [x, y, sw, sh];
      const spot = geo.nearestFree([sw, sh], [x, y], area, blockers, [area[0], area[1]], g.pitch, !g.snap);
      land = spot ? [spot[0], spot[1], sw, sh] : null;
    } else {
      const area = this.workAreaAt({ x: sx + sw / 2, y: sy + sh / 2 });
      let r = geo.resizeRect([sx, sy, sx + sw, sy + sh], d.edges, dx, dy, area, DEFS[d.key].min, blockers);
      if (g.snap) r = geo.snapResize(r, d.edges, area, DEFS[d.key].min, blockers, [area[0], area[1]], g.pitch);
      nb = [r[0], r[1], r[2] - r[0], r[3] - r[1]];
    }
    const landChanged = (land || []).join() !== (d.land || []).join();
    d.land = land;
    const moved = nb.some((v, i) => v !== cur[i]);
    if (moved) this.applyBounds(d.key, nb);
    if (moved || landChanged) this.updateOverlay(false);
  }

  endDrag() {
    clearInterval(this.dragTimer);
    this.dragTimer = null;
    const d = this.drag;
    this.drag = null;
    if (this.overlay) this.overlay.hide();
    if (!d) return;
    if (d.mode === 'move') {
      if (!d.moved) {
        this.applyBounds(d.key, d.start.slice());
        const w = this.wins.get(d.key);
        if (w && !w.isDestroyed()) pin.lower(w);
        return;
      }
      this.settle(d.key, d.land || d.start);
    } else {
      this.saveBounds();
    }
  }

  settle(key, to) {
    this.finishSettle();
    const from = (this.bounds.get(key) || to).slice();
    const done = () => {
      this.applyBounds(key, to.slice());
      this.saveBounds();
      const win = this.wins.get(key);
      if (win && !win.isDestroyed()) pin.lower(win);
    };
    if (from.every((v, i) => Math.abs(v - to[i]) < 1)) { done(); return; }
    const t0 = Date.now();
    const DUR = 140;
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - t0) / DUR);
      if (t >= 1) { this.finishSettle(); return; }
      const e = 1 - (1 - t) ** 3;
      this.applyBounds(key, from.map((v, i) => Math.round(v + (to[i] - v) * e)));
    }, 8);
    this.settling = { key, to, timer, done };
  }

  finishSettle() {
    const s = this.settling;
    if (!s) return;
    clearInterval(s.timer);
    this.settling = null;
    s.done();
  }

  resetLayout(apply = true) {
    const keys = ORDER.filter((k) => this.enabled(k));
    const w = screen.getPrimaryDisplay().workArea;
    const area = [w.x + geo.MARGIN, w.y + geo.MARGIN, w.x + w.width - geo.MARGIN, w.y + w.height - geo.MARGIN];
    const snap = this.gridCfg().snap;
    geo.packColumns(keys.map((k) => DEFS[k].size), area, snap ? geo.GRID : geo.GAP, snap ? geo.GRID : 0, keys.map((k) => DEFS[k].min))
      .forEach(([x, y, ww, hh], i) => this.bounds.set(keys[i], [x, y, ww, hh]));
    for (const k of ORDER) if (!this.enabled(k)) this.bounds.set(k, null);
    if (apply) for (const k of keys) { const b = this.bounds.get(k); if (b) this.applyBounds(k, b); }
    this.saveBounds();
  }

  ensureFree(key) {
    const size = (this.bounds.get(key) || [0, 0, ...DEFS[key].size]).slice(2);
    const b = this.bounds.get(key);
    const blockers = this.blockers(key);
    const prim = screen.getPrimaryDisplay().workArea;
    const primArea = [prim.x + geo.MARGIN, prim.y + geo.MARGIN, prim.x + prim.width - geo.MARGIN, prim.y + prim.height - geo.MARGIN];
    if (b) {
      const r = this.rectOf(b);
      const area = this.workAreaAt({ x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 });
      if (geo.rectValid(r, area, blockers)) return;
    }
    const step = this.gridCfg().snap ? geo.GRID : 8;
    const spot = geo.findFreeSpot(size, primArea, blockers, step);
    if (spot) {
      this.bounds.set(key, [spot[0], spot[1], size[0], size[1]]);
      this.saveBounds();
      const win = this.wins.get(key);
      if (win) this.applyBounds(key, this.bounds.get(key));
    } else {
      this.bounds.set(key, [0, 0, ...size]);
      this.resetLayout(true);
    }
  }

  setVisible(key, flag) {
    this.store.set('visible', { ...this.store.get('visible', {}), [key]: !!flag });
    const win = this.wins.get(key);
    if (flag) {
      this.ensureFree(key);
      if (!win) this.create(key);
      else { win.showInactive(); pin.lower(win); }
    } else if (win) {
      win.hide();
    }
  }

  showAllReset() {
    this.store.set('visible', {});
    for (const k of ORDER) this.bounds.set(k, null);
    this.resetLayout(false);
    for (const k of ORDER) {
      const win = this.wins.get(k);
      const b = this.bounds.get(k);
      if (!win) this.create(k);
      else { this.applyBounds(k, b); win.showInactive(); pin.lower(win); }
    }
  }

  setLocked(flag) {
    this.store.set('locked', !!flag);
    this.broadcast('locked', !!flag);
  }

  load(win, key) {
    win.loadFile(path.join(this.rendererDir, `${key}.html`), { query: { key, lang: this.getLang() } });
  }

  reloadAll() {
    for (const [key, win] of this.wins) if (!win.isDestroyed()) this.load(win, key);
  }

  broadcast(channel, payload) {
    for (const win of this.wins.values()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }

  peek({ toggle = false, ms = 8000 } = {}) {
    const lowerAll = () => { for (const win of this.wins.values()) if (!win.isDestroyed() && win.isVisible() && !win.isFocused()) pin.lower(win); };
    clearTimeout(this.peekTimer);
    if (toggle && this.peeking) { this.peeking = false; lowerAll(); return false; }
    this.peeking = true;
    for (const win of this.wins.values()) if (!win.isDestroyed() && win.isVisible()) win.moveTop();
    this.peekTimer = setTimeout(() => { this.peeking = false; lowerAll(); }, ms);
    return true;
  }

  dispose() {
    this.disposed = true;
    if (this.keeper) this.keeper.stop();
    this.endDrag();
    this.finishSettle();
    clearTimeout(this.peekTimer);
  }
}

module.exports = { WidgetManager, DEFS, ORDER };
