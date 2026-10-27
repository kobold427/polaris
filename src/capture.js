'use strict';
const path = require('path');
const { webPreferences, FRAMELESS, lockNavigation } = require('./window-kit');

const SIZE = [520, 176];

class CaptureWindow {
  constructor({ BrowserWindow, screen, preload, rendererDir, getLang, now = Date.now }) {
    Object.assign(this, { BrowserWindow, screen, preload, rendererDir, getLang, now });
    this.win = null;
    this.shownAt = 0;
    this.ready = false;
  }

  _create() {
    const win = new this.BrowserWindow({
      ...FRAMELESS, width: SIZE[0], height: SIZE[1], alwaysOnTop: true,
      title: 'Polaris — Quick Capture',
      webPreferences: webPreferences(this.preload),
    });
    win.setAlwaysOnTop(true, 'floating');
    lockNavigation(win.webContents);
    win.webContents.on('did-finish-load', () => { this.ready = true; if (this.pending) { this.pending = false; this._announce(); } });
    win.on('blur', () => { if (this.now() - this.shownAt > 300) this.hide(); });
    win.on('closed', () => { this.win = null; this.ready = false; });
    win.loadFile(path.join(this.rendererDir, 'capture.html'), { query: { key: 'capture', lang: this.getLang() } });
    this.win = win;
    return win;
  }

  _announce() { if (this.win && !this.win.isDestroyed()) this.win.webContents.send('capture:shown'); }

  get visible() { return !!this.win && !this.win.isDestroyed() && this.win.isVisible(); }

  show() {
    const win = this.win && !this.win.isDestroyed() ? this.win : this._create();
    const d = this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint());
    const wa = d.workArea;
    win.setBounds({ x: Math.round(wa.x + (wa.width - SIZE[0]) / 2), y: Math.round(wa.y + wa.height * 0.2), width: SIZE[0], height: SIZE[1] });
    this.shownAt = this.now();
    win.show();
    win.focus();
    if (this.ready) this._announce(); else this.pending = true;
  }

  hide() { if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide(); }

  toggle() { if (this.visible) this.hide(); else this.show(); }

  dispose() {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}

module.exports = { CaptureWindow, SIZE };
