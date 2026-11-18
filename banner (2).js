'use strict';
const path = require('path');
const { webPreferences, FRAMELESS, lockNavigation } = require('./window-kit');

const SIZE = [440, 148];
const HIDE_AFTER_MS = 12000;

class BannerWindow {
  constructor({ BrowserWindow, screen, preload, rendererDir, getLang, setTimer = setTimeout, clearTimer = clearTimeout, hideAfterMs = HIDE_AFTER_MS }) {
    Object.assign(this, { BrowserWindow, screen, preload, rendererDir, getLang, setTimer, clearTimer, hideAfterMs });
    this.win = null;
    this.ready = false;
    this.payload = null;
    this.timer = null;
    this.shown = 0;
  }

  _create() {
    const win = new this.BrowserWindow({
      ...FRAMELESS, width: SIZE[0], height: SIZE[1], alwaysOnTop: true, focusable: false,
      title: 'Polaris — Pomodoro',
      webPreferences: webPreferences(this.preload),
    });
    win.setAlwaysOnTop(true, 'floating');
    lockNavigation(win.webContents);
    win.webContents.on('did-finish-load', () => { this.ready = true; if (this.pending) { this.pending = false; this._announce(); } });
    win.on('closed', () => { this.win = null; this.ready = false; });
    win.loadFile(path.join(this.rendererDir, 'banner.html'), { query: { key: 'banner', lang: this.getLang() } });
    this.win = win;
    return win;
  }

  _announce() { if (this.win && !this.win.isDestroyed()) this.win.webContents.send('banner:shown', this.payload); }

  get visible() { return !!this.win && !this.win.isDestroyed() && this.win.isVisible(); }

  show(payload) {
    const win = this.win && !this.win.isDestroyed() ? this.win : this._create();
    this.payload = { ...payload, ms: this.hideAfterMs, n: ++this.shown };
    const d = this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint());
    const wa = d.workArea;
    win.setBounds({ x: Math.round(wa.x + (wa.width - SIZE[0]) / 2), y: Math.round(wa.y + 6), width: SIZE[0], height: SIZE[1] });
    win.showInactive();
    if (this.ready) this._announce(); else this.pending = true;
    this.clearTimer(this.timer);
    this.timer = this.setTimer(() => this.hide(), this.hideAfterMs + 400);
    if (this.timer && this.timer.unref) this.timer.unref();
  }

  hide() {
    this.clearTimer(this.timer);
    this.timer = null;
    this.payload = null;
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide();
  }

  dispose() {
    this.clearTimer(this.timer);
    this.timer = null;
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}

module.exports = { BannerWindow, SIZE, HIDE_AFTER_MS };
