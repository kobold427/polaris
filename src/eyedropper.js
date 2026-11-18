'use strict';
const path = require('path');
const { webPreferences, lockNavigation } = require('./window-kit');

const HEX = /^#[0-9a-f]{6}$/i;

class EyeDropper {
  constructor({ BrowserWindow, screen, desktopCapturer, preload, rendererDir, getLang }) {
    Object.assign(this, { BrowserWindow, screen, desktopCapturer, preload, rendererDir, getLang });
    this.session = null;
  }

  async capture(displays) {
    const width = Math.max(...displays.map((d) => Math.round(d.size.width * (d.scaleFactor || 1))));
    const height = Math.max(...displays.map((d) => Math.round(d.size.height * (d.scaleFactor || 1))));
    const sources = await this.desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
    return displays.map((display, i) => {
      const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[i] || sources[0];
      const scale = display.scaleFactor || 1;
      const image = source.thumbnail.resize({ width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale), quality: 'best' });
      return { display, shot: image.toDataURL(), scale };
    });
  }

  async pick() {
    if (this.session) return this.session.promise;
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    this.session = { promise, resolve, wins: new Map() };
    try {
      const shots = await this.capture(this.screen.getAllDisplays());
      const cursor = this.screen.getCursorScreenPoint();
      const under = this.screen.getDisplayNearestPoint(cursor);
      for (const { display, shot, scale } of shots) this.open(display, shot, scale, display.id === under.id);
    } catch (e) {
      console.warn(`eyedropper: ${e.message}`);
      this.finish(null);
    }
    return promise;
  }

  open(display, shot, scale, focus) {
    const b = display.bounds;
    const win = new this.BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height, show: false, frame: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true,
      backgroundColor: '#000000', webPreferences: webPreferences(this.preload),
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    lockNavigation(win.webContents);
    this.session.wins.set(win.webContents.id, { win, shot, scale });
    win.once('ready-to-show', () => {
      win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
      win.show();
      if (focus) win.focus();
    });
    win.on('closed', () => { if (this.session) this.finish(null); });
    win.loadFile(path.join(this.rendererDir, 'eyedropper.html'), { query: { key: 'eyedropper', lang: this.getLang() } });
  }

  shotFor(webContents) {
    const entry = this.session && this.session.wins.get(webContents.id);
    return entry ? { shot: entry.shot, scale: entry.scale } : null;
  }

  finish(color) {
    const session = this.session;
    if (!session) return;
    this.session = null;
    for (const { win } of session.wins.values()) if (!win.isDestroyed()) win.destroy();
    session.resolve(HEX.test(String(color)) ? String(color).toLowerCase() : null);
  }
}

module.exports = { EyeDropper };
