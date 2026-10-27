'use strict';
const path = require('path');
const pin = require('./winpin');
const { webPreferences, FRAMELESS, lockNavigation } = require('./window-kit');

class GridOverlay {
  constructor({ BrowserWindow, preload, rendererDir }) {
    Object.assign(this, { BrowserWindow, preload, rendererDir });
    this.wins = new Map();
    this.hideTimer = null;
    this.activeId = null;
  }

  _entry(display) {
    let e = this.wins.get(display.id);
    if (e && !e.win.isDestroyed()) return e;
    const wa = display.workArea;
    const win = new this.BrowserWindow({
      ...FRAMELESS, x: wa.x, y: wa.y, width: wa.width, height: wa.height, focusable: false,
      webPreferences: webPreferences(this.preload, { backgroundThrottling: false }),
    });
    e = { win, ready: false, shown: false, pending: null };
    lockNavigation(win.webContents);
    win.setIgnoreMouseEvents(true);
    win.webContents.on('did-finish-load', () => {
      e.ready = true;
      if (e.pending) { win.webContents.send('grid:update', e.pending); e.pending = null; }
    });
    win.on('closed', () => this.wins.delete(display.id));
    win.loadFile(path.join(this.rendererDir, 'grid.html'), { query: { key: 'grid' } });
    this.wins.set(display.id, e);
    return e;
  }

  _payload(display, p, visible) {
    const wa = display.workArea;
    const rel = (r) => [r[0] - wa.x, r[1] - wa.y, r[2] - wa.x, r[3] - wa.y];
    return { visible, pitch: p.pitch, snap: p.snap, area: rel(p.area), active: p.active ? rel(p.active) : null, ghost: p.ghost ? rel(p.ghost) : null, key: p.key };
  }

  _send(e, payload) {
    if (e.ready) e.win.webContents.send('grid:update', payload);
    else e.pending = payload;
  }

  show(display, p) {
    clearTimeout(this.hideTimer);
    this.activeId = display.id;
    const e = this._entry(display);
    const wa = display.workArea;
    e.win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
    if (!e.shown) { e.win.showInactive(); pin.lower(e.win); e.shown = true; }
    this._send(e, this._payload(display, p, true));
  }

  update(display, p) {
    const e = this.wins.get(display.id);
    if (e && e.shown) this._send(e, this._payload(display, p, true));
  }

  hide() {
    clearTimeout(this.hideTimer);
    for (const e of this.wins.values()) {
      if (!e.shown || e.win.isDestroyed()) continue;
      this._send(e, { visible: false });
      this.hideTimer = setTimeout(() => { if (!e.win.isDestroyed()) e.win.hide(); e.shown = false; }, 260);
    }
  }

  dispose() {
    clearTimeout(this.hideTimer);
    for (const e of this.wins.values()) if (!e.win.isDestroyed()) e.win.destroy();
    this.wins.clear();
  }
}

module.exports = { GridOverlay };
